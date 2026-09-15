# Reserva Compartida

Prototipo funcional de una feature conceptual para una billetera virtual: una
**reserva de dinero temporal compartida entre varias personas**.

Dos personas (o más) depositan en una reserva común, cada una paga desde su
celular, ven los movimientos del otro **en tiempo real**, y al terminar el viaje
la reserva se cierra y el sobrante vuelve a cada billetera **en proporción a lo
que aportó cada uno**.

> **Concepto no oficial · Prototipo con fines demostrativos.**
> No se mueve dinero real: todo el saldo es simulado. No está afiliado a ninguna
> billetera existente ni usa su marca.

---

## Cómo verlo en 30 segundos

No hace falta configurar nada. Sin credenciales de Supabase, la app arranca en
**modo mock**: los datos viven en el navegador y el tiempo real funciona entre
pestañas con `BroadcastChannel`.

```bash
npm install
npm run dev
```

- **http://localhost:3000** → la billetera (entrá con los botones "Juan" o "Sofi")
- **http://localhost:3000/demo** → los dos celulares lado a lado, para grabar

Pagá desde un teléfono y mirá cómo el movimiento aparece en el otro, con
animación de entrada y el aviso *"Juan pagó $ 20.100,00 · Cervecería del Lago"*.

---

## Las pantallas

| | Pantalla | Qué hace |
|---|---|---|
| 1 | **Home** | Saldo de la billetera, accesos rápidos y las reservas activas con su avance hacia la meta. |
| 2 | **Crear reserva** | Wizard de 3 pasos: nombre + emoji → meta y fechas → invitar por alias. |
| 3 | **Aceptar invitación** | Quién te invita, nombre del viaje, fechas, meta y quiénes ya están adentro. |
| 4 | **Detalle** | Saldo grande, barra hacia la meta, días restantes, aporte y gasto por persona, y el feed en vivo. |
| 5 | **Pagar** | Cámara simulada con un botón que inventa un comercio, elección de categoría y confirmación. |
| 6 | **Resumen** | Gasto por categoría (dona) y por persona, y cierre de la reserva con vista previa del reparto. |

---

## Cómo funciona

### El saldo nunca se calcula en el cliente

Toda operación de dinero pasa por una función SQL transaccional. El rol
`authenticated` de Postgres **solo tiene permiso de lectura**: no existe ningún
camino por el cual el navegador escriba un monto directamente.

| RPC | Qué valida |
|---|---|
| `deposit_to_reserve` | Saldo suficiente en la billetera, reserva activa, que seas miembro. |
| `spend_from_reserve` | Saldo de la reserva y el `spend_limit` acumulado del miembro. |
| `close_reserve` | Que seas quien la creó; reparte, acredita y cierra, todo en una transacción. |
| `invite_member` / `respond_to_invitation` | Alias existente, que no esté ya invitado, que la reserva siga activa. |

Cada una toma un `select ... for update` sobre la reserva **antes** que sobre los
perfiles. El orden es siempre el mismo a propósito: si depositar lockeara el
perfil primero, un depósito y un cierre concurrentes se tomarían los recursos
cruzados y deadlockearían.

### El reparto del sobrante cierra al centavo

`share_i = round(sobrante × aporte_i / aporte_total, 2)`.

Redondear cada parte por separado deja un resto de centavos, así que el resto va
íntegro al mayor depositante. La suma de las devoluciones da **exactamente** el
sobrante en vez de dejar $0,01 colgado en la reserva:

```
Sobrante $ 211.650,00 · aportes 300.000 y 225.000
  → $ 120.942,86 + $ 90.707,14 = $ 211.650,00 ✓
```

### RLS

- **Miembro aceptado**: ve la reserva, los miembros y los movimientos.
- **Invitado que todavía no aceptó**: ve la reserva (para poder decidir), **no** los gastos.
- **Ajeno**: no ve nada.

Los datos de los co-miembros salen de `get_reserve_members`, que devuelve solo
campos públicos: el `wallet_balance` de otra persona nunca sale del servidor.

Las policies se apoyan en helpers `security definer` porque una policy sobre
`reserve_members` que consulte `reserve_members` entra en recursión infinita.

### Tiempo real

`reserve_movements`, `shared_reserves` y `reserve_members` están en la
publicación `supabase_realtime`. El cliente se suscribe con `postgres_changes`
filtrando por `reserve_id`, así que cada suscriptor recibe solo las filas que sus
policies le permiten ver: el realtime hereda la misma seguridad que las lecturas.

### Dos sesiones en una sola pestaña

`/demo` muestra dos iframes, pero dos iframes del mismo origen comparten
`localStorage` y estarían logueados con el **mismo** usuario. Cada iframe lleva
un slot en la URL (`?s=a` / `?s=b`) que se usa como clave de storage de la
sesión, y así Juan y Sofi conviven en una pestaña. Por eso la autenticación es
client-side y no hay middleware de auth: RLS es la única frontera real.

