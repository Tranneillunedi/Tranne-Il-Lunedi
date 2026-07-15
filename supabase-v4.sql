-- =========================================================
-- TRANNE IL LUNEDÌ — PATCH VERSIONE 4
-- Esegui questo script DOPO quello iniziale.
-- IMPORTANTE: cambia il PIN qui sotto prima di premere Run.
-- =========================================================

create extension if not exists pgcrypto;

create table if not exists public.app_private_settings (
  id integer primary key default 1 check (id = 1),
  admin_pin_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.app_private_settings enable row level security;
revoke all on table public.app_private_settings from public, anon, authenticated;

-- CAMBIA 246810 con il PIN che vuoi usare nell'area salone.
insert into public.app_private_settings (id, admin_pin_hash)
values (1, crypt('171209', gen_salt('bf')))
on conflict (id) do update
set admin_pin_hash = excluded.admin_pin_hash;

create or replace function public.verify_admin_pin(p_admin_pin text)
returns boolean
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1
    from public.app_private_settings
    where id = 1
      and admin_pin_hash = crypt(p_admin_pin, admin_pin_hash)
  );
$$;

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
  select b.booking_time, count(*)::bigint
  from public.bookings b
  where b.booking_date = p_booking_date
    and b.status = 'confirmed'
  group by b.booking_time
  order by b.booking_time;
$$;

create or replace function public.get_day_bookings_admin(
  p_admin_pin text,
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
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.verify_admin_pin(p_admin_pin) then
    raise exception 'PIN amministratore non valido';
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

create or replace function public.cancel_booking_admin(
  p_admin_pin text,
  p_booking_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  changed_rows integer;
begin
  if not public.verify_admin_pin(p_admin_pin) then
    raise exception 'PIN amministratore non valido';
  end if;

  update public.bookings
  set status = 'cancelled'
  where id = p_booking_id
    and status = 'confirmed';

  get diagnostics changed_rows = row_count;
  return changed_rows = 1;
end;
$$;

revoke all on function public.verify_admin_pin(text) from public;
revoke all on function public.get_day_availability(date) from public;
revoke all on function public.get_day_bookings_admin(text, date) from public;
revoke all on function public.cancel_booking_admin(text, uuid) from public;

grant execute on function public.get_day_availability(date) to anon, authenticated;
grant execute on function public.get_day_bookings_admin(text, date) to anon, authenticated;
grant execute on function public.cancel_booking_admin(text, uuid) to anon, authenticated;
