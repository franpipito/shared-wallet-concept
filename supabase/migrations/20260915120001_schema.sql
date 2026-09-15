-- ═══════════════════════════════════════════════════════════════════════════
-- Reserva Compartida — esquema base
--
-- Prototipo demostrativo: el saldo es simulado, no representa dinero real.
-- Todos los montos son numeric(14,2): los centavos importan para que el
-- reparto proporcional del sobrante cierre exacto contra el saldo.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ── Tipos ──────────────────────────────────────────────────────────────────

create type public.reserve_status    as enum ('active', 'closed');
create type public.member_role       as enum ('owner', 'member');
create type public.member_status     as enum ('invited', 'accepted', 'declined');
create type public.movement_type     as enum ('deposit', 'expense', 'refund');
create type public.movement_category as enum ('comida', 'alojamiento', 'transporte', 'actividades', 'otros');

-- ── profiles ───────────────────────────────────────────────────────────────
-- Espejo de auth.users con el saldo simulado de la billetera personal.

create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  name           text   not null check (length(trim(name)) between 1 and 60),
  alias          citext not null unique check (alias ~ '^[a-z0-9][a-z0-9.]{2,39}$'),
  avatar_url     text,
  wallet_balance numeric(14, 2) not null default 500000 check (wallet_balance >= 0),
  created_at     timestamptz not null default now()
);

comment on column public.profiles.wallet_balance is
  'Saldo simulado. Solo lo mueven las funciones RPC; el rol authenticated no puede escribirlo.';
comment on column public.profiles.alias is
  'Alias público estilo "juan.viaje.mp". citext => la búsqueda al invitar es case-insensitive.';

-- ── shared_reserves ────────────────────────────────────────────────────────

create table public.shared_reserves (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 60),
  emoji       text not null default '✈️',
  goal_amount numeric(14, 2) not null check (goal_amount > 0),
  balance     numeric(14, 2) not null default 0 check (balance >= 0),
  currency    text not null default 'ARS' check (currency = 'ARS'),
  starts_at   date not null,
  ends_at     date not null,
  status      public.reserve_status not null default 'active',
  created_by  uuid not null references public.profiles (id),
  created_at  timestamptz not null default now(),
  closed_at   timestamptz,
  constraint reserve_dates_ordered check (ends_at >= starts_at),
  constraint closed_at_matches_status check (
    (status = 'closed' and closed_at is not null) or
    (status = 'active' and closed_at is null)
  )
);

-- ── reserve_members ────────────────────────────────────────────────────────

create table public.reserve_members (
  reserve_id      uuid not null references public.shared_reserves (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  role            public.member_role   not null default 'member',
  status          public.member_status not null default 'invited',
  spend_limit     numeric(14, 2) check (spend_limit >= 0),
  total_deposited numeric(14, 2) not null default 0 check (total_deposited >= 0),
  total_spent     numeric(14, 2) not null default 0 check (total_spent >= 0),
  invited_by      uuid references public.profiles (id),
  joined_at       timestamptz,
  created_at      timestamptz not null default now(),
  primary key (reserve_id, user_id)
);

comment on column public.reserve_members.spend_limit is
  'Tope ACUMULADO de gasto del miembro en esta reserva (no por transacción). null = sin tope.';
comment on column public.reserve_members.total_spent is
  'Denormalizado para validar spend_limit sin agregar en cada pago y para mostrar el aporte/gasto por persona.';

-- Una reserva tiene exactamente un owner.
create unique index reserve_members_single_owner
  on public.reserve_members (reserve_id)
  where role = 'owner';

create index reserve_members_by_user
  on public.reserve_members (user_id, status);

-- ── reserve_movements ──────────────────────────────────────────────────────

create table public.reserve_movements (
  id            uuid primary key default gen_random_uuid(),
  reserve_id    uuid not null references public.shared_reserves (id) on delete cascade,
  user_id       uuid not null references public.profiles (id),
  type          public.movement_type not null,
  amount        numeric(14, 2) not null check (amount > 0),
  category      public.movement_category,
  description   text check (description is null or length(description) <= 140),
  merchant      text check (merchant is null or length(merchant) <= 80),
  balance_after numeric(14, 2) not null check (balance_after >= 0),
  -- clock_timestamp() y NO now(): now() devuelve la hora de INICIO de la
  -- transacción, así que los refunds que close_reserve inserta en un solo
  -- commit quedarían con el mismo instante y el feed los ordenaría al azar.
  created_at    timestamptz not null default clock_timestamp(),
  -- Solo los gastos se categorizan; depósitos y devoluciones no.
  constraint expense_requires_category check (type <> 'expense' or category is not null)
);

-- El feed siempre se lee por reserva y en orden cronológico inverso.
create index reserve_movements_feed
  on public.reserve_movements (reserve_id, created_at desc, id desc);

-- ── Alta automática de perfil ──────────────────────────────────────────────
-- Corre como definer sobre auth.users: el usuario recién creado todavía no
-- tiene sesión, así que no puede insertar su propio profile vía RLS.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alias citext;
  v_base  text;
begin
  -- El alias llega desde el signup; si viene vacío o chocado, derivamos uno.
  v_base := lower(regexp_replace(
    coalesce(new.raw_user_meta_data ->> 'alias', split_part(new.email, '@', 1)),
    '[^a-z0-9.]', '', 'g'
  ));
  if length(v_base) < 3 then
    v_base := 'user' || substr(new.id::text, 1, 6);
  end if;

  v_alias := v_base;
  while exists (select 1 from public.profiles where alias = v_alias) loop
    v_alias := v_base || '.' || substr(md5(random()::text), 1, 4);
  end loop;

  insert into public.profiles (id, name, alias, avatar_url)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)),
    v_alias,
    new.raw_user_meta_data ->> 'avatar_url'
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
