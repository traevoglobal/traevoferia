import { useEffect, useRef, useState } from 'react';
import { Camera, ChevronDown, Images, Link2, Trash2, X } from 'lucide-react';
import { db } from '../lib/db';
import type { Draft, DraftPhoto, SupplierExtra } from '../lib/types';
import { compressPhoto, useBlobUrl } from '../lib/photos';
import { CONFIG, currentEvent, TEAM } from '../lib/content';
import { saveCapture, spawnLinked } from '../lib/store';
import { changeWithLocks, discardOf, draftHasContent, getOfDraft, splitPatch, viaDef, viaSwitchPatch } from '../lib/ficha';
import { HALL, LAST_PROJECTS, LAST_SECTOR, LAST_VIA, RECENT_PROJECTS, rememberProjects } from '../lib/prefs';
import { toast } from '../lib/toast';
import { uuid } from '../lib/util';
import { AutoTextarea, ProjectChips, Sheet } from '../components/ui';
import { CameraView } from '../components/Camera';
import { AudioClip, AudioRecorder } from '../components/Audio';
import { SectorChips, ViaFields, ViaPicker } from '../components/Fields';

function Thumb({ p, label, selected, onSelect, onRemove }: { p: DraftPhoto; label?: string; selected: boolean; onSelect: () => void; onRemove: () => void }) {
  const url = useBlobUrl(p.thumb);
  return (
    <div className={`cap-thumb ${selected ? 'on' : ''}`} onClick={onSelect}>
      {url && <img src={url} alt="" />}
      {label && <span className="cap-kind">{label}</span>}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        aria-label="Quitar"
      >
        <X size={14} strokeWidth={3} />
      </button>
    </div>
  );
}

/** Borrador nuevo: hereda pabellón, última vía, su último sector y los últimos proyectos. */
function newDraft(project?: string, tag?: string): Draft {
  const via = CONFIG?.vias.some((v) => v.id === LAST_VIA.get()) ? LAST_VIA.get() : '';
  const extra: SupplierExtra = { hall: HALL.get() };
  if (via) Object.assign(extra, { via, sector: LAST_SECTOR.get()[via] ?? '' });
  return {
    id: 'current',
    photos: [],
    note: '',
    project_ids: project ? [project] : LAST_PROJECTS.get(),
    event: currentEvent(),
    tags: tag ? [tag] : [],
    audios: [],
    fields: {},
    extra,
  };
}

