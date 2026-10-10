/**
 * 归元弈 (Guiyuan) - 候选验证报告格式化 (Candidate Validation Report)
 *
 * 从 `CandidateValidation.ts` 拆出的**报告格式化**关注点：只把验证报告渲染成
 * markdown，不测量、不编排、不解析 CLI。拆出的理由见 code-review finding
 * 「Divergent Change」：测量编排与排版格式是两类独立变化原因。
 *
 * 逐动作类型结论表复用 `ActionValueCensusReport.formatActionSummaryTable`，
 * 保证与动作价值普查报告逐字节一致。
 */

import { POINTS_CONFIG } from '../logic/ScoreCalculator.js';
import {
  DOMINANCE_SIGNIFICANCE_Z,
  MIN_DOMINANCE_MATCHES,
  formatDrawRateWithWinRates,
  formatDominanceVerdict
} from './Metrics.js';
import { formatSeatBalancedMatrix } from './ExperimentRunner.js';
import type { HeadToHeadReport } from './ExperimentRunner.js';
import { formatActionSummaryTable } from './ActionValueCensusReport.js';
import type {
  BaselineComparisonResult,
  CandidateValidationReport,
  CriterionVerdict,
  DynamicBeatsStaticsResult,
  GuardrailResult,
  NoStrictDominanceResult
} from './CandidateValidation.js';

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function passLabel(passed: boolean): string {
  return passed ? '通过' : '**失败**';
}

/** 三态结论的中文标签；`inconclusive` 不得读作通过或失败。 */
function verdictLabel(verdict: CriterionVerdict): string {
  switch (verdict) {
    case 'pass':
      return '通过';
    case 'fail':
      return '**失败**';
    case 'inconclusive':
      return '**无法判定**';
  }
}

function formatDrawPairedMatchups(report: HeadToHeadReport): string {
  const lines: string[] = [];
  lines.push('| A | B | 两座次样本 | 座次平衡胜率 | 流局率 / 先后手胜率 |');
  lines.push('| --- | --- | ---: | ---: | --- |');
  for (const matchup of report.matchups) {
    lines.push(
      `| ${matchup.strategyA} | ${matchup.strategyB} | ${matchup.matches} | ${percent(
        matchup.seatBalancedWinRate
      )} | ${formatDrawRateWithWinRates({
        drawRate: matchup.drawRate,
        p1WinRate: matchup.p1WinRate,
        p2WinRate: matchup.p2WinRate
      })} |`
    );
  }
  return lines.join('\n');
}

function formatDominanceConclusion(result: NoStrictDominanceResult): string {
  const lines: string[] = [];
  lines.push(`结果：${verdictLabel(result.verdict)}`);
  lines.push('');
  if (result.verdict === 'fail') {
    lines.push(
      `存在对全部对手严格占优的策略：**${result.strictDominators.join('、')}**（样本量足够且显著高于 50%）。`
    );
  } else if (result.verdict === 'inconclusive') {
    lines.push(
      `矩阵有 ${result.undecidable.length} 对无法判定（缺格 / 样本不足 / 与 50% 无法区分），**不能据此断言「无占优」**。`
    );
  } else {
    lines.push('对拼矩阵中不存在对全部对手严格占优的策略，且矩阵完全可判定。');
  }
  if (!result.fullyDecided) {
    lines.push('');
    lines.push(
      `> 注意：有 ${result.undecidable.length} 对无法判定（缺格 / 样本不足 / 与 50% 无法区分），「无占优」结论并不完整。`
    );
  }
  lines.push('');
  const dominated = result.verdicts.filter(verdict => verdict.dominates.length > 0);
  if (dominated.length === 0) {
    lines.push('无任何被矩阵支撑的占优结论。');
  } else {
    for (const verdict of dominated) {
      // 陷阱 B：占优结论必须由矩阵支撑，`formatDominanceVerdict` 内部会强制校验。
      lines.push(`- ${formatDominanceVerdict(verdict, result.matrix)}`);
    }
  }
  if (result.undecidable.length > 0) {
    lines.push('');
    lines.push('无法判定的对（不能作为占优证据，也不能当作「已确认无占优」）：');
    for (const item of result.undecidable) {
      lines.push(`- ${item.strategy} vs ${item.opponent}：${item.reason}`);
    }
  }
  return lines.join('\n');
}

