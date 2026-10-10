/* Integración mínima con el historial: atrás del sistema = cerrar lo último abierto. */
type Handler = () => void;
const handlers: Handler[] = [];

export function navPush(onBack: Handler) {
  handlers.push(onBack);
  history.pushState({ feria: handlers.length }, '');
}

export function navBack() {
  if (handlers.length) history.back();
}

/** Entrada bloqueada: el gesto atrás no la cierra mientras isLocked() sea true. */
export function navPushLocked(isLocked: () => boolean, onExit: Handler) {
  const h: Handler = () => {
    if (isLocked()) {
      handlers.push(h);
      history.pushState({ feria: handlers.length }, '');
    } else onExit();
  };
  navPush(h);
}

window.addEventListener('popstate', () => {
  handlers.pop()?.();
});
