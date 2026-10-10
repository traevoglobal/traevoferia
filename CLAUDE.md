# Traevo Feria

PWA móvil (Vite + React + TS) para Javi y Rafa en la Feria de Cantón. Netlify (proyecto "traevo-feria", nunca tocar traevo.net) + Supabase ("Traevo Global S.L") + Gemini.

## Dónde está cada cosa
- `content/projects/<slug>.json`: explicación de cada proyecto (es/zh). Fotos en `public/projects/<slug>/`, referenciadas como `/projects/<slug>/<archivo>.jpg` en `photos`.
- `content/team.json`: contactos de las tarjetas públicas (los valores "TODO" no se muestran). Imagen del QR de WeChat en `public/team/`.
- `scripts/build-public.mjs`: genera `dist/p/<slug>/<persona>/index.html` (páginas de los QR, sin JS). URL base en `PUBLIC_BASE_URL` (`src/lib/content.ts`).
- `src/lib/`: `db.ts` (Dexie), `sync.ts` (cola de salida, pull incremental por `synced_at`, realtime, perfiles), `store.ts` (escrituras locales), `ai.ts` (cliente IA y auto-clasificación), `photos.ts` (compresión y URLs firmadas), `content.ts` (proyectos, equipo, ferias por fecha).
- `src/screens/`: Hoy, Proyectos, Proveedores, Traductor, Captar, Presentación/QR/长图 (`Share.tsx`), Login/Perfil (`Auth.tsx`).
- `src/styles.css`: único CSS. `netlify/functions/ai.ts`: `/api/ai` (extract, translate, conclude).
- `supabase/schema.sql`: esquema idempotente (perfiles en `profiles` o `feria_profiles`, LWW por trigger).

## Reglas
- "Actualiza el proyecto X con este texto/fotos": editar solo `content/projects/<slug>.json`; rellenar `es`; escribir tú la versión `zh` (chino simplificado, frases cortas, tono profesional, vocabulario de comercio exterior); fotos en `public/projects/<slug>/` comprimidas a 1600px (lado largo) y añadidas a `photos`; `npm run build`; commit.
- Nunca push ni deploy salvo que diga "despliega" (Netlify cobra créditos por despliegue).
- Dependencias cerradas: no añadir ninguna sin preguntar. Sin frameworks de UI ni tests; verificar con `npm run build`.
- Todo en español, estilo iOS. Lo esencial (captura offline y sincronización) por delante de los extras.
