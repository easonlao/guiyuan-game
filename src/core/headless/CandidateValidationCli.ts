/**
 * 归元弈 (Guiyuan) - 候选验证 CLI 入口
 *
 * 从 `CandidateValidation.ts` 拆出的 **CLI 关注点**：参数解析与被直接执行时的报告打印。
 * 测量编排在 `CandidateValidation.ts`，报告格式化在 `CandidateValidationReport.ts`。
 *
 * 复跑命令见 package.json：`npm run benchmark:candidate-validation`。
 */

import { runCliIfDirect } from './cli.js';
import {
  DEFAULT_BASE_SEED,
  DEFAULT_MAX_ROUNDS
} from './ExperimentRunner.js';
import {
  CANDIDATE_REGISTRY,
  DEFAULT_GUARDRAIL_MATCHES,
  DEFAULT_GUARDRAIL_SEED,
  DEFAULT_VALIDATION_MATCHES_PER_SEAT,
  PRODUCTION_CANDIDATE,
  validateCandidate,
  type SettlementMode
} from './CandidateValidation.js';
import { formatCandidateValidationReport } from './CandidateValidationReport.js';

const HELP_TEXT = `归元弈 (Guiyuan) 候选验证命令 (Ticket 05)

用法:
  npm run benchmark:candidate-validation -- [选项]

选项:
  --candidate <name>    注册候选: production (默认) / progress-pricing / weaken-zero /
                        race-diff / structured-reduction / board-progress-settlement
  --name <name>         报告标题覆盖 (默认取注册候选名)
  --description <text>  候选说明覆盖
  --mode <mode>         终局结算方式: scoring (默认) / board-only
  --matches <N>         对拼矩阵每座次样本量 (默认 ${DEFAULT_VALIDATION_MATCHES_PER_SEAT})
  --seed <N>            对拼矩阵种子基数 (默认 ${DEFAULT_BASE_SEED})
  --max-rounds <N>      回合上限 (默认 ${DEFAULT_MAX_ROUNDS})
  --guardrail-matches <N>  护栏样本量 (默认 ${DEFAULT_GUARDRAIL_MATCHES})
  --guardrail-seed <N>     护栏种子 (默认 ${DEFAULT_GUARDRAIL_SEED})
  --help, -h            显示本帮助

说明:
  一次跑完四条验收标准并输出对照报告：
    1. 无严格占优 (显著性证据 + 对拼矩阵；矩阵不完整时为「无法判定」)
    2. 每个行为都有价值 (动作价值普查)
    3. 护栏全绿 (归元率 / 先手胜率 / 堆内存增量)
    4. 动态策略打赢全部静态预设 (显著性检验)
  CLI 默认使用生产 POINTS_CONFIG；程序化调用可传入自定义 PointsConfig 做搜索。
`;

export interface ParsedCandidateArgs {
  readonly isHelp: boolean;
  /** 注册候选名；默认 `production`。 */
  readonly candidate: string;
  readonly name: string;
  readonly description: string;
  readonly mode: SettlementMode;
  readonly matches?: number;
  readonly seed?: number;
  readonly maxRounds?: number;
  readonly guardrailMatches?: number;
  readonly guardrailSeed?: number;
}

/** 解析 CLI 参数；未知参数或非法值抛错。 */
export function parseCandidateArgs(argv: readonly string[]): ParsedCandidateArgs {
  let isHelp = false;
  let candidate = PRODUCTION_CANDIDATE.name;
  let name = PRODUCTION_CANDIDATE.name;
  let description = PRODUCTION_CANDIDATE.description;
  let mode: SettlementMode = 'scoring';
  let matches: number | undefined;
  let seed: number | undefined;
  let maxRounds: number | undefined;
  let guardrailMatches: number | undefined;
  let guardrailSeed: number | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      isHelp = true;
      continue;
    }
    if (arg === '--candidate') {
      const value = argv[++i];
      if (!value || !CANDIDATE_REGISTRY[value]) {
        throw new Error(
          `未知候选: ${value}（可选: ${Object.keys(CANDIDATE_REGISTRY).join(' / ')}）`
        );
      }
      candidate = value;
      continue;
    }
    if (arg === '--name') {
      name = argv[++i] ?? name;
      continue;
    }
    if (arg === '--description') {
      description = argv[++i] ?? description;
      continue;
    }
    if (arg === '--mode') {
      const value = argv[++i];
      if (value !== 'scoring' && value !== 'board-only') {
        throw new Error(`未知结算方式: ${value}`);
      }
      mode = value;
      continue;
    }
    if (arg === '--matches') {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value) || value < 0) throw new Error(`--matches 需要非负数字: ${argv[i]}`);
      matches = Math.floor(value);
      continue;
    }
    if (arg === '--seed') {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value)) throw new Error(`--seed 需要数字: ${argv[i]}`);
      seed = Math.floor(value);
      continue;
    }
    if (arg === '--max-rounds') {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value) || value < 1) throw new Error(`--max-rounds 需要正数: ${argv[i]}`);
      maxRounds = Math.floor(value);
      continue;
    }
    if (arg === '--guardrail-matches') {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`--guardrail-matches 需要非负数字: ${argv[i]}`);
      }
      guardrailMatches = Math.floor(value);
      continue;
    }
    if (arg === '--guardrail-seed') {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value)) throw new Error(`--guardrail-seed 需要数字: ${argv[i]}`);
      guardrailSeed = Math.floor(value);
      continue;
    }
    throw new Error(`未知参数: ${arg}`);
  }

  return { isHelp, candidate, name, description, mode, matches, seed, maxRounds, guardrailMatches, guardrailSeed };
}

runCliIfDirect(import.meta.url, () => {
  const parsed = parseCandidateArgs(process.argv.slice(2));
  if (parsed.isHelp) {
    console.log(HELP_TEXT);
    return;
  }
  const matches = parsed.matches ?? DEFAULT_VALIDATION_MATCHES_PER_SEAT;
  const seed = parsed.seed ?? DEFAULT_BASE_SEED;
  const maxRounds = parsed.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const registered = CANDIDATE_REGISTRY[parsed.candidate];
  const name =
    parsed.name !== PRODUCTION_CANDIDATE.name ? parsed.name : registered.spec.name;
  const description =
    parsed.description !== PRODUCTION_CANDIDATE.description
      ? parsed.description
      : registered.spec.description;
  console.log(
    `🚀 候选验证 (${name}, ${parsed.mode}): 对拼 ${matches} 局/座次, 种子 ${seed}, 回合上限 ${maxRounds}...`
  );
  const report = validateCandidate(
    {
      ...registered.spec,
      name,
      description,
      settlementMode: parsed.mode
    },
    {
      matchesPerSeat: matches,
      seed,
      maxRounds,
      guardrailMatches: parsed.guardrailMatches,
      guardrailSeed: parsed.guardrailSeed,
      dynamicPolicies: registered.dynamicPolicies
    }
  );
  console.log(formatCandidateValidationReport(report));
});
