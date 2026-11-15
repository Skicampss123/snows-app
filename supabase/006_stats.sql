-- Butikkens overblik: kun egne ski. Udlån, stjerner pr. model, gennemsnit og skader.
-- Kør efter 001-005. Kan køres igen.

-- Skadehistorik: hver gang en ski bliver markeret skadet/mistet, gemmes det (også hvis den senere er klar igen)
create table if not exists ski_damage(
  id bigint generated always as identity primary key,
  camp_id uuid not null references camps on delete cascade,
  ski_id uuid not null references skis on delete cascade,
  kind text not null check (kind in ('skadet','mistet')),
  created_at timestamptz not null default now()
);
alter table ski_damage enable row level security;   -- ingen policies: kun via funktionen nedenfor

create or replace function trg_ski_damage() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status in ('skadet','mistet') and (tg_op='INSERT' or old.status is distinct from new.status) then
    insert into ski_damage(camp_id, ski_id, kind) values (new.camp_id, new.id, new.status);
  end if;
  return new;
end $$;
drop trigger if exists ski_damage_t on skis;
create trigger ski_damage_t after insert or update of status on skis for each row execute function trg_ski_damage();

-- Eksisterende skader tælles med
insert into ski_damage(camp_id, ski_id, kind)
  select s.camp_id, s.id, s.status from skis s
  where s.status in ('skadet','mistet') and not exists(select 1 from ski_damage d where d.ski_id=s.id);

create or replace function shop_stats() returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare r jsonb;
begin
  if my_role() not in ('Skiforretning','Arrangør') then raise exception 'ingen adgang'; end if;
  with mine as (
    select s.* from skis s
    where s.camp_id = my_camp() and (my_role()='Arrangør' or s.shop_id = my_shop())
  ), per as (
    select m.id, m.brand, m.model,
      (select count(*) from loans l where l.ski_id=m.id) as loans,
      (select count(*) from ratings x where x.ski_id=m.id) as rc,
      (select coalesce(sum(x.stars),0) from ratings x where x.ski_id=m.id) as rs
    from mine m
  ), mod as (
    select brand, model, count(*)::int as skis, sum(loans)::int as loans, sum(rc)::int as ratings,
           case when sum(rc)>0 then round(sum(rs)::numeric/sum(rc),1) end as avg
    from per group by brand, model
  )
  select jsonb_build_object(
    'total_loans', coalesce((select sum(loans) from per),0),
    'rating_count', coalesce((select sum(rc) from per),0),
    'avg_stars', (select case when sum(rc)>0 then round(sum(rs)::numeric/sum(rc),1) end from per),
    'damaged', (select count(distinct d.ski_id) from ski_damage d where d.kind='skadet' and d.ski_id in (select id from mine)),
    'lost', (select count(distinct d.ski_id) from ski_damage d where d.kind='mistet' and d.ski_id in (select id from mine)),
    'skis', (select count(*) from mine),
    'models', coalesce((select jsonb_agg(to_jsonb(mod) order by loans desc, brand, model) from mod),'[]'::jsonb)
  ) into r;
  return r;
end $$;

revoke execute on function shop_stats from public, anon;
grant execute on function shop_stats to authenticated;
