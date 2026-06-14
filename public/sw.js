const CACHE = 'hawiyat-driver-v1';
const ASSETS = ['/driver.html', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

// تتبع الموقع في الخلفية
let trackInterval = null;
let trackData = null;

self.addEventListener('message', e => {
  if (e.data.type === 'START_TRACK') {
    trackData = e.data;
    if (trackInterval) clearInterval(trackInterval);
    trackInterval = setInterval(async () => {
      // إرسال إشعار للصفحة لترسل الموقع
      const clients = await self.clients.matchAll();
      clients.forEach(c => c.postMessage({ type: 'SEND_LOCATION' }));
    }, 30000); // كل 30 ثانية
  }
  if (e.data.type === 'STOP_TRACK') {
    if (trackInterval) clearInterval(trackInterval);
    trackInterval = null;
  }
});
