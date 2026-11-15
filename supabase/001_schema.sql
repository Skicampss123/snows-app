-- Snow's – database, roller og regler (Supabase / Postgres)
-- Kør hele filen i Supabase → SQL Editor → New query → Run.
-- Kan køres igen uden at slette data (create if not exists / or replace).

create extension if not exists pgcrypto;

-- ───────────────────────── Tabeller ─────────────────────────
create table if not exists camps(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique check (code = upper(code) and length(code) between 4 and 12),
  color text default '#0b5cff',
  logo_url text,
  contact jsonb not null default '{}',
  info jsonb not null default '{}',
  end_date date,                       -- slettes 90 dage efter
  created_at timestamptz not null default now()
);

create table if not exists shops(
  id uuid primary key default gen_random_uuid(),
  camp_id uuid not null references camps on delete cascade,
  name text not null,
  brands text[] not null default '{}',
  return_time time,                    -- skiene skal være tilbage
  unique(camp_id, name)
);

-- Invitationer: bestemmer rollen ud fra e-mail (instruktør, butik, arrangør)
create table if not exists invites(
  camp_id uuid not null references camps on delete cascade,
  email text not null check (email = lower(email)),
  role text not null check (role in ('Instruktør','Skiforretning','Arrangør')),
  name text,
  shop_id uuid references shops on delete cascade,
  primary key(camp_id, email)
);

create table if not exists profiles(
  id uuid primary key references auth.users on delete cascade,
  camp_id uuid not null references camps on delete cascade,
  role text not null check (role in ('Deltager','Skiforretning','Instruktør','Arrangør')),
  name text not null,
  email text not null,
  shop_id uuid references shops on delete set null,
  boot_mm int check (boot_mm between 200 and 380),
  z_value numeric check (z_value between 1 and 14),
  lang text not null default 'da' check (lang in ('da','en','de')),
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(camp_id, email)
);

create table if not exists levels(
  id uuid primary key default gen_random_uuid(),
  camp_id uuid not null references camps on delete cascade,
  name text not null,
  sort int not null default 0,
  unique(camp_id, name)
);

create table if not exists skis(
  id uuid primary key default gen_random_uuid(),
  camp_id uuid not null references camps on delete cascade,
  code text not null,                  -- SK-001, står i QR og under koden
  shop_id uuid not null references shops on delete cascade,
  brand text not null,
  model text not null,
  length_cm int not null check (length_cm between 100 and 230),
  radius_m numeric not null check (radius_m between 5 and 30),
  width_mm int not null check (width_mm between 50 and 140),
  level text,
  status text not null default 'inde' check (status in ('inde','ude','skadet','mistet')),
  lent_to uuid references profiles on delete set null,
  lent_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  unique(camp_id, code)
);

create table if not exists loans(        -- historik (statistik)
  id bigint generated always as identity primary key,
  camp_id uuid not null references camps on delete cascade,
  ski_id uuid not null references skis on delete cascade,
  user_id uuid references profiles on delete set null,
  out_at timestamptz not null default now(),
  back_at timestamptz
);

