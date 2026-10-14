import { useEffect, useRef, useState } from 'react';
import { toBlob } from 'html-to-image';
import { X, Share as ShareIcon } from 'lucide-react';
import { isSet, presenterFor, PROJECT_BY_SLUG, projectPhotos, setPresenter, TEAM } from '../lib/content';
import type { Profile, Project, TeamMember } from '../lib/types';
import { toast } from '../lib/toast';
import { shareOrDownload } from '../lib/util';
import { useComposableUrls } from '../lib/photos';
import { Empty, PhotoImg, Segmented, Sheet } from '../components/ui';
import { ProjectTextView } from '../components/ProjectText';

const zhTitle = (p: Project) => (isSet(p.zh.title) ? p.zh.title : p.name);

function MemberPicker({ member, onChange }: { member: TeamMember; onChange: (m: TeamMember) => void }) {
  if (!TEAM.length) return null;
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

/** Modo presentación: solo la explicación en chino y sus fotos. */
export function Presentation({ slug, onExit }: { slug: string; onExit: () => void }) {
  const project = PROJECT_BY_SLUG.get(slug);
  const [zoom, setZoom] = useState<number | null>(null);

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

  const photos = project ? projectPhotos(project) : [];
  return (
    <div className="present" onContextMenu={(e) => e.preventDefault()}>
      {project ? (
        <ProjectTextView t={{ ...project.zh, title: zhTitle(project) }} photos={photos} zh onPhoto={setZoom} />
      ) : (
        <Empty>Proyecto no disponible.</Empty>
      )}
      <button className="present-close" onClick={onExit}>
        <X size={18} strokeWidth={2.4} /> Salir
      </button>
      {zoom !== null && (
        <div className="lightbox" onClick={() => setZoom(null)}>
          <PhotoImg path={photos[zoom]} />
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

/** 长图 para WeChat: explicación en chino + contacto. Las fotos y el QR de WeChat salen del bucket privado. */
export function WeChatImageSheet({ project, profile, onClose }: { project: Project; profile?: Profile; onClose: () => void }) {
  const [member, setMember] = useState(() => presenterFor(profile));
  const [out, setOut] = useState<{ file: File; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const node = useRef<HTMLDivElement>(null);
  const zh = project.zh;
  const photos = useComposableUrls(projectPhotos(project).slice(0, 6));
  const wechatQr = useComposableUrls(isSet(member.wechatQr) ? [member.wechatQr] : []);

  useEffect(() => () => {
    if (out) URL.revokeObjectURL(out.url);
  }, [out]);

  useEffect(() => {
    if (!photos || !wechatQr) return;
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
  }, [photos, wechatQr, project.slug]);

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
          <ShareIcon size={20} /> {busy || !out ? 'Generando…' : 'Compartir / Guardar'}
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
          {photos?.filter(Boolean).map((src) => (
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
            {wechatQr?.[0] && (
              <div className="wx-qrs">
                <figure>
                  <img src={wechatQr[0]} alt="" />
                  <figcaption>加微信</figcaption>
                </figure>
              </div>
            )}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
