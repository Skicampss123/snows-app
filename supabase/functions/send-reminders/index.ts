// Kører hvert minut (Supabase Cron). Sender:
//  - "Dit hold starter om cirka 15 minutter" til tilmeldte
//  - "Husk at aflevere ski" 30 minutter før butikkens afleveringstid til dem, der har ski ude
// Hemmeligheder: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return new Response("forbidden", { status: 403 });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT")!, Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);

  const out: { user: string; key: string; title: string; body: string }[] = [];
  const now = new Date();

  // 1) Hold der starter om 10–16 minutter
  const { data: ws } = await admin.from("workshops").select("id, title, meeting_point, starts_at")
    .eq("deleted", false).eq("kind", "Workshop")
    .gte("starts_at", new Date(now.getTime() + 10 * 60000).toISOString())
    .lt("starts_at", new Date(now.getTime() + 16 * 60000).toISOString());
  for (const w of ws ?? []) {
    const { data: en } = await admin.from("enrollments").select("user_id").eq("workshop_id", w.id).eq("no_show", false);
    for (const e of en ?? []) out.push({ user: e.user_id, key: `ws:${w.id}:${e.user_id}`, title: `${w.title} starter snart`, body: `Mød op: ${w.meeting_point ?? "se programmet"}` });
  }

  // 2) Aflevering af ski 30 minutter før butikkens tid
  const { data: shops } = await admin.from("shops").select("id, name, return_time, camp_id, camps(tz)").not("return_time", "is", null);
  for (const s of shops ?? []) {
    const tz = (s as any).camps?.tz ?? "Europe/Vienna";
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now).map((p) => [p.type, p.value]));
    const nowMin = (+parts.hour % 24) * 60 + +parts.minute;
    const [h, m] = String(s.return_time).split(":").map(Number);
    const diff = h * 60 + m - nowMin;
    if (diff > 30 || diff < 24) continue;                          // 24–30 minutter før
    const { data: sk } = await admin.from("skis").select("lent_to").eq("shop_id", s.id).eq("status", "ude").not("lent_to", "is", null);
    const day = `${parts.year}-${parts.month}-${parts.day}`;
    for (const k of sk ?? []) out.push({ user: k.lent_to, key: `ret:${s.id}:${day}:${k.lent_to}`, title: "Husk at aflevere ski", body: `${s.name} skal have skiene tilbage kl. ${String(s.return_time).slice(0, 5)}` });
  }

  let sent = 0;
  for (const o of out) {
    const { error } = await admin.from("push_sent").insert({ key: o.key });
    if (error) continue;                                            // sendt før
    const { data: subs } = await admin.from("push_subs").select("id, endpoint, p256dh, auth").eq("user_id", o.user);
    for (const s of subs ?? []) {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: o.title, body: o.body })); sent++; }
      catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) await admin.from("push_subs").delete().eq("id", s.id); }
    }
  }
  return new Response(JSON.stringify({ sent }), { headers: { "Content-Type": "application/json" } });
});
