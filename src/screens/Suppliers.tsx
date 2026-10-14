import { useMemo, useState, type CSSProperties } from 'react';
import { ChevronDown, Copy, Search, Share, Trash2, X } from 'lucide-react';
import { useApp } from '../ctx';
import { db } from '../lib/db';
import { CONFIG, EVENTS, PROJECTS } from '../lib/content';
import { updateSupplier } from '../lib/store';
import { exportBackup } from '../lib/backup';
import { fichaId, getOf, missing, score, searchText, viaDef } from '../lib/ficha';
import { copyText, toast } from '../lib/toast';
import type { LocalSupplier, Supplier, TextField } from '../lib/types';
import { fmtDateTime, norm, useLive } from '../lib/util';
import { EditField, Empty, NavBar, Person, ProjectChips, Stars, SyncPill } from '../components/ui';
import { SupplierRow } from '../components/SupplierRow';
import { FichaEditor, PhotoStrip } from '../components/Ficha';

function SelectChip({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  const cur = options.find(([v]) => v === value);
  return (
    <label className={`chip ${value ? 'on' : ''}`}>
      {cur ? cur[1] : label}
      <ChevronDown size={14} />
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{label}: todos</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Filtro de vía de un toque (también en Hoy). */
export function ViaFilter({ value, onChange, counts }: { value: string; onChange: (v: string) => void; counts?: Map<string, number> }) {
  const vias = CONFIG?.vias ?? [];
  if (!vias.length) return null;
  return (
    <div className="chips">
      <button className={`chip ${value ? '' : 'on'}`} onClick={() => onChange('')}>
        Todas
      </button>
      {vias.map((v) => (
        <button
          key={v.id}
          className={`chip via-chip ${value === v.id ? 'on' : ''}`}
          style={{ '--via': v.color } as CSSProperties}
          onClick={() => onChange(value === v.id ? '' : v.id)}
        >
          {v.label}
          {counts && <b>{counts.get(v.id) ?? 0}</b>}
        </button>
      ))}
    </div>
  );
}

export function Suppliers() {
  const { profiles } = useApp();
  const all = useLive(() => db.suppliers.toArray(), [], []);
  const [q, setQ] = useState('');
  const [via, setVia] = useState('');
  const [sector, setSector] = useState('');
  const [proj, setProj] = useState('');
  const [ev, setEv] = useState('');
  const [who, setWho] = useState('');
  const [deal, setDeal] = useState(false);
  const [incomplete, setIncomplete] = useState(false);
  const [byScore, setByScore] = useState(false);

  const live = useMemo(() => all.filter((s) => !s.deleted), [all]);
  const sectors = useMemo(
    () => [...new Set((via ? [viaDef(via)] : CONFIG?.vias ?? []).flatMap((v) => v?.sectors ?? []))],
    [via],
  );

  const list = useMemo(() => {
    const nq = norm(q);
    const out = live
      .filter((s) => !via || s.extra.via === via)
      .filter((s) => !sector || s.extra.sector === sector)
      .filter((s) => !proj || s.project_ids.includes(proj))
      .filter((s) => !ev || s.event === ev)
      .filter((s) => !who || s.created_by === who)
      .filter((s) => !deal || s.agreement.trim() !== '')
      .filter((s) => !incomplete || missing(getOf(s)).length > 0)
      .filter((s) => !nq || searchText(s).includes(nq));
    const sc = (s: LocalSupplier) => score(getOf(s))?.value ?? -1;
    return out.sort((a, b) => (byScore && sc(b) - sc(a)) || b.created_at.localeCompare(a.created_at));
  }, [live, q, via, sector, proj, ev, who, deal, incomplete, byScore]);

  return (
    <>
      <NavBar
        center={<SyncPill />}
        right={
          <button className="icon-btn" onClick={() => exportBackup().catch((e) => toast(e.message))} aria-label="Exportar">
            <Share size={21} />
          </button>
        }
      />
      <h1 className="large-title">Fichas</h1>
      <div className="search">
        <Search size={17} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pabellón-stand, empresa, WeChat, nota…" type="search" />
        {q && (
          <button className="icon-btn tiny" onClick={() => setQ('')} aria-label="Borrar">
            <X size={14} />
          </button>
        )}
      </div>
      <ViaFilter
        value={via}
        onChange={(v) => {
          setVia(v);
          setSector('');
        }}
      />
      <div className="chips">
        {sectors.length > 0 && <SelectChip label="Sector" value={sector} onChange={setSector} options={sectors.map((s) => [s, s])} />}
        <button className={`chip ${incomplete ? 'on' : ''}`} onClick={() => setIncomplete(!incomplete)}>
          Incompletas
        </button>
        <button className={`chip ${byScore ? 'on' : ''}`} onClick={() => setByScore(!byScore)}>
          Por puntuación
        </button>
        <SelectChip label="Proyecto" value={proj} onChange={setProj} options={PROJECTS.map((p) => [p.slug, p.name])} />
        <SelectChip label="Quién" value={who} onChange={setWho} options={[...profiles.values()].map((p) => [p.id, p.name || '—'])} />
        <SelectChip label="Feria" value={ev} onChange={setEv} options={EVENTS.map((e) => [e.label, e.label])} />
        <button className={`chip ${deal ? 'on' : ''}`} onClick={() => setDeal(!deal)}>
          Con algo pactado
        </button>
      </div>

      <div className="group">
        <div className="group-title">{list.length} fichas</div>
        {list.length ? (
          <div className="list">
            {list.map((s) => (
              <SupplierRow key={s.id} s={s} />
            ))}
          </div>
        ) : (
          <Empty>Nada por aquí.</Empty>
        )}
      </div>
    </>
  );
}

export function SupplierDetail({ id }: { id: string }) {
  const { back } = useApp();
  const s = useLive<LocalSupplier | false | null>(() => db.suppliers.get(id).then((x) => x ?? false), [id], null);

  if (s === null) return <NavBar back="Atrás" />;
  if (!s)
    return (
      <>
        <NavBar back="Atrás" />
        <Empty>Ficha no encontrada.</Empty>
      </>
    );

  const get = getOf(s);
  const via = viaDef(get('via'));
  const inVia = new Set(via?.fields.map((f) => f.key) ?? []);
  const set = (patch: Partial<Supplier>) => void updateSupplier(id, patch);
  const f = (k: TextField, label: string, extra: Partial<Parameters<typeof EditField>[0]> = {}) =>
    inVia.has(k) ? null : <EditField label={label} value={s[k]} onSave={(v) => set({ [k]: v.trim() } as Partial<Supplier>)} {...extra} />;
  const copyBtn = (v: string) => (
    <button className="icon-btn" disabled={!v} onClick={() => copyText(v)} aria-label="Copiar">
      <Copy size={18} />
    </button>
  );

  const remove = async () => {
    if (!confirm('¿Borrar esta ficha?')) return;
    await updateSupplier(id, { deleted: true });
    back();
  };

  const name = s.company || s.company_zh;
  const title = [fichaId(get), name].filter(Boolean).join(' · ') || 'Sin localizar';

  return (
    <>
      <NavBar back="Atrás" title={title} />
      <h1 className={`large-title small ${name ? '' : 'muted'}`}>{title}</h1>
      <p className="subtitle">
        {s.event} {s.agreement.trim() && <span className="seal">Pactado</span>}
      </p>

      <PhotoStrip s={s} />
      <FichaEditor s={s} />

      <div className="group">
        <div className="list">
          {f('agreement', 'Lo pactado', { multiline: true, placeholder: 'Precio cerrado, muestras pedidas…' })}
          {f('next_step', 'Siguiente paso', { multiline: true, placeholder: 'Qué hay que hacer y cuándo' })}
        </div>
      </div>

      <div className="group">
        <div className="group-title">Proyectos</div>
        <ProjectChips value={s.project_ids} onChange={(v) => set({ project_ids: v })} />
      </div>

      <div className="group">
        <div className="list">
          <div className="row">
            <span className="grow">Valoración</span>
            <Stars value={s.rating} onChange={(v) => set({ rating: v })} size={26} />
          </div>
          <label className="row">
            <span className="grow">Feria</span>
            <select className="select" value={s.event} onChange={(e) => set({ event: e.target.value })}>
              {!EVENTS.some((e) => e.label === s.event) && <option value={s.event}>{s.event || '—'}</option>}
              {EVENTS.map((e) => (
                <option key={e.label}>{e.label}</option>
              ))}
            </select>
          </label>
          <EditField
            label="Etiquetas"
            value={s.tags.join(', ')}
            placeholder="separadas por comas"
            onSave={(v) => set({ tags: v.split(',').map((x) => x.trim()).filter(Boolean) })}
          />
        </div>
      </div>

      <div className="group">
        <div className="group-title">Oferta</div>
        <div className="list">
          {f('products', 'Productos', { multiline: true })}
          {!via && f('price', 'Precio')}
          {!via && f('moq', 'MOQ')}
          {f('incoterm', 'Incoterm')}
          {!via && f('lead_time', 'Plazo')}
          {!via && f('samples', 'Muestras')}
        </div>
      </div>

      <div className="group">
        <div className="group-title">Contacto</div>
        <div className="list">
          {f('contact', 'Persona')}
          {f('role', 'Cargo')}
          {f('wechat', 'WeChat', { action: copyBtn(s.wechat) })}
          {f('phone', 'Teléfono', { type: 'tel', action: copyBtn(s.phone) })}
          {f('email', 'Email', { type: 'email', inputMode: 'email', action: copyBtn(s.email) })}
          {f('web', 'Web', { type: 'url' })}
          {f('city', 'Ciudad')}
          {!inVia.has('kind') && (
            <label className="row">
              <span className="grow">Tipo</span>
              <select className="select" value={s.kind} onChange={(e) => set({ kind: e.target.value })}>
                <option value="">—</option>
                <option value="fábrica">Fábrica</option>
                <option value="trading">Trading</option>
              </select>
            </label>
          )}
        </div>
      </div>

      <div className="group">
        <div className="group-title">Nota original</div>
        <div className="list">
          <EditField label="Nota" multiline value={s.note} onSave={(v) => set({ note: v })} />
        </div>
      </div>

      <div className="group">
        <div className="list">
          <div className="row meta">
            <span className="grow">Subido por</span>
            <Person id={s.created_by} />
            <span className="muted">{fmtDateTime(s.created_at)}</span>
          </div>
          <div className="row meta">
            <span className="grow">Última edición</span>
            <Person id={s.updated_by} />
            <span className="muted">{fmtDateTime(s.updated_at)}</span>
          </div>
        </div>
      </div>

      <div className="pad">
        <button className="btn plain danger" onClick={remove}>
          <Trash2 size={18} /> Borrar ficha
        </button>
      </div>
    </>
  );
}
