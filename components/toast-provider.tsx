"use client";

import { AnimatePresence, motion } from "framer-motion";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";

export interface ToastInput {
  /** Título en negrita, p. ej. "Sofi pagó $ 12.500,00". */
  title: string;
  /** Línea secundaria, p. ej. "Café del Puerto · comida". */
  detail?: string;
  /** Si viene, se muestra el avatar con las iniciales de esa persona. */
  personName?: string;
  tone?: "brand" | "positive" | "negative";
}

interface Toast extends ToastInput {
  id: number;
}

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

export function useToast(): (toast: ToastInput) => void {
  const push = useContext(ToastContext);
  if (!push) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return push;
}

const TONE_STYLES: Record<NonNullable<ToastInput["tone"]>, string> = {
  brand: "bg-ink-900 text-white",
  positive: "bg-positive text-white",
  negative: "bg-negative text-white",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const push = useCallback((toast: ToastInput) => {
    const id = nextId.current++;
    // Tope de 3: en el video, una ráfaga de pagos no debe tapar la pantalla.
    setToasts((current) => [...current.slice(-2), { ...toast, id }]);
    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 px-4 pt-safe">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: -24, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className={`pointer-events-auto flex w-full max-w-[358px] items-center gap-3 rounded-2xl px-3.5 py-3 shadow-float ${
                TONE_STYLES[toast.tone ?? "brand"]
              }`}
            >
              {toast.personName ? (
                <Avatar name={toast.personName} size="sm" className="ring-2 ring-white/25" />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{toast.title}</p>
                {toast.detail ? (
                  <p className="truncate text-xs text-white/75">{toast.detail}</p>
                ) : null}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
