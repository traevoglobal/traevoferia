// Genera private/content.sql con el contenido privado (proyectos, equipo, horario) de private/content/
// para pegarlo en el SQL Editor de Supabase. private/ está en .gitignore: nunca llega al repo ni a la web.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), 'private');
const dir = join(root, 'content');
if (!existsSync(dir)) throw new Error('Falta private/content/ (proyectos, team.json, horario.json)');

const read = (...p) => JSON.parse(readFileSync(join(dir, ...p), 'utf8'));
const projects = readdirSync(join(dir, 'projects'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => read('projects', f))
  .sort((a, b) => a.order - b.order);
const rows = { projects, team: read('team.json'), horario: read('horario.json') };

const literal = (v) => {
  const s = JSON.stringify(v);
  if (s.includes('$json$')) throw new Error('El contenido no puede incluir "$json$"');
  return `$json$${s}$json$::jsonb`;
};

const sql = `-- Contenido privado de Traevo Feria (generado con npm run content:sql). Pegar entero en el SQL Editor.
-- Requiere la tabla feria_content (supabase/schema.sql, apartado 8b).
insert into public.feria_content (key, data) values
${Object.entries(rows).map(([k, v]) => `  ('${k}', ${literal(v)})`).join(',\n')}
on conflict (key) do update set data = excluded.data, updated_at = now()
  where public.feria_content.data is distinct from excluded.data;
`;

writeFileSync(join(root, 'content.sql'), sql);
console.log(`private/content.sql: ${projects.length} proyectos, equipo y horario (${Math.round(sql.length / 1024)} KB)`);
