import { db } from './db';
import { getMyId } from './supabase';
import { syncSoon } from './sync';
import { compressPhoto } from './photos';
import { rememberEvent } from './content';
import { splitPatch } from './ficha';
import { TEXT_FIELDS, type Draft, type LocalNote, type LocalSupplier, type ProjectNote, type Supplier, type SupplierExtra, type TextField } from './types';
import { nextIso, uuid } from './util';

export function emptySupplier(id: string, me: string, now: string): LocalSupplier {
  return {
    id,
    company: '', company_zh: '', contact: '', role: '', wechat: '', phone: '', email: '', web: '', booth: '',
    city: '', kind: '', products: '', price: '', moq: '', incoterm: '', lead_time: '', samples: '',
    agreement: '', next_step: '',
    project_ids: [], tags: [], rating: 0, photos: [], event: '', note: '', extra: {}, deleted: false,
    created_by: me, updated_by: me, created_at: now, updated_at: now, _dirty: 1,
  };
}

const audioExt = (b: Blob) => (b.type.includes('webm') ? 'webm' : b.type.includes('ogg') ? 'ogg' : 'm4a');

/** Guarda la captura en local (instantáneo, offline) y la encola. */
export async function saveCapture(draft: Draft): Promise<string> {
  const me = getMyId() ?? '';
  const id = uuid();
  const now = new Date().toISOString();
  const photos = draft.photos.map((p) => ({ path: `${id}/${p.id}.jpg`, blob: p.blob, thumb: p.thumb, kind: p.kind }));
  const audios = (draft.audios ?? []).map((a) => ({ path: `${id}/${a.id}.${audioExt(a.blob)}`, blob: a.blob, secs: a.secs }));
  const fields: Partial<Record<TextField, string>> = {};
  for (const [k, v] of Object.entries(draft.fields ?? {})) fields[k as TextField] = (v ?? '').trim();
  if (fields.booth) fields.booth = fields.booth.toUpperCase();
  const s: LocalSupplier = {
    ...emptySupplier(id, me, now),
    ...fields,
    note: draft.note.trim(),
    project_ids: draft.project_ids,
    tags: draft.tags ?? [],
    event: draft.event,
    photos: photos.map((p) => (p.kind ? { path: p.path, kind: p.kind } : { path: p.path })),
    extra: { ...draft.extra, ...(audios.length ? { audios: audios.map((a) => ({ path: a.path, secs: a.secs })) } : {}) },
  };
  await db.transaction('rw', db.suppliers, db.photos, db.drafts, async () => {
    await db.photos.bulkPut([
      ...photos.map((p) => ({ path: p.path, blob: p.blob, thumb: p.thumb, supplier_id: id, uploaded: 0 as const })),
      ...audios.map((a) => ({ path: a.path, blob: a.blob, supplier_id: id, uploaded: 0 as const })),
    ]);
    await db.suppliers.put(s);
    await db.drafts.delete('current');
  });
  rememberEvent(draft.event);
  syncSoon(100);
  return id;
}

/** Cambio sobre la ficha guardada, leyendo la versión actual dentro de la transacción. */
async function change(id: string, fn: (cur: LocalSupplier) => Partial<Supplier>) {
  await db.transaction('rw', db.suppliers, async () => {
    const cur = await db.suppliers.get(id);
    if (!cur) return;
    await db.suppliers.put({
      ...cur,
      ...fn(cur),
      updated_at: nextIso(cur.updated_at),
      updated_by: getMyId() ?? cur.updated_by,
      _dirty: 1,
    });
  });
  syncSoon();
}

export const updateSupplier = (id: string, patch: Partial<Supplier>) => change(id, () => patch);

/** Cambia campos de texto y claves de `extra` a la vez (vía, campos rápidos, cierre). */
export function updateFields(id: string, patch: Record<string, string>) {
  const { fields, extra } = splitPatch(patch);
  return change(id, (cur) => ({ ...fields, extra: { ...cur.extra, ...extra } }));
}

export interface NewPhoto {
  blob: Blob;
  thumb: Blob;
  kind?: string;
}

export async function addPhotosToSupplier(id: string, photos: NewPhoto[]) {
  const rows = photos.map((p) => ({ path: `${id}/${uuid()}.jpg`, ...p }));
  await db.transaction('rw', db.suppliers, db.photos, async () => {
    const cur = await db.suppliers.get(id);
    if (!cur) return;
    await db.photos.bulkPut(rows.map((r) => ({ path: r.path, blob: r.blob, thumb: r.thumb, supplier_id: id, uploaded: 0 as const })));
    await db.suppliers.put({
      ...cur,
      photos: [...cur.photos, ...rows.map((r) => (r.kind ? { path: r.path, kind: r.kind } : { path: r.path }))],
      updated_at: nextIso(cur.updated_at),
      updated_by: getMyId() ?? cur.updated_by,
      _dirty: 1,
    });
  });
  syncSoon();
}

