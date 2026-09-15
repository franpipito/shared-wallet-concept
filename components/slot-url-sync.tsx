"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { getSessionSlot } from "@/lib/data/adapter";

/**
 * Mantiene el slot de sesión en la URL después de cada navegación.
 *
 * El slot llega como ?s= al abrir la app, pero al navegar con <Link> la query
 * se pierde. Mientras la ventana siga viva alcanza con tenerlo en memoria; el
 * problema es una recarga dura (F5 dentro del iframe de /demo): sin el ?s= en
 * la URL, esa ventana caería al slot por defecto y se mezclarían las sesiones
 * de los dos "celulares".
 *
 * Next soporta el history API nativo y lo integra con su router, así que
 * reponer el parámetro con replaceState no dispara navegación ni recarga.
 */
export function SlotUrlSync() {
  const pathname = usePathname();

  useEffect(() => {
    const slot = getSessionSlot();
    if (slot === "default") return;

    const url = new URL(window.location.href);
    if (url.searchParams.get("s") === slot) return;

    url.searchParams.set("s", slot);
    window.history.replaceState(null, "", url.toString());
  }, [pathname]);

  return null;
}
