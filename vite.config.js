import { readFile, writeFile } from 'node:fs/promises';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const CUSTOM_DOMAIN = 'smarthue.sebastianthulin.se';

function pagesArtifactsPlugin() {
  return {
    name: 'pages-artifacts',
    apply: 'build',
    async closeBundle() {
      const indexHtml = await readFile(new URL('./dist/index.html', import.meta.url), 'utf8');

      // Keep Pages deployment self-contained: the custom domain and SPA fallback
      // are emitted as part of the production bundle instead of relying on manual
      // post-deploy steps.
      await Promise.all([
        writeFile(new URL('./dist/404.html', import.meta.url), indexHtml, 'utf8'),
        writeFile(new URL('./dist/CNAME', import.meta.url), `${CUSTOM_DOMAIN}\n`, 'utf8'),
      ]);
    }
  };
}

export default defineConfig(({ command }) => ({
  appType: 'spa',
  base: command === 'build' ? './' : '/',
  plugins: [
    pagesArtifactsPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        id: './',
        name: 'SmartThings Hue',
        short_name: 'Hue Home',
        description: 'SmartThings but with the Philips Hue experience',
        theme_color: '#0d0d0d',
        background_color: '#0d0d0d',
        display: 'standalone',
        orientation: 'portrait',
        scope: './',
        start_url: './',
        icons: [
          {
            src: './icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: './icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webmanifest,json}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.smartthings\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'smartthings-api',
              expiration: {
                maxAgeSeconds: 60 * 5
              }
            }
          }
        ],
        skipWaiting: true,
      }
    })
  ],
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
        additionalData: `@use '/src/styles/tokens' as *;`
      }
    }
  }
}));
