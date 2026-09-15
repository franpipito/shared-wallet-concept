import type { DataAdapter } from "./adapter";
import { createMockAdapter } from "./mock-adapter";
import { createSupabaseAdapter } from "./supabase-adapter";

let cached: DataAdapter | null = null;

/**
 * Elige el backend una sola vez por ventana.
 *
 * Si hay credenciales de Supabase, se usa Supabase. Si no, arranca el modo
 * mock: así `npm run dev` recién clonado ya muestra la demo andando, sin que
 * el camino real quede tapado por accidente.
 */
export function getAdapter(): DataAdapter {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  cached = url && anonKey ? createSupabaseAdapter(url, anonKey) : createMockAdapter();
  return cached;
}

export function isMockMode(): boolean {
  return !(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
}

export type { DataAdapter, ReserveEvents } from "./adapter";
