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

const FALLBACK_VERSION = 'pb-league-v1.3.8';

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
  './js/admin.js',
  './js/player.js',
  './js/changelog.js',
  './img/icon-192.png',
  './img/icon-512.png',
  './img/pb_rot.gif',
];

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

// Install — read version from settings.js then pre-cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    getAppVersion().then(version => {
      self.CACHE_VERSION = version;
      return caches.open(version)
        .then(cache => cache.addAll(STATIC_ASSETS))
        .then(() => self.skipWaiting());
    })
  );
});

// Activate — delete all caches that don't match the current version
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
