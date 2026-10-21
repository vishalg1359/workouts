const CACHE = 'workouts-v63';
const ASSETS = ['./', './index.html', './app.js', './iconkit.js', './styles.css', './manifest.webmanifest',
  './apple-touch-icon.png', './icon-192.png', './icon-512.png',
  './icons/bb-row.svg', './icons/bench.svg', './icons/bike.svg', './icons/cable-row.svg', './icons/calf.svg', './icons/chest-press.svg', './icons/crunch.svg', './icons/curl.svg', './icons/db-bench.svg', './icons/db-incline.svg', './icons/db-ohp.svg', './icons/db-row.svg', './icons/deadlift.svg', './icons/dip.svg', './icons/elliptical.svg', './icons/face-pull.svg', './icons/fly.svg', './icons/goblet.svg', './icons/hipthrust.svg', './icons/incline.svg', './icons/kb-swing.svg', './icons/lateral.svg', './icons/legcurl.svg', './icons/legext.svg', './icons/legpress.svg', './icons/legraise.svg', './icons/lunge.svg', './icons/ohp.svg', './icons/plank.svg', './icons/pulldown.svg', './icons/pullup.svg', './icons/pushdown.svg', './icons/pushup.svg', './icons/rdl.svg', './icons/rope.svg', './icons/rower.svg', './icons/run.svg', './icons/shrug.svg', './icons/split.svg', './icons/squat.svg', './icons/stairs.svg', './icons/stretch.svg', './icons/swim.svg', './icons/tgu.svg', './icons/treadmill.svg', './icons/tricep.svg', './icons/twist.svg', './icons/walk.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'no-cache' })))));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first so updates show on the next open; fall back to the saved copy when offline.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (_) {
      return (await cache.match(req, { ignoreSearch: true })) || (await cache.match('./'));
    }
  })());
});
