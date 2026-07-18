# Patch v22 diagnostica OneSignal

Modifiche:
- corretto `serviceWorkerPath` nel formato ufficiale OneSignal: relativo alla root e senza slash iniziale;
- cache aggiornata a v22;
- log OneSignal impostato su `trace`;
- in caso di errore, l'app mostra direttamente:
  - permesso browser;
  - stato OneSignal;
  - token e Subscription ID;
  - service worker registrati e relativi scope;
  - presenza della sottoscrizione nativa del browser;
  - modalità PWA e HTTPS.

Configurazione dashboard da mantenere:
- Site URL: `https://tranneillunedi.github.io`
- Path to service worker files: `/Tranne-Il-Lunedi/onesignal/`
- Filename: `OneSignalSDKWorker.js`
- Registration scope: `/Tranne-Il-Lunedi/onesignal/`
