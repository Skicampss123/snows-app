-- Flere slags udstyr: Ski, Snowboard, Hjelm, Stave, Briller.
-- Kør efter 001-009. Kan køres igen.

alter table skis add column if not exists kind text not null default 'Ski';
alter table skis drop constraint if exists skis_kind_check;
alter table skis add constraint skis_kind_check check (kind in ('Ski','Snowboard','Hjelm','Stave','Briller'));
alter table skis add column if not exists size text;                 -- bruges til hjelme (fx M) og evt. briller

-- Længde, radius og bredde gælder ikke alle slags udstyr
alter table skis alter column length_cm drop not null;
alter table skis alter column radius_m drop not null;
alter table skis alter column width_mm drop not null;
alter table skis drop constraint if exists skis_length_cm_check;
alter table skis drop constraint if exists skis_radius_m_check;
alter table skis drop constraint if exists skis_width_mm_check;
alter table skis add constraint skis_length_cm_check check (length_cm is null or length_cm between 60 and 230);
alter table skis add constraint skis_radius_m_check  check (radius_m is null or radius_m between 5 and 30);
alter table skis add constraint skis_width_mm_check  check (width_mm is null or width_mm between 50 and 400);

-- Deltageren kan have ét stykke udstyr ude pr. type (fx ét par ski og én hjelm)
create or replace function lend_ski(p_code text) returns skis
language plpgsql security definer set search_path=public as $$
declare s skis;
begin
  if not exists(select 1 from profiles where id = auth.uid() and role = 'Deltager') then
    raise exception 'Kun en deltager kan låne udstyr.'; end if;
  select * into s from skis where camp_id=my_camp() and upper(code)=upper(trim(p_code)) for update;
  if not found then raise exception 'Vi kan ikke finde udstyr med det ID. Tjek ID''et under QR-koden.'; end if;
  if exists(select 1 from skis where lent_to=auth.uid() and status='ude' and kind=s.kind) then
    raise exception 'Aflever først dit nuværende udstyr af samme type (%).', s.kind; end if;
  if s.status='ude' then raise exception 'Det er allerede udlånt.'; end if;
  if s.status<>'inde' then raise exception 'Det kan ikke lånes ud lige nu. Spørg butikken.'; end if;
  update skis set status='ude', lent_to=auth.uid(), lent_at=now(), handed_in_at=null where id=s.id returning * into s;
  insert into loans(camp_id,ski_id,user_id) values (s.camp_id,s.id,auth.uid());
  return s;
end $$;

create or replace function org_lend(p_ski uuid, p_user uuid) returns void
language plpgsql security definer set search_path=public as $$
declare s skis;
begin
  if my_role() not in ('Arrangør','Skiforretning') then raise exception 'ingen adgang'; end if;
  select * into s from skis where id = p_ski and camp_id = my_camp() for update;
  if not found or (my_role() = 'Skiforretning' and s.shop_id is distinct from my_shop()) then raise exception 'ingen adgang'; end if;
  if not exists(select 1 from profiles where id = p_user and camp_id = my_camp() and role = 'Deltager') then
    raise exception 'Deltageren findes ikke.'; end if;
  if s.status <> 'inde' then raise exception 'Det er ikke ledigt.'; end if;
  if exists(select 1 from skis where lent_to = p_user and status = 'ude' and kind = s.kind) then
    raise exception 'Deltageren har allerede udstyr af typen % ude.', s.kind; end if;
  update skis set status='ude', lent_to=p_user, lent_at=now(), handed_in_at=null where id = p_ski;
  insert into loans(camp_id, ski_id, user_id) values (s.camp_id, s.id, p_user);
  perform log_event(my_camp(), 'manuelt_udlaan', jsonb_build_object('ski', s.code, 'user', p_user));
end $$;

revoke execute on function lend_ski, org_lend from public, anon;
grant execute on function lend_ski, org_lend to authenticated;
