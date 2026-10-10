import type { Config } from '@netlify/functions';

const FALLBACK_MODEL = 'gemini-2.5-flash-lite';
const env = (k: string) => Netlify.env.get(k) ?? '';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

async function getUser(req: Request): Promise<{ id: string } | null> {
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  const r = await fetch(`${env('VITE_SUPABASE_URL')}/auth/v1/user`, {
    headers: { authorization: auth, apikey: env('VITE_SUPABASE_ANON_KEY') },
  });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.id ? u : null;
}

type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

async function gemini(parts: Part[], system: string, schema?: object, temperature = 0.2): Promise<string> {
  const primary = env('GEMINI_MODEL') || 'gemini-2.5-flash';
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature,
      thinkingConfig: { thinkingBudget: 0 },
      ...(schema ? { responseMimeType: 'application/json', responseSchema: schema } : {}),
    },
  });
  const call = (model: string) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env('GEMINI_API_KEY') },
      body,
    });
  let res = await call(primary);
  if ((res.status === 429 || res.status === 503) && primary !== FALLBACK_MODEL) res = await call(FALLBACK_MODEL);
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text: string = (data.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('');
  if (!text.trim()) throw new Error('Respuesta vacía de la IA');
  return text.trim();
}

const STR_FIELDS = [
  'company', 'company_zh', 'contact', 'role', 'wechat', 'phone', 'email', 'web', 'booth', 'city', 'kind',
  'products', 'price', 'moq', 'incoterm', 'lead_time', 'samples', 'agreement', 'next_step', 'summary',
] as const;

const S = { type: 'STRING' };
const EXTRACT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    ...Object.fromEntries(STR_FIELDS.map((k) => [k, S])),
    project_ids: { type: 'ARRAY', items: S },
    tags: { type: 'ARRAY', items: S },
    rating: { type: 'INTEGER' },
  },
  required: [...STR_FIELDS, 'project_ids', 'tags', 'rating'],
};

const EXTRACT_SYSTEM = `Eres el asistente de compras de Traevo Global (agencia de compras España-China) en ferias de China.
Recibes fotos de la visita a un proveedor (tarjetas de visita, stand, productos, catálogos, listas de precios, etiquetas) y la nota del comprador (dictada en español, puede tener errores).
Extrae datos SOLO si aparecen o se deducen con claridad. Si no, cadena vacía. No inventes.
- company: nombre de la empresa en caracteres latinos tal como aparece. company_zh: nombre en chino.
- contact: persona de contacto. role: cargo. wechat: ID de WeChat. phone: con prefijo si aparece. email. web.
- booth: stand (p. ej. 11.2 C23). city: ciudad o provincia, en español.
- kind: exactamente "fábrica", "trading" o "".
- products: productos principales, en español, breve.
- price: precios con moneda y unidad. moq: cantidad mínima con unidad. incoterm: FOB, EXW, CIF... lead_time: plazo de producción o entrega. samples: muestras (precio, plazo, si son gratis).
- agreement: lo pactado según la nota. next_step: siguiente paso concreto según la nota.
- project_ids: slugs de la lista de proyectos con los que encaja (puede estar vacío). Solo slugs de la lista.
- tags: 2 a 5 etiquetas cortas en español, en minúsculas.
- rating: interés de 0 a 5 según la nota y lo visto (0 si no hay base).
- summary: 1 o 2 frases en español con lo esencial.`;

type ProjectIn = { slug: string; name: string; summary?: string };

async function extract(body: { photos?: string[]; note?: string; projects?: ProjectIn[] }) {
  const projects = (body.projects ?? []).slice(0, 30);
  const text = [
    `Nota del comprador: ${body.note?.trim() || '(sin nota)'}`,
    'Proyectos:',
    ...projects.map((p) => `- ${p.slug}: ${p.name}${p.summary ? ` — ${p.summary.slice(0, 300)}` : ''}`),
  ].join('\n');
  const parts: Part[] = [{ text }];
  for (const b64 of (body.photos ?? []).slice(0, 4)) parts.push({ inline_data: { mime_type: 'image/jpeg', data: b64 } });

  const raw = JSON.parse(await gemini(parts, EXTRACT_SYSTEM, EXTRACT_SCHEMA, 0.1));
  const out: Record<string, unknown> = {};
  for (const k of STR_FIELDS) out[k] = typeof raw[k] === 'string' ? raw[k].trim() : '';
  if (!['fábrica', 'trading'].includes(out.kind as string)) out.kind = '';
  const slugs = new Set(projects.map((p) => p.slug));
  out.project_ids = Array.isArray(raw.project_ids) ? raw.project_ids.filter((s: unknown) => typeof s === 'string' && slugs.has(s)) : [];
  out.tags = Array.isArray(raw.tags) ? raw.tags.filter((s: unknown) => typeof s === 'string' && s.trim()).map((s: string) => s.trim().toLowerCase()).slice(0, 6) : [];
  out.rating = Math.max(0, Math.min(5, Math.round(Number(raw.rating) || 0)));
  return out;
}

async function translate(body: { text?: string; dir?: string }) {
  const text = (body.text ?? '').trim();
  if (!text) return { text: '' };
  const system =
    body.dir === 'zh-es'
      ? 'Traductor profesional de chino a español para negociar con proveedores en ferias de China. Español natural y claro. Devuelve SOLO la traducción, sin comillas ni notas.'
      : 'Traductor profesional de español a chino simplificado (zh-CN) para negociar con proveedores en ferias de China. Frases cortas, tono profesional y cortés, vocabulario de comercio exterior (起订量, 样品, 交期, 报价, FOB...). Devuelve SOLO la traducción, sin comillas, pinyin ni notas.';
  return { text: await gemini([{ text }], system, undefined, 0.2) };
}

async function conclude(body: { project?: Record<string, unknown>; target?: string; competition?: string; suppliers?: Record<string, unknown>[] }) {
  const system = `Eres analista de compras de Traevo Global (agencia de compras España-China).
Con los datos de un proyecto y los proveedores vistos en feria, escribe conclusiones en español, en texto plano con guiones, máximo 250 palabras:
1) Mejores candidatos (máx. 3) y por qué.
2) Precio y MOQ frente al objetivo.
3) Riesgos o dudas abiertas.
4) Siguientes pasos concretos.
Si faltan datos, dilo claramente. No inventes cifras.`;
  const payload = {
    proyecto: body.project ?? {},
    objetivo_precio_moq: body.target ?? '',
    competencia: body.competition ?? '',
    proveedores: (body.suppliers ?? []).slice(0, 80),
  };
  return { text: await gemini([{ text: JSON.stringify(payload) }], system, undefined, 0.3) };
}

export default async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  const user = await getUser(req).catch(() => null);
  if (!user) return json({ error: 'No autorizado' }, 401);
  if (!env('GEMINI_API_KEY')) return json({ error: 'Falta GEMINI_API_KEY' }, 500);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }
  try {
    switch (body.mode) {
      case 'extract':
        return json(await extract(body as Parameters<typeof extract>[0]));
      case 'translate':
        return json(await translate(body as Parameters<typeof translate>[0]));
      case 'conclude':
        return json(await conclude(body as Parameters<typeof conclude>[0]));
      default:
        return json({ error: 'Modo desconocido' }, 400);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
};

export const config: Config = { path: '/api/ai' };
