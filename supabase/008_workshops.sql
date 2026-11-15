-- Workshops i databasen: tilmelding, afmelding, tjek ind, favoritter, rigtige datoer.
-- Ingen venteliste: er et hold fyldt, er det låst. Bedømmelser kan kun ses af arrangør og butikker.
-- Kør efter 001-007. Kan køres igen.

-- ───────── Rigtige datoer ─────────
alter table camps add column if not exists start_date date;
alter table camps add column if not exists tz text not null default 'Europe/Vienna';

create or replace function dow_of(p_day text) returns int language sql immutable as
$$ select case p_day when 'Man' then 1 when 'Tirs' then 2 when 'Ons' then 3 when 'Tors' then 4 when 'Fre' then 5 when 'Lør' then 6 when 'Søn' then 0 end $$;

-- Datoen for en ugedag i campen: første forekomst på eller efter startdatoen
create or replace function camp_day_date(p_start date, p_day text) returns date language sql immutable as
$$ select case when p_start is null or dow_of(p_day) is null then null
               else p_start + ((dow_of(p_day) - extract(dow from p_start)::int + 7) % 7) end $$;

create or replace function trg_ws_starts() returns trigger language plpgsql as $$
declare c camps; d date;
begin
  select * into c from camps where id = new.camp_id;
  d := camp_day_date(c.start_date, new.day);
  if d is not null and new.start_time is not null then
    new.starts_at := (d + new.start_time) at time zone c.tz;
  elsif new.starts_at is not null and d is null then
    null; -- behold eksisterende
  end if;
  return new;
end $$;
drop trigger if exists ws_starts_t on workshops;
create trigger ws_starts_t before insert or update on workshops for each row execute function trg_ws_starts();

-- Når startdatoen sættes eller ændres, opdateres alle holdenes tidspunkter
create or replace function trg_camp_start() returns trigger language plpgsql as $$
begin
  if new.start_date is distinct from old.start_date or new.tz is distinct from old.tz then
    update workshops set day = day where camp_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists camp_start_t on camps;
create trigger camp_start_t after update of start_date, tz on camps for each row execute function trg_camp_start();

-- ───────── Ingen venteliste ─────────
delete from enrollments where status = 'wait';
alter table enrollments add column if not exists no_show boolean not null default false;

create or replace function enroll(p_ws uuid, p_group text default null, p_extra text[] default '{}') returns text
language plpgsql security definer set search_path=public as $$
declare w workshops; c camps; v_in int; v_need int; v_open timestamptz;
begin
  if not exists(select 1 from profiles where id = auth.uid() and role = 'Deltager') then
    raise exception 'Kun deltagere kan tilmelde sig.'; end if;
  select * into w from workshops where id = p_ws and camp_id = my_camp() and not deleted and kind = 'Workshop' for update;
  if not found then raise exception 'Holdet findes ikke.'; end if;
  select * into c from camps where id = w.camp_id;
  if w.starts_at is null then raise exception 'Holdet har ikke en dato endnu. Spørg arrangøren.'; end if;
  v_open := (date_trunc('day', w.starts_at at time zone c.tz) + interval '8 hours') at time zone c.tz;
  if now() < v_open then raise exception 'Tilmelding åbner kl. 08:00 samme dag.'; end if;
  if now() > w.starts_at - interval '10 minutes' then raise exception 'Tilmelding er lukket.'; end if;
  if exists(select 1 from enrollments where workshop_id=p_ws and user_id=auth.uid()) then
    raise exception 'Du er allerede tilmeldt.'; end if;
  if exists(select 1 from enrollments e join workshops o on o.id=e.workshop_id
            where e.user_id=auth.uid() and not e.no_show and not o.deleted and o.id<>p_ws
              and tstzrange(o.starts_at, o.starts_at + o.duration_min*interval '1 minute')
               && tstzrange(w.starts_at, w.starts_at + w.duration_min*interval '1 minute')) then
    raise exception 'Du har allerede et hold på det tidspunkt.'; end if;
  select coalesce(sum(1+cardinality(extra_names)),0) into v_in from enrollments where workshop_id=p_ws and not no_show;
  v_need := 1 + coalesce(cardinality(p_extra),0);
  if v_in >= w.max_seats then raise exception 'Holdet er fuldt.'; end if;
  if v_in + v_need > w.max_seats then raise exception 'Holdet har kun % ledige pladser.', w.max_seats - v_in; end if;
  insert into enrollments(workshop_id,user_id,status,group_code,extra_names) values (p_ws,auth.uid(),'in',p_group,coalesce(p_extra,'{}'));
  return 'in';
