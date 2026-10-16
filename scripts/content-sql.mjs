// Valida private/data/*.js (proyectos, común, itinerario, tarjeta) y genera private/content.sql para pegarlo
// en el SQL Editor de Supabase. private/ está en .gitignore: nunca llega al repo ni a la web.
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = join(process.cwd(), 'private');
const dir = join(root, 'data');
if (!existsSync(dir)) throw new Error('Falta private/data/ (proyectos.js, comun.js, itinerario.js, tarjeta.js)');

const load = async (f) => import(pathToFileURL(join(dir, f)).href);
const { proyectos } = await load('proyectos.js');
const { lineas, slides } = await load('comun.js');
const { itinerario } = await load('itinerario.js');
const { tarjeta } = await load('tarjeta.js');

const LINEAS = ['access', 'sourcing', 'partners'];
const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const images = new Set();
const str = (v) => typeof v === 'string';

function checkSlide(where, s) {
  if (!str(s.titulo_es) || !str(s.titulo_zh)) err(where, 'faltan titulo_es / titulo_zh');
  const es = s.bullets_es ?? [];
  const zh = s.bullets_zh ?? [];
  if (!Array.isArray(es) || !Array.isArray(zh)) return err(where, 'bullets_es y bullets_zh deben ser listas');
  if (es.length > 4 || zh.length > 4) err(where, `máximo 4 bullets (tiene ${Math.max(es.length, zh.length)})`);
  if (es.length !== zh.length) err(where, `${es.length} bullets en español y ${zh.length} en chino`);
  if (s.imagen) images.add(s.imagen);
}

const ids = new Set();
for (const [i, p] of proyectos.entries()) {
  const w = `proyecto ${p.id ?? i + 1}`;
  if (!str(p.id) || !/^[a-z0-9][a-z0-9-]*$/.test(p.id)) err(w, 'id en minúsculas, sin espacios ni acentos');
  if (ids.has(p.id)) err(w, 'id repetido');
  ids.add(p.id);
  if (!LINEAS.includes(p.linea)) err(w, 'linea debe ser "access", "sourcing" o "partners"');
  for (const k of ['nombre_es', 'nombre_zh', 'resumen_es', 'resumen_zh']) if (!str(p[k])) err(w, `falta ${k}`);
  if (!Array.isArray(p.slides)) err(w, 'slides debe ser una lista');
  else p.slides.forEach((s, j) => checkSlide(`${w}, slide ${j + 1}`, s));
  const qids = new Set();
  for (const q of p.preguntas ?? []) {
    if (!str(q.id) || !q.id) err(w, 'cada pregunta necesita id');
    if (qids.has(q.id)) err(w, `pregunta "${q.id}" repetida`);
    qids.add(q.id);
  }
  if (!Array.isArray(p.campos_clave ?? [])) err(w, 'campos_clave debe ser una lista');
}
slides.forEach((s, j) => checkSlide(`comun, slide ${j + 1}`, s));
for (const [l, d] of Object.entries(lineas ?? {})) {
  if (!LINEAS.includes(l)) err(`comun.lineas.${l}`, 'línea desconocida (access, sourcing o partners)');
  if (d.slides !== undefined && !Array.isArray(d.slides)) err(`comun.lineas.${l}`, 'slides debe ser una lista');
  else (d.slides ?? []).forEach((s, j) => checkSlide(`línea ${l}, slide ${j + 1}`, s));
}

const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
const bids = new Set();
for (const [i, b] of itinerario.entries()) {
  const w = `itinerario ${b.id ?? i + 1}`;
  if (!str(b.id) || bids.has(b.id)) err(w, 'id vacío o repetido');
  bids.add(b.id);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.dia ?? '')) err(w, 'dia en formato AAAA-MM-DD');
  if (!hhmm.test(b.inicio ?? '')) err(w, 'inicio en formato HH:MM');
  if (b.fin && !hhmm.test(b.fin)) err(w, 'fin en formato HH:MM');
  if (b.fin && b.fin <= b.inicio) err(w, 'fin antes que inicio');
  if (b.proyecto && !ids.has(b.proyecto)) err(w, `proyecto "${b.proyecto}" no existe en proyectos.js`);
  if (b.vigilar && (!Array.isArray(b.vigilar) || b.vigilar.length > 2)) err(w, 'vigilar: lista de dos puntos');
}

for (const p of tarjeta.personas ?? []) {
  if (p.wechat_qr) images.add(p.wechat_qr);
  if (p.alipay_qr) images.add(p.alipay_qr);
}
for (const img of images) {
  if (!/^img\/[^/]+\.(jpe?g|png|webp)$/i.test(img)) err(img, 'las imágenes van en "img/<archivo>.jpg|png|webp"');
  else if (!existsSync(join(dir, img))) warnings.push(`${img} no está en private/data/img/ (súbela al bucket photos en content/${img})`);
}

if (errors.length) {
  console.error(`No se genera content.sql. Corrige:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

const rows = { proyectos, comun: { lineas, slides }, itinerario, tarjeta };
const literal = (v) => {
  const s = JSON.stringify(v);
  if (s.includes('$json$')) throw new Error('El contenido no puede incluir "$json$"');
  return `$json$${s}$json$::jsonb`;
};

const sql = `-- Contenido privado de Traevo Feria (generado con npm run content:sql). Pegar entero en el SQL Editor.
-- Requiere la tabla feria_content (supabase/schema.sql, apartado 8b).
insert into public.feria_content (key, data) values
${Object.entries(rows).map(([k, v]) => `  ('${k}', ${literal(v)})`).join(',\n')}
on conflict (key) do update set data = excluded.data, updated_at = now()
  where public.feria_content.data is distinct from excluded.data;
`;

writeFileSync(join(root, 'content.sql'), sql);
if (warnings.length) console.warn(`Avisos:\n- ${warnings.join('\n- ')}`);
console.log(
  `private/content.sql: ${proyectos.length} proyectos, ${slides.length} slides comunes, ${itinerario.length} bloques de itinerario, ` +
    `${tarjeta.personas?.length ?? 0} tarjetas, ${images.size} imágenes (${Math.round(sql.length / 1024)} KB)`,
);
