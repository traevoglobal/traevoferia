import { useSyncExternalStore } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { db, getMeta, setMeta } from './db';
import { getMyId, supabase } from './supabase';
import { TEXT_FIELDS, type LocalSupplier, type Profile } from './types';
import { nextIso, useLive } from './util';
import { storeContent } from './content';
import { prefetchThumbs, thumbPath } from './photos';
import { syncAssets } from './assets';

/* ---------- Estado ---------- */
type Status = { online: boolean; syncing: boolean; error: string | null };
let status: Status = { online: navigator.onLine, syncing: false, error: null };
const listeners = new Set<() => void>();

function setStatus(patch: Partial<Status>) {
  status = { ...status, ...patch };
  listeners.forEach((f) => f());
}

export function useSyncStatus(): Status {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => status,
  );
}

/** Lo que falta por subir: fichas cambiadas y fotos o audios aún solo en el móvil. */
async function pendingCount() {
  return (await db.suppliers.where('_dirty').equals(1).count()) + (await db.photos.filter((p) => !p.uploaded).count());
}

export function usePendingCount(): number {
  return useLive(pendingCount, [], 0);
}

const syncedHandlers = new Set<() => void>();
export const onSynced = (fn: () => void) => {
  syncedHandlers.add(fn);
  return () => syncedHandlers.delete(fn);
};

/* ---------- Normalización ---------- */
const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : new Date(0).toISOString());
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeSupplier(r: any): LocalSupplier {
  const s = {
    id: r.id,
    project_ids: Array.isArray(r.project_ids) ? r.project_ids : [],
    tags: Array.isArray(r.tags) ? r.tags : [],
    rating: Number(r.rating) || 0,
    photos: Array.isArray(r.photos) ? r.photos.filter((p: { path?: string }) => p?.path) : [],
    event: str(r.event),
    note: str(r.note),
    extra: r.extra && typeof r.extra === 'object' && !Array.isArray(r.extra) ? r.extra : {},
    deleted: !!r.deleted,
    created_by: str(r.created_by),
    updated_by: str(r.updated_by),
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
    _dirty: 0,
  } as LocalSupplier;
  for (const k of TEXT_FIELDS) s[k] = str(r[k]);
  return s;
}

function toRemoteSupplier(s: LocalSupplier) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _dirty, ...rest } = s;
  return { ...rest, created_by: rest.created_by || null, updated_by: rest.updated_by || null };
}

/* ---------- Merge ----------
   Last-write-wins por updated_at para la ficha, salvo fotos y audios: esos se suman de las dos versiones
   (menos los quitados a propósito, extra.borrados). Así, si los dos móviles tocan la misma ficha a la vez,
   ningún audio ni foto se queda fuera; la versión fusionada se vuelve a subir. */