end $$;

create or replace function cancel_enrollment(p_ws uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  delete from enrollments where workshop_id=p_ws and user_id=auth.uid();
end $$;

-- Pladser taget pr. hold (alle i campen kan se tallet, ikke hvem)
create or replace function ws_counts() returns table(workshop_id uuid, taken int)
language sql stable security definer set search_path=public as $$
  select e.workshop_id, sum(1+cardinality(e.extra_names))::int
  from enrollments e join workshops w on w.id=e.workshop_id
  where w.camp_id = my_camp() and not e.no_show group by e.workshop_id $$;

-- Tjek ind / mødte ikke op (instruktør for sit hold, eller arrangør)
create or replace function check_in(p_ws uuid, p_user uuid, p_in boolean default true) returns void
language plpgsql security definer set search_path=public as $$
declare w workshops;
begin
  select * into w from workshops where id=p_ws and camp_id=my_camp();
  if not found or not (my_role()='Arrangør' or (my_role()='Instruktør' and w.instructor_email = my_email()))
  then raise exception 'ingen adgang'; end if;
  update enrollments set checked_in=p_in, no_show=false where workshop_id=p_ws and user_id=p_user;
end $$;

create or replace function mark_no_show(p_ws uuid, p_user uuid, p_flag boolean default true) returns void
language plpgsql security definer set search_path=public as $$
declare w workshops;
begin
  select * into w from workshops where id=p_ws and camp_id=my_camp();
  if not found or not (my_role()='Arrangør' or (my_role()='Instruktør' and w.instructor_email = my_email()))
  then raise exception 'ingen adgang'; end if;
  update enrollments set no_show=p_flag, checked_in=false where workshop_id=p_ws and user_id=p_user;
end $$;

drop function if exists claim_seat(uuid);

-- Deltagerlisten: instruktøren ser kun navn, ikke støvle/Z/e-mail
drop view if exists roster;
create view roster as
  select e.workshop_id, e.user_id, p.name, e.status, e.checked_in, e.no_show, e.extra_names
  from enrollments e join profiles p on p.id=e.user_id join workshops w on w.id=e.workshop_id
  where w.camp_id=my_camp() and (my_role()='Arrangør' or (my_role()='Instruktør' and w.instructor_email = my_email()));

drop policy if exists enr_r on enrollments;
create policy enr_r on enrollments for select using (user_id = auth.uid()
  or exists(select 1 from workshops w where w.id=workshop_id and w.camp_id=my_camp() and my_role()='Arrangør'));

-- ───────── Favoritter på hold ─────────
create table if not exists ws_favorites(
  user_id uuid not null references profiles on delete cascade,
  workshop_id uuid not null references workshops on delete cascade,
  primary key(user_id, workshop_id)
);
alter table ws_favorites enable row level security;
drop policy if exists wsfav_w on ws_favorites;
create policy wsfav_w on ws_favorites for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function set_ws_fav(p_ws uuid, p_on boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from workshops where id=p_ws and camp_id=my_camp()) then raise exception 'Holdet findes ikke.'; end if;
  if p_on then insert into ws_favorites(user_id,workshop_id) values (auth.uid(),p_ws) on conflict do nothing;
  else delete from ws_favorites where user_id=auth.uid() and workshop_id=p_ws; end if;
end $$;

-- ───────── Bedømmelser: kun arrangør og butikker ─────────
drop policy if exists rat_r on ratings;
create policy rat_r on ratings for select using (
  user_id = auth.uid()                                   -- man ser kun sine egne
  or exists(select 1 from skis s where s.id = ski_id and s.camp_id = my_camp()
            and (my_role() = 'Arrangør' or (my_role() = 'Skiforretning' and s.shop_id = my_shop()))));

-- ───────── Push-beskeder ─────────
create table if not exists push_subs(
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles on delete cascade,
  camp_id uuid not null references camps on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table push_subs enable row level security;
drop policy if exists push_own on push_subs;
create policy push_own on push_subs for all using (user_id = auth.uid()) with check (user_id = auth.uid() and camp_id = my_camp());

-- ───────── Eksport til Excel (arrangøren: alt; butik: egne ski) ─────────
create or replace function export_loans() returns table(ski_code text, brand text, model text, shop text, borrower text, out_at timestamptz, back_at timestamptz, stars int)
language sql stable security definer set search_path=public as $$
  select s.code, s.brand, s.model, sh.name, p.name, l.out_at, l.back_at, r.stars
  from loans l join skis s on s.id=l.ski_id join shops sh on sh.id=s.shop_id
  left join profiles p on p.id=l.user_id
  left join ratings r on r.ski_id=l.ski_id and r.user_id=l.user_id
  where l.camp_id=my_camp() and (my_role()='Arrangør' or (my_role()='Skiforretning' and s.shop_id=my_shop()))
  order by l.out_at $$;

create or replace function export_enrollments() returns table(workshop text, day text, start_time time, participant text, extra_names text, checked_in boolean, no_show boolean)
language sql stable security definer set search_path=public as $$
  select w.title, w.day, w.start_time, p.name, array_to_string(e.extra_names,', '), e.checked_in, e.no_show
  from enrollments e join workshops w on w.id=e.workshop_id join profiles p on p.id=e.user_id
  where w.camp_id=my_camp() and my_role()='Arrangør' order by w.day, w.start_time, w.title, p.name $$;

drop function if exists export_participants();
create or replace function export_participants() returns table(name text, email text, boot_mm int, z_value numeric, created_at timestamptz)
language sql stable security definer set search_path=public as $$
  select p.name, p.email, p.boot_mm, p.z_value, p.created_at from profiles p
  where p.camp_id=my_camp() and p.role='Deltager' and my_role()='Arrangør' order by p.name $$;

-- Min egen data (GDPR-indsigt)
create or replace function export_my_data() returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  return jsonb_build_object(
    'profil', (select to_jsonb(p) - 'id' from profiles p where p.id = auth.uid()),
    'tilmeldinger', coalesce((select jsonb_agg(jsonb_build_object('hold', w.title, 'dag', w.day, 'tid', w.start_time, 'tjekket_ind', e.checked_in)) from enrollments e join workshops w on w.id=e.workshop_id where e.user_id = auth.uid()), '[]'::jsonb),
    'ski_lan', coalesce((select jsonb_agg(jsonb_build_object('ski', s.code, 'udlaant', l.out_at, 'afleveret', l.back_at)) from loans l join skis s on s.id=l.ski_id where l.user_id = auth.uid()), '[]'::jsonb),
    'stjerner', coalesce((select jsonb_agg(jsonb_build_object('ski', s.code, 'stjerner', r.stars)) from ratings r join skis s on s.id=r.ski_id where r.user_id = auth.uid()), '[]'::jsonb));
end $$;

revoke execute on function enroll, cancel_enrollment, ws_counts, check_in, mark_no_show, set_ws_fav, export_loans, export_enrollments, export_participants, export_my_data from public, anon;
grant execute on function enroll, cancel_enrollment, ws_counts, check_in, mark_no_show, set_ws_fav, export_loans, export_enrollments, export_participants, export_my_data to authenticated;

-- ───────── Sletning efter 90 dage (kører hver nat) ─────────
-- Kræver, at udvidelsen pg_cron er slået til: Database → Extensions → pg_cron.
do $$
begin
  if exists(select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'purge-camps';
    perform cron.schedule('purge-camps', '0 3 * * *', 'select purge_old_camps()');
  else
    raise notice 'pg_cron er ikke slået til. Slå den til under Database -> Extensions og kør denne fil igen.';
  end if;
end $$;

-- Hvilke påmindelser der allerede er sendt (så ingen får dem to gange)
create table if not exists push_sent(
  key text primary key,
  created_at timestamptz not null default now()
);
alter table push_sent enable row level security;   -- ingen policies: kun serverfunktionerne bruger den
