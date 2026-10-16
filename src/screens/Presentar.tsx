import { useRef, useState } from 'react';
import { ChevronRight, NotebookPen, X } from 'lucide-react';
import { useApp } from '../ctx';
import { COMUN, LINEA_NOMBRE as NOMBRE, LINEAS, PROYECTO_BY_ID, PROYECTOS } from '../lib/content';
import { useAsset } from '../lib/assets';
import type { Linea, Slide } from '../lib/types';
import { Empty, NavBar } from '../components/ui';


/** Pantalla 1: las dos líneas. */
export function Lineas() {
  const { push } = useApp();
  return (
    <>
      <NavBar />
      <h1 className="large-title">Presentar</h1>
      <div className="lineas">
        {LINEAS.map((l) => {
          const d = COMUN.lineas[l];
          const n = PROYECTOS.filter((p) => p.linea === l).length;
          return (
            <button key={l} className={`linea ${l}`} onClick={() => push({ kind: 'linea', linea: l })}>
              <b>{NOMBRE[l]}</b>
              {d?.desc_zh && (
                <span className="linea-zh" lang="zh-CN">
                  {d.desc_zh}
                </span>
              )}
              {d?.desc_es && <span className="linea-es">{d.desc_es}</span>}
              <span className="linea-n">
                {n === 1 ? '1 proyecto' : `${n} proyectos`} <ChevronRight size={18} />
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

/** Pantalla 2: proyectos de una línea. */
export function LineaList({ linea }: { linea: Linea }) {
  const { openPresent } = useApp();
  const list = PROYECTOS.filter((p) => p.linea === linea);
  return (
    <>
      <NavBar back="Presentar" title={NOMBRE[linea]} />
      <h1 className={`large-title linea-title ${linea}`}>{NOMBRE[linea]}</h1>
      {list.length ? (
        <div className="pcards">
          {list.map((p) => (
            <button key={p.id} className={`pcard ${linea}`} onClick={() => openPresent(p.id)}>
              <span className="pcard-zh" lang="zh-CN">
                {p.nombre_zh}
              </span>
              <span className="pcard-es">{p.nombre_es}</span>
              {p.resumen_zh && (
                <span className="pcard-sum" lang="zh-CN">
                  {p.resumen_zh}
                </span>
              )}
              {p.resumen_es && <span className="pcard-sum es">{p.resumen_es}</span>}
            </button>
          ))}
        </div>
      ) : (
        <Empty>Aún no hay proyectos en esta línea.</Empty>
      )}
    </>
  );
}

function SlideView({ s }: { s: Slide }) {
  const img = useAsset(s.imagen);
  const n = Math.min(4, Math.max(s.bullets_zh.length, s.bullets_es.length));
  return (
    <section className="slide">
      <div className="slide-in">
        {s.imagen && (img ? <img className="slide-img" src={img} alt="" draggable={false} /> : <div className="slide-img ph-empty" />)}
        <h2 className="slide-zh" lang="zh-CN">
          {s.titulo_zh}
        </h2>
        <p className="slide-es">{s.titulo_es}</p>
        {n > 0 && (
          <ul className="slide-list">
            {Array.from({ length: n }, (_, i) => (
              <li key={i}>
                {s.bullets_zh[i] && (
                  <span className="b-zh" lang="zh-CN">
                    {s.bullets_zh[i]}
                  </span>
                )}
                {s.bullets_es[i] && <span className="b-es">{s.bullets_es[i]}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** Pantalla 3: presentación a pantalla completa. Se pasa deslizando; "Notas" abre la ficha encima sin cerrarla. */
export function Presentation({ id, ficha, onExit }: { id: string; ficha: string; onExit: () => void }) {
  const { openFicha } = useApp();
  const p = PROYECTO_BY_ID.get(id);
  // Comunes → las de su línea → las del proyecto.
  const lineSlides = p ? (COMUN.lineas[p.linea]?.slides ?? []) : [];
  const slides = [...COMUN.slides, ...lineSlides, ...(p?.slides ?? [])].filter((s) => s.titulo_es || s.titulo_zh || s.bullets_zh.length || s.imagen);
  const [i, setI] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const go = (to: number) => {
    const el = track.current;
    if (el) el.scrollTo({ left: Math.max(0, Math.min(slides.length - 1, to)) * el.clientWidth, behavior: 'smooth' });
  };
  return (
    <div className="present">
      <div className="present-track" ref={track} onScroll={(e) => setI(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
        {slides.length ? slides.map((s, k) => <SlideView key={k} s={s} />) : <Empty>Este proyecto aún no tiene slides.</Empty>}
      </div>
      <button className="present-exit" onClick={onExit} aria-label="Salir">
        <X size={26} strokeWidth={2.5} />
      </button>
      {slides.length > 1 && (
        <div className="present-dots">
          {slides.map((_, k) => (
            <button key={k} className={k === i ? 'on' : ''} onClick={() => go(k)} aria-label={`Slide ${k + 1}`} />
          ))}
        </div>
      )}
      <button className="present-notes" onClick={() => openFicha({ id: ficha, proyecto: id })}>
        <NotebookPen size={24} /> Notas
      </button>
    </div>
  );
}
