"use client";

import { ArrowDownLeft, Undo2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { CATEGORY_META } from "@/lib/categories";
import { formatMoney, formatRelative } from "@/lib/format";
import type { Movement } from "@/lib/types";

/**
 * Fila del feed. El ícono lleva el avatar de quien hizo el movimiento como
 * chapita: en una reserva compartida, "quién" importa tanto como "en qué", y
 * ponerlo a la derecha dejaba el margen irregular según fuera propio o ajeno.
 */
export function MovementRow({
  movement,
  authorName,
  isMine,
}: {
  movement: Movement;
  authorName: string;
  isMine: boolean;
}) {
  const category = movement.category ? CATEGORY_META[movement.category] : null;
  const Icon = category?.icon ?? (movement.type === "refund" ? Undo2 : ArrowDownLeft);

  const title =
    movement.type === "expense"
      ? (movement.merchant ?? category?.label ?? "Pago")
      : movement.type === "deposit"
        ? "Depósito"
        : "Devolución del sobrante";

  // Solo el nombre de pila: el completo desborda el ancho de 390px.
  const who = isMine ? "Vos" : authorName.split(" ")[0];
  const subtitle = category ? `${who} · ${category.label}` : who;

  const incoming = movement.type === "deposit" || movement.type === "refund";

  return (
    <div className="flex items-center gap-3 py-3">
      <span className="relative shrink-0">
        <span
          className={`grid size-11 place-items-center rounded-full ${
            movement.type === "expense"
              ? (category?.chipClass ?? "bg-ink-100 text-ink-700")
              : "bg-positive/12 text-positive"
          }`}
        >
          <Icon className="size-4.5" />
        </span>
        <Avatar
          name={authorName}
          size="sm"
          className="absolute -bottom-0.5 -right-1 size-[17px] text-[7px] ring-2 ring-surface"
        />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-ink-900">{title}</p>
        <p className="truncate text-xs text-ink-500">{subtitle}</p>
      </div>

      <div className="shrink-0 text-right">
        <p
          className={`tabular text-sm font-extrabold ${
            movement.type === "deposit"
              ? "text-positive"
              : movement.type === "refund"
                ? "text-ink-500"
                : "text-ink-900"
          }`}
        >
          {incoming ? "+" : "−"}
          {formatMoney(movement.amount)}
        </p>
        <p className="text-[11px] text-ink-300">{formatRelative(movement.createdAt)}</p>
      </div>
    </div>
  );
}
