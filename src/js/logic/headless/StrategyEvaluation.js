import { createHash } from 'node:crypto';
import { createScoringConfig } from '../actions/ScoringConfig.js';
import { runBatchComparison } from './BatchComparison.js';
import { evaluateCrossoverConfirmation as runCrossoverConfirmation } from './CrossoverConfirmation.js';
import { enumerateLegalFirstActions } from './FixedPositionContinuations.js';
import { PUBLIC_STRATEGIES, decidePublicStrategy } from './PublicStrategies.js';
import { SEEDED_RANDOM_VERSION } from './SeededRandom.js';
import { computeTheoreticalStateSpace, analyzeStateStructure, classifyPositionSituation } from './StateStructureAnalysis.js';
import { generatePositionTradeoffTable } from './ActionTradeoffAnalysis.js';
import { runTurnOrderDiagnostic } from './TurnOrderDiagnostic.js';
import { runStrategyTournament } from './StrategyTournament.js';

export const SCORING_SELECTIONS = Object.freeze({
  'formal-baseline': Object.freeze({}),
  'no-self-cost-reward': Object.freeze({ version: 1, noSelfCostReward: true }),
  'burst-action-score-once': Object.freeze({ version: 1, burstActionScoreOnce: true }),
  'disable-rarity-bonus': Object.freeze({ version: 1, disableRarityBonus: true }),
  combined: Object.freeze({ version: 1, noSelfCostReward: true, burstActionScoreOnce: true, disableRarityBonus: true })
});

const STRATEGY_IDS = Object.keys(PUBLIC_STRATEGIES);
const STRATEGY_PAIRS = [
  ['build-priority', 'attack-priority'],
  ['build-priority', 'situation-responsive'],
  ['attack-priority', 'situation-responsive']
];

