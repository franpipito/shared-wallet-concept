/** Concatena clases ignorando falsy. Alcanza para este tamaño de proyecto. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
