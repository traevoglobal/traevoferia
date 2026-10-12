/* Navegación: el historial del navegador es la única fuente de verdad.
   Cada entrada guarda la pantalla completa (pestaña, pila, capas abiertas) y se refleja en el hash.
   Atrás (gesto, botón o app) = history.back(); al llegar a una entrada se pinta lo que guarda. */
import { useSyncExternalStore } from 'react';

export type Tab = 'hoy' | 'proyectos' | 'proveedores' | 'traductor';
export type Route = { kind: 'project'; slug: string } | { kind: 'supplier'; id: string };
export type Overlay =
  | { kind: 'capture'; project?: string }
  | { kind: 'present'; slug: string }
  | { kind: 'qr'; slug: string }
  | { kind: 'viewer'; paths: string[]; index: number }
  | { kind: 'profile' };
export type NavState = { tab: Tab; stack: Route[]; overlays: Overlay[]; depth: number };

const OVERLAY_HASH: Record<Overlay['kind'], string> = {
  capture: 'captar', present: 'presentar', qr: 'qr', viewer: 'foto', profile: 'perfil',
};

const ROOT: NavState = { tab: 'hoy', stack: [], overlays: [], depth: 0 };
let state: NavState = ROOT;
/** Pila de cada pestaña, para recuperarla al volver a ella. */
const kept: Record<Tab, Route[]> = { hoy: [], proyectos: [], proveedores: [], traductor: [] };
let pendingTab: Tab | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function hashOf(s: NavState) {
  const parts = [s.tab, ...s.stack.map((r) => (r.kind === 'project' ? r.slug : 'proveedor')), ...s.overlays.map((o) => OVERLAY_HASH[o.kind])];
  return `#/${parts.join('/')}`;
}

function isNavState(v: unknown): v is NavState & { feria: 1 } {
  return !!v && (v as { feria?: number }).feria === 1;
}

function set(s: NavState) {
  state = s;
  kept[s.tab] = s.stack;
  listeners.forEach((l) => l());
}

function write(s: NavState, mode: 'push' | 'replace') {
  const entry = { ...s, feria: 1 };
  if (mode === 'push') history.pushState(entry, '', hashOf(s));
  else history.replaceState(entry, '', hashOf(s));
  set(s);
}

/** Deja la pestaña t en su raíz (entrada base) y vuelve a apilar su pila guardada. */
function rebase(t: Tab) {
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTab = pendingTimer = null;
  const stack = kept[t];
  write({ tab: t, stack: [], overlays: [], depth: 0 }, 'replace');
  stack.forEach((_, i) => write({ tab: t, stack: stack.slice(0, i + 1), overlays: [], depth: i + 1 }, 'push'));
}

export function navInit() {
  const s = history.state;
  if (isNavState(s)) set({ tab: s.tab, stack: s.stack, overlays: s.overlays, depth: s.depth });
  else write(ROOT, 'replace');
}

export function navPush(r: Route) {
  write({ ...state, stack: [...state.stack, r], depth: state.depth + 1 }, 'push');
}

export function navOpen(o: Overlay) {
  write({ ...state, overlays: [...state.overlays, o], depth: state.depth + 1 }, 'push');
}

export function navBack() {
  if (pendingTab) return;
  if (state.depth > 0) history.back();
  else if (state.stack.length || state.overlays.length) write({ ...state, stack: [], overlays: [] }, 'replace');
}

/** Cambiar de pestaña; tocar la activa la devuelve a su raíz (como en iOS). */
export function navTab(t: Tab) {
  if (pendingTab) return;
  if (t === state.tab) {
    if (!state.stack.length && !state.overlays.length) return;
    kept[t] = [];
  }
  if (state.depth === 0) return rebase(t);
  pendingTab = t;
  // Por si el navegador no avisa del salto: continuar igualmente.
  pendingTimer = setTimeout(() => pendingTab && rebase(pendingTab), 600);
  history.go(-state.depth);
}

window.addEventListener('popstate', (e) => {
  if (pendingTab) return rebase(pendingTab);
  if (isNavState(e.state)) set({ tab: e.state.tab, stack: e.state.stack, overlays: e.state.overlays, depth: e.state.depth });
  else write({ ...state, stack: [], overlays: [], depth: 0 }, 'replace');
});

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Pila guardada de una pestaña (para mantener montadas las que no se ven). */
export const keptStack = (t: Tab): Route[] => (t === state.tab ? state.stack : kept[t]);

export const useNav = () => useSyncExternalStore(subscribe, () => state);
