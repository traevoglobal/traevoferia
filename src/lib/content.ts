import { useSyncExternalStore } from 'react';
import type { Bloque, Comun, ContentRow, Profile, Proyecto, Tarjeta } from './types';
import { db } from './db';
import { norm } from './util';

/** Ruta de un archivo de public/ respetando el base path de GitHub Pages. */
export const asset = (p: string) => (/^https?:/.test(p) ? p : `${import.meta.env.BASE_URL}${p.replace(/^\//, '')}`);

/* Contenido privado (private/data/*.js → Supabase feria_content, solo miembros → Dexie para usarlo sin red).
   Nada de esto está en el repo ni en la web. Se lee como variables vivas; Main se vuelve a pintar cuando
   cambian (useContentVersion). */
export let PROYECTOS: Proyecto[] = [];
export let PROYECTO_BY_ID = new Map<string, Proyecto>();
export let COMUN: Comun = { lineas: {}, slides: [] };
export let ITINERARIO: Bloque[] = [];
export let TARJETA: Tarjeta | null = null;

let version = 0;
const listeners = new Set<() => void>();

const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function apply(rows: ContentRow[]) {
  const get = (key: string) => rows.find((r) => r.key === key)?.data;
  PROYECTOS = list<Proyecto>(get('proyectos')).map((p) => ({
    ...p,
    slides: list(p.slides),
    preguntas: list(p.preguntas),
    campos_clave: list(p.campos_clave),
  }));
  PROYECTO_BY_ID = new Map(PROYECTOS.map((p) => [p.id, p]));
  const c = get('comun') as Partial<Comun> | undefined;
  COMUN = { lineas: c?.lineas ?? {}, slides: list(c?.slides) };
  ITINERARIO = list<Bloque>(get('itinerario'));
  TARJETA = (get('tarjeta') as Tarjeta | undefined) ?? null;
  version++;
  listeners.forEach((l) => l());
}

/** Carga lo guardado en este móvil (antes de pintar la app). */
export async function loadContent() {
  apply(await db.content.toArray());
}

/** Guarda lo descargado de Supabase, solo si ha cambiado. Devuelve si cambió. */
export async function storeContent(rows: ContentRow[]): Promise<boolean> {
  const cur = await db.content.toArray();
  const same = cur.length === rows.length && rows.every((r) => cur.some((c) => c.key === r.key && c.updated_at === r.updated_at));
  if (same) return false;
  await db.transaction('rw', db.content, async () => {
    await db.content.clear();
    await db.content.bulkPut(rows);
  });
  apply(rows);
  return true;
}

export const useContentVersion = () =>
  useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => {
        listeners.delete(f);
      };
    },
    () => version,
  );

/** Todas las imágenes que usa el contenido ("img/…"). */
export function contentImages(): string[] {
  const s = new Set<string>();
  for (const sl of [...COMUN.slides, ...PROYECTOS.flatMap((p) => p.slides)]) if (sl.imagen) s.add(sl.imagen);
  for (const p of TARJETA?.personas ?? []) for (const x of [p.wechat_qr, p.alipay_qr]) if (x) s.add(x);
  return [...s];
}

/** Nombre del proyecto de una ficha para listados ("Otra: …" si no es de un proyecto). */
export function proyectoLabel(projectIds: string[], otra?: string): string {
  const p = PROYECTO_BY_ID.get(projectIds[0] ?? '');
  if (p) return p.nombre_es || p.nombre_zh || p.id;
  if (otra !== undefined) return otra.trim() ? `Otra: ${otra.trim()}` : 'Otra oportunidad';
  return projectIds[0] ?? '';
}

/** "javi" / "rafa" del perfil, por su nombre. */
export const quienDe = (profile?: Profile) => {
  const n = norm(profile?.name ?? '');
  return TARJETA?.personas.find((p) => n && (n.startsWith(norm(p.quien)) || n.startsWith(norm(p.nombre))))?.quien ?? '';
};
