-- =========================================================
-- TRANNE IL LUNEDÌ — V29
-- CASELLE SINGOLE + "AGGIUSTA VARI" €3
--
-- Eseguire DOPO le versioni già installate (V28/V27).
-- Non elimina né modifica le prenotazioni esistenti.
-- =========================================================

create table if not exists public.slot_blocks (
  id uuid primary key default gen_random_uuid(),
  block_date date not null,
  block_time time not null,
  slot_number integer not null check (slot_number in (1, 2)),
  reason text,
  created_at timestamptz not null default now(),
  unique (block_date, block_time, slot_number)
);

alter table public.slot_blocks enable row level security;
revoke all on table public.slot_blocks from anon, authenticated;

-- La disponibilità continua a mostrare 2 posti totali:
-- prenotazioni confermate + caselle singole bloccate.
create or replace function public.get_day_availability(
  p_booking_date date
)
returns table (
  booking_time time,
  occupied bigint
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select booking_time, sum(occupied)::bigint
  from (
    select b.booking_time, count(*)::bigint as occupied
    from public.bookings b
    where b.booking_date = p_booking_date
      and b.status = 'confirmed'
    group by b.booking_time

    union all

    select sb.block_time, count(*)::bigint
    from public.slot_blocks sb
    where sb.block_date = p_booking_date
    group by sb.block_time
  ) x
  group by booking_time
  order by booking_time;
$$;

-- Blocco singola casella, solo amministratore.
create or replace function public.create_admin_slot_block(
  p_access_token uuid,
  p_block_date date,
  p_block_time time,
  p_slot_number integer,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_id uuid;
begin
  if not public.is_admin_token(p_access_token) then
    raise exception 'Accesso amministratore non autorizzato';
  end if;

  if p_slot_number not in (1, 2) then
    raise exception 'Casella non valida';
  end if;

  if p_block_time < time '09:00'
     or p_block_time >= time '20:00'
     or extract(minute from p_block_time) not in (0, 30) then
    raise exception 'Orario non valido';
  end if;

  insert into public.slot_blocks(block_date, block_time, slot_number, reason)
  values (
    p_block_date,
    p_block_time,
    p_slot_number,
    nullif(trim(p_reason), '')
  )
  returning id into new_id;

  return new_id;
exception
  when unique_violation then
    raise exception 'Questa casella è già bloccata per quell’orario';
end;
$$;

create or replace function public.get_admin_slot_blocks(
  p_access_token uuid
)
returns table (
  item_id uuid,
  block_date date,
  block_time time,
  slot_number integer,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_token(p_access_token) then
    raise exception 'Accesso amministratore non autorizzato';
  end if;

  return query
  select s.id, s.block_date, s.block_time, s.slot_number, s.reason
  from public.slot_blocks s
  order by s.block_date, s.block_time, s.slot_number;
end;
$$;

create or replace function public.delete_admin_slot_block(
  p_access_token uuid,
  p_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  if not public.is_admin_token(p_access_token) then
    raise exception 'Accesso amministratore non autorizzato';
  end if;

  delete from public.slot_blocks where id = p_id;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

-- Prenotazione online dedicata al nuovo servizio.
-- Così non è necessario modificare la funzione create_booking
-- già presente nel database per gli altri servizi.
create or replace function public.create_adjustment_booking(
  p_access_token uuid,
  p_booking_date date,
  p_booking_time time
)
returns table (
  booking_id uuid,
  booking_date date,
  booking_time time,
  service text,
  price numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  customer_row public.customers%rowtype;
  new_booking public.bookings%rowtype;
  occupied_count integer;
  weekday integer;
begin
  select * into customer_row
  from public.customers
  where access_token = p_access_token
  limit 1;

  if customer_row.id is null then
    raise exception 'Accesso cliente non valido';
  end if;

  weekday := extract(isodow from p_booking_date);
  if weekday = 1 or weekday = 7 then
    raise exception 'Il salone è chiuso in questa giornata';
  end if;

  if p_booking_time < time '09:00'
     or p_booking_time >= time '20:00'
     or extract(minute from p_booking_time) not in (0, 30) then
    raise exception 'Orario non valido';
  end if;

  if exists (
    select 1 from public.closures c
    where p_booking_date between c.start_date and c.end_date
  ) then
    raise exception 'Il salone è chiuso in questa data';
  end if;

  if exists (
    select 1 from public.time_blocks t
    where t.block_date = p_booking_date
      and p_booking_time >= t.start_time
      and p_booking_time < t.end_time
  ) then
    raise exception 'Questa fascia oraria non è disponibile';
  end if;

  select
    (
      select count(*) from public.bookings b
      where b.booking_date = p_booking_date
        and b.booking_time = p_booking_time
        and b.status = 'confirmed'
    )
    +
    (
      select count(*) from public.slot_blocks sb
      where sb.block_date = p_booking_date
        and sb.block_time = p_booking_time
    )
  into occupied_count;

  if occupied_count >= 2 then
    raise exception 'Fascia completa: non ci sono caselle disponibili';
  end if;

  insert into public.bookings(
    customer_id, service, price, booking_date, booking_time, status
  )
  values (
    customer_row.id, 'Aggiusta vari', 3, p_booking_date, p_booking_time, 'confirmed'
  )
  returning * into new_booking;

  return query
  select new_booking.id, new_booking.booking_date, new_booking.booking_time,
         new_booking.service, new_booking.price;
end;
$$;

-- Prenotazioni manuali dell'Area Salone: aggiunge il nuovo prezzo
-- senza cambiare le altre regole della V16.
create or replace function public.create_booking_for_admin(
  p_access_token uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_service text,
  p_booking_date date,
  p_booking_time time,
  p_notes text default null
)
returns table (
  booking_id uuid,
  booking_date date,
  booking_time time,
  service text,
  price numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_phone text;
  stored_phone text;
  selected_price numeric;
  saved_customer public.customers%rowtype;
  new_booking public.bookings%rowtype;
  occupied_count integer;
  weekday integer;
begin
  if not public.is_admin_token(p_access_token) then
    raise exception 'Accesso amministratore non autorizzato';
  end if;

  if char_length(trim(coalesce(p_first_name, ''))) < 2 then
    raise exception 'Inserisci un nome valido';
  end if;
  if char_length(trim(coalesce(p_last_name, ''))) < 2 then
    raise exception 'Inserisci un cognome valido';
  end if;

  clean_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if clean_phone <> '' and (char_length(clean_phone) < 8 or char_length(clean_phone) > 15) then
    raise exception 'Numero di telefono non valido';
  end if;

  selected_price := case p_service
    when 'Taglio' then 17
    when 'Taglio bambino (0-10 anni)' then 12
    when 'Barba' then 5
    when 'Completo' then 22
    when 'Aggiusta vari' then 3
    else null
  end;

  if selected_price is null then
    raise exception 'Servizio non valido';
  end if;

  weekday := extract(isodow from p_booking_date);
  if weekday = 1 or weekday = 7 then
    raise exception 'Il salone è chiuso in questa giornata';
  end if;

  if p_booking_time < time '09:00'
     or p_booking_time >= time '20:00'
     or extract(minute from p_booking_time) not in (0, 30) then
    raise exception 'Orario non valido';
  end if;

  if exists (
    select 1 from public.closures c
    where p_booking_date between c.start_date and c.end_date
  ) then
    raise exception 'La giornata è bloccata';
  end if;

  if exists (
    select 1 from public.time_blocks t
    where t.block_date = p_booking_date
      and p_booking_time >= t.start_time
      and p_booking_time < t.end_time
  ) then
    raise exception 'Questa fascia oraria è bloccata';
  end if;

  select
    (
      select count(*) from public.bookings b
      where b.booking_date = p_booking_date
        and b.booking_time = p_booking_time
        and b.status = 'confirmed'
    )
    +
    (
      select count(*) from public.slot_blocks sb
      where sb.block_date = p_booking_date
        and sb.block_time = p_booking_time
    )
  into occupied_count;

  if occupied_count >= 2 then
    raise exception 'Fascia completa: non ci sono caselle disponibili';
  end if;

  if clean_phone <> '' then
    stored_phone := clean_phone;
    select * into saved_customer
    from public.customers c
    where c.phone = stored_phone
    limit 1;
  else
    stored_phone := 'MANUAL-' || replace(gen_random_uuid()::text, '-', '');
  end if;

  if saved_customer.id is null then
    insert into public.customers(first_name, last_name, phone)
    values (initcap(trim(p_first_name)), initcap(trim(p_last_name)), stored_phone)
    returning * into saved_customer;
  else
    update public.customers
    set first_name = initcap(trim(p_first_name)),
        last_name = initcap(trim(p_last_name))
    where id = saved_customer.id
    returning * into saved_customer;
  end if;

  insert into public.bookings(
    customer_id, service, price, booking_date, booking_time,
    status, booking_source, notes
  )
  values (
    saved_customer.id, p_service, selected_price, p_booking_date,
    p_booking_time, 'confirmed', 'salon', nullif(trim(p_notes), '')
  )
  returning * into new_booking;

  return query
  select new_booking.id, new_booking.booking_date, new_booking.booking_time,
         new_booking.service, new_booking.price;
end;
$$;

-- Trigger di sicurezza: anche una prenotazione non passa se
-- prenotazioni + caselle bloccate raggiungono 2.
create or replace function public.check_booking_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  occupied_count integer;
begin
  if new.status = 'cancelled' then
    return new;
  end if;

  if exists (
    select 1 from public.closures c
    where new.booking_date between c.start_date and c.end_date
  ) then
    raise exception 'Il salone è chiuso in questa data';
  end if;

  if exists (
    select 1 from public.time_blocks tb
    where tb.block_date = new.booking_date
      and new.booking_time >= tb.start_time
      and new.booking_time < tb.end_time
  ) then
    raise exception 'Questa fascia oraria non è disponibile';
  end if;

  select
    (
      select count(*) from public.bookings b
      where b.booking_date = new.booking_date
        and b.booking_time = new.booking_time
        and b.status = 'confirmed'
        and b.id <> new.id
    )
    +
    (
      select count(*) from public.slot_blocks sb
      where sb.block_date = new.booking_date
        and sb.block_time = new.booking_time
    )
  into occupied_count;

  if occupied_count >= 2 then
    raise exception 'Fascia completa: non ci sono caselle disponibili';
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_rules_trigger on public.bookings;
create trigger bookings_rules_trigger
before insert or update of booking_date, booking_time, status
on public.bookings
for each row
execute function public.check_booking_rules();

revoke all on function public.get_day_availability(date) from public;
revoke all on function public.create_admin_slot_block(uuid,date,time,integer,text) from public;
revoke all on function public.get_admin_slot_blocks(uuid) from public;
revoke all on function public.delete_admin_slot_block(uuid,uuid) from public;
revoke all on function public.create_adjustment_booking(uuid,date,time) from public;
revoke all on function public.create_booking_for_admin(uuid,text,text,text,date,time,text) from public;
revoke all on function public.check_booking_rules() from public;

grant execute on function public.get_day_availability(date) to anon, authenticated;
grant execute on function public.create_admin_slot_block(uuid,date,time,integer,text) to anon, authenticated;
grant execute on function public.get_admin_slot_blocks(uuid) to anon, authenticated;
grant execute on function public.delete_admin_slot_block(uuid,uuid) to anon, authenticated;
grant execute on function public.create_adjustment_booking(uuid,date,time) to anon, authenticated;
grant execute on function public.create_booking_for_admin(uuid,text,text,text,date,time,text) to anon, authenticated;
