-- Instruktører kan modtage gruppebeskeder (modtagergruppen 'Alle instruktører'). Kør efter 013. Kan køres igen.
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
  elsif p_audience = 'instr' then
    select array_agg(id) into ids from profiles where camp_id = my_camp() and role = 'Instruktør'; lbl := 'Alle instruktører';
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

revoke execute on function send_group_message(text,text,text,uuid) from public, anon;
grant execute on function send_group_message(text,text,text,uuid) to authenticated;
