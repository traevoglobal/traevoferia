// Traevo Feria · Edge Function "ai-proxy" (Deno, sin dependencias).
// Rutas: POST /ai-proxy/translate · /ai-proxy/summarize · /ai-proxy/extract
// Secrets: GEMINI_API_KEY (obligatorio), GEMINI_MODEL (opcional). SUPABASE_URL y SUPABASE_ANON_KEY los pone Supabase.
// Solo atiende a usuarios de feria_members (comprobado con su propio token vía RPC).
// Las traducciones se cachean en public.ai_cache (sha256 del texto → traducción).

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (req: Request) => Response | Promise<Response>): void };

const env = (k: string) => Deno.env.get(k) ?? '';

/** Si un modelo deja de existir (404) o está saturado, se prueba el siguiente. */
const MODELS = [
  ...new Set([env('GEMINI_MODEL'), 'gemini-flash-latest', 'gemini-3.5-flash', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite'].filter(Boolean)),
];

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' } });

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/* ---------- Supabase (con el token del usuario: RLS decide) ---------- */
function sbHeaders(req: Request): Record<string, string> {
  return {
    authorization: req.headers.get('authorization') ?? '',
    apikey: req.headers.get('apikey') || env('SUPABASE_ANON_KEY'),
    'content-type': 'application/json',
  };
}

async function isMember(req: Request): Promise<boolean> {
  if (!req.headers.get('authorization')?.startsWith('Bearer ')) return false;
  const r = await fetch(`${env('SUPABASE_URL')}/rest/v1/rpc/feria_is_member`, { method: 'POST', headers: sbHeaders(req), body: '{}' });
  return r.ok && (await r.json()) === true;
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function cacheGet(req: Request, hash: string): Promise<string | null> {
  try {
    const r = await fetch(`${env('SUPABASE_URL')}/rest/v1/ai_cache?select=result&hash=eq.${hash}`, { headers: sbHeaders(req) });
    if (!r.ok) return null;
    const rows = await r.json();
    return rows[0]?.result ?? null;
  } catch {
    return null;
  }
}

async function cachePut(req: Request, hash: string, kind: string, result: string) {
  try {
    await fetch(`${env('SUPABASE_URL')}/rest/v1/ai_cache`, {
      method: 'POST',
      headers: { ...sbHeaders(req), prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({ hash, kind, result }),
    });
  } catch {
    /* la caché es opcional */
  }
}

/* ---------- Gemini ---------- */
type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

async function gemini(parts: Part[], system: string, schema?: object): Promise<string> {
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      thinkingConfig: { thinkingLevel: 'minimal' },
      ...(schema ? { responseMimeType: 'application/json', responseSchema: schema } : {}),
    },
  });
  let last = '';
  for (const model of MODELS) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env('GEMINI_API_KEY') },
      body,
    });
    if (res.ok) {
      const data = await res.json();
      const text: string = (data.candidates?.[0]?.content?.parts ?? [])
        .filter((p: { thought?: boolean }) => !p.thought)
        .map((p: { text?: string }) => p.text ?? '')
        .join('');
      if (text.trim()) return text.trim();
      last = `${model}: respuesta vacía`;
      continue;
    }
    last = `${model} ${res.status}: ${(await res.text()).slice(0, 200)}`;
    if (res.status === 401 || res.status === 403) throw new HttpError(502, `Clave de Gemini no válida (${res.status})`);
  }
  throw new HttpError(502, `Gemini no disponible. ${last}`);
}

/* ---------- /translate ---------- */
const TR_ES_ZH =
  'Traductor profesional de español a chino simplificado (zh-CN) para negociar con proveedores en ferias de China. Frases cortas, tono profesional y cortés, vocabulario de comercio exterior (起订量, 样品, 交期, 报价, FOB...). Devuelve SOLO la traducción, sin comillas, pinyin ni notas.';
const TR_ZH_ES =
  'Traductor profesional de chino a español para negociar con proveedores en ferias de China. Español natural y claro. Devuelve SOLO la traducción, sin comillas ni notas.';

async function translate(req: Request, body: { text?: string; dir?: string }) {
  const text = (body.text ?? '').trim();
  if (!text) return { text: '', cached: false };
  if (text.length > 8000) throw new HttpError(400, 'Texto demasiado largo');
  const dir = body.dir === 'zh-es' ? 'zh-es' : 'es-zh';
  const hash = await sha256(`translate:${dir}:${text}`);
  const hit = await cacheGet(req, hash);
  if (hit !== null) return { text: hit, cached: true };
  const out = await gemini([{ text }], dir === 'zh-es' ? TR_ZH_ES : TR_ES_ZH);
  await cachePut(req, hash, 'translate', out);
  return { text: out, cached: false };
}

/* ---------- /summarize (conclusiones de un proyecto) ---------- */
const SUMMARY_SYSTEM = `Eres analista de compras de Traevo Global (agencia de compras España-China).
Con los datos de un proyecto y los proveedores vistos en feria, escribe conclusiones en español, en texto plano con guiones, máximo 250 palabras:
1) Mejores candidatos (máx. 3) y por qué.
2) Precio y MOQ frente al objetivo.
3) Riesgos o dudas abiertas.
4) Siguientes pasos concretos.
Si faltan datos, dilo claramente. No inventes cifras.`;

async function summarize(body: { project?: unknown; target?: string; competition?: string; suppliers?: unknown[] }) {
  const payload = {
    proyecto: body.project ?? {},
    objetivo_precio_moq: body.target ?? '',
    competencia: body.competition ?? '',
    proveedores: (body.suppliers ?? []).slice(0, 80),
  };
  return { text: await gemini([{ text: JSON.stringify(payload) }], SUMMARY_SYSTEM) };
}

/* ---------- /extract (clasificar un proveedor a partir de fotos y nota) ---------- */
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

  const raw = JSON.parse(await gemini(parts, EXTRACT_SYSTEM, EXTRACT_SCHEMA));
  const out: Record<string, unknown> = {};
  for (const k of STR_FIELDS) out[k] = typeof raw[k] === 'string' ? raw[k].trim() : '';
  if (!['fábrica', 'trading'].includes(out.kind as string)) out.kind = '';
  const slugs = new Set(projects.map((p) => p.slug));
  out.project_ids = Array.isArray(raw.project_ids) ? raw.project_ids.filter((s: unknown) => typeof s === 'string' && slugs.has(s)) : [];
  out.tags = Array.isArray(raw.tags)
    ? raw.tags.filter((s: unknown) => typeof s === 'string' && s.trim()).map((s: string) => s.trim().toLowerCase()).slice(0, 6)
    : [];
  out.rating = Math.max(0, Math.min(5, Math.round(Number(raw.rating) || 0)));
  return out;
}

/* ---------- Entrada ---------- */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  if (!env('GEMINI_API_KEY')) return json({ error: 'Falta el secret GEMINI_API_KEY' }, 500);
  if (!(await isMember(req).catch(() => false))) return json({ error: 'No autorizado' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }
  const route = new URL(req.url).pathname.split('/').filter(Boolean).pop();
  try {
    switch (route) {
      case 'translate':
        return json(await translate(req, body));
      case 'summarize':
        return json(await summarize(body));
      case 'extract':
        return json(await extract(body));
      default:
        return json({ error: 'Ruta desconocida' }, 404);
    }
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 502;
    return json({ error: e instanceof Error ? e.message : String(e) }, status);
  }
});
