-- Top 5 pr. kategori på tværs af butikker: mest lånte og højest bedømte.
-- Kør efter 001-010. Kan køres igen.
create or replace function leaderboard(p_min int default 3) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare res jsonb;
begin
  if my_role() not in ('Skiforretning','Arrangør') then raise exception 'ingen adgang'; end if;
  with per as (
    select s.kind, sh.name as shop, s.brand, s.model,
      count(distinct s.id) as items,
      (select count(*) from loans l join skis x on x.id=l.ski_id where x.camp_id=s.camp_id and x.shop_id=s.shop_id and x.brand=s.brand and x.model=s.model and x.kind=s.kind) as loans,
      (select count(*) from ratings r join skis x on x.id=r.ski_id where x.camp_id=s.camp_id and x.shop_id=s.shop_id and x.brand=s.brand and x.model=s.model and x.kind=s.kind) as rc,
      (select coalesce(sum(r.stars),0) from ratings r join skis x on x.id=r.ski_id where x.camp_id=s.camp_id and x.shop_id=s.shop_id and x.brand=s.brand and x.model=s.model and x.kind=s.kind) as rs
    from skis s join shops sh on sh.id=s.shop_id
    where s.camp_id=my_camp()
    group by s.camp_id, s.kind, sh.name, s.shop_id, s.brand, s.model
  ), ranked as (
    select *, case when rc>0 then round(rs::numeric/rc,2) end as avg,
      row_number() over (partition by kind order by loans desc, brand, model) as rl,
      case when rc>=greatest(p_min,1) then row_number() over (partition by kind, (rc>=greatest(p_min,1)) order by rs::numeric/nullif(rc,0) desc, rc desc, brand, model) end as rr
    from per
  )
  select coalesce(jsonb_agg(k order by k->>'kind'),'[]'::jsonb) into res from (
    select jsonb_build_object('kind', kind,
      'loans', coalesce((select jsonb_agg(jsonb_build_object('shop',r.shop,'brand',r.brand,'model',r.model,'loans',r.loans,'avg',r.avg,'ratings',r.rc) order by r.rl) from ranked r where r.kind=g.kind and r.rl<=5 and r.loans>0),'[]'::jsonb),
      'rated', coalesce((select jsonb_agg(jsonb_build_object('shop',r.shop,'brand',r.brand,'model',r.model,'loans',r.loans,'avg',r.avg,'ratings',r.rc) order by r.rr) from ranked r where r.kind=g.kind and r.rr<=5),'[]'::jsonb)) as k
    from (select distinct kind from per) g) t;
  return jsonb_build_object('min', greatest(p_min,1), 'mine', my_shop_name(), 'kinds', res);
end $$;

create or replace function my_shop_name() returns text language sql stable security definer set search_path=public as $$
  select name from shops where id = my_shop() $$;

revoke execute on function leaderboard, my_shop_name from public, anon;
grant execute on function leaderboard, my_shop_name to authenticated;
