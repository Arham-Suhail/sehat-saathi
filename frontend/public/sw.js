/* Service worker: shows notifications and opens the right screen on tap.
   - In-app dose alarms (app open) call registration.showNotification directly.
   - Web Push (app closed): dose alarms for the elder, concern alerts for family/doctor.
   Both dose paths use the tag "sehat-saathi-dose", so one dose never shows two alerts. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

function safePath(url) {
  // Only same-origin paths: a push payload can never send the user to another site.
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : null;
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // App on screen: the in-app reminder engine is already alarming for this dose.
      if (data.type === 'reminder' && windows.some((w) => w.visibilityState === 'visible')) return;
      await self.registration.showNotification(String(data.title || 'Sehat Saathi').slice(0, 80), {
        body: String(data.body || '').slice(0, 200),
        tag: String(data.tag || 'sehat-saathi').slice(0, 80),
        renotify: true,
        requireInteraction: data.type === 'reminder',
        icon: '/favicon.svg',
        data: { url: safePath(data.url) },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = safePath(event.notification.data?.url) || '/elder/reminders';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
