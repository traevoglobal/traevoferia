/* Respaldo: exportar todo (JSON completo sin fotos + CSV) e importar/fusionar el JSON del otro móvil.
   Las fotos no viajan en el JSON (pesarían cientos de MB): van en Supabase y en cada móvil; el JSON
   y el CSV guardan la ruta y el tipo de cada foto para localizarlas. */
import { db } from './db';
import { CONFIG, PROJECT_BY_SLUG } from './content';
import { discardReason, fichaId, getOf, missing, score } from './ficha';
import { LAST_EXPORT } from './prefs';
import { getMyId } from './supabase';
import { normalizeSupplier, syncSoon } from './sync';
import type { FieldDef, LocalNote, LocalSupplier, Profile, TextField } from './types';

type Col = [string, (s: LocalSupplier) => string | number];

/** Columnas del CSV: identificación, vía y sus campos (de la configuración privada), resto de la ficha. */
function columns(who: Map<string, Profile>): Col[] {
  const vias = CONFIG?.vias ?? [];
  const label = (key: string, v: string) => {
    for (const via of vias)
      for (const f of [...via.fields, ...(via.close ?? [])]) if (f.key === key) return f.options?.find(([o]) => o === v)?.[1] ?? v;
    return v;
  };
  const seen = new Set<string>();
  const cfg: FieldDef[] = [];
  for (const via of vias)
    for (const f of [...via.fields, ...(via.close ?? [])])
      if (!seen.has(f.key)) {
        seen.add(f.key);
        cfg.push(f);
      }
  const text = (k: TextField, h: string): Col[] => (seen.has(k) ? [] : [[h, (s) => s[k]]]);
  const kinds = new Map(CONFIG?.photoKinds ?? []);
  return [
    ['Fecha', (s) => new Date(s.created_at).toLocaleString('es-ES')],
    ['ID', (s) => fichaId(getOf(s))],
    ['Pabellón', (s) => getOf(s)('hall')],
    ['Stand', (s) => s.booth],
    ['Vía', (s) => vias.find((v) => v.id === s.extra.via)?.label ?? ''],
    ['Sector', (s) => getOf(s)('sector')],
    ['Empresa', (s) => s.company],
    ['Empresa (中文)', (s) => s.company_zh],
    ...cfg.map((f): Col => [f.label, (s) => label(f.key, getOf(s)(f.key))]),
    ['La frase', (s) => getOf(s)('problem')],
    ['Estado', (s) => CONFIG?.statuses.find(([v]) => v === s.extra.status)?.[1] ?? getOf(s)('status')],
    ['Puntuación', (s) => score(getOf(s))?.value ?? ''],
    ['Descartada', (s) => discardReason(getOf(s))],
    ['Le falta', (s) => missing(getOf(s)).join(', ')],
    ...text('contact', 'Contacto'),
    ...text('role', 'Cargo'),
    ...text('wechat', 'WeChat'),
    ...text('phone', 'Teléfono'),
    ...text('email', 'Email'),
    ...text('web', 'Web'),
    ...text('city', 'Ciudad'),
    ...text('kind', 'Tipo'),
    ...text('products', 'Productos'),
    ...text('price', 'Precio'),
    ...text('moq', 'MOQ'),
    ...text('incoterm', 'Incoterm'),
    ...text('lead_time', 'Plazo'),
    ...text('samples', 'Muestras'),
    ['Pactado', (s) => s.agreement],
    ['Siguiente paso', (s) => s.next_step],
    ['Proyectos', (s) => s.project_ids.map((p) => PROJECT_BY_SLUG.get(p)?.name ?? p).join(' | ')],
    ['Etiquetas', (s) => s.tags.join(', ')],
    ['Valoración', (s) => s.rating],
    ['Feria', (s) => s.event],
    ['Nota', (s) => s.note],
    ['Fotos', (s) => s.photos.map((p) => `${kinds.get(p.kind ?? '') ?? 'foto'}: ${p.path}`).join(' | ')],
    ['Notas de voz', (s) => s.extra.audios?.map((a) => a.path).join(' | ') ?? ''],
    ['Asignada a', (s) => getOf(s)('owner')],
    ['Ficha enlazada', (s) => getOf(s)('link')],
    ['Subido por', (s) => who.get(s.created_by)?.name ?? ''],
    ['ID interno', (s) => s.id],
  ];
}

const cell = (v: string | number) => {
  const t = String(v ?? '');
  return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

async function shareFiles(files: File[]): Promise<boolean> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files })) {
    try {
      await nav.share({ files });
      return true;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return false;
    }
  }
  for (const f of files) {
    const url = URL.createObjectURL(f);
    const a = document.createElement('a');
    a.href = url;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return true;
}

/** Exporta todas las fichas y notas: JSON completo (sin fotos) + CSV. */
export async function exportBackup() {
  const [rows, notes, profiles] = await Promise.all([db.suppliers.toArray(), db.notes.toArray(), db.profiles.toArray()]);
  const who = new Map(profiles.map((p) => [p.id, p]));
  const strip = <T extends { _dirty: 0 | 1 }>({ _dirty, ...rest }: T) => (void _dirty, rest);
  const list = rows.filter((s) => !s.deleted).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const cols = columns(who);
  const csv = '﻿' + [cols.map(([h]) => cell(h)).join(';'), ...list.map((s) => cols.map(([, f]) => cell(f(s))).join(';'))].join('\r\n');
  const json = JSON.stringify({ app: 'traevo-feria', version: 1, exported_at: new Date().toISOString(), by: getMyId(), suppliers: rows.map(strip), notes: notes.map(strip) });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const ok = await shareFiles([
    new File([json], `traevo-fichas-${stamp}.json`, { type: 'application/json' }),
    new File([csv], `traevo-fichas-${stamp}.csv`, { type: 'text/csv' }),
  ]);
  if (ok) LAST_EXPORT.set(Date.now());
}

/** Fusiona el JSON exportado por el otro móvil: clave `id`, gana la edición más reciente. Lo nuevo se sube al volver la red. */
export async function importBackup(file: File): Promise<{ nuevas: number; actualizadas: number; iguales: number }> {
  let data: { app?: string; suppliers?: unknown[]; notes?: unknown[] };
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('El archivo no es un JSON válido');
  }
  if (data.app !== 'traevo-feria' || !Array.isArray(data.suppliers)) throw new Error('Este archivo no es una exportación de la app');
  const res = { nuevas: 0, actualizadas: 0, iguales: 0 };
  await db.transaction('rw', db.suppliers, db.notes, async () => {
    for (const r of data.suppliers ?? []) {
      if (!r || typeof r !== 'object' || !('id' in r)) continue;
      const inc: LocalSupplier = { ...normalizeSupplier(r), _dirty: 1 };
      const cur = await db.suppliers.get(inc.id);
      if (cur && Date.parse(cur.updated_at) >= Date.parse(inc.updated_at)) {
        res.iguales++;
        continue;
      }
      if (cur) res.actualizadas++;
      else res.nuevas++;
      await db.suppliers.put(inc);
    }
    for (const r of (data.notes ?? []) as LocalNote[]) {
      if (!r?.project_slug) continue;
      const cur = await db.notes.get(r.project_slug);
      if (cur && Date.parse(cur.updated_at || '0') >= Date.parse(r.updated_at || '0')) continue;
      await db.notes.put({ ...r, _dirty: 1 });
    }
  });
  syncSoon();
  return res;
}
