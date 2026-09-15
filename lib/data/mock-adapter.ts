import { AppError } from "@/lib/errors";
import {
  DEMO_MOVEMENTS,
  DEMO_PASSWORD,
  DEMO_RESERVE,
  DEMO_USERS,
} from "@/lib/demo-data";
import type {
  CreateReserveInput,
  MemberRole,
  MemberStatus,
  Movement,
  MovementCategory,
  Profile,
  PublicProfile,
  RefundShare,
  Reserve,
  ReserveMember,
  ReserveStatus,
  SpendInput,
} from "@/lib/types";
import { getSessionSlot, type DataAdapter, type ReserveEvents } from "./adapter";

/**
 * Adapter sin backend: localStorage para los datos + BroadcastChannel para el
 * tiempo real entre los dos iframes de /demo.
 *
 * Replica a mano las reglas de las funciones SQL (mismos códigos de error,
 * mismo redondeo del reparto). Si tocás una RPC en supabase/migrations,
 * revisá también esta implementación.
 */

const DB_KEY = "reserva-mock-db-v1";
const SESSION_KEY = (slot: string) => `reserva-mock-session-${slot}`;
const CHANNEL = "reserva-mock-sync";

/** Redondeo a centavos, igual que el numeric(14,2) de Postgres. */
const r2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

interface MockUser {
  id: string;
  email: string;
  password: string;
  name: string;
  alias: string;
  avatarUrl: string | null;
  walletBalance: number;
}
interface MockReserve {
  id: string;
  name: string;
  emoji: string;
  goalAmount: number;
  balance: number;
  currency: string;
  startsAt: string;
  endsAt: string;
  status: ReserveStatus;
  createdBy: string;
  createdAt: string;
  closedAt: string | null;
}
interface MockMember {
  reserveId: string;
  userId: string;
  role: MemberRole;
  status: MemberStatus;
  spendLimit: number | null;
  totalDeposited: number;
  totalSpent: number;
  invitedBy: string | null;
  joinedAt: string | null;
  createdAt: string;
}
interface MockDb {
  users: MockUser[];
  reserves: MockReserve[];
  members: MockMember[];
  movements: Movement[];
}

