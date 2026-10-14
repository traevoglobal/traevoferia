import { db } from './db';
import { getMyId } from './supabase';
import { syncSoon } from './sync';
import { compressPhoto } from './photos';
import { rememberEvent } from './content';
import type { Draft, LocalNote, LocalSupplier, ProjectNote, Supplier } from './types';
import { nextIso, uuid } from './util';

export function emptySupplier(id: string, me: string, now: string): LocalSupplier {
  return {
    id,
    company: '', company_zh: '', contact: '', role: '', wechat: '', phone: '', email: '', web: '', booth: '',
    city: '', kind: '', products: '', price: '', moq: '', incoterm: '', lead_time: '', samples: '',
    agreement: '', next_step: '',
    project_ids: [], tags: [], rating: 0, photos: [], event: '', note: '', deleted: false,
    created_by: me, updated_by: me, created_at: now, updated_at: now, _dirty: 1,
  };
}

/** Guarda la captura en local (instantáneo, offline) y la encola. */
export async function saveCapture(draft: Draft): Promise<string> {
  const me = getMyId() ?? '';
  const id = uuid();
  const now = new Date().toISOString();
  const photos = draft.photos.map((p) => ({ path: `${id}/${p.id}.jpg`, blob: p.blob, thumb: p.thumb }));
  const s: LocalSupplier = {
    ...emptySupplier(id, me, now),
    note: draft.note.trim(),
    project_ids: draft.project_ids,
    tags: draft.tags ?? [],
    event: draft.event,
    photos: photos.map((p) => ({ path: p.path })),
  };
  await db.transaction('rw', db.suppliers, db.photos, db.drafts, async () => {
    await db.photos.bulkPut(photos.map((p) => ({ ...p, supplier_id: id, uploaded: 0 as const })));
    await db.suppliers.put(s);
    await db.drafts.delete('current');
  });
  rememberEvent(draft.event);
  syncSoon(100);
  return id;
}

export async function updateSupplier(id: string, patch: Partial<Supplier>) {
  await db.transaction('rw', db.suppliers, async () => {
    const cur = await db.suppliers.get(id);
    if (!cur) return;
    await db.suppliers.put({
      ...cur,
      ...patch,
      updated_at: nextIso(cur.updated_at),
      updated_by: getMyId() ?? cur.updated_by,
      _dirty: 1,
    });
  });
  syncSoon();
}

export async function addPhotosToSupplier(id: string, files: File[]) {
  for (const f of files) {
    const { blob, thumb } = await compressPhoto(f);
    const path = `${id}/${uuid()}.jpg`;
    await db.transaction('rw', db.suppliers, db.photos, async () => {
      const cur = await db.suppliers.get(id);
      if (!cur) return;
      await db.photos.put({ path, supplier_id: id, blob, thumb, uploaded: 0 });
      await db.suppliers.put({
        ...cur,
        photos: [...cur.photos, { path }],
        updated_at: nextIso(cur.updated_at),
        updated_by: getMyId() ?? cur.updated_by,
        _dirty: 1,
      });
    });
  }
  syncSoon();
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
