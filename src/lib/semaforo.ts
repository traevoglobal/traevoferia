/* Semáforo de la ficha: se guarda en `rating` (3 = A, 2 = B, 1 = C, 0 = sin semáforo) y, si es C, el motivo
   en `tags` como "motivo:<valor>". */
import type { Supplier } from './types';

export type Letra = 'A' | 'B' | 'C';

export const SEMAFORO: { rating: number; letra: Letra; label: string }[] = [
  { rating: 3, letra: 'A', label: 'seguir' },
  { rating: 2, letra: 'B', label: 'reserva' },
  { rating: 1, letra: 'C', label: 'fuera' },
];

export const MOTIVOS = ['distribuidor', 'CE', 'trading', 'SAT', 'precio', 'otro'];

const PREFIX = 'motivo:';

export const letraDe = (rating: number): Letra | '' => SEMAFORO.find((x) => x.rating === rating)?.letra ?? '';

export const motivoDe = (tags: string[]) => tags.find((t) => t.startsWith(PREFIX))?.slice(PREFIX.length) ?? '';

const sinMotivo = (tags: string[]) => tags.filter((t) => !t.startsWith(PREFIX));

/** Cambio al tocar un semáforo: tocar el activo lo quita; salir de C borra el motivo. */
export function cambioSemaforo(cur: Pick<Supplier, 'rating' | 'tags'>, rating: number): Pick<Supplier, 'rating' | 'tags'> {
  const next = cur.rating === rating ? 0 : rating;
  return { rating: next, tags: next === 1 ? cur.tags : sinMotivo(cur.tags) };
}

/** Cambio al tocar un motivo (selección única; tocar el activo lo quita). */
export function cambioMotivo(cur: Pick<Supplier, 'tags'>, motivo: string): Pick<Supplier, 'tags'> {
  const tags = sinMotivo(cur.tags);
  return { tags: motivoDe(cur.tags) === motivo ? tags : [...tags, PREFIX + motivo] };
}
