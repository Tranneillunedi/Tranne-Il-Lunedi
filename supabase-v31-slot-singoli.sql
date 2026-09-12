-- TRANNE IL LUNEDÌ — V31
-- Blocchi persistenti delle singole caselle + Aggiusti vari €3.
-- NON modifica Auth e NON elimina/modifica le prenotazioni esistenti.
-- Eseguire UNA VOLTA in Supabase > SQL Editor.

create extension if not exists pgcrypto;

-- 1) Ogni prenotazione può appartenere alla casella 1 o 2.
alter table public.bookings
  add column if not exists slot_index smallint;

-- Valori ammessi: 0 = casella 1, 1 = casella 2.
alter table public.bookings
  drop constraint if exists bookings_slot_index_check;
alter table public.bookings
  add constraint bookings_slot_index_check
  check (slot_index is null or slot_index in (0,1));

-- Backfill delle prenotazioni vecchie: assegna 0/1 in base all'ordine di creazione.
with ranked as (
  select id,
         row_number() over (partition by booking_date, booking_time order by created_at, id) - 1 as rn
  from public.bookings
  where status = 'confirmed'
)
update public.bookings b
set slot_index = least(r.rn, 1)::smallint
from ranked r
where b.id = r.id
  and b.slot_index is null;

create unique index if not exists bookings_one_per_slot_idx
  on public.bookings(booking_date, booking_time, slot_index)
  where status = 'confirmed' and slot_index is not null;

-- 2) Tabella dei blocchi delle singole caselle.
create table if not exists public.slot_blocks (
  id uuid primary key default gen_random_uuid(),
  block_date date not null,
  block_time time not null,
  slot_index smallint not null check (slot_index in (0,1)),
  reason text,
  created_at timestamptz not null default now(),
  unique(block_date, block_time, slot_index)
);

alter table public.slot_blocks enable row level security;
revoke all on table public.slot_blocks from public, anon, authenticated;

-- 3) Trigger: nessuna prenotazione può entrare in una casella bloccata o occupata.
create or replace function public.enforce_single_slot_rules()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  chosen_slot smallint;
begin
  if new.status = 'cancelled' then
    return new;
  end if;

  -- Se non specificata, trova automaticamente la prima casella libera e non bloccata.
  if new.slot_index is null then
    select s.slot_index
    into chosen_slot
    from (values (0::smallint),(1::smallint)) s(slot_index)
    where not exists (
      select 1 from public.slot_blocks sb
      where sb.block_date = new.booking_date
        and sb.block_time = new.booking_time
        and sb.slot_index = s.slot_index
    )
    and not exists (
      select 1 from public.bookings b
      where b.id is distinct from new.id
        and b.booking_date = new.booking_date
        and b.booking_time = new.booking_time
        and b.slot_index = s.slot_index
        and b.status = 'confirmed'
    )
    order by s.slot_index
    limit 1;

    if chosen_slot is null then
      raise exception 'Questo orario non è disponibile';
    end if;
    new.slot_index := chosen_slot;
  end if;

  if exists (
    select 1 from public.slot_blocks sb
    where sb.block_date = new.booking_date
      and sb.block_time = new.booking_time
      and sb.slot_index = new.slot_index
  ) then
    raise exception 'Questa casella è bloccata';
  end if;

  if exists (
    select 1 from public.bookings b
    where b.id is distinct from new.id
      and b.booking_date = new.booking_date
      and b.booking_time = new.booking_time
      and b.slot_index = new.slot_index
      and b.status = 'confirmed'
  ) then
    raise exception 'Questa casella è già occupata';
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_single_slot_rules on public.bookings;
create trigger bookings_single_slot_rules
before insert or update of booking_date, booking_time, slot_index, status
on public.bookings
for each row execute function public.enforce_single_slot_rules();

