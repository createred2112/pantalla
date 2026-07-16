'use strict';
// Service worker del panel: instalabilidad (PWA) + avisos push.
// No cachea nada a propósito: el panel es una herramienta viva y servir
// JavaScript o datos antiguos causa más problemas que la falta de red.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* red directa, sin caché */ });

// AVISOS: publicación fallida, verificación FTP, agenda sin cargar...
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch {}
  const title = data.title || 'LA PANTALLA';
  e.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    tag: data.tag || 'pantalla',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    renotify: true,
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((tabs) => {
    for (const tab of tabs) {
      if ('focus' in tab) { tab.navigate(url); return tab.focus(); }
    }
    return self.clients.openWindow(url);
  }));
});
