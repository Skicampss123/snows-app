-- Indhold arrangør/butik/instruktør indtaster: program, nyheder, hold, ski m.m.
-- Kør i SQL Editor efter 001, 002 og 003. Kan køres igen.

alter table program_items add column if not exists time_to time;
alter table news add column if not exists label text;

-- Hold bruger ugedag + starttid (ingen datoer endnu)
alter table workshops alter column starts_at drop not null;
alter table workshops add column if not exists day text check (day in ('Man','Tirs','Ons','Tors','Fre','Lør','Søn'));
alter table workshops add column if not exists start_time time;
alter table workshops add column if not exists instructor_name text;
alter table workshops add column if not exists instructor_email text;
alter table workshops add column if not exists group_code text;
alter table workshops add column if not exists meeting_point text;

create or replace function my_email() returns text language sql stable security definer set search_path=public as
$$ select email from profiles where id = auth.uid() $$;

-- Instruktører må oprette og rette deres egne hold
drop policy if exists ws_instr on workshops;
create policy ws_instr on workshops for all
  using (camp_id = my_camp() and my_role()='Instruktør' and instructor_email = my_email())
  with check (camp_id = my_camp() and my_role()='Instruktør' and instructor_email = my_email());

-- Unikke ski-numre i hele campen (hver butik reserverer en blok)
create table if not exists camp_counters(camp_id uuid primary key references camps on delete cascade, ski_next int not null default 1);
alter table camp_counters enable row level security;
create or replace function allocate_ski_codes(p_n int) returns int
language plpgsql security definer set search_path=public as $$
declare v_start int;
begin
  if my_role() not in ('Skiforretning','Arrangør') then raise exception 'ingen adgang'; end if;
  if p_n < 1 or p_n > 1000 then raise exception 'ugyldigt antal'; end if;
  insert into camp_counters(camp_id, ski_next) values (my_camp(), 1) on conflict do nothing;
  update camp_counters set ski_next = ski_next + p_n where camp_id = my_camp() returning ski_next - p_n into v_start;
  return v_start;
end $$;
revoke execute on function allocate_ski_codes, my_email from public, anon;
grant execute on function allocate_ski_codes, my_email to authenticated;