create table if not exists ratings(
  ski_id uuid not null references skis on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  stars int not null check (stars between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  primary key(ski_id, user_id)
);

create table if not exists favorites(
  user_id uuid not null references profiles on delete cascade,
  ski_id uuid not null references skis on delete cascade,
  primary key(user_id, ski_id)
);

create table if not exists workshops(
  id uuid primary key default gen_random_uuid(),
  camp_id uuid not null references camps on delete cascade,
  title text not null,
  kind text not null default 'Workshop' check (kind in ('Workshop','Event')),
  level text,
  starts_at timestamptz not null,
  duration_min int not null default 120 check (duration_min between 5 and 600),
  max_seats int not null default 10 check (max_seats between 1 and 500),
  instructor_id uuid references profiles on delete set null,
  place text,
  recommended_ski text,
  deleted boolean not null default false
);

create table if not exists enrollments(
  workshop_id uuid not null references workshops on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  status text not null check (status in ('in','wait')),
  group_code text,
  extra_names text[] not null default '{}',
  checked_in boolean not null default false,
  no_show boolean not null default false,
  created_at timestamptz not null default now(),
  primary key(workshop_id, user_id)
);

create table if not exists program_items(
  id uuid primary key default gen_random_uuid(),
  camp_id uuid not null references camps on delete cascade,
  day text not null check (day in ('Man','Tirs','Ons','Tors','Fre','Lør','Søn')),
  time time not null,
  title text not null,
  place text
);

create table if not exists news(
  id uuid primary key default gen_random_uuid(),
  camp_id uuid not null references camps on delete cascade,
  title text not null,
  body text,
  created_at timestamptz not null default now()
);

create table if not exists audit_log(    -- support-log
  id bigint generated always as identity primary key,
  camp_id uuid references camps on delete cascade,
  actor uuid,
  action text not null,
  detail jsonb,
  at timestamptz not null default now()
);

create index if not exists skis_camp on skis(camp_id, shop_id, status);
create index if not exists enr_user on enrollments(user_id);
create index if not exists ws_camp on workshops(camp_id, starts_at);

-- ───────────────────────── Hjælpefunktioner ─────────────────────────
create or replace function my_camp() returns uuid language sql stable security definer set search_path=public as
$$ select camp_id from profiles where id = auth.uid() $$;
create or replace function my_role() returns text language sql stable security definer set search_path=public as
$$ select role from profiles where id = auth.uid() $$;
create or replace function my_shop() returns uuid language sql stable security definer set search_path=public as
$$ select shop_id from profiles where id = auth.uid() $$;

create or replace function log_event(p_camp uuid, p_action text, p_detail jsonb default '{}') returns void
language sql security definer set search_path=public as
$$ insert into audit_log(camp_id, actor, action, detail) values (p_camp, auth.uid(), p_action, p_detail) $$;

-- ───────────────────────── Tilmelding til camp ─────────────────────────
-- Kaldes efter e-mail-koden er bekræftet. Deltager: kræver campkode.
-- Instruktør/butik/arrangør: findes i invites, så kræver ingen kode.
create or replace function join_camp(p_name text, p_code text default null) returns profiles
language plpgsql security definer set search_path=public as $$
declare v_email text; v_camp camps; v_inv invites; v_p profiles;
begin
  if auth.uid() is null then raise exception 'ikke logget ind'; end if;
  select * into v_p from profiles where id = auth.uid();
  if found then return v_p; end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  select * into v_inv from invites where email = v_email limit 1;
  if found then
    insert into profiles(id,camp_id,role,name,email,shop_id)
    values (auth.uid(), v_inv.camp_id, v_inv.role, coalesce(v_inv.name, nullif(trim(p_name),''), v_email), v_email, v_inv.shop_id)
    returning * into v_p;
    return v_p;
  end if;
  select * into v_camp from camps where code = upper(trim(coalesce(p_code,'')));
  if not found then raise exception 'Koden passer ikke. Tjek campkoden.'; end if;
  if length(trim(coalesce(p_name,''))) < 2 then raise exception 'Skriv dit navn.'; end if;
  insert into profiles(id,camp_id,role,name,email) values (auth.uid(), v_camp.id, 'Deltager', trim(p_name), v_email)
  returning * into v_p;
  return v_p;
end $$;

create or replace function delete_my_account() returns void
language plpgsql security definer set search_path=public as $$
begin
  perform log_event(my_camp(),'konto_slettet',jsonb_build_object('user',auth.uid()));
  delete from auth.users where id = auth.uid();
end $$;

-- Arrangør: ret deltager (navn, e-mail, støvle, Z). Navn kan kun ændres her.
create or replace function organizer_update_user(p_user uuid, p_name text, p_email text, p_boot int, p_z numeric) returns void
language plpgsql security definer set search_path=public as $$
begin
  if my_role() <> 'Arrangør' then raise exception 'kun arrangøren'; end if;
  if not exists(select 1 from profiles where id=p_user and camp_id=my_camp()) then raise exception 'ukendt bruger'; end if;
  update profiles set name=trim(p_name), email=lower(trim(p_email)), boot_mm=p_boot, z_value=p_z where id=p_user;
  update auth.users set email=lower(trim(p_email)) where id=p_user;
  perform log_event(my_camp(),'deltager_rettet',jsonb_build_object('user',p_user));
end $$;

-- ───────────────────────── Workshop-regler ─────────────────────────
-- Åbner 08:00 på dagen, lukker 10 min før start, ingen overlap, venteliste.
create or replace function enroll(p_ws uuid, p_group text default null, p_extra text[] default '{}') returns text
language plpgsql security definer set search_path=public as $$
declare w workshops; v_in int; v_need int; v_status text; v_open timestamptz; tz text := 'Europe/Vienna';
begin
  select * into w from workshops where id = p_ws and camp_id = my_camp() and not deleted;
  if not found then raise exception 'Workshoppen findes ikke.'; end if;
  v_open := (date_trunc('day', w.starts_at at time zone tz) + interval '8 hours') at time zone tz;
  if now() < v_open then raise exception 'Tilmelding åbner kl. 08:00 samme dag.'; end if;
  if now() > w.starts_at - interval '10 minutes' then raise exception 'Tilmelding er lukket.'; end if;
  if exists(select 1 from enrollments where workshop_id=p_ws and user_id=auth.uid()) then
    raise exception 'Du er allerede tilmeldt.'; end if;
  if exists(select 1 from enrollments e join workshops o on o.id=e.workshop_id
            where e.user_id=auth.uid() and e.status='in' and not o.deleted and o.id<>p_ws
              and tstzrange(o.starts_at, o.starts_at + o.duration_min*interval '1 minute')
               && tstzrange(w.starts_at, w.starts_at + w.duration_min*interval '1 minute')) then
    raise exception 'Du har allerede et hold på det tidspunkt.'; end if;
  select coalesce(sum(1+cardinality(extra_names)),0) into v_in from enrollments where workshop_id=p_ws and status='in';
  v_need := 1 + coalesce(cardinality(p_extra),0);
  v_status := case when v_in + v_need <= w.max_seats then 'in' else 'wait' end;
  insert into enrollments(workshop_id,user_id,status,group_code,extra_names) values (p_ws,auth.uid(),v_status,p_group,p_extra);
  return v_status;
end $$;

create or replace function cancel_enrollment(p_ws uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  delete from enrollments where workshop_id=p_ws and user_id=auth.uid();
end $$;

-- Første der kalder, når der er en ledig plads, får den.
create or replace function claim_seat(p_ws uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare w workshops; v_in int; v_need int; e enrollments;
begin
  select * into w from workshops where id=p_ws and camp_id=my_camp() and not deleted for update;
  select * into e from enrollments where workshop_id=p_ws and user_id=auth.uid() and status='wait';
  if not found then return false; end if;
  select coalesce(sum(1+cardinality(extra_names)),0) into v_in from enrollments where workshop_id=p_ws and status='in';
  v_need := 1 + cardinality(e.extra_names);
  if v_in + v_need > w.max_seats then return false; end if;
  update enrollments set status='in' where workshop_id=p_ws and user_id=auth.uid();
  return true;
end $$;

create or replace function check_in(p_ws uuid, p_user uuid, p_in boolean default true) returns void
language plpgsql security definer set search_path=public as $$
declare w workshops;
begin
  select * into w from workshops where id=p_ws and camp_id=my_camp();
  if not found or not (my_role()='Arrangør' or (my_role()='Instruktør' and w.instructor_id = auth.uid()))
  then raise exception 'ingen adgang'; end if;
  update enrollments set checked_in=p_in where workshop_id=p_ws and user_id=p_user;
end $$;

-- ───────────────────────── Ski-udlån ─────────────────────────
create or replace function lend_ski(p_code text) returns skis
language plpgsql security definer set search_path=public as $$
declare s skis;
begin
  select * into s from skis where camp_id=my_camp() and upper(code)=upper(trim(p_code)) for update;
  if not found then raise exception 'Vi kan ikke finde en ski med det ID.'; end if;
  if exists(select 1 from skis where lent_to=auth.uid() and status='ude') then
    raise exception 'Aflever først dine nuværende ski.'; end if;
  if s.status<>'inde' then raise exception 'Den ski kan ikke lånes ud lige nu. Spørg butikken.'; end if;
  update skis set status='ude', lent_to=auth.uid(), lent_at=now() where id=s.id returning * into s;
  insert into loans(camp_id,ski_id,user_id) values (s.camp_id,s.id,auth.uid());
  return s;
end $$;

create or replace function return_ski(p_ski uuid) returns void
language plpgsql security definer set search_path=public as $$
declare s skis;
begin
  select * into s from skis where id=p_ski and camp_id=my_camp() for update;
  if not found or (my_role()='Skiforretning' and s.shop_id is distinct from my_shop()) then raise exception 'ingen adgang'; end if;
  update skis set status='inde', lent_to=null, lent_at=null where id=p_ski;
  update loans set back_at=now() where ski_id=p_ski and back_at is null;
end $$;

-- Butikken ser kun egne ski, men al statistik
create or replace function ski_stats() returns table(brand text, model text, loans bigint, avg_stars numeric)
language sql stable security definer set search_path=public as $$
  select s.brand, s.model, count(l.id), round(avg(r.stars),1)
  from skis s left join loans l on l.ski_id=s.id left join ratings r on r.ski_id=s.id
  where s.camp_id=my_camp() and my_role() in ('Skiforretning','Arrangør')
  group by s.brand, s.model order by 3 desc $$;

-- Instruktør ser kun navn, ikke niveau/støvle/Z
create or replace view roster as
  select e.workshop_id, e.user_id, p.name, e.status, e.checked_in, e.extra_names
  from enrollments e join profiles p on p.id=e.user_id join workshops w on w.id=e.workshop_id
  where w.camp_id=my_camp() and (w.instructor_id=auth.uid() or my_role()='Arrangør');

-- ───────────────────────── Sletning efter 90 dage ─────────────────────────
create or replace function purge_old_camps() returns int language plpgsql security definer set search_path=public as $$
declare n int;
begin
  delete from auth.users where id in (select p.id from profiles p join camps c on c.id=p.camp_id where c.end_date < current_date - 90);
  delete from camps where end_date < current_date - 90;
  get diagnostics n = row_count; return n;
end $$;
-- Planlæg dagligt (kræver pg_cron: Database → Extensions):
--   select cron.schedule('purge-camps','0 3 * * *','select purge_old_camps()');

-- ───────────────────────── Række-niveau sikkerhed ─────────────────────────
alter table camps enable row level security;        alter table shops enable row level security;
alter table invites enable row level security;      alter table profiles enable row level security;
alter table levels enable row level security;       alter table skis enable row level security;
alter table loans enable row level security;        alter table ratings enable row level security;
alter table favorites enable row level security;    alter table workshops enable row level security;
alter table enrollments enable row level security;  alter table program_items enable row level security;
alter table news enable row level security;         alter table audit_log enable row level security;

do $$ declare r record; begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname='public' loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop; end $$;

-- camp
create policy camps_read on camps for select using (id = my_camp());
create policy camps_org on camps for update using (id = my_camp() and my_role()='Arrangør');
-- profiler: eget; arrangør alle i campen; butik ser navne (til udlån); instruktør kun sig selv
create policy prof_self on profiles for select using (id = auth.uid());
create policy prof_org on profiles for select using (camp_id = my_camp() and my_role() in ('Arrangør','Skiforretning'));
create policy prof_upd on profiles for update using (id = auth.uid()) with check (id = auth.uid());
-- navn, e-mail, rolle og camp kan ikke ændres af brugeren selv:
revoke update on profiles from authenticated, anon;
grant update (boot_mm, z_value, lang) on profiles to authenticated;
-- butikker, niveauer, program, nyheder, workshops: alle i campen læser, arrangør skriver
create policy shops_r on shops for select using (camp_id = my_camp());
create policy shops_w on shops for all using (camp_id = my_camp() and my_role()='Arrangør') with check (camp_id = my_camp() and my_role()='Arrangør');
create policy shops_ret on shops for update using (id = my_shop() and my_role()='Skiforretning') with check (id = my_shop());
create policy inv_org on invites for all using (camp_id = my_camp() and my_role()='Arrangør') with check (camp_id = my_camp() and my_role()='Arrangør');
create policy lev_r on levels for select using (camp_id = my_camp());
create policy lev_w on levels for all using (camp_id = my_camp() and my_role()='Arrangør') with check (camp_id = my_camp() and my_role()='Arrangør');
create policy prog_r on program_items for select using (camp_id = my_camp());
create policy prog_w on program_items for all using (camp_id = my_camp() and my_role()='Arrangør') with check (camp_id = my_camp() and my_role()='Arrangør');
create policy news_r on news for select using (camp_id = my_camp());
create policy news_w on news for all using (camp_id = my_camp() and my_role()='Arrangør') with check (camp_id = my_camp() and my_role()='Arrangør');
create policy ws_r on workshops for select using (camp_id = my_camp());
create policy ws_w on workshops for all using (camp_id = my_camp() and my_role()='Arrangør') with check (camp_id = my_camp() and my_role()='Arrangør');
-- ski: deltagere/instruktør/arrangør ser alle i campen; butik kun egne. Butik skriver kun egne.
create policy ski_r on skis for select using (camp_id = my_camp() and (my_role() <> 'Skiforretning' or shop_id = my_shop()));
create policy ski_shop_w on skis for all using (my_role()='Skiforretning' and shop_id = my_shop() and camp_id = my_camp())
  with check (my_role()='Skiforretning' and shop_id = my_shop() and camp_id = my_camp()
    and brand = any (select unnest(brands) from shops where id = my_shop()));
create policy ski_org_w on skis for all using (camp_id = my_camp() and my_role()='Arrangør') with check (camp_id = my_camp() and my_role()='Arrangør');
-- udlån/aflevering sker kun via lend_ski/return_ski (ingen direkte opdatering fra deltagere)
create policy loans_r on loans for select using (camp_id = my_camp() and (user_id = auth.uid() or my_role() in ('Arrangør','Skiforretning')));
create policy rat_r on ratings for select using (exists(select 1 from skis s where s.id=ski_id and s.camp_id=my_camp()));
create policy rat_w on ratings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy fav_w on favorites for all using (user_id = auth.uid()) with check (user_id = auth.uid());
-- tilmeldinger: eget; arrangør alle; ændringer via enroll/cancel/claim/check_in
create policy enr_r on enrollments for select using (user_id = auth.uid()
  or exists(select 1 from workshops w where w.id=workshop_id and w.camp_id=my_camp() and my_role()='Arrangør'));
create policy audit_r on audit_log for select using (camp_id = my_camp() and my_role()='Arrangør');

-- Funktioner må kun kaldes af loggede brugere
revoke execute on all functions in schema public from public, anon;
grant execute on function join_camp, delete_my_account, organizer_update_user, enroll, cancel_enrollment, claim_seat,
  check_in, lend_ski, return_ski, ski_stats, my_camp, my_role, my_shop to authenticated;
grant select on roster to authenticated;
