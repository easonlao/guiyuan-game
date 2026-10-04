import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    // Preserve Vite 5's browser targets when upgrading the build tooling.
    target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'],
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  },
  server: {
    port: 5173,
    host: true
  }
});
