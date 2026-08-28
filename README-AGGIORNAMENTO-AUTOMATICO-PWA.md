# Aggiornamento automatico PWA

La versione V29 mantiene l'app installabile sulla Home di iPhone e aggiunge un controllo più aggressivo degli aggiornamenti del Service Worker.

## Comportamento
- Quando l'app viene aperta dalla Home, il browser verifica la versione pubblicata online.
- Quando l'app torna in primo piano, viene eseguito un nuovo controllo.
- Il Service Worker usa una strategia **network-first** per i file dell'app: online viene preferita la versione pubblicata più recente; offline resta disponibile la cache.
- Non serve eliminare e reinstallare l'app dalla Home per ogni aggiornamento.

## Importante
L'aggiornamento automatico funziona per la copia **pubblicata online**. Chi ha già aggiunto la PWA alla Home continuerà a usare la stessa icona e lo stesso collegamento, mentre i file dell'app vengono aggiornati dal Service Worker.

Se viene pubblicata una nuova versione, è consigliabile mantenere la registrazione `./service-worker.js` sullo stesso percorso e incrementare la versione della cache nel Service Worker.