const uid = (): string =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}-${Date.now()}`;

const isoDaysFromNow = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Estado inicial: Juan, Sofi y el viaje a Bariloche ya en marcha. */
function seedDb(): MockDb {
  const users: MockUser[] = DEMO_USERS.map((u) => ({
    id: uid(),
    email: u.email,
    password: DEMO_PASSWORD,
    name: u.name,
    alias: u.alias,
    avatarUrl: null,
    walletBalance: u.walletBalance,
  }));
  const byKey = Object.fromEntries(
    DEMO_USERS.map((u, i) => [u.key, users[i]]),
  ) as Record<"juan" | "sofi", MockUser>;

  const reserveId = uid();
  const createdAt = new Date(Date.now() - 53 * 3600_000).toISOString();
  const reserve: MockReserve = {
    id: reserveId,
    name: DEMO_RESERVE.name,
    emoji: DEMO_RESERVE.emoji,
    goalAmount: DEMO_RESERVE.goalAmount,
    balance: 0,
    currency: "ARS",
    startsAt: isoDaysFromNow(DEMO_RESERVE.startsOffsetDays),
    endsAt: isoDaysFromNow(DEMO_RESERVE.endsOffsetDays),
    status: "active",
    createdBy: byKey.juan.id,
    createdAt,
    closedAt: null,
  };

  const members: MockMember[] = [
    {
      reserveId, userId: byKey.juan.id, role: "owner", status: "accepted",
      spendLimit: null, totalDeposited: 0, totalSpent: 0,
      invitedBy: null, joinedAt: createdAt, createdAt,
    },
    {
      reserveId, userId: byKey.sofi.id, role: "member", status: "accepted",
      spendLimit: null, totalDeposited: 0, totalSpent: 0,
      invitedBy: byKey.juan.id, joinedAt: createdAt, createdAt,
    },
  ];

  const movements: Movement[] = [];
  // Se reproduce el guion en orden para que los saldos queden consistentes,
  // igual que si las operaciones hubieran pasado por las RPC.
  for (const step of [...DEMO_MOVEMENTS].sort((a, b) => b.hoursAgo - a.hoursAgo)) {
    const user = byKey[step.by];
    const member = members.find((m) => m.userId === user.id)!;
    const at = new Date(Date.now() - step.hoursAgo * 3600_000).toISOString();

    if (step.kind === "deposit") {
      user.walletBalance = r2(user.walletBalance - step.amount);
      reserve.balance = r2(reserve.balance + step.amount);
      member.totalDeposited = r2(member.totalDeposited + step.amount);
      movements.push({
        id: uid(), reserveId, userId: user.id, type: "deposit", amount: step.amount,
        category: null, description: "Depósito a la reserva", merchant: null,
        balanceAfter: reserve.balance, createdAt: at,
      });
    } else {
      reserve.balance = r2(reserve.balance - step.amount);
      member.totalSpent = r2(member.totalSpent + step.amount);
      movements.push({
        id: uid(), reserveId, userId: user.id, type: "expense", amount: step.amount,
        category: step.category, description: step.description, merchant: step.merchant,
        balanceAfter: reserve.balance, createdAt: at,
      });
    }
  }

  return { users, reserves: [reserve], members, movements };
}

function loadDb(): MockDb {
  if (typeof window === "undefined") return { users: [], reserves: [], members: [], movements: [] };
  try {
    const raw = window.localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw) as MockDb;
  } catch {
    // localStorage bloqueado (modo privado): seguimos con datos frescos.
  }
  const fresh = seedDb();
  saveDb(fresh);
  return fresh;
}

function saveDb(db: MockDb): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    // Sin persistencia la demo igual funciona dentro de la pestaña.
  }
}

type SyncMessage =
  | { kind: "movement"; reserveId: string; movement: Movement }
  | { kind: "reserve"; reserveId: string }
  | { kind: "members"; reserveId: string };

export function createMockAdapter(): DataAdapter {
  const slot = getSessionSlot();
  const authListeners = new Set<(p: Profile | null) => void>();
  const reserveListeners = new Map<string, Set<ReserveEvents>>();

  const channel =
    typeof window !== "undefined" && "BroadcastChannel" in window
      ? new BroadcastChannel(CHANNEL)
      : null;

  /** Entrega un evento a las suscripciones locales de esta ventana. */
  function dispatch(message: SyncMessage): void {
    const listeners = reserveListeners.get(message.reserveId);
    if (!listeners) return;
    for (const events of listeners) {
      if (message.kind === "movement") events.onMovement?.(message.movement);
      if (message.kind === "reserve") events.onReserveChange?.();
      if (message.kind === "members") events.onMembersChange?.();
    }
  }

  // Los mensajes de la OTRA ventana (el otro "celular") entran por acá.
  if (channel) channel.onmessage = (event) => dispatch(event.data as SyncMessage);

  /** Emite local + al resto de las ventanas. Es el "realtime" del modo mock. */
  function broadcast(...messages: SyncMessage[]): void {
    for (const message of messages) {
      dispatch(message);
      channel?.postMessage(message);
    }
  }

  function currentUserId(): string | null {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(SESSION_KEY(slot));
    } catch {
      return null;
    }
  }

  function setCurrentUserId(id: string | null): void {
    if (typeof window === "undefined") return;
    try {
      if (id) window.localStorage.setItem(SESSION_KEY(slot), id);
      else window.localStorage.removeItem(SESSION_KEY(slot));
    } catch {
      // ignorado a propósito
    }
  }

  function requireUser(db: MockDb): MockUser {
    const id = currentUserId();
    const user = id ? db.users.find((u) => u.id === id) : undefined;
    if (!user) throw new AppError("not_authenticated");
    return user;
  }

  const toProfile = (u: MockUser): Profile => ({
    id: u.id,
    name: u.name,
    alias: u.alias,
    avatarUrl: u.avatarUrl,
    walletBalance: u.walletBalance,
  });

  function requireActiveReserve(db: MockDb, reserveId: string): MockReserve {
    const reserve = db.reserves.find((r) => r.id === reserveId);
    if (!reserve) throw new AppError("reserve_not_found");
    if (reserve.status !== "active") throw new AppError("reserve_closed");
    return reserve;
  }

  function requireAcceptedMember(db: MockDb, reserveId: string, userId: string): MockMember {
    const member = db.members.find(
      (m) => m.reserveId === reserveId && m.userId === userId && m.status === "accepted",
    );
    if (!member) throw new AppError("not_a_member");
    return member;
  }

  /**
   * Mismo reparto que compute_refund_split en SQL: cada parte se redondea por
   * separado y el resto de centavos va al mayor depositante, para que la suma
   * dé exactamente el sobrante.
   */
  function refundSplit(db: MockDb, reserveId: string): RefundShare[] {
    const reserve = db.reserves.find((r) => r.id === reserveId);
    if (!reserve) return [];

    const accepted = db.members
      .filter((m) => m.reserveId === reserveId && m.status === "accepted")
      .sort((a, b) => b.totalDeposited - a.totalDeposited || a.userId.localeCompare(b.userId));

    const total = r2(accepted.reduce((sum, m) => sum + m.totalDeposited, 0));

    const shares = accepted.map((m) => ({
      member: m,
      share: total > 0 && reserve.balance > 0 ? r2((reserve.balance * m.totalDeposited) / total) : 0,
    }));

    const assigned = r2(shares.reduce((sum, s) => sum + s.share, 0));
    const remainder = r2(reserve.balance - assigned);
    if (shares.length > 0) shares[0].share = r2(shares[0].share + remainder);

    return shares.map(({ member, share }) => {
      const user = db.users.find((u) => u.id === member.userId)!;
      return {
        userId: member.userId,
        name: user.name,
        alias: user.alias,
        avatarUrl: user.avatarUrl,
        totalDeposited: member.totalDeposited,
        refundAmount: share,
      };
    });
  }

  function reserveFor(db: MockDb, reserve: MockReserve, member: MockMember): Reserve {
    const inviter = member.invitedBy ? db.users.find((u) => u.id === member.invitedBy) : null;
    const accepted = db.members.filter((m) => m.reserveId === reserve.id && m.status === "accepted");
    return {
      id: reserve.id,
      name: reserve.name,
      emoji: reserve.emoji,
      goalAmount: reserve.goalAmount,
      balance: reserve.balance,
      currency: reserve.currency,
      startsAt: reserve.startsAt,
      endsAt: reserve.endsAt,
      status: reserve.status,
      createdBy: reserve.createdBy,
      createdAt: reserve.createdAt,
      closedAt: reserve.closedAt,
      myRole: member.role,
      myStatus: member.status,
      memberCount: accepted.length,
      totalDeposited: r2(accepted.reduce((sum, m) => sum + m.totalDeposited, 0)),
      inviterName: inviter?.name ?? null,
    };
  }

  return {
    kind: "mock",

    async getCurrentProfile() {
      const db = loadDb();
      const id = currentUserId();
      const user = id ? db.users.find((u) => u.id === id) : undefined;
      return user ? toProfile(user) : null;
    },

    onAuthChange(listener) {
      authListeners.add(listener);
      return () => authListeners.delete(listener);
    },

    async signIn(email, password) {
      const db = loadDb();
      const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
      if (!user || user.password !== password) throw new AppError("invalid_credentials");
      setCurrentUserId(user.id);
      const profile = toProfile(user);
      authListeners.forEach((l) => l(profile));
      return profile;
    },

    async signUp({ email, password, name, alias }) {
      const db = loadDb();
      const normalizedEmail = email.trim().toLowerCase();
      const normalizedAlias = alias.trim().toLowerCase();
      if (db.users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
        throw new AppError("email_taken");
      }
      if (db.users.some((u) => u.alias.toLowerCase() === normalizedAlias)) {
        throw new AppError("alias_taken");
      }
      const user: MockUser = {
        id: uid(), email: normalizedEmail, password, name: name.trim(),
        alias: normalizedAlias, avatarUrl: null, walletBalance: 500000,
      };
      db.users.push(user);
      saveDb(db);
      setCurrentUserId(user.id);
      const profile = toProfile(user);
      authListeners.forEach((l) => l(profile));
      return profile;
    },

    async signOut() {
      setCurrentUserId(null);
      authListeners.forEach((l) => l(null));
    },

    async getMyReserves() {
      const db = loadDb();
      const user = requireUser(db);
      return db.members
        .filter((m) => m.userId === user.id && m.status !== "declined")
        .map((m) => {
          const reserve = db.reserves.find((r) => r.id === m.reserveId);
          return reserve ? reserveFor(db, reserve, m) : null;
        })
        .filter((r): r is Reserve => r !== null)
        .sort(
          (a, b) =>
            Number(b.status === "active") - Number(a.status === "active") ||
            b.createdAt.localeCompare(a.createdAt),
        );
    },

    async getReserve(reserveId) {
      const db = loadDb();
      const user = requireUser(db);
      const reserve = db.reserves.find((r) => r.id === reserveId);
      const member = db.members.find(
        (m) => m.reserveId === reserveId && m.userId === user.id && m.status !== "declined",
      );
      return reserve && member ? reserveFor(db, reserve, member) : null;
    },

    async getReserveMembers(reserveId) {
      const db = loadDb();
      const user = requireUser(db);
      const mine = db.members.find(
        (m) => m.reserveId === reserveId && m.userId === user.id && m.status !== "declined",
      );
      if (!mine) throw new AppError("not_a_member");

      return db.members
        .filter((m) => m.reserveId === reserveId)
        .sort((a, b) => Number(b.role === "owner") - Number(a.role === "owner"))
        .map((m) => {
          const u = db.users.find((x) => x.id === m.userId)!;
          return {
            userId: m.userId, name: u.name, alias: u.alias, avatarUrl: u.avatarUrl,
            role: m.role, status: m.status, spendLimit: m.spendLimit,
            totalDeposited: m.totalDeposited, totalSpent: m.totalSpent, joinedAt: m.joinedAt,
          } satisfies ReserveMember;
        });
    },

    async getMovements(reserveId) {
      const db = loadDb();
      const user = requireUser(db);
      requireAcceptedMember(db, reserveId, user.id);
      return db.movements
        .filter((m) => m.reserveId === reserveId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async findProfileByAlias(alias) {
      const db = loadDb();
      requireUser(db);
      const user = db.users.find((u) => u.alias.toLowerCase() === alias.trim().toLowerCase());
      if (!user) return null;
      return {
        id: user.id, name: user.name, alias: user.alias, avatarUrl: user.avatarUrl,
      } satisfies PublicProfile;
    },

    async previewCloseReserve(reserveId) {
      const db = loadDb();
      const user = requireUser(db);
      requireAcceptedMember(db, reserveId, user.id);
      return refundSplit(db, reserveId);
    },

    async createReserve(input: CreateReserveInput) {
      const db = loadDb();
      const user = requireUser(db);
      if (!(input.goalAmount > 0)) throw new AppError("invalid_goal");
      if (input.endsAt < input.startsAt) throw new AppError("invalid_dates");

      const now = new Date().toISOString();
      const reserve: MockReserve = {
        id: uid(), name: input.name.trim(), emoji: input.emoji || "✈️",
        goalAmount: r2(input.goalAmount), balance: 0, currency: "ARS",
        startsAt: input.startsAt, endsAt: input.endsAt, status: "active",
        createdBy: user.id, createdAt: now, closedAt: null,
      };
      db.reserves.push(reserve);
      db.members.push({
        reserveId: reserve.id, userId: user.id, role: "owner", status: "accepted",
        spendLimit: null, totalDeposited: 0, totalSpent: 0,
        invitedBy: null, joinedAt: now, createdAt: now,
      });
      saveDb(db);
      return reserve.id;
    },

    async inviteMember(reserveId, alias, spendLimit) {
      const db = loadDb();
      const user = requireUser(db);
      const owner = db.members.find(
        (m) => m.reserveId === reserveId && m.userId === user.id && m.role === "owner" && m.status === "accepted",
      );
      if (!owner) throw new AppError("not_reserve_owner");
      requireActiveReserve(db, reserveId);

      const target = db.users.find((u) => u.alias.toLowerCase() === alias.trim().toLowerCase());
      if (!target) throw new AppError("alias_not_found");
      if (target.id === user.id) throw new AppError("cannot_invite_self");

      const existing = db.members.find((m) => m.reserveId === reserveId && m.userId === target.id);
      if (existing && (existing.status === "accepted" || existing.status === "invited")) {
        throw new AppError("already_invited");
      }

      if (existing) {
        existing.status = "invited";
        existing.spendLimit = spendLimit ?? null;
        existing.invitedBy = user.id;
        existing.joinedAt = null;
      } else {
        db.members.push({
          reserveId, userId: target.id, role: "member", status: "invited",
          spendLimit: spendLimit ?? null, totalDeposited: 0, totalSpent: 0,
          invitedBy: user.id, joinedAt: null, createdAt: new Date().toISOString(),
        });
      }
      saveDb(db);
      broadcast({ kind: "members", reserveId });
    },

    async respondToInvitation(reserveId, accept) {
      const db = loadDb();
      const user = requireUser(db);
      const member = db.members.find((m) => m.reserveId === reserveId && m.userId === user.id);
      if (!member) throw new AppError("invitation_not_found");
      if (member.status !== "invited") throw new AppError("invitation_already_answered");
      requireActiveReserve(db, reserveId);

      member.status = accept ? "accepted" : "declined";
      member.joinedAt = accept ? new Date().toISOString() : null;
      saveDb(db);
      broadcast({ kind: "members", reserveId });
      return member.status;
    },

    async deposit(reserveId, amount) {
      const db = loadDb();
      const user = requireUser(db);
      const value = r2(amount);
      if (!(value > 0)) throw new AppError("invalid_amount");

      const reserve = requireActiveReserve(db, reserveId);
      const member = requireAcceptedMember(db, reserveId, user.id);
      if (user.walletBalance < value) throw new AppError("insufficient_wallet_funds");

      user.walletBalance = r2(user.walletBalance - value);
      reserve.balance = r2(reserve.balance + value);
      member.totalDeposited = r2(member.totalDeposited + value);

      const movement: Movement = {
        id: uid(), reserveId, userId: user.id, type: "deposit", amount: value,
        category: null, description: "Depósito a la reserva", merchant: null,
        balanceAfter: reserve.balance, createdAt: new Date().toISOString(),
      };
      db.movements.push(movement);
      saveDb(db);

      broadcast(
        { kind: "movement", reserveId, movement },
        { kind: "reserve", reserveId },
        { kind: "members", reserveId },
      );
      return reserve.balance;
    },

    async spend(input: SpendInput) {
      const db = loadDb();
      const user = requireUser(db);
      const value = r2(input.amount);
      if (!(value > 0)) throw new AppError("invalid_amount");
      if (!input.category) throw new AppError("category_required");

      const reserve = requireActiveReserve(db, input.reserveId);
      const member = requireAcceptedMember(db, input.reserveId, user.id);

      if (reserve.balance < value) throw new AppError("insufficient_reserve_funds");
      if (member.spendLimit !== null && r2(member.totalSpent + value) > member.spendLimit) {
        throw new AppError("spend_limit_exceeded");
      }

      reserve.balance = r2(reserve.balance - value);
      member.totalSpent = r2(member.totalSpent + value);

      const movement: Movement = {
        id: uid(), reserveId: input.reserveId, userId: user.id, type: "expense",
        amount: value, category: input.category as MovementCategory,
        description: input.description?.trim() || null,
        merchant: input.merchant?.trim() || null,
        balanceAfter: reserve.balance, createdAt: new Date().toISOString(),
      };
      db.movements.push(movement);
      saveDb(db);

      broadcast(
        { kind: "movement", reserveId: input.reserveId, movement },
        { kind: "reserve", reserveId: input.reserveId },
        { kind: "members", reserveId: input.reserveId },
      );
      return movement.id;
    },

    async closeReserve(reserveId) {
      const db = loadDb();
      const user = requireUser(db);
      const reserve = requireActiveReserve(db, reserveId);
      const owner = db.members.find(
        (m) => m.reserveId === reserveId && m.userId === user.id && m.role === "owner" && m.status === "accepted",
      );
      if (!owner) throw new AppError("not_reserve_owner");

      // El reparto se calcula ANTES de vaciar la reserva.
      const split = refundSplit(db, reserveId);
      let running = reserve.balance;

      for (const share of split) {
        if (share.refundAmount <= 0) continue;
        running = r2(running - share.refundAmount);
        const target = db.users.find((u) => u.id === share.userId);
        if (target) target.walletBalance = r2(target.walletBalance + share.refundAmount);
        db.movements.push({
          id: uid(), reserveId, userId: share.userId, type: "refund",
          amount: share.refundAmount, category: null,
          description: "Devolución del sobrante", merchant: null,
          balanceAfter: running, createdAt: new Date().toISOString(),
        });
      }

      reserve.balance = 0;
      reserve.status = "closed";
      reserve.closedAt = new Date().toISOString();
      saveDb(db);

      broadcast({ kind: "reserve", reserveId }, { kind: "members", reserveId });
      return split;
    },

    subscribeToReserve(reserveId, events) {
      let set = reserveListeners.get(reserveId);
      if (!set) {
        set = new Set();
        reserveListeners.set(reserveId, set);
      }
      set.add(events);
      return () => {
        set?.delete(events);
        if (set && set.size === 0) reserveListeners.delete(reserveId);
      };
    },
  };
}

/** Vuelve a dejar la demo como recién sembrada (botón "Reiniciar demo"). */
export function resetMockDb(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DB_KEY);
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("reserva-mock-session-")) window.localStorage.removeItem(key);
    }
  } catch {
    // ignorado a propósito
  }
}
