import { build } from 'vite';
import { resolve } from 'node:path';

const isWatch = process.argv.includes('--watch');

await build({
  configFile: false,
  publicDir: false,
  build: {
    target: 'es2020',
    outDir: 'minigame',
    emptyOutDir: false,
    lib: {
      entry: resolve(process.cwd(), 'src/minigame/main.ts'),
      name: 'GuiyuanMiniGame',
      fileName: () => 'game.js',
      formats: ['iife'],
    },
    minify: false,
    sourcemap: false,
    watch: isWatch ? {} : null,
  },
});
