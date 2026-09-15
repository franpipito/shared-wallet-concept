-- ═══════════════════════════════════════════════════════════════════════════
-- Reserva Compartida — RPCs transaccionales
--
-- Toda operación de saldo vive acá. El cliente nunca calcula ni escribe un
-- monto: llama a una de estas funciones y recibe el estado ya consolidado.
--
-- ORDEN DE LOCKS: siempre la reserva PRIMERO y después los perfiles (ordenados
-- por id). Si depositar lockeara el perfil antes que la reserva, un depósito y
-- un cierre concurrentes se tomarían los recursos cruzados y deadlockearían.
--
-- ERRORES: el `message` es un código estable en inglés que el cliente traduce
-- (lib/errors.ts); el `hint` lleva el texto en castellano como respaldo.
-- ═══════════════════════════════════════════════════════════════════════════

create type public.refund_share as (
  user_id         uuid,
  name            text,
  alias           text,
  avatar_url      text,
  total_deposited numeric,
  refund_amount   numeric
);

-- ── Crear reserva ──────────────────────────────────────────────────────────

create or replace function public.create_reserve(
  p_name        text,
  p_emoji       text,
  p_goal_amount numeric,
  p_starts_at   date,
  p_ends_at     date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001', hint = 'Iniciá sesión para continuar.';
  end if;
  if p_goal_amount is null or p_goal_amount <= 0 then
    raise exception 'invalid_goal' using errcode = 'P0001', hint = 'La meta tiene que ser mayor a cero.';
  end if;
  if p_ends_at < p_starts_at then
    raise exception 'invalid_dates' using errcode = 'P0001', hint = 'La fecha de fin no puede ser anterior al inicio.';
  end if;

  insert into shared_reserves (name, emoji, goal_amount, starts_at, ends_at, created_by)
  values (
    trim(p_name),
    coalesce(nullif(trim(p_emoji), ''), '✈️'),
    round(p_goal_amount, 2),
    p_starts_at,
    p_ends_at,
    v_uid
  )
  returning id into v_id;

  insert into reserve_members (reserve_id, user_id, role, status, joined_at)
  values (v_id, v_uid, 'owner', 'accepted', now());

  return v_id;
end;
$$;

-- ── Invitaciones ───────────────────────────────────────────────────────────

create or replace function public.find_profile_by_alias(p_alias text)
returns table (id uuid, name text, alias text, avatar_url text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = 'P0001', hint = 'Iniciá sesión para continuar.';
  end if;

  -- Devuelve solo campos públicos: nunca el wallet_balance de un tercero.
  return query
    select p.id, p.name, p.alias, p.avatar_url
    from profiles p
    where p.alias = lower(trim(p_alias))
    limit 1;
end;
$$;

create or replace function public.invite_member(
  p_reserve     uuid,
  p_alias       text,
  p_spend_limit numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_target uuid;
  v_status public.member_status;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001', hint = 'Iniciá sesión para continuar.';
  end if;

  if not exists (
    select 1 from reserve_members m
    where m.reserve_id = p_reserve and m.user_id = v_uid and m.role = 'owner' and m.status = 'accepted'
  ) then
    raise exception 'not_reserve_owner' using errcode = 'P0001', hint = 'Solo quien creó la reserva puede invitar.';
  end if;

  if (select status from shared_reserves where id = p_reserve) <> 'active' then
    raise exception 'reserve_closed' using errcode = 'P0001', hint = 'La reserva ya está cerrada.';
  end if;

  select p.id into v_target from profiles p where p.alias = lower(trim(p_alias));
  if v_target is null then
    raise exception 'alias_not_found' using errcode = 'P0001', hint = 'No encontramos a nadie con ese alias.';
  end if;
  if v_target = v_uid then
    raise exception 'cannot_invite_self' using errcode = 'P0001', hint = 'Ya sos parte de esta reserva.';
  end if;

  select m.status into v_status
  from reserve_members m
  where m.reserve_id = p_reserve and m.user_id = v_target;

  if v_status in ('accepted', 'invited') then
    raise exception 'already_invited' using errcode = 'P0001', hint = 'Esa persona ya está invitada.';
  end if;

  -- Si había rechazado antes, se reutiliza la fila en lugar de duplicarla.
  insert into reserve_members (reserve_id, user_id, role, status, spend_limit, invited_by)
  values (p_reserve, v_target, 'member', 'invited', round(p_spend_limit, 2), v_uid)
  on conflict (reserve_id, user_id) do update
    set status      = 'invited',
        spend_limit = excluded.spend_limit,
        invited_by  = excluded.invited_by,
        joined_at   = null;

  return v_target;
end;
$$;

create or replace function public.respond_to_invitation(p_reserve uuid, p_accept boolean)
returns public.member_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_status public.member_status;
  v_new    public.member_status;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001', hint = 'Iniciá sesión para continuar.';
  end if;

  select m.status into v_status
  from reserve_members m
  where m.reserve_id = p_reserve and m.user_id = v_uid
  for update;

  if v_status is null then
    raise exception 'invitation_not_found' using errcode = 'P0001', hint = 'Esta invitación ya no está disponible.';
  end if;
  if v_status <> 'invited' then
    raise exception 'invitation_already_answered' using errcode = 'P0001', hint = 'Esta invitación ya fue respondida.';
  end if;
  if (select status from shared_reserves where id = p_reserve) <> 'active' then
    raise exception 'reserve_closed' using errcode = 'P0001', hint = 'La reserva ya está cerrada.';
  end if;

  v_new := case when p_accept then 'accepted' else 'declined' end;

  update reserve_members
  set status    = v_new,
      joined_at = case when p_accept then now() else null end
  where reserve_id = p_reserve and user_id = v_uid;

  return v_new;
end;
$$;

-- ── Depositar ──────────────────────────────────────────────────────────────

create or replace function public.deposit_to_reserve(p_reserve uuid, p_amount numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid         uuid := (select auth.uid());
  v_amount      numeric(14, 2) := round(p_amount, 2);
  v_status      public.reserve_status;
  v_new_balance numeric(14, 2);
  v_wallet      numeric(14, 2);
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001', hint = 'Iniciá sesión para continuar.';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'invalid_amount' using errcode = 'P0001', hint = 'Ingresá un monto mayor a cero.';
  end if;

  select status into v_status from shared_reserves where id = p_reserve for update;
  if v_status is null then
    raise exception 'reserve_not_found' using errcode = 'P0001', hint = 'No encontramos esta reserva.';
  end if;
  if v_status <> 'active' then
    raise exception 'reserve_closed' using errcode = 'P0001', hint = 'La reserva ya está cerrada.';
  end if;

  if not exists (
    select 1 from reserve_members m
    where m.reserve_id = p_reserve and m.user_id = v_uid and m.status = 'accepted'
  ) then
    raise exception 'not_a_member' using errcode = 'P0001', hint = 'No sos miembro de esta reserva.';
  end if;

  select wallet_balance into v_wallet from profiles where id = v_uid for update;
  if v_wallet < v_amount then
    raise exception 'insufficient_wallet_funds' using errcode = 'P0001', hint = 'No te alcanza el saldo de tu billetera.';
  end if;

  update profiles set wallet_balance = wallet_balance - v_amount where id = v_uid;

  update shared_reserves set balance = balance + v_amount
  where id = p_reserve
  returning balance into v_new_balance;

  update reserve_members set total_deposited = total_deposited + v_amount
  where reserve_id = p_reserve and user_id = v_uid;

  insert into reserve_movements (reserve_id, user_id, type, amount, description, balance_after)
  values (p_reserve, v_uid, 'deposit', v_amount, 'Depósito a la reserva', v_new_balance);

  return v_new_balance;
end;
$$;

-- ── Pagar ──────────────────────────────────────────────────────────────────

create or replace function public.spend_from_reserve(
  p_reserve     uuid,
  p_amount      numeric,
  p_category    public.movement_category,
  p_description text default null,
  p_merchant    text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid         uuid := (select auth.uid());
  v_amount      numeric(14, 2) := round(p_amount, 2);
  v_status      public.reserve_status;
  v_balance     numeric(14, 2);
  v_new_balance numeric(14, 2);
  v_member      reserve_members;
  v_movement    uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001', hint = 'Iniciá sesión para continuar.';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'invalid_amount' using errcode = 'P0001', hint = 'Ingresá un monto mayor a cero.';
  end if;
  if p_category is null then
    raise exception 'category_required' using errcode = 'P0001', hint = 'Elegí una categoría para el pago.';
  end if;

  select status, balance into v_status, v_balance
  from shared_reserves where id = p_reserve for update;

  if v_status is null then
    raise exception 'reserve_not_found' using errcode = 'P0001', hint = 'No encontramos esta reserva.';
  end if;
  if v_status <> 'active' then
    raise exception 'reserve_closed' using errcode = 'P0001', hint = 'La reserva ya está cerrada.';
  end if;

  select * into v_member from reserve_members
  where reserve_id = p_reserve and user_id = v_uid and status = 'accepted';

  if v_member is null then
    raise exception 'not_a_member' using errcode = 'P0001', hint = 'No sos miembro de esta reserva.';
  end if;

  if v_balance < v_amount then
    raise exception 'insufficient_reserve_funds' using errcode = 'P0001', hint = 'La reserva no tiene saldo suficiente.';
  end if;

  -- spend_limit es un tope ACUMULADO sobre lo que ya gastó este miembro.
  if v_member.spend_limit is not null and (v_member.total_spent + v_amount) > v_member.spend_limit then
    raise exception 'spend_limit_exceeded' using errcode = 'P0001', hint = 'Superás tu límite de gasto en esta reserva.';
  end if;

  update shared_reserves set balance = balance - v_amount
  where id = p_reserve
  returning balance into v_new_balance;

  update reserve_members set total_spent = total_spent + v_amount
  where reserve_id = p_reserve and user_id = v_uid;

  insert into reserve_movements (reserve_id, user_id, type, amount, category, description, merchant, balance_after)
  values (
    p_reserve, v_uid, 'expense', v_amount, p_category,
    nullif(trim(coalesce(p_description, '')), ''),
    nullif(trim(coalesce(p_merchant, '')), ''),
    v_new_balance
  )
  returning id into v_movement;

  return v_movement;
end;
$$;

-- ── Reparto del sobrante ───────────────────────────────────────────────────

create or replace function public.compute_refund_split(p_reserve uuid)
returns setof public.refund_share
language sql
stable
security definer
set search_path = public
as $$
  with r as (
    select balance from shared_reserves where id = p_reserve
  ),
  m as (
    select rm.user_id,
           rm.total_deposited,
           row_number() over (order by rm.total_deposited desc, rm.user_id) as rn
    from reserve_members rm
    where rm.reserve_id = p_reserve and rm.status = 'accepted'
  ),
  t as (
    select coalesce(sum(m.total_deposited), 0) as total from m
  ),
  shares as (
    select m.user_id,
           m.total_deposited,
           m.rn,
           case
             when t.total > 0 and r.balance > 0
               then round(r.balance * m.total_deposited / t.total, 2)
             else 0
           end as share
    from m cross join t cross join r
  ),
  -- Redondear cada parte por separado deja un resto de centavos. Se lo damos
  -- íntegro al mayor depositante (rn = 1) para que la suma cierre EXACTA
  -- contra el saldo: si no, la reserva quedaría con $0,01 colgado.
  adj as (
    select s.*,
           (select r.balance from r) - sum(s.share) over () as remainder
    from shares s
  )
  select a.user_id,
         p.name,
         p.alias,
         p.avatar_url,
         a.total_deposited,
         (a.share + case when a.rn = 1 then a.remainder else 0 end)::numeric(14, 2)
  from adj a
  join profiles p on p.id = a.user_id
  order by a.rn;
$$;

create or replace function public.preview_close_reserve(p_reserve uuid)
returns setof public.refund_share
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_reserve_member(p_reserve) then
    raise exception 'not_a_member' using errcode = 'P0001', hint = 'No sos miembro de esta reserva.';
  end if;
  return query select * from public.compute_refund_split(p_reserve);
end;
$$;

create or replace function public.close_reserve(p_reserve uuid)
returns setof public.refund_share
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_status  public.reserve_status;
  v_balance numeric(14, 2);
  v_running numeric(14, 2);
  v_split   public.refund_share[];
  v_row     public.refund_share;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001', hint = 'Iniciá sesión para continuar.';
  end if;

  select status, balance into v_status, v_balance
  from shared_reserves where id = p_reserve for update;

  if v_status is null then
    raise exception 'reserve_not_found' using errcode = 'P0001', hint = 'No encontramos esta reserva.';
  end if;
  if v_status <> 'active' then
    raise exception 'reserve_closed' using errcode = 'P0001', hint = 'La reserva ya está cerrada.';
  end if;

  if not exists (
    select 1 from reserve_members m
    where m.reserve_id = p_reserve and m.user_id = v_uid and m.role = 'owner' and m.status = 'accepted'
  ) then
    raise exception 'not_reserve_owner' using errcode = 'P0001', hint = 'Solo quien creó la reserva puede cerrarla.';
  end if;

  -- Lockeamos los perfiles destino ordenados por id: orden estable = sin deadlocks.
  perform 1
  from profiles p
  where p.id in (
    select m.user_id from reserve_members m
    where m.reserve_id = p_reserve and m.status = 'accepted'
  )
  order by p.id
  for update;

  -- El reparto se calcula ANTES de vaciar la reserva: después de poner
  -- balance = 0 la proporción daría todo cero.
  select array_agg(s) into v_split from public.compute_refund_split(p_reserve) s;

  v_running := v_balance;

  if v_split is not null then
    foreach v_row in array v_split loop
      if v_row.refund_amount > 0 then
        v_running := v_running - v_row.refund_amount;

        update profiles set wallet_balance = wallet_balance + v_row.refund_amount
        where id = v_row.user_id;

        insert into reserve_movements (reserve_id, user_id, type, amount, description, balance_after)
        values (p_reserve, v_row.user_id, 'refund', v_row.refund_amount, 'Devolución del sobrante', v_running);
      end if;
    end loop;
  end if;

  update shared_reserves
  set balance = 0, status = 'closed', closed_at = now()
  where id = p_reserve;

  return query select * from unnest(coalesce(v_split, array[]::public.refund_share[]));
end;
$$;

-- ── Lecturas ───────────────────────────────────────────────────────────────

create or replace function public.get_reserve_members(p_reserve uuid)
returns table (
  user_id         uuid,
  name            text,
  alias           text,
  avatar_url      text,
  role            public.member_role,
  status          public.member_status,
  spend_limit     numeric,
  total_deposited numeric,
  total_spent     numeric,
  joined_at       timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_reserve_participant(p_reserve) then
    raise exception 'not_a_member' using errcode = 'P0001', hint = 'No sos miembro de esta reserva.';
  end if;

  -- Campos públicos del perfil + su posición en la reserva. Nunca wallet_balance.
  return query
    select m.user_id, p.name, p.alias, p.avatar_url,
           m.role, m.status, m.spend_limit, m.total_deposited, m.total_spent, m.joined_at
    from reserve_members m
    join profiles p on p.id = m.user_id
    where m.reserve_id = p_reserve
    order by (m.role = 'owner') desc, m.created_at;
end;
$$;

create or replace function public.get_my_reserves()
returns table (
  id           uuid,
  name         text,
  emoji        text,
  goal_amount  numeric,
  balance      numeric,
  currency     text,
  starts_at    date,
  ends_at      date,
  status       public.reserve_status,
  created_by   uuid,
  created_at   timestamptz,
  closed_at    timestamptz,
  my_role         public.member_role,
  my_status       public.member_status,
  member_count    bigint,
  total_deposited numeric,
  inviter_name    text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001', hint = 'Iniciá sesión para continuar.';
  end if;

  -- Una sola ida y vuelta para la home: reservas activas, cerradas e
  -- invitaciones pendientes, con quién invitó (lo pide la pantalla de aceptar).
  return query
    select r.id, r.name, r.emoji, r.goal_amount, r.balance, r.currency,
           r.starts_at, r.ends_at, r.status, r.created_by, r.created_at, r.closed_at,
           me.role, me.status,
           (select count(*) from reserve_members c
             where c.reserve_id = r.id and c.status = 'accepted'),
           -- Lo aportado entre todos: es contra esto que se mide el avance
           -- hacia la meta. Usar el saldo haría RETROCEDER la barra al gastar.
           (select coalesce(sum(c.total_deposited), 0) from reserve_members c
             where c.reserve_id = r.id and c.status = 'accepted'),
           (select ip.name from profiles ip where ip.id = me.invited_by)
    from reserve_members me
    join shared_reserves r on r.id = me.reserve_id
    where me.user_id = v_uid and me.status in ('accepted', 'invited')
    order by (r.status = 'active') desc, r.created_at desc;
end;
$$;

-- ── Permisos de ejecución ──────────────────────────────────────────────────
-- Por defecto Postgres otorga EXECUTE a PUBLIC. Lo revocamos y habilitamos
-- solo al rol autenticado: sin sesión no se toca ningún saldo.

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'create_reserve(text, text, numeric, date, date)',
    'find_profile_by_alias(text)',
    'invite_member(uuid, text, numeric)',
    'respond_to_invitation(uuid, boolean)',
    'deposit_to_reserve(uuid, numeric)',
    'spend_from_reserve(uuid, numeric, public.movement_category, text, text)',
    'compute_refund_split(uuid)',
    'preview_close_reserve(uuid)',
    'close_reserve(uuid)',
    'get_reserve_members(uuid)',
    'get_my_reserves()',
    'is_reserve_member(uuid)',
    'is_reserve_participant(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end;
$$;

-- compute_refund_split es un detalle interno: solo lo usan close/preview.
revoke execute on function public.compute_refund_split(uuid) from authenticated;
