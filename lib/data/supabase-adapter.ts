import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type {
  CreateReserveInput,
  MemberStatus,
  Movement,
  Profile,
  PublicProfile,
  RefundShare,
  Reserve,
  ReserveMember,
  SpendInput,
} from "@/lib/types";
import { getSessionSlot, type DataAdapter, type ReserveEvents } from "./adapter";

// Filas tal como las devuelve Postgres (snake_case).
type ProfileRow = {
  id: string;
  name: string;
  alias: string;
  avatar_url: string | null;
  wallet_balance: number | string;
};
type ReserveRow = {
  id: string;
  name: string;
  emoji: string;
  goal_amount: number | string;
  balance: number | string;
  currency: string;
  starts_at: string;
  ends_at: string;
  status: Reserve["status"];
  created_by: string;
  created_at: string;
  closed_at: string | null;
  my_role: Reserve["myRole"];
  my_status: MemberStatus;
  member_count: number | string;
  total_deposited: number | string;
  inviter_name: string | null;
};
type MemberRow = {
  user_id: string;
  name: string;
  alias: string;
  avatar_url: string | null;
  role: ReserveMember["role"];
  status: MemberStatus;
  spend_limit: number | string | null;
  total_deposited: number | string;
  total_spent: number | string;
  joined_at: string | null;
};
type MovementRow = {
  id: string;
  reserve_id: string;
  user_id: string;
  type: Movement["type"];
  amount: number | string;
  category: Movement["category"];
  description: string | null;
  merchant: string | null;
  balance_after: number | string;
  created_at: string;
};
type RefundRow = {
  user_id: string;
  name: string;
  alias: string;
  avatar_url: string | null;
  total_deposited: number | string;
  refund_amount: number | string;
};

/**
 * Postgres serializa `numeric` como STRING para no perder precisión en JSON.
 * Si no se convierte explícitamente, `saldo + monto` concatena en vez de sumar.
 */
const num = (value: number | string | null | undefined): number =>
  value === null || value === undefined ? 0 : typeof value === "number" ? value : Number(value);

const toProfile = (row: ProfileRow): Profile => ({
  id: row.id,
  name: row.name,
  alias: row.alias,
  avatarUrl: row.avatar_url,
  walletBalance: num(row.wallet_balance),
});

const toReserve = (row: ReserveRow): Reserve => ({
  id: row.id,
  name: row.name,
  emoji: row.emoji,
  goalAmount: num(row.goal_amount),
  balance: num(row.balance),
  currency: row.currency,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  status: row.status,
  createdBy: row.created_by,
  createdAt: row.created_at,
  closedAt: row.closed_at,
  myRole: row.my_role,
  myStatus: row.my_status,
  memberCount: num(row.member_count),
  totalDeposited: num(row.total_deposited),
  inviterName: row.inviter_name,
});

const toMember = (row: MemberRow): ReserveMember => ({
  userId: row.user_id,
  name: row.name,
  alias: row.alias,
  avatarUrl: row.avatar_url,
  role: row.role,
  status: row.status,
  spendLimit: row.spend_limit === null ? null : num(row.spend_limit),
  totalDeposited: num(row.total_deposited),
  totalSpent: num(row.total_spent),
  joinedAt: row.joined_at,
});

const toMovement = (row: MovementRow): Movement => ({
  id: row.id,
  reserveId: row.reserve_id,
  userId: row.user_id,
  type: row.type,
  amount: num(row.amount),
  category: row.category,
  description: row.description,
  merchant: row.merchant,
  balanceAfter: num(row.balance_after),
  createdAt: row.created_at,
});

const toRefund = (row: RefundRow): RefundShare => ({
  userId: row.user_id,
  name: row.name,
  alias: row.alias,
  avatarUrl: row.avatar_url,
  totalDeposited: num(row.total_deposited),
  refundAmount: num(row.refund_amount),
});

/** Los RPC levantan el código estable en `message`; lo reenviamos tal cual. */
function raise(error: { message: string; hint?: string | null } | null): never {
  throw new AppError(error?.message ?? "unknown", error?.hint ?? undefined);
}

