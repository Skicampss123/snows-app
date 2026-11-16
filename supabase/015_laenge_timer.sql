-- Butikken vælger selv, hvornår udstyr markeres som "længe ude" (standard 8 timer). Kør efter 014. Kan køres igen.
alter table shops add column if not exists long_hours int not null default 8 check (long_hours between 1 and 72);