-- 4) Lettura blocchi per i clienti: serve per disabilitare l'orario quando entrambe le caselle sono bloccate.
create or replace function public.get_day_slot_blocks(p_booking_date date)
returns table(block_time time, slot_index smallint)
language sql
security definer
set search_path = public, pg_temp
as $$
  select sb.block_time, sb.slot_index
  from public.slot_blocks sb
  where sb.block_date = p_booking_date
  order by sb.block_time, sb.slot_index;
$$;

-- 5) Lettura agenda admin con la casella precisa.
drop function if exists public.get_day_bookings_for_admin(uuid, date);
create function public.get_day_bookings_for_admin(
  p_access_token uuid,
  p_booking_date date
)
returns table (
  booking_id uuid, first_name text, last_name text, phone text,
  service text, price numeric, booking_date date, booking_time time,
  status text, booking_source text, notes text, slot_index smallint
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
  select b.id, c.first_name, c.last_name, c.phone,
    b.service, b.price, b.booking_date, b.booking_time, b.status,
    coalesce(b.booking_source,'customer'), b.notes, b.slot_index
  from public.bookings b
  join public.customers c on c.id = b.customer_id
  where b.booking_date = p_booking_date and b.status = 'confirmed'
  order by b.booking_time, b.slot_index, b.created_at;
end;
$$;

-- 6) Blocca/sblocca UNA SOLA casella, con controllo admin.
create or replace function public.set_admin_slot_block(
  p_access_token uuid,
  p_booking_date date,
  p_booking_time time,
  p_slot_index smallint,
  p_blocked boolean,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin_token(p_access_token) then
    raise exception 'Accesso amministratore non autorizzato';
  end if;
  if p_slot_index not in (0,1) then raise exception 'Casella non valida'; end if;
  if extract(minute from p_booking_time) not in (0,30) then raise exception 'Orario non valido'; end if;

  if p_blocked then
    if exists (
      select 1 from public.bookings b
      where b.booking_date=p_booking_date and b.booking_time=p_booking_time
        and b.slot_index=p_slot_index and b.status='confirmed'
    ) then raise exception 'La casella è già occupata da una prenotazione'; end if;
    insert into public.slot_blocks(block_date, block_time, slot_index, reason)
    values (p_booking_date, p_booking_time, p_slot_index, nullif(trim(p_reason),''))
    on conflict (block_date, block_time, slot_index)
    do update set reason=excluded.reason;
  else
    delete from public.slot_blocks
    where block_date=p_booking_date and block_time=p_booking_time and slot_index=p_slot_index;
  end if;
  return true;
end;
$$;

-- 7) Prenotazione manuale su una casella precisa.
create or replace function public.create_booking_for_admin_slot(
  p_access_token uuid, p_first_name text, p_last_name text, p_phone text,
  p_service text, p_booking_date date, p_booking_time time,
  p_notes text default null, p_slot_index smallint default null
)
returns table(booking_id uuid, booking_date date, booking_time time, service text, price numeric)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  clean_phone text; stored_phone text; selected_price numeric;
  saved_customer public.customers%rowtype; new_booking public.bookings%rowtype;
