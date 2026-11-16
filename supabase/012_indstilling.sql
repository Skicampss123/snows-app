-- Butikken ser støvlestørrelse og Z-værdi på den, der har lånt udstyret, så bindingen kan indstilles.
-- Kør efter 001-011. Kan køres igen.
drop function if exists ski_borrowers();
create or replace function ski_borrowers() returns table(ski_id uuid, name text, boot_mm int, z_value numeric)
language sql stable security definer set search_path=public as $$
  select s.id, p.name, p.boot_mm, p.z_value from skis s join profiles p on p.id=s.lent_to
  where s.camp_id=my_camp() and s.status='ude'
    and (my_role()='Arrangør' or (my_role()='Skiforretning' and s.shop_id=my_shop())) $$;
revoke execute on function ski_borrowers from public, anon;
grant execute on function ski_borrowers to authenticated;
