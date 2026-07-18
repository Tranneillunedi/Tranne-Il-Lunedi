# V26 — NOTIFICHE AUTOMATICHE

Questa versione aggiunge:
- notifica immediata all’amministratore per nuova prenotazione e spostamento;
- promemoria cliente 24 ore e 1 ora prima;
- avviso cliente quando l’orario cambia o viene annullato;
- pannello amministratore “Messaggio a tutti”.

## ATTIVAZIONE (necessaria una sola volta)

### 1. Database
Supabase → SQL Editor → New query → incolla tutto `supabase-v26-notifiche.sql` → Run.

### 2. Edge Functions
Installa Supabase CLI e, dalla cartella del progetto, esegui:

```bash
supabase login
supabase link --project-ref ptsltidnlbnzlyvdtnbo
supabase functions deploy process-notifications --no-verify-jwt
supabase functions deploy send-broadcast --no-verify-jwt
```

### 3. Segreti (NON inserirli nei file GitHub)
OneSignal → Settings → Keys & IDs → copia la REST API Key. Poi:

```bash
supabase secrets set ONESIGNAL_APP_ID=6547826d-804c-4a15-aa8b-3b6627ec28c2
supabase secrets set ONESIGNAL_REST_API_KEY=INCOLLA_LA_REST_API_KEY
supabase secrets set CRON_SECRET=SCEGLI_UNA_PASSWORD_LUNGA
```

### 4. Cron ogni minuto
Supabase → Integrations → Cron → Create job → HTTP Request:
- Metodo: POST
- URL: `https://ptsltidnlbnzlyvdtnbo.supabase.co/functions/v1/process-notifications`
- Schedule: `* * * * *`
- Header: `x-cron-secret` = la stessa password scelta sopra

## Verifica
1. L’amministratore deve accedere nell’app e avere le notifiche attive: OneSignal gli assegna `external_id` e tag `role=admin`.
2. Fai una prenotazione di prova: entro circa 1 minuto arriva la notifica all’amministratore.
3. Nell’Area Salone prova “Messaggio a tutti”.

La REST API Key OneSignal resta solo nei segreti Supabase; non pubblicarla mai su GitHub.