function formatGuardrailSection(result: GuardrailResult): string {
  const lines: string[] = [];
  lines.push(`结果：${passLabel(result.passed)}`);
  lines.push('');
  lines.push(`- 样本：${result.matches} 局平衡自对弈，种子 ${result.seed}，回合上限 ${result.maxRounds}`);
  lines.push(
    `- 流局率与先后手胜率（陷阱 C：必须成对报告）：${formatDrawRateWithWinRates({
      drawRate: result.drawRate,
      p1WinRate: result.p1WinRate,
      p2WinRate: result.p2WinRate
    })}`
  );
  lines.push('');
  lines.push('| 护栏 | 实测 | 带 | 结果 |');
  lines.push('| --- | ---: | --- | --- |');
  for (const check of result.checks) {
    const band =
      check.min !== undefined && check.max !== undefined
        ? `[${percent(check.min)}, ${percent(check.max)}]`
        : check.max !== undefined
          ? `< ${check.max}`
          : '—';
    const actual =
      check.key === 'heapUsedDeltaMB' ? check.actual.toFixed(2) : percent(check.actual);
    lines.push(`| ${check.label} | ${actual} | ${band} | ${passLabel(check.passed)} |`);
  }
  return lines.join('\n');
}

function formatDynamicSection(result: DynamicBeatsStaticsResult): string {
  const lines: string[] = [];
  lines.push(`结果：${passLabel(result.passed)}`);
  lines.push('');
  lines.push(
    `- 动态策略：${result.policies.join('、')}；静态预设：${result.statics.join('、')}`
  );
  lines.push(
    `- 判定：座次平衡胜率需显著高于 50%（z = ${DOMINANCE_SIGNIFICANCE_Z}，每格 ≥ ${MIN_DOMINANCE_MATCHES} 局）。`
  );
  lines.push('');
  lines.push('| 动态策略 | 静态预设 | 样本 | 动态胜率 | 边际 | 标准误 | 阈值 | 95% CI 下界 | 显著 |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const item of result.evidence) {
    lines.push(
      `| ${item.policy} | ${item.staticStrategy} | ${item.matches} | ${percent(
        item.dynamicWinRate
      )} | ${percent(item.margin)} | ${percent(item.standardError)} | ${percent(
        item.threshold
      )} | ${percent(item.lowerBound)} | ${item.significant ? '是' : '否'} |`
    );
  }
  if (result.nonSignificant.length > 0) {
    lines.push('');
    lines.push(
      `未显著打赢的对：${result.nonSignificant.join('、')}。这不等于「设计意图不成立」——也可能是该动态实现不足，需区分。`
    );
  }
  return lines.join('\n');
}

const RELATION_LABEL: Readonly<Record<string, string>> = {
  strong: '强 (A 胜)',
  weak: '弱 (A 负)',
  tie: '平 (50%)'
};

function formatRelation(relation: string): string {
  return RELATION_LABEL[relation] ?? relation;
}

function formatBaselineComparisonSection(result: BaselineComparisonResult): string {
  const lines: string[] = [];
  lines.push(
    `对照基线：\`${result.baselineName}\`（${result.baselineDescription}）${
      result.reusedCandidateMatrix ? '；候选与基线配置一致，复用候选矩阵。' : '。'
    }`
  );
  lines.push('');
  lines.push(`**强弱关系翻转 ${result.flips.length} 格**`);
  lines.push('');
  if (result.flips.length === 0) {
    lines.push('无：所有格子的强弱关系与基线一致。');
  } else {
    lines.push('| A | B | 基线胜率 | 基线关系 | 候选胜率 | 候选关系 | Δ (候选 − 基线) |');
    lines.push('| --- | --- | ---: | --- | ---: | --- | ---: |');
    for (const flip of result.flips) {
      lines.push(
        `| ${flip.strategyA} | ${flip.strategyB} | ${percent(flip.scoringWinRate)} | ${
          formatRelation(flip.scoringRelation)
        } | ${percent(flip.boardOnlyWinRate)} | ${formatRelation(flip.boardOnlyRelation)} | ${percent(
          flip.delta
        )} |`
      );
    }
  }
  lines.push('');
  lines.push('### 逐格对照（全部有序对）');
  lines.push('');
  lines.push('| A | B | 基线胜率 | 候选胜率 | Δ | 翻转 |');
  lines.push('| --- | --- | ---: | ---: | ---: | --- |');
  for (const matchup of result.comparison.matchups) {
    lines.push(
      `| ${matchup.strategyA} | ${matchup.strategyB} | ${percent(
        matchup.scoringWinRate
      )} | ${percent(matchup.boardOnlyWinRate)} | ${percent(matchup.delta)} | ${
        matchup.flipped ? '是' : '否'
      } |`
    );
  }
  return lines.join('\n');
}