export function createSupabaseAdapter(url: string, anonKey: string): DataAdapter {
  const slot = getSessionSlot();

  const client: SupabaseClient = createClient(url, anonKey, {
    auth: {
      // Clave de storage por slot: es lo que permite que /demo tenga dos
      // sesiones reales y distintas en la misma pestaña.
      storageKey: `sb-reserva-${slot}`,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  async function profileFor(userId: string): Promise<Profile> {
    const { data, error } = await client
      .from("profiles")
      .select("id, name, alias, avatar_url, wallet_balance")
      .eq("id", userId)
      .single();
    if (error) raise(error);
    return toProfile(data as ProfileRow);
  }

  return {
    kind: "supabase",

    async getCurrentProfile() {
      const { data } = await client.auth.getSession();
      if (!data.session?.user) return null;
      return profileFor(data.session.user.id);
    },

    onAuthChange(listener) {
      const { data } = client.auth.onAuthStateChange(async (_event, session) => {
        listener(session?.user ? await profileFor(session.user.id) : null);
      });
      return () => data.subscription.unsubscribe();
    },

    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error || !data.user) throw new AppError("invalid_credentials");
      return profileFor(data.user.id);
    },

    async signUp({ email, password, name, alias }) {
      const { data, error } = await client.auth.signUp({
        email,
        password,
        // El trigger handle_new_user lee esto para armar el profile.
        options: { data: { name, alias: alias.toLowerCase() } },
      });
      if (error) {
        throw new AppError(
          /already|registered|exists/i.test(error.message) ? "email_taken" : "unknown",
          error.message,
        );
      }
      if (!data.session || !data.user) {
        // Pasa cuando el proyecto pide confirmar el mail por correo.
        throw new AppError(
          "unknown",
          "Revisá tu casilla para confirmar la cuenta, o desactivá la confirmación por email en Supabase.",
        );
      }
      return profileFor(data.user.id);
    },

    async signOut() {
      await client.auth.signOut();
    },

    async getMyReserves() {
      const { data, error } = await client.rpc("get_my_reserves");
      if (error) raise(error);
      return ((data ?? []) as ReserveRow[]).map(toReserve);
    },

    async getReserve(reserveId) {
      // get_my_reserves ya trae mi rol y mi estado en cada reserva, que es lo
      // que necesitan las pantallas; filtrar acá evita un segundo endpoint.
      const { data, error } = await client.rpc("get_my_reserves");
      if (error) raise(error);
      const row = ((data ?? []) as ReserveRow[]).find((r) => r.id === reserveId);
      return row ? toReserve(row) : null;
    },

    async getReserveMembers(reserveId) {
      const { data, error } = await client.rpc("get_reserve_members", { p_reserve: reserveId });
      if (error) raise(error);
      return ((data ?? []) as MemberRow[]).map(toMember);
    },

    async getMovements(reserveId) {
      const { data, error } = await client
        .from("reserve_movements")
        .select("*")
        .eq("reserve_id", reserveId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) raise(error);
      return ((data ?? []) as MovementRow[]).map(toMovement);
    },

    async findProfileByAlias(alias) {
      const { data, error } = await client.rpc("find_profile_by_alias", {
        p_alias: alias.trim().toLowerCase(),
      });
      if (error) raise(error);
      const row = ((data ?? []) as PublicProfile[] & ProfileRow[])[0];
      if (!row) return null;
      return {
        id: row.id,
        name: row.name,
        alias: row.alias,
        avatarUrl: (row as ProfileRow).avatar_url ?? null,
      };
    },

    async previewCloseReserve(reserveId) {
      const { data, error } = await client.rpc("preview_close_reserve", { p_reserve: reserveId });
      if (error) raise(error);
      return ((data ?? []) as RefundRow[]).map(toRefund);
    },

    async createReserve(input: CreateReserveInput) {
      const { data, error } = await client.rpc("create_reserve", {
        p_name: input.name,
        p_emoji: input.emoji,
        p_goal_amount: input.goalAmount,
        p_starts_at: input.startsAt,
        p_ends_at: input.endsAt,
      });
      if (error) raise(error);
      return data as string;
    },

    async inviteMember(reserveId, alias, spendLimit) {
      const { error } = await client.rpc("invite_member", {
        p_reserve: reserveId,
        p_alias: alias.trim().toLowerCase(),
        p_spend_limit: spendLimit ?? null,
      });
      if (error) raise(error);
    },

    async respondToInvitation(reserveId, accept) {
      const { data, error } = await client.rpc("respond_to_invitation", {
        p_reserve: reserveId,
        p_accept: accept,
      });
      if (error) raise(error);
      return data as MemberStatus;
    },

    async deposit(reserveId, amount) {
      const { data, error } = await client.rpc("deposit_to_reserve", {
        p_reserve: reserveId,
        p_amount: amount,
      });
      if (error) raise(error);
      return num(data as number | string);
    },

    async spend(input: SpendInput) {
      const { data, error } = await client.rpc("spend_from_reserve", {
        p_reserve: input.reserveId,
        p_amount: input.amount,
        p_category: input.category,
        p_description: input.description ?? null,
        p_merchant: input.merchant ?? null,
      });
      if (error) raise(error);
      return data as string;
    },

    async closeReserve(reserveId) {
      const { data, error } = await client.rpc("close_reserve", { p_reserve: reserveId });
      if (error) raise(error);
      return ((data ?? []) as RefundRow[]).map(toRefund);
    },

    subscribeToReserve(reserveId, events: ReserveEvents) {
      const filter = `reserve_id=eq.${reserveId}`;

      // Cada suscriptor recibe solo las filas que sus policies le dejan ver:
      // el realtime hereda la misma seguridad que las lecturas normales.
      const channel: RealtimeChannel = client
        .channel(`reserve:${reserveId}:${slot}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "reserve_movements", filter },
          (payload) => events.onMovement?.(toMovement(payload.new as MovementRow)),
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "shared_reserves", filter: `id=eq.${reserveId}` },
          () => events.onReserveChange?.(),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "reserve_members", filter },
          () => events.onMembersChange?.(),
        )
        .subscribe();

      return () => {
        void client.removeChannel(channel);
      };
    },
  };
}
