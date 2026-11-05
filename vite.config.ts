import { defineConfig, type Plugin } from 'vite';

/** Writes sw.js with the built file list, so the whole app is precached on first load. */
function serviceWorker(): Plugin {
  return {
    name: 'crawl-sw',
    apply: 'build',
    generateBundle(_opts, bundle) {
      // Fonts: only the latin woff2 files; the browser never asks for the rest.
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map') && !(/\.woff2?$/.test(f) && !/-latin-\d.*\.woff2$/.test(f)));
      const version = Date.now().toString(36);
      const precache = ['./', ...files.map((f) => `./${f}`), './manifest.webmanifest', './favicon.svg', './apple-touch-icon.png', './icon-192.png', './icon-512.png'];
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `// Generated at build time. App shell: precache. Map style, tiles, glyphs and sprites: cache on first use.
const APP = 'crawl-app-${version}';
const MAP = 'crawl-map-v1';
const PRECACHE = ${JSON.stringify(precache)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('crawl-app-') && k !== APP).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'tiles.openfreemap.org') {
    // Tiles and glyphs never change for a given URL: cache first. The style JSON: network first.
    const styleOrTileJson = url.pathname.startsWith('/styles/') || url.pathname === '/planet';
    e.respondWith(caches.open(MAP).then(async (c) => {
      const hit = await c.match(req);
      if (hit && !styleOrTileJson) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      } catch (err) {
        if (hit) return hit;
        throw err;
      }
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(caches.open(APP).then(async (c) => {
    const hit = await c.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    if (req.mode === 'navigate') { const shell = await c.match('./'); if (shell) return shell; }
    return fetch(req);
  }));
});
`,
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [serviceWorker()],
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  server: { host: true },
});
