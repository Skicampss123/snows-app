-- Udlån, aflevering og stjerner gemmes i databasen, så alle roller ser det samme.
-- Kør efter 001-006. Kan køres igen.

alter table skis add column if not exists handed_in_at timestamptz;   -- deltageren har sagt "jeg afleverer"

-- Lån en ski (deltager). Kun én ad gangen.
create or replace function lend_ski(p_code text) returns skis
language plpgsql security definer set search_path=public as $$
declare s skis;
begin
  if not exists(select 1 from profiles where id = auth.uid() and role = 'Deltager') then
    raise exception 'Kun en deltager kan låne ski.'; end if;
  select * into s from skis where camp_id=my_camp() and upper(code)=upper(trim(p_code)) for update;
  if not found then raise exception 'Vi kan ikke finde en ski med det ID. Tjek ID''et under QR-koden.'; end if;
  if exists(select 1 from skis where lent_to=auth.uid() and status='ude') then
    raise exception 'Aflever først dine nuværende ski.'; end if;
  if s.status='ude' then raise exception 'Den ski er allerede udlånt.'; end if;
  if s.status<>'inde' then raise exception 'Den ski kan ikke lånes ud lige nu. Spørg butikken.'; end if;
  update skis set status='ude', lent_to=auth.uid(), lent_at=now(), handed_in_at=null where id=s.id returning * into s;
  insert into loans(camp_id,ski_id,user_id) values (s.camp_id,s.id,auth.uid());
  return s;
end $$;

-- Deltageren melder "jeg afleverer"
create or replace function hand_in(p_ski uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  update skis set handed_in_at = now()
   where id=p_ski and lent_to=auth.uid() and status='ude' and camp_id=my_camp();
  if not found then raise exception 'Den ski er ikke lånt af dig.'; end if;
end $$;

-- Butikken (eller arrangøren) bekræfter, at skien er tilbage
create or replace function return_ski(p_ski uuid) returns void
language plpgsql security definer set search_path=public as $$
declare s skis;
begin
  select * into s from skis where id=p_ski and camp_id=my_camp() for update;
  if not found or my_role() not in ('Skiforretning','Arrangør')
     or (my_role()='Skiforretning' and s.shop_id is distinct from my_shop()) then raise exception 'ingen adgang'; end if;
  update skis set status = case when status='ude' then 'inde' else status end, lent_to=null, lent_at=null, handed_in_at=null where id=p_ski;
  update loans set back_at=now() where ski_id=p_ski and back_at is null;
end $$;

-- Stjerner: kun for ski man selv har lånt
create or replace function rate_ski(p_ski uuid, p_stars int, p_comment text default null) returns void
language plpgsql security definer set search_path=public as $$
begin
  if p_stars not between 1 and 5 then raise exception 'Stjerner skal være fra 1 til 5.'; end if;
  if not exists(select 1 from loans l where l.ski_id=p_ski and l.user_id=auth.uid()) then
    raise exception 'Du kan kun give stjerner til ski, du har lånt.'; end if;
  insert into ratings(ski_id,user_id,stars,comment) values (p_ski,auth.uid(),p_stars,p_comment)
  on conflict (ski_id,user_id) do update set stars=excluded.stars, comment=excluded.comment, created_at=now();
end $$;

-- Hvem har skien (kun butikkens egne ski; arrangøren ser alle)
create or replace function ski_borrowers() returns table(ski_id uuid, name text)
language sql stable security definer set search_path=public as $$
  select s.id, p.name from skis s join profiles p on p.id=s.lent_to
  where s.camp_id=my_camp() and s.status='ude'
    and (my_role()='Arrangør' or (my_role()='Skiforretning' and s.shop_id=my_shop())) $$;

revoke execute on function lend_ski, hand_in, return_ski, rate_ski, ski_borrowers from public, anon;
grant execute on function lend_ski, hand_in, return_ski, rate_ski, ski_borrowers to authenticated;

-- Standardniveauer: Begynder, Let øvet, Øvet, Pro (Alle er altid med).
-- Rydder op i camps, der blev oprettet med de gamle navne. "Erfaren" slettes kun hvis ingen bruger det.
update levels l set name='Begynder' where name='Nybegynder'
  and not exists(select 1 from levels x where x.camp_id=l.camp_id and x.name='Begynder');
update skis set level=replace(level,'Nybegynder','Begynder') where level like '%Nybegynder%';
update workshops set level=replace(level,'Nybegynder','Begynder') where level like '%Nybegynder%';
delete from levels l where name='Erfaren'
  and not exists(select 1 from skis s where s.camp_id=l.camp_id and s.level like '%Erfaren%')
  and not exists(select 1 from workshops w where w.camp_id=l.camp_id and w.level like '%Erfaren%');
