// Service worker mínimo: lo justo para que la app sea instalable y para que el
// shell siga abriendo sin red. Nada de cachear datos — el saldo tiene que venir
// siempre del servidor.
const CACHE = "billetera-shell-v1";
const SHELL = ["/", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Las llamadas a Supabase y las rutas de datos nunca se sirven de cache.
  if (url.pathname.startsWith("/api/")) return;

  // Network-first: si hay red mandamos lo fresco; si no, el shell cacheado.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (request.mode === "navigate" && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((hit) => hit ?? caches.match("/"))),
  );
});
