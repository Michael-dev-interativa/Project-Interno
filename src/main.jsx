import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { registerSW } from 'virtual:pwa-register'
import { startOnlineSyncListener } from '@/lib/offline-sync'

ReactDOM.createRoot(document.getElementById('root')).render(
  // <React.StrictMode>
  <App />
  // </React.StrictMode>,
)

registerSW({
  immediate: true,
  onRegisteredSW(swUrl) {
    console.info('[PWA] Service Worker registrado:', swUrl)
  },
  onRegisterError(error) {
    console.error('[PWA] Falha ao registrar Service Worker:', error)
  }
})

// Start background sync listener — fires processSyncQueue() when back online
startOnlineSyncListener()

if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', () => {
    window.parent?.postMessage({ type: 'sandbox:beforeUpdate' }, '*');
  });
  import.meta.hot.on('vite:afterUpdate', () => {
    window.parent?.postMessage({ type: 'sandbox:afterUpdate' }, '*');
  });
}



