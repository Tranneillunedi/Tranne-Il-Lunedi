import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Content-Type": "application/json",
};

const APP_ID = Deno.env.get("ONESIGNAL_APP_ID") ?? "";
const API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://tranneillunedi.github.io/Tranne-Il-Lunedi/";

type NotificationJob = {
  id: number;
  kind: string;
  booking_id: string | null;
  recipient_type: "admin" | "customer" | "all";
  recipient_external_id: string | null;
  title: string;
  message: string;
  attempts: number;
  dedupe_key: string;
};

async function sendPush(payload: Record<string, unknown>, idempotencyKey: string) {
  if (!APP_ID || !API_KEY) throw new Error("Segreti OneSignal mancanti");

  const response = await fetch("https://api.onesignal.com/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Key ${API_KEY}`,
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      app_id: APP_ID,
      target_channel: "push",
      url: SITE_URL,
      ...payload,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`OneSignal ${response.status}: ${JSON.stringify(body)}`);
  }
  return body as { id?: string; recipients?: number };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Metodo non consentito" }), { status: 405, headers: corsHeaders });
  }

  try {
    const expectedCronSecret = Deno.env.get("CRON_SECRET");
    if (expectedCronSecret && req.headers.get("x-cron-secret") !== expectedCronSecret) {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Segreti Supabase mancanti");

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.rpc("claim_notification_jobs", { p_limit: 50 });
    if (error) throw error;
    const jobs = (data ?? []) as NotificationJob[];

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    let adminIds: string[] | null = null;
    for (const job of jobs) {
      try {
        let target: Record<string, unknown>;

        if (job.recipient_type === "all") {
          target = { included_segments: ["Subscribed Users"] };
        } else if (job.recipient_type === "admin") {
          if (adminIds === null) {
            const { data: admins, error: adminError } = await supabase
              .from("customers")
              .select("phone")
              .eq("is_admin", true);
            if (adminError) throw adminError;
            adminIds = (admins ?? [])
              .map((admin: { phone: string | null }) => String(admin.phone ?? "").replace(/\D/g, ""))
              .filter((phone: string) => phone.length >= 8)
              .map((phone: string) => `cliente_${phone}`);
          }
          if (!adminIds.length) throw new Error("Nessun amministratore con numero valido");
          target = { include_aliases: { external_id: adminIds } };
        } else {
          if (!job.recipient_external_id) {
            skipped++;
            await supabase.from("notification_jobs").update({
              status: "failed",
              attempts: Number(job.attempts || 0) + 1,
              claimed_at: null,
              last_error: "External ID cliente assente",
            }).eq("id", job.id);
            continue;
          }
          target = { include_aliases: { external_id: [job.recipient_external_id] } };
        }

        const result = await sendPush({
          ...target,
          headings: { it: job.title, en: job.title },
          contents: { it: job.message, en: job.message },
          data: { booking_id: job.booking_id, kind: job.kind },
        }, job.dedupe_key);

        const { error: updateError } = await supabase.from("notification_jobs").update({
          status: "sent",
          sent_at: new Date().toISOString(),
          provider_message_id: result.id ?? null,
          claimed_at: null,
          last_error: null,
        }).eq("id", job.id);
        if (updateError) throw updateError;
        sent++;
      } catch (error) {
        const attempts = Number(job.attempts || 0) + 1;
        await supabase.from("notification_jobs").update({
          status: attempts >= 5 ? "failed" : "pending",
          attempts,
          claimed_at: null,
          scheduled_for: attempts >= 5 ? undefined : new Date(Date.now() + Math.min(attempts * 60_000, 5 * 60_000)).toISOString(),
          last_error: String(error instanceof Error ? error.message : error).slice(0, 1500),
        }).eq("id", job.id);
        failed++;
      }
    }

    return new Response(JSON.stringify({ ok: true, claimed: jobs.length, sent, failed, skipped }), { headers: corsHeaders });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: String(error instanceof Error ? error.message : error) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