function unionMedia(winner: LocalSupplier, other: LocalSupplier): LocalSupplier | null {
  const gone = new Set([...(winner.extra.borrados ?? []), ...(other.extra.borrados ?? [])]);
  const photos = winner.photos.filter((x) => !gone.has(x.path));
  for (const x of other.photos) if (!gone.has(x.path) && !photos.some((y) => y.path === x.path)) photos.push(x);
  const audios = (winner.extra.audios ?? []).filter((x) => !gone.has(x.path));
  for (const x of other.extra.audios ?? []) if (!gone.has(x.path) && !audios.some((y) => y.path === x.path)) audios.push(x);
  const key = (xs: { path: string }[]) => xs.map((x) => x.path).join('|');
  const same =
    key(photos) === key(winner.photos) &&
    key(audios) === key(winner.extra.audios ?? []) &&
    gone.size === new Set(winner.extra.borrados ?? []).size;
  if (same) return null;
  return { ...winner, photos, extra: { ...winner.extra, audios, ...(gone.size ? { borrados: [...gone] } : {}) } };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function mergeSuppliers(rows: any[]) {
  if (!rows.length) return;
  let again = false;
  await db.transaction('rw', db.suppliers, async () => {
    for (const r of rows) {
      if (!r?.id) continue;
      const remote = normalizeSupplier(r);
      const local = await db.suppliers.get(remote.id);
      if (!local) {
        await db.suppliers.put(remote);
        continue;
      }
      const localWins = Date.parse(local.updated_at) > Date.parse(remote.updated_at);
      const merged = localWins ? unionMedia(local, remote) : unionMedia(remote, local);
      if (merged) {
        // La fusión es una versión nueva: más reciente que las dos, y pendiente de subir.
        const newest = localWins ? local.updated_at : remote.updated_at;
        await db.suppliers.put({ ...merged, updated_at: nextIso(newest), _dirty: 1 });
        again = true;
      } else if (!localWins) await db.suppliers.put(remote);
    }
  });
  if (again) syncSoon(1000);
}

/* ---------- Perfiles ---------- */
let profilesTable = localStorage.getItem('feria.profilesTable') ?? '';

export async function profilesTableName(): Promise<string> {
  if (profilesTable) return profilesTable;
  const r = await supabase.from('feria_profiles').select('id').limit(1);
  if (!r.error) profilesTable = 'feria_profiles';
  else if (['PGRST205', '42P01'].includes(r.error.code) || /does not exist|could not find/i.test(r.error.message))
    profilesTable = 'profiles';
  else throw r.error;
  localStorage.setItem('feria.profilesTable', profilesTable);
  return profilesTable;
}

export async function pullProfiles(): Promise<Profile[]> {
  const t = await profilesTableName();
  const { data, error } = await supabase.from(t).select('id,name,color');
  if (error) throw error;
  const rows = (data ?? []).map((p) => ({ id: p.id, name: str(p.name), color: str(p.color) }));
  await db.profiles.bulkPut(rows);
  return rows;
}

/** Devuelve el perfil propio (creándolo vacío si falta). */
export async function ensureProfile(id: string): Promise<Profile> {
  const rows = await pullProfiles();
  const mine = rows.find((p) => p.id === id);
  if (mine) return mine;
  const t = await profilesTableName();
  const p = { id, name: '', color: '' };
  const { error } = await supabase.from(t).insert(p);
  if (error && error.code !== '23505') throw error;
  await db.profiles.put(p);
  return p;
}

export async function saveProfile(p: Profile) {
  const t = await profilesTableName();
  const { error } = await supabase.from(t).upsert({ ...p, updated_at: new Date().toISOString() });
  if (error) throw error;
  await db.profiles.put(p);
}

/* ---------- Push ---------- */
/** Sube las fotos y audios que solo están en el móvil. Van aparte de las fichas: un audio que tarde en subir
    no retrasa que el otro móvil vea la ficha. Si una subida falla, se reintenta en el siguiente ciclo. */
async function pushMedia(): Promise<string | null> {
  let err: string | null = null;
  const pending = await db.photos.filter((p) => !p.uploaded).toArray();
  const up = (path: string, blob: Blob) =>
    supabase.storage.from('photos').upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: true, cacheControl: '31536000' });
  const ok = (e: { message: string } | null) => !e || /exist|duplicate/i.test(e.message);
  // Primero los audios: son lo que no se puede repetir.
  pending.sort((a, b) => Number(a.path.endsWith('.jpg')) - Number(b.path.endsWith('.jpg')));
  for (const p of pending) {
    if (!navigator.onLine) break;
    let { error } = await up(p.path, p.blob);
    // Miniatura aparte: el otro móvil la usa en los listados en vez de la foto entera.
    if (ok(error) && p.thumb) ({ error } = await up(thumbPath(p.path), p.thumb));
    if (!ok(error)) {
      err = error!.message;
      continue;
    }
    await db.photos.update(p.path, { uploaded: 1 });
  }
  return err;
}

