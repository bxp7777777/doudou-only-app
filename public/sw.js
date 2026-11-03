/* 简单离线壳：静态资源缓存优先，接口一律走网络 */
const CACHE = 'doudou-v4';
const SHELL = [
  '/',
  '/index.html',
  '/game.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/store.js',
  '/js/date.js',
  '/js/plan.js',
  '/js/cycle.js',
  '/js/story.js',
  '/js/stories.js',
  '/js/schedule.js',
  '/js/skincare.js',
  '/js/health.js',
  '/js/weather.js',
  '/art/bg-ai1.jpg',
  '/art/bg-ai2.jpg',
  '/art/bg-ai3.jpg',
  '/art/bg-ai4.jpg',
  '/art/battle-field.jpg',
  '/art/icon-duo.svg',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('/index.html')))
  );
});