---

## Modo Supabase (el camino real)

En cuanto definís `NEXT_PUBLIC_SUPABASE_URL`, la app deja de usar el mock.

**1. Creá el proyecto** en [supabase.com](https://supabase.com) y copiá las variables:

```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...        # Settings → API → anon public
SUPABASE_SERVICE_ROLE_KEY=eyJ...            # Settings → API → service_role (solo local)
```

> La `service_role` saltea RLS y crea usuarios. Solo la usa `npm run seed` desde
> tu máquina: nunca la expongas en el cliente ni la subas al repo.

**2. Desactivá la confirmación por email** en *Authentication → Providers →
Email*. Sin esto el signup no devuelve sesión y el auto-login de `/demo` no anda.

**3. Aplicá las migraciones**, en orden, desde el *SQL Editor* del panel:

```
supabase/migrations/20260915120001_schema.sql     tablas, tipos, trigger de alta
supabase/migrations/20260915120002_rls.sql        helpers, policies y permisos
supabase/migrations/20260915120003_rpc.sql        las funciones transaccionales
supabase/migrations/20260915120004_realtime.sql   publicación de realtime
```

Con la [CLI de Supabase](https://supabase.com/docs/guides/cli) es directo:

```bash
supabase link --project-ref <tu-ref>
supabase db push
```

**4. Sembrá la demo**:

```bash
npm run seed
```

Crea a Juan y a Sofi (contraseña `reserva-demo-2026`) y la reserva
*"Viaje a Bariloche 🏔️"* con 9 movimientos. Es idempotente: borra la reserva de
demo anterior y la rehace, así podés dejar todo prolijo justo antes de grabar.

**5. Listo**: `npm run dev` y entrá a `/demo`.

---

## Grabar el video

1. `npm run dev` y abrí **`/demo`** en pantalla completa.
2. Los teléfonos se escalan solos para entrar enteros en la ventana, sin scroll.
3. Tocá **Pagar** en uno de los dos → **Escanear** → **Pagar $…**
4. El otro teléfono muestra el aviso, suma la fila al feed y actualiza el saldo,
   sin recargar.
5. **Reiniciar demo** deja todo como al principio para la próxima toma.

---

## Verificación

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run build        # next build
npm run test:sql     # suite SQL contra un Postgres local efímero
```

`npm run test:sql` levanta un Postgres temporal (requiere `postgresql-16`
instalado localmente; no toca tu proyecto de Supabase), aplica las migraciones
reales sobre un stub del schema `auth`, y verifica:

- el flujo completo: alta → crear → invitar → aceptar → depositar → gastar;
- que el reparto del sobrante cierre exacto, incluido el caso que no divide
  ($100 entre 3) y una proporción despareja (70/30);
- que se rechacen gasto sin saldo, depósito sin fondos, exceso de `spend_limit`,
  operar sobre una reserva cerrada y cerrar sin ser quien la creó;
- el aislamiento por RLS entre miembro, invitado y ajeno, y que toda escritura
  directa a las tablas sea denegada.

El aislamiento de saldo bajo concurrencia también se verificó: 20 pagos
simultáneos de $15 sobre una reserva con $100 dejan entrar exactamente 6, con
saldo final $10 y sin quedar nunca en negativo.

---

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · framer-motion ·
recharts · Supabase (Auth + Postgres + Realtime + RLS) · PWA instalable.

```
app/                    rutas (todas client-side; la auth vive en el navegador)
components/
  screens/              una pantalla por archivo
  ui/                   primitivas: Button, Card, Sheet, Avatar, ProgressBar…
lib/
  data/                 adapter.ts (interfaz) + supabase-adapter + mock-adapter
  demo-data.ts          el guion de la demo, compartido por el mock y el seed
  format.ts             moneda y fechas es-AR
supabase/
  migrations/           SQL versionado
  tests/                suite SQL + runner
scripts/seed.ts         siembra la demo en un Supabase real
```

### Los dos adapters

Las pantallas hablan con una sola interfaz (`lib/data/adapter.ts`). Hay dos
implementaciones:

- **`supabase-adapter`**: el camino real; delega todo saldo en las RPC.
- **`mock-adapter`**: `localStorage` + `BroadcastChannel`, para que la demo corra
  sin backend.

El mock **replica a mano** las reglas de las RPC, incluido el redondeo del
reparto. Si tocás una función en `supabase/migrations/`, revisá también
`lib/data/mock-adapter.ts`.

---

## Deploy en Vercel

Importá el repo y cargá las variables de entorno (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` y `NEXT_PUBLIC_DEMO_MODE`). No cargues la
`SUPABASE_SERVICE_ROLE_KEY`: el seed corre desde tu máquina.

`NEXT_PUBLIC_DEMO_MODE=false` esconde los botones de entrada rápida y desactiva
el auto-login de `/demo`.
