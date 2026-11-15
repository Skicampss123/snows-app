-- Platform-adgang til rigtige camps: platformen kan åbne en camp og arbejde i en hvilken som helst rolle.
-- Alle regler (RLS) gælder som for rollen selv, og hver åbning logges i support-loggen.
-- Kør efter 001-004. Kan køres igen.

create table if not exists support_sessions(
  user_id uuid primary key references auth.users on delete cascade,
  camp_id uuid not null references camps on delete cascade,
  role text not null check (role in ('Deltager','Skiforretning','Instruktør','Arrangør')),
  shop_id uuid references shops on delete set null,
  email text,
  started_at timestamptz not null default now()
);
alter table support_sessions enable row level security;   -- ingen policies = kun via funktioner

create or replace function my_camp() returns uuid language sql stable security definer set search_path=public as
$$ select coalesce((select s.camp_id from support_sessions s where s.user_id = auth.uid() and is_platform()),
                   (select camp_id from profiles where id = auth.uid())) $$;
create or replace function my_role() returns text language sql stable security definer set search_path=public as
$$ select coalesce((select s.role from support_sessions s where s.user_id = auth.uid() and is_platform()),
                   (select role from profiles where id = auth.uid())) $$;
create or replace function my_shop() returns uuid language sql stable security definer set search_path=public as
$$ select case when exists(select 1 from support_sessions s where s.user_id = auth.uid() and is_platform())
               then (select s.shop_id from support_sessions s where s.user_id = auth.uid())
               else (select shop_id from profiles where id = auth.uid()) end $$;
create or replace function my_email() returns text language sql stable security definer set search_path=public as
$$ select case when exists(select 1 from support_sessions s where s.user_id = auth.uid() and is_platform())
               then (select s.email from support_sessions s where s.user_id = auth.uid())
               else (select email from profiles where id = auth.uid()) end $$;

-- Åbn en camp i en rolle (for butik: vælg butik, for instruktør: vælg e-mail)
create or replace function platform_enter(p_camp uuid, p_role text, p_shop uuid default null, p_email text default null) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not is_platform() then raise exception 'kun platformen'; end if;
  if not exists(select 1 from camps where id = p_camp) then raise exception 'ukendt camp'; end if;
  insert into support_sessions(user_id, camp_id, role, shop_id, email)
  values (auth.uid(), p_camp, p_role, p_shop, lower(p_email))
  on conflict (user_id) do update set camp_id = excluded.camp_id, role = excluded.role, shop_id = excluded.shop_id, email = excluded.email, started_at = now();
  perform log_event(p_camp, 'platform_adgang', jsonb_build_object('role', p_role, 'shop', p_shop, 'email', p_email));
end $$;

create or replace function platform_leave() returns void
language plpgsql security definer set search_path=public as $$
begin
  if not is_platform() then raise exception 'kun platformen'; end if;
  delete from support_sessions where user_id = auth.uid();
end $$;

revoke execute on function platform_enter, platform_leave from public, anon;
grant execute on function platform_enter, platform_leave to authenticated;
