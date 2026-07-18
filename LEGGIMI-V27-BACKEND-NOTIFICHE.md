# Tranne il Lunedì — V27 backend notifiche

Questa versione contiene il backend reale per:

- notifica all'amministratore alla nuova prenotazione;
- notifica all'amministratore e al cliente quando l'orario cambia;
- notifica all'amministratore e al cliente quando l'appuntamento viene annullato;
- promemoria al cliente 24 ore prima;
- promemoria al cliente 1 ora prima;
- invio di comunicazioni a tutti dall'Area Salone;
- coda, log, retry e protezione dai doppi invii.

## 1. Database

Apri **Supabase → SQL Editor → New query**, copia tutto il file:

`supabase-v27-backend-notifiche.sql`

e premi **Run**. Non eseguire il vecchio `supabase-v26-notifiche.sql`.

## 2. Segreti delle Edge Functions

Apri **Supabase → Edge Functions → Secrets** e aggiungi:

- `ONESIGNAL_APP_ID` = `6547826d-804c-4a15-aa8b-3b6627ec28c2`
- `ONESIGNAL_REST_API_KEY` = la REST API Key presa da OneSignal → Settings → Keys & IDs
- `CRON_SECRET` = una password lunga scelta da te, per esempio almeno 32 caratteri casuali
- `SITE_URL` = `https://tranneillunedi.github.io/Tranne-Il-Lunedi/`

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` sono normalmente disponibili automaticamente nelle Edge Functions ospitate da Supabase.

**Non mettere mai la REST API Key di OneSignal su GitHub o in `supabase-config.js`.**

## 3. Pubblicare le funzioni

Metodo CLI, dalla cartella del progetto:

```bash
supabase login
supabase link --project-ref IL_TUO_PROJECT_REF
supabase functions deploy process-notifications --no-verify-jwt
supabase functions deploy send-broadcast --no-verify-jwt
```

Il `project-ref` è la parte iniziale dell'indirizzo Supabase, prima di `.supabase.co`.

## 4. Creare il Cron

Nel pannello Supabase apri **Integrations → Cron → Create job**:

- Nome: `process-notifications-every-minute`
- Frequenza: `* * * * *`
- Tipo: **Supabase Edge Function**
- Funzione: `process-notifications`
- Metodo: `POST`
- Header: `x-cron-secret` con lo stesso valore di `CRON_SECRET`
- Body: `{}`

## 5. Test immediato

1. Accedi nell'app col profilo amministratore e verifica che le notifiche siano attive.
2. Accedi come cliente sul telefono cliente e attiva le notifiche: il frontend associa il numero come External ID OneSignal.
3. Crea una prenotazione cliente: l'amministratore deve ricevere `Nuova prenotazione` entro circa un minuto.
4. Sposta la prenotazione: admin e cliente devono ricevere l'avviso.
5. Annullala: admin e cliente devono ricevere l'avviso.
6. Dall'Area Salone usa **Comunicazioni ai clienti → Invia a tutti**.

## Controllo coda

Nel SQL Editor:

```sql
select id, kind, recipient_type, title, scheduled_for, status, attempts, last_error
from public.notification_jobs
order by id desc
limit 50;
```

Se un messaggio non arriva, questa query mostra l'errore preciso restituito da OneSignal.
