import {
  Bed,
  Bus,
  type LucideIcon,
  MountainSnow,
  ShoppingBag,
  UtensilsCrossed,
} from "lucide-react";
import type { MovementCategory } from "@/lib/types";

/**
 * Metadata única de cada categoría: la usan el feed, el selector de pago y la
 * dona del resumen, así un color nunca significa dos cosas distintas.
 */
export const CATEGORY_META: Record<
  MovementCategory,
  { label: string; icon: LucideIcon; color: string; chipClass: string }
> = {
  comida: {
    label: "Comida",
    icon: UtensilsCrossed,
    color: "#ff7043",
    chipClass: "bg-[#ff7043]/12 text-[#c74a20]",
  },
  alojamiento: {
    label: "Alojamiento",
    icon: Bed,
    color: "#7c5cff",
    chipClass: "bg-[#7c5cff]/12 text-[#5a3fd6]",
  },
  transporte: {
    label: "Transporte",
    icon: Bus,
    color: "#009ee3",
    chipClass: "bg-brand-500/12 text-brand-700",
  },
  actividades: {
    label: "Actividades",
    icon: MountainSnow,
    color: "#00b8a9",
    chipClass: "bg-[#00b8a9]/12 text-[#00857a]",
  },
  otros: {
    label: "Otros",
    icon: ShoppingBag,
    color: "#647a91",
    chipClass: "bg-ink-500/12 text-ink-700",
  },
};
