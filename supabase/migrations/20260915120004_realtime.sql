-- ═══════════════════════════════════════════════════════════════════════════
-- Reserva Compartida — Realtime
--
-- El cliente se suscribe vía postgres_changes filtrando por reserve_id. Cada
-- suscriptor recibe SOLO las filas que sus policies de SELECT le permiten ver,
-- así que el realtime hereda la misma seguridad que las lecturas normales.
-- ═══════════════════════════════════════════════════════════════════════════

-- REPLICA IDENTITY FULL hace que los UPDATE viajen con la fila completa. Sin
-- esto el payload de `old` llega solo con la PK y no se puede animar el cambio
-- de saldo ni saber qué miembro se actualizó.
alter table public.reserve_movements replica identity full;
alter table public.shared_reserves   replica identity full;
alter table public.reserve_members   replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;

-- Idempotente: re-agregar una tabla ya publicada es un error, así que se chequea.
do $$
declare
  t text;
begin
  foreach t in array array['reserve_movements', 'shared_reserves', 'reserve_members'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
