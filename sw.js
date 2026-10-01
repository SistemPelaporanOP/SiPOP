// ════════════════════════════════════════════════
// SiPOP Service Worker — offline support
// Cache halaman & aset, queue pengiriman saat offline
// ════════════════════════════════════════════════

var CACHE_NAME = 'sipop-v1';
var OFFLINE_ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap'
];

// Install — cache semua aset utama
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(OFFLINE_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate — hapus cache lama
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k)   { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// Fetch — serve dari cache jika offline
self.addEventListener('fetch', function(e) {
  // Jangan intercept request ke API / ImgBB
  var url = e.request.url;
  if (url.indexOf('script.google.com') > -1 ||
      url.indexOf('api.imgbb.com') > -1) {
    return; // biarkan browser handle langsung
  }

  e.respondWith(
    caches.match(e.request).then(function(cached) {
      return cached || fetch(e.request).then(function(response) {
        // Cache response baru untuk aset statis
        if (e.request.method === 'GET') {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(e.request, clone);
          });
        }
        return response;
      });
    }).catch(function() {
      // Jika offline dan tidak ada cache, return halaman utama
      return caches.match('./index.html');
    })
  );
});

// Background Sync — kirim antrian saat online kembali
self.addEventListener('sync', function(e) {
  if (e.tag === 'sipop-sync') {
    e.waitUntil(kirimAntrianTersimpan());
  }
});

// Terima pesan dari halaman (untuk trigger sync manual)
self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function kirimAntrianTersimpan() {
  // Notifikasi ke semua client agar mereka yang kirim
  // (Service Worker tidak bisa akses IndexedDB foto dengan mudah)
  return self.clients.matchAll().then(function(clients) {
    clients.forEach(function(client) {
      client.postMessage({ type: 'SYNC_NOW' });
    });
  });
}
