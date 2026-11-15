# Push-beskeder (Edge Functions)

1. Supabase → Edge Functions → *Deploy a new function* → navn `send-push` → indsæt indholdet af `send-push/index.ts` → Deploy.
2. Samme for `send-reminders` (indsæt `send-reminders/index.ts`).
3. Edge Functions → Secrets (Manage secrets), tilføj:
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (fra filen vapid.txt)
   - `CRON_SECRET` (find selv på en lang tilfældig tekst)
4. `send-reminders`: slå "Verify JWT" fra, eller send anon-nøglen som Bearer.
5. Supabase → Integrations → Cron → ny job hver minut: *Supabase Edge Function* `send-reminders`, med header `x-cron-secret: <CRON_SECRET>`.
