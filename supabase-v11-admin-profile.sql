-- =========================================================
-- TRANNE IL LUNEDÌ — VERSIONE 11
-- AREA SALONE VISIBILE SOLO AGLI AMMINISTRATORI
-- Esegui questo script DOPO supabase-v9-finale-pin.sql
-- =========================================================

alter table public.customers
add column if not exists is_admin boolean not null default false;

-- Imposta come amministratore il tuo numero.
update public.customers
set is_admin = true
where phone = '3294598538';

-- Aggiorna la funzione di registrazione per restituire is_admin.
drop function if exists public.register_customer_with_pin(text, text, text, text);

create or replace function public.register_customer_with_pin(
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_pin text
)
returns table (
  customer_id uuid,
  customer_access_token uuid,
  first_name text,
  last_name text,
  phone text,
  is_admin boolean
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  clean_phone text;
  existing_customer public.customers%rowtype;
  saved_customer public.customers%rowtype;
begin
  clean_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');

  if char_length(clean_phone) < 8 or char_length(clean_phone) > 15 then
    raise exception 'Numero di telefono non valido';
  end if;

  if char_length(trim(coalesce(p_first_name, ''))) < 2 then
    raise exception 'Nome non valido';
  end if;

  if char_length(trim(coalesce(p_last_name, ''))) < 2 then
    raise exception 'Cognome non valido';
  end if;

  if p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'Il PIN deve contenere da 4 a 6 cifre';
  end if;

  select *
  into existing_customer
  from public.customers
  where customers.phone = clean_phone
  limit 1;

  if existing_customer.id is not null then
    if existing_customer.pin_hash is null then
      update public.customers
      set
        first_name = initcap(trim(p_first_name)),
        last_name = initcap(trim(p_last_name)),
        pin_hash = crypt(p_pin, gen_salt('bf'))
      where id = existing_customer.id
      returning * into saved_customer;
    else
      raise exception 'Questo numero è già registrato. Usa la schermata Accedi.';
    end if;
  else
    insert into public.customers (
      first_name,
      last_name,
      phone,
      pin_hash,
      is_admin
    )
    values (
      initcap(trim(p_first_name)),
      initcap(trim(p_last_name)),
      clean_phone,
      crypt(p_pin, gen_salt('bf')),
      clean_phone = '3294598538'
    )
    returning * into saved_customer;
  end if;

  return query
  select
    saved_customer.id,
    saved_customer.access_token,
    saved_customer.first_name,
    saved_customer.last_name,
    saved_customer.phone,
    saved_customer.is_admin;
end;
$$;

drop function if exists public.login_customer_with_pin(text, text);

create or replace function public.login_customer_with_pin(
  p_phone text,
  p_pin text
)
returns table (
  customer_id uuid,
  customer_access_token uuid,
  first_name text,
  last_name text,
  phone text,
  is_admin boolean
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  clean_phone text;
begin
  clean_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');

  if char_length(clean_phone) < 8 or char_length(clean_phone) > 15 then
    raise exception 'Numero di telefono non valido';
  end if;

  if p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'PIN non valido';
  end if;

  return query
  select
    c.id,
    c.access_token,
    c.first_name,
    c.last_name,
    c.phone,
    c.is_admin
  from public.customers c
  where c.phone = clean_phone
    and c.pin_hash is not null
    and c.pin_hash = crypt(p_pin, c.pin_hash)
  limit 1;

  if not found then
    raise exception 'Numero o PIN non corretti';
  end if;
end;
$$;

create or replace function public.get_day_bookings_for_admin(
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
  status text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.customers c
    where c.access_token = p_access_token
      and c.is_admin = true
  ) then
    raise exception 'Accesso amministratore non autorizzato';
  end if;

  return query
  select
    b.id,
    c.first_name,
    c.last_name,
    c.phone,
    b.service,
    b.price,
    b.booking_date,
    b.booking_time,
    b.status
  from public.bookings b
  join public.customers c on c.id = b.customer_id
  where b.booking_date = p_booking_date
    and b.status = 'confirmed'
  order by b.booking_time, b.created_at;
end;
$$;

create or replace function public.cancel_booking_for_admin(
  p_access_token uuid,
  p_booking_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  changed_rows integer;
begin
  if not exists (
    select 1
    from public.customers c
    where c.access_token = p_access_token
      and c.is_admin = true
  ) then
    raise exception 'Accesso amministratore non autorizzato';
  end if;

  update public.bookings
  set status = 'cancelled'
  where id = p_booking_id
    and status = 'confirmed';

  get diagnostics changed_rows = row_count;
  return changed_rows = 1;
end;
$$;

revoke all on function public.register_customer_with_pin(text, text, text, text) from public;
revoke all on function public.login_customer_with_pin(text, text) from public;
revoke all on function public.get_day_bookings_for_admin(uuid, date) from public;
revoke all on function public.cancel_booking_for_admin(uuid, uuid) from public;

grant execute on function public.register_customer_with_pin(text, text, text, text)
to anon, authenticated;

grant execute on function public.login_customer_with_pin(text, text)
to anon, authenticated;

grant execute on function public.get_day_bookings_for_admin(uuid, date)
to anon, authenticated;

grant execute on function public.cancel_booking_for_admin(uuid, uuid)
to anon, authenticated;
