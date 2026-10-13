import { db } from './db';
import { PROJECT_BY_SLUG } from './content';
import type { LocalSupplier, Profile } from './types';
import { shareOrDownload } from './util';

const COLS: [string, (s: LocalSupplier, who: Map<string, Profile>) => string | number][] = [
  ['Empresa', (s) => s.company],
  ['Empresa (中文)', (s) => s.company_zh],
  ['Contacto', (s) => s.contact],
  ['Cargo', (s) => s.role],
  ['WeChat', (s) => s.wechat],
  ['Teléfono', (s) => s.phone],
  ['Email', (s) => s.email],
  ['Web', (s) => s.web],
  ['Stand', (s) => s.booth],
  ['Ciudad', (s) => s.city],
  ['Tipo', (s) => s.kind],
  ['Productos', (s) => s.products],
  ['Precio', (s) => s.price],
  ['MOQ', (s) => s.moq],
  ['Incoterm', (s) => s.incoterm],
  ['Plazo', (s) => s.lead_time],
  ['Muestras', (s) => s.samples],
  ['Pactado', (s) => s.agreement],
  ['Siguiente paso', (s) => s.next_step],
  ['Proyectos', (s) => s.project_ids.map((p) => PROJECT_BY_SLUG.get(p)?.name ?? p).join(' | ')],
  ['Etiquetas', (s) => s.tags.join(', ')],
  ['Valoración', (s) => s.rating],
  ['Feria', (s) => s.event],
  ['Nota', (s) => s.note],
  ['Fotos', (s) => s.photos.length],
  ['Subido por', (s, who) => who.get(s.created_by)?.name ?? ''],
  ['Fecha', (s) => new Date(s.created_at).toLocaleString('es-ES')],
  ['ID', (s) => s.id],
];

const cell = (v: string | number) => {
  const t = String(v ?? '');
  return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

export async function exportCsv() {
  const [rows, profiles] = await Promise.all([db.suppliers.toArray(), db.profiles.toArray()]);
  const who = new Map(profiles.map((p) => [p.id, p]));
  const list = rows.filter((s) => !s.deleted).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const lines = [COLS.map(([h]) => cell(h)).join(';'), ...list.map((s) => COLS.map(([, f]) => cell(f(s, who))).join(';'))];
  const csv = '﻿' + lines.join('\r\n');
  const date = new Date().toISOString().slice(0, 10);
  await shareOrDownload(new File([csv], `traevo-proveedores-${date}.csv`, { type: 'text/csv' }));
}
