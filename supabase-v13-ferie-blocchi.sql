-- =========================================================
-- TRANNE IL LUNEDÌ — VERSIONE 13
-- FERIE, CHIUSURE E BLOCCHI ORARI
--
-- Esegui dopo:
-- 1. supabase-v9-finale-pin.sql
-- 2. supabase-v11-admin-profile.sql
-- =========================================================

create table if not exists public.closures (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  reason text,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists public.time_blocks (
  id uuid primary key default gen_random_uuid(),
  block_date date not null,
  start_time time not null,
  end_time time not null,
  reason text,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

alter table public.closures enable row level security;
alter table public.time_blocks enable row level security;

revoke all on table public.closures from anon, authenticated;
revoke all on table public.time_blocks from anon, authenticated;

create or replace function public.is_admin_token(p_access_token uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.customers
    where access_token = p_access_token
      and is_admin = true
  );
$$;

create or replace function public.create_admin_closure(
  p_access_token uuid,
  p_start_date date,
  p_end_date date,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if not public.is_admin_token(p_access_token) then
    raise exception 'Accesso amministratore non autorizzato';
  end if;

  if p_end_date < p_start_date then
    raise exception 'Intervallo date non valido';
  end if;

  insert into public.closures(start_date, end_date, reason)
  values (p_start_date, p_end_date, nullif(trim(p_reason), ''))
  returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.create_admin_time_block(
  p_access_token uuid,
  p_block_date date,
  p_start_time time,
  p_end_time time,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if not public.is_admin_token(p_access_token) then
    raise exception 'Accesso amministratore non autorizzato';
  end if;

  if p_end_time <= p_start_time then
    raise exception 'Intervallo orario non valido';
  end if;

  insert into public.time_blocks(block_date, start_time, end_time, reason)
  values (p_block_date, p_start_time, p_end_time, nullif(trim(p_reason), ''))
  returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.get_admin_closures_and_blocks(
  p_access_token uuid
)
returns table (
  item_type text,
  item_id uuid,
  start_date date,
  end_date date,
  start_time time,
  end_time time,
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
  select
    'closure'::text,
    c.id,
    c.start_date,
    c.end_date,
    null::time,
    null::time,
    c.reason
  from public.closures c

  union all

  select
    'block'::text,
    b.id,
    b.block_date,
    b.block_date,
    b.start_time,
    b.end_time,
    b.reason
  from public.time_blocks b

  order by start_date, start_time nulls first;
end;
$$;

create or replace function public.delete_admin_closure(
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

  delete from public.closures where id = p_id;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.delete_admin_time_block(
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

  delete from public.time_blocks where id = p_id;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.get_booking_rules_for_date(
  p_booking_date date
)
returns table (
  is_closed boolean,
  blocked_times time[]
)
language sql
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.closures c
      where p_booking_date between c.start_date and c.end_date
    ),
    coalesce(
      (
        select array_agg(slot_time order by slot_time)
        from (
          select distinct gs::time as slot_time
          from public.time_blocks tb
          cross join lateral generate_series(
            p_booking_date + tb.start_time,
            p_booking_date + tb.end_time - interval '30 minutes',
            interval '30 minutes'
          ) gs
          where tb.block_date = p_booking_date
        ) generated_slots
      ),
      array[]::time[]
    );
$$;

create or replace function public.check_booking_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelled' then
    return new;
  end if;

  if exists (
    select 1
    from public.closures c
    where new.booking_date between c.start_date and c.end_date
  ) then
    raise exception 'Il salone è chiuso in questa data';
  end if;

  if exists (
    select 1
    from public.time_blocks tb
    where tb.block_date = new.booking_date
      and new.booking_time >= tb.start_time
      and new.booking_time < tb.end_time
  ) then
    raise exception 'Questa fascia oraria non è disponibile';
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

revoke all on function public.is_admin_token(uuid) from public;
revoke all on function public.create_admin_closure(uuid, date, date, text) from public;
revoke all on function public.create_admin_time_block(uuid, date, time, time, text) from public;
revoke all on function public.get_admin_closures_and_blocks(uuid) from public;
revoke all on function public.delete_admin_closure(uuid, uuid) from public;
revoke all on function public.delete_admin_time_block(uuid, uuid) from public;
revoke all on function public.get_booking_rules_for_date(date) from public;

grant execute on function public.create_admin_closure(uuid, date, date, text)
to anon, authenticated;

grant execute on function public.create_admin_time_block(uuid, date, time, time, text)
to anon, authenticated;

grant execute on function public.get_admin_closures_and_blocks(uuid)
to anon, authenticated;

grant execute on function public.delete_admin_closure(uuid, uuid)
to anon, authenticated;

grant execute on function public.delete_admin_time_block(uuid, uuid)
to anon, authenticated;

grant execute on function public.get_booking_rules_for_date(date)
to anon, authenticated;
