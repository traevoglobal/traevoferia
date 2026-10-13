import { useEffect, useState } from 'react';
import { db } from './db';
import { supabase } from './supabase';

async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function drawToJpeg(img: HTMLImageElement, max: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => {
      canvas.width = canvas.height = 0; // libera memoria en iOS
      if (b) resolve(b);
      else reject(new Error('No se pudo comprimir la foto'));
    }, 'image/jpeg', quality),
  );
}

/** Foto a JPEG 1600px q0.8 + miniatura 320px. */
export async function compressPhoto(file: Blob): Promise<{ blob: Blob; thumb: Blob }> {
  const img = await loadImage(file);
  const blob = await drawToJpeg(img, 1600, 0.8);
  const thumb = await drawToJpeg(img, 320, 0.7);
  return { blob, thumb };
}

/* ---------- URLs firmadas (por lotes y cacheadas) ---------- */
const TTL = 7 * 24 * 3600;
const mem = new Map<string, { url: string; exp: number }>();
let queue = new Map<string, { resolve: (u: string) => void; reject: (e: unknown) => void }[]>();
let timer: ReturnType<typeof setTimeout> | null = null;

export async function getSignedUrl(path: string): Promise<string> {
  const now = Date.now();
  const m = mem.get(path);
  if (m && m.exp > now) return m.url;
  const d = await db.signed.get(path);
  if (d && d.exp > now) {
    mem.set(path, d);
    return d.url;
  }
  return new Promise((resolve, reject) => {
    const arr = queue.get(path) ?? [];
    arr.push({ resolve, reject });
    queue.set(path, arr);
    if (!timer) timer = setTimeout(flush, 40);
  });
}

async function flush() {
  timer = null;
  const batch = queue;
  queue = new Map();
  const paths = [...batch.keys()];
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    try {
      const { data, error } = await supabase.storage.from('photos').createSignedUrls(chunk, TTL);
      if (error) throw error;
      const exp = Date.now() + (TTL - 24 * 3600) * 1000;
      const rows: { path: string; url: string; exp: number }[] = [];
      for (const item of data ?? []) {
        const waiters = item.path ? batch.get(item.path) : undefined;
        if (!waiters || !item.path) continue;
        const url = item.signedUrl;
        if (url) {
          const row = { path: item.path, url, exp };
          mem.set(item.path, row);
          rows.push(row);
          waiters.forEach((w) => w.resolve(url));
        } else waiters.forEach((w) => w.reject(new Error(item.error ?? 'Sin URL')));
        batch.delete(item.path);
      }
      if (rows.length) await db.signed.bulkPut(rows);
    } catch (e) {
      chunk.forEach((p) => batch.get(p)?.forEach((w) => w.reject(e)));
      chunk.forEach((p) => batch.delete(p));
    }
  }
  batch.forEach((ws) => ws.forEach((w) => w.reject(new Error('Sin URL'))));
}

/** Blob de una foto: local si existe; si no, descargada. */
export async function getPhotoBlob(path: string): Promise<Blob> {
  const local = await db.photos.get(path);
  if (local) return local.blob;
  const res = await fetch(await getSignedUrl(path));
  if (!res.ok) throw new Error(`Foto no disponible (${res.status})`);
  return res.blob();
}

/* ---------- Object URLs con recuento de referencias ---------- */
const objUrls = new Map<string, { url: string; refs: number }>();

function acquire(key: string, blob: Blob): string {
  const e = objUrls.get(key);
  if (e) {
    e.refs++;
    return e.url;
  }
  const url = URL.createObjectURL(blob);
  objUrls.set(key, { url, refs: 1 });
  return url;
}

function release(key: string) {
  const e = objUrls.get(key);
  if (!e) return;
  e.refs--;
  if (e.refs <= 0) {
    setTimeout(() => {
      const cur = objUrls.get(key);
      if (cur && cur.refs <= 0) {
        URL.revokeObjectURL(cur.url);
        objUrls.delete(key);
      }
    }, 20_000);
  }
}

/** URL mostrable de una foto: blob local si existe; si no, URL firmada. */
export function usePhotoUrl(path: string | undefined, thumb = false): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    setUrl(undefined);
    if (!path) return;
    let cancelled = false;
    let key: string | null = null;
    (async () => {
      const rec = await db.photos.get(path);
      if (cancelled) return;
      const blob = rec ? (thumb && rec.thumb ? rec.thumb : rec.blob) : null;
      if (blob) {
        key = `${path}${thumb ? '#t' : ''}`;
        setUrl(acquire(key, blob));
        return;
      }
      try {
        const u = await getSignedUrl(path);
        if (!cancelled) setUrl(u);
      } catch {
        /* sin conexión: se queda el hueco */
      }
    })();
    return () => {
      cancelled = true;
      if (key) release(key);
    };
  }, [path, thumb]);
  return url;
}

/** URL de un blob suelto (borradores). */
export function useBlobUrl(blob?: Blob): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return setUrl(undefined);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}
