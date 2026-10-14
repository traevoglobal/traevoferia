import { useMemo, useState } from 'react';
import { ChevronRight, Presentation, Image as ImageIcon } from 'lucide-react';
import { useApp } from '../ctx';
import { db } from '../lib/db';
import { hasText, PROJECT_BY_SLUG, projectPhotos, PROJECTS } from '../lib/content';
import type { Project } from '../lib/types';
import { fmtDateTime, useLive } from '../lib/util';
import { saveNote } from '../lib/store';
import { EditField, Empty, NavBar, Person, Segmented, SyncPill } from '../components/ui';
import { SupplierRow } from '../components/SupplierRow';
import { WeChatImageSheet } from './Share';
import { ProjectTextView } from '../components/ProjectText';

export function Projects() {
  const { push } = useApp();
  const all = useLive(() => db.suppliers.toArray(), [], []);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of all) if (!s.deleted) for (const p of s.project_ids) m.set(p, (m.get(p) ?? 0) + 1);
    return m;
  }, [all]);

  const section = (group: Project['group'], title: string) => (
    <div className="group">
      <div className="group-title">{title}</div>
      <div className="list">
        {PROJECTS.filter((p) => p.group === group).map((p) => (
          <div key={p.slug} className="row tap" onClick={() => push({ kind: 'project', slug: p.slug })}>
            <span className="proj-icon" style={{ background: p.color }}>
              {p.name.replace(/^Cliente \d+:\s*/, '').charAt(0).toUpperCase()}
            </span>
            <span className="grow ellipsis">{p.name}</span>
            <span className="count">{counts.get(p.slug) ?? 0}</span>
            <ChevronRight size={18} className="chev" />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <NavBar center={<SyncPill />} />
      <h1 className="large-title">Proyectos</h1>
      {PROJECTS.length ? (
        <>
          {section('traevo', 'Traevo')}
          {section('clientes', 'Clientes')}
        </>
      ) : (
        <Empty>Los proyectos se descargan al sincronizar. Abre la app una vez con conexión y quedarán guardados en el móvil.</Empty>
      )}
    </>
  );
}

export function ProjectDetail({ slug }: { slug: string }) {
  const { openPresent, openViewer, me } = useApp();
  const p = PROJECT_BY_SLUG.get(slug);
  const [tab, setTab] = useState<'exp' | 'sup' | 'ana'>('exp');
  const [lang, setLang] = useState<'es' | 'zh'>('es');
  const [wx, setWx] = useState(false);
  const all = useLive(() => db.suppliers.toArray(), [], []);
  const suppliers = useMemo(
    () => all.filter((s) => !s.deleted && s.project_ids.includes(slug)).sort((a, b) => b.rating - a.rating || b.created_at.localeCompare(a.created_at)),
    [all, slug],
  );
  const note = useLive(() => db.notes.get(slug), [slug], undefined);
  if (!p)
    return (
      <>
        <NavBar back="Proyectos" />
        <Empty>Proyecto no disponible.</Empty>
      </>
    );
  const photos = projectPhotos(p);
  const text = lang === 'es' ? p.es : p.zh;

  return (
    <>
      <NavBar back="Proyectos" title={p.name} />
      <h1 className="large-title small">{p.name}</h1>
      {p.client && <p className="subtitle">{p.client}</p>}
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          ['exp', 'Explicación'],
          ['sup', `Proveedores (${suppliers.length})`],
          ['ana', 'Análisis'],
        ]}
      />

      {tab === 'exp' && (
        <>
          <div className="pad">
            <button className="btn primary" onClick={() => openPresent(slug)}>
              <Presentation size={20} /> Presentar
            </button>
          </div>
          <div className="pad">
            <button className="btn secondary" onClick={() => setWx(true)}>
              <ImageIcon size={20} /> Imagen para WeChat
            </button>
          </div>
          <Segmented value={lang} onChange={setLang} options={[['es', 'ES'], ['zh', '中文']]} />
          <div className="group">
            <div className="list card-pad">
              {hasText(text) || photos.length ? (
                <ProjectTextView t={text} photos={photos} zh={lang === 'zh'} onPhoto={(i) => openViewer(photos, i)} />
              ) : (
                <Empty>
                  Explicación vacía. Se rellena desde Claude Code: «Actualiza el proyecto {slug} con este texto/fotos».
                </Empty>
              )}
            </div>
          </div>
          {wx && <WeChatImageSheet project={p} profile={me} onClose={() => setWx(false)} />}
        </>
      )}

      {tab === 'sup' && (
        <div className="group">
          {suppliers.length ? (
            <div className="list">
              {suppliers.map((s) => (
                <SupplierRow key={s.id} s={s} />
              ))}
            </div>
          ) : (
            <Empty>Aún no hay proveedores vinculados.</Empty>
          )}
        </div>
      )}

      {tab === 'ana' && (
        <>
          <div className="group">
            <div className="group-title">Interno · no se muestra a proveedores</div>
            <div className="list">
              <EditField
                label="Objetivo de precio / MOQ"
                multiline
                value={note?.target ?? ''}
                placeholder="Ej.: < 2,5 $/ud FOB, MOQ ≤ 500"
                onSave={(v) => saveNote(slug, { target: v })}
              />
              <EditField
                label="Competencia"
                multiline
                value={note?.competition ?? ''}
                placeholder="Quién lo vende ya en España y a qué precio"
                onSave={(v) => saveNote(slug, { competition: v })}
              />
            </div>
          </div>
          <div className="group">
            <div className="group-title">Conclusiones</div>
            <div className="list">
              <EditField
                label="Texto (editable)"
                multiline
                value={note?.conclusions ?? ''}
                placeholder="Aún sin conclusiones"
                onSave={(v) => saveNote(slug, { conclusions: v })}
              />
            </div>
            {note?.updated_at && note.updated_by && (
              <div className="group-foot">
                Última edición: <Person id={note.updated_by} /> · {fmtDateTime(note.updated_at)}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
