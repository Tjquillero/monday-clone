// public/sw.js
//
// CACHE_NAME debe subir de version cada vez que cambie la estrategia de este
// archivo: es la unica forma de que un cliente ya atascado en una version
// vieja del cache detecte el cambio (el navegador solo revisa si hay un SW
// nuevo comparando bytes de este archivo) y limpie el cache anterior en
// `activate`.
const CACHE_NAME = 'mantenix-cache-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/login',
  '/dashboard',
  '/favicon.ico',
  '/logo-new.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Navegaciones de pagina completa y las peticiones RSC/data que Next.js
// dispara en cada cambio de ruta dentro de la SPA (Cronograma, Ejecucion,
// etc.) deben ir por red primero: son las que traen el HTML/RSC con las
// referencias a los chunks JS de la build actual. Si esto se sirve de un
// cache viejo, la pagina queda apuntando a codigo de un deploy anterior
// indefinidamente, sin que ni un hard-refresh ni una pestana de incognito
// nueva (si reutiliza un SW ya instalado) lo noten.
function isNavigationRequest(request) {
  if (request.mode === 'navigate') return true;
  const accept = request.headers.get('accept') || '';
  if (accept.includes('text/x-component')) return true;
  if (request.headers.get('RSC') || request.headers.get('Next-Router-State-Tree')) return true;
  return false;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Ignorar llamadas directas a Supabase
  if (event.request.url.includes('supabase.co')) return;

  if (isNavigationRequest(event.request)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request)
            .then((cached) => cached || caches.match('/dashboard'))
            .then((cached) => cached || caches.match('/login'))
        )
    );
    return;
  }

  // Assets estaticos con hash inmutable (/_next/static/*, imagenes, etc.):
  // cache-first sigue siendo correcto, un contenido nuevo siempre trae un
  // nombre de archivo distinto.
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return response;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('/dashboard') || caches.match('/login');
        }
      });
    })
  );
});
