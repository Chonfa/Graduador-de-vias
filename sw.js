// Guarda los archivos de la página para que abra al instante, incluso con mala señal.
// Los datos (Apps Script) y las fotos (Drive) no pasan por acá: siempre van a la red.
// Después de subir cambios, cada celular los ve a partir de la segunda vez que abre la app.
// Si se agrega o se saca un archivo de ARCHIVOS, subí VERSION para borrar lo guardado antes.
const VERSION = 'v1';
const ARCHIVOS = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'grados.js',
  'config.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Responde con lo guardado y en paralelo baja la versión nueva para la próxima vez.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const guardado = await cache.match(e.request, { ignoreSearch: true });
      const red = fetch(e.request)
        .then((res) => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        })
        .catch(() => guardado);
      if (guardado) {
        e.waitUntil(red);
        return guardado;
      }
      return red;
    })
  );
});
