/**
 * 归元弈 (Guiyuan) - 【破】(ATK) 盘面边际收益诊断 (ticket 08)
 *
 * 目的：测量【破】在盘面上的边际价值随「使用次数」与「所处阶段」的变化曲线，
 * 判定它有没有递减收益。本诊断**剥离计分**：边际收益口径是 `Metrics.atkTempoGain`
 * （一次【破】使对手「还差几次行动到五行归元」增加的量），只读盘面等级，不读取任何
 * 分数、权重或计分配置。计分轴的作用由 ticket 09 单独测量。
 *
 * 只使用既有接缝：
 *   - `ActionResolver.resolve`（场景接缝）：在受控盘面上结算单次【破】；
 *   - `BoardFixture.gameStateWith` / `boardWith`（测试基础设施）：构造受控盘面；
 *   - `Metrics.atkTempoGain` / `countActionsToGuiYuan`（唯一指标口径）。
 * 不新增第三处可替换接缝。
 *
 * 复跑命令见 package.json：`npm run benchmark:atk-marginal`。
 */

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import {
  ActionType,
  BoardState,
  NodeLevel,
  OVERCOMING_CYCLE,
  Polarity,
  WuXing
} from '../types/domain.js';
import { ActionResolver } from '../logic/ActionResolver.js';
import { getMinusTargetPolarity } from '../logic/ActionCandidates.js';
import {
  type BoardOverrides,
  type NodeLevelOverride,
  gameStateWith
} from './BoardFixture.js';
import { atkTempoGain, countActionsToGuiYuan } from './Metrics.js';

/**
 * 攻方【破】的源五行轮转顺序。每个源对应一个被克目标：
 *   木克土、火克金、土克水、水克火、金克木。
 * 一次完整轮转覆盖对手全部 5 个节点；重复轮转即「逐节点逐侧压制」。
 */
export const ATTACK_SOURCE_ORDER: readonly WuXing[] = [
  WuXing.WOOD,
  WuXing.FIRE,
  WuXing.EARTH,
  WuXing.WATER,
  WuXing.METAL
];

// ---------------------------------------------------------------------------
// 数据结构
// ---------------------------------------------------------------------------

/** 一次【破】的盘面结算记录 */
export interface AtkStep {
  /** 使用次数（第几次【破】，从 1 开始，只计合法命中） */
  readonly index: number;
  readonly source: WuXing;
  readonly target: WuXing;
  readonly polarity: Polarity;
  readonly levelBefore: NodeLevel;
  readonly levelAfter: NodeLevel;
  /** 盘面边际收益：对手 `actionsToGuiYuan` 的增量 */
  readonly gain: number;
  readonly cumulativeGain: number;
  /** 本次结算后对手还差几次行动到五行归元 */
  readonly actionsToGuiYuan: number;
}

/** 连续【破】序列的测量结果 */
export interface AtkSequence {
  readonly steps: readonly AtkStep[];
  /** 全盘封顶：对手 10 侧全部处于道损 (-1)，已无合法【破】目标 */
  readonly capped: boolean;
  readonly initialActionsToGuiYuan: number;
  readonly finalActionsToGuiYuan: number;
  readonly totalGain: number;
}

/** 单一节点（阴阳同起始等级）逐次【破】的边际收益曲线 */
export interface AtkSideCurve {
  readonly startLevel: NodeLevel;
  readonly gains: readonly number[];
  readonly totalGain: number;
  readonly hitsToCap: number;
  readonly capped: boolean;
}

/** 单个阶段的连续【破】测量 */
export interface AtkPhaseMeasurement {
  readonly key: string;
  readonly phase: string;
  readonly description: string;
  readonly opponentBoard: BoardState;
  readonly sequence: AtkSequence;
}

/** 完整诊断报告 */
export interface AtkMarginalReturnReport {
  readonly sideCurves: readonly AtkSideCurve[];
  readonly phases: readonly AtkPhaseMeasurement[];
}

// ---------------------------------------------------------------------------
// 测量
// ---------------------------------------------------------------------------

function hasAnyAtkTarget(board: BoardState): boolean {
  return Object.values(WuXing).some(
    element => getMinusTargetPolarity(board[element]) !== null
  );
}

/**
 * 在受控对手盘面上连续执行【破】，直到全盘封顶。
 * 源五行按 `ATTACK_SOURCE_ORDER` 轮转；每次命中遵循游戏自身的阴干优先目标选择
 * （`getMinusTargetPolarity`：阴侧未道损先打阴侧，否则打阳侧）。
 */
