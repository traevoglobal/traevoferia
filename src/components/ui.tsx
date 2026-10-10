import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, CloudOff, RefreshCw, Check, Star, X } from 'lucide-react';
import { useApp } from '../ctx';
import { syncNow, usePendingCount, useSyncStatus } from '../lib/sync';
import { usePhotoUrl } from '../lib/photos';
import { colorFor, initials } from '../lib/util';
import { PROJECT_BY_SLUG } from '../lib/content';
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
  if (!st.online)
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

export function Person({ id }: { id?: string }) {
  const { profiles } = useApp();
  return (
    <span className="person">
      <Avatar id={id} size={20} />
      {profiles.get(id ?? '')?.name || '—'}
    </span>
  );
}

export function Stars({ value, onChange, size = 14 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <span className={`stars ${onChange ? 'edit' : ''}`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          fill={i <= value ? 'currentColor' : 'none'}
          className={i <= value ? '' : 'off'}
          onClick={onChange ? () => onChange(i === value ? 0 : i) : undefined}
        />
      ))}
    </span>
  );
}

export function ProjectDots({ ids }: { ids: string[] }) {
  return (
    <span className="dots">
      {ids.map((s) => (
        <i key={s} className="dot" style={{ background: PROJECT_BY_SLUG.get(s)?.color ?? '#999' }} />
      ))}
    </span>
  );
}

export function ProjectChips({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const all = [...PROJECT_BY_SLUG.values()];
  return (
    <div className="chips wrap">
      {all.map((p) => {
        const on = value.includes(p.slug);
        return (
          <button
            key={p.slug}
            className={`chip ${on ? 'on' : ''}`}
            style={on ? { background: p.color, color: '#fff' } : undefined}
            onClick={() => onChange(on ? value.filter((x) => x !== p.slug) : [...value, p.slug])}
          >
            {!on && <i className="dot" style={{ background: p.color }} />}
            {p.name}
          </button>
        );
      })}
    </div>
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

export function Sheet({
  title, left, right, children, onClose, tall,
}: { title?: string; left?: ReactNode; right?: ReactNode; children: ReactNode; onClose?: () => void; tall?: boolean }) {
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose ?? navBack} />
      <div className={`sheet ${tall ? 'tall' : ''}`} role="dialog">
        <div className="sheet-head">
          <div className="nav-left">{left}</div>
          <div className="nav-center">
            <span className="nav-title">{title}</span>
          </div>
          <div className="nav-right">{right}</div>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </>
  );
}

/** Campo que guarda al salir (blur). */
export function EditField({
  label, value, onSave, multiline, placeholder, type, inputMode, action,
}: {
  label: string; value: string; onSave: (v: string) => void; multiline?: boolean; placeholder?: string;
  type?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']; action?: ReactNode;
}) {
  const [v, setV] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setV(value);
  }, [value]);
  const commit = () => {
    focused.current = false;
    if (v !== value) onSave(v);
  };
  const common = {
    value: v,
    placeholder: placeholder ?? '—',
    onFocus: () => (focused.current = true),
    onBlur: commit,
  };
  return (
    <div className="field">
      <label>{label}</label>
      <div className="field-row">
        {multiline ? (
          <AutoTextarea {...common} onChange={(e) => setV(e.target.value)} />
        ) : (
          <input {...common} type={type ?? 'text'} inputMode={inputMode} onChange={(e) => setV(e.target.value)} />
        )}
        {action}
      </div>
    </div>
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
