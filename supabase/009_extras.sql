-- Historik pr. ski, kommentarer til stjerner, fejllog, og manuel rettelse af tilmelding og lån.
-- Kør efter 001-008. Kan køres igen.

-- ───────── Historik pr. ski (butikken ser egne ski, arrangøren alle) ─────────
create or replace function ski_history(p_ski uuid) returns table(borrower text, out_at timestamptz, back_at timestamptz, stars int, comment text)
language sql stable security definer set search_path=public as $$
  select p.name, l.out_at, l.back_at, r.stars, r.comment
  from loans l join skis s on s.id = l.ski_id
  left join profiles p on p.id = l.user_id
  left join ratings r on r.ski_id = l.ski_id and r.user_id = l.user_id
  where l.ski_id = p_ski and s.camp_id = my_camp()
    and (my_role() = 'Arrangør' or (my_role() = 'Skiforretning' and s.shop_id = my_shop()))
  order by l.out_at desc $$;

-- Seneste kommentarer (uden navn)
create or replace function ski_comments() returns table(brand text, model text, stars int, comment text, created_at timestamptz)
language sql stable security definer set search_path=public as $$
  select s.brand, s.model, r.stars, r.comment, r.created_at
  from ratings r join skis s on s.id = r.ski_id
  where s.camp_id = my_camp() and r.comment is not null and length(trim(r.comment)) > 0
    and (my_role() = 'Arrangør' or (my_role() = 'Skiforretning' and s.shop_id = my_shop()))
  order by r.created_at desc limit 100 $$;

-- Eksport af udlån med kommentar
drop function if exists export_loans();
create or replace function export_loans() returns table(ski_code text, brand text, model text, shop text, borrower text, out_at timestamptz, back_at timestamptz, stars int, comment text)
language sql stable security definer set search_path=public as $$
  select s.code, s.brand, s.model, sh.name, p.name, l.out_at, l.back_at, r.stars, r.comment
  from loans l join skis s on s.id=l.ski_id join shops sh on sh.id=s.shop_id
  left join profiles p on p.id=l.user_id
  left join ratings r on r.ski_id=l.ski_id and r.user_id=l.user_id
  where l.camp_id=my_camp() and (my_role()='Arrangør' or (my_role()='Skiforretning' and s.shop_id=my_shop()))
  order by l.out_at $$;

-- ───────── Find deltagere (til manuel tilmelding og udlån) ─────────
create or replace function find_participants(p_q text) returns table(id uuid, name text, email text)
language sql stable security definer set search_path=public as $$
  select p.id, p.name, case when my_role() = 'Arrangør' then p.email end
  from profiles p
  where p.camp_id = my_camp() and p.role = 'Deltager' and my_role() in ('Arrangør','Skiforretning')
    and length(trim(coalesce(p_q,''))) >= 2
    and (p.name ilike '%'||trim(p_q)||'%' or (my_role() = 'Arrangør' and p.email ilike '%'||trim(p_q)||'%'))
  order by p.name limit 15 $$;

-- ───────── Arrangøren retter en tilmelding ─────────
create or replace function org_enroll(p_ws uuid, p_user uuid, p_extra text[] default '{}', p_force boolean default false) returns void
language plpgsql security definer set search_path=public as $$
declare w workshops; v_in int;
begin
  if my_role() <> 'Arrangør' then raise exception 'ingen adgang'; end if;
  select * into w from workshops where id = p_ws and camp_id = my_camp() and not deleted for update;
  if not found then raise exception 'Holdet findes ikke.'; end if;
  if not exists(select 1 from profiles where id = p_user and camp_id = my_camp() and role = 'Deltager') then
    raise exception 'Deltageren findes ikke.'; end if;
  if exists(select 1 from enrollments where workshop_id = p_ws and user_id = p_user) then
    raise exception 'Deltageren er allerede tilmeldt.'; end if;
  select coalesce(sum(1+cardinality(extra_names)),0) into v_in from enrollments where workshop_id = p_ws and not no_show;
  if not p_force and v_in + 1 + coalesce(cardinality(p_extra),0) > w.max_seats then
    raise exception 'Holdet er fuldt. Hæv antallet af pladser først.'; end if;
  insert into enrollments(workshop_id, user_id, status, extra_names) values (p_ws, p_user, 'in', coalesce(p_extra,'{}'));
  perform log_event(my_camp(), 'arrangoer_tilmelding', jsonb_build_object('ws', p_ws, 'user', p_user));
