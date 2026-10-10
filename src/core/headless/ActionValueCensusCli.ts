/**
 * 归元弈 (Guiyuan) - 动作价值普查 CLI 入口
 *
 * 从 `ActionValueCensus.ts` 拆出的 **CLI 关注点**：只负责「被直接执行时打印报告」。
 * 测量逻辑与报告格式化分别在 `ActionValueCensus.ts` 与 `ActionValueCensusReport.ts`。
 *
 * 复跑命令见 package.json：`npm run benchmark:action-value-census`。
 */

import { runCliIfDirect } from './cli.js';
import { runActionValueCensus } from './ActionValueCensus.js';
import { formatActionValueCensusReport } from './ActionValueCensusReport.js';

runCliIfDirect(import.meta.url, () => {
  console.log(formatActionValueCensusReport(runActionValueCensus()));
});
