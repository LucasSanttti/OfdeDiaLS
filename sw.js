const CACHE = 'gvtr27-v8';
const SHARE = 'gvtr27-share';
const CDN = ['https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/pdf.min.js', 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/pdf.worker.min.js'];
const ASSETS = ['./', 'index.html', 'app.js?v=1.4.1', 'parser.js?v=1.4.1', 'apple-touch-icon.png', 'manifest.json', 'brasao.png', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => Promise.all([...ASSETS, ...CDN].map((a) => c.add(new Request(a, { cache: 'reload' })).catch(() => console.warn('SW: não encontrado', a))))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== SHARE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
// rede primeiro (pega atualizações), cache se offline
self.addEventListener('fetch', (e) => {
  // PDFs compartilhados pelo Android (WhatsApp, Arquivos…) → guarda e abre o app na tela de importação
  if (e.request.method === 'POST' && new URL(e.request.url).pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      try {
        const fd = await e.request.formData();
        const c = await caches.open(SHARE);
        for (const k of await c.keys()) await c.delete(k);
        let i = 0;
        for (const f of fd.getAll('escalas')) {
          if (!f || typeof f === 'string') continue;
          await c.put(new Request(`./shared/${i++}?name=${encodeURIComponent(f.name || 'escala.pdf')}`), new Response(f, { headers: { 'content-type': f.type || 'application/pdf' } }));
        }
      } catch (err) { /* segue para o app mesmo assim */ }
      return Response.redirect('./?share=1', 303);
    })());
    return;
  }
  if (e.request.method === 'GET' && CDN.includes(e.request.url)) {
    e.respondWith(caches.match(e.request.url).then((hit) => hit || fetch(e.request).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(e.request.url, cp)); } return r; })));
    return;
  }
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then((r) => { if (!r.ok) return r; const cp = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => { for (const c of cs) { if ('focus' in c) return c.focus(); } return self.clients.openWindow('./'); }));
});
