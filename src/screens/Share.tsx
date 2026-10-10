import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { toBlob } from 'html-to-image';
import { Lock, QrCode, X, Copy, Share as ShareIcon } from 'lucide-react';
import { isSet, presenterFor, PROJECT_BY_SLUG, publicUrl, setPresenter, TEAM } from '../lib/content';
import type { Profile, Project, TeamMember } from '../lib/types';
import { copyText, toast } from '../lib/toast';
import { shareOrDownload } from '../lib/util';
import { Segmented, Sheet } from '../components/ui';
import { ProjectTextView } from '../components/ProjectText';

function useQr(url: string, width = 640) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width, errorCorrectionLevel: 'M' }).then(setSrc, () => setSrc(undefined));
  }, [url, width]);
  return src;
}

const zhTitle = (p: Project) => (isSet(p.zh.title) ? p.zh.title : p.name);
const photosOf = (p: Project) => p.photos.filter(isSet).map((x) => (x.startsWith('/') ? x : `/${x}`));

function QRPanel({ project, member }: { project: Project; member: TeamMember }) {
  const src = useQr(publicUrl(project.slug, member));
  return (
    <div className="qr-box">
      {src ? <img className="qr" src={src} alt="QR" /> : <div className="qr ph-empty" />}
      <div className="qr-title">{zhTitle(project)}</div>
      <div className="qr-sub">扫码查看 · {member.name} · Traevo Global</div>
    </div>
  );
}

function MemberPicker({ member, onChange }: { member: TeamMember; onChange: (m: TeamMember) => void }) {
  return (
    <Segmented
      value={member.slug}
      options={TEAM.map((t) => [t.slug, `Contacto: ${t.name}`] as [string, string])}
      onChange={(slug) => {
        setPresenter(slug);
        onChange(TEAM.find((t) => t.slug === slug)!);
      }}
    />
  );
}

/** QR a pantalla completa (desde Explicación). */
export function QRScreen({ slug, profile, onClose }: { slug: string; profile?: Profile; onClose: () => void }) {
  const project = PROJECT_BY_SLUG.get(slug)!;
  const [member, setMember] = useState(() => presenterFor(profile));
  const url = publicUrl(slug, member);
  return (
    <div className="full qr-screen">
      <button className="full-close" onClick={onClose} aria-label="Cerrar">
        <X size={22} />
      </button>
      <QRPanel project={project} member={member} />
      <div className="qr-foot">
        <MemberPicker member={member} onChange={setMember} />
        <button className="link small" onClick={() => copyText(url)}>
          <Copy size={14} /> {url.replace('https://', '')}
        </button>
      </div>
    </div>
  );
}

/** Modo presentación bloqueado: solo la explicación en chino y sus fotos. */
export function Presentation({ slug, profile, onExit }: { slug: string; profile?: Profile; onExit: () => void }) {
  const project = PROJECT_BY_SLUG.get(slug)!;
  const photos = photosOf(project);
  const [zoom, setZoom] = useState<number | null>(null);
  const [qr, setQr] = useState(false);
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const member = presenterFor(profile);

  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then((l) => (lock = l), () => {});
    document.documentElement.requestFullscreen?.().catch(() => {});
    return () => {
      lock?.release().catch(() => {});
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    setHolding(true);
    timer.current = setTimeout(() => {
      setHolding(false);
      onExit();
    }, 2000);
  };
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };

  const t = { ...project.zh, title: zhTitle(project) };
  return (
    <div className="present" onContextMenu={(e) => e.preventDefault()}>
      <ProjectTextView t={t} photos={photos} zh onPhoto={setZoom} />
      <button
        className={`lock ${holding ? 'holding' : ''}`}
        onPointerDown={start}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        aria-label="Mantén 2 s para salir"
      >
        <svg viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="16" />
        </svg>
        <Lock size={14} />
      </button>
      <button className="present-qr" onClick={() => setQr(true)} aria-label="QR">
        <QrCode size={26} />
      </button>
      {zoom !== null && (
        <div className="lightbox" onClick={() => setZoom(null)}>
          <img src={photos[zoom]} alt="" />
        </div>
      )}
      {qr && (
        <div className="full qr-screen inner" onClick={() => setQr(false)}>
          <QRPanel project={project} member={member} />
          <div className="qr-foot muted">Toca para volver</div>
        </div>
      )}
    </div>
  );
}

