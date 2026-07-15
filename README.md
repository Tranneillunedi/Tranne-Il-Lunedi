# Tranne il Lunedì — versione finale telefono + PIN

## Configurazione obbligatoria
1. Apri Supabase.
2. Vai in **SQL Editor**.
3. Apri il file `supabase-v9-finale-pin.sql`.
4. Copia tutto e premi **Run**.
5. Carica i file aggiornati su GitHub.
6. Attendi il deploy di GitHub Pages e ricarica il sito.

## Accesso clienti
- Accesso: numero di telefono + PIN personale.
- Registrazione: nome, cognome, telefono, PIN e conferma PIN.
- Il PIN deve contenere da 4 a 6 cifre.
- Nel database viene conservato soltanto l'hash del PIN.
- Il recupero PIN avviene contattando il salone al 329 459 8538.

## Clienti di prova già presenti
I clienti già registrati nelle versioni precedenti non hanno ancora un PIN.
Devono premere **Registrati** una sola volta usando lo stesso numero, scegliere il PIN e completare il profilo.

## Sicurezza
Questa soluzione non ha costi SMS. È più sicura dell'accesso con il solo numero, ma il PIN deve essere custodito dal cliente. Per una futura reimpostazione automatica servirebbe un canale verificato, come email o SMS.


## Novità versione 10
- La Home è visibile subito come sfondo.
- Se il cliente non ha effettuato l'accesso, il modulo telefono + PIN appare in sovraimpressione sopra la Home.
- Lo sfondo della Home resta visibile con effetto sfocato/scurito.
- Dopo accesso o registrazione, la sovraimpressione scompare automaticamente.
- Dopo il logout si torna alla Home e ricompare la schermata di accesso in sovraimpressione.
