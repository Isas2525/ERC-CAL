/* Offline support. Network first, so a deploy shows up on the next load;
 * the cached copy answers when there's no signal (e.g. in a car park). */
const CACHE = "tmv-shell-v1"; // bump to drop old cached files
const SHELL = [
  "/",
  "/styles.css",
  "/logo.svg",
  "/manifest.webmanifest",
  "/js/theme.js",
  "/js/app.js",
  "/js/api.js",
  "/js/ui.js",
  "/js/store.js",
  "/js/shared/rules.js",
  "/js/shared/units.js",
  "/js/shared/vehicle.js",
  "/js/views/garage.js",
  "/js/views/vehicle.js",
  "/js/views/form.js",
  "/js/views/guides.js",
];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  const key = event.request.mode === "navigate" ? "/" : url.pathname;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await Promise.race([
        fetch(event.request),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), NETWORK_TIMEOUT_MS)),
      ]);
      if (response.ok && SHELL.includes(key)) cache.put(key, response.clone());
      return response;
    } catch (err) {
      const cached = await cache.match(key);
      if (cached) return cached;
      throw err;
    }
  })());
});
