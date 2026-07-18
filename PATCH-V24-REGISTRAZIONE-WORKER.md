# Patch v24 — registrazione preventiva OneSignal

Questa versione registra e attiva esplicitamente il worker OneSignal prima di eseguire `OneSignal.init()`.

La modifica nasce dalla prova effettuata nella Console: la registrazione manuale dello stesso file e dello stesso scope è riuscita, mentre la registrazione automatica dell’SDK riceveva una risposta 404.

## Dopo il caricamento

1. Attendere il completamento di GitHub Pages.
2. Cancellare i dati del sito oppure disinstallare e reinstallare la PWA.
3. Aprire la PWA e premere **Attiva notifiche**.
4. Nel dashboard OneSignal verificare che compaiano Subscription ID e Push Token.
