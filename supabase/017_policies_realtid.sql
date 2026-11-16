-- 017: hurtigere RLS-politikker + realtid.
-- 1) Politikkerne bruger (select ...) så auth.uid()/my_camp()/my_role() kun beregnes én gang pr. forespørgsel,
--    gælder kun 'authenticated', og skrive-politikker er delt op pr. handling, så SELECT ikke tjekkes to gange.
-- 2) camp_pulse: én række pr. camp, som bumpes (højst hver 0,5 s) når noget i campen ændres.
--    Appen lytter på rækken via Supabase Realtime og henter nyt med det samme. Kør efter 016. Kan køres igen.

-- ===== Politikker =====
do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname='public' and tablename in
    ('audit_log','camps','enrollments','favorites','invites','levels','news','program_items','loans','profiles','push_subs','ratings','shops','skis','workshops','ws_favorites')
  loop execute format('drop policy %I on %I', r.policyname, r.tablename); end loop; end $$;
drop policy if exists audit_r on audit_log;
create policy audit_r on audit_log for select to authenticated using (camp_id=(select my_camp()) and (select my_role())='Arrangør');

drop policy if exists camps_org on camps; drop policy if exists camps_read on camps;
create policy camps_read on camps for select to authenticated using (id=(select my_camp()));
create policy camps_org on camps for update to authenticated using (id=(select my_camp()) and (select my_role())='Arrangør');

drop policy if exists enr_r on enrollments;
create policy enr_r on enrollments for select to authenticated using (
  user_id=(select auth.uid()) or ((select my_role())='Arrangør' and exists(select 1 from workshops w where w.id=enrollments.workshop_id and w.camp_id=(select my_camp()))));

drop policy if exists fav_w on favorites;
create policy fav_w on favorites for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

drop policy if exists inv_org on invites;
create policy inv_org on invites for all to authenticated using (camp_id=(select my_camp()) and (select my_role())='Arrangør') with check (camp_id=(select my_camp()) and (select my_role())='Arrangør');

-- levels / news / program_items: læs for alle i campen, skriv for arrangøren (delt op pr. handling)
do $$ declare t text; r text; p text; begin
  for t,r,p in select * from (values ('levels','lev_r','lev_w'),('news','news_r','news_w'),('program_items','prog_r','prog_w')) v(a,b,c) loop
    execute format('drop policy if exists %I on %I', r, t); execute format('drop policy if exists %I on %I', p, t);
    execute format('create policy %I on %I for select to authenticated using (camp_id=(select my_camp()))', r, t);
    execute format('create policy %I on %I for insert to authenticated with check (camp_id=(select my_camp()) and (select my_role())=''Arrangør'')', p||'_i', t);
    execute format('create policy %I on %I for update to authenticated using (camp_id=(select my_camp()) and (select my_role())=''Arrangør'') with check (camp_id=(select my_camp()) and (select my_role())=''Arrangør'')', p||'_u', t);
    execute format('create policy %I on %I for delete to authenticated using (camp_id=(select my_camp()) and (select my_role())=''Arrangør'')', p||'_d', t);
  end loop; end $$;

drop policy if exists loans_r on loans;
create policy loans_r on loans for select to authenticated using (camp_id=(select my_camp()) and (user_id=(select auth.uid()) or (select my_role()) in ('Arrangør','Skiforretning')));

drop policy if exists prof_org on profiles; drop policy if exists prof_self on profiles; drop policy if exists prof_upd on profiles;
create policy prof_r on profiles for select to authenticated using (id=(select auth.uid()) or (camp_id=(select my_camp()) and (select my_role()) in ('Arrangør','Skiforretning')));
create policy prof_upd on profiles for update to authenticated using (id=(select auth.uid())) with check (id=(select auth.uid()));

drop policy if exists push_own on push_subs;
create policy push_own on push_subs for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()) and camp_id=(select my_camp()));

drop policy if exists rat_r on ratings; drop policy if exists rat_w on ratings;
create policy rat_r on ratings for select to authenticated using (user_id=(select auth.uid()) or exists(select 1 from skis s where s.id=ratings.ski_id and s.camp_id=(select my_camp()) and ((select my_role())='Arrangør' or ((select my_role())='Skiforretning' and s.shop_id=(select my_shop())))));
create policy rat_w_i on ratings for insert to authenticated with check (user_id=(select auth.uid()));
create policy rat_w_u on ratings for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy rat_w_d on ratings for delete to authenticated using (user_id=(select auth.uid()));

drop policy if exists shops_r on shops; drop policy if exists shops_w on shops; drop policy if exists shops_ret on shops;
create policy shops_r on shops for select to authenticated using (camp_id=(select my_camp()));
create policy shops_w_i on shops for insert to authenticated with check (camp_id=(select my_camp()) and (select my_role())='Arrangør');
create policy shops_w_u on shops for update to authenticated
  using ((camp_id=(select my_camp()) and (select my_role())='Arrangør') or (id=(select my_shop()) and (select my_role())='Skiforretning'))
  with check ((camp_id=(select my_camp()) and (select my_role())='Arrangør') or id=(select my_shop()));
create policy shops_w_d on shops for delete to authenticated using (camp_id=(select my_camp()) and (select my_role())='Arrangør');

