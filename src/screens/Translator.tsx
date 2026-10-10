import { useState } from 'react';
import { ArrowLeftRight, Copy, Maximize2, X } from 'lucide-react';
import { translate } from '../lib/ai';
import { copyText, toast } from '../lib/toast';
import { AutoTextarea, NavBar, Segmented, SyncPill } from '../components/ui';

type Dir = 'es-zh' | 'zh-es';
interface Item {
  dir: Dir;
  src: string;
  out: string;
  at: number;
}
const KEY = 'feria.translations';

function loadHistory(): Item[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function Translator() {
  const [dir, setDir] = useState<Dir>('es-zh');
  const [src, setSrc] = useState('');
  const [out, setOut] = useState('');
  const [outDir, setOutDir] = useState<Dir>('es-zh');
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [history, setHistory] = useState<Item[]>(loadHistory);

  const run = async () => {
    const text = src.trim();
    if (!text) return;
    setBusy(true);
    try {
      const r = await translate(text, dir);
      setOut(r);
      setOutDir(dir);
      const next = [{ dir, src: text, out: r, at: Date.now() }, ...history.filter((h) => h.src !== text || h.dir !== dir)].slice(0, 20);
      setHistory(next);
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const swap = () => {
    setDir(dir === 'es-zh' ? 'zh-es' : 'es-zh');
    if (out) {
      setSrc(out);
      setOut('');
    }
  };

  return (
    <>
      <NavBar center={<SyncPill />} />
      <h1 className="large-title">Traductor</h1>
      <div className="dir-row">
        <Segmented value={dir} onChange={setDir} options={[['es-zh', 'ES → 中文'], ['zh-es', '中文 → ES']]} />
        <button className="icon-btn" onClick={swap} aria-label="Invertir">
          <ArrowLeftRight size={20} />
        </button>
      </div>
      <div className="group">
        <div className="list">
          <div className="field">
            <AutoTextarea
              className="tr-input"
              value={src}
              onChange={(e) => setSrc(e.target.value)}
              placeholder={dir === 'es-zh' ? 'Escribe o dicta en español…' : '输入或粘贴中文…'}
              lang={dir === 'es-zh' ? 'es' : 'zh-CN'}
            />
          </div>
        </div>
      </div>
      <div className="pad row-btns">
        <button className="btn primary" disabled={busy || !src.trim()} onClick={run}>
          {busy ? 'Traduciendo…' : 'Traducir'}
        </button>
        {src && (
          <button
            className="btn secondary narrow"
            onClick={() => {
              setSrc('');
              setOut('');
            }}
          >
            Borrar
          </button>
        )}
      </div>

      {out && (
        <div className="group">
          <div className="list card-pad">
            <div className={`tr-out ${outDir === 'es-zh' ? 'zh' : ''}`} lang={outDir === 'es-zh' ? 'zh-CN' : 'es'}>
              {out}
            </div>
          </div>
          <div className="pad row-btns">
            <button className="btn secondary" onClick={() => setShow(true)}>
              <Maximize2 size={18} /> Mostrar
            </button>
            <button className="btn secondary" onClick={() => copyText(out)}>
              <Copy size={18} /> Copiar
            </button>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="group">
          <div className="group-title">Recientes</div>
          <div className="list">
            {history.map((h) => (
              <div
                key={h.at}
                className="row tap hist"
                onClick={() => {
                  setDir(h.dir);
                  setSrc(h.src);
                  setOut(h.out);
                  setOutDir(h.dir);
                }}
              >
                <div className="grow">
                  <div className="ellipsis">{h.src}</div>
                  <div className="ellipsis muted">{h.out}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {show && (
        <div className="full show-text" onClick={() => setShow(false)}>
          <button className="full-close" aria-label="Cerrar">
            <X size={22} />
          </button>
          <div className={outDir === 'es-zh' ? 'zh' : ''} lang={outDir === 'es-zh' ? 'zh-CN' : 'es'}>
            {out}
          </div>
        </div>
      )}
    </>
  );
}