export function measureAtkSequence(opponentOverrides: BoardOverrides): AtkSequence {
  let state = gameStateWith({ P1: {}, P2: opponentOverrides, currentPlayer: 'P1' });
  const resolver = new ActionResolver();
  const steps: AtkStep[] = [];
  let cumulativeGain = 0;

  const initialActionsToGuiYuan = countActionsToGuiYuan(state.players.P2.board);

  // 每次合法命中至少使某一侧等级下降 1（下界 -1），故合法命中次数有限；
  // cursor 上限只是防止实现缺陷导致死循环。
  const maxIterations = ATTACK_SOURCE_ORDER.length * 10 * 3;
  let cursor = 0;
  while (cursor < maxIterations && hasAnyAtkTarget(state.players.P2.board)) {
    const source = ATTACK_SOURCE_ORDER[cursor % ATTACK_SOURCE_ORDER.length];
    cursor++;

    const target = OVERCOMING_CYCLE[source];
    const polarity = getMinusTargetPolarity(state.players.P2.board[target]);
    if (polarity === null) {
      continue;
    }

    const before = state.players.P2.board;
    const levelBefore = before[target][polarity];
    const result = resolver.resolve(state, {
      actionType: ActionType.ATK,
      player: 'P1',
      sourceElement: source,
      polarity
    });
    const after = result.nextState.players.P2.board;
    const gain = atkTempoGain(before, after);
    cumulativeGain += gain;

    steps.push({
      index: steps.length + 1,
      source,
      target,
      polarity,
      levelBefore,
      levelAfter: after[target][polarity],
      gain,
      cumulativeGain,
      actionsToGuiYuan: countActionsToGuiYuan(after)
    });

    state = result.nextState;
  }

  return {
    steps,
    capped: !hasAnyAtkTarget(state.players.P2.board),
    initialActionsToGuiYuan,
    finalActionsToGuiYuan: countActionsToGuiYuan(state.players.P2.board),
    totalGain: cumulativeGain
  };
}

/**
 * 构造「只有木节点可被攻击、其余 4 节点全道损」的盘面，
 * 用于隔离单一节点的逐次【破】曲线。
 */
function singleAttackableNodeBoard(startLevel: NodeLevel): BoardOverrides {
  const dead: NodeLevelOverride = { yin: -1, yang: -1 };
  return {
    [WuXing.WOOD]: { yin: startLevel, yang: startLevel },
    [WuXing.FIRE]: dead,
    [WuXing.EARTH]: dead,
    [WuXing.METAL]: dead,
    [WuXing.WATER]: dead
  };
}

/** 逐起始等级测量单一节点的【破】边际收益曲线（0 / 1 / 2 / 已道损 -1） */
export function measureSideCurves(): AtkSideCurve[] {
  const startLevels: readonly NodeLevel[] = [0, 1, 2, -1];
  return startLevels.map(startLevel => {
    const sequence = measureAtkSequence(singleAttackableNodeBoard(startLevel));
    return {
      startLevel,
      gains: sequence.steps.map(step => step.gain),
      totalGain: sequence.totalGain,
      hitsToCap: sequence.steps.length,
      capped: sequence.capped
    };
  });
}

/**
 * 三个阶段代表盘面：
 * - 低位态期：对手 10 侧全虚空（开局，尚未建设）；
 * - 中盘：对手 2 节点归一 + 1 侧加持 + 其余虚空；
 * - 残局：对手 9 侧点亮 + 1 侧道损（听牌临界态且最后一侧已道损）。
 */
export const ATK_PHASES: readonly {
  readonly key: string;
  readonly phase: string;
  readonly description: string;
  readonly overrides: BoardOverrides;
}[] = [
  {
    key: 'low-state',
    phase: '低位态期',
    description: '对手 10 侧全虚空 (0)，尚未建设（开局盘面）',
    overrides: {}
  },
  {
    key: 'midgame',
    phase: '中盘',
    description: '对手木/火节点归一 (1,1) + 土节点阴侧加持 (2,0)，其余虚空',
    overrides: {
      [WuXing.WOOD]: { yin: 1, yang: 1 },
      [WuXing.FIRE]: { yin: 1, yang: 1 },
      [WuXing.EARTH]: { yin: 2, yang: 0 }
    }
  },
  {
    key: 'endgame',
    phase: '残局',
    description: '对手 9 侧点亮 + 水节点阳侧道损 (1,-1)（听牌临界态且最后一侧已道损）',
    overrides: {
      [WuXing.WOOD]: { yin: 1, yang: 1 },
      [WuXing.FIRE]: { yin: 1, yang: 1 },
      [WuXing.EARTH]: { yin: 1, yang: 1 },
      [WuXing.METAL]: { yin: 1, yang: 1 },
      [WuXing.WATER]: { yin: 1, yang: -1 }
    }
  }
];

/** 运行完整诊断：逐侧曲线 + 三阶段曲线。 */
export function runAtkMarginalReturn(): AtkMarginalReturnReport {
  const phases: AtkPhaseMeasurement[] = ATK_PHASES.map(phase => ({
    key: phase.key,
    phase: phase.phase,
    description: phase.description,
    opponentBoard: gameStateWith({ P2: phase.overrides }).players.P2.board,
    sequence: measureAtkSequence(phase.overrides)
  }));

  return { sideCurves: measureSideCurves(), phases };
}

// ---------------------------------------------------------------------------
// 报告格式化（可直接粘贴进文档的 markdown）
// ---------------------------------------------------------------------------

function formatBoard(board: BoardState): string {
  return Object.values(WuXing)
    .map(element => `${element}(${board[element].yin},${board[element].yang})`)
    .join(' ');
}

