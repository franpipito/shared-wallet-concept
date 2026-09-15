"use client";

import { cn } from "@/lib/cn";
import { parseAmount } from "@/lib/format";

/**
 * Input de monto grande. Es `inputMode="decimal"` para que en el teléfono
 * aparezca el teclado numérico, pero sigue siendo type="text" porque
 * type="number" no acepta la coma decimal de es-AR.
 */
export function AmountInput({
  value,
  onChange,
  autoFocus,
  className,
}: {
  value: string;
  onChange: (raw: string, parsed: number | null) => void;
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-center gap-1.5", className)}>
      <span className="text-3xl font-bold text-ink-300">$</span>
      <input
        type="text"
        inputMode="decimal"
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => {
          const raw = event.target.value;
          onChange(raw, parseAmount(raw));
        }}
        placeholder="0"
        aria-label="Monto"
        className={cn(
          "tabular w-full max-w-[260px] border-none bg-transparent text-center text-5xl font-extrabold",
          "text-ink-900 caret-brand-500 outline-none placeholder:text-ink-300",
        )}
      />
    </div>
  );
}
