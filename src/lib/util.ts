import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { liveQuery } from 'dexie';

export function uuid(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** ISO estrictamente posterior a `prev` (last-write-wins sin empates). */
export function nextIso(prev?: string): string {
  const p = prev ? Date.parse(prev) : 0;
  return new Date(Math.max(Date.now(), p + 1)).toISOString();
}

export const norm = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export function initials(name?: string): string {
  const parts = (name || '?').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export const PALETTE = ['#C2302A', '#007AFF', '#34C759', '#FF9500', '#AF52DE', '#5AC8FA', '#FF2D55', '#8E8E93'];

export function colorFor(id?: string): string {
  let h = 0;
  for (const c of id ?? '') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function isToday(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

/** Valor guardado en este móvil y compartido entre pantallas (localStorage + suscripción). */
export function storedValue<T>(key: string, initial: T) {
  let value: T = initial;
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) value = JSON.parse(raw) as T;
  } catch {
    /* sin almacenamiento: en memoria */
  }
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(v: T) {
      value = v;
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {
        /* sin espacio o modo privado */
      }
      listeners.forEach((l) => l());
    },
    use: () =>
      useSyncExternalStore(
        (f) => {
          listeners.add(f);
          return () => {
            listeners.delete(f);
          };
        },
        () => value,
      ),
  };
}

/** Estado guardado en este móvil (localStorage). Si no hay almacenamiento, funciona solo en memoria. */
export function useStored<T>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (next: T | ((prev: T) => T)) =>
      setValue((prev) => {
        const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        try {
          localStorage.setItem(key, JSON.stringify(v));
        } catch {
          /* sin espacio o modo privado: queda en memoria */
        }
        return v;
      }),
    [key],
  );
  return [value, set];
}

/** Suscripción reactiva a una consulta de Dexie. */
export function useLive<T>(fn: () => T | Promise<T>, deps: unknown[], initial: T): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    const sub = liveQuery(fn).subscribe({ next: (v) => setValue(() => v), error: (e) => console.error(e) });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

/** Comparte un archivo con el menú nativo o, si no se puede, lo descarga. */
export async function shareOrDownload(file: File): Promise<void> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file] });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