function formatLevel(level: NodeLevel): string {
  if (level === -1) return '道损 -1';
  if (level === 0) return '虚空 0';
  if (level === 1) return '点亮 1';
  return '加持 2';
}

function firstGains(sequence: AtkSequence, count: number): number[] {
  return sequence.steps.slice(0, count).map(step => step.gain);
}

/** 把诊断结果格式化为 markdown 报告。 */
export function formatAtkMarginalReturnReport(report: AtkMarginalReturnReport): string {
  const lines: string[] = [];

  lines.push('## 【破】盘面边际收益诊断（剥离计分）');
  lines.push('');
  lines.push('### 口径');
  lines.push('');
  lines.push(
    '`atkTempoGain(before, after) = countActionsToGuiYuan(after) - countActionsToGuiYuan(before)`'
  );
  lines.push('');
  lines.push(
    '即一次【破】使对手「还差几次行动到五行归元」增加的次数。它只读盘面等级，与计分无关：'
  );
  lines.push('虚空 0→道损 -1 记 +1；点亮 1→虚空 0 记 +1；加持 2→点亮 1 记 0；已道损 -1 记 0（封顶）。');
  lines.push('');
  lines.push('### 逐侧基础曲线（单节点阴阳同起始等级，隔离目标顺序）');
  lines.push('');
  lines.push('| 起始等级 | 第1次 | 第2次 | 第3次 | 第4次 | 第5次 | 第6次 | 合计 | 命中次数 | 封顶 |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const curve of report.sideCurves) {
    const cells = Array.from({ length: 6 }, (_, i) => curve.gains[i] ?? '—');
    lines.push(
      `| ${formatLevel(curve.startLevel)} | ${cells.join(' | ')} | ${curve.totalGain} | ${
        curve.hitsToCap
      } | ${curve.capped ? '是' : '否'} |`
    );
  }
  lines.push('');
  lines.push('### 收益随使用次数（低位态期盘面：对手全虚空）');
  lines.push('');
  const lowState = report.phases.find(phase => phase.key === 'low-state');
  if (lowState) {
    const seq = lowState.sequence;
    lines.push(
      `初始 \`actionsToGuiYuan\` = ${seq.initialActionsToGuiYuan}；合法命中 ${seq.steps.length} 次；` +
        `封顶后 \`actionsToGuiYuan\` = ${seq.finalActionsToGuiYuan}；合计收益 ${seq.totalGain}。`
    );
    lines.push('');
    lines.push('| 第N次 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11+ |');
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
    const gains = seq.steps.map(step => step.gain);
    const first10 = Array.from({ length: 10 }, (_, i) => gains[i] ?? '—');
    lines.push(`| 边际收益 | ${first10.join(' | ')} | ${seq.capped ? '0（封顶）' : '—'} |`);
  }
  lines.push('');
  lines.push('### 收益随阶段');
  lines.push('');
  lines.push(
    '| 阶段 | 初始还差行动 | 第1次 | 第2次 | 第3次 | 合法命中 | 合计收益 | 平均每次 | 封顶后还差行动 | 封顶 |'
  );
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const phase of report.phases) {
    const seq = phase.sequence;
    const first3 = firstGains(seq, 3);
    const avg = seq.steps.length > 0 ? seq.totalGain / seq.steps.length : 0;
    lines.push(
      `| ${phase.phase} | ${seq.initialActionsToGuiYuan} | ${first3[0] ?? '—'} | ${
        first3[1] ?? '—'
      } | ${first3[2] ?? '—'} | ${seq.steps.length} | ${seq.totalGain} | ${avg.toFixed(
        3
      )} | ${seq.finalActionsToGuiYuan} | ${seq.capped ? '是' : '否'} |`
    );
  }
  lines.push('');
  for (const phase of report.phases) {
    lines.push(`#### ${phase.phase}`);
    lines.push('');
    lines.push(`- 盘面：\`${formatBoard(phase.opponentBoard)}\``);
    lines.push(`- 说明：${phase.description}`);
    lines.push('');
    lines.push('| 第N次 | 源 | 目标 | 命中侧 | 变化 | 边际收益 | 累计收益 | 还差行动 |');
    lines.push('| ---: | --- | --- | --- | --- | ---: | ---: | ---: |');
    for (const step of phase.sequence.steps) {
      lines.push(
        `| ${step.index} | ${step.source} | ${step.target} | ${step.polarity} | ${formatLevel(
          step.levelBefore
        )} → ${formatLevel(step.levelAfter)} | ${step.gain} | ${step.cumulativeGain} | ${
          step.actionsToGuiYuan
        } |`
      );
    }
    if (phase.sequence.capped) {
      lines.push('');
      lines.push(
        `> 第 ${phase.sequence.steps.length + 1} 次起封顶：对手 10 侧全部道损，已无合法【破】目标，边际收益 0。`
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (typeof process !== 'undefined' && process.argv && process.argv[1]) {
  try {
    const isDirectRun =
      import.meta.url === pathToFileURL(process.argv[1]).href ||
      import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
    if (isDirectRun) {
      console.log(formatAtkMarginalReturnReport(runAtkMarginalReturn()));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
