import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Camera, Check, ChevronDown, Image as ImageIcon, Mic, Plus, Search, Share, Trash2, Upload, X } from 'lucide-react';
import { useApp } from '../ctx';
import { db } from '../lib/db';
import { LINEA_NOMBRE, LINEAS, PROYECTO_BY_ID, PROYECTOS, lineaDe, proyectoLabel } from '../lib/content';
import { MOTIVOS, SEMAFORO, cambioMotivo, cambioSemaforo, letraDe, motivoDe } from '../lib/semaforo';
import { addPhoto, deleteFicha, editFicha, removeAudio, removePhoto, updateFicha, type FichaBase } from '../lib/store';
import { exportAll, importBackup } from '../lib/backup';
import { toast } from '../lib/toast';
import type { Linea, LocalSupplier, Supplier } from '../lib/types';
import { diaLabel, fmtTime, localDate, norm, useLive } from '../lib/util';
import { AutoTextarea, Avatar, Empty, NavBar, PhotoImg, Sheet, SyncPill } from '../components/ui';
import { CameraView } from '../components/Camera';
import { AudioClip, AudioRecorder } from '../components/Audio';

const OTRA = 'otra';
/** Proyecto elegido en la ficha: id, "otra" o "". */
const proyectoDe = (s: Pick<Supplier, 'project_ids' | 'extra'>) => s.project_ids[0] ?? (s.extra.otra !== undefined ? OTRA : '');

/* ---------- Listado ---------- */

const SEM_OPTIONS: [string, string][] = [...SEMAFORO.map((x): [string, string] => [x.letra, `${x.letra} · ${x.label}`]), ['0', 'Sin semáforo']];

/** Texto en el que busca el listado: stand, datos duros, nota, proyecto, campos clave y semáforo. */
const searchText = (s: LocalSupplier) =>
  norm(
    [
      s.booth, s.booth.replace(/\s/g, ''), s.company, s.contact, s.wechat, s.note, proyectoLabel(s.project_ids, s.extra.otra),
      ...Object.values(s.extra.campos ?? {}), letraDe(s.rating), motivoDe(s.tags),
    ].join(' '),
  );

