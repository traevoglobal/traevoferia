/* Franjas del horario (hora de China) y fichas que cuentan para sus objetivos. Lo usan Horario y Hoy. */
import { useEffect, useState } from 'react';
import type { Horario, LocalSupplier, Member, PlanDay, Profile, Slot, SlotCounter, Who } from './types';
import { norm } from './util';

export const WHO_LABEL: Record<Who, string> = { javi: 'Javi', rafa: 'Rafa', ambos: 'Ambos' };
export const MEMBERS: Member[] = ['javi', 'rafa'];
const CN = 8 * 3600_000;

/** Fecha AAAA-MM-DD en China, sea cual sea la zona horaria del móvil. */
export const chinaDate = (ms: number) => new Date(ms + CN).toISOString().slice(0, 10);
export const chinaMs = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00+08:00`);

/** Inicio y fin de una franja; sin hora de fin, dura hasta la siguiente franja del día (o una hora). */
export function windowOf(day: PlanDay, s: Slot): [number, number] {
  const a = chinaMs(day.date, s.start);
  if (s.end) return [a, chinaMs(day.date, s.end)];
  const next = day.slots.map((x) => chinaMs(day.date, x.start)).filter((t) => t > a);
  return [a, next.length ? Math.min(...next) : a + 3600_000];
}

/** Etiqueta de la ficha creada desde la franja. Sin comas: el campo Etiquetas separa por comas. */
export const slotTag = (day: PlanDay, s: Slot) => `${day.label} ${s.start} ${WHO_LABEL[s.who]} · ${s.short}`;
export const allTags = (h: Horario) => new Set(h.days.flatMap((d) => d.slots.filter((s) => s.short).map((s) => slotTag(d, s))));

export function useNow(every = 30_000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(t);
  }, [every]);
  return now;
}

/** Miembro (javi / rafa) de un perfil, por su nombre. */
export const memberOf = (name?: string): Member | undefined => MEMBERS.find((m) => norm(name ?? '').startsWith(m));

export function usersByMember(profiles: Iterable<Profile>): Record<Member, string[]> {
  const m: Record<Member, string[]> = { javi: [], rafa: [] };
  for (const p of profiles) {
    const k = memberOf(p.name);
    if (k) m[k].push(p.id);
  }
  return m;
}

/** Fichas que cuentan para un contador: las creadas desde el botón de la franja y, sin etiqueta de franja,
    las que esa persona creó durante su horario. Con `via` / `with`, solo esa vía / con ese dato. */
export function countFichas(
  day: PlanDay, s: Slot, c: SlotCounter, suppliers: LocalSupplier[], users: Record<Member, string[]>, tags: Set<string>,
): number {
  const [a, b] = windowOf(day, s);
  const tag = s.short ? slotTag(day, s) : '';
  const ids = s.who === 'ambos' ? [...users.javi, ...users.rafa] : users[s.who];
  return suppliers.filter((x) => {
    if (x.deleted) return false;
    if (c.via && x.extra.via !== c.via) return false;
    const w = c.with ? x.extra[c.with] : '';
    if (c.with && !(typeof w === 'string' && w.trim())) return false;
    if (x.tags.some((t) => tags.has(t))) return x.tags.includes(tag);
    const t = Date.parse(x.created_at);
    return ids.includes(x.created_by) && t >= a && t < b;
  }).length;
}

/** Franja en curso de ese miembro (o de ambos), en hora de China. */
export function currentSlot(h: Horario, now: number, me?: Member): { day: PlanDay; slot: Slot } | null {
  const day = h.days.find((d) => d.date === chinaDate(now));
  const slot = day?.slots.find((s) => {
    const [a, b] = windowOf(day, s);
    return (s.who === 'ambos' || !me || s.who === me) && now >= a && now < b;
  });
  return day && slot ? { day, slot } : null;
}
