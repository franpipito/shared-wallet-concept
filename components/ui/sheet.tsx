"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";

/** Hoja inferior. En mobile se siente más natural que un modal centrado. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Sin esto el fondo hace scroll detrás de la hoja abierta.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center">
          <motion.button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-ink-900/45"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
            className="relative w-full max-w-[420px] rounded-t-[28px] bg-surface px-5 pb-safe pt-3"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink-100" />
            <h2 className="mb-4 text-center text-base font-extrabold text-ink-900">{title}</h2>
            {children}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
