/* Imágenes del contenido privado (slides y QR): bucket "photos", carpeta content/img/. Se descargan enteras
   al móvil (Dexie) en cuanto hay red, para que Presentar y Mi tarjeta no hagan ninguna llamada en uso. */
import { useEffect, useState } from 'react';
import { db } from './db';
import { supabase } from './supabase';
import { contentImages } from './content';
import { useLive } from './util';

const FOLDER = 'content/img';
const remotePath = (p: string) => `content/${p}`;

let running = false;

/** Descarga las imágenes nuevas o cambiadas y borra las que ya no se usan. */
export async function syncAssets() {
  if (running) return;
  running = true;
  try {
    const wanted = contentImages();
    const { data, error } = await supabase.storage.from('photos').list(FOLDER, { limit: 1000 });
    if (error) throw error;
    const stamps = new Map((data ?? []).map((f) => [`img/${f.name}`, f.updated_at ?? f.id ?? '']));
    for (const p of wanted) {
      const stamp = stamps.get(p);
      if (stamp === undefined) continue; // aún no subida
      const cur = await db.assets.get(p);
      if (cur && cur.stamp === stamp) continue;
      const { data: blob, error: e } = await supabase.storage.from('photos').download(remotePath(p));
      if (e || !blob) continue;
      await db.assets.put({ path: p, blob, stamp });
    }
    const keep = new Set(wanted);
    const stale = (await db.assets.toCollection().primaryKeys()).filter((k) => !keep.has(k));
    if (stale.length) await db.assets.bulkDelete(stale);
  } finally {
    running = false;
  }
}

/** URL de una imagen del contenido guardada en el móvil (undefined si aún no está; se pinta en cuanto llega). */
export function useAsset(path?: string): string | undefined {
  const blob = useLive(async () => (path ? (await db.assets.get(path))?.blob : undefined), [path], undefined);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return setUrl(undefined);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}
