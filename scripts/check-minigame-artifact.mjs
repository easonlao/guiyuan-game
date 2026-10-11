// 产物对账门禁：入库的 `minigame/game.js` 必须能由当前源码逐字节重建（`npm run check:artifact`）。
//
// ── 为什么要有这道门禁 ──
// 产物入库的理由只有一条（见 ADR 0014）：`docs/HLD.md` §4.6 的验收步骤让人在微信开发者工具里直接导入
// `minigame/` 目录，文件在库里就不用每次先构建。代价是——**改了源码忘了重新构建，工具里看到的
// 还是旧的**。这道门禁就是专门杀这个的：拿同一份源码重跑同一条构建命令，逐字节比。
//
// ── 为什么逐字节，而不是比 sha256 ──
// 逐字节比与比 sha256 是同一件事，但逐字节能直接报出第一个不同的字节位置，红的时候指得出差在哪。
//
// ── 落点判定 ──
// 产物路径不得落在任何层级的 `dist/` 下：`.gitignore` 里那条 `dist/` 是无锚点规则（命中任意层级），
// 落进去就进不了版本库，「入库」当场成空话。这条写死在脚本里，不靠 `.gitignore` 兜（ADR 0014）。

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ARTIFACT_PATH, buildMiniGameCode, repoRoot } from './lib/minigame-build.mjs';

/** 首个不同的字节位置；完全相同报 -1。只给人看，不参与判定。 */
function firstDifference(left, right) {
  for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
    if (left[i] !== right[i]) return i;
  }
  return left.length === right.length ? -1 : Math.min(left.length, right.length);
}

const failures = [];

// ① 落点：不得落在任何层级的 `dist/` 下。
if (ARTIFACT_PATH.split('/').includes('dist')) {
  failures.push(
    `产物落点 ${ARTIFACT_PATH} 落在 dist/ 下——.gitignore 的无锚点 dist/ 会让它进不了版本库。`,
  );
}

// ② 逐字节对账：现打一次 == 入库产物。
const target = resolve(repoRoot, ARTIFACT_PATH);
let committed;
try {
  committed = readFileSync(target);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  failures.push(`找不到入库产物 ${ARTIFACT_PATH}——先跑 npm run build:minigame 并把它提交。`);
}

if (committed !== undefined) {
  const fresh = Buffer.from(await buildMiniGameCode(), 'utf8');
  if (!fresh.equals(committed)) {
    failures.push(
      `入库的 ${ARTIFACT_PATH} 与重新构建的结果不一致` +
        `（入库 ${String(committed.length)} 字节 / 重构建 ${String(fresh.length)} 字节，` +
        `首个差异在第 ${String(firstDifference(fresh, committed))} 字节）。` +
        '改完源码请跑 npm run build:minigame，并把新产物一并提交。',
    );
  }
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`check:artifact: ${failure}\n`);
  process.exit(1);
}
process.stdout.write(
  `check:artifact: 入库的 ${ARTIFACT_PATH} 与重新构建的结果逐字节一致，落点不在任何 dist/ 下。\n`,
);
