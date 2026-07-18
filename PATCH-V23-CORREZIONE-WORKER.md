# Patch v23 — correzione percorso OneSignal

La v22 costruiva il percorso del worker come `Tranne-Il-Lunedi/onesignal/...` mentre la pagina è già pubblicata dentro `/Tranne-Il-Lunedi/`. Il browser poteva quindi cercare una cartella duplicata.

La v23 usa:

```js
serviceWorkerPath: "onesignal/OneSignalSDKWorker.js"
serviceWorkerParam: { scope: "/Tranne-Il-Lunedi/onesignal/" }
```

Dopo il deploy, cancellare i dati del sito e reinstallare la PWA.
