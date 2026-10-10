/**
 * 归元弈 (Guiyuan) - 动作价值普查 (Action Value Census)
 *
 * 目的（ticket 03 / spec `dominance-guard-and-route-fix`）：回答「**这个动作在什么
 * 局势下是最优选择**」，并报出在所有被测盘面状态下都被支配的动作。它是
 * 「每一个行为都有价值」这条目标的唯一度量。
 *
 * 价值函数（显式声明，见 `describeValueFunction`）：
 *   `ActionEvaluator.evaluate(state, tianGan, action, weights?, rules?): ActionScore`
 *   —— 既有的「动作价值」概念（盘面启发式 + 规则得分 `scoreDelta`），建在纯动作
 *   解析器 `ActionResolver.resolve` 之上。价值是**动作价值**，不是胜率；本工具不读取
 *   任何胜率矩阵。
 *
 * 只使用既有接缝与既有构造器：
 *   - `ActionResolver.resolve` / `ActionEvaluator.evaluate`（场景接缝）；
 *   - `getAvailableActions`（纯函数候选生成器）；
 *   - `BoardFixture.gameStateWith`（盘面构造器）；
 *   - `measureBoardDiff`（压制 = 等级下降量口径，2 -> 1 记 1，不退回「未点亮侧数」旧口径）；
 *   - `ATK_PHASES`（既有阶段划分）。
 * 不新增第三处可替换接缝。
 *
 * 复跑命令见 package.json：`npm run benchmark:action-value-census`。
 */

import {
  ActionPayload,
  ActionType,
  BoardState,
  GameState,
  TianGanInfo,
  TIAN_GAN_LIST,
  WuXing
} from '../types/domain.js';
import { ActionResolver } from '../logic/ActionResolver.js';
import { getAvailableActions, type RuleSwitches } from '../logic/ActionCandidates.js';
import { measureBoardDiff } from '../logic/State.js';
import {
  POINTS_CONFIG,
  ScoreCalculator,
  type PointsConfig
} from '../logic/ScoreCalculator.js';
import {
  ActionEvaluator,
  DEFAULT_STRATEGY_WEIGHTS
} from '../ai/ActionEvaluator.js';
import type { StrategyWeights } from '../ai/types.js';
import { ATK_PHASES } from './AtkMarginalReturn.js';
import { gameStateWith, type BoardOverrides } from './BoardFixture.js';
import { runCliIfDirect } from './cli.js';

/** 浮点并列容差：价值差在此之内视为并列，并列不算支配。 */
export const DEFAULT_VALUE_EPSILON = 1e-9;

// ---------------------------------------------------------------------------
// 选项与价值函数
// ---------------------------------------------------------------------------

/** 普查选项：可注入候选计分配置与规则开关，供后续票据在同一工具下复跑。 */
export interface ActionValueCensusOptions {
  /** 计分配置；默认生产 `POINTS_CONFIG`。注入候选配置即可复跑同一普查。 */
  readonly pointsConfig?: PointsConfig;
  /** 规则开关（如 board-only）；默认全部关闭。 */
  readonly rules?: RuleSwitches;
  /** 启发式权重；默认 `DEFAULT_STRATEGY_WEIGHTS`。 */
  readonly weights?: StrategyWeights;
  /** 并列容差；默认 `DEFAULT_VALUE_EPSILON`。 */
  readonly epsilon?: number;
}

/** 价值函数的自描述（报告显式列出，避免「价值」被误读为胜率）。 */
export interface ActionValueFunctionDescription {
  readonly name: string;
  readonly description: string;
  readonly inputs: readonly string[];
  readonly pointsConfigName: string;
  readonly isBoardOnly: boolean;
  readonly epsilon: number;
}

interface ValueFunction {
  readonly evaluator: ActionEvaluator;
  readonly resolver: ActionResolver;
  readonly weights: StrategyWeights;
  readonly rules?: RuleSwitches;
  readonly epsilon: number;
  readonly description: ActionValueFunctionDescription;
}

