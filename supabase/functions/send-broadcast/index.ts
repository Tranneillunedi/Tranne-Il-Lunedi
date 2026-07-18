import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Metodo non consentito" }), { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const accessToken = String(body.access_token ?? "").trim();
    const title = String(body.title ?? "").trim();
    const message = String(body.message ?? "").trim();
    const url = String(body.url ?? Deno.env.get("SITE_URL") ?? "https://tranneillunedi.github.io/Tranne-Il-Lunedi/");

    if (!accessToken || title.length < 3 || message.length < 3) {
      return new Response(JSON.stringify({ error: "Titolo, messaggio o accesso mancanti" }), { status: 400, headers: corsHeaders });
    }
    if (title.length > 60 || message.length > 180) {
      return new Response(JSON.stringify({ error: "Titolo o messaggio troppo lunghi" }), { status: 400, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const appId = Deno.env.get("ONESIGNAL_APP_ID");
    const apiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
    if (!supabaseUrl || !serviceRoleKey || !appId || !apiKey) throw new Error("Segreti backend mancanti");

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: admin, error: adminError } = await supabase
      .from("customers")
      .select("id")
      .eq("access_token", accessToken)
      .eq("is_admin", true)
      .maybeSingle();

    if (adminError || !admin) {
      return new Response(JSON.stringify({ error: "Accesso amministratore non autorizzato" }), { status: 403, headers: corsHeaders });
    }

    const idempotencyKey = crypto.randomUUID();
    const response = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Key ${apiKey}`,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        app_id: appId,
        target_channel: "push",
        included_segments: ["Subscribed Users"],
        headings: { it: title, en: title },
        contents: { it: message, en: message },
        url,
        data: { kind: "broadcast" },
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`OneSignal ${response.status}: ${JSON.stringify(result)}`);

    await supabase.from("notification_jobs").insert({
      kind: "broadcast",
      recipient_type: "all",
      title,
      message,
      scheduled_for: new Date().toISOString(),
      status: "sent",
      sent_at: new Date().toISOString(),
      provider_message_id: result.id ?? null,
      dedupe_key: `broadcast-${idempotencyKey}`,
    });

    return new Response(JSON.stringify({
      ok: true,
      id: result.id ?? null,
      recipients: result.recipients ?? 0,
    }), { headers: corsHeaders });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: String(error instanceof Error ? error.message : error) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
