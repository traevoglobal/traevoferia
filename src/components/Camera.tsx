import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera as CameraIcon, X } from 'lucide-react';
import type { DraftPhoto, Option } from '../lib/types';
import { useBlobUrl } from '../lib/photos';

function Shot({ p, label, selected, onSelect, onRemove }: { p: DraftPhoto; label?: string; selected: boolean; onSelect: () => void; onRemove: () => void }) {
  const url = useBlobUrl(p.thumb);
  return (
    <div className={`cam-shot ${selected ? 'on' : ''}`} onClick={onSelect}>
      {url && <img src={url} alt="" />}
      {label && <span className="cam-kind">{label}</span>}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        aria-label="Borrar foto"
      >
        <X size={14} strokeWidth={3} />
      </button>
    </div>
  );
}

/** Cámara dentro de la app: foto, foto, foto sin cerrarla. Cada disparo se guarda al momento en el borrador. */
export function CameraView({
  photos, busy, kinds, onShot, onRemove, onKind, onClose, onFallback,
}: {
  photos: DraftPhoto[];
  busy: number;
  kinds: Option[];
  /** Devuelve el id que tendrá la foto (aunque aún se esté comprimiendo). */
  onShot: (b: Blob) => string;
  onRemove: (id: string) => void;
  onKind: (id: string, kind: string) => void;
  onClose: () => void;
  /** Cámara del sistema, si la de la app no arranca. */
  onFallback: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState(false);
  const [flash, setFlash] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [tagged, setTagged] = useState<Record<string, string>>({});
  const strip = useRef<HTMLDivElement>(null);
  // El tipo va a la foto elegida o, si no, a la última disparada aunque aún se esté comprimiendo.
  const target = sel ?? last ?? photos[photos.length - 1]?.id ?? null;
  const kindOf = (id: string) => tagged[id] ?? photos.find((p) => p.id === id)?.kind ?? '';

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play().catch(() => {});
        }
      })
      .catch(() => setError(true));
    if (!navigator.mediaDevices) setError(true);
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    strip.current?.scrollTo({ left: strip.current.scrollWidth, behavior: 'smooth' });
  }, [photos.length]);

  const shoot = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    c.toBlob(
      (b) => {
        c.width = c.height = 0;
        if (b) {
          setLast(onShot(b));
          setSel(null);
        }
      },
      'image/jpeg',
      0.92,
    );
    setFlash((n) => n + 1);
    navigator.vibrate?.(15);
  };

  const n = photos.length + busy;
  const kindLabel = (k?: string) => kinds.find(([v]) => v === k)?.[1];
  return createPortal(
    <div className="cam">
      <video ref={video} playsInline muted autoPlay className="cam-video" />
      {flash > 0 && <div key={flash} className="cam-flash" />}
      <div className="cam-top">
        <button className="cam-done" onClick={onClose}>
          Listo{n ? ` · ${n}` : ''}
        </button>
        {n >= 10 && <span className="cam-warn">Llevas {n} fotos</span>}
      </div>
      {error && (
        <div className="cam-error">
          <p>No se pudo abrir la cámara de la app.</p>
          <button className="btn primary" onClick={onFallback}>
            <CameraIcon size={20} /> Cámara del sistema
          </button>
        </div>
      )}
      <div className="cam-bottom">
        {target && kinds.length > 0 && (
          <div className="cam-kinds">
            {kinds.map(([v, l]) => (
              <button
                key={v}
                className={`chip ${kindOf(target) === v ? 'on' : ''}`}
                onClick={() => {
                  const k = kindOf(target) === v ? '' : v;
                  setTagged((t) => ({ ...t, [target]: k }));
                  onKind(target, k);
                }}
              >
                {l}
              </button>
            ))}
          </div>
        )}
        <div className="cam-strip" ref={strip}>
          {photos.map((p) => (
            <Shot key={p.id} p={p} label={kindLabel(kindOf(p.id))} selected={p.id === target} onSelect={() => setSel(p.id)} onRemove={() => onRemove(p.id)} />
          ))}
          {Array.from({ length: busy }, (_, i) => (
            <div key={`b${i}`} className="cam-shot loading" />
          ))}
        </div>
        <button className="cam-shutter" onClick={shoot} disabled={error} aria-label="Hacer foto">
          <span />
        </button>
      </div>
    </div>,
    document.body,
  );
}
