import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { CalendarDays, Camera, Factory, FolderOpen, Languages } from 'lucide-react';
import { Ctx, type AppCtx, type Route } from './ctx';
import { setMyId, supabase } from './lib/supabase';
import { db } from './lib/db';
import { ensureProfile, startSync } from './lib/sync';
import { navBack, navPush, navPushLocked } from './lib/nav';
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

type Tab = 'hoy' | 'proyectos' | 'proveedores' | 'traductor';
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

  const [tab, setTab] = useState<Tab>('hoy');
  const [stacks, setStacks] = useState<Record<Tab, Route[]>>({ hoy: [], proyectos: [], proveedores: [], traductor: [] });
  const [capture, setCapture] = useState<{ project?: string } | null>(null);
  const [present, setPresent] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ paths: string[]; index: number } | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const locked = useRef(false);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const stacksRef = useRef(stacks);
  stacksRef.current = stacks;

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
      push: (r) => {
        const t = tabRef.current;
        setStacks((s) => ({ ...s, [t]: [...s[t], r] }));
        navPush(() => setStacks((s) => ({ ...s, [t]: s[t].slice(0, -1) })));
      },
      back: navBack,
      openCapture: () => {
        const open = [...stacksRef.current[tabRef.current]].reverse().find((r) => r.kind === 'project');
        setCapture({ project: open?.kind === 'project' ? open.slug : undefined });
        navPush(() => setCapture(null));
      },
      openPresent: (slug) => {
        locked.current = true;
        setPresent(slug);
        navPushLocked(() => locked.current, () => setPresent(null));
      },
      openQR: (slug) => {
        setQr(slug);
        navPush(() => setQr(null));
      },
      openViewer: (paths, index) => {
        setViewer({ paths, index });
        navPush(() => setViewer(null));
      },
      openProfile: () => {
        setProfileOpen(true);
        navPush(() => setProfileOpen(false));
      },
    }),
    [userId, me, profiles],
  );

  const exitPresent = () => {
    locked.current = false;
    navBack();
  };

  const root = (t: Tab) =>
    t === 'hoy' ? <Today /> : t === 'proyectos' ? <Projects /> : t === 'proveedores' ? <Suppliers /> : <Translator />;

  const tabBtn = (t: Tab, label: string, Icon: typeof CalendarDays) => (
    <button className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
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
            {stacks[t].map((r, i) => (
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

      {capture && <CaptureSheet project={capture.project} onClose={navBack} />}
      {viewer && <PhotoViewer paths={viewer.paths} index={viewer.index} onClose={navBack} />}
      {qr && <QRScreen slug={qr} profile={me} onClose={navBack} />}
      {profileOpen && <ProfileSheet profile={me} myId={userId} onClose={navBack} />}
      {present && <Presentation slug={present} profile={me} onExit={exitPresent} />}
      {checked && me && !me.name && <NameSheet profile={me} />}
      <ToastHost />
    </Ctx.Provider>
  );
}
