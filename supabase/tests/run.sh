#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Corre las migraciones y la suite de tests contra un Postgres LOCAL efímero.
# No toca tu proyecto de Supabase. Requiere postgresql-16 instalado.
#
#   ./supabase/tests/run.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PGPORT=${PGPORT:-55432}
PGDATA_DIR=${PGDATA_DIR:-/tmp/reserva-compartida-pgdata}
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

psql_() { psql -h /tmp -p "$PGPORT" -U postgres "$@"; }

cleanup() { "$PGBIN/pg_ctl" -D "$PGDATA_DIR" stop -m fast >/dev/null 2>&1 || true; }

if ! "$PGBIN/pg_ctl" -D "$PGDATA_DIR" status >/dev/null 2>&1; then
  echo "▸ levantando Postgres efímero en :$PGPORT"
  rm -rf "$PGDATA_DIR"; mkdir -p "$PGDATA_DIR"
  # Postgres se niega a correr como root; si lo sos, delegamos en el usuario postgres.
  if [ "$(id -u)" = "0" ]; then
    chown postgres:postgres "$PGDATA_DIR"; chmod 700 "$PGDATA_DIR"
    su postgres -c "$PGBIN/initdb -D $PGDATA_DIR -U postgres --auth=trust" >/dev/null
    su postgres -c "$PGBIN/pg_ctl -D $PGDATA_DIR -o '-p $PGPORT -k /tmp -c listen_addresses=' -l $PGDATA_DIR/server.log start" >/dev/null
  else
    "$PGBIN/initdb" -D "$PGDATA_DIR" -U postgres --auth=trust >/dev/null
    "$PGBIN/pg_ctl" -D "$PGDATA_DIR" -o "-p $PGPORT -k /tmp -c listen_addresses=" -l "$PGDATA_DIR/server.log" start >/dev/null
  fi
  trap cleanup EXIT
  sleep 2
fi

echo "▸ base limpia"
psql_ -q -c "drop database if exists reserva_test;" -c "create database reserva_test;"
psql_ -d reserva_test -q -v ON_ERROR_STOP=1 -f "$HERE/00_supabase_stub.sql"

echo "▸ migraciones"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "   $(basename "$f")"
  psql_ -d reserva_test -q -v ON_ERROR_STOP=1 -f "$f" 2>&1 \
    | grep -v 'wal_level\|Set wal_level\|already exists, skipping' || true
done

echo "▸ tests"
for f in "$HERE"/10_flow.sql "$HERE"/20_close.sql; do
  echo "── $(basename "$f")"
  psql_ -d reserva_test -q -v ON_ERROR_STOP=1 -f "$f" 2>&1 | sed 's/^psql:[^ ]* //;s/^NOTICE:  //'
done
echo "── 30_rls.sql"
psql_ -d reserva_test -f "$HERE/30_rls.sql" 2>&1 \
  | grep -v '^SET$\|^ set_config\|^-\+$\|^(1 row)$\|^$' | sed 's/^psql:[^ ]*[0-9]: //'

echo ""
echo "✅ suite SQL completa"
