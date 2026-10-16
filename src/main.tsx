import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);

/* Actualizaciones: la app instalada (iOS) no se recarga al abrirla, solo vuelve al frente. Cada vez que vuelve
   al frente se busca versión nueva; cuando el service worker nuevo toma el control, se recarga una vez.
   Lo escrito no se pierde: cada tecla ya está guardada en el móvil y la pantalla se restaura del historial. */
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });
  const check = () => void navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {});
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) check();
  });
  window.addEventListener('online', check);
}