begin
  if not public.is_admin_token(p_access_token) then raise exception 'Accesso amministratore non autorizzato'; end if;
  if p_slot_index not in (0,1) then raise exception 'Casella non valida'; end if;
  clean_phone := regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
  if char_length(trim(coalesce(p_first_name,''))) < 2 or char_length(trim(coalesce(p_last_name,''))) < 2 then raise exception 'Nome o cognome non valido'; end if;
  if clean_phone <> '' and (char_length(clean_phone)<8 or char_length(clean_phone)>15) then raise exception 'Numero di telefono non valido'; end if;
  selected_price := case p_service
    when 'Taglio' then 17 when 'Taglio bambino (0-10 anni)' then 12
    when 'Completo' then 22 when 'Barba' then 5 when 'Aggiusti vari' then 3 else null end;
  if selected_price is null then raise exception 'Servizio non valido'; end if;
  if exists(select 1 from public.slot_blocks sb where sb.block_date=p_booking_date and sb.block_time=p_booking_time and sb.slot_index=p_slot_index) then raise exception 'Questa casella è bloccata'; end if;
  if exists(select 1 from public.bookings b where b.booking_date=p_booking_date and b.booking_time=p_booking_time and b.slot_index=p_slot_index and b.status='confirmed') then raise exception 'Questa casella è già occupata'; end if;
  if clean_phone <> '' then
    stored_phone := clean_phone;
    select * into saved_customer from public.customers c where c.phone=stored_phone limit 1;
  else stored_phone := 'MANUAL-' || replace(gen_random_uuid()::text,'-',''); end if;
  if saved_customer.id is null then
    insert into public.customers(first_name,last_name,phone) values(initcap(trim(p_first_name)),initcap(trim(p_last_name)),stored_phone) returning * into saved_customer;
  else
    update public.customers set first_name=initcap(trim(p_first_name)),last_name=initcap(trim(p_last_name)) where id=saved_customer.id returning * into saved_customer;
  end if;
  insert into public.bookings(customer_id,service,price,booking_date,booking_time,status,booking_source,notes,slot_index)
  values(saved_customer.id,p_service,selected_price,p_booking_date,p_booking_time,'confirmed','salon',nullif(trim(p_notes),''),p_slot_index)
  returning * into new_booking;
  return query select new_booking.id,new_booking.booking_date,new_booking.booking_time,new_booking.service,new_booking.price;
end;
$$;

-- 8) Corregge la prenotazione cliente e include Aggiusti vari €3.
drop function if exists public.create_booking(uuid,text,date,time);
create or replace function public.create_booking(
  p_access_token uuid, p_service text, p_booking_date date, p_booking_time time
)
returns table(booking_id uuid, booking_date date, booking_time time, service text, price numeric)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  c public.customers%rowtype; selected_price numeric; new_booking public.bookings%rowtype;
begin
  select * into c from public.customers where access_token=p_access_token limit 1;
  if c.id is null then raise exception 'Accesso cliente non valido'; end if;
  selected_price := case p_service
    when 'Taglio' then 17 when 'Taglio bambino (0-10 anni)' then 12
    when 'Completo' then 22 when 'Barba' then 5 when 'Aggiusti vari' then 3 else null end;
  if selected_price is null then raise exception 'Servizio non valido'; end if;
  if extract(minute from p_booking_time) not in (0,30) then raise exception 'Orario non valido'; end if;
  if exists(select 1 from public.closures x where p_booking_date between x.start_date and x.end_date) then raise exception 'Il salone è chiuso in questa data'; end if;
  if exists(select 1 from public.time_blocks x where x.block_date=p_booking_date and p_booking_time>=x.start_time and p_booking_time<x.end_time) then raise exception 'Questa fascia oraria è bloccata'; end if;
  insert into public.bookings(customer_id,service,price,booking_date,booking_time,status,booking_source,slot_index)
  values(c.id,p_service,selected_price,p_booking_date,p_booking_time,'confirmed','customer',null)
  returning * into new_booking;
  return query select new_booking.id,new_booking.booking_date,new_booking.booking_time,new_booking.service,new_booking.price;
end;
$$;

-- 9) Availability: prenotazioni + blocchi, massimo 2 caselle per mezz'ora.
create or replace function public.get_day_availability(p_booking_date date)
returns table(booking_time time, occupied bigint)
language sql security definer set search_path = public, pg_temp
as $$
  select t.booking_time, count(*)::bigint as occupied
  from (
    select b.booking_time from public.bookings b where b.booking_date=p_booking_date and b.status='confirmed'
    union all
    select sb.block_time from public.slot_blocks sb where sb.block_date=p_booking_date
  ) t
  group by t.booking_time
  order by t.booking_time;
$$;