end $$;

create or replace function org_unenroll(p_ws uuid, p_user uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  if my_role() <> 'Arrangør' then raise exception 'ingen adgang'; end if;
  delete from enrollments e using workshops w where e.workshop_id = p_ws and e.user_id = p_user and w.id = e.workshop_id and w.camp_id = my_camp();
  perform log_event(my_camp(), 'arrangoer_afmelding', jsonb_build_object('ws', p_ws, 'user', p_user));
end $$;

-- ───────── Arrangør eller butik låner en ski ud til en deltager ─────────
create or replace function org_lend(p_ski uuid, p_user uuid) returns void
language plpgsql security definer set search_path=public as $$
declare s skis;
begin
  if my_role() not in ('Arrangør','Skiforretning') then raise exception 'ingen adgang'; end if;
  select * into s from skis where id = p_ski and camp_id = my_camp() for update;
  if not found or (my_role() = 'Skiforretning' and s.shop_id is distinct from my_shop()) then raise exception 'ingen adgang'; end if;
  if not exists(select 1 from profiles where id = p_user and camp_id = my_camp() and role = 'Deltager') then
    raise exception 'Deltageren findes ikke.'; end if;
  if s.status <> 'inde' then raise exception 'Skien er ikke ledig.'; end if;
  if exists(select 1 from skis where lent_to = p_user and status = 'ude') then
    raise exception 'Deltageren har allerede et par ski ude.'; end if;
  update skis set status='ude', lent_to=p_user, lent_at=now(), handed_in_at=null where id = p_ski;
  insert into loans(camp_id, ski_id, user_id) values (s.camp_id, s.id, p_user);
  perform log_event(my_camp(), 'manuelt_udlaan', jsonb_build_object('ski', s.code, 'user', p_user));
end $$;

-- ───────── Fejllog fra deltagernes telefoner ─────────
create table if not exists client_errors(
  id bigint generated always as identity primary key,
  camp_id uuid references camps on delete cascade,
  user_id uuid,
  role text,
  msg text not null,
  place text,
  stack text,
  ua text,
  ver text,
  created_at timestamptz not null default now()
);
create index if not exists client_errors_t on client_errors(created_at desc);
alter table client_errors enable row level security;   -- kun via funktionerne

create or replace function log_client_error(p_msg text, p_place text default null, p_stack text default null, p_ua text default null, p_ver text default null) returns void
language plpgsql security definer set search_path=public as $$
begin
  insert into client_errors(camp_id, user_id, role, msg, place, stack, ua, ver)
  values (my_camp(), auth.uid(), my_role(), left(coalesce(p_msg,''),500), left(p_place,300), left(p_stack,2000), left(p_ua,200), left(p_ver,40));
  if random() < 0.02 then delete from client_errors where created_at < now() - interval '30 days'; end if;
end $$;

create or replace function platform_errors(p_limit int default 100) returns table(id bigint, created_at timestamptz, camp text, role text, msg text, place text, stack text, ua text, ver text)
language plpgsql stable security definer set search_path=public as $$
begin
  if not is_platform() then raise exception 'kun platformen'; end if;
  return query select e.id, e.created_at, c.name, e.role, e.msg, e.place, e.stack, e.ua, e.ver
    from client_errors e left join camps c on c.id = e.camp_id order by e.created_at desc limit least(coalesce(p_limit,100), 500);
end $$;

create or replace function platform_clear_errors() returns void
language plpgsql security definer set search_path=public as $$
begin
  if not is_platform() then raise exception 'kun platformen'; end if;
  delete from client_errors;
end $$;

revoke execute on function ski_history, ski_comments, export_loans, find_participants, org_enroll, org_unenroll, org_lend, log_client_error, platform_errors, platform_clear_errors from public, anon;
grant execute on function ski_history, ski_comments, export_loans, find_participants, org_enroll, org_unenroll, org_lend, log_client_error, platform_errors, platform_clear_errors to authenticated;
