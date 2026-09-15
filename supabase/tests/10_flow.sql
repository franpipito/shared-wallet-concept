\set ON_ERROR_STOP on
\timing off

-- Helpers del test: crear un usuario y "loguearse" como él.
create or replace function test_signup(p_email text, p_name text, p_alias text)
returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (v_id, p_email, jsonb_build_object('name', p_name, 'alias', p_alias));
  return v_id;
end; $$;

create or replace function test_login(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id)::text, false);
end; $$;

create or replace function assert_eq(p_got anyelement, p_want anyelement, p_what text)
returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception '✗ % => obtuve %, esperaba %', p_what, p_got, p_want;
  end if;
  raise notice '  ✓ % = %', p_what, p_got;
end; $$;

do $$
declare
  juan uuid; sofi uuid; nico uuid;
  res uuid; v numeric; v_status public.member_status; n int;
begin
  raise notice '── alta de usuarios (trigger handle_new_user) ──';
  juan := test_signup('juan@demo.test', 'Juan', 'juan.viaje.mp');
  sofi := test_signup('sofi@demo.test', 'Sofi', 'sofi.viaje.mp');
  nico := test_signup('nico@demo.test', 'Nico', 'nico.viaje.mp');

  perform assert_eq((select count(*)::int from public.profiles), 3, 'perfiles creados');
  perform assert_eq((select wallet_balance from public.profiles where id = juan), 500000::numeric, 'saldo inicial Juan');
  perform assert_eq((select alias::text from public.profiles where id = sofi), 'sofi.viaje.mp', 'alias Sofi');

  raise notice '── crear reserva + invitar + aceptar ──';
  perform test_login(juan);
  res := public.create_reserve('Viaje a Bariloche', '🏔️', 400000, current_date, current_date + 7);
  perform assert_eq((select role::text from public.reserve_members where reserve_id = res and user_id = juan), 'owner', 'Juan es owner');

  perform public.invite_member(res, 'SOFI.VIAJE.MP', null);  -- alias case-insensitive
  perform assert_eq((select status::text from public.reserve_members where reserve_id = res and user_id = sofi), 'invited', 'Sofi invitada');

  perform test_login(sofi);
  v_status := public.respond_to_invitation(res, true);
  perform assert_eq(v_status::text, 'accepted', 'Sofi acepta');

  raise notice '── depósitos ──';
  perform test_login(juan);
  v := public.deposit_to_reserve(res, 100000);
  perform assert_eq(v, 100000.00::numeric, 'saldo reserva tras depósito de Juan');
  perform assert_eq((select wallet_balance from public.profiles where id = juan), 400000.00::numeric, 'billetera Juan');

  perform test_login(sofi);
  v := public.deposit_to_reserve(res, 50000);
  perform assert_eq(v, 150000.00::numeric, 'saldo reserva tras depósito de Sofi');
  perform assert_eq((select total_deposited from public.reserve_members where reserve_id = res and user_id = sofi), 50000.00::numeric, 'aporte Sofi');

  raise notice '── gastos ──';
  perform public.spend_from_reserve(res, 12500, 'comida', 'Café', 'Café Martínez');
  perform assert_eq((select balance from public.shared_reserves where id = res), 137500.00::numeric, 'saldo tras gasto');
  perform assert_eq((select total_spent from public.reserve_members where reserve_id = res and user_id = sofi), 12500.00::numeric, 'gasto Sofi');
  perform assert_eq((select balance_after from public.reserve_movements where reserve_id = res order by created_at desc limit 1), 137500.00::numeric, 'balance_after del movimiento');

  raise notice '── validaciones que DEBEN fallar ──';
  begin
    perform public.spend_from_reserve(res, 999999, 'otros', null, null);
    raise exception '✗ permitió gastar más que el saldo de la reserva';
  exception when sqlstate 'P0001' then
    if SQLERRM <> 'insufficient_reserve_funds' then raise; end if;
    raise notice '  ✓ rechaza gasto sin saldo (insufficient_reserve_funds)';
  end;

  perform test_login(nico);
  begin
    perform public.deposit_to_reserve(res, 1000);
    raise exception '✗ permitió depositar a un NO miembro';
  exception when sqlstate 'P0001' then
    raise notice '  ✓ rechaza depósito de un no-miembro (%)', SQLERRM;
  end;

  begin
    perform public.close_reserve(res);
    raise exception '✗ permitió cerrar a alguien que no es owner';
  exception when sqlstate 'P0001' then
    raise notice '  ✓ solo el owner puede cerrar (%)', SQLERRM;
  end;

  raise notice '── spend_limit ──';
  perform test_login(juan);
  update public.reserve_members set spend_limit = 20000 where reserve_id = res and user_id = sofi;
  perform test_login(sofi);
  perform public.spend_from_reserve(res, 7000, 'transporte', 'Remis', 'Remises Sur');  -- 12500+7000=19500 <= 20000
  raise notice '  ✓ gasto dentro del límite acumulado';
  begin
    perform public.spend_from_reserve(res, 1000, 'otros', null, null);  -- 19500+1000 > 20000
    raise exception '✗ permitió superar el spend_limit';
  exception when sqlstate 'P0001' then
    if SQLERRM <> 'spend_limit_exceeded' then raise; end if;
    raise notice '  ✓ corta al superar el spend_limit acumulado';
  end;

  raise notice '── billetera insuficiente ──';
  begin
    perform public.deposit_to_reserve(res, 10000000);
    raise exception '✗ permitió depositar más de lo que hay en la billetera';
  exception when sqlstate 'P0001' then
    if SQLERRM <> 'insufficient_wallet_funds' then raise; end if;
    raise notice '  ✓ rechaza depósito sin saldo en billetera';
  end;
end; $$;