function buildValueFunction(options: ActionValueCensusOptions): ValueFunction {
  const pointsConfig = options.pointsConfig ?? POINTS_CONFIG;
  const resolver = new ActionResolver(new ScoreCalculator(pointsConfig));
  const evaluator = new ActionEvaluator(resolver);
  const weights = options.weights ?? DEFAULT_STRATEGY_WEIGHTS;
  const epsilon = options.epsilon ?? DEFAULT_VALUE_EPSILON;

  return {
    evaluator,
    resolver,
    weights,
    rules: options.rules,
    epsilon,
    description: {
      name: 'ActionEvaluator.evaluate（动作价值 = 盘面启发式 + 规则得分）',
      description:
        '动作价值 = repairScore + unityScore + suppressionScore + burstScore + scoreDeltaPoints + biasScore；' +
        '其中 scoreDeltaPoints 是规则计分分量，其余为盘面分量。价值是动作层度量，与胜率无关。',
      inputs: [
        'GameState',
        'TianGanInfo',
        'ActionPayload（由 getAvailableActions 枚举）',
        'StrategyWeights',
        'PointsConfig',
        'RuleSwitches'
      ],
      pointsConfigName:
        pointsConfig === POINTS_CONFIG ? 'POINTS_CONFIG（生产默认）' : '自定义 PointsConfig',
      isBoardOnly: options.rules?.isBoardOnly ?? false,
      epsilon
    }
  };
}

// ---------------------------------------------------------------------------
// 数据结构
// ---------------------------------------------------------------------------

/** 单个动作在单个（盘面, 天干）上的价值观测（不含盘面元数据）。 */
export interface ActionValue {
  readonly actionType: ActionType;
  readonly action: ActionPayload;
  /** 动作价值 = boardScore + scoreDeltaPoints */
  readonly value: number;
  /** 盘面分量 = 价值 - 规则得分分量 */
  readonly boardScore: number;
  /** 规则计分分量（scoreDelta × scoreDeltaWeight；board-only 时为 0） */
  readonly scoreDeltaPoints: number;
  readonly repairScore: number;
  readonly unityScore: number;
  readonly suppressionScore: number;
  readonly burstScore: number;
  readonly biasScore: number;
  /** 施加于对手盘面的等级下降量（口径锁：2 -> 1 记 1，不读 atkTempoGain） */
  readonly suppressionLevels: number;
  /** 己方盘面的等级上升量（建设度量） */
  readonly constructionLevels: number;
  /** 与同盘面最优动作并列（价值差 <= epsilon） */
  readonly isOptimal: boolean;
  /** 被支配：同盘面存在严格更优动作（价值差 > epsilon） */
  readonly isDominated: boolean;
}

/** 带盘面元数据的价值观测（普查报告使用）。 */
export interface ActionValueObservation extends ActionValue {
  readonly boardKey: string;
  readonly phaseKey: string;
  readonly stepConditionKey: string;
  readonly tianGan: string;
}

/** 一个被测盘面的元数据与两张盘面。 */
export interface CensusBoard {
  readonly key: string;
  readonly phaseKey: string;
  readonly phase: string;
  readonly stepConditionKey: string;
  readonly stepCondition: string;
  readonly description: string;
  readonly ownBoard: BoardState;
  readonly opponentBoard: BoardState;
}

/** 单一动作类型的普查结论。 */
export interface ActionTypeCensus {
  readonly actionType: ActionType;
  /** 是否至少在一个被测（盘面, 天干）上可用 */
  readonly available: boolean;
  readonly observationCount: number;
  /** 并列最优的盘面（去重） */
  readonly optimalBoardKeys: readonly string[];
  /** 并列最优的具体观测（盘面 + 天干） */
  readonly optimalObservations: readonly { readonly boardKey: string; readonly tianGan: string }[];
  /** 被支配的盘面（去重） */
  readonly dominatedBoardKeys: readonly string[];
  /** 在所有可用观测上都被支配（且至少可用一次） */
  readonly globallyDominated: boolean;
}

/** 完整普查报告。 */
export interface ActionValueCensusReport {
  readonly valueFunction: ActionValueFunctionDescription;
  readonly boards: readonly CensusBoard[];
  readonly observations: readonly ActionValueObservation[];
  readonly actions: readonly ActionTypeCensus[];
  readonly globallyDominated: readonly ActionType[];
}

// ---------------------------------------------------------------------------
// 被测盘面构造
// ---------------------------------------------------------------------------

/** 一个被测阶段（作用于行动方自己的盘面）。 */
export interface CensusPhase {
  readonly key: string;
  readonly phase: string;
  readonly description: string;
  readonly own: BoardOverrides;
}

/** 一个阶跃条件（作用于对手盘面；plain 为镜像对照）。 */
export interface CensusStepCondition {
  readonly key: string;
  readonly condition: string;
  readonly description: string;
}

const ALL_BLESSED: BoardOverrides = {
  [WuXing.WOOD]: { yin: 2, yang: 2 },
  [WuXing.FIRE]: { yin: 2, yang: 2 },
  [WuXing.EARTH]: { yin: 2, yang: 2 },
  [WuXing.METAL]: { yin: 2, yang: 2 },
  [WuXing.WATER]: { yin: 2, yang: 2 }
};

