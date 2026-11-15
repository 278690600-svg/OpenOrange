const CACHE_NAME = 'openorange-v1'
const STATIC_CACHE = 'static-v1'
const DYNAMIC_CACHE = 'dynamic-v1'

const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
]

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  )
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  )
})

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event
  
  if (request.method !== 'GET') return
  
  event.respondWith(
    caches.match(request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse
      }
      
      return fetch(request).then(response => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response
        }
        
        const responseToCache = response.clone()
        caches.open(DYNAMIC_CACHE).then(cache => {
          cache.put(request, responseToCache)
        })
        
        return response
      })
    })
  )
})

// Background sync for offline operations
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-documents') {
    event.waitUntil(syncDocuments())
  }
})

async function syncDocuments() {
  // Sync pending document saves when back online
  const cache = await caches.open(DYNAMIC_CACHE)
  // Implementation would sync unsaved changes
}

// Push notifications
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {}
  
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: data.url || '/',
    actions: data.actions || []
  }
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'OpenOrangeAI', options)
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  
  event.waitUntil(
    clients.openWindow(event.notification.data)
  )
})
