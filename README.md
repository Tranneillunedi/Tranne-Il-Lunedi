# Tranne il Lunedì — Versione 13 definitiva

## Configurazione Supabase

Esegui nello SQL Editor, in questo ordine:

1. `supabase-v9-finale-pin.sql`
2. `supabase-v11-admin-profile.sql`
3. `supabase-v13-ferie-blocchi.sql`

## Funzioni comprese

- Accesso con telefono e PIN.
- Accesso in sovraimpressione sulla Home.
- Area Agenda visibile solo all'amministratore con numero 3294598538.
- Massimo due prenotazioni per fascia.
- Calendario grafico e cambio orario.
- Ferie e chiusure da una data a un'altra.
- Blocco di singole fasce orarie.
- Giorni e orari bloccati non prenotabili dai clienti.
- Tutorial automatico per aggiungere la PWA alla Home.
- Finestra per chiedere il consenso alle notifiche.
- Notifica di prova sul telefono dopo il consenso.

## Nota importante sulle notifiche

Il consenso e le notifiche locali del browser sono già presenti.

Per inviare automaticamente:
- un promemoria il giorno prima anche quando il sito è chiuso;
- una notifica al titolare quando un cliente prenota da un altro dispositivo;

serve ancora collegare un servizio push esterno, come OneSignal o Firebase. Questa parte non può essere ottenuta dal solo codice statico ospitato su GitHub Pages.
