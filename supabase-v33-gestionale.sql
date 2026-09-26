-- ============================================================
-- V33 — SEZIONE GESTIONALE (solo aggiunte, nessuna modifica)
-- ============================================================
-- Questo file NON tocca tabelle, funzioni o permessi esistenti.
-- Aggiunge solo due nuove funzioni di sola lettura, protette
-- dallo stesso controllo admin già usato ovunque (is_admin_token),
-- per alimentare la nuova sottosezione "Gestionale" dell'agenda.

-- 1) Prenotazioni confermate in un intervallo di date (per calcolare
--    incassi, numero clienti e servizi più richiesti in un periodo).
create or replace function public.get_bookings_range_for_admin(
  p_access_token uuid,
  p_start_date date,
  p_end_date date
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
  booking_source text
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
    b.service, b.price, b.booking_date, b.booking_time,
    coalesce(b.booking_source, 'customer')
  from public.bookings b
  join public.customers c on c.id = b.customer_id
  where b.status = 'confirmed'
    and b.booking_date between p_start_date and p_end_date
  order by b.booking_date, b.booking_time;
end;
$$;

-- 2) Rubrica clienti con statistiche aggregate su tutta la storia:
--    numero visite, spesa totale, ultima visita, servizio preferito.
create or replace function public.get_gestionale_clients(
  p_access_token uuid
)
returns table (
  customer_id uuid,
  first_name text,
  last_name text,
  phone text,
  total_visits bigint,
  total_spent numeric,
  last_visit date,
  favorite_service text
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
  with visit_stats as (
    select b.customer_id,
           count(*) as total_visits,
           sum(b.price) as total_spent,
           max(b.booking_date) as last_visit
    from public.bookings b
    where b.status = 'confirmed'
    group by b.customer_id
  ),
  service_counts as (
    select b.customer_id, b.service, count(*) as cnt
    from public.bookings b
    where b.status = 'confirmed'
    group by b.customer_id, b.service
  ),
  ranked_services as (
    select customer_id, service,
           row_number() over (partition by customer_id order by cnt desc) as rn
    from service_counts
  )
  select c.id, c.first_name, c.last_name, c.phone,
         vs.total_visits, vs.total_spent, vs.last_visit,
         rs.service
  from public.customers c
  join visit_stats vs on vs.customer_id = c.id
  left join ranked_services rs on rs.customer_id = c.id and rs.rn = 1
  order by vs.total_spent desc, vs.total_visits desc;
end;
$$;

revoke all on function public.get_bookings_range_for_admin(uuid, date, date) from public;
revoke all on function public.get_gestionale_clients(uuid) from public;

grant execute on function public.get_bookings_range_for_admin(uuid, date, date) to anon, authenticated;
grant execute on function public.get_gestionale_clients(uuid) to anon, authenticated;