/** Fotos de la galería (capturas de WeChat, por ejemplo): se comprimen y se añaden. */
export async function addFilesToSupplier(id: string, files: File[], kind?: string) {
  const photos: NewPhoto[] = [];
  for (const f of files) photos.push({ ...(await compressPhoto(f)), kind });
  await addPhotosToSupplier(id, photos);
}

export const setPhotoKind = (id: string, path: string, kind: string) =>
  change(id, (cur) => ({ photos: cur.photos.map((p) => (p.path === path ? { ...p, kind } : p)) }));

export async function addAudioToSupplier(id: string, blob: Blob, secs: number) {
  const path = `${id}/${uuid()}.${audioExt(blob)}`;
  await db.photos.put({ path, blob, supplier_id: id, uploaded: 0 });
  await change(id, (cur) => ({ extra: { ...cur.extra, audios: [...(cur.extra.audios ?? []), { path, secs }] } }));
}

/** Une `sourceId` dentro de `targetId`: fotos, audios, notas y lo que le falte; la de origen queda borrada. */
export async function mergeInto(targetId: string, sourceId: string) {
  if (targetId === sourceId) return;
  await db.transaction('rw', db.suppliers, async () => {
    const t = await db.suppliers.get(targetId);
    const s = await db.suppliers.get(sourceId);
    if (!t || !s) return;
    const fields: Partial<Record<TextField, string>> = {};
    for (const k of TEXT_FIELDS) if (!t[k].trim() && s[k].trim()) fields[k] = s[k];
    const extra: SupplierExtra = { ...s.extra };
    for (const [k, v] of Object.entries(t.extra)) if (v !== undefined && v !== '') extra[k] = v;
    const audios = [...(t.extra.audios ?? []), ...(s.extra.audios ?? [])];
    if (audios.length) extra.audios = audios;
    const me = getMyId();
    await db.suppliers.put({
      ...t,
      ...fields,
      photos: [...t.photos, ...s.photos.filter((p) => !t.photos.some((x) => x.path === p.path))],
      note: [t.note, s.note].filter((x, i, a) => x.trim() && a.indexOf(x) === i).join('\n'),
      project_ids: [...new Set([...t.project_ids, ...s.project_ids])],
      tags: [...new Set([...t.tags, ...s.tags])],
      extra,
      updated_at: nextIso(t.updated_at),
      updated_by: me ?? t.updated_by,
      _dirty: 1,
    });
    await db.suppliers.put({ ...s, deleted: true, updated_at: nextIso(s.updated_at), updated_by: me ?? s.updated_by, _dirty: 1 });
  });
  syncSoon();
}

/** Crea una ficha enlazada de otra vía (p. ej. "también es…"), asignada a `owner`. Devuelve su id. */
export async function spawnLinked(sourceId: string, via: string, owner: string): Promise<string | null> {
  const src = await db.suppliers.get(sourceId);
  if (!src) return null;
  const me = getMyId() ?? '';
  const id = uuid();
  const now = new Date().toISOString();
  const copy: Partial<Record<TextField, string>> = {};
  for (const k of ['company', 'company_zh', 'contact', 'role', 'wechat', 'phone', 'email', 'web', 'booth', 'city', 'kind'] as const) copy[k] = src[k];
  await db.suppliers.put({
    ...emptySupplier(id, me, now),
    ...copy,
    photos: src.photos,
    event: src.event,
    project_ids: src.project_ids,
    extra: { hall: src.extra.hall, via, owner, link: src.id },
  });
  await change(sourceId, (cur) => ({ extra: { ...cur.extra, link: id } }));
  return id;
}

export async function saveNote(slug: string, patch: Partial<ProjectNote>) {
  await db.transaction('rw', db.notes, async () => {
    const cur: LocalNote = (await db.notes.get(slug)) ?? {
      project_slug: slug, target: '', competition: '', conclusions: '', updated_by: '', updated_at: '', _dirty: 0,
    };
    await db.notes.put({ ...cur, ...patch, updated_at: nextIso(cur.updated_at), updated_by: getMyId() ?? '', _dirty: 1 });
  });
  syncSoon();
}
