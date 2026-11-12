import { defineConfig } from 'vite';

// base './' – gra działa z dowolnego folderu na hostingu (np. Hostinger public_html/gra)
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 1500 },
  test: { environment: 'node' },
} as never);
