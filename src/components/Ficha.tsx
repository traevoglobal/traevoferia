import { useRef, useState, type CSSProperties } from 'react';
import { Camera, ExternalLink, Images, Link2 } from 'lucide-react';
import { useApp } from '../ctx';
import { CONFIG, TEAM } from '../lib/content';
import { changeWithLocks, discardOf, fichaId, getOf, missing, score, verifyLinks, viaDef, viaSwitchPatch, type Get } from '../lib/ficha';
import { LAST_SECTOR } from '../lib/prefs';
import { addAudioToSupplier, addFilesToSupplier, setPhotoKind, spawnLinked, updateFields } from '../lib/store';
import { toast } from '../lib/toast';
import type { LocalSupplier } from '../lib/types';
import { EditField, PhotoImg } from './ui';
import { Choice, QuickText, SectorChips, ViaFields, ViaPicker } from './Fields';
import { AudioClip, AudioRecorder } from './Audio';

/** Etiquetas de estado de la ficha: vía, puntuación, descartada, lo que falta. */
export function FichaBadges({ get }: { get: Get }) {
  const via = viaDef(get('via'));
  const sc = score(get);
  const disc = discardOf(get);
  const miss = missing(get);
  return (
    <>
      {via && (
        <span className="badge-via" style={{ '--via': via.color } as CSSProperties}>
          {via.label}
        </span>
      )}
      {sc && <span className={`badge-score ${sc.low ? 'low' : ''}`}>{sc.value}/{sc.max}</span>}
      {disc && <span className={`badge-off ${disc.tone}`}>{disc.tone === 'red' ? disc.label : 'descartada'}</span>}
      {miss.map((m) => (
        <span key={m} className={`badge-miss ${m === 'sin stand' ? 'red' : ''}`}>
          {m === 'sin stand' ? 'sin localizar' : m}
        </span>
      ))}
    </>
  );
}

