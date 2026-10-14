import { memo, type CSSProperties } from 'react';
import { CloudUpload, ChevronRight, Mic } from 'lucide-react';
import { navPush } from '../lib/nav';
import { discardOf, fichaId, getOf, viaColor } from '../lib/ficha';
import type { LocalSupplier } from '../lib/types';
import { Avatar, PhotoImg, ProjectDots, Stars } from './ui';
import { FichaBadges } from './Ficha';
import { fmtTime, isToday, fmtDateTime } from '../lib/util';

/** Fila de ficha: identificador pabellón-stand, empresa, color de la vía y lo que le falta. */
export const SupplierRow = memo(function SupplierRow({ s }: { s: LocalSupplier }) {
  const get = getOf(s);
  const id = fichaId(get);
  const name = s.company || s.company_zh;
  const disc = discardOf(get);
  const offer = [s.price, s.moq && `MOQ ${s.moq}`].filter(Boolean).join(' · ');
  return (
    <div
      className={`row srow tap ${disc ? `off ${disc.tone}` : ''}`}
      style={{ '--via': viaColor(get('via')) } as CSSProperties}
      onClick={() => navPush({ kind: 'supplier', id: s.id })}
    >
      <PhotoImg path={s.photos[0]?.path} thumb className="thumb" />
      <div className="srow-main">
        <div className="srow-title">
          {id && <span className="srow-id">{id}</span>}
          <span className={name ? '' : 'empty'}>{name || 'Sin empresa'}</span>
          {s.agreement.trim() && <span className="seal">Pactado</span>}
        </div>
        <div className="srow-sub">{get('problem') || get('sector') || s.products || s.note || '—'}</div>
        {offer && <div className="srow-offer">{offer}</div>}
        <div className="srow-meta">
          <Avatar id={s.created_by} size={18} />
          <FichaBadges get={get} />
          {(s.extra.audios?.length ?? 0) > 0 && <Mic size={12} />}
          <ProjectDots ids={s.project_ids} />
          {s.rating > 0 && <Stars value={s.rating} size={12} />}
          {s._dirty === 1 && <CloudUpload size={13} className="c-orange" />}
          <span className="srow-time">{isToday(s.created_at) ? fmtTime(s.created_at) : fmtDateTime(s.created_at)}</span>
        </div>
      </div>
      <ChevronRight size={18} className="chev" />
    </div>
  );
});
