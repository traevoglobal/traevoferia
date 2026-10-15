import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, MapPin, Presentation as PresentIcon, TriangleAlert } from 'lucide-react';
import { useApp } from '../ctx';
import { db } from '../lib/db';
import { ITINERARIO, PROYECTO_BY_ID, TARJETA, quienDe } from '../lib/content';
import type { Bloque } from '../lib/types';
import { chinaDate, chinaMs, diaLabel, useLive, useNow } from '../lib/util';
import { Empty, NavBar, Segmented } from '../components/ui';

/** Inicio y fin de un bloque (hora de China); sin fin, hasta el siguiente bloque de esa persona (o una hora). */
function windowOf(b: Bloque, day: Bloque[]): [number, number] {
  const a = chinaMs(b.dia, b.inicio);
  if (b.fin) return [a, chinaMs(b.dia, b.fin)];
  const next = day.filter((x) => mismaPersona(x, b)).map((x) => chinaMs(x.dia, x.inicio)).filter((t) => t > a);
  return [a, next.length ? Math.min(...next) : a + 3600_000];
}

/** Dos bloques chocan si son de la misma persona o alguno es de los dos. */
const mismaPersona = (a: Bloque, b: Bloque) => !a.quien || !b.quien || a.quien === b.quien;

/** Solapes por bloque: los otros bloques que pisan su horario. Solo cuenta la hora de fin escrita. */
function solapes(day: Bloque[]): Map<string, Bloque[]> {
  const out = new Map<string, Bloque[]>();
  for (const a of day)
    for (const b of day) {
      if (a === b || !mismaPersona(a, b) || !a.fin || !b.fin) continue;
      if (a.inicio < b.fin && b.inicio < a.fin) out.set(a.id, [...(out.get(a.id) ?? []), b]);
    }
  return out;
}

const VISITADOS = 'itinerario.visitados';

export function Itinerario() {
  const { me, openPresent } = useApp();
  const now = useNow();
  const yo = quienDe(me);
  // Por defecto, solo lo mío (el perfil puede cargar después del primer pintado).
  const [verElegido, setVer] = useState<'yo' | 'todos' | ''>('');
  const ver = verElegido || (yo ? 'yo' : 'todos');
  const visitados = useLive(async () => ((await db.meta.get(VISITADOS))?.value as Record<string, boolean> | undefined) ?? {}, [], {});
  const toggle = (id: string) =>
    db.transaction('rw', db.meta, async () => {
      const cur = ((await db.meta.get(VISITADOS))?.value as Record<string, boolean> | undefined) ?? {};
      await db.meta.put({ key: VISITADOS, value: { ...cur, [id]: !cur[id] } });
    });

  const dias = useMemo(() => [...new Set(ITINERARIO.map((b) => b.dia))].sort(), [ITINERARIO]);
  const hoy = chinaDate(now);
  const [elegido, setDia] = useState('');
  // Por defecto, hoy (hora de China) o el próximo día con bloques.
  const dia = dias.includes(elegido) ? elegido : dias.includes(hoy) ? hoy : (dias.find((d) => d > hoy) ?? dias[0] ?? '');

  const bloques = ITINERARIO.filter((b) => b.dia === dia && (ver === 'todos' || !b.quien || b.quien === yo)).sort(
    (a, b) => a.inicio.localeCompare(b.inicio) || (a.quien ?? '').localeCompare(b.quien ?? ''),
  );
  const choques = solapes(bloques);
  const nombre = (q?: string) => TARJETA?.personas.find((p) => p.quien === q)?.nombre ?? q ?? '';

  const nowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    nowRef.current?.scrollIntoView({ block: 'center' });
  }, [dia]);

  return (
    <>
      <NavBar />
      <h1 className="large-title">Itinerario</h1>
      {!ITINERARIO.length ? (
        <Empty>Aún no hay itinerario. Se carga del contenido privado al entrar con conexión.</Empty>
      ) : (
        <>
          <div className="chips">
            {dias.map((d) => (
              <button key={d} className={`chip ${d === dia ? 'on' : ''}`} onClick={() => setDia(d)}>
                {diaLabel(d)}
              </button>
            ))}
          </div>
          {yo && (
            <Segmented
              value={ver}
              options={[
                ['yo', `Solo ${nombre(yo)}`],
                ['todos', 'Los dos'],
              ]}
              onChange={setVer}
            />
          )}
          <div className="blocks">
            {bloques.map((b) => {
              const [a, z] = windowOf(b, bloques);
              const isNow = now >= a && now < z;
              const done = !!visitados[b.id];
              const p = b.proyecto ? PROYECTO_BY_ID.get(b.proyecto) : undefined;
              const clash = choques.get(b.id);
              return (
                <div key={b.id} ref={isNow ? nowRef : undefined} className={`block ${isNow ? 'now' : ''} ${done ? 'done' : ''} ${clash ? 'clash' : ''}`}>
                  <div className="block-top">
                    <span className="block-time">
                      {b.inicio}
                      {b.fin ? `–${b.fin}` : ''}
                    </span>
                    {isNow && <span className="now-badge">AHORA</span>}
                    {b.quien && ver === 'todos' && <span className={`who ${b.quien}`}>{nombre(b.quien)}</span>}
                    <button className={`tick big ${done ? 'on' : ''}`} onClick={() => void toggle(b.id)} aria-label={done ? 'Desmarcar visitado' : 'Marcar visitado'}>
                      <Check size={24} strokeWidth={3} />
                    </button>
                  </div>
                  {clash && (
                    <div className="block-clash">
                      <TriangleAlert size={16} /> Se solapa con {clash.map((c) => `${c.inicio}–${c.fin}`).join(', ')}
                    </div>
                  )}
                  <div className="block-place">
                    <MapPin size={17} />
                    {b.lugar}
                  </div>
                  {p && (
                    <button className="block-proj" onClick={() => openPresent(p.id)}>
                      <PresentIcon size={16} /> {p.nombre_es || p.nombre_zh}
                    </button>
                  )}
                  <div className="block-goal">{b.objetivo}</div>
                  {(b.vigilar ?? []).filter(Boolean).length > 0 && (
                    <ul className="block-watch">
                      {(b.vigilar ?? []).filter(Boolean).map((v, k) => (
                        <li key={k}>{v}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
