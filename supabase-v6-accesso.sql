-- =========================================================
-- TRANNE IL LUNEDÌ — ACCESSO CLIENTE VERSIONE 6
-- Esegui questo script nello SQL Editor di Supabase.
-- =========================================================

drop function if exists public.login_customer_by_phone(text);

create or replace function public.login_customer_by_phone(
  p_phone text
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
set search_path = public, pg_temp
as $$
declare
  clean_phone text;
begin
  clean_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');

  if char_length(clean_phone) < 8 or char_length(clean_phone) > 15 then
    raise exception 'Numero di telefono non valido';
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
  limit 1;

  if not found then
    raise exception 'Cliente non trovato';
  end if;
end;
$$;

revoke all on function public.login_customer_by_phone(text) from public;
grant execute on function public.login_customer_by_phone(text) to anon, authenticated;
