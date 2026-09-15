-- ═══════════════════════════════════════════════════════════════════════════
-- Reserva Compartida — RLS
--
-- Modelo de permisos: el rol `authenticated` SOLO puede leer. Cada escritura
-- de saldo pasa por una función RPC security definer (migración 03). Así no
-- existe ningún camino por el cual el cliente escriba un monto directamente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Helpers ────────────────────────────────────────────────────────────────
-- Son security definer a propósito: una policy sobre reserve_members que
-- consulte reserve_members se autoinvoca y Postgres aborta por recursión
-- infinita. Al saltear RLS acá, la policy puede preguntar por la membresía.

create or replace function public.is_reserve_member(p_reserve uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.reserve_members m
    where m.reserve_id = p_reserve
      and m.user_id = (select auth.uid())
      and m.status = 'accepted'
  );
$$;

comment on function public.is_reserve_member(uuid) is
  'true si el usuario actual es miembro ACEPTADO de la reserva.';

create or replace function public.is_reserve_participant(p_reserve uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.reserve_members m
    where m.reserve_id = p_reserve
      and m.user_id = (select auth.uid())
      and m.status in ('accepted', 'invited')
  );
$$;

comment on function public.is_reserve_participant(uuid) is
  'true si el usuario actual es miembro aceptado O tiene una invitación pendiente (necesario para poder aceptarla).';

-- ── Privilegios de tabla ───────────────────────────────────────────────────
-- Se revoca todo y se vuelve a otorgar únicamente lectura.

revoke all on public.profiles          from anon, authenticated;
revoke all on public.shared_reserves   from anon, authenticated;
revoke all on public.reserve_members   from anon, authenticated;
revoke all on public.reserve_movements from anon, authenticated;

grant select on public.profiles          to authenticated;
grant select on public.shared_reserves   to authenticated;
grant select on public.reserve_members   to authenticated;
grant select on public.reserve_movements to authenticated;

-- Única escritura directa permitida, y deliberadamente sin wallet_balance.
grant update (name, avatar_url) on public.profiles to authenticated;

alter table public.profiles          enable row level security;
alter table public.shared_reserves   enable row level security;
alter table public.reserve_members   enable row level security;
alter table public.reserve_movements enable row level security;

-- ── profiles ───────────────────────────────────────────────────────────────
-- Solo el propio perfil. Los datos de los co-miembros (nombre, avatar, cuánto
-- aportó) salen de get_reserve_members, que devuelve campos públicos y nunca
-- el wallet_balance ajeno.

create policy "profiles: leo el mío"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

create policy "profiles: edito el mío"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ── shared_reserves ────────────────────────────────────────────────────────

create policy "reservas: las que comparto"
  on public.shared_reserves for select
  to authenticated
  using (public.is_reserve_participant(id));

-- ── reserve_members ────────────────────────────────────────────────────────

create policy "miembros: los de mis reservas"
  on public.reserve_members for select
  to authenticated
  using (public.is_reserve_participant(reserve_id));

-- ── reserve_movements ──────────────────────────────────────────────────────
-- Solo miembros ACEPTADOS: un invitado todavía no debería ver en qué gastaron.

create policy "movimientos: los de mis reservas aceptadas"
  on public.reserve_movements for select
  to authenticated
  using (public.is_reserve_member(reserve_id));
