import { cn } from "@/lib/cn";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Cargando"
      className={cn(
        "inline-block size-6 animate-spin rounded-full border-2 border-ink-100 border-t-brand-500",
        className,
      )}
    />
  );
}

export function FullScreenLoader() {
  return (
    <div className="mx-auto grid min-h-dvh w-full max-w-[420px] place-items-center bg-canvas">
      <Spinner className="size-8" />
    </div>
  );
}
