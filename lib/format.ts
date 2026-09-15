/** Formato es-AR: $ 12.500,00 — punto para miles, coma para decimales. */

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const moneyCompact = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatMoney(value: number): string {
  return money.format(value ?? 0);
}

/** Sin centavos, para títulos y metas donde los decimales son ruido. */
export function formatMoneyShort(value: number): string {
  return moneyCompact.format(value ?? 0);
}

/**
 * Parsea lo que la persona tipea en un input de monto.
 * Acepta "12.500,50", "12500.50" y "12500,50"; devuelve null si no es un número.
 */
export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[^\d.,-]/g, "").trim();
  if (!cleaned) return null;

  // Si hay coma, es el separador decimal (es-AR) y los puntos son de miles.
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

const dayMonth = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short" });
const timeOnly = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit" });

export function formatDateRange(startsAt: string, endsAt: string): string {
  const start = new Date(`${startsAt}T00:00:00`);
  const end = new Date(`${endsAt}T00:00:00`);
  return `${dayMonth.format(start)} — ${dayMonth.format(end)}`;
}

const monthYear = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" });
const dayOnly = new Intl.DateTimeFormat("es-AR", { day: "numeric" });

/**
 * Rango con año, compacto. "15 al 22 de septiembre de 2026" en vez de repetir
 * el mes y el año dos veces, que a 390px envuelve en dos líneas.
 */
export function formatDateRangeLong(startsAt: string, endsAt: string): string {
  const start = new Date(`${startsAt}T00:00:00`);
  const end = new Date(`${endsAt}T00:00:00`);

  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${dayOnly.format(start)} al ${dayOnly.format(end)} de ${monthYear.format(end)}`;
  }
  return `${dayMonth.format(start)} — ${dayMonth.format(end)} de ${end.getFullYear()}`;
}

export function formatTime(iso: string): string {
  return timeOnly.format(new Date(iso));
}

/** "hace 2 min", "ayer", "12 sept" — para el feed de movimientos. */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) return "recién";
  if (minutes < 60) return `hace ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24 && then.getDate() === now.getDate()) return timeOnly.format(then);

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.floor((startOfToday.getTime() - then.getTime()) / 86400000);
  if (days === 0) return "ayer";
  if (days < 7) return `hace ${days + 1} días`;
  return dayMonth.format(then);
}

/**
 * Días que faltan para que termine el viaje.
 * Se compara a medianoche local: si no, un viaje que termina hoy a la tarde
 * mostraría "0 días" apenas pasa la hora actual.
 */
export function daysRemaining(endsAt: string, now: Date = new Date()): number {
  const end = new Date(`${endsAt}T00:00:00`);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((end.getTime() - startOfToday.getTime()) / 86400000);
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
