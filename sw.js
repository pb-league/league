// ============================================================
// sw.js — Service Worker for Pickleball League Manager
//
// Cache version is read automatically from js/settings.js so
// you only need to bump APP_VERSION in settings.js — no other
// version strings need updating anywhere.
//
// Strategy:
//   HTML files  → Network-first (always fresh, fall back to cache offline)
//   JS/CSS/imgs → Cache-first (fast, busted by ?v= query strings in HTML)
//   GAS API     → Network-only (never cache)
// ============================================================

const FALLBACK_VERSION = 'pb-league-v1.4.7';

const HTML_FILES = [
  './index.html',
  './admin.html',
  './player.html',
  './help.html',
];

const STATIC_ASSETS = [
  './css/style.css',
  './js/settings.js',
  './js/api.js',
  './js/auth.js',
  './js/pairings.js',
  './js/reports.js',
  './js/tournament.js',
  './js/push.js',
  './js/admin.js',
  './js/player.js',
  './js/changelog.js',
  './img/icon-192.png',
  './img/icon-512.png',
  './img/pb_rot.gif',
];

// Listen for SKIP_WAITING message from the page's "Update Now" button
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Push notification received — show it
// Always show a notification even if payload is missing/undecodable so the
// user isn't silently left without feedback (e.g. decryption key mismatch).
self.addEventListener('push', event => {
  let data = {};
  if (event.data) {
    try { data = event.data.json(); }
    catch { try { data = { body: event.data.text() }; } catch { /* empty payload */ } }
  }
  const title   = data.title || 'Pickleball League';
  const options = {
    body:     data.body  || 'You have a new league notification.',
    icon:    './img/icon-192.png',
    badge:   './img/icon-192.png',
    data:    { url: data.url || './player.html' },
    tag:     data.tag   || 'pb-league',
    renotify: !!data.tag,
  };
  event.waitUntil(
    self.registration.showNotification(title, options)
      .catch(err => console.error('[SW] showNotification failed:', err))
  );
});

// Notification clicked — focus or open the linked page
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || './player.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      return clients.openWindow ? clients.openWindow(url) : undefined;
    })
  );
});

// Read APP_VERSION from settings.js — single source of truth
async function getAppVersion() {
  try {
    const res = await fetch('./js/settings.js?_sw=1');
    const text = await res.text();
    const match = text.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
    return match ? `pb-league-v${match[1]}` : FALLBACK_VERSION;
  } catch {
    return FALLBACK_VERSION;
  }
}

// Install — read version from settings.js then pre-cache static assets.
// The SW waits in 'installed' state until the page sends SKIP_WAITING
// (via the "Update Now" button), giving the user control over when to reload.
self.addEventListener('install', event => {
  event.waitUntil(
    getAppVersion().then(version => {
      self.CACHE_VERSION = version;
      return caches.open(version)
        .then(cache => cache.addAll(STATIC_ASSETS));
    })
  );
});

// Activate — delete stale caches, then claim all clients.
// Page reload is handled by the controllerchange listener in the page.
self.addEventListener('activate', event => {
  event.waitUntil(
    getAppVersion().then(version => {
      self.CACHE_VERSION = version;
      return caches.keys().then(keys =>
        Promise.all(
          keys.filter(k => k !== version).map(k => {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          })
        )
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch — different strategies per resource type
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Never intercept GAS API calls
  if (url.hostname.includes('script.google.com') || url.hostname.includes('googleapis.com')) {
    return;
  }

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  const isHTML = path === '/' || path.endsWith('/') ||
    HTML_FILES.some(f => path.endsWith(f.replace('./', '')));

  const cacheVersion = self.CACHE_VERSION || FALLBACK_VERSION;

  if (isHTML) {
    // Network-first for HTML — always serve latest, cache for offline fallback
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(cacheVersion).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request)
            .then(cached => cached || caches.match('./index.html'))
        )
    );
  } else {
    // Cache-first for JS/CSS/images — fast loads
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok && event.request.method === 'GET') {
            const clone = response.clone();
            caches.open(cacheVersion).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
  }
});
