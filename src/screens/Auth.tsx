import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { AUTH_STORAGE_KEY, supabase, supabaseConfigured } from '../lib/supabase';
import { saveProfile } from '../lib/sync';
import { asset, presenterFor, setPresenter, TEAM } from '../lib/content';
import type { Profile } from '../lib/types';
import { toast } from '../lib/toast';
import { PALETTE } from '../lib/util';
import { Avatar, Segmented, Sheet } from '../components/ui';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError(error.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos' : error.message);
    setBusy(false);
  };

  return (
    <form className="login" onSubmit={submit}>
      <img src={asset('icons/icon-192.png')} alt="" className="login-logo" />
      <h1>Traevo Feria</h1>
      <p className="muted">Feria de Cantón · 2026</p>
      {!supabaseConfigured && <p className="error">Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.</p>}
      <div className="list">
        <input className="login-input" type="email" autoComplete="username" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input
          className="login-input"
          type="password"
          autoComplete="current-password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && <p className="error">{error}</p>}
      <button className="btn primary" disabled={busy || !email || !password}>
        {busy ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}

function ProfileForm({ profile, onDone, cta }: { profile: Profile; onDone: () => void; cta: string }) {
  const [name, setName] = useState(profile.name);
  const [color, setColor] = useState(profile.color || PALETTE[0]);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await saveProfile({ ...profile, name: name.trim(), color });
      onDone();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="group">
        <div className="list">
          <div className="field">
            <label>Tu nombre</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Javi" autoComplete="given-name" />
          </div>
        </div>
      </div>
      <div className="group">
        <div className="group-title">Color</div>
        <div className="colors">
          {PALETTE.map((c) => (
            <button key={c} className={c === color ? 'on' : ''} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
          ))}
        </div>
      </div>
      <div className="pad">
        <button className="btn primary" disabled={busy || !name.trim()} onClick={save}>
          {cta}
        </button>
      </div>
    </>
  );
}

/** Primer login: pedir el nombre (no se puede cerrar). */
export function NameSheet({ profile }: { profile: Profile }) {
  return (
    <Sheet title="¿Cómo te llamas?" onClose={() => {}}>
      <p className="pad muted">Se mostrará junto a todo lo que subas.</p>
      <ProfileForm profile={profile} onDone={() => {}} cta="Continuar" />
    </Sheet>
  );
}

export function ProfileSheet({ profile, myId, onClose }: { profile?: Profile; myId: string; onClose: () => void }) {
  const p = profile ?? { id: myId, name: '', color: '' };
  const [presenter, setP] = useState(() => presenterFor(profile).slug);
  const logout = async () => {
    if (!confirm('¿Cerrar sesión? Lo pendiente se queda guardado en este móvil.')) return;
    onClose();
    // Sin red y con el token caducado, supabase-js no borra la sesión guardada (y tarda ~20 s en rendirse): la borramos aquí.
    const { error } = navigator.onLine ? await supabase.auth.signOut() : { error: true };
    if (error) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      history.replaceState(null, '', location.pathname);
      location.reload();
    }
  };
  return (
    <Sheet title="Perfil" onClose={onClose} right={<button className="link" onClick={onClose}>OK</button>}>
      <div className="profile-head">
        <Avatar id={myId} size={64} />
      </div>
      <ProfileForm
        profile={p}
        cta="Guardar"
        onDone={() => {
          toast('Guardado');
          onClose();
        }}
      />
      <div className="group">
        <div className="group-title">Tarjeta de contacto en los QR</div>
        <Segmented
          value={presenter}
          options={TEAM.map((t) => [t.slug, t.name] as [string, string])}
          onChange={(v) => {
            setP(v);
            setPresenter(v);
          }}
        />
      </div>
      <div className="pad">
        <button className="btn plain danger" onClick={logout}>
          <LogOut size={18} /> Cerrar sesión
        </button>
      </div>
    </Sheet>
  );
}
