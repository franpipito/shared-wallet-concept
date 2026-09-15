"use client";

import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 shadow-sm",
  secondary: "bg-brand-50 text-brand-700 hover:bg-brand-100 active:bg-brand-200",
  ghost: "bg-transparent text-ink-700 hover:bg-ink-50 active:bg-ink-100",
  danger: "bg-negative text-white hover:brightness-95 active:brightness-90",
};

export function Button({
  variant = "primary",
  fullWidth,
  className,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  fullWidth?: boolean;
}) {
  return (
    <button
      type={type}
      className={cn(
        // min-h-12: objetivo táctil cómodo en un teléfono de 390px.
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-[15px] font-bold",
        "transition-[background-color,filter,transform] duration-150 active:scale-[0.985]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
        "disabled:pointer-events-none disabled:opacity-45",
        fullWidth && "w-full",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
