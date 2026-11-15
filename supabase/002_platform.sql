-- Platform-rolle: kun dig. Opretter camps og inviterer arrangører inde fra appen.
-- Kør efter 001_schema.sql. Kan køres igen.

create table if not exists platform_admins(email text primary key check (email = lower(email)));
alter table platform_admins enable row level security;   -- ingen policies = ingen direkte adgang

create or replace function is_platform() returns boolean language sql stable security definer set search_path=public as
$$ select exists(select 1 from platform_admins where email = lower((select email from auth.users where id = auth.uid()))) $$;

-- Opret camp og inviter arrangøren i ét hug
create or replace function platform_create_camp(p_name text, p_code text, p_end date, p_org_email text) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not is_platform() then raise exception 'kun platformen'; end if;
  p_code := upper(trim(p_code));
  if length(p_code) not between 4 and 12 then raise exception 'Koden skal være 4-12 bogstaver eller tal.'; end if;
  if length(trim(p_name)) < 2 then raise exception 'Skriv et navn til campen.'; end if;
  if p_org_email !~ '^\S+@\S+\.\S+$' then raise exception 'Skriv en gyldig e-mail.'; end if;
  insert into camps(name, code, end_date) values (trim(p_name), p_code, p_end) returning id into v_id;
  insert into invites(camp_id, email, role, name) values (v_id, lower(trim(p_org_email)), 'Arrangør', 'Arrangør');
  perform log_event(v_id, 'camp_oprettet', jsonb_build_object('org', lower(trim(p_org_email))));
  return v_id;
end $$;

-- Send arrangørkode/invitation igen eller skift arrangør (før de har oprettet sig)
create or replace function platform_set_organizer(p_camp uuid, p_org_email text) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not is_platform() then raise exception 'kun platformen'; end if;
  if exists(select 1 from profiles where camp_id = p_camp and role = 'Arrangør') then
    raise exception 'Campen har allerede en arrangør.'; end if;
  delete from invites where camp_id = p_camp and role = 'Arrangør';
  insert into invites(camp_id, email, role, name) values (p_camp, lower(trim(p_org_email)), 'Arrangør', 'Arrangør');
end $$;

-- Oversigt til platformen (ingen deltagerdata, kun tal)
create or replace function platform_camps() returns table(id uuid, name text, code text, end_date date, participants bigint, organizer_joined boolean)
language sql stable security definer set search_path=public as $$
  select c.id, c.name, c.code, c.end_date,
    (select count(*) from profiles p where p.camp_id=c.id and p.role='Deltager'),
    exists(select 1 from profiles p where p.camp_id=c.id and p.role='Arrangør')
  from camps c where is_platform() order by c.created_at desc $$;

revoke execute on function is_platform, platform_create_camp, platform_set_organizer, platform_camps from public, anon;
grant execute on function is_platform, platform_create_camp, platform_set_organizer, platform_camps to authenticated;

-- Slet campen (kun platformen), fx hvis den blev oprettet ved en fejl
create or replace function platform_delete_camp(p_camp uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not is_platform() then raise exception 'kun platformen'; end if;
  delete from auth.users where id in (select id from profiles where camp_id = p_camp);
  delete from camps where id = p_camp;
end $$;
revoke execute on function platform_delete_camp from public, anon;
grant execute on function platform_delete_camp to authenticated;
