import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, symlinkSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

// 在只读沙箱环境下，为 Vitest 准备可写的临时 node_modules/.vite-temp 环境
const tmpNodeModules = '/tmp/node_modules';
if (!existsSync(tmpNodeModules)) {
  try {
    mkdirSync(tmpNodeModules, { recursive: true });
    const realNodeModules = resolve('node_modules');
    if (existsSync(realNodeModules)) {
      const items = readdirSync(realNodeModules);
      for (const item of items) {
        if (item === '.vite-temp') continue;
        try {
          symlinkSync(join(realNodeModules, item), join(tmpNodeModules, item));
        } catch {}
      }
    }
    mkdirSync(join(tmpNodeModules, '.vite-temp'), { recursive: true });
  } catch {}
}

const tmpConfigFile = '/tmp/vitest.config.mjs';
const configContent = `
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    include: ['tests/core/**/*.test.ts'],
    environment: 'node',
    globals: true
  }
});
`;
writeFileSync(tmpConfigFile, configContent, 'utf-8');

const args = ['run', '--config', tmpConfigFile, 'tests/core', ...process.argv.slice(2)];
const res = spawnSync(resolve('node_modules/.bin/vitest'), args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_PATH: `${tmpNodeModules}:${process.env.NODE_PATH || ''}`
  }
});

process.exit(res.status ?? 0);
