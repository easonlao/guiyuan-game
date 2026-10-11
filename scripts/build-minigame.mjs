// 小游戏打包入口：`build:minigame`（单次构建）与 `dev:minigame`（监听）。
//
// 构建面在 `scripts/lib/minigame-build.mjs`，与对账门禁共用同一次构建调用（见 ADR 0014）。

import { ARTIFACT_PATH, watchMiniGame, writeMiniGameArtifact } from './lib/minigame-build.mjs';

if (process.argv.includes('--watch')) {
  await watchMiniGame();
} else {
  const size = await writeMiniGameArtifact();
  process.stdout.write(`build:minigame 写入 ${ARTIFACT_PATH}（${String(size)} 字节）。\n`);
}
