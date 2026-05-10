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
  // Keep dev on the default root path while emitting relative production URLs
  // so the same bundle can be hosted at / or within a subdirectory.
  base: command === 'build' ? './' : '/',
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
  },
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
        ],
        screenshots: [
          {
            src: './icons/splash.png',
            sizes: '768x1376',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'SmartHue splash screen'
          }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,avif,jpg,jpeg,gif,woff,woff2,webmanifest,json}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: ({ request, sameOrigin }) => sameOrigin
              && ['style', 'script', 'worker', 'font', 'image'].includes(request.destination),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'app-static',
              cacheableResponse: {
                statuses: [200]
              },
              expiration: {
                maxEntries: 128,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          },
          {
            urlPattern: /^https:\/\/api\.smartthings\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'smartthings-api',
              networkTimeoutSeconds: 10,
              cacheableResponse: {
                statuses: [200]
              },
              expiration: {
                maxEntries: 64,
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
