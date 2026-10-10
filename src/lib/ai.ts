import { db } from './db';
import { getMyId, supabase } from './supabase';
import { onSynced } from './sync';
import { updateSupplier } from './store';
import { getPhotoBlob, photoForAI } from './photos';
import { PROJECTS, PROJECT_BY_SLUG } from './content';
import { TEXT_FIELDS, type Supplier } from './types';

async function callAI<T>(payload: object, timeoutMs = 30_000): Promise<T> {
  if (!navigator.onLine) throw new Error('Sin conexión');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sin sesión');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
    return j as T;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('La IA tardó demasiado');
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export async function translate(text: string, dir: 'es-zh' | 'zh-es'): Promise<string> {
  return (await callAI<{ text: string }>({ mode: 'translate', text, dir })).text;
}

export async function conclude(slug: string, target: string, competition: string): Promise<string> {
  const p = PROJECT_BY_SLUG.get(slug);
  const suppliers = (await db.suppliers.toArray())
    .filter((s) => !s.deleted && s.project_ids.includes(slug))
    .sort((a, b) => b.rating - a.rating)
    .map((s) => ({
      empresa: s.company || s.company_zh, tipo: s.kind, ciudad: s.city, productos: s.products, precio: s.price,
      moq: s.moq, incoterm: s.incoterm, plazo: s.lead_time, muestras: s.samples, pactado: s.agreement,
      siguiente: s.next_step, valoracion: s.rating, resumen: s.ai_summary, nota: s.note.slice(0, 400),
    }));
  const project = p ? { nombre: p.name, ...p.es } : { nombre: slug };
  return (await callAI<{ text: string }>({ mode: 'conclude', project, target, competition, suppliers })).text;
}

type Extract = Record<(typeof TEXT_FIELDS)[number] | 'summary', string> & {
  project_ids: string[];
  tags: string[];
  rating: number;
};

const inflight = new Set<string>();

/** Clasifica un proveedor con IA. Solo rellena campos vacíos. */
export async function classify(id: string): Promise<void> {
  if (inflight.has(id)) return;
  inflight.add(id);
  try {
    const s = await db.suppliers.get(id);
    if (!s) return;
    const photos: string[] = [];
    for (const ph of s.photos.slice(0, 4)) {
      try {
        photos.push(await photoForAI(await getPhotoBlob(ph.path)));
      } catch {
        /* foto no disponible */
      }
    }
    const projects = PROJECTS.map((p) => ({ slug: p.slug, name: p.name, summary: p.es.summary }));
    let res: Extract;
    try {
      res = await callAI<Extract>({ mode: 'extract', photos, note: s.note, projects });
    } catch (e) {
      await updateSupplier(id, { ai_status: 'error' });
      throw e;
    }
    const cur = await db.suppliers.get(id);
    if (!cur) return;
    const patch: Partial<Supplier> = { ai_status: 'done', ai_summary: res.summary || cur.ai_summary };
    for (const k of TEXT_FIELDS) if (!cur[k].trim() && res[k]?.trim()) patch[k] = res[k].trim();
    if (!cur.project_ids.length && res.project_ids?.length) patch.project_ids = res.project_ids;
    if (!cur.tags.length && res.tags?.length) patch.tags = res.tags;
    if (!cur.rating && res.rating) patch.rating = res.rating;
    await updateSupplier(id, patch);
  } finally {
    inflight.delete(id);
  }
}

export const isClassifying = (id: string) => inflight.has(id);

/** "Clasificar pendientes": todos los no clasificados (de cualquiera). */
export async function classifyPending(): Promise<{ ok: number; fail: number }> {
  const list = (await db.suppliers.toArray()).filter((s) => !s.deleted && s.ai_status !== 'done');
  let ok = 0;
  let fail = 0;
  for (const s of list) {
    try {
      await classify(s.id);
      ok++;
    } catch {
      fail++;
    }
  }
  return { ok, fail };
}

/* Tras sincronizar, el móvil que hizo la captura la clasifica (una vez por sesión). */
const tried = new Set<string>();
let auto = false;

async function autoClassify() {
  if (auto) return;
  auto = true;
  try {
    const me = getMyId();
    const list = (await db.suppliers.where('_dirty').equals(0).toArray()).filter(
      (s) => s.ai_status === 'pending' && s.created_by === me && !s.deleted && !tried.has(s.id),
    );
    for (const s of list) {
      tried.add(s.id);
      await classify(s.id).catch(() => {});
    }
  } finally {
    auto = false;
  }
}

onSynced(() => void autoClassify());
