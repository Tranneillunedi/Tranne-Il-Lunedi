-- =========================================================
-- TRANNE IL LUNEDÌ — VERSIONE 16
-- PRENOTAZIONI MANUALI DALL'AREA SALONE
-- Esegui una sola volta nello SQL Editor di Supabase.
-- =========================================================

alter table public.bookings
  add column if not exists booking_source text not null default 'customer',
  add column if not exists notes text;

alter table public.bookings
  drop constraint if exists bookings_booking_source_check;
alter table public.bookings
  add constraint bookings_booking_source_check
  check (booking_source in ('customer', 'salon'));

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
    when 'Completo' then 22
    when 'Barba' then 5
    else null
  end;
  if selected_price is null then raise exception 'Servizio non valido'; end if;

  weekday := extract(isodow from p_booking_date);
  if weekday = 1 or weekday = 7 then
    raise exception 'Il salone è chiuso in questa giornata';
  end if;
  if p_booking_time < time '09:00' or p_booking_time >= time '20:00'
     or extract(minute from p_booking_time) not in (0, 30) then
    raise exception 'Orario non valido';
  end if;

  if exists (
    select 1 from public.closures c
    where p_booking_date between c.start_date and c.end_date
  ) then raise exception 'La giornata è bloccata'; end if;

  if exists (
    select 1 from public.time_blocks t
    where t.block_date = p_booking_date
      and p_booking_time >= t.start_time and p_booking_time < t.end_time
  ) then raise exception 'Questa fascia oraria è bloccata'; end if;

  select count(*) into occupied_count
  from public.bookings b
  where b.booking_date = p_booking_date
    and b.booking_time = p_booking_time
    and b.status = 'confirmed';
  if occupied_count >= 2 then raise exception 'Fascia completa: sono già presenti 2 prenotazioni'; end if;

  if clean_phone <> '' then
    stored_phone := clean_phone;
    select * into saved_customer from public.customers c where c.phone = stored_phone limit 1;
  else
    stored_phone := 'MANUAL-' || replace(gen_random_uuid()::text, '-', '');
  end if;

  if saved_customer.id is null then
    insert into public.customers(first_name, last_name, phone)
    values (initcap(trim(p_first_name)), initcap(trim(p_last_name)), stored_phone)
    returning * into saved_customer;
  else
    update public.customers
      set first_name = initcap(trim(p_first_name)), last_name = initcap(trim(p_last_name))
    where id = saved_customer.id
    returning * into saved_customer;
  end if;

  insert into public.bookings(customer_id, service, price, booking_date, booking_time, status, booking_source, notes)
  values (saved_customer.id, p_service, selected_price, p_booking_date, p_booking_time, 'confirmed', 'salon', nullif(trim(p_notes), ''))
  returning * into new_booking;

  return query select new_booking.id, new_booking.booking_date, new_booking.booking_time, new_booking.service, new_booking.price;
end;
$$;

-- Aggiorna la lettura dell'agenda con provenienza e note.
drop function if exists public.get_day_bookings_for_admin(uuid, date);
create function public.get_day_bookings_for_admin(
  p_access_token uuid,
  p_booking_date date
)
returns table (
  booking_id uuid,
  first_name text,
  last_name text,
  phone text,
  service text,
  price numeric,
  booking_date date,
  booking_time time,
  status text,
  booking_source text,
  notes text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin_token(p_access_token) then
    raise exception 'Accesso amministratore non autorizzato';
  end if;

  return query
  select b.id, c.first_name, c.last_name,
    case when c.phone like 'MANUAL-%' then '' else c.phone end,
    b.service, b.price, b.booking_date, b.booking_time, b.status,
    b.booking_source, b.notes
  from public.bookings b
  join public.customers c on c.id = b.customer_id
  where b.booking_date = p_booking_date and b.status = 'confirmed'
  order by b.booking_time, b.created_at;
end;
$$;

revoke all on function public.create_booking_for_admin(uuid,text,text,text,text,date,time,text) from public;
revoke all on function public.get_day_bookings_for_admin(uuid,date) from public;
grant execute on function public.create_booking_for_admin(uuid,text,text,text,text,date,time,text) to anon, authenticated;
grant execute on function public.get_day_bookings_for_admin(uuid,date) to anon, authenticated;
