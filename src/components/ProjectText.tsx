import { isSet } from '../lib/content';
import type { ProjectText } from '../lib/types';

export function ProjectTextView({ t, photos, onPhoto, zh }: { t: ProjectText; photos: string[]; onPhoto?: (i: number) => void; zh?: boolean }) {
  const list = (title: string, xs: string[]) =>
    xs.filter(isSet).length > 0 && (
      <>
        <h3>{title}</h3>
        <ul>
          {xs.filter(isSet).map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </>
    );
  return (
    <div className="ptext" lang={zh ? 'zh-CN' : 'es'}>
      {isSet(t.title) && <h2>{t.title}</h2>}
      {isSet(t.summary) && <p>{t.summary}</p>}
      {list(zh ? '我们的需求' : 'Necesidades', t.needs)}
      {list(zh ? '要求' : 'Requisitos', t.requirements)}
      {list(zh ? '我们想了解' : 'Preguntas', t.questions)}
      {photos.length > 0 && (
        <div className="pgrid">
          {photos.map((src, i) => (
            <img key={src} src={src.startsWith('/') ? src : `/${src}`} alt="" onClick={() => onPhoto?.(i)} loading="lazy" />
          ))}
        </div>
      )}
    </div>
  );
}
