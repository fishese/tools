/* Bump CACHE when cached files change. App shell is network-first so deploys show up. */
const CACHE = 'ck-v6';
const CACHE_PREFIX = 'ck-';
const ASSETS = [
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png'
];
const CDN = [
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
  'https://cdn.jsdelivr.net/npm/qrcode-generator@2.0.4/dist/qrcode.js',
  'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js',
  'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/bwip-js@4.5.1/dist/bwip-js-min.js'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(ASSETS.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await Promise.all(CDN.map(u => c.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

function isAppShell(request, url) {
  if (url.origin !== self.location.origin) return false;
  if (request.mode === 'navigate') return true;
  const p = url.pathname;
  return /\/(index\.html|styles\.css|app\.js|manifest\.json|sw\.js)$/.test(p)
    || p.endsWith('/coupon-keeper/')
    || p.endsWith('/coupon-keeper');
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') {
    return;
  }
  const url = new URL(e.request.url);

  if (isAppShell(e.request, url)) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() =>
        caches.match(e.request).then(r => r || caches.match('./index.html'))
      )
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => new Response('Offline', { status: 503, statusText: 'Offline' }));
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      if (client.url.includes('/coupon-keeper') && 'focus' in client) {
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow('./');
  })());
});

self.addEventListener('periodicsync', e => {
  if (e.tag === 'ck-expiry') e.waitUntil(checkExpiryAndNotify());
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'ck-check-expiry') {
    e.waitUntil(checkExpiryAndNotify());
  }
});

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function parseDate(s) {
  const d = new Date((s || '') + 'T00:00:00');
  d.setHours(0, 0, 0, 0);
  return d;
}
function daysLeft(s) {
  const d = parseDate(s);
  if (isNaN(d)) return null;
  return Math.round((d - todayStart()) / 864e5);
}

async function readState() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('coupon-keeper');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) {
        db.close();
        resolve(null);
        return;
      }
      const tx = db.transaction('kv', 'readonly');
      const get = tx.objectStore('kv').get('state');
      get.onsuccess = () => { db.close(); resolve(get.result || null); };
      get.onerror = () => { db.close(); reject(get.error); };
    };
  });
}

async function checkExpiryAndNotify() {
  let state;
  try { state = await readState(); } catch (_) { return; }
  if (!state || !Array.isArray(state.coupons)) return;
  const days = (state.settings && state.settings.reminderDays) || [7, 1];
  const due = [];
  state.coupons.forEach(c => {
    if (!c || c.used) return;
    const dl = daysLeft(c.exp);
    if (dl == null || dl < 0) return;
    if (dl === 0 || days.includes(dl)) due.push({ c, dl });
  });
  if (!due.length) return;
  const top = due.slice().sort((a, b) => a.dl - b.dl)[0];
  const body = due.length === 1
    ? `${top.c.store}${top.c.value ? ' — ' + top.c.value : ''} ${top.dl === 0 ? 'expires today' : 'expires in ' + top.dl + ' days'}`
    : `${due.length} items need attention. ${top.c.store} ${top.dl === 0 ? 'expires today' : 'in ' + top.dl + 'd'}.`;
  await self.registration.showNotification('🎟️ Coupon Keeper', {
    body,
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: 'ck-expiry-' + new Date().toDateString(),
    renotify: true
  });
}
