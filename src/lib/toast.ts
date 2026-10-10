import { useEffect, useState } from 'react';

let listener: ((msg: string) => void) | null = null;

export function toast(msg: string) {
  listener?.(msg);
}

export function useToast(): string | null {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    listener = (m) => {
      setMsg(m);
      clearTimeout(t);
      t = setTimeout(() => setMsg(null), 2000);
    };
    return () => {
      listener = null;
      clearTimeout(t);
    };
  }, []);
  return msg;
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copiado');
  } catch {
    toast('No se pudo copiar');
  }
}
