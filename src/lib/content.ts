import { useSyncExternalStore } from 'react';
import type { ContentRow, Horario, Profile, Project, ProjectText, TeamMember } from './types';
import { db } from './db';
import { norm } from './util';

/** Ruta de un archivo de public/ respetando el base path de GitHub Pages. */
export const asset = (p: string) => (/^https?:/.test(p) ? p : `${import.meta.env.BASE_URL}${p.replace(/^\//, '')}`);

/* Contenido privado (proyectos, equipo, horario): vive en Supabase (tabla feria_content, solo miembros)
   y en Dexie para usarlo sin red. Nada de esto está en el repo ni en la web. Se lee como variables
   vivas; Main se vuelve a pintar cuando cambian (useContentVersion). */
export let PROJECTS: Project[] = [];
export let PROJECT_BY_SLUG = new Map<string, Project>();
export let TEAM: TeamMember[] = [];
export let HORARIO: Horario | null = null;

let version = 0;
const listeners = new Set<() => void>();

function apply(rows: ContentRow[]) {
  const get = <T>(key: string) => rows.find((r) => r.key === key)?.data as T | undefined;
  PROJECTS = [...(get<Project[]>('projects') ?? [])].sort((a, b) => a.order - b.order);
  PROJECT_BY_SLUG = new Map(PROJECTS.map((p) => [p.slug, p]));
  TEAM = get<TeamMember[]>('team') ?? [];
  HORARIO = get<Horario>('horario') ?? null;
  version++;
  listeners.forEach((l) => l());
}

/** Carga lo guardado en este móvil (antes de pintar la app). */
export async function loadContent() {
  apply(await db.content.toArray());
}

/** Guarda lo descargado de Supabase, solo si ha cambiado. */
export async function storeContent(rows: ContentRow[]) {
  const cur = await db.content.toArray();
  const same = cur.length === rows.length && rows.every((r) => cur.some((c) => c.key === r.key && c.updated_at === r.updated_at));
  if (same) return;
  await db.transaction('rw', db.content, async () => {
    await db.content.clear();
    await db.content.bulkPut(rows);
  });
  apply(rows);
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

export const isSet = (v?: string) => !!v && v.trim() !== '' && v.trim().toUpperCase() !== 'TODO';

/** Fotos del proyecto: rutas en el bucket privado "photos" (content/projects/<slug>/…). */
export const projectPhotos = (p: Project) => p.photos.filter(isSet);

export const hasText = (t?: ProjectText) =>
  !!t && (isSet(t.title) || isSet(t.summary) || [...t.needs, ...t.requirements, ...t.questions].some(isSet));

const NOBODY: TeamMember = { slug: '', name: 'Traevo Global', wechat: '', wechatQr: '', whatsapp: '', email: '' };

export function presenterFor(profile?: Profile): TeamMember {
  const stored = localStorage.getItem('feria.presenter');
  const byStored = TEAM.find((t) => t.slug === stored);
  if (byStored) return byStored;
  const n = norm(profile?.name ?? '');
  return TEAM.find((t) => n && (n.startsWith(t.slug) || n.startsWith(norm(t.name)))) ?? TEAM[0] ?? NOBODY;
}

export const setPresenter = (slug: string) => localStorage.setItem('feria.presenter', slug);

/* Ferias: se asignan por fecha; fuera de fechas, la última elegida. */
export const EVENTS: { label: string; start?: string; end?: string }[] = [
  { label: 'Cantón F1', start: '2026-10-15', end: '2026-10-19' },
  { label: 'Cantón F2', start: '2026-10-23', end: '2026-10-27' },
  { label: 'Cantón F3', start: '2026-10-31', end: '2026-11-04' },
  { label: 'HK Electronics' },
  { label: 'Clúster/fábrica' },
  { label: 'Otro' },
];

export function currentEvent(): string {
  const d = new Date();
  const t = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hit = EVENTS.find((e) => e.start && e.end && t >= e.start && t <= e.end);
  return hit?.label ?? localStorage.getItem('feria.lastEvent') ?? EVENTS[0].label;
}

export const rememberEvent = (label: string) => localStorage.setItem('feria.lastEvent', label);