revoke all on table public.slot_blocks from public, anon, authenticated;
revoke all on function public.get_day_slot_blocks(date) from public;
revoke all on function public.set_admin_slot_block(uuid,date,time,smallint,boolean,text) from public;
revoke all on function public.create_booking_for_admin_slot(uuid,text,text,text,text,date,time,text,smallint) from public;
revoke all on function public.create_booking(uuid,text,date,time) from public;
grant execute on function public.get_day_slot_blocks(date) to anon, authenticated;
grant execute on function public.set_admin_slot_block(uuid,date,time,smallint,boolean,text) to anon, authenticated;
grant execute on function public.create_booking_for_admin_slot(uuid,text,text,text,text,date,time,text,smallint) to anon, authenticated;
grant execute on function public.create_booking(uuid,text,date,time) to anon, authenticated;

-- 10) Versione aggiornata della prenotazione manuale generica (Aggiusti vari compreso).
drop function if exists public.create_booking_for_admin(uuid,text,text,text,text,date,time,text);
create or replace function public.create_booking_for_admin(
  p_access_token uuid, p_first_name text, p_last_name text, p_phone text,
  p_service text, p_booking_date date, p_booking_time time, p_notes text default null
)
returns table(booking_id uuid, booking_date date, booking_time time, service text, price numeric)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  clean_phone text; stored_phone text; selected_price numeric;
  saved_customer public.customers%rowtype; new_booking public.bookings%rowtype;
begin
  if not public.is_admin_token(p_access_token) then raise exception 'Accesso amministratore non autorizzato'; end if;
  clean_phone := regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
  if char_length(trim(coalesce(p_first_name,''))) < 2 or char_length(trim(coalesce(p_last_name,''))) < 2 then raise exception 'Nome o cognome non valido'; end if;
  if clean_phone <> '' and (char_length(clean_phone)<8 or char_length(clean_phone)>15) then raise exception 'Numero di telefono non valido'; end if;
  selected_price := case p_service
    when 'Taglio' then 17 when 'Taglio bambino (0-10 anni)' then 12
    when 'Completo' then 22 when 'Barba' then 5 when 'Aggiusti vari' then 3 else null end;
  if selected_price is null then raise exception 'Servizio non valido'; end if;
  if extract(minute from p_booking_time) not in (0,30) then raise exception 'Orario non valido'; end if;
  if clean_phone <> '' then
    stored_phone := clean_phone;
    select * into saved_customer from public.customers c where c.phone=stored_phone limit 1;
  else stored_phone := 'MANUAL-' || replace(gen_random_uuid()::text,'-',''); end if;
  if saved_customer.id is null then
    insert into public.customers(first_name,last_name,phone) values(initcap(trim(p_first_name)),initcap(trim(p_last_name)),stored_phone) returning * into saved_customer;
  else
    update public.customers set first_name=initcap(trim(p_first_name)),last_name=initcap(trim(p_last_name)) where id=saved_customer.id returning * into saved_customer;
  end if;
  insert into public.bookings(customer_id,service,price,booking_date,booking_time,status,booking_source,notes,slot_index)
  values(saved_customer.id,p_service,selected_price,p_booking_date,p_booking_time,'confirmed','salon',nullif(trim(p_notes),''),null)
  returning * into new_booking;
  return query select new_booking.id,new_booking.booking_date,new_booking.booking_time,new_booking.service,new_booking.price;
end;
$$;

revoke all on function public.create_booking_for_admin(uuid,text,text,text,text,date,time,text) from public;
revoke all on function public.create_booking_for_admin_slot(uuid,text,text,text,text,date,time,text,smallint) from public;
grant execute on function public.create_booking_for_admin(uuid,text,text,text,text,date,time,text) to anon, authenticated;
grant execute on function public.create_booking_for_admin_slot(uuid,text,text,text,text,date,time,text,smallint) to anon, authenticated;
