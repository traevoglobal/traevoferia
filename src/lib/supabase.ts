import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && key);
export const AUTH_STORAGE_KEY = 'traevo-feria-auth';

/** En la feria la red puede "estar" sin llegar a Supabase (wifi saturada, bloqueos): una petición colgada
    no debe dejar la sincronización parada. Pasado el límite se aborta y se reintenta en el siguiente ciclo. */
const TIMEOUT = 60_000;
const fetchWithTimeout: typeof fetch = (input, init) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new DOMException('Sin respuesta del servidor', 'TimeoutError')), TIMEOUT);
  init?.signal?.addEventListener('abort', () => ctrl.abort(init.signal?.reason));
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(t));
};

export const supabase = createClient(url || 'http://localhost:54321', key || 'missing-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: AUTH_STORAGE_KEY },
  global: { fetch: fetchWithTimeout },
});

let myId: string | null = null;
export const getMyId = () => myId;
export const setMyId = (id: string | null) => {
  myId = id;
};
