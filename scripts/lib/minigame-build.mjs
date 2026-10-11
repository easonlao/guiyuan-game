// 小游戏产物的构建面：`build:minigame`（写回入库路径）与 `check:artifact`（逐字节对账）共用。
//
// 为什么单独抽一层：写回侧与核查侧若各写一份 vite 配置，两者可能悄悄用上不同的构建命令，
// 那正是「产物与源码分叉」的入口。配置只有一个家，两侧走同一次 `buildMiniGameCode()`。
//
// 产物为什么入库、为什么要有对账门禁、落点为什么不能在任何 `dist/` 下，见 ADR 0014。

import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

/** 仓库根。`scripts/lib/` 往上两层。 */
export const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

/** 产物入库路径（相对仓库根）。落点判定写死在这里，不靠 `.gitignore` 兜（见 ADR 0014）。 */
export const ARTIFACT_PATH = 'minigame/game.js';

/**
 * 产物构建配置。`write: false`：交回内存里的字符串，由调用方决定写盘还是比对。
 *
 * `outDir` 与 `fileName` 从 `ARTIFACT_PATH` 拆出，不另写一份：落点这个事实只有一个家，
 * 否则把 `outDir` 改到 `dist/` 下时，落点判定仍看常量、照样绿（见 ADR 0014）。
 *
 * `minify: false`：产物入库后要能在 diff 里读——压缩会把这个决定变得无法复核（ADR 0014）。
 * `emptyOutDir: false`：`minigame/` 里还有 `game.json` / `project.config.json` 等手写文件，
 * 清目录会把它们一起删掉。
 * `logLevel` 默认 `info`（保留 `dev:minigame` 的监听输出）；门禁侧传 `silent`，
 * 不让 vite 的构建日志混进门禁报告。
 */
function miniGameBuildConfig({ watch, logLevel = 'info' }) {
  return {
    configFile: false,
    publicDir: false,
    logLevel,
    build: {
      target: 'es2020',
      outDir: dirname(ARTIFACT_PATH),
      emptyOutDir: false,
      lib: {
        entry: resolve(repoRoot, 'src/minigame/main.ts'),
        name: 'GuiyuanMiniGame',
        fileName: () => basename(ARTIFACT_PATH),
        formats: ['iife'],
      },
      minify: false,
      sourcemap: false,
      // watch 模式下 vite 自己写盘（构建面只管单次构建，不管监听）。
      write: watch === true,
      watch: watch === true ? {} : null,
    },
  };
}

/**
 * 现打一次产物，交回文本。
 *
 * 写回侧与核查侧共用本函数：门禁「现算 == 入库」比的就是这里产出的字节。
 */
export async function buildMiniGameCode() {
  const result = await build(miniGameBuildConfig({ watch: false, logLevel: 'silent' }));
  const outputs = Array.isArray(result) ? result : [result];
  const chunk = outputs
    .flatMap((output) => output.output ?? [])
    .find((output) => output.type === 'chunk' && output.fileName === basename(ARTIFACT_PATH));
  if (chunk === undefined) {
    throw new Error(`vite 没有产出 ${basename(ARTIFACT_PATH)}`);
  }
  return chunk.code;
}

/** 按入库路径写回产物，返回写入的字节数。 */
export async function writeMiniGameArtifact() {
  const code = await buildMiniGameCode();
  const target = resolve(repoRoot, ARTIFACT_PATH);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, code, 'utf8');
  return Buffer.byteLength(code);
}

/** 监听源码变化、由 vite 自己写盘（`dev:minigame`）。 */
export async function watchMiniGame() {
  await build(miniGameBuildConfig({ watch: true }));
}
