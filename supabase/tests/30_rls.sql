\set ON_ERROR_STOP on
-- Setup como superusuario (RLS no aplica a superusuario: por eso después
-- cambiamos a `authenticated`, que es el rol real del cliente con JWT).
select test_signup('owner@r.test','Owner','owner.r') as owner_id \gset
select test_signup('mate@r.test','Mate','mate.r')    as mate_id  \gset
select test_signup('inv@r.test','Invitado','inv.r')  as inv_id   \gset
select test_signup('out@r.test','Ajeno','out.r')     as out_id   \gset

select test_login(:'owner_id');
select public.create_reserve('Privada','🔒',1000,current_date,current_date+5) as res \gset
select public.invite_member(:'res','mate.r',null);
select public.invite_member(:'res','inv.r',null);
select test_login(:'mate_id');
select public.respond_to_invitation(:'res', true);
select test_login(:'owner_id');
select public.deposit_to_reserve(:'res', 5000);
select public.spend_from_reserve(:'res', 1200, 'comida','Almuerzo','Bodegón');

\echo '── RLS como rol authenticated ──'

-- MIEMBRO ACEPTADO: ve todo.
set session role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'mate_id')::text, false);
select 'miembro ve la reserva' as caso, count(*) as filas from public.shared_reserves;
select 'miembro ve los movimientos' as caso, count(*) as filas from public.reserve_movements;
select 'miembro ve su propio perfil' as caso, count(*) as filas from public.profiles;

-- INVITADO (no aceptó): ve la reserva para poder decidir, pero NO los gastos.
select set_config('request.jwt.claims', json_build_object('sub', :'inv_id')::text, false);
select 'invitado ve la reserva' as caso, count(*) as filas from public.shared_reserves;
select 'invitado NO ve movimientos' as caso, count(*) as filas from public.reserve_movements;

-- AJENO: no ve nada.
select set_config('request.jwt.claims', json_build_object('sub', :'out_id')::text, false);
select 'ajeno NO ve la reserva' as caso, count(*) as filas from public.shared_reserves;
select 'ajeno NO ve movimientos' as caso, count(*) as filas from public.reserve_movements;
select 'ajeno NO ve miembros' as caso, count(*) as filas from public.reserve_members;
select 'ajeno solo ve su perfil' as caso, count(*) as filas from public.profiles;

\echo '── escrituras directas: TODAS deben fallar ──'
\set ON_ERROR_STOP off
update public.profiles set wallet_balance = 99999999 where id = :'out_id';
update public.shared_reserves set balance = 99999999 where id = :'res';
insert into public.reserve_movements (reserve_id, user_id, type, amount, balance_after)
  values (:'res', :'out_id', 'deposit', 100, 100);
insert into public.reserve_members (reserve_id, user_id) values (:'res', :'out_id');
select public.compute_refund_split(:'res');
\set ON_ERROR_STOP on

\echo '── RPC de lectura ajena ──'
\set ON_ERROR_STOP off
select * from public.get_reserve_members(:'res');
\set ON_ERROR_STOP on

reset role;
select set_config('request.jwt.claims', null, false);
