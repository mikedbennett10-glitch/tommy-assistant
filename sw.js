// Tommy Service Worker — handles push notifications

self.addEventListener('install', (e) => {
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim())
})

self.addEventListener('push', (e) => {
  const data = e.data ? e.data.json() : {}
  const title = data.title || 'Tommy'
  const options = {
    body: data.body || '',
    icon: '/tommy-assistant/icon-192.png',
    badge: '/tommy-assistant/icon-192.png',
    tag: data.tag || 'tommy-notification',
    renotify: true,
    data: { url: data.url || '/tommy-assistant/' },
  }
  e.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = e.notification.data?.url || '/tommy-assistant/'
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/tommy-assistant/') && 'focus' in client) {
          return client.focus()
        }
      }
      return clients.openWindow(url)
    })
  )
})
