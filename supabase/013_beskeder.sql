-- Besked til en gruppe: hele campen, et hold, alle med udstyr ude, eller en butiks lånere.
-- Kør efter 001-012. Kan køres igen.
create table if not exists messages(
  id uuid primary key default gen_random_uuid(),
  camp_id uuid not null references camps on delete cascade,
  title text not null,
  body text,
  audience text not null,
  label text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create table if not exists message_recipients(
  message_id uuid not null references messages on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  primary key (message_id, user_id)
);
create index if not exists message_recipients_user on message_recipients(user_id);
alter table messages enable row level security;
alter table message_recipients enable row level security;   -- kun via funktionerne

-- Arrangøren sender. Returnerer antal og modtagernes id (bruges til push).
create or replace function send_group_message(p_title text, p_body text, p_audience text, p_ref uuid default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare mid uuid; ids uuid[]; lbl text;
begin
  if my_role() <> 'Arrangør' then raise exception 'Kun arrangøren kan sende beskeder.'; end if;
  if length(trim(coalesce(p_title,''))) < 1 or length(p_title) > 120 then raise exception 'Skriv en overskrift (højst 120 tegn).'; end if;
  if length(coalesce(p_body,'')) > 1000 then raise exception 'Beskeden er for lang (højst 1000 tegn).'; end if;
  if p_audience = 'all' then
    select array_agg(id) into ids from profiles where camp_id = my_camp() and role = 'Deltager'; lbl := 'Alle deltagere';
  elsif p_audience = 'ws' then
    select array_agg(distinct e.user_id) into ids from enrollments e join workshops w on w.id = e.workshop_id
      where w.id = p_ref and w.camp_id = my_camp() and not e.no_show;
    select 'Holdet ' || title into lbl from workshops where id = p_ref and camp_id = my_camp();
  elsif p_audience = 'out' then
    select array_agg(distinct lent_to) into ids from skis where camp_id = my_camp() and status = 'ude' and lent_to is not null; lbl := 'Alle med udstyr ude';
  elsif p_audience = 'shop' then
    select array_agg(distinct lent_to) into ids from skis where camp_id = my_camp() and status = 'ude' and lent_to is not null and shop_id = p_ref;
    select 'Lånere hos ' || name into lbl from shops where id = p_ref and camp_id = my_camp();
  else raise exception 'Ukendt modtagergruppe.'; end if;
  if ids is null or cardinality(ids) = 0 then raise exception 'Ingen modtagere i den gruppe lige nu.'; end if;
  insert into messages(camp_id, title, body, audience, label, created_by) values (my_camp(), trim(p_title), nullif(trim(coalesce(p_body,'')),''), p_audience, lbl, auth.uid()) returning id into mid;
  insert into message_recipients(message_id, user_id) select mid, u from unnest(ids) u on conflict do nothing;
  perform log_event(my_camp(), 'gruppebesked', jsonb_build_object('audience', p_audience, 'count', cardinality(ids)));
  return jsonb_build_object('id', mid, 'count', cardinality(ids), 'label', lbl, 'user_ids', to_jsonb(ids));
end $$;

-- Modtageren læser sine egne beskeder
create or replace function my_messages() returns table(id uuid, title text, body text, created_at timestamptz)
language sql stable security definer set search_path=public as $$
  select m.id, m.title, m.body, m.created_at from messages m join message_recipients r on r.message_id = m.id
  where r.user_id = auth.uid() order by m.created_at desc limit 30 $$;

-- Arrangøren ser, hvad der er sendt
create or replace function sent_messages() returns table(id uuid, title text, label text, recipients bigint, created_at timestamptz)
language sql stable security definer set search_path=public as $$
  select m.id, m.title, m.label, (select count(*) from message_recipients r where r.message_id = m.id), m.created_at
  from messages m where m.camp_id = my_camp() and my_role() = 'Arrangør' order by m.created_at desc limit 30 $$;

revoke execute on function send_group_message, my_messages, sent_messages from public, anon;
grant execute on function send_group_message, my_messages, sent_messages to authenticated;
