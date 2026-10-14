# Traevo Feria

PWA móvil (Vite + React + TS) para Javi y Rafa en la Feria de Cantón. GitHub Pages (repo público traevoglobal/traevoferia, base `/traevoferia/`) + Supabase ("Traevo Global S.L"). Sin IA en la app. Nunca tocar traevo.net.

**Los datos son privados.** El repo y la web solo llevan código. Todo dato (proyectos, equipo, horario, proveedores, fotos) vive en Supabase con RLS solo para `feria_members`, y en el móvil (Dexie) para usarlo sin red.

## Dónde está cada cosa
- `private/` (en .gitignore, nunca se sube): `private/content/projects/<slug>.json` (explicación es/zh de cada proyecto), `private/content/team.json` (contactos; "TODO" no se muestra), `private/content/horario.json` (plan por persona: sáb 17, dom 18, lun 19, reglas y planificador mar–jue, entregables), `private/content/config.json` (fichas: pabellones, tipos de foto, vías con sus sectores, campos rápidos y de cierre, reglas de descarte y bloqueo, puntuación, estados, enlaces de verificación). `npm run content:sql` genera `private/content.sql`, que se pega en el SQL Editor de Supabase (tabla `feria_content`, filas `projects`, `team`, `horario`, `config`).
- Fotos de proyectos y QR de WeChat del equipo: en el bucket privado `photos` de Supabase (`content/projects/<slug>/…`, `content/team/…`); en el JSON se guarda esa ruta.
- Horario: lo marcado en pantalla (hecho, contadores, visitas, entregables) va a localStorage, solo en ese móvil. Las franjas con `short` tienen "Nueva ficha" (etiqueta la ficha con la franja) y sus contadores con `fichas: true` cuentan fichas reales.
- `content/site.json`: solo el base path (lo leen vite.config y content.ts); rutas de `public/` siempre con `asset()`. `public/` solo lleva iconos.
- Fichas: vía, pabellón, sector, campos rápidos/cierre, audios y estado en `suppliers.extra` (jsonb); el código solo conoce claves (`ficha.ts`), etiquetas y criterios vienen de `config`. Fotos con `kind`; se sube también una miniatura `_t.jpg`.
- `src/lib/`: `ficha.ts` (reglas de la ficha según `config`), `plan.ts` (franjas y objetivos), `prefs.ts` (pabellón, última vía, tema), `backup.ts` (exportar JSON+CSV, importar y fusionar), `nav.ts` (navegación: cada entrada del historial guarda la pantalla completa; nunca pilas paralelas), `db.ts` (Dexie), `sync.ts` (cola de salida, pull incremental por `synced_at`, realtime, perfiles, contenido privado), `store.ts` (escrituras locales), `photos.ts` (compresión y URLs firmadas), `content.ts` (contenido privado como variables vivas + `useContentVersion`, ferias por fecha).
- `src/screens/`: Hoy, Proyectos, Fichas (`Suppliers.tsx`), Horario, Cierre, Captar (cámara encadenada en `components/Camera.tsx`, audio en `components/Audio.tsx`), Presentación/长图 (`Share.tsx`), Login/Perfil (`Auth.tsx`).
- `src/styles.css`: único CSS.
- `supabase/schema.sql`: esquema idempotente (perfiles en `profiles` o `feria_profiles`, LWW por trigger, `feria_content`, RLS solo para `feria_members`).
- `.github/workflows/pages.yml`: build + deploy a Pages en cada push a main (variables VITE_ en GitHub).

## Reglas
- "Actualiza el proyecto X con este texto/fotos": editar solo `private/content/projects/<slug>.json`; rellenar `es`; escribir tú la versión `zh` (chino simplificado, frases cortas, tono profesional, vocabulario de comercio exterior); fotos comprimidas a 1600px (lado largo) para subir al bucket `photos` en `content/projects/<slug>/` y su ruta en `photos`; `npm run content:sql` y pedir que se pegue `private/content.sql` en Supabase. No hace falta desplegar.
- Nunca push salvo que diga "despliega" (cada push a main publica en Pages).
- Repo y web públicos: ningún dato, secreto ni dato personal en el código, en `content/` ni en `public/` (ni en ejemplos o comentarios). La anon key solo en variables de GitHub.
- Dependencias cerradas: no añadir ninguna sin preguntar. Sin frameworks de UI ni tests; verificar con `npm run build`.
- Todo en español, estilo iOS. Lo esencial (captura offline y sincronización) por delante de los extras.