function SelectChip({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  const cur = options.find(([v]) => v === value);
  return (
    <label className={`chip ${value ? 'on' : ''}`}>
      <span className="ellipsis">{cur ? cur[1] : label}</span>
      <ChevronDown size={16} />
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
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

const Row = memo(function Row({ s, onOpen }: { s: LocalSupplier; onOpen: (id: string) => void }) {
  const stand = s.booth.trim().toUpperCase();
  const audios = s.extra.audios?.length ?? 0;
  const letra = letraDe(s.rating);
  const lin = lineaDe(s);
  return (
    <div className="row tap srow" onClick={() => onOpen(s.id)}>
      <PhotoImg path={s.photos[0]?.path} thumb className="thumb" />
      <div className="srow-main">
        <div className="srow-head">
          {letra && <span className={`sem-pill sem-${letra}`}>{letra}</span>}
          <span className={`srow-stand ${stand ? '' : 'missing'}`}>{stand || 'SIN STAND'}</span>
        </div>
        <div className="srow-title">{s.company || <span className="muted">Sin empresa</span>}</div>
        <div className="srow-sub">
          {lin && <i className={`dot ${lin}`} />} {proyectoLabel(s.project_ids, s.extra.otra) || (lin ? LINEA_NOMBRE[lin] : 'Sin línea')}
        </div>
        <div className="srow-meta">
          <Avatar id={s.created_by} size={18} />
          <span>{fmtTime(s.created_at)}</span>
          {s.photos.length > 0 && (
            <span className="srow-ic">
              <ImageIcon size={13} /> {s.photos.length}
            </span>
          )}
          {audios > 0 && (
            <span className="srow-ic">
              <Mic size={13} /> {audios}
            </span>
          )}
          {s._dirty === 1 && <span className="srow-pend">sin subir</span>}
        </div>
      </div>
    </div>
  );
});

export function Proveedores() {
  const { openFicha } = useApp();
  const all = useLive(() => db.suppliers.toArray(), [], []);
  const [q, setQ] = useState('');
  const [proy, setProy] = useState('');
  const [dia, setDia] = useState('');
  const [linea, setLinea] = useState('');
  const [sem, setSem] = useState('');
  const file = useRef<HTMLInputElement>(null);

  const live = useMemo(() => all.filter((s) => !s.deleted).sort((a, b) => b.created_at.localeCompare(a.created_at)), [all]);
  const dias = useMemo(() => [...new Set(live.map((s) => localDate(s.created_at)))].sort(), [live]);
  const shown = useMemo(() => {
    const nq = norm(q);
    return live.filter(
      (s) =>
        (!proy || proyectoDe(s) === proy) &&
        (!linea || lineaDe(s) === linea) &&
        (!sem || (letraDe(s.rating) || '0') === sem) &&
        (!dia || localDate(s.created_at) === dia) &&
        (!nq || searchText(s).includes(nq)),
    );
  }, [live, q, proy, linea, sem, dia]);

  const proyOptions: [string, string][] = [...PROYECTOS.map((p): [string, string] => [p.id, p.nombre_es || p.nombre_zh]), [OTRA, 'Otra oportunidad']];

  const doImport = async (input: HTMLInputElement) => {
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    try {
      const r = await importBackup(f);
      toast(`Importado: ${r.nuevas} nuevas, ${r.actualizadas} actualizadas, ${r.iguales} sin cambios`);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const open = (id: string) => openFicha({ id });

  return (
    <>
      <NavBar
        center={<SyncPill />}
        right={
          <button className="icon-btn" onClick={() => exportAll().catch((e: Error) => toast(e.message))} aria-label="Exportar CSV">
            <Share size={24} />
          </button>
        }
      />
      <h1 className="large-title">Proveedores</h1>
      <p className="subtitle">
        {shown.length === live.length ? (live.length === 1 ? '1 ficha' : `${live.length} fichas`) : `${shown.length} de ${live.length}`}
      </p>

      <label className="search">
        <Search size={18} />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Stand, empresa, WeChat, nota…" />
        {q && (
          <button className="icon-btn" onClick={() => setQ('')} aria-label="Borrar búsqueda">
            <X size={18} />
          </button>
        )}
      </label>

      <div className="chips">
        <SelectChip label="Semáforo" value={sem} options={SEM_OPTIONS} onChange={setSem} />
        <SelectChip label="Línea" value={linea} options={LINEAS.map((l): [string, string] => [l, LINEA_NOMBRE[l]])} onChange={setLinea} />
        <SelectChip label="Proyecto" value={proy} options={proyOptions} onChange={setProy} />
        <button className={`chip ${dia ? '' : 'on'}`} onClick={() => setDia('')}>
          Todos los días
        </button>
        {dias.map((d) => (
          <button key={d} className={`chip ${dia === d ? 'on' : ''}`} onClick={() => setDia(dia === d ? '' : d)}>
            {diaLabel(d)}
          </button>
        ))}
      </div>

      <div className="group">
        {shown.length ? (
          <div className="list">
            {shown.map((s) => (
              <Row key={s.id} s={s} onOpen={open} />
            ))}
          </div>
        ) : (
          <Empty>{live.length ? 'Nada con estos filtros.' : 'Aún no hay proveedores. Pulsa + para el primero.'}</Empty>
        )}
      </div>

      <div className="pad">
        <button className="btn secondary" onClick={() => exportAll().catch((e: Error) => toast(e.message))}>
          <Share size={20} /> Exportar CSV de todo
        </button>
        <button className="btn plain" onClick={() => file.current?.click()}>
          <Upload size={18} /> Importar el JSON del otro móvil
        </button>
      </div>
      <input ref={file} className="vh" type="file" accept="application/json,.json" onChange={(e) => void doImport(e.currentTarget)} />

      <button className="fab" onClick={() => openFicha()} aria-label="Nuevo proveedor">
        <Plus size={34} strokeWidth={2.6} />
      </button>
    </>
  );
}

/* ---------- Ficha (autoguardado a cada tecla) ---------- */

/** Campo de texto que escribe en el móvil a cada tecla. Mientras se escribe, manda lo tecleado (no lo que vuelve de la base). */
function AutoField({
  label, value, onChange, multiline, placeholder, inputMode, className, autoFocus, children,
}: {
  label: string; value: string; onChange: (v: string) => void; multiline?: boolean; placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']; className?: string; autoFocus?: boolean; children?: ReactNode;
}) {
  const [v, setV] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setV(value);
  }, [value]);
  const common = {
    value: v,
    placeholder,
    autoFocus,
    onFocus: () => (focused.current = true),
    onBlur: () => (focused.current = false),
  };
  const change = (x: string) => {
    setV(x);
    onChange(x);
  };
  return (
    <label className={`ff ${className ?? ''}`}>
      <span className="ff-label">{label}</span>
      {multiline ? (
        <AutoTextarea {...common} onChange={(e) => change(e.target.value)} />
      ) : (
        <input {...common} inputMode={inputMode} autoComplete="off" autoCorrect="off" onChange={(e) => change(e.target.value)} />
      )}
      {children}
    </label>
  );
}

export function FichaSheet({ id, proyecto, onClose }: { id: string; proyecto?: string; onClose: () => void }) {
  const { openViewer } = useApp();
  // undefined mientras carga; null si la ficha aún no existe.
  const loaded = useLive(async () => (await db.suppliers.get(id)) ?? null, [id], undefined);
  const rec = loaded ?? undefined;
  const base: FichaBase =
    proyecto === OTRA ? { project_ids: [], otra: '' } : { project_ids: proyecto ? [proyecto] : [], linea: PROYECTO_BY_ID.get(proyecto ?? '')?.linea };
  // Hasta el primer cambio la ficha no existe: se muestra con lo que llevará (el proyecto precargado).
  const s: Pick<Supplier, 'booth' | 'company' | 'contact' | 'wechat' | 'note' | 'photos' | 'project_ids' | 'extra' | 'rating' | 'tags'> = rec ?? {
    booth: '', company: '', contact: '', wechat: '', note: '', photos: [], project_ids: base.project_ids, rating: 0, tags: [],
    extra: { ...(base.otra !== undefined ? { otra: base.otra } : {}), ...(base.linea ? { linea: base.linea } : {}) },
  };
  const exists = !!rec && !rec.deleted;
  const sel = proyectoDe(s);
  const p = PROYECTO_BY_ID.get(sel);
  const lin = lineaDe(s);
  // Estado de subida de los audios grabados en este móvil (los del otro móvil ya están en Supabase).
  const media = useLive(async () => new Map((await db.photos.where('supplier_id').equals(id).toArray()).map((x) => [x.path, x.uploaded])), [id], new Map<string, 0 | 1>());

  const [cam, setCam] = useState(false);
  const [shots, setShots] = useState<string[]>([]);
  const [busy, setBusy] = useState(0);
  const nat = useRef<HTMLInputElement>(null);
  const gal = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<Supplier>) => void updateFicha(id, base, patch);
  const setCampo = (k: string, v: string) => void editFicha(id, base, (c) => ({ extra: { ...c.extra, campos: { ...c.extra.campos, [k]: v } } }));
  const togglePregunta = (qid: string) =>
    void editFicha(id, base, (c) => ({ extra: { ...c.extra, preguntas: { ...c.extra.preguntas, [qid]: !c.extra.preguntas?.[qid] } } }));
  const pick = (v: string) =>
    void editFicha(id, base, (c) => {
      const extra = { ...c.extra };
      if (v === OTRA) extra.otra = extra.otra ?? '';
      else delete extra.otra;
      const pl = PROYECTO_BY_ID.get(v)?.linea;
      if (pl) extra.linea = pl;
      return { project_ids: v && v !== OTRA ? [v] : [], extra };
    });
  /** Elegir línea; si el proyecto elegido es de otra línea, se quita. Tocar la activa la quita (y su proyecto). */
  const pickLinea = (l: Linea) =>
    void editFicha(id, base, (c) => {
      const extra = { ...c.extra };
      if (lineaDe(c) === l) {
        delete extra.linea;
        return { extra, project_ids: [] };
      }
      extra.linea = l;
      const keep = PROYECTO_BY_ID.get(c.project_ids[0] ?? '')?.linea === l;
      return { extra, project_ids: keep ? c.project_ids : [] };
    });
  const removeClip = (path: string) => {
    if (confirm('¿Quitar esta nota de voz de la ficha?')) void removeAudio(id, path);
  };

  const addBlob = async (b: Blob, fromCam: boolean) => {
    setBusy((n) => n + 1);
    try {
      const path = await addPhoto(id, base, b);
      if (fromCam) setShots((x) => [...x, path]);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy((n) => n - 1);
    }
  };
  const addFiles = async (input: HTMLInputElement) => {
    const files = [...(input.files ?? [])];
    input.value = '';
    for (const f of files) await addBlob(f, false);
  };

  const close = () => {
    if (exists && !rec.booth.trim()) toast('Guardada, pero falta el número de stand');
    onClose();
  };

  const remove = () => {
    if (!confirm('¿Borrar esta ficha?')) return;
    void deleteFicha(id);
    onClose();
  };

  const missingStand = exists && !s.booth.trim();
  const preguntas = p?.preguntas ?? [];

  if (loaded === undefined) return null;

  return (
    <Sheet
      tall
      onClose={close}
      title={exists ? 'Proveedor' : 'Nuevo proveedor'}
      right={
        <button className="link bold" onClick={close}>
          Cerrar
        </button>
      }
    >
      <p className="autosave">{exists ? <><Check size={14} /> Guardado en el móvil</> : 'Se guarda solo al escribir'}</p>

      <div className="group">
        <AutoField
          label="Stand *"
          className={`ff-stand ${missingStand ? 'bad' : ''}`}
          value={s.booth}
          onChange={(v) => set({ booth: v })}
          placeholder="21.2D12 · o ONLINE-TRV-LED-01"
          autoFocus={loaded === null}
        />
        <div className="sem-row">
          {SEMAFORO.map((x) => (
            <button key={x.letra} className={`sem-btn sem-${x.letra} ${s.rating === x.rating ? 'on' : ''}`} onClick={() => void editFicha(id, base, (c) => cambioSemaforo(c, x.rating))}>
              <b>{x.letra}</b> · {x.label}
            </button>
          ))}
        </div>
        {s.rating === 1 && (
          <div className="chips wrap motivos">
            {MOTIVOS.map((m) => (
              <button key={m} className={`chip ${motivoDe(s.tags) === m ? 'on' : ''}`} onClick={() => void editFicha(id, base, (c) => cambioMotivo(c, m))}>
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="group">
        <div className="group-title">Línea</div>
        <div className="lin-row">
          {LINEAS.map((l) => (
            <button key={l} className={`lin-btn ${l} ${lin === l ? 'on' : ''}`} onClick={() => pickLinea(l)}>
              {LINEA_NOMBRE[l].replace('TRAEVO ', '')}
            </button>
          ))}
        </div>
      </div>

      <div className="group">
        <div className="group-title">Proyecto</div>
        <div className="chips wrap">
          {PROYECTOS.filter((x) => !lin || x.linea === lin).map((x) => (
            <button key={x.id} className={`chip ${sel === x.id ? 'on' : ''}`} onClick={() => pick(sel === x.id ? '' : x.id)}>
              <i className={`dot ${x.linea}`} />
              {x.nombre_es || x.nombre_zh}
            </button>
          ))}
          <button className={`chip ${sel === OTRA ? 'on' : ''}`} onClick={() => pick(sel === OTRA ? '' : OTRA)}>
            Otra oportunidad
          </button>
        </div>
        {sel === OTRA && (
          <div className="list mt">
            <AutoField label="¿Qué oportunidad?" value={s.extra.otra ?? ''} onChange={(v) => void updateExtraOtra(id, base, v)} placeholder="Descríbela en una línea" />
          </div>
        )}
      </div>

      <div className="group">
        <div className="list">
          <AutoField label="Empresa" value={s.company} onChange={(v) => set({ company: v })} />
          <AutoField label="Contacto" value={s.contact} onChange={(v) => set({ contact: v })} />
          <AutoField label="WeChat" value={s.wechat} onChange={(v) => set({ wechat: v })} />
          {p?.campos_clave.map((k) => (
            <AutoField key={k} label={k} value={s.extra.campos?.[k] ?? ''} onChange={(v) => setCampo(k, v)} />
          ))}
        </div>
      </div>

      {preguntas.length > 0 && (
        <div className="group">
          <div className="group-title">Preguntas · {preguntas.filter((x) => s.extra.preguntas?.[x.id]).length}/{preguntas.length}</div>
          <div className="list">
            {preguntas.map((x) => {
              const on = !!s.extra.preguntas?.[x.id];
              return (
                <button key={x.id} className={`row check-row ${on ? 'on' : ''}`} onClick={() => togglePregunta(x.id)}>
                  <span className={`tick ${on ? 'on' : ''}`}>{on && <Check size={18} strokeWidth={3} />}</span>
                  <span className="grow">
                    <span className="q-es">{x.es}</span>
                    {x.zh && (
                      <span className="q-zh" lang="zh-CN">
                        {x.zh}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="group">
        <div className="list">
          <AutoField label="Nota" multiline value={s.note} onChange={(v) => set({ note: v })} className="ff-note" />
        </div>
      </div>

      <div className="group">
        <div className="btn-row">
          <button className="btn primary" onClick={() => setCam(true)}>
            <Camera size={22} /> Foto
          </button>
          <button className="btn secondary" onClick={() => gal.current?.click()}>
            <ImageIcon size={22} /> Galería
          </button>
        </div>
        {(s.photos.length > 0 || busy > 0) && (
          <div className="strip">
            {s.photos.map((ph, i) => (
              <div key={ph.path} className="strip-item">
                <PhotoImg path={ph.path} thumb className="strip-img" onClick={() => openViewer(s.photos.map((x) => x.path), i)} />
                <button className="strip-del" onClick={() => void removePhoto(id, ph.path)} aria-label="Quitar foto">
                  <X size={14} strokeWidth={3} />
                </button>
              </div>
            ))}
            {Array.from({ length: busy }, (_, i) => (
              <div key={`b${i}`} className="strip-img loading ph-empty" />
            ))}
          </div>
        )}
        <input ref={nat} className="vh" type="file" accept="image/*" capture="environment" onChange={(e) => void addFiles(e.currentTarget)} />
        <input ref={gal} className="vh" type="file" accept="image/*" multiple onChange={(e) => void addFiles(e.currentTarget)} />
      </div>

      <div className="group">
        <AudioRecorder ficha={id} base={base} />
        {(s.extra.audios?.length ?? 0) > 0 && (
          <div className="clips">
            {s.extra.audios!.map((a) => (
              <span key={a.path} className="clip-wrap">
                <AudioClip path={a.path} secs={a.secs} onRemove={() => removeClip(a.path)} />
                <small className={media.get(a.path) === 0 ? 'clip-st pend' : 'clip-st ok'}>
                  {media.get(a.path) === 0 ? 'En el móvil · se sube con red' : 'Subido'}
                </small>
              </span>
            ))}
          </div>
        )}
      </div>

      {exists && (
        <div className="pad">
          <button className="btn plain danger" onClick={remove}>
            <Trash2 size={18} /> Borrar ficha
          </button>
        </div>
      )}

      {cam && (
        <CameraView
          shots={shots}
          busy={busy}
          onShot={(b) => void addBlob(b, true)}
          onRemove={(path) => {
            setShots((x) => x.filter((y) => y !== path));
            void removePhoto(id, path);
          }}
          onClose={() => {
            setCam(false);
            setShots([]);
          }}
          onFallback={() => {
            setCam(false);
            nat.current?.click();
          }}
        />
      )}
    </Sheet>
  );
}

const updateExtraOtra = (id: string, base: FichaBase, v: string) => editFicha(id, base, (c) => ({ extra: { ...c.extra, otra: v } }));
