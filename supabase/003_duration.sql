-- Korte programpunkter: varighed fra 5 minutter (fx 9:00-9:20).
-- Kør i SQL Editor, hvis du allerede har kørt 001_schema.sql.
alter table workshops drop constraint if exists workshops_duration_min_check;
alter table workshops add constraint workshops_duration_min_check check (duration_min between 5 and 600);
