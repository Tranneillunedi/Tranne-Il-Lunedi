# Versione 18 — notifiche

Caricare tutti i file nel repository GitHub mantenendo la cartella `onesignal`.

Dopo la pubblicazione:
1. attendere GitHub Pages;
2. cancellare dati del sito sul tablet;
3. reinstallare la PWA;
4. accedere e premere “Attiva notifiche”.

Controllo tecnico dalla console:
`await getTrannePushStatus()`

Lo stato corretto è: `ready: true`, `permission: true`, `optedIn: true`.
