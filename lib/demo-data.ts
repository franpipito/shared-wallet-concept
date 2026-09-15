import type { MovementCategory } from "@/lib/types";

/**
 * Guion de la demo, compartido por el modo mock y por scripts/seed.ts, para
 * que el video se vea igual con o sin Supabase detrás.
 */

export const DEMO_PASSWORD = "reserva-demo-2026";

export interface DemoUser {
  key: "juan" | "sofi";
  email: string;
  name: string;
  alias: string;
  walletBalance: number;
}

export const DEMO_USERS: DemoUser[] = [
  { key: "juan", email: "juan@reserva.demo", name: "Juan Pereyra", alias: "juan.viaje.mp", walletBalance: 500000 },
  { key: "sofi", email: "sofi@reserva.demo", name: "Sofi Ramírez", alias: "sofi.viaje.mp", walletBalance: 500000 },
];

export const DEMO_RESERVE = {
  name: "Viaje a Bariloche",
  emoji: "🏔️",
  goalAmount: 600000,
  /** Días respecto de hoy: el viaje arrancó hace 2 y termina en 5. */
  startsOffsetDays: -2,
  endsOffsetDays: 5,
};

export type DemoStep =
  | { kind: "deposit"; by: DemoUser["key"]; amount: number; hoursAgo: number }
  | {
      kind: "expense";
      by: DemoUser["key"];
      amount: number;
      category: MovementCategory;
      merchant: string;
      description: string;
      hoursAgo: number;
    };

/**
 * 9 movimientos ya cargados. Aportes 300.000 + 200.000 = 500.000 sobre una meta
 * de 600.000 (83% de la barra) y 300.750 gastados: la reserva arranca el video
 * con 199.250 de saldo y todas las categorías representadas para el gráfico.
 */
export const DEMO_MOVEMENTS: DemoStep[] = [
  { kind: "deposit", by: "juan", amount: 300000, hoursAgo: 52 },
  { kind: "deposit", by: "sofi", amount: 200000, hoursAgo: 51 },
  {
    kind: "expense", by: "juan", amount: 145000, category: "alojamiento",
    merchant: "Cabañas del Bosque", description: "Cabaña 4 noches", hoursAgo: 48,
  },
  {
    kind: "expense", by: "sofi", amount: 18500, category: "transporte",
    merchant: "Transfer Nahuel", description: "Traslado aeropuerto", hoursAgo: 47,
  },
  {
    kind: "expense", by: "sofi", amount: 28400, category: "comida",
    merchant: "Cervecería del Lago", description: "Cena de llegada", hoursAgo: 30,
  },
  {
    kind: "expense", by: "juan", amount: 62000, category: "actividades",
    merchant: "Cerro Catedral", description: "Pases de ski", hoursAgo: 26,
  },
  {
    kind: "expense", by: "juan", amount: 12750, category: "comida",
    merchant: "Chocolatería Suiza", description: "Merienda", hoursAgo: 7,
  },
  {
    kind: "expense", by: "sofi", amount: 24300, category: "actividades",
    merchant: "Circuito Chico Tours", description: "Excursión", hoursAgo: 5,
  },
  {
    kind: "expense", by: "sofi", amount: 9800, category: "transporte",
    merchant: "Remises del Sur", description: "Vuelta al centro", hoursAgo: 2,
  },
];

/** Comercios que inventa el escáner QR falso de la pantalla de pago. */
export const FAKE_MERCHANTS: { name: string; category: MovementCategory; min: number; max: number }[] = [
  { name: "Cervecería del Lago", category: "comida", min: 8000, max: 34000 },
  { name: "Chocolatería Suiza", category: "comida", min: 4500, max: 16000 },
  { name: "Parrilla El Refugio", category: "comida", min: 12000, max: 45000 },
  { name: "Café de la Plaza", category: "comida", min: 3500, max: 11000 },
  { name: "Cabañas del Bosque", category: "alojamiento", min: 30000, max: 90000 },
  { name: "Hostería Los Cipreses", category: "alojamiento", min: 25000, max: 70000 },
  { name: "Remises del Sur", category: "transporte", min: 4000, max: 14000 },
  { name: "Transfer Nahuel", category: "transporte", min: 9000, max: 25000 },
  { name: "Cerro Catedral", category: "actividades", min: 20000, max: 75000 },
  { name: "Circuito Chico Tours", category: "actividades", min: 15000, max: 40000 },
  { name: "Kiosco 24hs", category: "otros", min: 1500, max: 7000 },
];

/** Devuelve un comercio y un monto plausible, redondeado a centenas. */
export function randomCharge(): { merchant: string; category: MovementCategory; amount: number } {
  const pick = FAKE_MERCHANTS[Math.floor(Math.random() * FAKE_MERCHANTS.length)];
  const raw = pick.min + Math.random() * (pick.max - pick.min);
  return {
    merchant: pick.name,
    category: pick.category,
    amount: Math.round(raw / 100) * 100,
  };
}
