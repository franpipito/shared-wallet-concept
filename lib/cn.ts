import { twMerge } from "tailwind-merge";

/**
 * Combina clases resolviendo conflictos de Tailwind.
 *
 * Hace falta twMerge y no una simple concatenación: en Tailwind v4 el orden de
 * las clases en el atributo NO decide cuál gana, gana la que va última en el
 * CSS generado. Así, un `<Card className="p-0">` quedaba con el `p-4` que la
 * propia Card trae por defecto, y el `hidden` de un elemento perdía contra el
 * `inline-flex` de su componente base.
 */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return twMerge(parts.filter(Boolean).join(" "));
}
