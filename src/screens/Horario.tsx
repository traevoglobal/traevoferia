import { useEffect, useMemo, useRef, useState, type Ref } from 'react';
import { Check, MapPin, Minus, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { useApp } from '../ctx';
import { db } from '../lib/db';
import { HORARIO } from '../lib/content';
import type { Horario as Plan, Member, PlanDay, Slot, SlotCounter, Visit, Who } from '../lib/types';
import { norm, useLive, useStored } from '../lib/util';
import { Empty, NavBar, Segmented, SyncPill } from '../components/ui';

/* Horario de la feria por persona (contenido privado "horario" en Supabase). Lo marcado aquí (hecho, contadores,
   visitas, entregables) se guarda solo en este móvil. Las horas son de China (UTC+8). */

const WHO_LABEL: Record<Who, string> = { javi: 'Javi', rafa: 'Rafa', ambos: 'Ambos' };
const MEMBERS: Member[] = ['javi', 'rafa'];
const CN = 8 * 3600_000;
const EMPTY_VISIT: Visit = { fabrica: '', ciudad: '', hora: '', contacto: '', estado: 'pedida' };
const NEW_DAY: Visit[] = [EMPTY_VISIT, EMPTY_VISIT, EMPTY_VISIT];

/** Fecha AAAA-MM-DD en China, sea cual sea la zona horaria del móvil. */
const chinaDate = (ms: number) => new Date(ms + CN).toISOString().slice(0, 10);
const chinaMs = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00+08:00`);
const visible = (who: Who, filter: Who) => filter === 'ambos' || who === 'ambos' || who === filter;
const cluster = (aliases: Record<string, string>, c: string) => {
  const n = norm(c);
  return aliases[n] ?? n;
};

/** Inicio y fin de una franja; sin hora de fin, dura hasta la siguiente franja del día (o una hora). */
function windowOf(day: PlanDay, s: Slot): [number, number] {
  const a = chinaMs(day.date, s.start);
  if (s.end) return [a, chinaMs(day.date, s.end)];
  const next = day.slots.map((x) => chinaMs(day.date, x.start)).filter((t) => t > a);
  return [a, next.length ? Math.min(...next) : a + 3600_000];
}

/** Etiqueta de la ficha creada desde la franja. Sin comas: el campo Etiquetas separa por comas. */
const slotTag = (day: PlanDay, s: Slot) => `${day.label} ${s.start} ${WHO_LABEL[s.who]} · ${s.short}`;
const allTags = (h: Plan) => new Set(h.days.flatMap((d) => d.slots.filter((s) => s.short).map((s) => slotTag(d, s))));

/** Abre en el día de hoy (hora de China); fuera de fechas, en el primero. */
function defaultView(h: Plan): string {
  const today = chinaDate(Date.now());
  const day = h.days.find((d) => d.date === today);
  if (day) return day.id;
  if (h.clusterDays.some((d) => d.date === today)) return 'clus';
  if (today > h.clusterDays[h.clusterDays.length - 1].date) return 'fin';
  return h.days[0].id;
}

function useNow(every = 30_000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(t);
  }, [every]);
  return now;
}

export function Horario() {
  const h = HORARIO;
  const [view, setView] = useState(() => (h ? defaultView(h) : ''));
  const [who, setWho] = useStored<Who>('feria.horario.persona', 'ambos');
  if (!h)
    return (
      <>
        <NavBar center={<SyncPill />} />
        <h1 className="large-title">Horario</h1>
        <Empty>El horario se descarga al sincronizar. Ábrelo una vez con conexión y quedará guardado en el móvil.</Empty>
      </>
    );
  const day = h.days.find((d) => d.id === view) ?? (view === 'clus' || view === 'fin' ? undefined : h.days[0]);
  return (
    <>
      <NavBar center={<SyncPill />} />
      <h1 className="large-title">Horario</h1>
      <Segmented
        value={day?.id ?? view}
        onChange={setView}
        options={[...h.days.map((d): [string, string] => [d.id, d.label]), ['clus', 'Mar–Jue'], ['fin', 'Entrega']]}
      />
      <Segmented value={who} onChange={setWho} options={[['javi', 'Javi'], ['rafa', 'Rafa'], ['ambos', 'Ambos']]} />
      {day ? <DayView h={h} day={day} who={who} /> : view === 'clus' ? <ClusterView h={h} who={who} /> : <Deliverables h={h} who={who} />}
    </>
  );
}

/* ---------- Sábado, domingo, lunes ---------- */

function DayView({ h, day, who }: { h: Plan; day: PlanDay; who: Who }) {
  const { profiles, openCaptureTag } = useApp();
  const now = useNow();
  const [done, setDone] = useStored<Record<string, boolean>>('feria.horario.hecho', {});
  const [extra, setExtra] = useStored<Record<string, number>>('feria.horario.contadores', {});
  const suppliers = useLive(() => db.suppliers.toArray(), [], []);
  const nowRef = useRef<HTMLDivElement>(null);
  const tags = useMemo(() => allTags(h), [h]);

  // Usuarios de cada miembro, por el nombre del perfil ("Javi…", "Rafa…").
  const users = useMemo(() => {
    const m: Record<Member, string[]> = { javi: [], rafa: [] };
    for (const p of profiles.values()) for (const k of MEMBERS) if (norm(p.name).startsWith(k)) m[k].push(p.id);
    return m;
  }, [profiles]);

  /** Fichas de la franja: las creadas desde su botón y, sin etiqueta de franja, las que esa persona creó durante su horario. */
  const fichas = (s: Slot) => {
    const [a, b] = windowOf(day, s);
    const tag = s.short ? slotTag(day, s) : '';
    const ids = s.who === 'ambos' ? [...users.javi, ...users.rafa] : users[s.who];
    return suppliers.filter((x) => {
      if (x.deleted) return false;
      if (x.tags.some((t) => tags.has(t))) return x.tags.includes(tag);
      const t = Date.parse(x.created_at);
      return ids.includes(x.created_by) && t >= a && t < b;
    }).length;
  };

  const isNow = (s: Slot) => {
    const [a, b] = windowOf(day, s);
    return now >= a && now < b;
  };
  const slots = day.slots.filter((s) => visible(s.who, who));
  const nowId = slots.find(isNow)?.id;

  useEffect(() => {
    nowRef.current?.scrollIntoView({ block: 'center' });
  }, [day.id, who]);

  return (
    <>
      <div className="day-head">
        <b>{day.title}</b>
        {day.note && <p className="day-note">{day.note}</p>}
      </div>
      <div className="slots">
        {slots.map((s) => (
          <SlotCard
            key={s.id}
            slot={s}
            now={isNow(s)}
            done={!!done[s.id]}
            onDone={() => setDone((p) => ({ ...p, [s.id]: !p[s.id] }))}
            fichas={s.counters?.some((c) => c.fichas) ? fichas(s) : 0}
            extra={extra}
            onStep={(id, delta, min) => setExtra((p) => ({ ...p, [id]: Math.max(min, (p[id] ?? 0) + delta) }))}
            onFicha={s.short ? () => openCaptureTag(slotTag(day, s)) : undefined}
            cardRef={s.id === nowId ? nowRef : undefined}
          />
        ))}
      </div>
    </>
  );
}

function SlotCard({
  slot: s, now, done, onDone, fichas, extra, onStep, onFicha, cardRef,
}: {
  slot: Slot; now: boolean; done: boolean; onDone: () => void; fichas: number;
  extra: Record<string, number>; onStep: (id: string, delta: number, min: number) => void; onFicha?: () => void; cardRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div ref={cardRef} className={`slot ${now ? 'now' : ''} ${done ? 'done' : ''}`}>
      <div className="slot-top">
        <span className="slot-time">{s.end ? `${s.start}–${s.end}` : s.start}</span>
        {now && <span className="now-badge">AHORA</span>}
        <span className={`who ${s.who}`}>{WHO_LABEL[s.who]}</span>
        <button className={`tick ${done ? 'on' : ''}`} onClick={onDone} aria-label={done ? 'Marcar como pendiente' : 'Marcar como hecho'}>
          {done && <Check size={18} strokeWidth={3} />}
        </button>
      </div>
      <div className="slot-place">
        <MapPin size={16} />
        {s.place}
      </div>
      <div className="slot-goal">{s.goal}</div>
      {s.counters?.map((c) => (
        <Counter key={c.id} c={c} base={c.fichas ? fichas : 0} extra={extra[c.id] ?? 0} onStep={(d, min) => onStep(c.id, d, min)} />
      ))}
      {s.detail && (
        <details>
          <summary>Detalle</summary>
          <p>{s.detail}</p>
        </details>
      )}
      {onFicha && (
        <button className="btn slot-ficha" onClick={onFicha}>
          <Plus size={18} /> Nueva ficha
        </button>
      )}
    </div>
  );
}

/** Contador "7 / 40". Si cuenta fichas, el +/− es un ajuste manual sobre las fichas reales. */
function Counter({ c, base, extra, onStep }: { c: SlotCounter; base: number; extra: number; onStep: (delta: number, min: number) => void }) {
  const value = Math.max(0, base + extra);
  return (
    <div className="ctr">
      <span className="grow">
        {c.label}
        {c.fichas && (
          <span className="ctr-src">
            {base} {base === 1 ? 'ficha' : 'fichas'}
            {extra !== 0 && ` ${extra > 0 ? '+' : '−'} ${Math.abs(extra)} a mano`}
          </span>
        )}
      </span>
      <button className="ctr-btn" disabled={value === 0} onClick={() => onStep(-1, -base)} aria-label={`Restar ${c.label}`}>
        <Minus size={18} />
      </button>
      <span className={`ctr-val ${value >= c.goal ? 'ok' : ''}`}>
        {value} / {c.goal}
      </span>
      <button className="ctr-btn" onClick={() => onStep(1, -base)} aria-label={`Sumar ${c.label}`}>
        <Plus size={18} />
      </button>
    </div>
  );
}

/* ---------- Martes a jueves: reglas y planificador ---------- */

function ClusterView({ h, who }: { h: Plan; who: Who }) {
  const [plan, setPlan] = useStored<Record<string, Visit[]>>('feria.horario.visitas', {});
  const days = h.clusterDays;
  return (
    <>
      <div className="day-head">
        <b>
          {days[0].title} – {days[days.length - 1].title}
        </b>
        <p className="day-note">{h.clusterNote}</p>
      </div>
      <div className="group">
        <div className="group-title">Las 7 reglas de asignación</div>
        <div className="list card-pad">
          <ol className="rules">
            {h.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ol>
        </div>
      </div>
      {days.map((d) => (
        <div className="group" key={d.id}>
          <div className="group-title">{d.title}</div>
          <div className="plan-cols">
            {MEMBERS.filter((m) => visible(m, who)).map((m) => {
              const key = `${d.id}-${m}`;
              return (
                <PersonPlan
                  key={key}
                  who={m}
                  aliases={h.aliases}
                  visits={plan[key] ?? NEW_DAY}
                  onChange={(fn) => setPlan((p) => ({ ...p, [key]: fn(p[key] ?? NEW_DAY) }))}
                />
              );
            })}
          </div>
        </div>
      ))}
      <datalist id="feria-clusters">
        {h.clusters.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </>
  );
}

function PersonPlan({
  who, aliases, visits, onChange,
}: { who: Member; aliases: Record<string, string>; visits: Visit[]; onChange: (fn: (v: Visit[]) => Visit[]) => void }) {
  const set = (i: number, patch: Partial<Visit>) => onChange((vs) => vs.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  const count = visits.filter((v) => v.fabrica.trim()).length;
  // Regla 2: una ciudad distinta de la primera del día. Regla 4: de la cuarta visita en adelante.
  const cities = visits.map((v) => cluster(aliases, v.ciudad));
  const otherCity = (i: number) => !!cities[i] && cities[i] !== cities.find(Boolean);
  let n = 0;
  const bad = visits.map((v, i) => (v.fabrica.trim() ? ++n > 3 : false) || otherCity(i));
  const warnings = [
    visits.some((_, i) => otherCity(i)) && 'Más de una ciudad el mismo día (regla 2)',
    count > 3 && `${count} visitas: máximo tres (regla 4)`,
  ].filter((w): w is string => !!w);

  return (
    <div>
      <div className="plan-who">
        <span className={`who ${who}`}>{WHO_LABEL[who]}</span>
        <span className="muted">{count} / 3 visitas</span>
      </div>
      {warnings.map((w) => (
        <div className="plan-warn" key={w}>
          <TriangleAlert size={16} /> {w}
        </div>
      ))}
      {visits.map((v, i) => (
        <div className={`visit ${bad[i] ? 'bad' : ''}`} key={i}>
          {i >= 3 && (
            <button className="icon-btn visit-del" onClick={() => onChange((vs) => vs.filter((_, j) => j !== i))} aria-label="Quitar visita">
              <Trash2 size={18} />
            </button>
          )}
          <input className="v-main" value={v.fabrica} placeholder={`Fábrica ${i + 1}`} onChange={(e) => set(i, { fabrica: e.target.value })} />
          <div className="visit-row">
            <input value={v.ciudad} placeholder="Ciudad / clúster" list="feria-clusters" onChange={(e) => set(i, { ciudad: e.target.value })} />
            <input type="time" value={v.hora} aria-label="Hora" onChange={(e) => set(i, { hora: e.target.value })} />
          </div>
          <input value={v.contacto} placeholder="Contacto" onChange={(e) => set(i, { contacto: e.target.value })} />
          <Segmented
            value={v.estado}
            onChange={(estado) => set(i, { estado })}
            options={[['pedida', 'Pedida'], ['confirmada', 'Confirmada'], ['hecha', 'Hecha']]}
          />
        </div>
      ))}
      <button className="btn plain" onClick={() => onChange((vs) => [...vs, EMPTY_VISIT])}>
        <Plus size={18} /> Añadir visita
      </button>
    </div>
  );
}

/* ---------- Entregables ---------- */

function Deliverables({ h, who }: { h: Plan; who: Who }) {
  const [done, setDone] = useStored<Record<string, boolean>>('feria.horario.entregables', {});
  return (
    <>
      <div className="day-head">
        <b>Qué enseñamos el viernes</b>
      </div>
      {h.deliverables
        .filter((d) => visible(d.who, who))
        .map((d) => (
          <div className="group" key={d.who}>
            <div className="group-title">{WHO_LABEL[d.who]}</div>
            <div className="list">
              {d.items.map((item, i) => {
                const id = `${d.who}-${i}`;
                return (
                  <button key={id} className={`row check-row tap ${done[id] ? 'on' : ''}`} onClick={() => setDone((p) => ({ ...p, [id]: !p[id] }))}>
                    <span className={`tick ${done[id] ? 'on' : ''}`}>{done[id] && <Check size={16} strokeWidth={3} />}</span>
                    <span className="grow">{item}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
    </>
  );
}
