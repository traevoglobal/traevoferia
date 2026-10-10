import { useSyncExternalStore } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { db, getMeta, setMeta } from './db';
import { getMyId, supabase } from './supabase';
import { TEXT_FIELDS, type LocalNote, type LocalSupplier, type Profile } from './types';
import { useLive } from './util';

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

export function usePendingCount(): number {
  return useLive(
    async () =>
      (await db.suppliers.where('_dirty').equals(1).count()) + (await db.notes.where('_dirty').equals(1).count()),
    [],
    0,
  );
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
    ai_status: r.ai_status === 'done' || r.ai_status === 'error' ? r.ai_status : 'pending',
    ai_summary: str(r.ai_summary),
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

/* ---------- Merge (last-write-wins por updated_at) ---------- */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function mergeSuppliers(rows: any[]) {
  if (!rows.length) return;
  await db.transaction('rw', db.suppliers, async () => {
    for (const r of rows) {
      if (!r?.id) continue;
      const remote = normalizeSupplier(r);
      const local = await db.suppliers.get(remote.id);
      if (local && Date.parse(local.updated_at) > Date.parse(remote.updated_at)) continue;
      await db.suppliers.put(remote);
    }
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function mergeNotes(rows: any[]) {
  if (!rows.length) return;
  await db.transaction('rw', db.notes, async () => {
    for (const r of rows) {
      if (!r?.project_slug) continue;
      const remote: LocalNote = {
        project_slug: r.project_slug,
        target: str(r.target),
        competition: str(r.competition),
        conclusions: str(r.conclusions),
        updated_by: str(r.updated_by),
        updated_at: iso(r.updated_at),
        _dirty: 0,
      };
      const local = await db.notes.get(remote.project_slug);
      if (local && Date.parse(local.updated_at) > Date.parse(remote.updated_at)) continue;
      await db.notes.put(remote);
    }
  });
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
async function pushSuppliers(): Promise<string | null> {
  let err: string | null = null;
  const dirty = await db.suppliers.where('_dirty').equals(1).toArray();
  dirty.sort((a, b) => a.updated_at.localeCompare(b.updated_at));
  for (const s of dirty) {
    const pending = (await db.photos.where('supplier_id').equals(s.id).toArray()).filter((p) => !p.uploaded);
    let ok = true;
    for (const p of pending) {
      const { error } = await supabase.storage
        .from('photos')
        .upload(p.path, p.blob, { contentType: 'image/jpeg', upsert: true, cacheControl: '31536000' });
      if (error && !/exist|duplicate/i.test(error.message)) {
        err = error.message;
        ok = false;
        break;
      }
      await db.photos.update(p.path, { uploaded: 1 });
    }
    if (!ok) continue;
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

async function pushNotes(): Promise<string | null> {
  let err: string | null = null;
  const dirty = await db.notes.where('_dirty').equals(1).toArray();
  for (const n of dirty) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _dirty, ...row } = n;
    const { error } = await supabase.from('project_notes').upsert({ ...row, updated_by: row.updated_by || null });
    if (error) {
      err = error.message;
      continue;
    }
    await db.transaction('rw', db.notes, async () => {
      const cur = await db.notes.get(n.project_slug);
      if (cur && cur.updated_at === n.updated_at) await db.notes.update(n.project_slug, { _dirty: 0 });
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

async function pullNotes() {
  const { data, error } = await supabase.from('project_notes').select('*');
  if (error) throw error;
  await mergeNotes(data ?? []);
}

/* ---------- Motor ---------- */
let running: Promise<void> | null = null;
let again = false;

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
    const e1 = await pushSuppliers();
    const e2 = await pushNotes();
    await pullProfiles().catch(() => {});
    await pullSuppliers();
    await pullNotes();
    setStatus({ syncing: false, error: e1 ?? e2 });
    syncedHandlers.forEach((f) => f());
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
    const n = (await db.suppliers.where('_dirty').equals(1).count()) + (await db.notes.where('_dirty').equals(1).count());
    if (n > 0) void syncNow();
  }, 30_000);

  const channel: RealtimeChannel = supabase
    .channel('feria-db')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, (p) => {
      if (p.new && 'id' in p.new) void mergeSuppliers([p.new]);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'project_notes' }, (p) => {
      if (p.new && 'project_slug' in p.new) void mergeNotes([p.new]);
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
