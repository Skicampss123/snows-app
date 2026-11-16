// Sender en push-besked til alle i arrangørens camp, eller kun til de brugere, der er nævnt i user_ids. Kun arrangøren må kalde den.
// Hemmeligheder (Edge Functions → Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const who = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: { user } } = await who.auth.getUser();
    if (!user) return json({ error: "Log ind først." }, 401);
    const admin = createClient(url, service);
    const { data: p } = await admin.from("profiles").select("camp_id, role").eq("id", user.id).maybeSingle();
    if (!p || p.role !== "Arrangør") return json({ error: "Kun arrangøren kan sende beskeder." }, 403);
    const { title, body, user_ids } = await req.json();
    if (!title || String(title).length > 120) return json({ error: "Skriv en overskrift." }, 400);
    webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT")!, Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);
    let q = admin.from("push_subs").select("id, endpoint, p256dh, auth").eq("camp_id", p.camp_id);
    if (Array.isArray(user_ids)) q = q.in("user_id", user_ids.slice(0, 2000).map(String));
    const { data: subs } = await q;
    let sent = 0; const dead: number[] = [];
    await Promise.all((subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title, body: body ?? "" }));
        sent++;
      } catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) dead.push(s.id); }
    }));
    if (dead.length) await admin.from("push_subs").delete().in("id", dead);
    return json({ sent });
  } catch (e) { return json({ error: String(e) }, 500); }
});
