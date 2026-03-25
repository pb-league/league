// ============================================================
// sw.js — Service Worker for Pickleball League Manager
// Strategy: Cache-first for static assets, network-first for API calls.
// ============================================================

const CACHE_NAME = 'pb-league-v1.1.0';

// Static assets to pre-cache on install
const PRECACHE = [
  './index.html',
  './admin.html',
  './player.html',
  './help.html',
  './css/style.css',
  './js/settings.js',
  './js/api.js',
  './js/auth.js',
  './js/pairings.js',
  './js/reports.js',
  './js/tournament.js',
  './js/admin.js',
  './js/player.js',
  './js/changelog.js',
  './img/icon-192.png',
  './img/icon-512.png',
  './img/pb_rot.gif',
];

// Install — pre-cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// Activate — clear old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch — cache-first for static assets, network-only for GAS API calls
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Never intercept GAS API calls — always go to network
  if (url.hostname.includes('script.google.com') || url.hostname.includes('googleapis.com')) {
    return; // fall through to network
  }

  // Cache-first for same-origin static assets
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          // Cache successful GET responses
          if (response.ok && event.request.method === 'GET') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => {
          // Offline fallback for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
    );
  }
});