const ALL_DAMAGED: BoardOverrides = {
  [WuXing.WOOD]: { yin: -1, yang: -1 },
  [WuXing.FIRE]: { yin: -1, yang: -1 },
  [WuXing.EARTH]: { yin: -1, yang: -1 },
  [WuXing.METAL]: { yin: -1, yang: -1 },
  [WuXing.WATER]: { yin: -1, yang: -1 }
};

/**
 * 亢极态盘面：木节点亢极 (2,2)，其余归一 (1,1)。
 * 三个既有阶段都不含 (2,2) 节点，无法枚举【亢极散气】(DISSIPATE)；
 * 本阶段是覆盖 DISSIPATE 的补充盘面，不是新增阶段划分。
 */
const KANGJI_OVERRIDES: BoardOverrides = {
  [WuXing.WOOD]: { yin: 2, yang: 2 },
  [WuXing.FIRE]: { yin: 1, yang: 1 },
  [WuXing.EARTH]: { yin: 1, yang: 1 },
  [WuXing.METAL]: { yin: 1, yang: 1 },
  [WuXing.WATER]: { yin: 1, yang: 1 }
};

/** 被测阶段：三个既有阶段（低位态期 / 中盘 / 残局）+ 亢极态（覆盖 DISSIPATE）。 */
export const CENSUS_PHASES: readonly CensusPhase[] = [
  ...ATK_PHASES.map(phase => ({
    key: phase.key,
    phase: phase.phase,
    description: phase.description,
    own: phase.overrides
  })),
  {
    key: 'kangji',
    phase: '亢极态',
    description: '己方木节点亢极 (2,2)，其余节点归一 (1,1)（覆盖【亢极散气】）',
    own: KANGJI_OVERRIDES
  }
];

/** 两个阶跃条件 + plain 镜像对照。 */
export const CENSUS_STEP_CONDITIONS: readonly CensusStepCondition[] = [
  {
    key: 'plain',
    condition: '无附加条件',
    description: '对手盘面与行动方盘面相同（阶段原样镜像）'
  },
  {
    key: 'target-blessed',
    condition: '目标侧为加持',
    description: '对手 10 侧全部加持 (2)，任何【破】的目标侧都是加持'
  },
  {
    key: 'opponent-all-damaged',
    condition: '对手全道损',
    description: '对手 10 侧全部道损 (-1)，【破】/【强破】已无合法目标'
  }
];

function opponentOverridesFor(phase: CensusPhase, stepConditionKey: string): BoardOverrides {
  if (stepConditionKey === 'target-blessed') return ALL_BLESSED;
  if (stepConditionKey === 'opponent-all-damaged') return ALL_DAMAGED;
  return phase.own;
}

/** 构造全部被测盘面：每个阶段 × 每个阶跃条件。 */
export function buildCensusBoards(): CensusBoard[] {
  const boards: CensusBoard[] = [];
  for (const phase of CENSUS_PHASES) {
    for (const step of CENSUS_STEP_CONDITIONS) {
      const state = gameStateWith({
        P1: phase.own,
        P2: opponentOverridesFor(phase, step.key),
        currentPlayer: 'P1'
      });
      boards.push({
        key: `${phase.key}/${step.key}`,
        phaseKey: phase.key,
        phase: phase.phase,
        stepConditionKey: step.key,
        stepCondition: step.condition,
        description: `${phase.phase} × ${step.condition}`,
        ownBoard: state.players.P1.board,
        opponentBoard: state.players.P2.board
      });
    }
  }
  return boards;
}

// ---------------------------------------------------------------------------
// 测量
// ---------------------------------------------------------------------------

