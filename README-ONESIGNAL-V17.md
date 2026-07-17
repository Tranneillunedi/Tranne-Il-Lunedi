# Patch v17 — OneSignal Web Push

## File da caricare su GitHub
Carica tutti i file e le cartelle di questa versione, inclusa la cartella `onesignal`.

## Dopo la pubblicazione
1. Verifica che si apra questo indirizzo nel browser:
   `https://tranneillunedi.github.io/Tranne-Il-Lunedi/onesignal/OneSignalSDKWorker.js`
2. Torna su OneSignal e premi **Ho installato l'SDK**.
3. Apri l'app dal telefono con Chrome, premi **Gestisci notifiche** e poi **Attiva notifiche**.
4. In OneSignal vai in **Audience > Subscriptions**: il dispositivo deve risultare **Subscribed**.

## Importante
Questa patch registra i telefoni e abilita la ricezione delle push. L'invio automatico quando un cliente prenota richiede il passaggio successivo: una funzione server Supabase Edge Function con la OneSignal App API Key salvata nei Secrets. La chiave privata non va mai inserita nei file pubblici di GitHub.


## Correzione v17.1
La coda `OneSignalDeferred` viene ora creata prima del caricamento del Web SDK. È stato inoltre aggiunto un controllo di avvio con attesa fino a 15 secondi e il percorso assoluto del service worker per GitHub Pages.
