// Minimal service worker for Ops PWA (cache-first shell)
const CACHE = "ops-cache-v3";
const ASSETS = ["/", "/manifest.json"];
const STATIC_EXTENSIONS = [".css", ".js", ".png", ".svg", ".jpg", ".jpeg", ".webp", ".gif", ".woff", ".woff2", ".ttf", ".ico"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests to our own origin
  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  // Don't intercept API calls
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  const isStaticAsset = ASSETS.includes(url.pathname) || STATIC_EXTENSIONS.some((ext) => url.pathname.endsWith(ext));

  if (!isStaticAsset) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      // If request has query parameters (cache-busting), always fetch fresh
      if (url.search && url.search.length > 0) {
        return fetch(request)
          .then((response) => {
            if (!response || response.status !== 200 || response.type !== "basic") {
              return response;
            }
            const responseToCache = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, responseToCache));
            return response;
          })
          .catch((error) => {
            console.warn("[ops/sw] Network fetch failed", url.pathname, error);
            // Fallback to cache if network fails
            return cached || new Response("Network error", { status: 503 });
          });
      }
      
      if (cached) {
        return cached;
      }

      return fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== "basic") {
            return response;
          }

          const responseToCache = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, responseToCache));
          return response;
        })
        .catch((error) => {
          console.warn("[ops/sw] Network fetch failed", url.pathname, error);
          throw error;
        });
    })
  );
});
