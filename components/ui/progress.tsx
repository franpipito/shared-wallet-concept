"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

export function ProgressBar({
  value,
  goal,
  className,
  tone = "brand",
}: {
  value: number;
  goal: number;
  className?: string;
  tone?: "brand" | "white";
}) {
  const pct = goal > 0 ? Math.min(100, Math.max(0, (value / goal) * 100)) : 0;

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        "h-2.5 w-full overflow-hidden rounded-full",
        tone === "white" ? "bg-white/25" : "bg-ink-100",
        className,
      )}
    >
      <motion.div
        className={cn("h-full rounded-full", tone === "white" ? "bg-accent-400" : "bg-brand-500")}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ type: "spring", stiffness: 120, damping: 24 }}
      />
    </div>
  );
}