drop policy if exists ski_r on skis; drop policy if exists ski_org_w on skis; drop policy if exists ski_shop_w on skis;
create policy ski_r on skis for select to authenticated using (camp_id=(select my_camp()) and ((select my_role())<>'Skiforretning' or shop_id=(select my_shop())));
create policy ski_w_i on skis for insert to authenticated with check (
  (camp_id=(select my_camp()) and (select my_role())='Arrangør')
  or ((select my_role())='Skiforretning' and shop_id=(select my_shop()) and camp_id=(select my_camp()) and brand in (select unnest(sh.brands) from shops sh where sh.id=(select my_shop()))));
create policy ski_w_u on skis for update to authenticated
  using ((camp_id=(select my_camp()) and (select my_role())='Arrangør') or ((select my_role())='Skiforretning' and shop_id=(select my_shop()) and camp_id=(select my_camp())))
  with check ((camp_id=(select my_camp()) and (select my_role())='Arrangør')
  or ((select my_role())='Skiforretning' and shop_id=(select my_shop()) and camp_id=(select my_camp()) and brand in (select unnest(sh.brands) from shops sh where sh.id=(select my_shop()))));
create policy ski_w_d on skis for delete to authenticated using ((camp_id=(select my_camp()) and (select my_role())='Arrangør') or ((select my_role())='Skiforretning' and shop_id=(select my_shop()) and camp_id=(select my_camp())));

drop policy if exists ws_r on workshops; drop policy if exists ws_w on workshops; drop policy if exists ws_instr on workshops;
create policy ws_r on workshops for select to authenticated using (camp_id=(select my_camp()));
create policy ws_w_i on workshops for insert to authenticated with check (camp_id=(select my_camp()) and ((select my_role())='Arrangør' or ((select my_role())='Instruktør' and instructor_email=(select my_email()))));
create policy ws_w_u on workshops for update to authenticated using (camp_id=(select my_camp()) and ((select my_role())='Arrangør' or ((select my_role())='Instruktør' and instructor_email=(select my_email()))))
  with check (camp_id=(select my_camp()) and ((select my_role())='Arrangør' or ((select my_role())='Instruktør' and instructor_email=(select my_email()))));
create policy ws_w_d on workshops for delete to authenticated using (camp_id=(select my_camp()) and ((select my_role())='Arrangør' or ((select my_role())='Instruktør' and instructor_email=(select my_email()))));

drop policy if exists wsfav_w on ws_favorites;
create policy wsfav_w on ws_favorites for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

-- ===== Realtid =====
create table if not exists camp_pulse(
  camp_id uuid primary key references camps on delete cascade,
  n bigint not null default 0,
  ts timestamptz not null default clock_timestamp()
);
alter table camp_pulse enable row level security;
drop policy if exists pulse_r on camp_pulse;
create policy pulse_r on camp_pulse for select to authenticated using (camp_id=(select my_camp()));
revoke all on camp_pulse from anon, authenticated; grant select on camp_pulse to authenticated;
insert into camp_pulse(camp_id) select id from camps on conflict do nothing;

create or replace function pulse_bump(c uuid) returns void language sql security definer set search_path=public as $$
  update camp_pulse set n=n+1, ts=clock_timestamp() where camp_id=c and ts < clock_timestamp() - interval '500 ms' $$;
revoke execute on function pulse_bump(uuid) from public, anon, authenticated;

create or replace function trg_pulse_camp() returns trigger language plpgsql security definer set search_path=public as $$
begin if tg_op='DELETE' then perform pulse_bump(old.camp_id); else perform pulse_bump(new.camp_id); end if; return null; end $$;
create or replace function trg_pulse_enr() returns trigger language plpgsql security definer set search_path=public as $$
declare w uuid;
begin if tg_op='DELETE' then w:=old.workshop_id; else w:=new.workshop_id; end if;
  perform pulse_bump((select camp_id from workshops where id=w)); return null; end $$;
create or replace function trg_pulse_rat() returns trigger language plpgsql security definer set search_path=public as $$
declare k uuid;
begin if tg_op='DELETE' then k:=old.ski_id; else k:=new.ski_id; end if;
  perform pulse_bump((select camp_id from skis where id=k)); return null; end $$;
create or replace function trg_pulse_camps() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then insert into camp_pulse(camp_id) values (new.id) on conflict do nothing; else perform pulse_bump(new.id); end if; return null; end $$;
revoke execute on function trg_pulse_camp(), trg_pulse_enr(), trg_pulse_rat(), trg_pulse_camps() from public, anon, authenticated;

do $$ declare t text; begin
  foreach t in array array['skis','loans','workshops','news','program_items','shops','levels','messages','profiles','ski_damage','invites'] loop
    execute format('drop trigger if exists pulse on %I', t);
    execute format('create trigger pulse after insert or update or delete on %I for each row execute function trg_pulse_camp()', t);
  end loop; end $$;
drop trigger if exists pulse on enrollments; create trigger pulse after insert or update or delete on enrollments for each row execute function trg_pulse_enr();
drop trigger if exists pulse on ratings;     create trigger pulse after insert or update or delete on ratings for each row execute function trg_pulse_rat();
drop trigger if exists pulse on camps;       create trigger pulse after insert or update on camps for each row execute function trg_pulse_camps();

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='camp_pulse') then
    alter publication supabase_realtime add table camp_pulse; end if;
end $$;
