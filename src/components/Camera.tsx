import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera as CameraIcon, X } from 'lucide-react';
import { PhotoImg } from './ui';

/** Cámara dentro de la app: foto, foto, foto sin cerrarla. Cada disparo se guarda al momento en la ficha. */
export function CameraView({
  shots, busy, onShot, onRemove, onClose, onFallback,
}: {
  /** Rutas de las fotos hechas en esta sesión de cámara. */
  shots: string[];
  /** Fotos aún comprimiéndose. */
  busy: number;
  onShot: (b: Blob) => void;
  onRemove: (path: string) => void;
  onClose: () => void;
  /** Cámara del sistema, si la de la app no arranca. */
  onFallback: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState(false);
  const [flash, setFlash] = useState(0);
  const strip = useRef<HTMLDivElement>(null);

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
  }, [shots.length, busy]);

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
        if (b) onShot(b);
      },
      'image/jpeg',
      0.92,
    );
    setFlash((n) => n + 1);
    navigator.vibrate?.(15);
  };

  const n = shots.length + busy;
  return createPortal(
    <div className="cam">
      <video ref={video} playsInline muted autoPlay className="cam-video" />
      {flash > 0 && <div key={flash} className="cam-flash" />}
      <div className="cam-top">
        <button className="cam-done" onClick={onClose}>
          Listo{n ? ` · ${n}` : ''}
        </button>
      </div>
      {error && (
        <div className="cam-error">
          <p>No se pudo abrir la cámara de la app.</p>
          <button className="btn primary" onClick={onFallback}>
            <CameraIcon size={22} /> Cámara del sistema
          </button>
        </div>
      )}
      <div className="cam-bottom">
        <div className="cam-strip" ref={strip}>
          {shots.map((p) => (
            <div key={p} className="cam-shot">
              <PhotoImg path={p} thumb />
              <button onClick={() => onRemove(p)} aria-label="Borrar foto">
                <X size={14} strokeWidth={3} />
              </button>
            </div>
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