export function CaptureSheet({ project, tag, onClose }: { project?: string; tag?: string; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(0);
  const [saving, setSaving] = useState(false);
  const [camera, setCamera] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const ref = useRef<Draft | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Tipos elegidos para fotos que aún se están comprimiendo. */
  const pendingKind = useRef<Record<string, string>>({});
  const nat = useRef<HTMLInputElement>(null);
  const gal = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      const d = await db.drafts.get('current');
      const has = !!d && draftHasContent(d);
      ref.current = has ? d! : newDraft(project, tag);
      setDraft(ref.current);
      if (!has) setCamera(true); // en el stand se empieza por la foto (badge de WeChat, placa…)
    })();
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        if (ref.current) void db.drafts.put(ref.current);
      }
    };
  }, [project, tag]);

  /** Cambia el borrador; se guarda al momento o, al teclear, con 300 ms de espera. */
  const update = (fn: (d: Draft) => Draft, persist: 'now' | 'later' = 'now') => {
    if (!ref.current) return;
    const next = fn(ref.current);
    ref.current = next;
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (persist === 'now') void db.drafts.put(next);
    else
      timer.current = setTimeout(() => {
        timer.current = null;
        if (ref.current) void db.drafts.put(ref.current);
      }, 300);
  };

  const applyPatch = (patch: Record<string, string>, persist: 'now' | 'later' = 'now') => {
    const { fields, extra } = splitPatch(patch);
    update((d) => ({ ...d, fields: { ...d.fields, ...fields }, extra: { ...d.extra, ...extra } }), persist);
  };

  /** Comprime y añade fotos en orden; devuelve sus ids desde ya. */
  const addBlobs = (blobs: Blob[]): string[] => {
    setBusy((b) => b + blobs.length);
    return blobs.map((f) => {
      const id = uuid();
      chain.current = chain.current.then(async () => {
        try {
          const { blob, thumb } = await compressPhoto(f);
          const kind = pendingKind.current[id] || undefined;
          delete pendingKind.current[id];
          update((d) => ({ ...d, photos: [...d.photos, { id, blob, thumb, kind }] }));
        } catch {
          toast('No se pudo leer una foto');
        } finally {
          setBusy((b) => b - 1);
        }
      });
      return id;
    });
  };
  const addFiles = (input: HTMLInputElement) => {
    const files = [...(input.files ?? [])];
    input.value = '';
    addBlobs(files);
  };
  const setKind = (id: string, kind: string) => {
    if (!ref.current?.photos.some((p) => p.id === id)) pendingKind.current[id] = kind;
    else update((d) => ({ ...d, photos: d.photos.map((p) => (p.id === id ? { ...p, kind } : p)) }));
  };
  const removePhoto = (id: string) => update((d) => ({ ...d, photos: d.photos.filter((p) => p.id !== id) }));

  const vias = CONFIG?.vias ?? [];
  const get = draft ? getOfDraft(draft) : () => '';
  const via = viaDef(get('via'));
  const kinds = CONFIG?.photoKinds ?? [];
  const kindLabel = (k?: string) => kinds.find(([v]) => v === k)?.[1];
  const selected = draft?.photos.find((p) => p.id === sel) ?? draft?.photos[draft.photos.length - 1];
  const discard = draft ? discardOf(get) : null;
  const spawn = via?.spawn;
  const spawnOn = get('_spawn') === '1';
  const canSave = !!draft && (draftHasContent(draft) || busy > 0) && !saving;

  const setVia = (id: string) => applyPatch(viaSwitchPatch(get, id, LAST_SECTOR.get()[id] ?? ''));
  const setField = (key: string, value: string, persist: 'now' | 'later' = 'now') => applyPatch(changeWithLocks(get, key, value), persist);

  const save = async () => {
    if (!canSave) return;
    if (vias.length && !get('via')) return toast('Elige la vía');
    setSaving(true);
    try {
      await chain.current;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      const d = ref.current!;
      if (!draftHasContent(d)) return;
      const { _spawn, ...extra } = d.extra ?? {};
      const id = await saveCapture({ ...d, extra });
      ref.current = null;
      if (extra.via) {
        LAST_VIA.set(extra.via);
        if (typeof extra.sector === 'string') LAST_SECTOR.set({ ...LAST_SECTOR.get(), [extra.via]: extra.sector });
      }
      rememberProjects(d.project_ids);
      if (_spawn === '1' && spawn) await spawnLinked(id, spawn.via, spawn.owner);
      toast('Guardado ✓');
      onClose();
    } catch (e) {
      toast(`Error al guardar: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const discardDraft = async () => {
    if (!confirm('¿Descartar esta captura?')) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    await db.drafts.delete('current');
    ref.current = null;
    onClose();
  };

  const hall = get('hall');
  const owner = spawn && TEAM.find((t) => t.slug === spawn.owner)?.name;
  return (
    <Sheet
      tall
      title={`Captar${hall ? ` · ${hall}` : ''}`}
      onClose={onClose}
      left={<button className="link" onClick={onClose}>Cerrar</button>}
      foot={
        <button className="btn primary" disabled={!canSave} onClick={save}>
          {busy > 0 ? 'Procesando fotos…' : saving ? 'Guardando…' : 'Guardar'}
        </button>
      }
    >
      {draft && (
        <>
          <ViaPicker big value={get('via')} onChange={setVia} />
          {discard && <div className={`ficha-banner ${discard.tone}`}>Descartada: {discard.label}</div>}

          <div className="cap-row">
            <button className="cap-big" onClick={() => setCamera(true)}>
              <Camera size={32} />
              Cámara
            </button>
            <button className="cap-gal" onClick={() => gal.current?.click()}>
              <Images size={26} />
              Galería
            </button>
          </div>
          <input ref={nat} className="vh" type="file" accept="image/*" capture="environment" onChange={(e) => addFiles(e.currentTarget)} />
          <input ref={gal} className="vh" type="file" accept="image/*" multiple onChange={(e) => addFiles(e.currentTarget)} />

          {(draft.photos.length > 0 || busy > 0) && (
            <>
              <div className="cap-thumbs">
                {draft.photos.map((p) => (
                  <Thumb key={p.id} p={p} label={kindLabel(p.kind)} selected={p.id === selected?.id} onSelect={() => setSel(p.id)} onRemove={() => removePhoto(p.id)} />
                ))}
                {Array.from({ length: busy }, (_, i) => (
                  <div key={`b${i}`} className="cap-thumb loading" />
                ))}
              </div>
              {selected && kinds.length > 0 && (
                <div className="chips row">
                  {kinds.map(([v, l]) => (
                    <button key={v} className={`chip ${selected.kind === v ? 'on' : ''}`} onClick={() => setKind(selected.id, selected.kind === v ? '' : v)}>
                      {l}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="cap-id">
            <input
              className="cap-stand"
              value={get('booth')}
              placeholder="Stand"
              maxLength={6}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              onChange={(e) => setField('booth', e.target.value.toUpperCase(), 'later')}
            />
            <input
              className="cap-company"
              value={get('company')}
              placeholder="Empresa (dicta con el micro)"
              enterKeyHint="done"
              onChange={(e) => setField('company', e.target.value, 'later')}
            />
          </div>

          {via && (
            <div className="qf-box">
              {via.sectors.length > 0 && <SectorChips via={via} value={get('sector')} onChange={(v) => setField('sector', v)} />}
              <ViaFields fields={via.fields.filter((f) => !f.more)} get={get} onChange={(k, v) => setField(k, v, 'later')} />
              {via.fields.some((f) => f.more) && (
                <>
                  <button className="link qf-more" onClick={() => setMore(!more)}>
                    Más <ChevronDown size={16} className={more ? 'flip' : ''} />
                  </button>
                  {more && <ViaFields fields={via.fields.filter((f) => f.more)} get={get} onChange={(k, v) => setField(k, v, 'later')} />}
                </>
              )}
              {spawn && (
                <button className={`chip spawn ${spawnOn ? 'on' : ''}`} onClick={() => setField('_spawn', spawnOn ? '' : '1')}>
                  <Link2 size={15} /> {spawn.label}
                  {owner ? ` → ${owner}` : ''}
                </button>
              )}
            </div>
          )}

          <div className="pad">
            <AudioRecorder onDone={(blob, secs) => update((d) => ({ ...d, audios: [...(d.audios ?? []), { id: uuid(), blob, secs }] }))} />
            {(draft.audios?.length ?? 0) > 0 && (
              <div className="clips">
                {draft.audios!.map((a) => (
                  <AudioClip key={a.id} blob={a.blob} secs={a.secs} onRemove={() => update((d) => ({ ...d, audios: d.audios?.filter((x) => x.id !== a.id) }))} />
                ))}
              </div>
            )}
          </div>

          <div className="group">
            <div className="list">
              <div className="field">
                <AutoTextarea
                  className="cap-note"
                  value={draft.note}
                  placeholder="Nota: lo hablado, precio, quién es…"
                  onChange={(e) => {
                    const v = e.target.value;
                    update((d) => ({ ...d, note: v }), 'later');
                  }}
                />
              </div>
            </div>
          </div>

          <div className="group">
            <div className="group-title">Proyectos</div>
            <ProjectChips row order={RECENT_PROJECTS.get()} value={draft.project_ids} onChange={(v) => update((d) => ({ ...d, project_ids: v }))} />
          </div>

          {(draft.tags?.length ?? 0) > 0 && (
            <div className="group">
              <div className="list">
                {draft.tags!.map((t) => (
                  <div className="row" key={t}>
                    <span className="grow">Franja</span>
                    <span className="muted ellipsis">{t}</span>
                    <button className="icon-btn tiny" onClick={() => update((d) => ({ ...d, tags: d.tags?.filter((x) => x !== t) }))} aria-label="Quitar franja">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {draftHasContent(draft) && (
            <div className="pad">
              <button className="btn plain danger" onClick={discardDraft}>
                <Trash2 size={18} /> Descartar captura
              </button>
            </div>
          )}

          {camera && (
            <CameraView
              photos={draft.photos}
              busy={busy}
              kinds={kinds}
              onShot={(b) => addBlobs([b])[0]}
              onRemove={removePhoto}
              onKind={setKind}
              onClose={() => setCamera(false)}
              onFallback={() => {
                setCamera(false);
                nat.current?.click();
              }}
            />
          )}
        </>
      )}
    </Sheet>
  );
}

