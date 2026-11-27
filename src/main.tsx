import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

// Unregister any previously installed Service Workers so the browser always uses fresh app/API versions
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => {
      regs.forEach((reg) => {
        reg.unregister().catch(() => {});
      });
    })
    .catch(() => {});
}

if (typeof window !== 'undefined' && 'caches' in window) {
  caches
    .keys()
    .then((keys) => {
      keys.forEach((key) => {
        if (key.includes('workbox') || key.includes('precache')) {
          caches.delete(key).catch(() => {});
        }
      });
    })
    .catch(() => {});
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
