import { useMemo } from 'react';
import { PenLine } from 'lucide-react';
import { useApp } from '../ctx';
import { db } from '../lib/db';
import { isToday, useLive } from '../lib/util';
import { Avatar, Empty, NavBar, SyncPill } from '../components/ui';
import { SupplierRow } from '../components/SupplierRow';

export function Today() {
  const { myId, profiles, openProfile, openCapture } = useApp();
  const all = useLive(() => db.suppliers.toArray(), [], []);
  const draft = useLive(() => db.drafts.get('current'), [], undefined);
  const hasDraft = !!draft && (draft.photos.length > 0 || draft.note.trim() !== '');

  const today = useMemo(
    () => all.filter((s) => !s.deleted && isToday(s.created_at)).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [all],
  );
  const byPerson = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of profiles.values()) m.set(p.id, 0);
    if (!m.has(myId)) m.set(myId, 0);
    for (const s of today) m.set(s.created_by, (m.get(s.created_by) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [today, profiles, myId]);

  const date = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <>
      <NavBar
        center={<SyncPill />}
        right={
          <button className="icon-btn" onClick={openProfile} aria-label="Perfil">
            <Avatar id={myId} size={32} />
          </button>
        }
      />
      <h1 className="large-title">Hoy</h1>
      <p className="subtitle">{date}</p>

      {hasDraft && (
        <div className="group">
          <div className="list">
            <div className="row tap" onClick={openCapture}>
              <PenLine size={20} className="c-brand" />
              <span className="grow">Tienes una captura sin guardar</span>
              <span className="c-blue">Abrir</span>
            </div>
          </div>
        </div>
      )}

      <div className="group">
        <div className="group-title">Por persona · {today.length} hoy</div>
        <div className="list">
          {byPerson.map(([id, n]) => (
            <div className="row" key={id}>
              <Avatar id={id} size={30} />
              <span className="grow">{profiles.get(id)?.name || (id === myId ? 'Tú' : '—')}</span>
              <span className="count">{n}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="group">
        <div className="group-title">Cronológico</div>
        {today.length ? (
          <div className="list">
            {today.map((s) => (
              <SupplierRow key={s.id} s={s} />
            ))}
          </div>
        ) : (
          <Empty>Aún no hay capturas hoy. Pulsa el botón rojo para captar.</Empty>
        )}
      </div>
    </>
  );
}
