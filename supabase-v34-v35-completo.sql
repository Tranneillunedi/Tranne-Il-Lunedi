-- ============================================================
-- TRANNE IL LUNEDÌ — V34 + V35 IN UN SOLO FILE
-- (numeri bloccati + aperture straordinarie di domenica e lunedì)
-- Eseguire UNA VOLTA in Supabase > SQL Editor. Solo aggiunte.
-- ============================================================

-- ============================================================
-- TRANNE IL LUNEDÌ — V34
-- Blocco numeri di telefono: un numero bloccato non può più
-- prenotare né cambiare orario a una prenotazione.
-- Solo aggiunte: NON modifica prenotazioni, clienti o funzioni esistenti.
-- Eseguire UNA VOLTA in Supabase > SQL Editor.
-- ============================================================

create extension if not exists pgcrypto;

-- 1) Normalizzazione: solo cifre, senza 00 iniziale e senza prefisso 39.
create or replace function public.norm_phone(p_phone text)
returns text
language sql
immutable
as $$
  select case
    when n like '39%' and char_length(n) > 10 then substr(n, 3)
    else n
  end
  from (
    select regexp_replace(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '^00', '') as n
  ) t;
$$;

-- 2) Lista dei numeri bloccati (accessibile solo tramite le funzioni admin).
create table if not exists public.blocked_phones (
  phone text primary key,
  note text,
  created_at timestamptz not null default now()
);

alter table public.blocked_phones enable row level security;
revoke all on table public.blocked_phones from public, anon, authenticated;

-- 3) Controllo nel database: vale per qualsiasi modo di prenotare dall'app.
--    Le prenotazioni inserite a mano dal salone (booking_source = 'salon') restano libere.
create or replace function public.enforce_blocked_phone()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  customer_phone text;
begin
  if new.status is distinct from 'confirmed' then
    return new;
  end if;

  if coalesce(new.booking_source, 'customer') = 'salon' then
    return new;
  end if;

  select c.phone into customer_phone
  from public.customers c
  where c.id = new.customer_id;

  if customer_phone is not null and exists (
    select 1 from public.blocked_phones bp
    where bp.phone = public.norm_phone(customer_phone)
  ) then
    raise exception 'Non è possibile prenotare. Contattaci direttamente.';
  end if;

  return new;
end;
$$;

drop trigger if exists a_bookings_blocked_phone on public.bookings;
create trigger a_bookings_blocked_phone
before insert or update of booking_date, booking_time, status
on public.bookings
for each row execute function public.enforce_blocked_phone();