/** 把候选验证报告格式化为可直接粘贴的 markdown。 */
export function formatCandidateValidationReport(report: CandidateValidationReport): string {
  const lines: string[] = [];
  const { candidate, options } = report;

  lines.push(`# 候选验证报告：${candidate.name}`);
  lines.push('');
  lines.push(candidate.description);
  lines.push('');
  lines.push('## 总览');
  lines.push('');
  lines.push('| # | 验收标准 | 结果 |');
  lines.push('| --- | --- | --- |');
  lines.push(`| 1 | 无严格占优 | ${verdictLabel(report.noStrictDominance.verdict)} |`);
  lines.push(`| 2 | 每个行为都有价值 | ${passLabel(report.everyActionHasValue.passed)} |`);
  lines.push(`| 3 | 护栏全绿 | ${passLabel(report.guardrails.passed)} |`);
  lines.push(
    `| 4 | 动态策略打赢全部静态预设 | ${passLabel(report.dynamicBeatsStatics.passed)} |`
  );
  lines.push('');
  lines.push(`**四条全部通过：${report.allPassed ? '是' : '否'}**`);
  lines.push('');
  lines.push(
    `- 对拼样本：${options.matchesPerSeat} 局/座次（每格 ${options.matchesPerSeat * 2} 局），种子 ${options.seed}，回合上限 ${options.maxRounds}`
  );
  lines.push(
    `- 护栏样本：${options.guardrailMatches} 局，种子 ${options.guardrailSeed}`
  );
  lines.push(
    `- 计分配置：${candidate.pointsConfig === POINTS_CONFIG ? 'POINTS_CONFIG（生产默认）' : '自定义 PointsConfig'}`
  );
  lines.push(`- 规则开关：${JSON.stringify(candidate.rules)}`);
  lines.push(`- 终局结算：${candidate.settlementMode}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  lines.push('## 1. 无严格占优');
  lines.push('');
  lines.push(formatDominanceConclusion(report.noStrictDominance));
  lines.push('');
  lines.push(formatSeatBalancedMatrix(report.noStrictDominance.headToHead));
  lines.push('');
  lines.push('### 逐对明细（流局率与先后手胜率成对）');
  lines.push('');
  lines.push(formatDrawPairedMatchups(report.noStrictDominance.headToHead));
  lines.push('');
  lines.push('---');
  lines.push('');

  lines.push('## 2. 每个行为都有价值');
  lines.push('');
  lines.push(`结果：${passLabel(report.everyActionHasValue.passed)}`);
  lines.push('');
  if (report.everyActionHasValue.passed) {
    lines.push('没有动作在所有被测盘面状态下都被支配。');
  } else {
    lines.push(
      `全局被支配动作：**${report.everyActionHasValue.globallyDominated.join('、')}**。`
    );
  }
  lines.push('');
  lines.push(formatActionSummaryTable(report.everyActionHasValue.actions));
  lines.push('');
  lines.push('---');
  lines.push('');

  lines.push('## 3. 护栏全绿');
  lines.push('');
  lines.push(formatGuardrailSection(report.guardrails));
  lines.push('');
  lines.push('---');
  lines.push('');

  lines.push('## 4. 动态策略打赢全部静态预设');
  lines.push('');
  lines.push(formatDynamicSection(report.dynamicBeatsStatics));
  lines.push('');
  lines.push('---');
  lines.push('');

  lines.push('## 5. 改动前后逐格对照');
  lines.push('');
  lines.push(formatBaselineComparisonSection(report.baselineComparison));

  return lines.join('\n');
}
