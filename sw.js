// Every code file is checked against the server each time, so a new version arrives whole. (Browsers otherwise hold each file for up to 10 minutes on
// GitHub Pages, and a mix of old and new modules fails with nothing but a blank page.) Art files are left to the normal cache: they're big, and safe to mix.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return;
  if (/\.(js|mjs|html|json|css)$/.test(u.pathname) || u.pathname.endsWith('/')) e.respondWith(fetch(e.request, { cache: 'no-cache' }).catch(() => fetch(e.request)));
});