async function waitImages(node: HTMLElement) {
  await Promise.all(
    [...node.querySelectorAll('img')].map((img) =>
      img.complete && img.naturalWidth ? Promise.resolve() : img.decode().catch(() => {}),
    ),
  );
}

/** 长图 para WeChat: explicación en chino + contacto. */
export function WeChatImageSheet({ project, profile, onClose }: { project: Project; profile?: Profile; onClose: () => void }) {
  const [member, setMember] = useState(() => presenterFor(profile));
  const [out, setOut] = useState<{ file: File; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const node = useRef<HTMLDivElement>(null);
  const qr = useQr(publicUrl(project.slug, member), 360);
  const zh = project.zh;
  const photos = photosOf(project).slice(0, 6);

  useEffect(() => () => {
    if (out) URL.revokeObjectURL(out.url);
  }, [out]);

  useEffect(() => {
    if (!qr) return;
    let cancelled = false;
    void (async () => {
      setBusy(true);
      try {
        const el = node.current!;
        await waitImages(el);
        const opts = { pixelRatio: 1.5, backgroundColor: '#ffffff' };
        await toBlob(el, opts); // primera pasada: Safari a veces omite imágenes
        const blob = await toBlob(el, opts);
        if (!blob) throw new Error('No se pudo generar la imagen');
        if (!cancelled) setOut({ file: new File([blob], `traevo-${project.slug}.png`, { type: 'image/png' }), url: URL.createObjectURL(blob) });
      } catch (e) {
        toast((e as Error).message);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qr, project.slug]);

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
    <Sheet tall title="Imagen para WeChat" onClose={onClose} left={<button className="link" onClick={onClose}>Cerrar</button>}>
      <MemberPicker member={member} onChange={setMember} />
      <div className="pad">
        <button className="btn primary" disabled={!out || busy} onClick={() => out && shareOrDownload(out.file)}>
          <ShareIcon size={20} /> {busy ? 'Generando…' : 'Compartir / Guardar'}
        </button>
        <p className="foot">También puedes mantener pulsada la imagen para guardarla en Fotos.</p>
      </div>
      {out && <img className="wx-preview" src={out.url} alt="长图" />}

      <div className="wx-offscreen" aria-hidden>
        <div ref={node} className="wx" lang="zh-CN">
          <div className="wx-head">
            <div className="wx-seal">采</div>
            <div>
              <b>Traevo Global</b>
              <span>西班牙 · 中国 采购服务</span>
            </div>
          </div>
          <h1>{zhTitle(project)}</h1>
          {isSet(zh.summary) && <p>{zh.summary}</p>}
          {list('我们的需求', zh.needs)}
          {list('要求', zh.requirements)}
          {list('我们想了解', zh.questions)}
          {photos.map((src) => (
            <img key={src} className="wx-photo" src={src} alt="" />
          ))}
          <div className="wx-card">
            <div className="wx-card-main">
              <div className="wx-label">联系人</div>
              <div className="wx-name">{member.name}</div>
              <div className="wx-co">Traevo Global</div>
              {isSet(member.wechat) && <div>微信：{member.wechat}</div>}
              {isSet(member.whatsapp) && <div>WhatsApp：{member.whatsapp}</div>}
              {isSet(member.email) && <div>邮箱：{member.email}</div>}
              <div>网站：traevo.net</div>
            </div>
            <div className="wx-qrs">
              {isSet(member.wechatQr) && (
                <figure>
                  <img src={member.wechatQr.startsWith('/') ? member.wechatQr : `/${member.wechatQr}`} alt="" />
                  <figcaption>加微信</figcaption>
                </figure>
              )}
              {qr && (
                <figure>
                  <img src={qr} alt="" />
                  <figcaption>项目详情</figcaption>
                </figure>
              )}
            </div>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
