# Supabase-opsætning

Projekt: https://ydodczdzuffydnmnxupi.supabase.co (EU-region)
Offentlig nøgle (må ligge i appen): `sb_publishable_BmFLXIf0FV3AmHp_nWucLg_owNzIcpa`
Secret key må **aldrig** ligge i appen eller i dette repo.

## 1. Database
Supabase → SQL Editor → New query → indsæt hele `001_schema.sql` → Run.
Filen kan køres igen uden at miste data.

## 2. Login med e-mailkode
Authentication → Providers → Email: slå "Confirm email" til, og brug kode i stedet for link.
Authentication → Emails → Magic Link-skabelonen: skriv `{{ .Token }}` (6 cifre) i teksten.
Authentication → Settings: OTP expiry = 600 sekunder, OTP length = 6.

## 2b. Platform (dig)
Kør `002_platform.sql`, og tilføj din egen login-e-mail (små bogstaver):
```sql
insert into platform_admins(email) values ('din@mail.dk');
```
Herefter opretter du camps og inviterer arrangører inde fra appen (Platform-fanen).

## 3. Første camp (kan også gøres fra appen) (kør i SQL Editor)
```sql
insert into camps(name, code, end_date) values ('Snow’s Sölden 2026', 'SNOW26', '2027-03-31');
insert into invites(camp_id, email, role, name)
select id, 'linmig63@gmail.com', 'Arrangør', 'Arrangør' from camps where code='SNOW26';
```
Arrangøren logger så ind med sin e-mail og opretter selv butikker, instruktører og hold.

## 4. Automatisk sletning 90 dage efter camp
Database → Extensions → slå `pg_cron` til, og kør:
`select cron.schedule('purge-camps','0 3 * * *','select purge_old_camps()');`
