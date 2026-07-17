# Patch v21 — OneSignal e PWA

## File modificati

- `index.html`: versioni cache aggiornate a v21.
- `onesignal.js`: percorso e scope OneSignal unificati sul worker canonico; attesa reale della creazione di token e Subscription ID.
- `service-worker.js`: cache v21; esclusione completa dei file OneSignal; nessuna memorizzazione di risposte 404.
- `onesignal/OneSignalSDKWorker.js`: worker OneSignal canonico.
- Rimossi i worker duplicati `V2` e `Updater` per evitare configurazioni discordanti.

## Configurazione da usare nel dashboard OneSignal

- Site URL: `https://tranneillunedi.github.io`
- Path to service worker files: `/Tranne-Il-Lunedi/onesignal/`
- Main service worker filename: `OneSignalSDKWorker.js`
- Updater service worker filename: `OneSignalSDKWorker.js`
- Service worker registration scope: `/Tranne-Il-Lunedi/onesignal/`

## Dopo il caricamento su GitHub

1. Attendere che GitHub Actions termini con successo.
2. Aprire nel browser:
   `https://tranneillunedi.github.io/Tranne-Il-Lunedi/onesignal/OneSignalSDKWorker.js`
3. Verificare che venga mostrata la riga `importScripts(...)` e non una pagina 404.
4. Eliminare la vecchia PWA dal telefono.
5. Cancellare i dati del sito `tranneillunedi.github.io` dalle impostazioni del browser.
6. Riavviare il browser, aprire il sito, reinstallare la PWA e premere **Attiva notifiche**.
