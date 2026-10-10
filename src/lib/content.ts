import type { Profile, Project, ProjectText, TeamMember } from './types';
import teamData from '../../content/team.json';
import { norm } from './util';

/** URL base de las páginas públicas de los QR. */
export const PUBLIC_BASE_URL = 'https://feria.traevo.net';

const mods = import.meta.glob<{ default: Project }>('/content/projects/*.json', { eager: true });
export const PROJECTS: Project[] = Object.values(mods)
  .map((m) => m.default)
  .sort((a, b) => a.order - b.order);
export const PROJECT_BY_SLUG = new Map(PROJECTS.map((p) => [p.slug, p]));

export const TEAM: TeamMember[] = teamData as TeamMember[];

export const isSet = (v?: string) => !!v && v.trim() !== '' && v.trim().toUpperCase() !== 'TODO';

export const hasText = (t?: ProjectText) =>
  !!t && (isSet(t.title) || isSet(t.summary) || [...t.needs, ...t.requirements, ...t.questions].some(isSet));

export function presenterFor(profile?: Profile): TeamMember {
  const stored = localStorage.getItem('feria.presenter');
  const byStored = TEAM.find((t) => t.slug === stored);
  if (byStored) return byStored;
  const n = norm(profile?.name ?? '');
  return TEAM.find((t) => n && (n.startsWith(t.slug) || n.startsWith(norm(t.name)))) ?? TEAM[0];
}

export const setPresenter = (slug: string) => localStorage.setItem('feria.presenter', slug);

export const publicUrl = (slug: string, member: TeamMember) => `${PUBLIC_BASE_URL}/p/${slug}/${member.slug}/`;

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
