import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Content-Type": "application/json",
};

const APP_ID = Deno.env.get("ONESIGNAL_APP_ID") ?? "";
const API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY") ?? "";
const SITE_URL = "https://tranneillunedi.github.io/Tranne-Il-Lunedi/";

type Job = {
  id: number;
  kind: string;
  booking_id: string | null;
  recipient_type: "admin" | "customer" | "all";
  recipient_external_id: string | null;
  title: string;
  message: string;
  attempts: number;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

async function sendPush(payload: Record<string, unknown>, idempotencyKey: string) {
  const response = await fetch("https://api.onesignal.com/notifications?c=push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Key ${API_KEY}`,
    },
    body: JSON.stringify({
      app_id: APP_ID,
      target_channel: "push",
      url: SITE_URL,
      idempotency_key: idempotencyKey,
      ...payload,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`OneSignal ${response.status}: ${JSON.stringify(body)}`);
  return body as { id?: string; recipients?: number };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") return json({ error: "Metodo non consentito" }, 405);

  try {
    if (!APP_ID || !API_KEY) throw new Error("Segreti OneSignal mancanti");

    const expected = Deno.env.get("CRON_SECRET");
    if (expected && req.headers.get("x-cron-secret") !== expected) {
      return json({ error: "Non autorizzato" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data, error } = await supabase.rpc("claim_notification_jobs", { p_limit: 50 });
    if (error) throw error;
    const jobs = (data ?? []) as Job[];

    const { data: adminRows, error: adminError } = await supabase
      .from("customers")
      .select("phone")
      .eq("is_admin", true);
    if (adminError) throw adminError;
    const adminIds = (adminRows ?? [])
      .map((a: { phone: string | null }) => `cliente_${String(a.phone ?? "").replace(/\D/g, "")}`)
      .filter((id: string) => id.length >= 16);

    let sent = 0;
    let failed = 0;
    const errors: Array<{ id: number; error: string }> = [];

    for (const job of jobs) {
      try {
        let target: Record<string, unknown>;
        if (job.recipient_type === "all") {
          target = { included_segments: ["Subscribed Users"] };
        } else if (job.recipient_type === "admin") {
          if (!adminIds.length) throw new Error("Nessun amministratore con telefono valido");
          target = { include_aliases: { external_id: adminIds } };
        } else {
          if (!job.recipient_external_id) throw new Error("External ID cliente assente");
          target = { include_aliases: { external_id: [job.recipient_external_id] } };
        }

        const result = await sendPush({
          ...target,
          headings: { it: job.title, en: job.title },
          contents: { it: job.message, en: job.message },
          data: { booking_id: job.booking_id, kind: job.kind },
        }, `notification-job-${job.id}`);

        const { error: updateError } = await supabase.from("notification_jobs").update({
          status: "sent",
          sent_at: new Date().toISOString(),
          provider_message_id: result.id ?? null,
          last_error: null,
          locked_at: null,
          updated_at: new Date().toISOString(),
        }).eq("id", job.id);
        if (updateError) throw updateError;
        sent++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const terminal = Number(job.attempts ?? 1) >= 5;
        await supabase.from("notification_jobs").update({
          status: terminal ? "failed" : "pending",
          last_error: message.slice(0, 1000),
          locked_at: null,
          scheduled_for: terminal ? undefined : new Date(Date.now() + 60_000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", job.id);
        errors.push({ id: job.id, error: message });
        failed++;
      }
    }

    return json({ ok: true, claimed: jobs.length, sent, failed, errors });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    return json({ error: message }, 500);
  }
});
