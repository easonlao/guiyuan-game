#!/usr/bin/env node
// 让新 clone 能用技能与 codegraph。两件事各自已存在就跳过，可以反复跑。
// 哪个 agent 工具读哪个文件，见 docs/agents/agent-tooling.md。

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const skillsDir = join(repoRoot, '.agents', 'skills');

function npx(args) {
  const result = spawnSync('npx', ['-y', ...args], {
    cwd: repoRoot,
    stdio: 'inherit',
    // Windows 上 npx 是 npx.cmd，不加 shell 会 ENOENT。
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// codegraph 跑 PATH 上那份，不走 npx：二进制一份、索引每项目一份，
// 版本由各机器自己管，见 docs/agents/agent-tooling.md。
function codegraph(args) {
  const result = spawnSync('codegraph', args, {
    cwd: repoRoot,
    stdio: 'inherit',
    // Windows 上 codegraph 是 codegraph.cmd，不加 shell 会 ENOENT。
    shell: process.platform === 'win32',
  });
  if (result.error?.code === 'ENOENT' || result.status === 127) {
    console.error('[bootstrap] 找不到 codegraph 命令。先装一份（装到 ~/.local/bin）：');
    console.error(
      '  curl -fsSL https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.sh | sh',
    );
    process.exit(1);
  }
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// 1. 技能：`.agents/skills/` 里只有 38 个上游技能入库（见 .gitignore），其余靠 lock 重建。
const lock = JSON.parse(readFileSync(join(repoRoot, 'skills-lock.json'), 'utf8'));
const missing = Object.keys(lock.skills).filter((name) => !existsSync(join(skillsDir, name)));
if (missing.length === 0) {
  console.log('[bootstrap] 技能齐了，跳过。');
} else {
  console.log(`[bootstrap] 从 skills-lock.json 装 ${missing.length} 个技能。`);
  // 不在 lock 里的本地技能装不回来（例如 sprite-sheet），这是已知缺口。
  npx(['skills', 'experimental_install']);
}

// 2. codegraph 索引：`.codegraph/` 记本机绝对路径，不入库，只能重建。
if (existsSync(join(repoRoot, '.codegraph', 'codegraph.db'))) {
  console.log('[bootstrap] codegraph 索引已在，跳过。');
} else {
  console.log('[bootstrap] 建 codegraph 索引。');
  codegraph(['init']);
}
