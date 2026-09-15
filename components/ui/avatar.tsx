import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

const PALETTE = [
  "bg-brand-500",
  "bg-accent-500 text-ink-900",
  "bg-positive",
  "bg-[#7c5cff]",
  "bg-[#ff7043]",
  "bg-[#00b8a9]",
];

/** Color estable por persona: el mismo nombre siempre cae en el mismo tono. */
function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

const SIZES = {
  sm: "size-8 text-[11px]",
  md: "size-10 text-xs",
  lg: "size-14 text-base",
} as const;

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-extrabold text-white select-none",
        SIZES[size],
        colorFor(name),
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
