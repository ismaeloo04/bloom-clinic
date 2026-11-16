// يشغّل الأبلكيشن من غير نت بعد أول فتح
const V = 'bloom-v9';
const SHELL = ['./', 'index.html', 'app.css', 'sync-core.js', 'app.js', 'manifest.webmanifest',
  'img/front.webp', 'img/back.webp', 'img/logo-white.png', 'img/graficoo-white.png', 'img/chart.webp', 'img/info.webp',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-180.png', 'icons/favicon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // الخطوط: من الكاش الأول
  if (u.host.includes('fonts.googleapis.com') || u.host.includes('fonts.gstatic.com')) {
    e.respondWith(caches.open(V).then(async c => (await c.match(e.request)) || fetch(e.request).then(r => { c.put(e.request, r.clone()); return r; })));
    return;
  }
  if (u.origin !== location.origin) return;
  // ملفات الأبلكيشن: النت الأول عشان التحديثات توصل، ولو مفيش نت من الكاش
  e.respondWith(fetch(e.request.url, { cache: 'no-cache' }).then(r => { const cp = r.clone(); caches.open(V).then(c => c.put(e.request, cp)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