-- 4) Funzioni admin (stesso controllo is_admin_token usato ovunque).
create or replace function public.get_admin_blocked_phones(p_access_token uuid)
returns table (phone text, note text, customer_name text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_token(p_access_token) then
    raise exception 'Accesso amministratore non autorizzato';
  end if;

  return query
  select bp.phone,
         bp.note,
         (select trim(c.first_name || ' ' || c.last_name)
            from public.customers c
            where public.norm_phone(c.phone) = bp.phone
            limit 1),
         bp.created_at
  from public.blocked_phones bp
  order by bp.created_at desc;
end;
$$;

create or replace function public.add_admin_blocked_phone(
  p_access_token uuid,
  p_phone text,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_phone text;
begin
  if not public.is_admin_token(p_access_token) then
    raise exception 'Accesso amministratore non autorizzato';
  end if;

  clean_phone := public.norm_phone(p_phone);
  if char_length(clean_phone) < 8 or char_length(clean_phone) > 15 then
    raise exception 'Numero di telefono non valido';
  end if;

  insert into public.blocked_phones(phone, note)
  values (clean_phone, nullif(trim(p_note), ''))
  on conflict (phone) do update set note = excluded.note;
end;
$$;

create or replace function public.delete_admin_blocked_phone(
  p_access_token uuid,
  p_phone text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_token(p_access_token) then
    raise exception 'Accesso amministratore non autorizzato';
  end if;

  delete from public.blocked_phones where phone = public.norm_phone(p_phone);
end;
$$;

revoke all on function public.get_admin_blocked_phones(uuid) from public;
revoke all on function public.add_admin_blocked_phone(uuid, text, text) from public;
revoke all on function public.delete_admin_blocked_phone(uuid, text) from public;

grant execute on function public.get_admin_blocked_phones(uuid) to anon, authenticated;
grant execute on function public.add_admin_blocked_phone(uuid, text, text) to anon, authenticated;
grant execute on function public.delete_admin_blocked_phone(uuid, text) to anon, authenticated;


-- ============================================================
-- TRANNE IL LUNEDÌ — V35
-- Aperture straordinarie: l'admin può abilitare una singola domenica
-- o un singolo lunedì, scegliendo da che ora a che ora.
-- Solo aggiunte: NON modifica prenotazioni, clienti o funzioni esistenti.
-- Eseguire UNA VOLTA in Supabase > SQL Editor.
-- ============================================================

-- 1) Giornate abilitate (una riga per data).
create table if not exists public.special_openings (
  open_date date primary key,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

alter table public.special_openings enable row level security;
revoke all on table public.special_openings from public, anon, authenticated;

-- 2) Lettura pubblica (serve al calendario dei clienti): solo date future.
create or replace function public.get_special_openings()
returns table (open_date date, start_time time, end_time time)
language sql
security definer
set search_path = public
as $$
  select so.open_date, so.start_time, so.end_time
  from public.special_openings so
  where so.open_date >= (now() at time zone 'Europe/Rome')::date
  order by so.open_date;
$$;

-- 3) Funzioni admin (stesso controllo is_admin_token usato ovunque).
create or replace function public.set_admin_special_opening(
  p_access_token uuid,
  p_open_date date,
  p_start_time time,
  p_end_time time
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_token(p_access_token) then
    raise exception 'Accesso amministratore non autorizzato';
  end if;

  if extract(isodow from p_open_date) not in (1, 7) then
    raise exception 'Puoi abilitare solo una domenica o un lunedì';
  end if;

  if p_open_date < (now() at time zone 'Europe/Rome')::date then
    raise exception 'La data non può essere nel passato';
  end if;

  if p_start_time < time '09:00' or p_end_time > time '20:00' or p_end_time <= p_start_time then
    raise exception 'Orario non valido';
  end if;

  insert into public.special_openings(open_date, start_time, end_time)
  values (p_open_date, p_start_time, p_end_time)
  on conflict (open_date)
  do update set start_time = excluded.start_time, end_time = excluded.end_time;
end;
$$;

create or replace function public.delete_admin_special_opening(
  p_access_token uuid,
  p_open_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_token(p_access_token) then
    raise exception 'Accesso amministratore non autorizzato';
  end if;

  delete from public.special_openings where open_date = p_open_date;
end;
$$;

-- 4) Controllo nel database: i clienti possono prenotare di domenica o lunedì
--    solo nella fascia abilitata. Le prenotazioni inserite a mano dal salone
--    (booking_source = 'salon') restano libere, come per gli altri blocchi.
create or replace function public.enforce_special_day_opening()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from 'confirmed' then
    return new;
  end if;

  if coalesce(new.booking_source, 'customer') = 'salon' then
    return new;
  end if;

  if extract(isodow from new.booking_date) in (1, 7) then
    if not exists (
      select 1 from public.special_openings so
      where so.open_date = new.booking_date
        and new.booking_time >= so.start_time
        and new.booking_time < so.end_time
    ) then
      raise exception 'Il salone è chiuso in questa data';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists a_bookings_special_day on public.bookings;
create trigger a_bookings_special_day
before insert or update of booking_date, booking_time, status
on public.bookings
for each row execute function public.enforce_special_day_opening();

revoke all on function public.get_special_openings() from public;
revoke all on function public.set_admin_special_opening(uuid, date, time, time) from public;
revoke all on function public.delete_admin_special_opening(uuid, date) from public;

grant execute on function public.get_special_openings() to anon, authenticated;
grant execute on function public.set_admin_special_opening(uuid, date, time, time) to anon, authenticated;
grant execute on function public.delete_admin_special_opening(uuid, date) to anon, authenticated;
