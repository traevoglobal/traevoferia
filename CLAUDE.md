# Traevo Feria

PWA móvil (Vite + React + TS) para Javi y Rafa en la Feria de Cantón. GitHub Pages (repo público traevoglobal/traevoferia, base `/traevoferia/`) + Supabase ("Traevo Global S.L") + Gemini vía Edge Function. Nunca tocar traevo.net.

## Dónde está cada cosa
- `content/projects/<slug>.json`: explicación de cada proyecto (es/zh). Fotos en `public/projects/<slug>/`, referenciadas como `/projects/<slug>/<archivo>.jpg` en `photos`.
- `content/team.json`: contactos de las tarjetas públicas (los valores "TODO" no se muestran). Imagen del QR de WeChat en `public/team/`.
- `scripts/build-public.mjs`: genera `dist/p/<slug>/<persona>/index.html` (páginas de los QR, sin JS). Base path y URL pública en `content/site.json` (lo leen vite.config, content.ts y este script); rutas de `public/` siempre con `asset()`.
- `src/lib/`: `nav.ts` (navegación: cada entrada del historial guarda la pantalla completa; nunca pilas paralelas), `db.ts` (Dexie), `sync.ts` (cola de salida, pull incremental por `synced_at`, realtime, perfiles), `store.ts` (escrituras locales), `ai.ts` (cliente IA y auto-clasificación), `photos.ts` (compresión y URLs firmadas), `content.ts` (proyectos, equipo, ferias por fecha).
- `src/screens/`: Hoy, Proyectos, Proveedores, Traductor, Captar, Presentación/QR/长图 (`Share.tsx`), Login/Perfil (`Auth.tsx`).
- `src/styles.css`: único CSS. `supabase/functions/ai-proxy/index.ts`: IA (/translate con caché en `ai_cache`, /summarize, /extract); secret `GEMINI_API_KEY`.
- `supabase/schema.sql`: esquema idempotente (perfiles en `profiles` o `feria_profiles`, LWW por trigger, RLS solo para `feria_members`).
- `.github/workflows/pages.yml`: build + deploy a Pages en cada push a main (variables VITE_ en GitHub).

## Reglas
- "Actualiza el proyecto X con este texto/fotos": editar solo `content/projects/<slug>.json`; rellenar `es`; escribir tú la versión `zh` (chino simplificado, frases cortas, tono profesional, vocabulario de comercio exterior); fotos en `public/projects/<slug>/` comprimidas a 1600px (lado largo) y añadidas a `photos`; `npm run build`; commit.
- Nunca push salvo que diga "despliega" (cada push a main publica en Pages).
- Repo público: ningún secreto ni dato personal en el código (emails, claves). La anon key solo en variables de GitHub.
- Dependencias cerradas: no añadir ninguna sin preguntar. Sin frameworks de UI ni tests; verificar con `npm run build`.
- Todo en español, estilo iOS. Lo esencial (captura offline y sincronización) por delante de los extras.
