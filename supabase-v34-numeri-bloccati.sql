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
