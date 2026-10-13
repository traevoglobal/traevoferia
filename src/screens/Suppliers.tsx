import { useMemo, useRef, useState } from 'react';
import { Camera, ChevronDown, Copy, Images, Search, Share, Trash2, X } from 'lucide-react';
import { useApp } from '../ctx';
import { db } from '../lib/db';
import { EVENTS, PROJECTS } from '../lib/content';
import { addPhotosToSupplier, updateSupplier } from '../lib/store';
import { exportCsv } from '../lib/csv';
import { copyText, toast } from '../lib/toast';
import type { LocalSupplier, Supplier, TextField } from '../lib/types';
import { fmtDateTime, norm, useLive } from '../lib/util';
import { EditField, Empty, NavBar, Person, PhotoImg, ProjectChips, Stars, SyncPill } from '../components/ui';
import { SupplierRow } from '../components/SupplierRow';

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

export function Suppliers() {
  const { profiles } = useApp();
  const all = useLive(() => db.suppliers.toArray(), [], []);
  const [q, setQ] = useState('');
  const [proj, setProj] = useState('');
  const [ev, setEv] = useState('');
  const [who, setWho] = useState('');
  const [deal, setDeal] = useState(false);

  const live = useMemo(() => all.filter((s) => !s.deleted), [all]);

  const list = useMemo(() => {
    const nq = norm(q);
    return live
      .filter((s) => !proj || s.project_ids.includes(proj))
      .filter((s) => !ev || s.event === ev)
      .filter((s) => !who || s.created_by === who)
      .filter((s) => !deal || s.agreement.trim() !== '')
      .filter(
        (s) =>
          !nq ||
          norm([s.company, s.company_zh, s.products, s.wechat, s.city, s.note, s.contact, s.tags.join(' ')].join(' ')).includes(nq),
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [live, q, proj, ev, who, deal]);

  return (
    <>
      <NavBar
        center={<SyncPill />}
        right={
          <button className="icon-btn" onClick={() => exportCsv().catch((e) => toast(e.message))} aria-label="Exportar CSV">
            <Share size={21} />
          </button>
        }
      />
      <h1 className="large-title">Proveedores</h1>
      <div className="search">
        <Search size={17} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Empresa, producto, WeChat, ciudad, nota" type="search" />
        {q && (
          <button className="icon-btn tiny" onClick={() => setQ('')} aria-label="Borrar">
            <X size={14} />
          </button>
        )}
      </div>
      <div className="chips">
        <SelectChip label="Proyecto" value={proj} onChange={setProj} options={PROJECTS.map((p) => [p.slug, p.name])} />
        <SelectChip label="Feria" value={ev} onChange={setEv} options={EVENTS.map((e) => [e.label, e.label])} />
        <SelectChip label="Quién" value={who} onChange={setWho} options={[...profiles.values()].map((p) => [p.id, p.name || '—'])} />
        <button className={`chip ${deal ? 'on' : ''}`} onClick={() => setDeal(!deal)}>
          Con algo pactado
        </button>
      </div>

      <div className="group">
        <div className="group-title">{list.length} proveedores</div>
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
  const { back, openViewer } = useApp();
  const s = useLive<LocalSupplier | false | null>(() => db.suppliers.get(id).then((x) => x ?? false), [id], null);
  const [adding, setAdding] = useState(0);
  const cam = useRef<HTMLInputElement>(null);
  const gal = useRef<HTMLInputElement>(null);

  if (s === null) return <NavBar back="Atrás" />;
  if (!s)
    return (
      <>
        <NavBar back="Atrás" />
        <Empty>Proveedor no encontrado.</Empty>
      </>
    );

  const set = (patch: Partial<Supplier>) => void updateSupplier(id, patch);
  const f = (k: TextField, label: string, extra: Partial<Parameters<typeof EditField>[0]> = {}) => (
    <EditField label={label} value={s[k]} onSave={(v) => set({ [k]: v.trim() } as Partial<Supplier>)} {...extra} />
  );
  const copyBtn = (v: string) => (
    <button className="icon-btn" disabled={!v} onClick={() => copyText(v)} aria-label="Copiar">
      <Copy size={18} />
    </button>
  );

  const addFiles = async (input: HTMLInputElement) => {
    const files = [...(input.files ?? [])];
    input.value = '';
    if (!files.length) return;
    setAdding((n) => n + files.length);
    try {
      await addPhotosToSupplier(id, files);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setAdding((n) => n - files.length);
    }
  };


  const remove = async () => {
    if (!confirm('¿Borrar este proveedor?')) return;
    await updateSupplier(id, { deleted: true });
    back();
  };

  const title = s.company || s.company_zh || 'Sin clasificar';
  const paths = s.photos.map((p) => p.path);

  return (
    <>
      <NavBar back="Atrás" title={title} />
      <h1 className={`large-title small ${s.company || s.company_zh ? '' : 'muted'}`}>{title}</h1>
      <p className="subtitle">
        {s.event} {s.agreement.trim() && <span className="seal">Pactado</span>}
      </p>

      <div className="strip">
        {s.photos.map((p, i) => (
          <PhotoImg key={p.path} path={p.path} thumb className="strip-img" onClick={() => openViewer(paths, i)} />
        ))}
        {Array.from({ length: adding }, (_, i) => (
          <div key={`a${i}`} className="strip-img ph-empty loading" />
        ))}
        <button className="strip-add" onClick={() => cam.current?.click()} aria-label="Hacer foto">
          <Camera size={24} />
        </button>
        <button className="strip-add" onClick={() => gal.current?.click()} aria-label="Galería">
          <Images size={24} />
        </button>
      </div>
      <input ref={cam} className="vh" type="file" accept="image/*" capture="environment" onChange={(e) => addFiles(e.currentTarget)} />
      <input ref={gal} className="vh" type="file" accept="image/*" multiple onChange={(e) => addFiles(e.currentTarget)} />

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
          {f('price', 'Precio')}
          {f('moq', 'MOQ')}
          {f('incoterm', 'Incoterm')}
          {f('lead_time', 'Plazo')}
          {f('samples', 'Muestras')}
        </div>
      </div>

      <div className="group">
        <div className="group-title">Contacto</div>
        <div className="list">
          {f('company', 'Empresa')}
          {f('company_zh', 'Empresa (中文)')}
          {f('contact', 'Persona')}
          {f('role', 'Cargo')}
          {f('wechat', 'WeChat', { action: copyBtn(s.wechat) })}
          {f('phone', 'Teléfono', { type: 'tel', action: copyBtn(s.phone) })}
          {f('email', 'Email', { type: 'email', inputMode: 'email', action: copyBtn(s.email) })}
          {f('web', 'Web', { type: 'url' })}
          {f('booth', 'Stand')}
          {f('city', 'Ciudad')}
          <label className="row">
            <span className="grow">Tipo</span>
            <select className="select" value={s.kind} onChange={(e) => set({ kind: e.target.value })}>
              <option value="">—</option>
              <option value="fábrica">Fábrica</option>
              <option value="trading">Trading</option>
            </select>
          </label>
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
          <Trash2 size={18} /> Borrar proveedor
        </button>
      </div>
    </>
  );
}
