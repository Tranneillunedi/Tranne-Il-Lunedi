# Tranne il Lunedì — versione 14 finale

Questa versione consolida tutte le funzioni precedenti e corregge i tutorial duplicati.

## Funzioni incluse

- Login e registrazione con telefono + PIN.
- Login in sovraimpressione sulla Home.
- Area Salone visibile solo al numero amministratore 3294598538.
- Prenotazioni condivise tramite Supabase.
- Massimo due clienti per fascia oraria.
- Calendario grafico e cambio orario.
- Agenda amministratore.
- Ferie, chiusure straordinarie e blocco di fasce orarie.
- Tutorial automatico per aggiungere l'app alla schermata Home.
- Secondo tutorial per autorizzare le notifiche.
- Pulsanti nel Profilo per riaprire entrambi i tutorial.
- Icona Home con il logo del negozio, in formato 192, 512 e Apple Touch.
- Notifica locale immediata per conferma e modifica orario.

## Supabase

Esegui nell'ordine:

1. `supabase-v9-finale-pin.sql`
2. `supabase-v11-admin-profile.sql`
3. `supabase-v13-ferie-blocchi.sql`

## Aggiornamento GitHub

Carica tutti i file di questa cartella nella radice del repository. Dopo il deploy:

- ricarica con Ctrl+F5 sul PC;
- sul telefono cancella eventualmente i dati del sito o rimuovi e reinstalla la PWA;
- il nuovo service worker usa la cache `v14`.

## Nota sulle notifiche

Il permesso e le notifiche locali funzionano già. I promemoria programmati quando nessun dispositivo ha il sito aperto e le notifiche all'amministratore richiedono un servizio push esterno come OneSignal o Firebase.
