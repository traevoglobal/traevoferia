import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, CloudOff, RefreshCw, Check, X } from 'lucide-react';
import { useApp } from '../ctx';
import { syncNow, usePendingCount, useSyncStatus } from '../lib/sync';
import { usePhotoUrl } from '../lib/photos';
import { colorFor, initials } from '../lib/util';
import { navBack } from '../lib/nav';

export function NavBar({ back, title, right, center }: { back?: string; title?: string; right?: ReactNode; center?: ReactNode }) {
  const { back: goBack } = useApp();
  return (
    <header className="nav">
      <div className="nav-left">
        {back !== undefined && (
          <button className="back" onClick={goBack}>
            <ChevronLeft size={28} strokeWidth={2.4} />
            <span>{back}</span>
          </button>
        )}
      </div>
      <div className="nav-center">{center ?? (title && <span className="nav-title">{title}</span>)}</div>
      <div className="nav-right">{right}</div>
    </header>
  );
}

export function SyncPill() {
  const st = useSyncStatus();
  const n = usePendingCount();
  const pend = n === 1 ? '1 pendiente' : `${n} pendientes`;
  // Red que "está" pero no llega al servidor (wifi de la feria): para el usuario es lo mismo que sin conexión.
  const unreachable = !st.syncing && !!st.error && /fetch|conexi|servidor|timeout|network|abort/i.test(st.error);
  if (!st.online || unreachable)
    return (
      <span className="pill off">
        <CloudOff size={13} /> Sin conexión{n ? `, ${pend}` : ''}
      </span>
    );
  if (n)
    return (
      <button className="pill warn" onClick={() => void syncNow()}>
        <RefreshCw size={13} className={st.syncing ? 'spin' : ''} /> {st.syncing ? 'Sincronizando… ' : ''}
        {pend}
      </button>
    );
  return (
    <span className="pill ok">
      <Check size={13} /> Sincronizado
    </span>
  );
}

export function Avatar({ id, size = 28 }: { id?: string; size?: number }) {
  const { profiles } = useApp();
  const p = id ? profiles.get(id) : undefined;
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.42, background: p?.color || colorFor(id) }}
      title={p?.name}
    >
      {initials(p?.name)}
    </span>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([v, label]) => (
        <button key={v} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function PhotoImg({ path, thumb, className, onClick }: { path?: string; thumb?: boolean; className?: string; onClick?: () => void }) {
  const url = usePhotoUrl(path, thumb);
  return url ? (
    <img src={url} className={className} onClick={onClick} alt="" loading="lazy" decoding="async" draggable={false} />
  ) : (
    <div className={`${className ?? ''} ph-empty`} onClick={onClick} />
  );
}

/** Hoja inferior. Se cierra con su botón, tocando fuera o arrastrando la cabecera hacia abajo. `foot` queda fijo abajo (zona del pulgar). */
export function Sheet({
  title, left, right, children, onClose, tall, foot,
}: { title?: string; left?: ReactNode; right?: ReactNode; children: ReactNode; onClose?: () => void; tall?: boolean; foot?: ReactNode }) {
  const close = onClose ?? navBack;
  const [dy, setDy] = useState(0);
  const start = useRef<number | null>(null);
  return (
    <>
      <div className="sheet-backdrop" onClick={close} />
      <div className={`sheet ${tall ? 'tall' : ''} ${dy ? 'dragging' : ''}`} role="dialog" style={dy ? { transform: `translateY(${dy}px)` } : undefined}>
        <div
          className="sheet-head"
          onTouchStart={(e) => (start.current = e.touches[0].clientY)}
          onTouchMove={(e) => start.current !== null && setDy(Math.max(0, e.touches[0].clientY - start.current))}
          onTouchEnd={() => {
            start.current = null;
            if (dy > 110) close();
            else setDy(0);
          }}
        >
          <div className="nav-left">{left}</div>
          <div className="nav-center">
            <span className="nav-title">{title}</span>
          </div>
          <div className="nav-right">{right}</div>
        </div>
        <div className="sheet-body">{children}</div>
        {foot && <div className="sheet-foot">{foot}</div>}
      </div>
    </>
  );
}

export function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [props.value]);
  return <textarea ref={ref} rows={1} {...props} />;
}

export function PhotoViewer({ paths, index, onClose }: { paths: string[]; index: number; onClose: () => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(index);
  useEffect(() => {
    const el = track.current;
    if (el) el.scrollLeft = index * el.clientWidth;
  }, [index]);
  return (
    <div className="viewer">
      <button className="viewer-close" onClick={onClose} aria-label="Cerrar">
        <X size={22} />
      </button>
      {paths.length > 1 && (
        <div className="viewer-count">
          {i + 1} / {paths.length}
        </div>
      )}
      <div
        className="viewer-track"
        ref={track}
        onScroll={(e) => setI(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
      >
        {paths.map((p) => (
          <div key={p}>{p.startsWith('/') ? <img src={p} alt="" /> : <PhotoImg path={p} />}</div>
        ))}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
