import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Register Service Worker for offline capabilities and PWA caching
if ('serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onNeedRefresh() {
      console.log('PWA: Actualización disponible.');
    },
    onOfflineReady() {
      console.log('PWA: Modo sin conexión preparado.');
    },
  });
}

createRoot(document.getElementById('root')!).render(<App />);
