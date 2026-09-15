/** Tipos del dominio. Espejan 1:1 el esquema de supabase/migrations. */

export type ReserveStatus = "active" | "closed";
export type MemberRole = "owner" | "member";
export type MemberStatus = "invited" | "accepted" | "declined";
export type MovementType = "deposit" | "expense" | "refund";
export type MovementCategory =
  | "comida"
  | "alojamiento"
  | "transporte"
  | "actividades"
  | "otros";

export const CATEGORIES: MovementCategory[] = [
  "comida",
  "alojamiento",
  "transporte",
  "actividades",
  "otros",
];

export interface Profile {
  id: string;
  name: string;
  alias: string;
  avatarUrl: string | null;
  walletBalance: number;
}

/** Datos públicos de otra persona: nunca incluye su saldo de billetera. */
export interface PublicProfile {
  id: string;
  name: string;
  alias: string;
  avatarUrl: string | null;
}

export interface Reserve {
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
  myRole: MemberRole;
  myStatus: MemberStatus;
  memberCount: number;
  /** Suma de aportes de todos los miembros aceptados: el avance hacia la meta. */
  totalDeposited: number;
  inviterName: string | null;
}

export interface ReserveMember {
  userId: string;
  name: string;
  alias: string;
  avatarUrl: string | null;
  role: MemberRole;
  status: MemberStatus;
  spendLimit: number | null;
  totalDeposited: number;
  totalSpent: number;
  joinedAt: string | null;
}

export interface Movement {
  id: string;
  reserveId: string;
  userId: string;
  type: MovementType;
  amount: number;
  category: MovementCategory | null;
  description: string | null;
  merchant: string | null;
  balanceAfter: number;
  createdAt: string;
}

export interface RefundShare {
  userId: string;
  name: string;
  alias: string;
  avatarUrl: string | null;
  totalDeposited: number;
  refundAmount: number;
}

export interface SpendInput {
  reserveId: string;
  amount: number;
  category: MovementCategory;
  description?: string | null;
  merchant?: string | null;
}

export interface CreateReserveInput {
  name: string;
  emoji: string;
  goalAmount: number;
  startsAt: string;
  endsAt: string;
}
