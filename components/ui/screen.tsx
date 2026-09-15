"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";

/**
 * Contenedor de pantalla. Fija el ancho a 390px en desktop para que lo que ves
 * mientras desarrollás sea exactamente lo que se graba en el video.
 */
export function Screen({
  children,
  className,
  tone = "canvas",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "canvas" | "brand";
}) {
  return (
    <div
      className={cn(
        "mx-auto flex min-h-dvh w-full max-w-[420px] flex-col",
        tone === "brand" ? "bg-brand-500" : "bg-canvas",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
  tone = "canvas",
}: {
  title: string;
  subtitle?: string;
  onBack?: (() => void) | "auto";
  right?: React.ReactNode;
  tone?: "canvas" | "brand";
}) {
  const router = useRouter();
  const onBrand = tone === "brand";

  return (
    <header
      className={cn(
        "flex items-center gap-2 px-4 pb-3 pt-safe",
        onBrand ? "text-white" : "text-ink-900",
      )}
    >
      {onBack ? (
        <button
          type="button"
          aria-label="Volver"
          onClick={() => (onBack === "auto" ? router.back() : onBack())}
          className={cn(
            "-ml-2 grid size-10 place-items-center rounded-full transition-colors",
            onBrand ? "hover:bg-white/15" : "hover:bg-ink-100",
          )}
        >
          <ChevronLeft className="size-6" />
        </button>
      ) : null}

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-extrabold leading-tight">{title}</h1>
        {subtitle ? (
          <p className={cn("truncate text-xs", onBrand ? "text-white/70" : "text-ink-500")}>
            {subtitle}
          </p>
        ) : null}
      </div>

      {right}
    </header>
  );
}

/** Aviso legal obligatorio: esto no es una app real ni mueve dinero real. */
export function ConceptFooter({ className }: { className?: string }) {
  return (
    <p className={cn("px-6 pb-safe pt-8 text-center text-[11px] leading-relaxed text-ink-300", className)}>
      Concepto no oficial · Prototipo con fines demostrativos
    </p>
  );
}
