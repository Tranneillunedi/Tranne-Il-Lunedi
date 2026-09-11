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

## Versione 16 — prenotazioni manuali
1. Esegui `supabase-v16-prenotazioni-manuali.sql` nello SQL Editor di Supabase.
2. Carica tutti i file sul repository GitHub sostituendo quelli precedenti.
3. Apri l'Area Salone e usa **Aggiungi cliente**.

L'agenda si aggiorna automaticamente ogni 15 secondi mentre è aperta e subito quando torni nell'app.

\n## Versione 28 — Taglio bambino\n
- Aggiunto al listino iniziale **Taglio bambino (0-10 anni) — 12 €**.
- Aggiunto alla scelta del trattamento durante la prenotazione.
- Aggiunto anche alla prenotazione manuale dall'Area Salone.
- Cache PWA aggiornata a V28.
- Eseguire `supabase-v28-taglio-bambino.sql` dopo `supabase-v16-prenotazioni-manuali.sql`.

**Importante:** la prenotazione online del cliente usa anche la funzione Supabase `create_booking`, che non è presente nei file SQL inclusi in questo pacchetto. Nella funzione già presente nel database va aggiunto `when 'Taglio bambino (0-10 anni)' then 12` nel CASE che determina il prezzo; altrimenti l'opzione compare nell'app ma il database può rifiutarla.


## Versione 29 — Caselle singole + Aggiusta vari
- Aggiunto il blocco indipendente della **Casella 1** o **Casella 2** per ogni singolo orario.
- Il blocco di una casella lascia disponibile l'altra casella nello stesso orario.
- Aggiunto **Aggiusta vari — 3 €** al listino e alla prenotazione.
- Aggiunto il relativo RPC Supabase senza sostituire la funzione `create_booking` già esistente.
- Per il nuovo sistema è necessario eseguire `supabase-v29-caselle-aggiusta-vari.sql` in Supabase.
