/* Escrituras locales de las fichas (instantáneas, sin red). Todo se autoguarda: la ficha se crea con el
   primer cambio y cada tecla se escribe en el móvil; la subida a Supabase va detrás, agrupada. */
import { db } from './db';
import { getMyId } from './supabase';
import { syncSoon } from './sync';
import { compressPhoto } from './photos';
import type { Linea, LocalSupplier, Supplier } from './types';
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
export type FichaBase = Pick<Supplier, 'project_ids'> & { otra?: string; linea?: Linea };

/** Cambio sobre la ficha, creándola si aún no existe. Lee la versión actual dentro de la transacción. */
export async function editFicha(id: string, base: FichaBase | undefined, fn: (cur: LocalSupplier) => Partial<Supplier>) {
  await db.transaction('rw', db.suppliers, async () => {
    const me = getMyId() ?? '';
    let cur = await db.suppliers.get(id);
    if (!cur) {
      const now = new Date().toISOString();
      cur = { ...emptySupplier(id, me, now), project_ids: base?.project_ids ?? [], extra: {} };
      if (base?.otra !== undefined) cur.extra.otra = base.otra;
      if (base?.linea) cur.extra.linea = base.linea;
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

/** Quitar una foto o audio: sale de la ficha y queda anotado como borrado (para que la fusión entre móviles
    no lo vuelva a añadir). El archivo se conserva en el móvil y en Supabase. */
const tombstone = (cur: LocalSupplier, path: string) => [...new Set([...(cur.extra.borrados ?? []), path])];

export const removePhoto = (id: string, path: string) =>
  editFicha(id, undefined, (cur) => ({ photos: cur.photos.filter((p) => p.path !== path), extra: { ...cur.extra, borrados: tombstone(cur, path) } }));

/** Nota de voz: archivo y ficha en una sola transacción (o se guardan los dos, o ninguno). */
export async function addAudio(id: string, base: FichaBase | undefined, blob: Blob, secs: number) {
  const path = `${id}/${uuid()}.${audioExt(blob)}`;
  await db.transaction('rw', db.photos, db.suppliers, async () => {
    await db.photos.put({ path, blob, secs, supplier_id: id, uploaded: 0 });
    await editFicha(id, base, (cur) => ({ extra: { ...cur.extra, audios: [...(cur.extra.audios ?? []), { path, secs }] } }));
  });
}

export const removeAudio = (id: string, path: string) =>
  editFicha(id, undefined, (cur) => ({
    extra: { ...cur.extra, audios: (cur.extra.audios ?? []).filter((a) => a.path !== path), borrados: tombstone(cur, path) },
  }));

/* ---------- Grabación a prueba de cierres ----------
   Cada segundo de audio se escribe en el móvil mientras se graba. Si la app se cierra o iOS la mata a mitad,
   al volver a abrirla la grabación se recompone con lo guardado y se añade a su ficha (recoverRecordings). */

export async function startRecording(ficha: string, base: FichaBase | undefined, mime: string): Promise<string> {
  const id = uuid();
  await db.recordings.put({ id, ficha, base, mime, t0: Date.now() });
  return id;
}

export const saveRecPart = (rec: string, seq: number, blob: Blob) => db.recParts.add({ rec, seq, blob, t: Date.now() });

/** Junta los trozos guardados y deja el audio en su ficha. `fallback`: los trozos en memoria, por si el
    móvil no pudo escribirlos (sin espacio). Devuelve false si no había nada que guardar. */
export async function finishRecording(recId: string, secs?: number, fallback?: Blob[]): Promise<boolean> {
  const rec = await db.recordings.get(recId);
  if (!rec) return false;
  const parts = (await db.recParts.where('rec').equals(recId).toArray()).sort((a, b) => a.seq - b.seq);
  const chunks = parts.length >= (fallback?.length ?? 0) ? parts.map((p) => p.blob) : (fallback ?? []);
  const blob = new Blob(chunks, { type: rec.mime || chunks[0]?.type || 'audio/mp4' });
  const dur = secs ?? Math.max(1, Math.round(((parts[parts.length - 1]?.t ?? rec.t0) - rec.t0) / 1000));
  if (blob.size) await addAudio(rec.ficha, rec.base, blob, dur);
  await db.transaction('rw', db.recordings, db.recParts, async () => {
    await db.recParts.where('rec').equals(recId).delete();
    await db.recordings.delete(recId);
  });
  return blob.size > 0;
}

/** Grabaciones que quedaron a medias (app cerrada grabando): se recomponen y se añaden a su ficha. */
export async function recoverRecordings(): Promise<number> {
  let n = 0;
  for (const r of await db.recordings.toArray()) if (await finishRecording(r.id)) n++;
  return n;
}

/** Red de seguridad: cualquier foto o audio guardado en el móvil que haya quedado fuera de su ficha
    (y no se borrara a propósito) se vuelve a enlazar. */
export async function repairMedia(): Promise<number> {
  let n = 0;
  const bySupplier = new Map<string, { path: string; secs?: number }[]>();
  await db.photos.each((p) => bySupplier.set(p.supplier_id, [...(bySupplier.get(p.supplier_id) ?? []), { path: p.path, secs: p.secs }]));
  for (const [id, media] of bySupplier) {
    const s = await db.suppliers.get(id);
    if (!s || s.deleted) continue;
    const known = new Set([...s.photos.map((p) => p.path), ...(s.extra.audios ?? []).map((a) => a.path), ...(s.extra.borrados ?? [])]);
    const lost = media.filter((m) => !known.has(m.path));
    if (!lost.length) continue;
    n += lost.length;
    await editFicha(id, undefined, (cur) => ({
      photos: [...cur.photos, ...lost.filter((m) => m.path.endsWith('.jpg')).map((m) => ({ path: m.path }))],
      extra: { ...cur.extra, audios: [...(cur.extra.audios ?? []), ...lost.filter((m) => !m.path.endsWith('.jpg')).map((m) => ({ path: m.path, secs: m.secs ?? 0 }))] },
    }));
  }
  return n;
}
