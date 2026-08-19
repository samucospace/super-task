// Super Task Service Worker
// Enables offline support, caching, and installation as a native-like app

const CACHE_NAME = "super-task-v4";
const ASSETS_TO_CACHE = [
  "./index.html",
  "./styles.css",
  "./core.js",
  "./dom.js",
  "./bootstrap.js",
  "./auth.js",
  "./storage.js",
  "./repositories.js",
  "./sync-queue.js",
  "./app.js",
  "./manifest.json"
];

// Install event: cache all essential assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  // Skip waiting to activate immediately
  self.skipWaiting();
});

// Activate event: clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Claim all clients immediately
  self.clients.claim();
});

// Fetch event: network-first for app shell files (so fixes/deploys are picked
// up immediately when online), falling back to cache when offline. This
// avoids indefinitely serving a stale cached app.js/index.html once cached.
self.addEventListener("fetch", (event) => {
  // Skip non-GET requests
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (!response || response.status !== 200) {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          return cachedResponse || caches.match("./index.html");
        });
      })
  );
});

// Handle messages from clients (for future features like background sync)
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
