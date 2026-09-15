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

/** Eventos de tiempo real de una reserva. */
export interface ReserveEvents {
  /** Llega un movimiento nuevo (propio o de otro miembro). */
  onMovement?: (movement: Movement) => void;
  /** Cambió el saldo o el estado de la reserva. */
  onReserveChange?: () => void;
  /** Cambió la lista de miembros o sus aportes/gastos. */
  onMembersChange?: () => void;
}

/**
 * Única puerta de entrada a los datos.
 *
 * Hay dos implementaciones: `supabase-adapter` (la real, que delega todo saldo
 * en las RPC transaccionales) y `mock-adapter` (localStorage + BroadcastChannel,
 * para que la demo corra sin backend). Las pantallas no saben cuál está activa.
 *
 * Ningún método calcula saldos: los montos siempre vienen ya consolidados.
 */
export interface DataAdapter {
  readonly kind: "supabase" | "mock";

  // ── Auth ────────────────────────────────────────────────────────────────
  getCurrentProfile(): Promise<Profile | null>;
  onAuthChange(listener: (profile: Profile | null) => void): () => void;
  signIn(email: string, password: string): Promise<Profile>;
  signUp(input: {
    email: string;
    password: string;
    name: string;
    alias: string;
  }): Promise<Profile>;
  signOut(): Promise<void>;

  // ── Lecturas ────────────────────────────────────────────────────────────
  getMyReserves(): Promise<Reserve[]>;
  getReserve(reserveId: string): Promise<Reserve | null>;
  getReserveMembers(reserveId: string): Promise<ReserveMember[]>;
  getMovements(reserveId: string): Promise<Movement[]>;
  findProfileByAlias(alias: string): Promise<PublicProfile | null>;
  previewCloseReserve(reserveId: string): Promise<RefundShare[]>;

  // ── Operaciones (siempre transaccionales del lado del servidor) ──────────
  createReserve(input: CreateReserveInput): Promise<string>;
  inviteMember(reserveId: string, alias: string, spendLimit?: number | null): Promise<void>;
  respondToInvitation(reserveId: string, accept: boolean): Promise<MemberStatus>;
  deposit(reserveId: string, amount: number): Promise<number>;
  spend(input: SpendInput): Promise<string>;
  closeReserve(reserveId: string): Promise<RefundShare[]>;

  // ── Tiempo real ─────────────────────────────────────────────────────────
  subscribeToReserve(reserveId: string, events: ReserveEvents): () => void;
}

/**
 * Slot de sesión. Dos iframes en el mismo origen comparten localStorage, así
 * que por defecto serían el MISMO usuario. Leyendo `?s=` de la URL y usando
 * una clave de storage distinta por slot, `/demo` puede tener a Juan y a Sofi
 * logueados a la vez en una sola pestaña.
 */
let resolvedSlot: string | null = null;

export function getSessionSlot(): string {
  if (typeof window === "undefined") return "default";
  // Se resuelve UNA vez por ventana: al navegar, la URL pierde el ?s= y una
  // segunda lectura devolvería "default", cambiando de sesión a mitad de uso.
  if (resolvedSlot !== null) return resolvedSlot;

  const raw = new URLSearchParams(window.location.search).get("s");
  resolvedSlot = raw && /^[a-z0-9_-]{1,16}$/i.test(raw) ? raw.toLowerCase() : "default";
  return resolvedSlot;
}
