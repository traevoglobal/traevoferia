import { useEffect, useRef, useState } from 'react';
import { Camera, Images, X, Trash2 } from 'lucide-react';
import { db } from '../lib/db';
import type { Draft, DraftPhoto } from '../lib/types';
import { compressPhoto, useBlobUrl } from '../lib/photos';
import { currentEvent, EVENTS } from '../lib/content';
import { saveCapture } from '../lib/store';
import { toast } from '../lib/toast';
import { uuid } from '../lib/util';
import { AutoTextarea, ProjectChips, Sheet } from '../components/ui';

function Thumb({ p, onRemove }: { p: DraftPhoto; onRemove: () => void }) {
  const url = useBlobUrl(p.thumb);
  return (
    <div className="cap-thumb">
      {url && <img src={url} alt="" />}
      <button onClick={onRemove} aria-label="Quitar">
        <X size={14} strokeWidth={3} />
      </button>
    </div>
  );
}

export function CaptureSheet({ project, onClose }: { project?: string; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(0);
  const [saving, setSaving] = useState(false);
  const ref = useRef<Draft | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cam = useRef<HTMLInputElement>(null);
  const gal = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      const d = await db.drafts.get('current');
      const has = !!d && (d.photos.length > 0 || d.note.trim() !== '');
      const base: Draft = has
        ? d!
        : { id: 'current', photos: [], note: '', project_ids: project ? [project] : [], event: currentEvent() };
      ref.current = base;
      setDraft(base);
    })();
    return () => {
      if (noteTimer.current) {
        clearTimeout(noteTimer.current);
        if (ref.current) void db.drafts.put(ref.current);
      }
    };
  }, [project]);

  const update = (fn: (d: Draft) => Draft, persist: 'now' | 'later' = 'now') => {
    if (!ref.current) return;
    const next = fn(ref.current);
    ref.current = next;
    setDraft(next);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = null;
    if (persist === 'now') void db.drafts.put(next);
    else
      noteTimer.current = setTimeout(() => {
        noteTimer.current = null;
        if (ref.current) void db.drafts.put(ref.current);
      }, 400);
  };

  const addFiles = (input: HTMLInputElement) => {
    const files = [...(input.files ?? [])];
    input.value = '';
    if (!files.length) return;
    setBusy((b) => b + files.length);
    for (const f of files) {
      chain.current = chain.current.then(async () => {
        try {
          const { blob, thumb } = await compressPhoto(f);
          update((d) => ({ ...d, photos: [...d.photos, { id: uuid(), blob, thumb }] }));
        } catch {
          toast('No se pudo leer una foto');
        } finally {
          setBusy((b) => b - 1);
        }
      });
    }
  };

  const hasContent = !!draft && (draft.photos.length > 0 || draft.note.trim() !== '');
  const canSave = (hasContent || busy > 0) && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await chain.current;
      if (noteTimer.current) clearTimeout(noteTimer.current);
      noteTimer.current = null;
      const d = ref.current!;
      if (!d.photos.length && !d.note.trim()) return;
      await saveCapture(d);
      ref.current = null;
      toast('Guardado ✓');
      onClose();
    } catch (e) {
      toast(`Error al guardar: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const discard = async () => {
    if (!confirm('¿Descartar esta captura?')) return;
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = null;
    await db.drafts.delete('current');
    ref.current = null;
    onClose();
  };

  return (
    <Sheet
      tall
      title="Captar"
      left={<button className="link" onClick={onClose}>Cerrar</button>}
      right={<button className="link bold" disabled={!canSave} onClick={save}>Guardar</button>}
    >
      {draft && (
        <>
          <div className="cap-row">
            <button className="cap-big" onClick={() => cam.current?.click()}>
              <Camera size={36} />
              Foto
            </button>
            <button className="cap-gal" onClick={() => gal.current?.click()}>
              <Images size={26} />
              Galería
            </button>
          </div>
          <input ref={cam} className="vh" type="file" accept="image/*" capture="environment" onChange={(e) => addFiles(e.currentTarget)} />
          <input ref={gal} className="vh" type="file" accept="image/*" multiple onChange={(e) => addFiles(e.currentTarget)} />

          {(draft.photos.length > 0 || busy > 0) && (
            <div className="cap-thumbs">
              {draft.photos.map((p) => (
                <Thumb key={p.id} p={p} onRemove={() => update((d) => ({ ...d, photos: d.photos.filter((x) => x.id !== p.id) }))} />
              ))}
              {Array.from({ length: busy }, (_, i) => (
                <div key={`b${i}`} className="cap-thumb loading" />
              ))}
            </div>
          )}

          <div className="group">
            <div className="list">
              <div className="field">
                <AutoTextarea
                  className="cap-note"
                  value={draft.note}
                  placeholder="Nota: precio, MOQ, lo hablado… (dicta con el micro del teclado)"
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
            <ProjectChips value={draft.project_ids} onChange={(v) => update((d) => ({ ...d, project_ids: v }))} />
          </div>

          <div className="group">
            <div className="list">
              <label className="row">
                <span className="grow">Feria</span>
                <select className="select" value={draft.event} onChange={(e) => update((d) => ({ ...d, event: e.target.value }))}>
                  {EVENTS.map((ev) => (
                    <option key={ev.label}>{ev.label}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="pad">
            <button className="btn primary" disabled={!canSave} onClick={save}>
              {busy > 0 ? 'Procesando fotos…' : 'Guardar'}
            </button>
            {hasContent && (
              <button className="btn plain danger" onClick={discard}>
                <Trash2 size={18} /> Descartar
              </button>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}
