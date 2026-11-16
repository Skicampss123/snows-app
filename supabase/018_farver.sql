-- Arrangøren vælger campens farver: hovedfarve (color) og topfarve (color2). NULL = standardfarverne. Kør efter 017. Kan køres igen.
alter table camps alter column color drop default;
update camps set color=null where color='#0b5cff';
alter table camps add column if not exists color2 text;
alter table camps drop constraint if exists camps_color_hex, drop constraint if exists camps_color2_hex;
alter table camps add constraint camps_color_hex check (color is null or color ~ '^#[0-9a-fA-F]{6}$');
alter table camps add constraint camps_color2_hex check (color2 is null or color2 ~ '^#[0-9a-fA-F]{6}$');
grant select (color2), update (color2) on camps to authenticated;
