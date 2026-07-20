import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Iron Log',
        short_name: 'Iron Log',
        description: 'Workout, cardio and body tracking.',
        theme_color: '#0c0d10',
        background_color: '#0c0d10',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        // PNGs first: Safari ignores an SVG icon outright, and Android's
        // launcher is happier with real raster sizes. The SVG stays last as a
        // scalable fallback. The maskable variant is a separate file with the
        // barbell inset — the standard crop would slice the plates off.
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // The shell is precached so the app opens with no signal. Supabase
        // calls are deliberately NOT cached — a stale set list that silently
        // discards what you just logged is worse than an honest error.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/api/],
      },
    }),
  ],
});
