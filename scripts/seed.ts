/**
 * Siembra el modo demo en un proyecto de Supabase real.
 *
 *   npm run seed
 *
 * Usa la SERVICE ROLE KEY (saltea RLS y crea usuarios), así que corre SOLO
 * localmente y nunca desde el navegador.
 *
 * Es idempotente: borra la reserva de demo anterior y la vuelve a crear, para
 * que puedas dejar la demo prolija justo antes de grabar.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import {
  DEMO_MOVEMENTS,
  DEMO_PASSWORD,
  DEMO_RESERVE,
  DEMO_USERS,
  type DemoUser,
} from "../lib/demo-data";

config({ path: ".env.local" });
config({ path: ".env" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "\nFaltan variables de entorno.\n" +
      "  NEXT_PUBLIC_SUPABASE_URL   = https://xxxx.supabase.co\n" +
      "  SUPABASE_SERVICE_ROLE_KEY  = (Settings → API → service_role)\n\n" +
      "Copiá .env.example a .env.local y completalas.\n",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const isoDate = (offsetDays: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

/** Crea el usuario si no existe y devuelve su id. */
async function ensureUser(user: DemoUser): Promise<string> {
  const { data: created, error } = await admin.auth.admin.createUser({
    email: user.email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { name: user.name, alias: user.alias },
  });

  if (!error && created.user) {
    console.log(`  + ${user.name} <${user.email}>`);
    return created.user.id;
  }

  // Ya existía: lo buscamos entre los usuarios del proyecto.
  const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (listError) throw listError;

  const found = list.users.find((u) => u.email?.toLowerCase() === user.email.toLowerCase());
  if (!found) throw error ?? new Error(`No se pudo crear ni encontrar a ${user.email}`);

  // Reponemos la contraseña por si el proyecto venía de otra corrida.
  await admin.auth.admin.updateUserById(found.id, { password: DEMO_PASSWORD });
  console.log(`  = ${user.name} (ya existía)`);
  return found.id;
}

/** Cliente autenticado como ese usuario, para que las RPC vean el auth.uid() correcto. */
async function clientFor(email: string): Promise<SupabaseClient> {
  const client = createClient(url!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
  if (error) throw error;
  return client;
}

async function main() {
  console.log("\n▸ usuarios de demo");
  const ids: Record<string, string> = {};
  for (const user of DEMO_USERS) {
    ids[user.key] = await ensureUser(user);
  }

  const [owner, guest] = DEMO_USERS;

  console.log("\n▸ limpiando la reserva de demo anterior");
  // El borrado en cascada se lleva miembros y movimientos.
  const { error: delError } = await admin
    .from("shared_reserves")
    .delete()
    .eq("name", DEMO_RESERVE.name)
    .eq("created_by", ids[owner.key]);
  if (delError) throw delError;

  // Los saldos quedan como recién salidos de fábrica.
  for (const user of DEMO_USERS) {
    const { error } = await admin
      .from("profiles")
      .update({ wallet_balance: user.walletBalance, name: user.name, alias: user.alias })
      .eq("id", ids[user.key]);
    if (error) throw error;
  }

  console.log("\n▸ creando la reserva");
  const ownerClient = await clientFor(owner.email);
  const guestClient = await clientFor(guest.email);
  const clients: Record<string, SupabaseClient> = {
    [owner.key]: ownerClient,
    [guest.key]: guestClient,
  };

  const { data: reserveId, error: createError } = await ownerClient.rpc("create_reserve", {
    p_name: DEMO_RESERVE.name,
    p_emoji: DEMO_RESERVE.emoji,
    p_goal_amount: DEMO_RESERVE.goalAmount,
    p_starts_at: isoDate(DEMO_RESERVE.startsOffsetDays),
    p_ends_at: isoDate(DEMO_RESERVE.endsOffsetDays),
  });
  if (createError) throw createError;
  console.log(`  ${DEMO_RESERVE.emoji} ${DEMO_RESERVE.name} (${reserveId})`);

  const { error: inviteError } = await ownerClient.rpc("invite_member", {
    p_reserve: reserveId,
    p_alias: guest.alias,
    p_spend_limit: null,
  });
  if (inviteError) throw inviteError;

  const { error: acceptError } = await guestClient.rpc("respond_to_invitation", {
    p_reserve: reserveId,
    p_accept: true,
  });
  if (acceptError) throw acceptError;
  console.log(`  ${guest.name} aceptó la invitación`);

  console.log("\n▸ movimientos");
  // Se reproducen del más viejo al más nuevo: las RPC validan saldo, así que
  // el orden importa (no se puede gastar antes de depositar).
  const steps = [...DEMO_MOVEMENTS].sort((a, b) => b.hoursAgo - a.hoursAgo);

  for (const step of steps) {
    const client = clients[step.by];
    if (step.kind === "deposit") {
      const { error } = await client.rpc("deposit_to_reserve", {
        p_reserve: reserveId,
        p_amount: step.amount,
      });
      if (error) throw error;
      console.log(`  ↓ ${step.by} depositó ${step.amount}`);
    } else {
      const { error } = await client.rpc("spend_from_reserve", {
        p_reserve: reserveId,
        p_amount: step.amount,
        p_category: step.category,
        p_description: step.description,
        p_merchant: step.merchant,
      });
      if (error) throw error;
      console.log(`  ↑ ${step.by} pagó ${step.amount} en ${step.merchant}`);
    }
  }

  // created_at se fija con clock_timestamp() al insertar, así que sin este
  // ajuste los 9 movimientos quedarían todos con la hora del seed y el feed
  // mostraría "recién" en todos.
  console.log("\n▸ corrigiendo las fechas de los movimientos");
  const { data: rows, error: rowsError } = await admin
    .from("reserve_movements")
    .select("id, created_at")
    .eq("reserve_id", reserveId)
    .order("created_at", { ascending: true });
  if (rowsError) throw rowsError;

  for (let i = 0; i < rows.length && i < steps.length; i++) {
    const at = new Date(Date.now() - steps[i].hoursAgo * 3600_000).toISOString();
    const { error } = await admin
      .from("reserve_movements")
      .update({ created_at: at })
      .eq("id", rows[i].id);
    if (error) throw error;
  }

  const { data: final, error: finalError } = await admin
    .from("shared_reserves")
    .select("balance")
    .eq("id", reserveId)
    .single();
  if (finalError) throw finalError;

  console.log(
    `\n✅ listo. Saldo de la reserva: ${final.balance}\n` +
      `   Entrá con ${owner.email} o ${guest.email} (contraseña: ${DEMO_PASSWORD})\n` +
      `   O abrí /demo para ver los dos celulares lado a lado.\n`,
  );
}

main().catch((error) => {
  console.error("\n✗ el seed falló:\n", error);
  process.exit(1);
});
