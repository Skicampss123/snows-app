-- Hærdning 2: ingen kan forfalske revisionslog eller udløse oprydning udefra, fast search_path, flere indeks. Kør efter 015. Kan køres igen.
revoke execute on function public.log_event(uuid,text,jsonb) from public, anon, authenticated;
revoke execute on function public.purge_old_camps() from public, anon, authenticated;
alter function public.dow_of set search_path=public;
alter function public.camp_day_date set search_path=public;
alter function public.trg_ws_starts set search_path=public;
alter function public.trg_camp_start set search_path=public;
create index if not exists audit_log_camp_idx on audit_log(camp_id);
create index if not exists client_errors_camp_idx on client_errors(camp_id);
create index if not exists favorites_ski_idx on favorites(ski_id);
create index if not exists invites_shop_idx on invites(shop_id);
create index if not exists program_items_camp_idx on program_items(camp_id);
create index if not exists ski_damage_camp_idx on ski_damage(camp_id);
create index if not exists ski_damage_ski_idx on ski_damage(ski_id);
create index if not exists support_sessions_camp_idx on support_sessions(camp_id);
create index if not exists support_sessions_shop_idx on support_sessions(shop_id);
