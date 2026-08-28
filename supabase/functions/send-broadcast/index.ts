import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);

  try {
    const body = await req.json();
    const accessToken = String(body.access_token ?? "");
    const title = String(body.title ?? "").trim().slice(0, 60);
    const message = String(body.message ?? "").trim().slice(0, 180);
    const targetUrl = String(body.url ?? "https://tranneillunedi.github.io/Tranne-Il-Lunedi/");

    if (!accessToken || title.length < 3 || message.length < 3) {
      return json({ error: "Titolo, messaggio o accesso mancanti" }, 400);
    }

    const appId = Deno.env.get("ONESIGNAL_APP_ID");
    const apiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
    if (!appId || !apiKey) throw new Error("Segreti OneSignal mancanti");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: admin, error: adminError } = await supabase
      .from("customers")
      .select("id")
      .eq("access_token", accessToken)
      .eq("is_admin", true)
      .maybeSingle();
    if (adminError) throw adminError;
    if (!admin) return json({ error: "Accesso amministratore non autorizzato" }, 403);

    const response = await fetch("https://api.onesignal.com/notifications?c=push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Key ${apiKey}`,
      },
      body: JSON.stringify({
        app_id: appId,
        target_channel: "push",
        included_segments: ["Subscribed Users"],
        headings: { it: title, en: title },
        contents: { it: message, en: message },
        url: targetUrl,
        data: { kind: "broadcast" },
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`OneSignal ${response.status}: ${JSON.stringify(result)}`);

    // Salva anche lo storico, senza bloccare l'invio in caso di errore di log.
    await supabase.from("notification_jobs").insert({
      kind: "broadcast",
      recipient_type: "all",
      title,
      message,
      scheduled_for: new Date().toISOString(),
      status: "sent",
      attempts: 1,
      sent_at: new Date().toISOString(),
      provider_message_id: result.id ?? null,
      dedupe_key: `broadcast-${crypto.randomUUID()}`,
    });

    return json({ ok: true, id: result.id ?? null, recipients: result.recipients ?? 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    return json({ error: message }, 500);
  }
});
