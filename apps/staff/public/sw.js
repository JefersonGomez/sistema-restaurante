/* global self, caches, fetch, Request, Response, URL */
// Service worker del panel del personal (Fase 18.3): guarda la aplicación (HTML, JS, CSS, fuentes,
// imágenes propias) para que abra aunque se recargue sin internet. No guarda datos de la API: eso
// lo hace la "última foto" de la app, que se borra al cerrar sesión.
const CACHE = 'kitchago-staff-v3';
// Sin mirar Vary: el servidor manda "Vary: Origin" y el navegador pide los módulos con Origin, así
// que lo guardado no coincidía y la app quedaba en blanco sin internet.
const SIN_VARY = { ignoreVary: true };

// Solo archivos de la propia aplicación; nunca la API, sockets ni subidas.
const esDeLaApp = (req) => {
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return false;
  return !/^\/(api|socket\.io|public|uploads)(\/|$)/.test(url.pathname);
};

// Al instalarse guarda la página y los archivos que ella pide (JS y CSS con hash), así la app abre
// sin internet desde la primera recarga, también después de una actualización.
self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const c = await caches.open(CACHE);
      const res = await fetch('/', { cache: 'no-store' });
      const html = await res.clone().text();
      await c.put('/', res);
      const archivos = [...new Set(html.match(/\/assets\/[^"'\s>]+/g) ?? [])];
      await Promise.all(archivos.map((u) => c.add(u).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// La página avisa qué archivos cargó antes de que el service worker la controlara.
self.addEventListener('message', (e) => {
  if (e.data?.tipo !== 'guardar' || !Array.isArray(e.data.urls)) return;
  const urls = e.data.urls.filter((u) => {
    try {
      return new URL(u).origin === self.location.origin;
    } catch {
      return false;
    }
  });
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.all(urls.map((u) => c.add(u).catch(() => {})))),
  );
});

const guardar = async (req, res) => {
  if (res.ok && res.type === 'basic') await (await caches.open(CACHE)).put(req, res.clone());
  return res;
};

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (!esDeLaApp(req)) return;
  if (req.mode === 'navigate') {
    // Páginas: primero la red (versión nueva); sin internet, la aplicación guardada.
    e.respondWith(
      fetch(req)
        .then((res) => guardar(new Request('/'), res))
        .catch(async () => (await caches.match('/', SIN_VARY)) ?? Response.error()),
    );
    return;
  }
  // Archivos con hash en el nombre: primero lo guardado; si no está, la red y se guarda.
  e.respondWith(
    caches.match(req, SIN_VARY).then((hit) => hit ?? fetch(req).then((res) => guardar(req, res))),
  );
});
