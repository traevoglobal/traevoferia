import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { CONFIG } from '../lib/content';
import { disabledOptions, fieldVisible, type Get } from '../lib/ficha';
import type { FieldDef, ViaDef } from '../lib/types';

/** Campo de botones de un toque. Tocar el elegido lo quita. */
export function Choice({ f, value, disabled = [], onChange }: { f: FieldDef; value: string; disabled?: string[]; onChange: (v: string) => void }) {
  return (
    <div className="qf">
      <div className="qf-label">{f.label}</div>
      <div className="qf-opts">
        {(f.options ?? []).map(([v, l]) => (
          <button
            key={v}
            disabled={disabled.includes(v)}
            className={`qf-opt ${value === v ? 'on' : ''} ${f.best === v ? 'best' : ''}`}
            onClick={() => onChange(value === v ? '' : v)}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Texto corto. Con `onBlurOnly` guarda al salir del campo (fichas guardadas); si no, en cada cambio (borrador). */
export function QuickText({ f, value, onChange, onBlurOnly }: { f: FieldDef; value: string; onChange: (v: string) => void; onBlurOnly?: boolean }) {
  const [v, setV] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setV(value);
  }, [value]);
  return (
    <label className="qf qf-text">
      <span className="qf-label">{f.label}</span>
      <input
        value={v}
        placeholder="—"
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          if (onBlurOnly && v.trim() !== value) onChange(v.trim());
        }}
        onChange={(e) => {
          setV(e.target.value);
          if (!onBlurOnly) onChange(e.target.value);
        }}
      />
    </label>
  );
}

/** Campos de una vía, respetando showIf y las opciones bloqueadas por las reglas. */
export function ViaFields({ fields, get, onChange, onBlurOnly }: { fields: FieldDef[]; get: Get; onChange: (key: string, v: string) => void; onBlurOnly?: boolean }) {
  const disabled = disabledOptions(get);
  return (
    <>
      {fields
        .filter((f) => fieldVisible(f, get))
        .map((f) =>
          f.options ? (
            <Choice key={f.key} f={f} value={get(f.key)} disabled={disabled[f.key]} onChange={(v) => onChange(f.key, v)} />
          ) : (
            <QuickText key={f.key} f={f} value={get(f.key)} onChange={(v) => onChange(f.key, v)} onBlurOnly={onBlurOnly} />
          ),
        )}
    </>
  );
}

/** Las vías como botones grandes (Captar) o compactos (ficha). */
export function ViaPicker({ value, onChange, big }: { value: string; onChange: (id: string) => void; big?: boolean }) {
  const vias = CONFIG?.vias ?? [];
  if (!vias.length) return null;
  return (
    <div className={`via-row ${big ? 'big' : ''}`}>
      {vias.map((v) => (
        <button key={v.id} className={`via ${value === v.id ? 'on' : ''}`} style={{ '--via': v.color } as CSSProperties} onClick={() => onChange(v.id)}>
          <b>{v.label}</b>
          {big && <span>{v.hint}</span>}
        </button>
      ))}
    </div>
  );
}

/** Sectores de la vía, de un toque, en una fila. */
export function SectorChips({ via, value, onChange }: { via: ViaDef; value: string; onChange: (v: string) => void }) {
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    row.current?.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [via.id]);
  return (
    <div className="qf">
      <div className="qf-label">{via.sectorLabel ?? 'Sector'}</div>
      <div className="chips row" ref={row}>
        {via.sectors.map((s) => (
          <button
            key={s}
            className={`chip ${value === s ? 'on' : ''}`}
            style={value === s ? { background: via.color, color: '#fff' } : undefined}
            onClick={() => onChange(value === s ? '' : s)}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
