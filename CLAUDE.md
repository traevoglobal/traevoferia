# Traevo Feria

PWA móvil (Vite + React + TS) para Javi y Rafa en la Feria de Cantón: se usa de pie, con una mano, sin internet y con el proveedor delante. GitHub Pages (repo público traevoglobal/traevoferia, base `/traevoferia/`) + Supabase ("Traevo Global S.L"). Sin IA en la app. Nunca tocar traevo.net.

**Los datos son privados.** El repo y la web solo llevan código. Todo dato (proyectos, itinerario, tarjeta, proveedores, fotos) vive en Supabase con RLS solo para `feria_members`, y en el móvil (Dexie) para usarlo sin red.

## Dónde está cada cosa
- Tres secciones y una pantalla fija: **Presentar** (líneas Access/Sourcing → proyectos → presentación a pantalla completa con botón "Notas"), **Proveedores** (fichas con autoguardado), **Itinerario** (bloques por día) y **Mi tarjeta** (QR WeChat/Alipay, WeChat ID, empresa).
- `private/data/` (en .gitignore, nunca se sube): `proyectos.js` (un objeto por proyecto; añadir proyecto = añadir objeto), `comun.js` (descripción de las dos líneas y los dos slides comunes que van antes de cada proyecto), `itinerario.js` (bloques: día, hora, quien, lugar, proyecto, objetivo, dos puntos a vigilar), `tarjeta.js` (empresa y una persona por miembro), `img/` (imágenes de slides y QR). `npm run content:sql` valida (máx. 4 bullets y mismo número es/zh, ids, horas, proyectos del itinerario) y genera `private/content.sql`, que se pega en el SQL Editor de Supabase (tabla `feria_content`, filas `proyectos`, `comun`, `itinerario`, `tarjeta`).
- Imágenes del contenido: se suben a mano al bucket privado `photos` en `content/img/` (misma ruta que en los .js: `img/<archivo>`). La app las descarga enteras al móvil (Dexie `assets`) al sincronizar, así Presentar y Mi tarjeta no hacen ninguna llamada en uso.
- `private/content/`: contenido de la versión anterior (proyectos, horario, configuración de vías). Ya no lo usa la app; queda como archivo.
- Login una sola vez (Supabase Auth); después la app funciona sin red con la sesión guardada. Fichas: Dexie + cola de salida a Supabase (tabla `suppliers`), realtime entre los dos móviles.
- Ficha de proveedor: stand en `booth` (único obligatorio), proyecto en `project_ids[0]` u "otra oportunidad" en `extra.otra`, empresa/contacto/WeChat en sus columnas, campos clave del proyecto en `extra.campos` (por nombre), preguntas marcadas en `extra.preguntas` (por id), audios en `extra.audios`. Se crea con el primer cambio y cada tecla se escribe en el móvil; la subida va agrupada (`store.ts`).
- `content/site.json`: solo el base path (lo leen vite.config y content.ts); rutas de `public/` siempre con `asset()`. `public/` solo lleva iconos.
- `src/lib/`: `content.ts` (contenido privado como variables vivas + `useContentVersion`), `assets.ts` (imágenes del contenido en el móvil), `nav.ts` (navegación: cada entrada del historial guarda la pantalla completa; nunca pilas paralelas), `db.ts` (Dexie), `sync.ts` (cola de salida, pull incremental por `synced_at`, realtime, perfiles, contenido privado), `store.ts` (escrituras locales de fichas), `photos.ts` (compresión y URLs firmadas), `backup.ts` (exportar CSV+JSON, importar y fusionar).
- `src/screens/`: `Presentar.tsx`, `Proveedores.tsx` (listado + `FichaSheet`), `Itinerario.tsx`, `Tarjeta.tsx`, `Auth.tsx` (login y perfil). Cámara encadenada en `components/Camera.tsx`, audio en `components/Audio.tsx`.
- `src/styles.css`: único CSS. Tema oscuro único, alto contraste, botones de 48px mínimo.
- `supabase/schema.sql`: esquema idempotente (perfiles en `profiles` o `feria_profiles`, LWW por trigger, `feria_content`, RLS solo para `feria_members`).
- `.github/workflows/pages.yml`: build + deploy a Pages en cada push a main (variables VITE_ en GitHub).

## Reglas
- "Añade/actualiza el proyecto X": editar solo `private/data/proyectos.js`; rellenar los textos `_es`; escribir tú los `_zh` (chino simplificado, frases cortas, tono profesional, vocabulario de comercio exterior); máximo 4 bullets por slide; imágenes comprimidas a 1600px (lado largo) en `private/data/img/` para subir al bucket `photos` en `content/img/`; `npm run content:sql` y pedir que se pegue `private/content.sql` en Supabase. No hace falta desplegar.
- Nunca push salvo que diga "despliega" (cada push a main publica en Pages).
- Repo y web públicos: ningún dato, secreto ni dato personal en el código, en `content/` ni en `public/` (ni en ejemplos o comentarios). La anon key solo en variables de GitHub.
- Dependencias cerradas: no añadir ninguna sin preguntar. Sin frameworks de UI ni tests; verificar con `npm run build`.
- Todo en español, estilo iOS. Lo esencial (captura offline y sincronización) por delante de los extras.
