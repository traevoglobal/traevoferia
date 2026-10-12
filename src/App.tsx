import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { CalendarDays, Camera, Factory, FolderOpen, Languages } from 'lucide-react';
import { Ctx, type AppCtx } from './ctx';
import { setMyId, supabase } from './lib/supabase';
import { db } from './lib/db';
import { ensureProfile, startSync } from './lib/sync';
import { navBack, keptStack, navInit, navOpen, navPush, navTab, useNav, type Overlay, type Tab } from './lib/nav';
import { useToast } from './lib/toast';
import { useLive } from './lib/util';
import { PhotoViewer } from './components/ui';
import { Login, NameSheet, ProfileSheet } from './screens/Auth';
import { Today } from './screens/Today';
import { ProjectDetail, Projects } from './screens/Projects';
import { SupplierDetail, Suppliers } from './screens/Suppliers';
import { Translator } from './screens/Translator';
import { CaptureSheet } from './screens/Capture';
import { Presentation, QRScreen } from './screens/Share';

const TABS: Tab[] = ['hoy', 'proyectos', 'proveedores', 'traductor'];

function ToastHost() {
  const msg = useToast();
  return msg ? <div className="toast">{msg}</div> : null;
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return null;
  if (!session)
    return (
      <>
        <Login />
        <ToastHost />
      </>
    );
  return <Main key={session.user.id} userId={session.user.id} />;
}

function Main({ userId }: { userId: string }) {
  setMyId(userId);
  const profilesArr = useLive(() => db.profiles.toArray(), [], []);
  const profiles = useMemo(() => new Map(profilesArr.map((p) => [p.id, p])), [profilesArr]);
  const me = profiles.get(userId);
  const [checked, setChecked] = useState(false);

  useState(navInit);
  const nav = useNav();
  const tab = nav.tab;

  const draft = useLive(() => db.drafts.get('current'), [], undefined);
  const hasDraft = !!draft && (draft.photos.length > 0 || draft.note.trim() !== '');

  useEffect(() => {
    const stop = startSync();
    ensureProfile(userId)
      .then(() => setChecked(true))
      .catch(() => {});
    navigator.storage?.persist?.().catch(() => {});
    return () => {
      stop();
      setMyId(null);
    };
  }, [userId]);

  const ctx: AppCtx = useMemo(
    () => ({
      myId: userId,
      me,
      profiles,
      push: navPush,
      back: navBack,
      openCapture: () => {
        const open = [...nav.stack].reverse().find((r) => r.kind === 'project');
        navOpen({ kind: 'capture', project: open?.kind === 'project' ? open.slug : undefined });
      },
      openPresent: (slug) => navOpen({ kind: 'present', slug }),
      openQR: (slug) => navOpen({ kind: 'qr', slug }),
      openViewer: (paths, index) => navOpen({ kind: 'viewer', paths, index }),
      openProfile: () => navOpen({ kind: 'profile' }),
    }),
    [userId, me, profiles, nav.stack],
  );

  const overlay = (o: Overlay, i: number) => {
    switch (o.kind) {
      case 'capture':
        return <CaptureSheet key={i} project={o.project} onClose={navBack} />;
      case 'viewer':
        return <PhotoViewer key={i} paths={o.paths} index={o.index} onClose={navBack} />;
      case 'qr':
        return <QRScreen key={i} slug={o.slug} profile={me} onClose={navBack} />;
      case 'profile':
        return <ProfileSheet key={i} profile={me} myId={userId} onClose={navBack} />;
      case 'present':
        return <Presentation key={i} slug={o.slug} profile={me} onExit={navBack} />;
    }
  };

  const root = (t: Tab) =>
    t === 'hoy' ? <Today /> : t === 'proyectos' ? <Projects /> : t === 'proveedores' ? <Suppliers /> : <Translator />;

  const tabBtn = (t: Tab, label: string, Icon: typeof CalendarDays) => (
    <button className={`tab ${tab === t ? 'on' : ''}`} onClick={() => navTab(t)}>
      <Icon size={25} strokeWidth={tab === t ? 2.3 : 1.8} />
      <span>{label}</span>
    </button>
  );

  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        {TABS.map((t) => (
          <div key={t} className={`tab-pane ${t === tab ? 'active' : ''}`}>
            <div className="view">{root(t)}</div>
            {keptStack(t).map((r, i) => (
              <div key={`${i}-${r.kind === 'project' ? r.slug : r.id}`} className="view pushed">
                {r.kind === 'project' ? <ProjectDetail slug={r.slug} /> : <SupplierDetail id={r.id} />}
              </div>
            ))}
          </div>
        ))}
        <nav className="tabbar">
          {tabBtn('hoy', 'Hoy', CalendarDays)}
          {tabBtn('proyectos', 'Proyectos', FolderOpen)}
          <button className="tab" onClick={ctx.openCapture} aria-label="Captar">
            <span className="capture-btn">
              <Camera size={28} strokeWidth={2.2} />
              {hasDraft && <i className="badge" />}
            </span>
          </button>
          {tabBtn('proveedores', 'Proveedores', Factory)}
          {tabBtn('traductor', 'Traductor', Languages)}
        </nav>
      </div>

      {nav.overlays.map(overlay)}
      {checked && me && !me.name && <NameSheet profile={me} />}
      <ToastHost />
    </Ctx.Provider>
  );
}
