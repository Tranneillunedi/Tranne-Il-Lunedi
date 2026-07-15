-- =========================================================
-- TRANNE IL LUNEDÌ — VERSIONE FINALE ACCESSO TELEFONO + PIN
-- Esegui tutto nello SQL Editor di Supabase.
-- =========================================================

create extension if not exists pgcrypto;

alter table public.customers
add column if not exists pin_hash text;

-- Elimina le vecchie funzioni di accesso non sicure.
drop function if exists public.login_customer_by_phone(text);
drop function if exists public.register_customer(text, text, text);
drop function if exists public.register_customer_with_pin(text, text, text, text);
drop function if exists public.login_customer_with_pin(text, text);

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
  phone text
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
    -- Consente ai clienti di prova già presenti, ma senza PIN,
    -- di completare una sola volta la registrazione.
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
      pin_hash
    )
    values (
      initcap(trim(p_first_name)),
      initcap(trim(p_last_name)),
      clean_phone,
      crypt(p_pin, gen_salt('bf'))
    )
    returning * into saved_customer;
  end if;

  return query
  select
    saved_customer.id,
    saved_customer.access_token,
    saved_customer.first_name,
    saved_customer.last_name,
    saved_customer.phone;
end;
$$;

create or replace function public.login_customer_with_pin(
  p_phone text,
  p_pin text
)
returns table (
  customer_id uuid,
  customer_access_token uuid,
  first_name text,
  last_name text,
  phone text
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
    c.phone
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

revoke all on function public.register_customer_with_pin(text, text, text, text) from public;
revoke all on function public.login_customer_with_pin(text, text) from public;

grant execute on function public.register_customer_with_pin(text, text, text, text)
to anon, authenticated;

grant execute on function public.login_customer_with_pin(text, text)
to anon, authenticated;

-- Le tabelle restano protette con RLS e senza accesso diretto pubblico.
alter table public.customers enable row level security;
alter table public.bookings enable row level security;

revoke all on table public.customers from anon, authenticated;
revoke all on table public.bookings from anon, authenticated;
