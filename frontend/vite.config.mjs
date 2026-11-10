import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// RecipeBox frontend. The visual design is a fixed 393 x 852 mobile
// composition, so no responsive/Tailwind tooling is needed here.
//
// The file is named `vite.config.mjs` so it is always treated as ESM, keeping
// the rest of the repo on CommonJS (scripts/fetch-assets.js uses require()).
export default defineConfig({
  plugins: [react()],
  // The existing codebase uses plain `.js` files for JSX components (a
  // Create-React-App convention). Vite only expects JSX in `.jsx` by default,
  // so both the transform and the dependency optimiser are told to treat the
  // frontend sources as JSX.
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.jsx?$/,
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: { '.js': 'jsx' },
    },
  },
  // Relative base keeps `dist/` portable for any static host (same intent as
  // the previous CRA "homepage": "." setting).
  base: './',
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});