async function pushSuppliers(): Promise<string | null> {
  let err: string | null = null;
  const dirty = await db.suppliers.where('_dirty').equals(1).toArray();
  dirty.sort((a, b) => a.updated_at.localeCompare(b.updated_at));
  for (const s of dirty) {
    const { error } = await supabase.from('suppliers').upsert(toRemoteSupplier(s));
    if (error) {
      err = error.message;
      continue;
    }
    await db.transaction('rw', db.suppliers, async () => {
      const cur = await db.suppliers.get(s.id);
      if (cur && cur.updated_at === s.updated_at) await db.suppliers.update(s.id, { _dirty: 0 });
    });
  }
  return err;
}

/* ---------- Pull ---------- */
async function pullSuppliers() {
  let since = await getMeta<string>('suppliersSyncedAt', '1970-01-01T00:00:00Z');
  const PAGE = 500;
  for (;;) {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .gte('synced_at', since)
      .order('synced_at', { ascending: true })
      .limit(PAGE);
    if (error) throw error;
    if (!data?.length) break;
    await mergeSuppliers(data);
    const last = data[data.length - 1].synced_at as string;
    if (data.length < PAGE || last === since) {
      await setMeta('suppliersSyncedAt', last);
      break;
    }
    since = last;
    await setMeta('suppliersSyncedAt', since);
  }
}

/* ---------- Motor ---------- */
let running: Promise<void> | null = null;
let again = false;

/** Contenido privado: pocas filas, se descarga entero y solo se guarda si cambió; luego sus imágenes. */
async function pullContent() {
  const { data, error } = await supabase.from('feria_content').select('key, data, updated_at');
  if (error) throw error;
  await storeContent(data ?? []);
  await syncAssets();
}

export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await syncOnce();
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}

let soonTimer: ReturnType<typeof setTimeout> | null = null;
export function syncSoon(ms = 300) {
  if (soonTimer) clearTimeout(soonTimer);
  soonTimer = setTimeout(() => {
    soonTimer = null;
    void syncNow();
  }, ms);
}

async function syncOnce() {
  if (!navigator.onLine) return setStatus({ online: false, syncing: false });
  if (!getMyId()) return;
  setStatus({ online: true, syncing: true });
  try {
    // Una sola comprobación de sesión (renueva el token si caducó). Si el servidor no responde, se deja
    // para el siguiente ciclo: si no, cada petición esperaría su propio intento de renovación.
    const { data: auth, error: authError } = await supabase.auth.getSession();
    if (authError || !auth.session) return setStatus({ syncing: false, error: 'Sin conexión con el servidor' });
    const e1 = await pushSuppliers();
    const e2 = await pushMedia();
    await pullProfiles().catch(() => {});
    await pullContent().catch((e) => console.warn('Contenido privado:', e));
    await pullSuppliers();
    setStatus({ syncing: false, error: e1 ?? e2 });
    syncedHandlers.forEach((f) => f());
    // Después, sin bloquear el indicador: miniaturas de las fichas del otro móvil para verlas sin red.
    const others = await db.suppliers.filter((s) => !s.deleted && s.photos.length > 0).toArray();
    await prefetchThumbs(others.flatMap((s) => s.photos.map((p) => p.path))).catch(() => {});
  } catch (e) {
    setStatus({ syncing: false, error: e instanceof Error ? e.message : String(e) });
  }
}

export function startSync(): () => void {
  const onOnline = () => {
    setStatus({ online: true });
    void syncNow();
  };
  const onOffline = () => setStatus({ online: false });
  const onVisible = () => {
    if (document.visibilityState === 'visible') void syncNow();
  };
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  document.addEventListener('visibilitychange', onVisible);

  const interval = setInterval(async () => {
    const n = await pendingCount();
    if (n > 0) void syncNow();
  }, 30_000);

  const channel: RealtimeChannel = supabase
    .channel('feria-db')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, (p) => {
      if (p.new && 'id' in p.new) void mergeSuppliers([p.new]);
    })
    .subscribe();

  void syncNow();

  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    document.removeEventListener('visibilitychange', onVisible);
    clearInterval(interval);
    void supabase.removeChannel(channel);
  };
}
