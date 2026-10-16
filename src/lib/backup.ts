/* Exportar todo (CSV + JSON completo sin fotos) e importar/fusionar el JSON del otro móvil.
   Las fotos no viajan en el JSON (pesarían cientos de MB): van en Supabase y en cada móvil; el CSV y el
   JSON guardan la ruta de cada foto para localizarlas. */
import { db } from './db';
import { LINEA_NOMBRE, PROYECTO_BY_ID, PROYECTOS, proyectoLabel } from './content';
import { letraDe, motivoDe } from './semaforo';
import { getMyId } from './supabase';
import { normalizeSupplier, syncSoon } from './sync';
import type { LocalSupplier, Profile } from './types';
import { diaLabel, localDate } from './util';

type Col = [string, (s: LocalSupplier) => string | number];

/** Columnas: identificación, proyecto, datos duros, campos clave de todos los proyectos, checklist, resto. */
function columns(rows: LocalSupplier[], who: Map<string, Profile>): Col[] {
  const campos: string[] = [];
  const add = (k: string) => !campos.includes(k) && campos.push(k);
  PROYECTOS.forEach((p) => p.campos_clave.forEach(add));
  rows.forEach((s) => Object.keys(s.extra.campos ?? {}).forEach(add));
  const preguntas = (s: LocalSupplier) => {
    const p = PROYECTO_BY_ID.get(s.project_ids[0] ?? '');
    const on = Object.entries(s.extra.preguntas ?? {}).filter(([, v]) => v).map(([k]) => k);
    return on.map((id) => p?.preguntas.find((q) => q.id === id)?.es ?? id).join(' | ');
  };
  return [
    ['Día', (s) => diaLabel(localDate(s.created_at))],
    ['Hora', (s) => new Date(s.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })],
    ['Stand', (s) => s.booth.toUpperCase()],
    ['Proyecto', (s) => proyectoLabel(s.project_ids, s.extra.otra)],
    ['Línea', (s) => {
      const l = PROYECTO_BY_ID.get(s.project_ids[0] ?? '')?.linea;
      return l ? LINEA_NOMBRE[l] : '';
    }],
    ['Semáforo', (s) => letraDe(s.rating)],
    ['Motivo', (s) => motivoDe(s.tags)],
    ['Empresa', (s) => s.company],
    ['Contacto', (s) => s.contact],
    ['WeChat', (s) => s.wechat],
    ...campos.map((k): Col => [k, (s) => s.extra.campos?.[k] ?? '']),
    ['Preguntas hechas', preguntas],
    ['Nota', (s) => s.note],
    ['Fotos', (s) => s.photos.map((p) => p.path).join(' | ')],
    ['Notas de voz', (s) => s.extra.audios?.map((a) => a.path).join(' | ') ?? ''],
    ['Subido por', (s) => who.get(s.created_by)?.name ?? ''],
    ['ID', (s) => s.id],
  ];
}

const cell = (v: string | number) => {
  const t = String(v ?? '');
  return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

async function shareFiles(files: File[]) {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files })) {
    try {
      await nav.share({ files });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
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
}

/** Exporta todas las fichas: CSV (para Excel, separado por ;) + JSON completo. */
export async function exportAll() {
  const [rows, profiles] = await Promise.all([db.suppliers.toArray(), db.profiles.toArray()]);
  const who = new Map(profiles.map((p) => [p.id, p]));
  const list = rows.filter((s) => !s.deleted).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const cols = columns(list, who);
  const csv = '﻿' + [cols.map(([h]) => cell(h)).join(';'), ...list.map((s) => cols.map(([, f]) => cell(f(s))).join(';'))].join('\r\n');
  const strip = ({ _dirty, ...rest }: LocalSupplier) => (void _dirty, rest);
  const json = JSON.stringify({ app: 'traevo-feria', version: 2, exported_at: new Date().toISOString(), by: getMyId(), suppliers: rows.map(strip) });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  await shareFiles([
    new File([csv], `traevo-proveedores-${stamp}.csv`, { type: 'text/csv' }),
    new File([json], `traevo-proveedores-${stamp}.json`, { type: 'application/json' }),
  ]);
}

/** Fusiona el JSON exportado por el otro móvil: clave `id`, gana la edición más reciente. Lo nuevo se sube al volver la red. */
export async function importBackup(file: File): Promise<{ nuevas: number; actualizadas: number; iguales: number }> {
  let data: { app?: string; suppliers?: unknown[] };
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('El archivo no es un JSON válido');
  }
  if (data.app !== 'traevo-feria' || !Array.isArray(data.suppliers)) throw new Error('Este archivo no es una exportación de la app');
  const res = { nuevas: 0, actualizadas: 0, iguales: 0 };
  await db.transaction('rw', db.suppliers, async () => {
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
  });
  syncSoon();
  return res;
}
