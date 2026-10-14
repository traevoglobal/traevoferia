import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { ClipboardCheck, MapPin, Moon, PenLine, Share, Sun, TriangleAlert, Upload } from 'lucide-react';
import { useApp } from '../ctx';
import { db } from '../lib/db';
import { HORARIO } from '../lib/content';
import { draftHasContent, viaColor } from '../lib/ficha';
import { allTags, countFichas, currentSlot, memberOf, useNow, usersByMember } from '../lib/plan';
import { LAST_EXPORT, THEME } from '../lib/prefs';
import { exportBackup, importBackup } from '../lib/backup';
import { toast } from '../lib/toast';
import { isToday, useLive, useStored } from '../lib/util';
import { Avatar, Empty, NavBar, SyncPill } from '../components/ui';
import { SupplierRow } from '../components/SupplierRow';
import { ViaFilter } from './Suppliers';

const exportNow = () => exportBackup().catch((e: Error) => toast(e.message));

export function Today() {
  const { myId, profiles, openProfile, openCapture, push } = useApp();
  const all = useLive(() => db.suppliers.toArray(), [], []);
  const draft = useLive(() => db.drafts.get('current'), [], undefined);
  const hasDraft = !!draft && draftHasContent(draft);
  const now = useNow(60_000);
  const lastExport = LAST_EXPORT.use();
  const theme = THEME.use();
  const [via, setVia] = useState('');
  const [extra] = useStored<Record<string, number>>('feria.horario.contadores', {});
  const file = useRef<HTMLInputElement>(null);

  const today = useMemo(
    () => all.filter((s) => !s.deleted && isToday(s.created_at)).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [all],
  );
  const shown = via ? today.filter((s) => s.extra.via === via) : today;
  const viaCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of today) if (s.extra.via) m.set(s.extra.via, (m.get(s.extra.via) ?? 0) + 1);
    return m;
  }, [today]);
  const byPerson = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of profiles.values()) m.set(p.id, 0);
    if (!m.has(myId)) m.set(myId, 0);
    for (const s of shown) m.set(s.created_by, (m.get(s.created_by) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [shown, profiles, myId]);

  // Objetivo de la franja en curso (Horario), con las fichas reales.
  const h = HORARIO;
  const cur = h ? currentSlot(h, now, memberOf(profiles.get(myId)?.name)) : null;
  const users = useMemo(() => usersByMember(profiles.values()), [profiles]);
  const tags = useMemo(() => (h ? allTags(h) : new Set<string>()), [h]);

  const hours = lastExport ? Math.floor((now - lastExport) / 3600_000) : Infinity;
  const needExport = all.some((s) => !s.deleted) && hours >= 12;
  const dark = theme ? theme === 'dark' : window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const date = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  const doImport = async (input: HTMLInputElement) => {
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    try {
      const r = await importBackup(f);
      toast(`Importado: ${r.nuevas} nuevas, ${r.actualizadas} actualizadas, ${r.iguales} sin cambios`);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <>
      <NavBar
        center={<SyncPill />}
        right={
          <>
            <button className="icon-btn" onClick={() => THEME.set(dark ? 'light' : 'dark')} aria-label={dark ? 'Modo claro' : 'Modo oscuro'}>
              {dark ? <Sun size={21} /> : <Moon size={21} />}
            </button>
            <button className="icon-btn" onClick={openProfile} aria-label="Perfil">
              <Avatar id={myId} size={32} />
            </button>
          </>
        }
      />
      <h1 className="large-title">Hoy</h1>
      <p className="subtitle">{date}</p>

      {needExport && (
        <div className="group">
          <div className="list">
            <div className="row tap warn-row" onClick={exportNow}>
              <TriangleAlert size={20} />
              <span className="grow">{lastExport ? `Hace ${hours} h que no exportas` : 'Aún no has exportado'}</span>
              <span className="c-blue">Exportar</span>
            </div>
          </div>
        </div>
      )}

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

      {cur && (
        <div className="group">
          <div className="group-title">
            Ahora · {cur.slot.start}
            {cur.slot.end ? `–${cur.slot.end}` : ''}
          </div>
          <div className="list card-pad">
            <div className="slot-place">
              <MapPin size={16} />
              {cur.slot.place}
            </div>
            <div className="slot-goal">{cur.slot.goal}</div>
            {cur.slot.counters?.map((c) => {
              const base = c.fichas ? countFichas(cur.day, cur.slot, c, all, users, tags) : 0;
              const v = Math.max(0, base + (extra[c.id] ?? 0));
              return (
                <div key={c.id} className="ctr-mini" style={{ '--via': c.via ? viaColor(c.via) : 'var(--blue)' } as CSSProperties}>
                  <span className="grow">{c.label}</span>
                  <b className={v >= c.goal ? 'ok' : ''}>
                    {v} / {c.goal}
                  </b>
                  <i style={{ width: `${Math.min(100, (v / c.goal) * 100)}%` }} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="pad row-btns">
        <button className="btn secondary" onClick={() => push({ kind: 'cierre' })}>
          <ClipboardCheck size={20} /> Cierre del día
        </button>
        <button className="btn secondary" onClick={exportNow}>
          <Share size={20} /> Exportar
        </button>
      </div>

      <ViaFilter value={via} onChange={setVia} counts={viaCounts} />

      <div className="group">
        <div className="group-title">Por persona · {shown.length} hoy</div>
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
        {shown.length ? (
          <div className="list">
            {shown.map((s) => (
              <SupplierRow key={s.id} s={s} />
            ))}
          </div>
        ) : (
          <Empty>Aún no hay capturas hoy. Pulsa el botón rojo para captar.</Empty>
        )}
      </div>

      <div className="pad">
        <button className="btn plain" onClick={() => file.current?.click()}>
          <Upload size={18} /> Importar el JSON del otro móvil
        </button>
      </div>
      <input ref={file} className="vh" type="file" accept="application/json,.json" onChange={(e) => void doImport(e.currentTarget)} />
    </>
  );
}
