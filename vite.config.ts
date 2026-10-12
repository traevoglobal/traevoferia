import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import site from './content/site.json' with { type: 'json' };

// GitHub Pages sirve la app en /traevoferia/ (content/site.json).
export default defineConfig({
  base: site.base,
  oxc: { jsx: { runtime: 'automatic' } },
  server: { port: 5173 },
  build: {
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      onwarn(w, warn) {
        if (w.code === 'MODULE_LEVEL_DIRECTIVE') return;
        warn(w);
      },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Traevo Feria',
        short_name: 'Feria',
        description: 'Captura de proveedores en la Feria de Cantón',
        lang: 'es',
        start_url: site.base,
        scope: site.base,
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#C2302A',
        background_color: '#F2F2F7',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,jpg,jpeg,webp,svg,woff2}'],
        globIgnores: ['p/**'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [new RegExp(`^${site.base}p/`)],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/[^/]+\/storage\/v1\/object\/sign\/photos\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'supplier-photos',
              expiration: { maxEntries: 800, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