function evaluateWith(
  valueFunction: ValueFunction,
  state: GameState,
  tianGan: TianGanInfo
): ActionValue[] {
  const { evaluator, resolver, weights, rules, epsilon } = valueFunction;
  const actions = getAvailableActions(state, tianGan);
  const simulatedState: GameState = { ...state, currentTianGan: tianGan };

  const scored = actions.map(action => {
    const score = evaluator.evaluate(simulatedState, tianGan, action, weights, rules);
    const result = resolver.resolve(simulatedState, action);
    const opponentId = action.player === 'P1' ? 'P2' : 'P1';
    const ownDiff = measureBoardDiff(
      state.players[action.player].board,
      result.nextState.players[action.player].board
    );
    const opponentDiff = measureBoardDiff(
      state.players[opponentId].board,
      result.nextState.players[opponentId].board
    );
    return { action, score, ownDiff, opponentDiff };
  });

  const maxValue = scored.reduce(
    (max, item) => Math.max(max, item.score.score),
    Number.NEGATIVE_INFINITY
  );

  return scored.map(({ action, score, ownDiff, opponentDiff }) => {
    const value = score.score;
    const isDominated = value < maxValue - epsilon;
    return {
      actionType: action.actionType,
      action,
      value,
      boardScore: value - score.breakdown.scoreDeltaPoints,
      scoreDeltaPoints: score.breakdown.scoreDeltaPoints,
      repairScore: score.breakdown.repairScore,
      unityScore: score.breakdown.unityScore,
      suppressionScore: score.breakdown.suppressionScore,
      burstScore: score.breakdown.burstScore,
      biasScore: score.breakdown.biasScore,
      suppressionLevels: opponentDiff.suppressionLevels,
      constructionLevels: ownDiff.constructionLevels,
      isOptimal: !isDominated,
      isDominated
    };
  });
}

/**
 * 在单个受控盘面上，枚举当前天干下的可用动作并给出价值排序与支配判定。
 * 纯函数；用于测试与复用，也是普查内部逐盘面调用的入口。
 */
