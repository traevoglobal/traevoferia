import { useEffect, useRef, useState } from 'react';
import { Mic, Pause, Play, Square, X } from 'lucide-react';
import { getPhotoBlob } from '../lib/photos';
import { toast } from '../lib/toast';

export const fmtSecs = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Botón de nota de voz: un toque graba, otro para. Funciona sin red (el audio queda en el móvil). */
export function AudioRecorder({ onDone }: { onDone: (blob: Blob, secs: number) => void }) {
  const [rec, setRec] = useState<{ r: MediaRecorder; t0: number } | null>(null);
  const [secs, setSecs] = useState(0);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => setSecs(Math.round((Date.now() - rec.t0) / 1000)), 250);
    return () => clearInterval(t);
  }, [rec]);
  useEffect(() => () => {
    if (rec && rec.r.state !== 'inactive') rec.r.stop();
  }, [rec]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported?.(t));
      const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      const t0 = Date.now();
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: r.mimeType || type || 'audio/mp4' });
        if (blob.size) done.current(blob, Math.max(1, Math.round((Date.now() - t0) / 1000)));
        setRec(null);
        setSecs(0);
      };
      r.start(1000);
      setRec({ r, t0 });
    } catch {
      toast('No se pudo usar el micrófono');
    }
  };

  return (
    <button className={`btn rec ${rec ? 'on' : ''}`} onClick={rec ? () => rec.r.stop() : start}>
      {rec ? (
        <>
          <Square size={18} fill="currentColor" /> Parar · {fmtSecs(secs)}
        </>
      ) : (
        <>
          <Mic size={20} /> Nota de voz
        </>
      )}
    </button>
  );
}

/** Reproductor de una nota de voz (local o del otro móvil). */
export function AudioClip({ path, blob, secs, onRemove }: { path?: string; blob?: Blob; secs: number; onRemove?: () => void }) {
  const [url, setUrl] = useState<string>();
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);

  // Se prepara antes de tocar: iOS solo deja reproducir dentro del propio toque.
  useEffect(() => {
    let cancelled = false;
    let u: string | undefined;
    void (blob ? Promise.resolve(blob) : path ? getPhotoBlob(path) : Promise.reject(new Error()))
      .then((b) => {
        if (cancelled) return;
        u = URL.createObjectURL(b);
        setUrl(u);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      audio.current?.pause();
      if (u) URL.revokeObjectURL(u);
    };
  }, [path, blob]);

  const toggle = () => {
    if (!url) return toast('Audio no disponible sin conexión');
    if (playing) return audio.current?.pause();
    const a = audio.current ?? (audio.current = new Audio());
    if (a.src !== url) a.src = url;
    a.onended = a.onpause = () => setPlaying(false);
    a.play().then(
      () => setPlaying(true),
      () => toast('No se pudo reproducir'),
    );
  };

  return (
    <span className="clip">
      <button className="clip-play" onClick={toggle} disabled={!url && !!path && !blob}>
        {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />} {fmtSecs(secs)}
      </button>
      {onRemove && (
        <button className="icon-btn tiny" onClick={onRemove} aria-label="Quitar audio">
          <X size={12} />
        </button>
      )}
    </span>
  );
}
