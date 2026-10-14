/* Lógica de las fichas que depende de la configuración privada (vías, campos, reglas, puntuación).
   El código solo conoce claves; etiquetas, listas y criterios vienen de CONFIG (Supabase). */
import { CONFIG } from './content';
import { TEXT_FIELDS, type Cond, type Draft, type FieldDef, type Supplier, type SupplierExtra, type TextField } from './types';
import { norm } from './util';

const TEXT = new Set<string>(TEXT_FIELDS);
export const isTextField = (k: string): k is TextField => TEXT.has(k);

/** Lector de valores de una ficha o de un borrador: texto de la ficha o clave de `extra`. */
export type Get = (key: string) => string;

const str = (v: unknown) => (typeof v === 'string' ? v : '');
export const getOf = (s: Supplier): Get => (k) => (isTextField(k) ? s[k] : str(s.extra[k]));
export const getOfDraft = (d: Draft): Get => (k) => (isTextField(k) ? (d.fields?.[k] ?? '') : str(d.extra?.[k]));
/** Lector con cambios pendientes encima. */
export const withPatch = (get: Get, patch: Record<string, string>): Get => (k) => (k in patch ? patch[k] : get(k));

/** Reparte un cambio entre campos de texto y `extra`. */
export function splitPatch(patch: Record<string, string>): { fields: Partial<Record<TextField, string>>; extra: Partial<SupplierExtra> } {
  const fields: Partial<Record<TextField, string>> = {};
  const extra: Partial<SupplierExtra> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (isTextField(k)) fields[k] = v;
    else extra[k] = v;
  }
  return { fields, extra };
}

export const viaDef = (id?: string) => (id ? CONFIG?.vias.find((v) => v.id === id) : undefined);
export const viaColor = (id?: string) => viaDef(id)?.color ?? 'var(--label3)';

const test = (get: Get, c: Cond) => c.in.includes(get(c.key));
export const fieldVisible = (f: FieldDef, get: Get) => !f.showIf || Object.entries(f.showIf).every(([k, v]) => get(k) === v);

/** Descarte automático de la vía (trading, despacho gris…), con su tono. */
export function discardOf(get: Get): { label: string; tone: 'gray' | 'red' } | null {
  const d = viaDef(get('via'))?.discard?.find((x) => x.any.some((c) => test(get, c)));
  return d ? { label: d.label, tone: d.tone ?? 'gray' } : null;
}
export const discardReason = (get: Get) => discardOf(get)?.label ?? '';

/** Opciones bloqueadas por las reglas de la vía, por clave. */
export function disabledOptions(get: Get): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const l of viaDef(get('via'))?.locks ?? [])
    if (test(get, l.when)) for (const [k, xs] of Object.entries(l.disable)) out[k] = [...(out[k] ?? []), ...xs];
  return out;
}

/** Cambio completo al tocar un campo: el valor más lo que fijan las reglas (p. ej. riesgo alto → solo comisión). */
export function changeWithLocks(get: Get, key: string, value: string): Record<string, string> {
  const patch: Record<string, string> = { [key]: value };
  const next = withPatch(get, patch);
  for (const l of viaDef(next('via'))?.locks ?? []) if (test(next, l.when)) Object.assign(patch, l.set);
  return patch;
}

/** Cambio de vía: borra lo que solo tenía sentido en la anterior (p. ej. MOQ al pasar a otra vía). */
export function viaSwitchPatch(get: Get, next: string, sector: string): Record<string, string> {
  const old = viaDef(get('via'));
  const nv = viaDef(next);
  const keep = new Set([...(nv?.fields ?? []), ...(nv?.close ?? [])].map((f) => f.key));
  const patch: Record<string, string> = { via: next, sector };
  for (const f of [...(old?.fields ?? []), ...(old?.close ?? [])]) if (!keep.has(f.key) && get(f.key)) patch[f.key] = '';
  return patch;
}

/** Puntuación automática de la vía (null si la vía no puntúa). */
export function score(get: Get): { value: number; max: number; low: boolean } | null {
  const sc = viaDef(get('via'))?.score;
  if (!sc) return null;
  let value = 0;
  for (const it of sc.items) {
    if (it.all && !it.all.every((c) => test(get, c))) continue;
    if (it.any && !it.any.some((c) => test(get, c))) continue;
    if (it.none?.some((c) => test(get, c))) continue;
    value += it.points;
  }
  value = Math.min(value, sc.max);
  return { value, max: sc.max, low: value < sc.min };
}

/** El borrador tiene algo que guardar (más allá de pabellón, vía y sector heredados). */
export const draftHasContent = (d: Draft) =>
  d.photos.length > 0 ||
  d.note.trim() !== '' ||
  (d.audios?.length ?? 0) > 0 ||
  Object.values(d.fields ?? {}).some((v) => !!v?.trim()) ||
  Object.entries(d.extra ?? {}).some(([k, v]) => !['hall', 'via', 'sector'].includes(k) && typeof v === 'string' && v !== '');

/** Lo que le falta a la ficha para estar completa. */
export function missing(get: Get): string[] {
  const out: string[] = [];
  if (!get('booth').trim()) out.push('sin stand');
  if (!get('company').trim() && !get('company_zh').trim()) out.push('sin empresa');
  if (viaDef(get('via'))?.problem && !get('problem').trim()) out.push('sin frase');
  return out;
}

/** Identificador "<pabellón>-<stand>". */
export function fichaId(get: Get): string {
  const b = get('booth').trim().toUpperCase();
  const h = get('hall');
  return b ? (h ? `${h}-${b}` : b) : '';
}

/** Texto en el que busca el listado (incluye el identificador con y sin guion). */
export function searchText(s: Supplier): string {
  const get = getOf(s);
  const id = fichaId(get);
  return norm(
    [id, id.replace('-', ''), s.company, s.company_zh, s.products, s.wechat, s.city, s.note, s.contact, s.tags.join(' '), get('sector'), get('problem')].join(' '),
  );
}

/** Enlaces de verificación con la búsqueda precargada. */
export function verifyLinks(get: Get): [string, string][] {
  const q = get('company') || get('company_zh');
  const zh = get('company_zh') || get('company');
  return (CONFIG?.links ?? []).map(([label, url]) => [
    label,
    url.replace('{q}', encodeURIComponent(q)).replace('{zh}', encodeURIComponent(zh)),
  ]);
}