export function evaluateActionValues(
  state: GameState,
  tianGan: TianGanInfo,
  options: ActionValueCensusOptions = {}
): ActionValue[] {
  return evaluateWith(buildValueFunction(options), state, tianGan);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function aggregateActionCensus(
  observations: readonly ActionValueObservation[]
): ActionTypeCensus[] {
  return Object.values(ActionType).map(actionType => {
    const own = observations.filter(observation => observation.actionType === actionType);
    const available = own.length > 0;
    const optimal = own.filter(observation => observation.isOptimal);
    const dominated = own.filter(observation => observation.isDominated);

    return {
      actionType,
      available,
      observationCount: own.length,
      optimalBoardKeys: unique(optimal.map(observation => observation.boardKey)),
      optimalObservations: optimal.map(observation => ({
        boardKey: observation.boardKey,
        tianGan: observation.tianGan
      })),
      dominatedBoardKeys: unique(dominated.map(observation => observation.boardKey)),
      globallyDominated: available && own.every(observation => observation.isDominated)
    };
  });
}

/**
 * 运行完整普查：遍历全部被测盘面 × 全部天干，聚合逐动作类型结论。
 * 同一选项下确定性输出（无随机、无时间、无环境依赖）。
 */
export function runActionValueCensus(
  options: ActionValueCensusOptions = {}
): ActionValueCensusReport {
  const valueFunction = buildValueFunction(options);
  const boards = buildCensusBoards();
  const observations: ActionValueObservation[] = [];

  for (const board of boards) {
    const state = gameStateWith({
      P1: board.ownBoard,
      P2: board.opponentBoard,
      currentPlayer: 'P1'
    });
    for (const tianGan of TIAN_GAN_LIST) {
      const values = evaluateWith(valueFunction, state, tianGan);
      for (const value of values) {
        observations.push({
          ...value,
          boardKey: board.key,
          phaseKey: board.phaseKey,
          stepConditionKey: board.stepConditionKey,
          tianGan: tianGan.name
        });
      }
    }
  }

  const actions = aggregateActionCensus(observations);

  return {
    valueFunction: valueFunction.description,
    boards,
    observations,
    actions,
    globallyDominated: actions
      .filter(action => action.globallyDominated)
      .map(action => action.actionType)
  };
}

// ---------------------------------------------------------------------------
// 报告格式化（可直接粘贴进工单的 markdown）
// ---------------------------------------------------------------------------

function formatBoard(board: BoardState): string {
  return Object.values(WuXing)
    .map(element => `${element}(${board[element].yin},${board[element].yang})`)
    .join(' ');
}

function formatLevel(level: number): string {
  if (level === -1) return '道损 -1';
  if (level === 0) return '虚空 0';
  if (level === 1) return '点亮 1';
  return '加持 2';
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/** 把普查结果格式化为 markdown 报告。 */
export function formatActionValueCensusReport(report: ActionValueCensusReport): string {
  const lines: string[] = [];
  const { valueFunction } = report;

  lines.push('## 动作价值普查');
  lines.push('');
  lines.push('### 价值函数（口径）');
  lines.push('');
  lines.push(`- 名称：\`${valueFunction.name}\``);
  lines.push(`- 定义：${valueFunction.description}`);
  lines.push(`- 输入：${valueFunction.inputs.join(' / ')}`);
  lines.push(`- 计分配置：${valueFunction.pointsConfigName}`);
  lines.push(`- board-only：${valueFunction.isBoardOnly ? '开启（忽略规则得分）' : '关闭'}`);
  lines.push(`- 并列容差 epsilon：${valueFunction.epsilon}`);
  lines.push('');
  lines.push(
    '> 判定「被支配」用的是**动作价值**，不是胜率：同一盘面上某动作价值严格低于另一个可用动作即为该盘面下被支配；'
  );
  lines.push('> 若它在所有可用观测上都被支配，则为全局被支配。并列（价值差 <= epsilon）不算支配。');
  lines.push('');

  lines.push('### 全局被支配动作');
  lines.push('');
  if (report.globallyDominated.length === 0) {
    lines.push('**无**——每个可用动作都在某个被测盘面状态下成为（并列）最优选择。');
  } else {
    lines.push(`**${report.globallyDominated.join('、')}** 在所有可用观测上都被支配。`);
  }
  lines.push('');

  lines.push('### 逐动作类型结论');
  lines.push('');
  lines.push('| 动作类型 | 可用 | 观测数 | 最优盘面数 | 被支配盘面数 | 全局被支配 |');
  lines.push('| --- | --- | ---: | ---: | ---: | --- |');
  for (const action of report.actions) {
    lines.push(
      `| ${action.actionType} | ${action.available ? '是' : '否'} | ${action.observationCount} | ${
        action.optimalBoardKeys.length
      } | ${action.dominatedBoardKeys.length} | ${action.globallyDominated ? '**是**' : '否'} |`
    );
  }
  lines.push('');

  lines.push('### 每个动作成为（并列）最优的盘面条件');
  lines.push('');
  for (const action of report.actions) {
    lines.push(`#### ${action.actionType}`);
    lines.push('');
    if (!action.available) {
      lines.push('- 未在任何被测盘面上观测到可用。');
      lines.push('');
      continue;
    }
    if (action.optimalBoardKeys.length === 0) {
      lines.push('- 未在任何被测盘面上成为最优（在所有可用观测上都被支配）。');
    } else {
      lines.push(`- 最优盘面：${action.optimalBoardKeys.join('、')}`);
      const sample = action.optimalObservations
        .slice(0, 12)
        .map(observation => `${observation.boardKey}@${observation.tianGan}`)
        .join('、');
      const suffix =
        action.optimalObservations.length > 12
          ? ` …（共 ${action.optimalObservations.length} 条）`
          : '';
      lines.push(`- 观测：${sample}${suffix}`);
    }
    if (action.dominatedBoardKeys.length > 0) {
      lines.push(`- 被支配盘面：${action.dominatedBoardKeys.join('、')}`);
    }
    lines.push('');
  }

  lines.push('### 被测盘面覆盖');
  lines.push('');
  lines.push(`阶段：${unique(report.boards.map(board => board.phaseKey)).join(' / ')}`);
  lines.push('');
  lines.push(
    `阶跃条件：${unique(report.boards.map(board => board.stepConditionKey)).join(' / ')}`
  );
  lines.push('');
  lines.push('| 盘面 | 阶段 | 阶跃条件 | 行动方盘面 | 对手盘面 |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const board of report.boards) {
    lines.push(
      `| ${board.key} | ${board.phase} | ${board.stepCondition} | \`${formatBoard(
        board.ownBoard
      )}\` | \`${formatBoard(board.opponentBoard)}\` |`
    );
  }
  lines.push('');

  lines.push('### 逐盘面价值排序（按天干）');
  lines.push('');
  for (const board of report.boards) {
    lines.push(`#### ${board.key}（${board.description}）`);
    lines.push('');
    lines.push('| 天干 | 动作 | 价值 | 盘面分量 | 规则得分 | 压制等级 | 建设等级 | 最优 |');
    lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |');
    for (const tianGan of TIAN_GAN_LIST) {
      const observations = report.observations
        .filter(
          observation =>
            observation.boardKey === board.key && observation.tianGan === tianGan.name
        )
        .sort((a, b) => b.value - a.value);
      for (const observation of observations) {
        lines.push(
          `| ${tianGan.name} | ${observation.actionType} | ${formatNumber(
            observation.value
          )} | ${formatNumber(observation.boardScore)} | ${formatNumber(
            observation.scoreDeltaPoints
          )} | ${formatLevel(observation.suppressionLevels)} | ${formatLevel(
            observation.constructionLevels
          )} | ${observation.isOptimal ? '是' : ''} |`
        );
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

runCliIfDirect(import.meta.url, () => {
  console.log(formatActionValueCensusReport(runActionValueCensus()));
});
