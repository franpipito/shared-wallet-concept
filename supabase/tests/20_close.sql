\set ON_ERROR_STOP on
do $$
declare
  a uuid; b uuid; c uuid; res uuid;
  total_ref numeric; n int; r record;
begin
  raise notice '── cierre: reparto que NO divide exacto (3 iguales sobre $100) ──';
  a := test_signup('a@t.test','Ana','ana.t'); b := test_signup('b@t.test','Beto','beto.t'); c := test_signup('c@t.test','Caro','caro.t');

  perform test_login(a);
  res := public.create_reserve('Redondeo', '🧮', 1000, current_date, current_date + 1);
  perform public.invite_member(res, 'beto.t', null);
  perform public.invite_member(res, 'caro.t', null);
  perform test_login(b); perform public.respond_to_invitation(res, true);
  perform test_login(c); perform public.respond_to_invitation(res, true);

  perform test_login(a); perform public.deposit_to_reserve(res, 100);
  perform test_login(b); perform public.deposit_to_reserve(res, 100);
  perform test_login(c); perform public.deposit_to_reserve(res, 100);
  perform public.spend_from_reserve(res, 200, 'otros', 'Gasto', 'Comercio');

  perform assert_eq((select balance from public.shared_reserves where id = res), 100.00::numeric, 'sobrante a repartir');

  -- 100 / 3 = 33,3333... => si cada parte se redondea sola, la suma da 99,99.
  perform test_login(a);
  select sum(refund_amount), count(*) into total_ref, n from public.close_reserve(res);

  perform assert_eq(total_ref, 100.00::numeric, 'SUMA de devoluciones == sobrante (sin centavo colgado)');
  perform assert_eq(n, 3, 'una devolución por miembro');
  perform assert_eq((select balance from public.shared_reserves where id = res), 0.00::numeric, 'reserva queda en cero');
  perform assert_eq((select status::text from public.shared_reserves where id = res), 'closed', 'reserva cerrada');
  perform assert_eq((select count(*)::int from public.reserve_movements where reserve_id = res and type = 'refund'), 3, 'movimientos refund creados');
  perform assert_eq((select max(refund_amount) from (select refund_amount from public.compute_refund_split(res)) x), 0.00::numeric, 'tras cerrar ya no queda nada por repartir');

  -- El resto de $0,01 va al mayor depositante; los otros dos reciben 33,33.
  perform assert_eq((select count(*)::int from public.reserve_movements where reserve_id = res and type='refund' and amount = 33.34::numeric), 1, 'un refund de 33,34 (lleva el resto)');
  perform assert_eq((select count(*)::int from public.reserve_movements where reserve_id = res and type='refund' and amount = 33.33::numeric), 2, 'dos refunds de 33,33');

  raise notice '── cierre: proporción despareja ──';
  perform test_login(a);
  res := public.create_reserve('Despareja', '📐', 1000, current_date, current_date + 1);
  perform public.invite_member(res, 'beto.t', null);
  perform test_login(b); perform public.respond_to_invitation(res, true);

  perform test_login(a); perform public.deposit_to_reserve(res, 70000);
  perform test_login(b); perform public.deposit_to_reserve(res, 30000);
  perform public.spend_from_reserve(res, 33333.33, 'comida', 'Cena', 'Parrilla');

  perform assert_eq((select balance from public.shared_reserves where id = res), 66666.67::numeric, 'sobrante despareja');

  perform test_login(a);
  select sum(refund_amount) into total_ref from public.close_reserve(res);
  perform assert_eq(total_ref, 66666.67::numeric, 'SUMA devoluciones == sobrante (70/30)');
  -- 66666,67 * 0,7 = 46666,669 -> 46666,67 | * 0,3 = 20000,001 -> 20000,00
  perform assert_eq((select amount from public.reserve_movements where reserve_id = res and type='refund' and user_id = a), 46666.67::numeric, 'Ana recupera el 70%');
  perform assert_eq((select amount from public.reserve_movements where reserve_id = res and type='refund' and user_id = b), 20000.00::numeric, 'Beto recupera el 30%');

  raise notice '── cierre: reserva sin depósitos ──';
  perform test_login(a);
  res := public.create_reserve('Vacía', '🫙', 1000, current_date, current_date + 1);
  select coalesce(sum(refund_amount), 0) into total_ref from public.close_reserve(res);
  perform assert_eq(total_ref, 0::numeric, 'sin aportes no hay devoluciones');
  perform assert_eq((select status::text from public.shared_reserves where id = res), 'closed', 'igual se cierra');
  perform assert_eq((select count(*)::int from public.reserve_movements where reserve_id = res), 0, 'no crea movimientos fantasma');

  raise notice '── operar sobre una reserva cerrada ──';
  begin
    perform public.deposit_to_reserve(res, 100);
    raise exception '✗ permitió depositar en una reserva cerrada';
  exception when sqlstate 'P0001' then
    if SQLERRM <> 'reserve_closed' then raise; end if;
    raise notice '  ✓ rechaza depósito en reserva cerrada';
  end;
  begin
    perform public.close_reserve(res);
    raise exception '✗ permitió cerrar dos veces';
  exception when sqlstate 'P0001' then
    if SQLERRM <> 'reserve_closed' then raise; end if;
    raise notice '  ✓ no se puede cerrar dos veces (idempotencia por error)';
  end;
end; $$;
