# Tranne il Lunedì V27 — attivazione backend notifiche

Questa versione contiene codice reale per:

- notifica immediata all’amministratore per nuova prenotazione;
- notifica all’amministratore e al cliente quando l’appuntamento viene spostato;
- notifica all’amministratore e al cliente quando viene annullato;
- promemoria al cliente 24 ore e 1 ora prima;
- messaggi a tutti dall’Area Salone;
- coda, storico, tentativi e protezione dagli invii doppi.

## 1. Carica la V27 su GitHub

Sostituisci i file del repository con quelli contenuti in questa cartella e attendi il completamento del deploy GitHub Pages.

## 2. Esegui lo SQL

In Supabase apri **SQL Editor → New query**, incolla tutto il file:

`supabase-v27-backend-notifiche.sql`

poi premi **Run**. Lo script è compatibile anche se avevi già eseguito quello V26.

## 3. Copia la chiave OneSignal

In OneSignal apri la tua app e vai in **Settings → Keys & IDs**. Copia la **App API Key / REST API Key**. Non inserirla mai su GitHub.

L’App ID è già noto:

`6547826d-804c-4a15-aa8b-3b6627ec28c2`

## 4. Pubblica le Edge Functions

Metodo consigliato con Supabase CLI, dalla cartella del progetto:

```bash
supabase login
supabase link --project-ref ptsltidnlbnzlyvdtnbo
supabase secrets set ONESIGNAL_APP_ID=6547826d-804c-4a15-aa8b-3b6627ec28c2
supabase secrets set ONESIGNAL_REST_API_KEY=INCOLLA_QUI_LA_CHIAVE_PRIVATA
supabase secrets set CRON_SECRET=SCEGLI_UNA_PASSWORD_LUNGA_E_CASUALE
supabase functions deploy process-notifications --no-verify-jwt
supabase functions deploy send-broadcast --no-verify-jwt
```

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` vengono forniti automaticamente alle Edge Functions ospitate.

## 5. Crea il controllo automatico ogni minuto

In Supabase apri **Integrations → Cron → Create job** e configura:

- nome: `process-notifications-every-minute`
- frequenza: `* * * * *`
- tipo: HTTP request / Edge Function
- metodo: `POST`
- URL:
  `https://ptsltidnlbnzlyvdtnbo.supabase.co/functions/v1/process-notifications`
- header:
  `x-cron-secret: LA_STESSA_PASSWORD_DEL_PUNTO_4`
- body: `{}`

Se l’interfaccia Cron offre direttamente l’elenco delle Edge Functions, seleziona `process-notifications`, aggiungi lo stesso header e usa la frequenza ogni minuto.

## 6. Test rapido

1. Sul telefono dell’amministratore entra nell’app con l’account admin e lascia attive le notifiche. Il frontend associa quel dispositivo all’External ID ricavato dal telefono.
2. Da un altro account crea una prenotazione.
3. Per non aspettare il Cron, apri **Edge Functions → process-notifications → Test** e invia una richiesta POST con header `x-cron-secret`.
4. Deve arrivare la push “Nuova prenotazione”.
5. Sposta e poi annulla una prenotazione per provare gli altri eventi.
6. Nell’Area Salone usa “Invia una notifica ai clienti” per provare il broadcast.

## Controllo errori

In **Table Editor → notification_jobs**:

- `pending`: attende l’orario o il prossimo giro;
- `processing`: in lavorazione;
- `sent`: inviata;
- `failed`: fallita dopo 5 tentativi;
- `cancelled`: promemoria non più valido.

La colonna `last_error` mostra l’errore completo. Se la push admin non arriva, verifica che il record admin in `customers` abbia `is_admin = true`, un telefono valido e che sullo stesso telefono sia stato eseguito l’accesso nell’app dopo l’attivazione delle notifiche.

## Sicurezza

La REST API Key di OneSignal resta soltanto nei **Secrets** di Supabase. Il broadcast verifica sul backend che `access_token` appartenga davvero a un amministratore. La tabella della coda non è accessibile dal sito pubblico.