/** Fotos de la ficha con su tipo (cambiable) y botones para añadir: cámara y galería (capturas de WeChat). */
export function PhotoStrip({ s }: { s: LocalSupplier }) {
  const { openViewer } = useApp();
  const [adding, setAdding] = useState(0);
  const cam = useRef<HTMLInputElement>(null);
  const gal = useRef<HTMLInputElement>(null);
  const kinds = CONFIG?.photoKinds ?? [];
  const paths = s.photos.map((p) => p.path);

  const add = async (input: HTMLInputElement) => {
    const files = [...(input.files ?? [])];
    input.value = '';
    if (!files.length) return;
    setAdding((n) => n + files.length);
    try {
      await addFilesToSupplier(s.id, files);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setAdding((n) => n - files.length);
    }
  };

  return (
    <>
      <div className="strip">
        {s.photos.map((p, i) => (
          <div key={p.path} className="strip-item">
            <PhotoImg path={p.path} thumb className="strip-img" onClick={() => openViewer(paths, i)} />
            {kinds.length > 0 && (
              <label className={`strip-kind ${p.kind ? 'on' : ''}`}>
                {kinds.find(([v]) => v === p.kind)?.[1] ?? 'Tipo'}
                <select value={p.kind ?? ''} onChange={(e) => setPhotoKind(s.id, p.path, e.target.value)}>
                  <option value="">—</option>
                  {kinds.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
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
      <input ref={cam} className="vh" type="file" accept="image/*" capture="environment" onChange={(e) => add(e.currentTarget)} />
      <input ref={gal} className="vh" type="file" accept="image/*" multiple onChange={(e) => add(e.currentTarget)} />
    </>
  );
}

/** Edición completa de la ficha: identificación, vía y sus campos, cierre, la frase, estado, verificación y audios. */
export function FichaEditor({ s }: { s: LocalSupplier }) {
  const { push } = useApp();
  const get = getOf(s);
  const via = viaDef(get('via'));
  const set = (key: string, value: string) => void updateFields(s.id, changeWithLocks(get, key, value));
  const disc = discardOf(get);
  const sc = score(get);
  const links = verifyLinks(get);
  const owner = TEAM.find((t) => t.slug === get('owner'))?.name ?? get('owner');
  const halls = CONFIG?.halls ?? [];

  const spawn = async () => {
    if (!via?.spawn) return;
    const id = await spawnLinked(s.id, via.spawn.via, via.spawn.owner);
    if (id) toast('Ficha enlazada creada');
  };

  return (
    <>
      <div className="group">
        <ViaPicker value={get('via')} onChange={(id) => void updateFields(s.id, viaSwitchPatch(get, id, LAST_SECTOR.get()[id] ?? ''))} />
        {disc && <div className={`ficha-banner ${disc.tone}`}>Descartada: {disc.label}</div>}
        {sc && (
          <div className={`ficha-banner ${sc.low ? 'red' : 'ok'}`}>
            Puntuación {sc.value}/{sc.max}
            {sc.low ? ' · sin seguimiento' : ''}
          </div>
        )}
        {owner && <div className="ficha-banner">Asignada a {owner}</div>}
      </div>

      <div className="group">
        <div className="qf-box">
          <div className="cap-id">
            {halls.length > 0 && (
              <select className="cap-hall" value={get('hall')} onChange={(e) => set('hall', e.target.value)} aria-label="Pabellón">
                <option value="">Pabellón</option>
                {[...new Set([...halls, get('hall')].filter(Boolean))].map((h) => (
                  <option key={h}>{h}</option>
                ))}
              </select>
            )}
            <QuickText f={{ key: 'booth', label: 'Stand' }} value={get('booth')} onBlurOnly onChange={(v) => set('booth', v.toUpperCase())} />
          </div>
          <QuickText f={{ key: 'company', label: 'Empresa' }} value={get('company')} onBlurOnly onChange={(v) => set('company', v)} />
          <QuickText f={{ key: 'company_zh', label: 'Empresa (中文)' }} value={get('company_zh')} onBlurOnly onChange={(v) => set('company_zh', v)} />
          {via && via.sectors.length > 0 && <SectorChips via={via} value={get('sector')} onChange={(v) => set('sector', v)} />}
          {via && <ViaFields fields={via.fields} get={get} onChange={set} onBlurOnly />}
          {via?.spawn && !get('link') && (
            <button className="chip spawn" onClick={spawn}>
              <Link2 size={15} /> {via.spawn.label}
            </button>
          )}
          {get('link') && (
            <button className="link small" onClick={() => push({ kind: 'supplier', id: get('link') })}>
              <Link2 size={14} /> Ver ficha enlazada
            </button>
          )}
        </div>
      </div>

      {via?.close && via.close.length > 0 && (
        <div className="group">
          <div className="group-title">Cierre</div>
          <div className="qf-box">
            <ViaFields fields={via.close} get={get} onChange={set} onBlurOnly />
          </div>
        </div>
      )}

      {via?.problem && (
        <div className="group">
          <div className="group-title">La frase</div>
          <div className="list">
            <EditField label={via.problem} multiline value={get('problem')} placeholder="Escríbela en una frase" onSave={(v) => set('problem', v.trim())} />
          </div>
        </div>
      )}

      {(CONFIG?.statuses.length ?? 0) > 0 && (
        <div className="group">
          <div className="qf-box">
            <Choice f={{ key: 'status', label: 'Estado', options: CONFIG!.statuses }} value={get('status')} onChange={(v) => set('status', v)} />
          </div>
        </div>
      )}

      {links.length > 0 && (
        <div className="group">
          <div className="group-title">Verificar</div>
          <div className="chips wrap">
            {links.map(([label, url]) => (
              <a key={label} className="chip" href={url} target="_blank" rel="noreferrer">
                {label} <ExternalLink size={13} />
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="group">
        <div className="group-title">Notas de voz</div>
        <AudioRecorder onDone={(blob, secs) => void addAudioToSupplier(s.id, blob, secs)} />
        {(s.extra.audios?.length ?? 0) > 0 && (
          <div className="clips">
            {s.extra.audios!.map((a) => (
              <AudioClip key={a.path} path={a.path} secs={a.secs} />
            ))}
          </div>
        )}
      </div>

      <div className="group">
        <div className="group-foot">ID {fichaId(get) || 'sin localizar'}</div>
      </div>
    </>
  );
}
