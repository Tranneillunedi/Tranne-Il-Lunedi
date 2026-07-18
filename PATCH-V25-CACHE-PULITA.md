# Patch v25 — cache pulita e OneSignal coerente

- Tutti i riferimenti statici sono allineati alla versione 25.
- La cache PWA usa esclusivamente `tranne-il-lunedi-v25`.
- Le cache precedenti vengono eliminate durante `activate`.
- La PWA non intercetta né memorizza la cartella `/onesignal/` o il CDN OneSignal.
- Il worker OneSignal viene registrato prima dell'inizializzazione SDK, usando il percorso e lo scope già verificati manualmente.

Dopo il deploy, rimuovere la vecchia PWA e cancellare i dati del sito una sola volta.
