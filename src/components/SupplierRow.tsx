import { CloudUpload, ChevronRight } from 'lucide-react';
import { useApp } from '../ctx';
import type { LocalSupplier } from '../lib/types';
import { Avatar, PhotoImg, ProjectDots, Stars } from './ui';
import { fmtTime, isToday, fmtDateTime } from '../lib/util';

export function SupplierRow({ s }: { s: LocalSupplier }) {
  const { push } = useApp();
  const title = s.company || s.company_zh;
  const offer = [s.price, s.moq && `MOQ ${s.moq}`].filter(Boolean).join(' · ');
  return (
    <div className="row srow tap" onClick={() => push({ kind: 'supplier', id: s.id })}>
      <PhotoImg path={s.photos[0]?.path} thumb className="thumb" />
      <div className="srow-main">
        <div className={`srow-title ${title ? '' : 'empty'}`}>
          {title || 'Sin nombre'}
          {s.agreement.trim() && <span className="seal">Pactado</span>}
        </div>
        <div className="srow-sub">{s.products || s.note || '—'}</div>
        {offer && <div className="srow-offer">{offer}</div>}
        <div className="srow-meta">
          <Avatar id={s.created_by} size={18} />
          <ProjectDots ids={s.project_ids} />
          {s.rating > 0 && <Stars value={s.rating} size={12} />}
          {s._dirty === 1 && <CloudUpload size={13} className="c-orange" />}
          <span className="srow-time">{isToday(s.created_at) ? fmtTime(s.created_at) : fmtDateTime(s.created_at)}</span>
        </div>
      </div>
      <ChevronRight size={18} className="chev" />
    </div>
  );
}
