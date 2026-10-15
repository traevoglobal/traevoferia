import { useState } from 'react';
import { UserRound } from 'lucide-react';
import { useApp } from '../ctx';
import { TARJETA, quienDe } from '../lib/content';
import { useAsset } from '../lib/assets';
import { Avatar, Empty, NavBar, Segmented } from '../components/ui';

function Qr({ path, label }: { path?: string; label: string }) {
  const url = useAsset(path);
  if (!path) return null;
  return (
    <figure className="qr">
      {url ? <img src={url} alt={label} draggable={false} /> : <div className="qr-missing">Falta la imagen</div>}
      <figcaption>{label}</figcaption>
    </figure>
  );
}

/** Mi tarjeta: QR de WeChat y Alipay, WeChat ID y empresa. Todo del móvil, sin red. */
export function Tarjeta() {
  const { me, myId, openProfile } = useApp();
  const personas = TARJETA?.personas ?? [];
  const [sel, setSel] = useState(() => quienDe(me) || personas[0]?.quien || '');
  const p = personas.find((x) => x.quien === sel) ?? personas[0];
  return (
    <>
      <NavBar
        right={
          <button className="icon-btn" onClick={openProfile} aria-label="Perfil">
            {me?.name ? <Avatar id={myId} size={34} /> : <UserRound size={24} />}
          </button>
        }
      />
      {!TARJETA || !p ? (
        <Empty>La tarjeta se carga del contenido privado al entrar con conexión.</Empty>
      ) : (
        <div className="card-screen">
          {personas.length > 1 && (
            <Segmented value={p.quien} options={personas.map((x) => [x.quien, x.nombre] as [string, string])} onChange={setSel} />
          )}
          <div className="card-co">
            {TARJETA.empresa_zh && (
              <div className="card-zh" lang="zh-CN">
                {TARJETA.empresa_zh}
              </div>
            )}
            <div className="card-en">{TARJETA.empresa_en}</div>
          </div>
          <div className="card-name">{p.nombre}</div>
          <div className="card-wx">
            <span>WeChat ID</span>
            <b>{p.wechat_id}</b>
          </div>
          <div className="qrs">
            <Qr path={p.wechat_qr} label="WeChat 微信" />
            <Qr path={p.alipay_qr} label="Alipay 支付宝" />
          </div>
        </div>
      )}
    </>
  );
}
