"use client";

import { useEffect } from "react";

/** Registra el service worker: sin él la app no es instalable. */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // En desarrollo molesta más de lo que ayuda (cachea el shell entre recargas).
    if (process.env.NODE_ENV !== "production") return;
    // Dentro de los iframes de /demo no aporta nada.
    if (window.self !== window.top) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Falla en contextos sin HTTPS; no es crítico.
    });
  }, []);

  return null;
}
