/* Escrituras locales de las fichas (instantáneas, sin red). Todo se autoguarda: la ficha se crea con el
   primer cambio y cada tecla se escribe en el móvil; la subida a Supabase va detrás, agrupada. */
import { db } from './db';
import { getMyId } from './supabase';
import { syncSoon } from './sync';
import { compressPhoto } from './photos';
import type { LocalSupplier, Supplier } from './types';
import { nextIso, uuid } from './util';

/** Espera tras la última tecla antes de subir. */
const UPLOAD_DELAY = 2500;

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

/** Lo que lleva una ficha nueva antes del primer cambio (p. ej. el proyecto de la presentación). */
export type FichaBase = Pick<Supplier, 'project_ids'> & { otra?: string };

/** Cambio sobre la ficha, creándola si aún no existe. Lee la versión actual dentro de la transacción. */
export async function editFicha(id: string, base: FichaBase | undefined, fn: (cur: LocalSupplier) => Partial<Supplier>) {
  await db.transaction('rw', db.suppliers, async () => {
    const me = getMyId() ?? '';
    let cur = await db.suppliers.get(id);
    if (!cur) {
      const now = new Date().toISOString();
      cur = { ...emptySupplier(id, me, now), project_ids: base?.project_ids ?? [] };
      if (base?.otra !== undefined) cur.extra = { otra: base.otra };
    }
    await db.suppliers.put({ ...cur, ...fn(cur), updated_at: nextIso(cur.updated_at), updated_by: me || cur.updated_by, _dirty: 1 });
  });
  syncSoon(UPLOAD_DELAY);
}

export const updateFicha = (id: string, base: FichaBase | undefined, patch: Partial<Supplier>) => editFicha(id, base, () => patch);

export const updateExtra = (id: string, base: FichaBase | undefined, fn: (e: Supplier['extra']) => Supplier['extra']) =>
  editFicha(id, base, (cur) => ({ extra: fn(cur.extra) }));

export const deleteFicha = (id: string) => editFicha(id, undefined, () => ({ deleted: true }));

const audioExt = (b: Blob) => (b.type.includes('webm') ? 'webm' : b.type.includes('ogg') ? 'ogg' : 'm4a');

/** Foto (de la cámara o la galería): se comprime y se añade. Devuelve su ruta. */
export async function addPhoto(id: string, base: FichaBase | undefined, file: Blob): Promise<string> {
  const { blob, thumb } = await compressPhoto(file);
  const path = `${id}/${uuid()}.jpg`;
  await db.photos.put({ path, blob, thumb, supplier_id: id, uploaded: 0 });
  await editFicha(id, base, (cur) => ({ photos: [...cur.photos, { path }] }));
  return path;
}

export const removePhoto = (id: string, path: string) =>
  editFicha(id, undefined, (cur) => ({ photos: cur.photos.filter((p) => p.path !== path) }));

export async function addAudio(id: string, base: FichaBase | undefined, blob: Blob, secs: number) {
  const path = `${id}/${uuid()}.${audioExt(blob)}`;
  await db.photos.put({ path, blob, supplier_id: id, uploaded: 0 });
  await editFicha(id, base, (cur) => ({ extra: { ...cur.extra, audios: [...(cur.extra.audios ?? []), { path, secs }] } }));
}

export const removeAudio = (id: string, path: string) =>
  editFicha(id, undefined, (cur) => ({ extra: { ...cur.extra, audios: (cur.extra.audios ?? []).filter((a) => a.path !== path) } }));
