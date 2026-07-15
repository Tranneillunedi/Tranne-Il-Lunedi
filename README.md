# Tranne il Lunedì — versione 4 con Supabase

## Prima di aprire l'app
1. Apri Supabase.
2. Vai in **SQL Editor**.
3. Apri il file `supabase-v4.sql`.
4. Cambia il PIN `246810` con un PIN scelto da te.
5. Copia tutto lo script e premi **Run**.

## Avvio
Apri questa cartella in Visual Studio Code e avvia `index.html` con Live Server.

## Cosa cambia
- Clienti e prenotazioni vengono salvati su Supabase.
- Telefono e computer condividono le stesse prenotazioni.
- Gli orari pieni vengono disabilitati.
- L'agenda del salone richiede il PIN amministratore.
- Il cliente può cambiare l'orario dal proprio profilo.
- Il token cliente rimane salvato sul dispositivo.

## Limite attuale
La registrazione con solo nome e telefono non verifica realmente il possesso del numero. Per accedere allo stesso profilo da un nuovo dispositivo servirà, nella fase successiva, un codice SMS OTP.
