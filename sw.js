/* PyLearn service worker: caches the app shell and lessons for offline use,
   and keeps a copy of Python (Pyodide) after its first download. */
const VERSION = "pylearn-v1.0.0";
const SHELL = [
  "./", "index.html", "manifest.json", "css/app.css",
  "js/app.js", "js/py.js", "js/editor.js", "js/highlight.js", "js/py-worker.js",
  "py/harness.py", "content/course.json",
  "fonts/inter.woff2", "fonts/jetbrains-mono.woff2", "fonts/orbitron.woff2",
  "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/favicon-32.png"
];
const PY_CACHE = "pyodide-314.0.7";
const PY_PREFIX = "https://cdn.jsdelivr.net/pyodide/v314.0.7/";

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k !== VERSION && k !== PY_CACHE).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = req.url;

  // Python runtime from the CDN: cache first, keep forever (the URL contains the version).
  if (url.startsWith(PY_PREFIX)) {
    e.respondWith(caches.open(PY_CACHE).then(async c => {
      const hit = await c.match(url);
      if (hit) return hit;
      // Always fetch with CORS (jsDelivr allows it) so the cached copy works for both
      // importScripts() and fetch() requests.
      const res = await fetch(new Request(url, { mode: "cors", credentials: "omit" }));
      if (res.ok) await c.put(url, res.clone());
      return res;
    }));
    return;
  }

  if (new URL(url).origin !== self.location.origin) return;

  // Page navigations: network first so updates arrive, cached shell when offline.
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("index.html")));
    return;
  }

  // Lessons: network first (fresh content), cache fallback.
  if (url.includes("/content/")) {
    e.respondWith(fetch(req).then(res => {
      const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res;
    }).catch(() => caches.match(req)));
    return;
  }

  // Everything else in the app shell: cache first.
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  })));
});
