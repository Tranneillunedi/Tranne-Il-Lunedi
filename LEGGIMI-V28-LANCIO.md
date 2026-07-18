# V28 — Patch grafica di lancio

Questa versione mantiene invariati database, Edge Functions, notifiche e logica di prenotazione.

## Migliorie incluse

- grafica più rifinita su smartphone e desktop;
- barra di navigazione più leggibile e moderna;
- indicatori di fiducia nella home;
- campi e area messaggi uniformati;
- focus visibile e supporto a movimento ridotto/contrasto elevato;
- metadati social e SEO di base;
- cache PWA aggiornata alla versione V28.

## Pubblicazione

1. Carica tutti i file e le cartelle sul repository GitHub, sostituendo quelli esistenti.
2. Attendi il completamento del deploy GitHub Pages.
3. Sul telefono chiudi e riapri l'app. Se appare ancora la grafica precedente, ricarica una volta la pagina oppure chiudi e riapri la PWA.
4. Non eseguire SQL e non ridistribuire le Edge Functions: il backend già funzionante non viene modificato.

## Controllo finale

- apri Home, Prenota, Profilo e Agenda;
- crea una prenotazione di prova;
- verifica la notifica amministratore;
- verifica il pulsante Messaggio a tutti.
