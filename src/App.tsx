import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { CalendarClock, Factory, Presentation as PresentIcon, QrCode, TriangleAlert } from 'lucide-react';
import { Ctx, type AppCtx } from './ctx';
import { AUTH_STORAGE_KEY, setMyId, supabase } from './lib/supabase';
import { db } from './lib/db';
import { ensureProfile, startSync } from './lib/sync';
import { recoverRecordings, repairMedia } from './lib/store';
import { toast } from './lib/toast';
import { navBack, keptStack, navInit, navOpen, navPush, navTab, useNav, type Overlay, type Tab } from './lib/nav';
import { useToast } from './lib/toast';
import { useLive, uuid } from './lib/util';
import { loadContent, useContentVersion } from './lib/content';
import { PhotoViewer } from './components/ui';
import { Login, NameSheet, ProfileSheet } from './screens/Auth';
import { LineaList, Lineas, Presentation } from './screens/Presentar';
import { FichaSheet, Proveedores } from './screens/Proveedores';
import { Itinerario } from './screens/Itinerario';
import { Tarjeta } from './screens/Tarjeta';

const TABS: Tab[] = ['presentar', 'proveedores', 'itinerario', 'tarjeta'];

/** Sesión guardada en el móvil. supabase-js la da por nula si el token caducó y no hay red para renovarlo,
    pero no la borra: la usamos para seguir usando la app sin conexión. Se renueva sola al volver la red. */
function storedSession(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) ?? 'null') as Session | null;
    return s?.user?.id && s.refresh_token ? s : null;
  } catch {
    return null;
  }
}

/** Sin instalar en pantalla de inicio, iOS puede borrar los datos del navegador a los 7 días sin uso. */
const standalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

function InstallBanner() {
  if (standalone()) return null;
  return (
    <div className="install-banner">
      <TriangleAlert size={16} /> Instala en pantalla de inicio o iOS puede borrar tus datos a los 7 días
    </div>
  );
}

function ToastHost() {
  const msg = useToast();
  return msg ? <div className="toast">{msg}</div> : null;
}

export default function App() {
  // Arranque inmediato con la sesión guardada: sin red, getSession tarda ~20 s en rendirse.
  const [session, setSession] = useState<Session | null | undefined>(() => storedSession() ?? undefined);
  // Contenido privado guardado en el móvil: se carga antes de pintar.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void loadContent()
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? storedSession()));
    const { data } = supabase.auth.onAuthStateChange((e, s) => setSession(s ?? (e === 'SIGNED_OUT' ? null : storedSession())));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined || !ready) return null;
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
  useContentVersion(); // repinta si llega contenido nuevo de Supabase
  const profilesArr = useLive(() => db.profiles.toArray(), [], []);
  const profiles = useMemo(() => new Map(profilesArr.map((p) => [p.id, p])), [profilesArr]);
  const me = profiles.get(userId);
  const [checked, setChecked] = useState(false);

  useState(navInit);
  const nav = useNav();
  const tab = nav.tab;

  useEffect(() => {
    // Antes de nada: grabaciones cortadas por un cierre y fotos/audios que hubieran quedado fuera de su ficha.
    void recoverRecordings()
      .then((n) => n && toast(n === 1 ? 'Recuperada 1 nota de voz que se estaba grabando' : `Recuperadas ${n} notas de voz que se estaban grabando`))
      .then(repairMedia)
      .catch(console.error);
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
      openFicha: (o) => navOpen({ kind: 'ficha', id: o?.id ?? uuid(), proyecto: o?.proyecto }),
      openPresent: (id) => navOpen({ kind: 'present', id, ficha: uuid() }),
      openViewer: (paths, index) => navOpen({ kind: 'viewer', paths, index }),
      openProfile: () => navOpen({ kind: 'profile' }),
    }),
    [userId, me, profiles],
  );

  const overlay = (o: Overlay, i: number) => {
    switch (o.kind) {
      case 'present':
        return <Presentation key={i} id={o.id} ficha={o.ficha} onExit={navBack} />;
      case 'ficha':
        return <FichaSheet key={`${i}-${o.id}`} id={o.id} proyecto={o.proyecto} onClose={navBack} />;
      case 'viewer':
        return <PhotoViewer key={i} paths={o.paths} index={o.index} onClose={navBack} />;
      case 'profile':
        return <ProfileSheet key={i} profile={me} myId={userId} onClose={navBack} />;
    }
  };

  const root = (t: Tab) =>
    t === 'presentar' ? <Lineas /> : t === 'proveedores' ? <Proveedores /> : t === 'itinerario' ? <Itinerario /> : <Tarjeta />;

  const tabBtn = (t: Tab, label: string, Icon: typeof Factory) => (
    <button className={`tab ${tab === t ? 'on' : ''}`} onClick={() => navTab(t)}>
      <Icon size={26} strokeWidth={tab === t ? 2.4 : 1.9} />
      <span>{label}</span>
    </button>
  );

  return (
    <Ctx.Provider value={ctx}>
      <div className={`app ${standalone() ? '' : 'unsafe'}`}>
        {TABS.map((t) => (
          <div key={t} className={`tab-pane ${t === tab ? 'active' : ''}`}>
            <div className="view">{root(t)}</div>
            {keptStack(t).map((r, i) => (
              <div key={`${i}-${r.linea}`} className="view pushed">
                <LineaList linea={r.linea} />
              </div>
            ))}
          </div>
        ))}
        <nav className="tabbar">
          {tabBtn('presentar', 'Presentar', PresentIcon)}
          {tabBtn('proveedores', 'Proveedores', Factory)}
          {tabBtn('itinerario', 'Itinerario', CalendarClock)}
          {tabBtn('tarjeta', 'Mi tarjeta', QrCode)}
        </nav>
      </div>

      {nav.overlays.map(overlay)}
      {checked && me && !me.name && <NameSheet profile={me} />}
      <InstallBanner />
      <ToastHost />
    </Ctx.Provider>
  );
}
