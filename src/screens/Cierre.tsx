import { useMemo, useState, type CSSProperties } from 'react';
import { ChevronDown, ChevronRight, Merge } from 'lucide-react';
import { useApp } from '../ctx';
import { db } from '../lib/db';
import { fichaId, getOf, missing, score, viaColor } from '../lib/ficha';
import { chinaDate, memberOf } from '../lib/plan';
import { mergeInto } from '../lib/store';
import { toast } from '../lib/toast';
import type { LocalSupplier } from '../lib/types';
import { fmtTime, useLive } from '../lib/util';
import { Empty, NavBar, PhotoImg, Sheet } from '../components/ui';
import { FichaBadges, FichaEditor, PhotoStrip } from '../components/Ficha';

const dayOf = (s: LocalSupplier) => chinaDate(Date.parse(s.created_at));
const dayLabel = (d: string) =>
  new Date(`${d}T12:00:00+08:00`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });

function Head({ s, onClick, right }: { s: LocalSupplier; onClick: () => void; right?: React.ReactNode }) {
  const get = getOf(s);
  const id = fichaId(get);
  const name = s.company || s.company_zh;
  return (
    <div className="row srow tap" style={{ '--via': viaColor(get('via')) } as CSSProperties} onClick={onClick}>
      <PhotoImg path={s.photos[0]?.path} thumb className="thumb" />
      <div className="srow-main">
        <div className="srow-title">
          {id && <span className="srow-id">{id}</span>}
          <span className={name ? '' : 'empty'}>{name || 'Sin empresa'}</span>
        </div>
        <div className="srow-meta">
          <FichaBadges get={get} />
          <span className="srow-time">{fmtTime(s.created_at)}</span>
        </div>
      </div>
      {right}
    </div>
  );
}

/** Modo Cierre (21:30–23:00): fichas del día una a una, con lo que falta, verificación, la frase y el estado. */
export function Cierre() {
  const { myId, profiles, push } = useApp();
  const all = useLive(() => db.suppliers.toArray(), [], []);
  const me = memberOf(profiles.get(myId)?.name);
  const today = chinaDate(Date.now());
  const [day, setDay] = useState(today);
  const [mine, setMine] = useState(true);
  const [byScore, setByScore] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [merging, setMerging] = useState<LocalSupplier | null>(null);

  const live = useMemo(() => all.filter((s) => !s.deleted), [all]);
  const days = useMemo(() => [...new Set([today, ...live.map(dayOf)])].sort().reverse(), [live, today]);
  const list = useMemo(() => {
    const sc = (s: LocalSupplier) => score(getOf(s))?.value ?? -1;
    return live
      .filter((s) => dayOf(s) === day && (!mine || s.created_by === myId || (!!me && s.extra.owner === me)))
      .sort((a, b) => (byScore && sc(b) - sc(a)) || a.created_at.localeCompare(b.created_at));
  }, [live, day, mine, myId, me, byScore]);
  const incomplete = list.filter((s) => missing(getOf(s)).length > 0).length;

  const doMerge = async (target: LocalSupplier) => {
    if (!merging) return;
    const name = (s: LocalSupplier) => fichaId(getOf(s)) || s.company || 'sin localizar';
    if (!confirm(`Fotos, audios y notas de «${name(merging)}» pasan a «${name(target)}», y la primera se borra. ¿Unir?`)) return;
    await mergeInto(target.id, merging.id);
    setMerging(null);
    setOpen(target.id);
    toast('Fichas unidas');
  };

  return (
    <>
      <NavBar back="Hoy" title="Cierre del día" />
      <h1 className="large-title small">Cierre del día</h1>
      <p className="subtitle">
        {list.length} fichas · {incomplete} incompletas
      </p>
      <div className="chips">
        <label className="chip on">
          {day === today ? 'Hoy' : dayLabel(day)} <ChevronDown size={14} />
          <select value={day} onChange={(e) => setDay(e.target.value)}>
            {days.map((d) => (
              <option key={d} value={d}>
                {d === today ? 'Hoy' : dayLabel(d)}
              </option>
            ))}
          </select>
        </label>
        <button className={`chip ${mine ? 'on' : ''}`} onClick={() => setMine(!mine)}>
          {mine ? 'Mías' : 'De los dos'}
        </button>
        <button className={`chip ${byScore ? 'on' : ''}`} onClick={() => setByScore(!byScore)}>
          Por puntuación
        </button>
      </div>

      {!list.length && <Empty>No hay fichas este día.</Empty>}
      {list.map((s) => (
        <div key={s.id} className={`cierre ${open === s.id ? 'open' : ''}`}>
          <div className="group">
            <div className="list">
              <Head
                s={s}
                onClick={() => setOpen(open === s.id ? null : s.id)}
                right={<ChevronRight size={18} className={`chev ${open === s.id ? 'down' : ''}`} />}
              />
            </div>
          </div>
          {open === s.id && (
            <>
              <PhotoStrip s={s} />
              <FichaEditor s={s} />
              <div className="pad row-btns">
                <button className="btn secondary" onClick={() => setMerging(s)}>
                  <Merge size={18} /> Unir con…
                </button>
                <button className="btn secondary" onClick={() => push({ kind: 'supplier', id: s.id })}>
                  Ficha completa
                </button>
              </div>
            </>
          )}
        </div>
      ))}

      {merging && (
        <Sheet title="Unir con…" onClose={() => setMerging(null)} left={<button className="link" onClick={() => setMerging(null)}>Cancelar</button>}>
          <p className="foot pad">Elige la ficha buena. Las fotos, audios y notas de esta pasan a ella.</p>
          <div className="group">
            <div className="list">
              {live
                .filter((x) => x.id !== merging.id && dayOf(x) === day)
                .map((x) => (
                  <Head key={x.id} s={x} onClick={() => void doMerge(x)} />
                ))}
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}
