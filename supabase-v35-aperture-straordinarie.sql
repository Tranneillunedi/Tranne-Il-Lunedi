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