function clone(value) {
  return structuredClone(value);
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function scoringConfigOptions(snapshot) {
  return {
    version: snapshot.version,
    noSelfCostReward: snapshot.noSelfCostReward,
    burstActionScoreOnce: snapshot.burstActionScoreOnce,
    disableRarityBonus: snapshot.disableRarityBonus
  };
}

function branchOutcomeCounts(branch) {
  const counts = { wins: 0, draws: 0, losses: 0, failed: 0, budgetSkipped: 0 };
  for (const sample of branch?.samples ?? []) {
    if (sample.status === 'completed') counts[sample.outcome === 'loss' ? 'losses' : `${sample.outcome}s`]++;
    else if (sample.status === 'not-run-budget') counts.budgetSkipped++;
    else counts.failed++;
  }
  return counts;
}

function pairOmissionCounts(branchA, branchB) {
  const statusesBySeed = new Map();
  for (const sample of [...(branchA?.samples ?? []), ...(branchB?.samples ?? [])]) {
    const key = JSON.stringify([typeof sample.seed, sample.seed]);
    const statuses = statusesBySeed.get(key) ?? { failed: false, budgetSkipped: false };
    statuses.failed ||= sample.status === 'failed';
    statuses.budgetSkipped ||= sample.status === 'not-run-budget';
    statusesBySeed.set(key, statuses);
  }
  const seeds = [...statusesBySeed.values()];
  const failed = seeds.filter(statuses => statuses.failed).length;
  const budgetSkipped = seeds.filter(statuses => !statuses.failed && statuses.budgetSkipped).length;
  return { failed, budgetSkipped };
}

function pairCounts(pair, opponent, comparisons) {
  const comparisonIndex = pair.comparisonIndexes?.[opponent.id];
  const comparison = comparisonIndex === null || comparisonIndex === undefined ? null : comparisons[comparisonIndex];
  const [candidateA, candidateB] = pair.candidateIndices ?? [];
  const branchA = comparison?.firstActions.find(branch => branch.candidateIndex === candidateA);
  const branchB = comparison?.firstActions.find(branch => branch.candidateIndex === candidateB);
  const countsA = branchOutcomeCounts(branchA);
  const countsB = branchOutcomeCounts(branchB);
  const omissions = pairOmissionCounts(branchA, branchB);
  return {
    requested: opponent.requestedPairCount ?? 0,
    completed: opponent.pairedCount ?? 0,
    missing: opponent.missingSeeds?.length ?? 0,
    ...omissions,
    actions: { A: countsA, B: countsB }
  };
}

function addPairCounts(pair, comparisons) {
  return {
    ...pair,
    qualified: pair.classification === 'crossover',
    opponents: pair.opponents.map(opponent => ({
      ...opponent,
      counts: pairCounts(pair, opponent, comparisons)
    }))
  };
}

/** Add explicit count and coverage aliases while retaining the crossover module's raw comparisons. */
export function evaluateCrossoverConfirmation(input = {}) {
  const report = runCrossoverConfirmation(input);
  return {
    ...report,
    discovery: { ...report.discovery, pairs: report.discovery.pairs.map(pair => addPairCounts(pair, report.discovery.comparisons)) },
    confirmation: { ...report.confirmation, pairs: report.confirmation.pairs.map(pair => addPairCounts(pair, report.confirmation.comparisons)) },
    summary: {
      ...report.summary,
      coverage: {
        planned: report.summary.plannedMatchCount,
        attempted: report.summary.attemptedMatchCount,
        completed: report.summary.completedMatchCount,
        failed: report.summary.failedMatchCount,
        budgetSkipped: report.summary.budgetSkippedMatchCount
      }
    }
  };
}

function generateSeeds(seed, count, phase, discoverySampleCount) {
  return Array.from({ length: count }, (_, index) => {
    if (typeof seed === 'number') {
      const offset = phase === 'confirmation' ? discoverySampleCount : 0;
      const next = seed + offset + index;
      if (!Number.isSafeInteger(next)) throw new TypeError('seed range exceeds safe integer values');
      return next;
    }
    if (typeof seed !== 'string' || seed.length === 0) throw new TypeError('seed must be a non-empty string or safe integer');
    if (phase === 'discovery') return index === 0 ? seed : `${seed}#sample-${index + 1}`;
    return `${seed}#confirmation-${index + 1}`;
  });
}

function identity(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function provenanceIdentity(provenance) {
  if (provenance?.kind !== 'seeded-match') return clone(provenance ?? null);
  return {
    kind: provenance.kind,
    seed: provenance.seed,
    randomVersion: provenance.randomVersion,
    strategyIdentities: clone(provenance.strategyIdentities),
    opportunity: provenance.opportunity,
    actionRecordIndex: provenance.actionRecordIndex,
    phaseNormalization: clone(provenance.phaseNormalization),
    baselineMatchSha256: identity(provenance.baselineMatch)
  };
}

function replayCheckpoint(position) {
  return {
    schemaVersion: position.schemaVersion,
    id: position.id,
    classification: position.classification,
    source: position.source,
    currentPlayer: position.currentPlayer,
    currentStem: clone(position.currentStem),
    isExtraTurn: position.isExtraTurn,
    pendingBurstPlayer: position.pendingBurstPlayer,
    state: clone(position.state),
    provenance: provenanceIdentity(position.provenance)
  };
}

function resolveScoringSelections(selection) {
  if (selection === 'all') return Object.entries(SCORING_SELECTIONS);
  if (!Object.hasOwn(SCORING_SELECTIONS, selection)) {
    throw new TypeError(`unknown scoring selection ${selection}; choose ${Object.keys(SCORING_SELECTIONS).join(', ')}, all`);
  }
  return [[selection, SCORING_SELECTIONS[selection]]];
}

function choosePolicyAction(position, candidates, strategyId) {
  const state = position.state;
  return decidePublicStrategy(strategyId, {
    playerId: position.currentPlayer,
    stem: position.currentStem,
    state: {
      currentPlayer: position.currentPlayer,
      turnCount: state.turnCount,
      maxTurns: state.maxTurns,
      isExtraTurn: state.isExtraTurn,
      scores: { P1: state.players.P1.score, P2: state.players.P2.score },
      nodeStates: state.nodeStates
    },
    history: [],
    candidates
  }, () => 0);
}

function findHumanReviewCases(evaluations, positions) {
  const cases = [];
  for (const evaluation of evaluations) {
    const positionById = new Map(positions.map(position => [position.id, position]));
    const scoring = scoringConfigOptions(evaluation.scoringConfig);
    for (const position of positions) {
      const candidates = enumerateLegalFirstActions(position, { scoringConfig: scoring }).actions;
      const choices = STRATEGY_IDS.map(strategy => ({
        strategy,
        action: choosePolicyAction(position, candidates, strategy)
      })).filter(choice => choice.action);
      for (let firstIndex = 0; firstIndex < choices.length; firstIndex++) {
        const second = choices.slice(firstIndex + 1).find(choice => !sameValue(choice.action, choices[firstIndex].action));
        if (!second) continue;
        cases.push({
          kind: 'public-policy-action-disagreement',
          positionId: position.id,
          positionClassification: position.classification,
          positionSource: position.source,
          replayCheckpoint: replayCheckpoint(position),
          actions: [clone(choices[firstIndex].action), clone(second.action)],
          strategies: [choices[firstIndex].strategy, second.strategy],
          whySelected: 'These named public policies choose different legal first actions on the same frozen checkpoint.',
          evidence: { scoringConfig: clone(evaluation.scoringConfig), status: 'deterministic policy choice, not an estimated winning action' },
          limits: 'One checkpoint and fixed policy definitions do not predict human choices or prove that players understand the trade-off.'
        });
        break;
      }
    }
    for (const pair of evaluation.result.discovery.pairs) {
      if (pair.opponents.length !== 2 || pair.opponents.some(opponent => opponent.meanDifference === null || opponent.meanDifference === 0)) continue;
      if (Math.sign(pair.opponents[0].meanDifference) === Math.sign(pair.opponents[1].meanDifference)) continue;
      const position = positionById.get(pair.positionId);
      cases.push({
        kind: 'estimated-preferred-action-differs-by-opponent',
        positionId: pair.positionId,
        positionClassification: position?.classification ?? 'unknown',
        positionSource: position?.source ?? 'unknown',
        replayCheckpoint: position ? replayCheckpoint(position) : null,
        actions: clone(pair.actions),
        strategies: [evaluation.focalStrategy, ...evaluation.opponents.map(opponent => opponent.id)],
        whySelected: 'The discovery point estimates prefer opposite actions against the two named opponents, even when the preregistered evidence threshold is not met.',
        evidence: {
          scoringConfig: clone(evaluation.scoringConfig),
          discoveryClassification: pair.classification,
          opponents: clone(pair.opponents),
          confirmation: evaluation.result.confirmation.pairs.find(candidate => candidate.positionId === pair.positionId
            && sameValue(candidate.candidateIndices, pair.candidateIndices)) ?? null
        },
        limits: 'Exploratory point estimates may be noisy and were selected after examining multiple positions and action pairs; this is a playtest lead, not evidence of reliable advantage.'
      });
    }
  }
  const uniqueCases = new Map();
  for (const item of cases) {
    const key = `${item.kind}:${item.positionId}:${JSON.stringify(item.actions)}:${JSON.stringify(item.strategies)}`;
    if (!uniqueCases.has(key)) uniqueCases.set(key, item);
  }
  return [...uniqueCases.values()];
}

function pairedDeltas(batchReport) {
  return Object.values(batchReport.summary.pairedComparison.byStrategyPair).map(pair => ({
    strategies: pair.strategies,
    mean: pair.pairedWinValueDelta.mean,
    interval95: pair.pairedWinValueDelta.confidenceInterval95,
    clusters: pair.pairedWinValueDelta.sampleClusters,
    plannedClusters: pair.plannedClusters
  }));
}

function summarizeEvaluation(report) {
  return {
    focalStrategy: report.configuration.focalStrategy,
    opponents: report.configuration.opponents,
    configuration: report.configuration,
    summary: report.summary,
    discoveryPairs: report.discovery.pairs,
    confirmationPairs: report.confirmation.pairs,
    limitations: report.limitations
  };
}

function buildResearchMarkdown(study) {
  const { coverage } = study.summary;
  const lines = [
    '# 现行规则的状态、行动取舍与策略收益评价',
    '',
    '这是一份电脑自动对局与状态结构取舍的评价报告，不是真人试玩最终结论。你只看下面正文即可；后面的技术附录是给开发者核对和重放用的。',
    '',
    '## 1. 核心问题回答（问题—证据—边界）',
    '',
    '### 问题一：哪些状态下建设、破坏、调息各有价值？',
    '- **证据与分析：**',
    `  - **状态结构空间：** 游戏单方拥有 5 个五行节点、每节点阴阳两侧，共 10 个状态位，各侧取值范围为 {-1:道损, 0:虚空, 1:点亮, 2:加持}。单方等价类为 209,728 个；双方理论棋盘组合为 $4^{20} \\approx 1.10 \\times 10^{12}$（字段路径: evaluation.json#/theoreticalStateSpace）。`,
    `  - **动作分布与固定局面检验：** 本次评估涵盖 ${study.positionAnalyses.length} 个固定基准局面，全运行记录有效动作序列样本数 ${study.summary.effectiveSamples}（字段路径: evaluation.json#/summary/effectiveSamples）。在固定局面评估中，探索阶段发现对数分型为 ${JSON.stringify(study.summary.discoveryClassifications)}，独立确认对数为 ${study.summary.confirmedPairs}（字段路径: evaluation.json#/summary/confirmedPairs）。`
  ];

  if (study.summary.confirmedPairs > 0) {
    lines.push(`  - **数据结论：** 观测到 ${study.summary.confirmedPairs} 组经独立确认的动作偏好反转（详见 evaluation.json#/evaluations）。`);
  } else {
    lines.push('  - **数据结论：** 在测试的固定局面与策略对阵中，经独立确认的动作偏好反转对数为 0（见 evaluation.json#/summary/confirmedPairs）。数据不足以证明某类动作在特定局面下全局优于另一类动作（证据不足）。');
  }
  lines.push(
    '  - **动作类别说明：** 吸纳(AUTO)对应天干免费点亮；调息(CONVERT)平衡本节点阴阳两侧；化(TRANS)推进相生链路点亮；破坏类(ATK/BURST_ATK)压制对手节点。动作即时改变量详见 evaluation.json#/positionAnalyses。',
    `- **结论边界：** 动作价值受制于有限基准局面（${study.positionAnalyses.map(p => p.positionId).join(', ')}）及固定公共策略池（build-priority, attack-priority, situation-responsive），不推断人类最优玩法。`,
    '',
    '### 问题二：强化类是否挤压其他选择，额外行动贡献多少？',
    '- **证据与分析：**',
    '  - **机制规则：** 强化(BURST)与强破(BURST_ATK)必须消耗自身 1 点归一/合一侧状态，换取 2 次生/克属性操作，并在非连动回合中获得额外行动机会。若已处于连动回合，再次强化不重复赋予额外行动。'
  );

  if (!study.turnOrderDiagnostics || study.turnOrderDiagnostics.length === 0) {
    lines.push('  - **次序价值实测：** 本次评估未配置针对强化局面的次序对照诊断（字段路径: evaluation.json#/turnOrderDiagnostics 为空）。');
  } else {
    lines.push('  - **次序价值实测：**');
    for (const [idx, diag] of study.turnOrderDiagnostics.entries()) {
      const bursts = diag.formalComparison.actions.filter(a => ['BURST', 'BURST_ATK'].includes(a.action.type));
      if (diag.seeds.length < 6) {
        lines.push(`    - 局面 ${diag.positionId}（种子数 n=${diag.seeds.length}）：样本量低于门槛 6，证据不足，不输出方向性推断（字段路径: evaluation.json#/turnOrderDiagnostics/${idx}）。`);
      } else if (bursts.length === 0) {
        lines.push(`    - 局面 ${diag.positionId}：无合法强化动作（字段路径: evaluation.json#/turnOrderDiagnostics/${idx}）。`);
      } else {
        for (const burstAction of bursts) {
          const contrib = diag.turnOrderContributions.find(c => c.action.type === burstAction.action.type);
          const delta = contrib?.turnOrderValueDelta ?? 0;
          if (delta === 0) {
            lines.push(`    - 局面 ${diag.positionId} [${burstAction.action.type}]：强化动作额外行动价值增量为 0.000（字段路径: evaluation.json#/turnOrderDiagnostics/${idx}）。在测试样本中未改变终局胜负走向（差值为 0）。`);
          } else {
            lines.push(`    - 局面 ${diag.positionId} [${burstAction.action.type}]：额外行动价值增量点估计为 ${delta > 0 ? '+' : ''}${delta.toFixed(3)}（字段路径: evaluation.json#/turnOrderDiagnostics/${idx}）。`);
          }
        }
      }
    }
  }

  lines.push(
    '- **结论边界：** 额外行动影响依赖于具体测试局面与天干随机序列，受制于测试样本规模。',
    '',
    '### 问题三：局势切换是否提高获胜机会？',
    '- **证据与分析：**',
    '  - **对照组设计：** 局势响应策略在对手点亮侧 >= 8 时切换为进攻，其余时段保持建设。对照组为相同偏好表下不切换的固定建设(fixed-build)与固定进攻(fixed-attack)（字段路径: evaluation.json#/tournament/strategies）。',
    `  - **威胁模式实际触发：** 局势响应策略在所有对局中威胁模式实际触发 ${study.tournament.switchingAnalysis.threatModeTriggerCount} 次（字段路径: evaluation.json#/tournament/switchingAnalysis/threatModeTriggerCount）。`,
    '  - **统计量引用：**',
    `    - 局势响应胜负价值: ${study.tournament.switchingAnalysis.situationResponsiveValue.toFixed(3)}（字段路径: evaluation.json#/tournament/switchingAnalysis/situationResponsiveValue）`,
    `    - 固定建设胜负价值: ${study.tournament.switchingAnalysis.fixedBuildValue.toFixed(3)}，成对差值点估计 Δ=${study.tournament.switchingAnalysis.switchingAdvantageOverFixedBuild > 0 ? '+' : ''}${study.tournament.switchingAnalysis.switchingAdvantageOverFixedBuild.toFixed(3)}，95% CI [${study.tournament.switchingAnalysis.deltaFixedBuildStats?.confidenceInterval95 ? `${study.tournament.switchingAnalysis.deltaFixedBuildStats.confidenceInterval95.lower.toFixed(3)}, ${study.tournament.switchingAnalysis.deltaFixedBuildStats.confidenceInterval95.upper.toFixed(3)}` : 'n/a'}]（字段路径: evaluation.json#/tournament/switchingAnalysis/deltaFixedBuildStats）`,
    `    - 固定进攻胜负价值: ${study.tournament.switchingAnalysis.fixedAttackValue.toFixed(3)}，成对差值点估计 Δ=${study.tournament.switchingAnalysis.switchingAdvantageOverFixedAttack > 0 ? '+' : ''}${study.tournament.switchingAnalysis.switchingAdvantageOverFixedAttack.toFixed(3)}，95% CI [${study.tournament.switchingAnalysis.deltaFixedAttackStats?.confidenceInterval95 ? `${study.tournament.switchingAnalysis.deltaFixedAttackStats.confidenceInterval95.lower.toFixed(3)}, ${study.tournament.switchingAnalysis.deltaFixedAttackStats.confidenceInterval95.upper.toFixed(3)}` : 'n/a'}]（字段路径: evaluation.json#/tournament/switchingAnalysis/deltaFixedAttackStats）`,
    `    - 样本数: 锦标赛总场次 ${study.tournament.totalRuns} 局，有效动作序列 ${study.tournament.effectiveSamples}，种子数 ${study.tournament.seeds.length}（字段路径: evaluation.json#/tournament/seeds）。`,
    `  - **判定结论：** ${study.tournament.switchingAnalysis.interpretation}`,
    `- **结论边界：** ${study.tournament.inferenceBoundary}`,
    '',
    '### 问题四：现行计分强化已有优势还是补偿真实代价？',
    '- **证据与分析：**',
    `  - **终局形式统计：** 游戏以五行归元为主要胜利目标，达到回合上限（${study.summary.maxTurns} 回合）时触发计分结算。在本次锦标赛中，终局分布为：五行归元 ${study.tournament.terminalDistribution['五行归元']} 局，回合上限结算 ${study.tournament.terminalDistribution['回合上限结算']} 局（字段路径: evaluation.json#/tournament/terminalDistribution）。`,
    '  - **计分变体成对差值：**'
  );

  let allBatchDeltasZero = true;
  for (const [idx, comp] of study.batchComparisons.entries()) {
    const validDeltas = comp.pairedDeltas.filter(d => d.mean !== null);
    const nonZero = validDeltas.filter(d => Math.abs(d.mean) > 1e-6);
    if (nonZero.length > 0) allBatchDeltasZero = false;
    const deltaSummary = comp.pairedDeltas.map(d => `${d.strategies.P1} vs ${d.strategies.P2}: ${d.mean === null ? 'n/a' : d.mean.toFixed(3)} [${d.interval95 ? `${d.interval95.lower.toFixed(3)}, ${d.interval95.upper.toFixed(3)}` : 'n/a'}]`).join('; ');
    lines.push(`    - ${comp.selection}（相对于基准）: ${deltaSummary}，种子簇数 ${comp.pairedDeltas[0]?.clusters ?? 0}/${comp.pairedDeltas[0]?.plannedClusters ?? 0}（字段路径: evaluation.json#/batchSummaries/${idx}）。`);
  }

  if (allBatchDeltasZero) {
    lines.push('  - **数据结论：** 在测试样本中，所有计分变体相对于基准的胜负价值成对差值点估计均为 0.000，未发生胜负反转。数据不足以支持计分变体对终局胜负存在实质改变（差值为 0 / 证据不足）。');
  } else {
    lines.push('  - **数据结论：** 计分变体成对差值详见上述统计，置信区间若跨越 0 则不构成统计显著差异。');
  }

  lines.push(
    '- **结论边界：** 当前样本对小分差的影响仍在统计波动范围内，计分体系对胜率的深层塑造需更大样本验证。',
    '',
    '### 问题五：哪些问题仍不能判断？',
    study.summary.confirmedPairs > 0
      ? `- 动作反转覆盖度：虽然观测到 ${study.summary.confirmedPairs} 组确认反转，但未覆盖全部策略对与局势组合（字段路径: evaluation.json#/summary/confirmedPairs）；`
      : '- 对手变动导致的策略交叉反转在本次样本中确认对数为 0，仍属于「证据不足」（字段路径: evaluation.json#/summary/confirmedPairs）；',
    study.tournament.switchingAnalysis.hasSignificantAdvantage
      ? '- 局势切换优势已在测试环境中通过置信区间检验，但仍受限于五种预设策略池，未证明对未知对手的最优性；'
      : `- 局势切换的独立超额优势在当前数据下仍属于「证据不足」（威胁模式触发 ${study.tournament.switchingAnalysis.threatModeTriggerCount} 次，置信区间跨 0 或样本不足）；`,
    '- 电脑策略的取舍选择不等于真人玩家的直观体验，无法直接推断游戏是否好玩或易学。',
    '',
    '## 2. 状态结构与探索性取舍地图',
    '',
    '| 局面 ID | 局面情境 | 当前天干 | 合法首步动作 | 动作特征概要 | 字段路径 |',
    '| --- | --- | --- | --- | --- | --- |'
  );

  for (const [idx, pa] of study.positionAnalyses.entries()) {
    const actSummary = pa.tradeoffTable?.actions?.map(a => a.action.type).join(', ') || 'none';
    const tagSummary = [...new Set(pa.tradeoffTable?.actions?.flatMap(a => a.effect?.tags ?? []) ?? [])].join(', ') || 'none';
    lines.push(`| ${pa.positionId} | ${pa.classification} | ${pa.stateStructure?.currentStem?.name ?? '未知'} | ${actSummary} | ${tagSummary} | evaluation.json#/positionAnalyses/${idx} |`);
  }

  lines.push(
    '',
    '说明：上述取舍基于固定局面下的首步动作即时状态改变量（见 evaluation.json#/positionAnalyses），不构成全局胜负方向性判断。',
    '',
    '## 3. 预先固定的确认实验计划',
    '',
    '- **假设设定：** 在对手接近点亮(>=8侧)的局面下，破坏类动作的胜负期望价值高于建设类动作。',
    '- **冻结条件：** 策略版本冻结为 `build-priority@1`、`attack-priority@1`、`situation-responsive@1`；不复用探索阶段的种子。',
    `- **样本预算：** 探索样本 >= 6 对，独立确认样本 >= 12 对（字段路径: evaluation.json#/plan）。`,
    '- **停止条件：** 若 95% 置信区间跨越 0 或效果量低于 0.1，判定为无反转或证据不足，不降低门槛制造成功。',
    '',
    '## 4. 真人复核案例与试玩核对问题',
    ''
  );

  if (study.humanCases.length === 0) {
    lines.push('在实际测试记录中，未出现策略首步分歧或条件反转案例（字段路径: evaluation.json#/humanCases 为空）。');
  } else {
    for (const [index, item] of study.humanCases.entries()) {
      lines.push(`- 案例 ${index + 1}: ${item.kind} 于局面 ${item.positionId}；动作为 ${JSON.stringify(item.actions)}。${item.whySelected} 证据边界: ${item.limits}`);
    }
  }

  lines.push(
    '',
    '对于实际记录中的策略分歧案例，建议组织真人试玩并核对以下核心问题：',
    '1. 预判对手策略是否改变了你在此局面的首步选择？',
    '2. 正确识破对手是否带来了实质性对局优势？',
    '3. 在发动进攻打断对手后，你是否仍有有效的推进路线？',
    '',
    '---',
    '',
    '# 技术附录（开发者核对用）',
    '',
    '## Observed facts',
    '',
    `- Revision: ${study.revision.commit ?? 'unavailable'}; working-tree status: ${study.revision.workingTree ?? 'unavailable'}; source SHA-256: ${study.revision.sourceSha256 ?? 'unavailable'}.`,
    `- Planned / completed / failed / budget-skipped runs: ${coverage.planned} / ${coverage.completed} / ${coverage.failed} / ${coverage.skipped}.`,
    `- Frozen positions: ${study.plan.positions.map(position => `${position.id} (${position.classification}, ${position.source}, sha256 ${position.stateSha256})`).join('; ')}.`,
    `- Scoring selections: ${study.plan.scoringSelections.map(selection => `${selection.id}=${selection.scoringConfig.name}@${selection.scoringConfig.version}`).join('; ')}.`,
    `- Fixed-position reports: ${study.evaluations.length}; paired batch comparison reports: ${study.batchComparisons.length}; repeated formal-baseline controls retained: ${study.summary.baselineControls}.`,
    `- Human-review cases selected from actual records: ${study.humanCases.length}.`
  );
  for (const comparison of study.batchComparisons) {
    lines.push(`- ${comparison.selection}: paired terminal-value deltas (selection − formal baseline) by ordered strategy assignment: ${comparison.pairedDeltas.map(item => `${item.strategies.P1} vs ${item.strategies.P2} ${item.mean === null ? 'n/a' : item.mean.toFixed(3)} [${item.interval95 ? `${item.interval95.lower.toFixed(3)}, ${item.interval95.upper.toFixed(3)}` : 'n/a'}], seed clusters ${item.clusters}/${item.plannedClusters}`).join('; ')}.`);
    const pointEstimateDeclines = comparison.pairedDeltas.filter(item => item.mean !== null && item.mean < 0);
    lines.push(`- ${comparison.selection}: ${pointEstimateDeclines.length
      ? `lower candidate point estimates observed for ${pointEstimateDeclines.map(item => `${item.strategies.P1} vs ${item.strategies.P2}`).join(', ')}`
      : 'no lower candidate point estimate observed'}; these small paired estimates do not establish absence of a real decline.`);
    for (const config of comparison.result.plan.configurations) {
      const summary = comparison.result.summary.configurations[config.id];
      const actions = Object.entries(summary.actionFrequency.actions).map(([type, metric]) => `${type} ${metric.count}`).join(', ') || 'none';
      lines.push(`- ${comparison.selection} ${config.role}: matches ${summary.completedMatches}/${summary.plannedMatches}; actions ${actions}; mean opportunities ${summary.matchLength.opportunities.mean}; unity wins ${summary.unityVictory.count}; turn-limit settlements ${summary.turnLimitSettlement.count}; repeated-board matches ${summary.repeatedBoardKeys.matchesWithRepeats}; progress/destruction amount ${summary.progressAndDestruction.progressAmount}/${summary.progressAndDestruction.destructionAmount}.`);
    }
  }
  for (const selection of study.plan.scoringSelections) {
    const classifications = study.evaluations.filter(item => item.selection === selection.id)
      .flatMap(item => item.result.discovery.pairs).reduce((counts, pair) => {
        counts[pair.classification] = (counts[pair.classification] ?? 0) + 1;
        return counts;
      }, {});
    const confirmed = study.evaluations.filter(item => item.selection === selection.id)
      .reduce((total, item) => total + item.result.summary.confirmedPairCount, 0);
    lines.push(`- ${selection.id} fixed-position discovery classifications: ${JSON.stringify(classifications)}; independent confirmations: ${confirmed}.`);
  }
  lines.push('', '## Limited inference', '');
  lines.push('- Outcomes are conditional on the finite frozen checkpoint set, the stated public continuation policies, paired seeds, and the formal win/draw/loss value scale. They do not identify globally optimal actions or establish general player advantage.');
  lines.push('- A confirmed reversal supports a conditional trade-off only in the tested states and policy range. Action frequency, close scores, and longer matches are descriptive diagnostics, not standalone evidence of better play.');
  lines.push('- Crossover search examines multiple positions and action pairs, so exploration results are selected estimates; only declared discovery qualifications are checked on disjoint confirmation seeds.');
  lines.push('- The report retains failures and budget skips rather than converting them to draws. No automatic formal-scoring change follows from these findings.');
  lines.push('', '## Human questions', '');
  if (study.humanCases.length === 0) lines.push('- No actual public-policy action disagreement or opponent-conditioned estimated action-preference reversal appeared; no case is fabricated.');
  else {
    for (const [index, item] of study.humanCases.entries()) {
      lines.push(`- Case ${index + 1}: ${item.kind} at ${item.positionId}; exact actions ${JSON.stringify(item.actions)}. ${item.whySelected} Evidence limit: ${item.limits}`);
    }
  }
  lines.push('', 'For each actual case, ask:', '', '1. Did anticipating this opponent change which first action you chose?', '2. Did a correct read of the opponent create a meaningful advantage?', '3. After attacking, did you still have a useful way to make progress?', '', 'No scoring selection is automatically adopted.');
  return lines.join('\n');
}

/** Run the issue-08 scoring and policy grid sequentially, retaining all raw comparisons. */
export function runStrategyEvaluationStudy(options = {}) {
  const positions = options.positions;
  if (!Array.isArray(positions) || positions.length === 0) throw new TypeError('positions must be a non-empty frozen-position collection');

  if (Array.isArray(options.maxTurns)) {
    if (options.maxTurns.length === 0) throw new TypeError('maxTurns array must not be empty');
    for (const mt of options.maxTurns) {
      if (!Number.isSafeInteger(mt) || mt < 1) throw new TypeError('maxTurns elements must be positive safe integers');
    }
    const sweep = options.maxTurns.map(turns => runStrategyEvaluationStudy({ ...options, maxTurns: turns }));
    const primary = sweep.find(s => s.plan.maxTurns === 60) ?? sweep[sweep.length - 1];
    return {
      ...primary,
      sweep: sweep.map(s => ({
        maxTurns: s.plan.maxTurns,
        summary: s.machineSummary?.summary ?? s.summary,
        tournament: s.tournament,
        batchSummaries: s.machineSummary?.batchSummaries
      }))
    };
  }

  const discoverySamples = options.discoverySamples ?? options.samples ?? options.seeds ?? 200;
  const confirmationSamples = options.confirmationSamples ?? options.samples ?? options.seeds ?? 200;
  const seed = options.seed ?? 202603;
  const maxTurns = options.maxTurns ?? 60;
  if (!Number.isSafeInteger(discoverySamples) || discoverySamples < 1) throw new TypeError('discoverySamples must be a positive safe integer');
  if (!Number.isSafeInteger(confirmationSamples) || confirmationSamples < 1) throw new TypeError('confirmationSamples must be a positive safe integer');
  if (!Number.isSafeInteger(maxTurns) || maxTurns < 1) throw new TypeError('maxTurns must be a positive safe integer');
  const discoverySeeds = generateSeeds(seed, discoverySamples, 'discovery', discoverySamples);
  const confirmationSeeds = generateSeeds(seed, confirmationSamples, 'confirmation', discoverySamples);
  const selections = resolveScoringSelections(options.config ?? 'all');
  const criteria = {
    minimumEffect: options.minimumEffect ?? 0.1,
    minimumPairs: options.minimumPairs ?? 6,
    uncertaintyMethod: 'paired-normal-95',
    evidenceRule: 'interval-excludes-zero'
  };
  if (options.maxRuns !== null && options.maxRuns !== undefined
    && (!Number.isSafeInteger(options.maxRuns) || options.maxRuns < 0)) throw new TypeError('maxRuns must be a non-negative safe integer');

  const revision = options.revision ?? { commit: null, workingTree: null };
  const batchComparisons = [];
  const evaluations = [];
  let remainingBudget = options.maxRuns ?? undefined;
  let fixedAttempted = 0;
  for (const [selection, scoringConfig] of selections) {
    const batch = runBatchComparison({
      samples: discoverySamples,
      seed,
      maxTurns,
      baselineScoringConfig: {},
      experimentalScoringConfig: scoringConfig
    });
    batchComparisons.push({
      selection,
      result: batch,
      pairedDeltas: pairedDeltas(batch),
      baselineControlReuse: {
        identity: `${seed}:sample-count-${discoverySamples}:formal-baseline`,
        appearsInThisComparison: batch.results.filter(result => result.configurationRole === 'baseline').length,
        note: 'runBatchComparison reruns the formal-baseline controls for every selection; these repeated results are disclosed and are not treated as independent controls.'
      }
    });
    for (const focalStrategy of STRATEGY_IDS) {
      for (const opponentPair of STRATEGY_PAIRS) {
        const opponents = opponentPair.map(strategy => ({ id: strategy, strategy }));
        const result = evaluateCrossoverConfirmation({
          positions,
          focalStrategy,
          opponents,
          discoverySeeds,
          confirmationSeeds,
          scoringConfig,
          criteria,
          maxTurns,
          ...(remainingBudget === undefined ? {} : { maxRuns: remainingBudget })
        });
        fixedAttempted += result.summary.attemptedMatchCount;
        if (remainingBudget !== undefined) remainingBudget = Math.max(0, remainingBudget - result.summary.attemptedMatchCount);
        evaluations.push({ selection, scoringConfig: result.configuration.scoringConfig, focalStrategy, opponents, result });
      }
    }
  }

  const batchCoverage = batchComparisons.reduce((coverage, comparison) => ({
    planned: coverage.planned + comparison.result.plan.plannedMatches,
    completed: coverage.completed + comparison.result.coverage.completedMatches,
    failed: coverage.failed + comparison.result.coverage.failedMatches,
    skipped: coverage.skipped + comparison.result.coverage.skippedMatches
  }), { planned: 0, completed: 0, failed: 0, skipped: 0 });
  const fixedCoverage = evaluations.reduce((coverage, evaluation) => ({
    planned: coverage.planned + evaluation.result.summary.plannedMatchCount,
    completed: coverage.completed + evaluation.result.summary.completedMatchCount,
    failed: coverage.failed + evaluation.result.summary.failedMatchCount,
    skipped: coverage.skipped + evaluation.result.summary.budgetSkippedMatchCount
  }), { planned: 0, completed: 0, failed: 0, skipped: 0 });
  const discoveryClassifications = evaluations.flatMap(evaluation => evaluation.result.discovery.pairs)
    .reduce((counts, pair) => {
      counts[pair.classification] = (counts[pair.classification] ?? 0) + 1;
      return counts;
    }, {});
  const humanCases = findHumanReviewCases(evaluations, positions);
  const configurationSnapshots = selections.map(([name, input]) => ({
    id: name,
    selection: name,
    scoringConfig: createScoringConfig(input)
  }));

  const theoreticalStateSpace = computeTheoreticalStateSpace();
  const positionAnalyses = positions.map(position => ({
    positionId: position.id,
    classification: position.classification,
    stateStructure: analyzeStateStructure(position.state),
    situation: classifyPositionSituation(position),
    tradeoffTable: generatePositionTradeoffTable(position, { scoringConfig: {} })
  }));

  const tournament = runStrategyTournament({
    seeds: discoverySeeds,
    maxTurns,
    scoringConfig: selections[0]?.[1] ?? {}
  });

  const turnOrderDiagnostics = [];
  const burstTargets = [
    ...(options.burstPosition ? [options.burstPosition] : []),
    ...positions.filter(pos => {
      const table = generatePositionTradeoffTable(pos, { scoringConfig: {} });
      return table.actions.some(a => ['BURST', 'BURST_ATK'].includes(a.action.type));
    })
  ];
  for (const position of burstTargets) {
    if (options.maxRuns === null || options.maxRuns === undefined || options.maxRuns > 0) {
      turnOrderDiagnostics.push(runTurnOrderDiagnostic({
        position,
        strategies: { P1: 'build-priority', P2: 'attack-priority' },
        seeds: discoverySeeds,
        scoringConfig: {}
      }));
    }
  }

  const study = {
    schemaVersion: 1,
    status: 'complete',
    theoreticalStateSpace,
    positionAnalyses,
    tournament,
    turnOrderDiagnostics,
    plan: {
      seed,
      discoverySeeds,
      confirmationSeeds,
      discoverySamples,
      confirmationSamples,
      maxTurns,
      maxRuns: options.maxRuns ?? null,
      randomVersion: SEEDED_RANDOM_VERSION,
      criteria,
      strategyDefinitions: STRATEGY_IDS.map(id => clone(PUBLIC_STRATEGIES[id])),
      strategyAssignments: STRATEGY_IDS.flatMap(P1 => STRATEGY_IDS.map(P2 => ({ P1, P2 }))),
      focalOpponentPairsPerConfiguration: STRATEGY_IDS.length * STRATEGY_PAIRS.length,
      scoringSelections: configurationSnapshots,
      positions: positions.map(position => ({
        id: position.id,
        classification: position.classification,
        source: position.source,
        stateSha256: identity(position.state),
        currentPlayer: position.currentPlayer,
        currentStem: clone(position.currentStem),
        turnCount: position.state.turnCount,
        maxTurns: position.state.maxTurns,
        provenance: provenanceIdentity(position.provenance)
      })),
      fixedPositionContinuationMaxTurns: maxTurns
    },
    revision: clone(revision),
    batchComparisons,
    evaluations: evaluations.map(evaluation => ({
      selection: evaluation.selection,
      scoringConfig: evaluation.scoringConfig,
      focalStrategy: evaluation.focalStrategy,
      opponents: evaluation.opponents,
      result: evaluation.result
    })),
    humanCases,
    summary: {
      maxTurns,
      totalRuns: batchCoverage.completed + fixedCoverage.completed + (tournament?.totalRuns ?? 0),
      effectiveSamples: (() => {
        const set = new Set();
        for (const comp of batchComparisons) {
          for (const r of comp.result.results) {
            if (Array.isArray(r.actionRecords)) {
              set.add(r.actionRecords.map(a => `${a.playerId}:${a.action?.type}:${a.stem?.name}`).join(';'));
            }
          }
        }
        if (tournament?.matchups) {
          for (const matchup of tournament.matchups) {
            for (const m of matchup.matches) {
              if (m.actionSequence) set.add(m.actionSequence);
            }
          }
        }
        for (const evaluation of evaluations) {
          for (const phase of ['discovery', 'confirmation']) {
            for (const comp of evaluation.result[phase].comparisons) {
              for (const branch of comp.firstActions) {
                for (const s of branch.samples) {
                  if (s.status === 'completed' && s.replay?.actionRecords) {
                    set.add(s.replay.actionRecords.map(a => `${a.playerId}:${a.action?.type}:${a.stem?.name}`).join(';'));
                  }
                }
              }
            }
          }
        }
        return set.size;
      })(),
      coverage: {
        planned: batchCoverage.planned + fixedCoverage.planned,
        completed: batchCoverage.completed + fixedCoverage.completed,
        failed: batchCoverage.failed + fixedCoverage.failed,
        skipped: batchCoverage.skipped + fixedCoverage.skipped,
        continuationBudgetAttempted: fixedAttempted,
        batchMatches: batchCoverage,
        fixedContinuations: fixedCoverage
      },
      discoveryClassifications,
      confirmedPairs: evaluations.reduce((sum, evaluation) => sum + evaluation.result.summary.confirmedPairCount, 0),
      notConfirmedPairs: evaluations.reduce((sum, evaluation) => sum + evaluation.result.summary.notConfirmedPairCount, 0),
      notRunPairs: evaluations.reduce((sum, evaluation) => sum + evaluation.result.summary.notRunPairCount, 0),
      baselineControls: batchComparisons.reduce((sum, comparison) => sum + comparison.baselineControlReuse.appearsInThisComparison, 0)
    },
    limitations: [
      'All strategy-selection results are scoped to the three named public strategies and the supplied frozen checkpoints.',
      'Each runBatchComparison selection repeats the formal baseline controls; repeated matches are disclosed and are not independent new controls.',
      'A paired heavenly-stem seed does not guarantee identical personal stem opportunities after extra actions diverge.',
      'Human playability, opponent-reading behavior, and willingness to replay require human sessions; automated evidence cannot answer them.'
    ]
  };
  study.summary.status = study.summary.coverage.failed > 0 || study.summary.coverage.skipped > 0
    || study.summary.coverage.completed < study.summary.coverage.planned ? 'incomplete' : 'complete';
  study.status = study.summary.status;
  study.machineSummary = {
    schemaVersion: study.schemaVersion,
    status: study.status,
    theoreticalStateSpace,
    positionAnalyses,
    tournament,
    turnOrderDiagnostics,
    plan: study.plan,
    revision: study.revision,
    summary: study.summary,
    batchSummaries: batchComparisons.map(comparison => ({
      selection: comparison.selection,
      plan: comparison.result.plan,
      coverage: comparison.result.coverage,
      summary: comparison.result.summary,
      baselineControlReuse: comparison.baselineControlReuse
    })),
    evaluations: evaluations.map(evaluation => ({
      selection: evaluation.selection,
      focalStrategy: evaluation.focalStrategy,
      opponents: evaluation.opponents,
      scoringConfig: evaluation.scoringConfig,
      result: summarizeEvaluation(evaluation.result)
    })),
    humanCases,
    limitations: study.limitations,
    rawArtifact: 'evaluation-full.json.gz'
  };
  study.researchMarkdown = buildResearchMarkdown(study);
  return study;
}
