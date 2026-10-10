import { describe, it, expect } from 'vitest';
import { HeadlessMatch } from '../../src/core/headless/HeadlessMatch.js';
import { HeadlessBenchmark } from '../../src/core/headless/HeadlessBenchmark.js';
import {
  createScoreBoundStrategy,
  balancedStrategy,
  BALANCED_WEIGHTS
} from '../../src/core/ai/Strategy.js';
import { PointsConfig, POINTS_CONFIG, ScoreCalculator } from '../../src/core/logic/ScoreCalculator.js';
import { getAvailableActions } from '../../src/core/logic/ActionCandidates.js';
import { TurnManager } from '../../src/core/logic/TurnManager.js';
import { createInitialGameState } from '../../src/core/logic/State.js';
import { createPRNG, PRNG } from '../../src/core/utils/prng.js';
import { GameManager } from '../../src/minigame/game-manager.js';
import { TIAN_GAN_LIST, WuXing, type GameState } from '../../src/core/types/domain.js';

const SEED = 4242;
const MAX_ROUNDS = 30;

/**
 * 刻意不同的计分配置：把攻击类状态分放大到默认值的 10 倍。
 * 与默认配置差异足够大，只要 AI 估值器真的读到了它，动作轨迹就会改变。
 */
const ATTACK_HEAVY_POINTS_CONFIG: PointsConfig = {
  ...POINTS_CONFIG,
  STATE_CHANGE: {
    ...POINTS_CONFIG.STATE_CHANGE,
    CAUSE_DMG: { yang: 3000, yin: 2500 },
    BREAK_LIGHT: { yang: 2000, yin: 1500 },
    WEAKEN: 2000
  }
};

/** 全部计分来源归零：既改变终局分数，也等价于对 AI 关闭计分轴。 */
const ZERO_POINTS_CONFIG: PointsConfig = {
  ...POINTS_CONFIG,
  ACTION: {
    AUTO: 0,
    CONVERT: 0,
    TRANS: 0,
    ATK: 0,
    BURST: 0,
    BURST_ATK: 0,
    DISSIPATE: 0,
    PASS: 0
  },
  STATE_CHANGE: {
    REPAIR_DMG: { yang: 0, yin: 0 },
    LIGHT_UP: 0,
    BLESSING: 0,
    CAUSE_DMG: { yang: 0, yin: 0 },
    BREAK_LIGHT: { yang: 0, yin: 0 },
    WEAKEN: 0
  },
  GUI_YI_MILESTONE: 0,
  DAMAGE_PENALTY: 0
};

describe('Ticket 01 - headless scoring-config injection', () => {
  describe('HeadlessMatch default path is byte-identical', () => {
    it('constructor default injection reproduces the plain run exactly', () => {
      const plain = new HeadlessMatch().run(balancedStrategy, balancedStrategy, {
        seed: SEED,
        maxRounds: MAX_ROUNDS
      });
      const injected = new HeadlessMatch({
        scoreCalculator: new ScoreCalculator(POINTS_CONFIG),
        rules: {}
      }).run(balancedStrategy, balancedStrategy, { seed: SEED, maxRounds: MAX_ROUNDS });

      expect(injected.record).toEqual(plain.record);
      expect(injected.finalP1Score).toBe(plain.finalP1Score);
      expect(injected.finalP2Score).toBe(plain.finalP2Score);
      expect(injected.winner).toBe(plain.winner);
      expect(injected.closureType).toBe(plain.closureType);
    });

    it('per-run default scoreConfig reproduces the plain run exactly', () => {
      const match = new HeadlessMatch();
      const plain = match.run(balancedStrategy, balancedStrategy, { seed: SEED, maxRounds: MAX_ROUNDS });
      const injected = match.run(balancedStrategy, balancedStrategy, {
        seed: SEED,
        maxRounds: MAX_ROUNDS,
        scoreConfig: POINTS_CONFIG,
        rules: { isBoardOnly: false }
      });

      expect(injected.record).toEqual(plain.record);
      expect(injected.finalP1Score).toBe(plain.finalP1Score);
      expect(injected.finalP2Score).toBe(plain.finalP2Score);
    });
  });

  describe('scoring config reaches the AI valuation path from a single injection', () => {
    it('a single scoreConfig passed to HeadlessMatch.run changes the AI action trajectory (weights spec)', () => {
      // Ticket 01 的核心接缝：入口同时收到 scoreConfig 与权重模板，
      // 同一份配置到达解析器与 AI 估值器，而不是只到解析器。
      const match = new HeadlessMatch();
      const baseline = match.run(BALANCED_WEIGHTS, BALANCED_WEIGHTS, {
        seed: SEED,
        maxRounds: MAX_ROUNDS,
        scoreConfig: POINTS_CONFIG
      });
      const heavy = match.run(BALANCED_WEIGHTS, BALANCED_WEIGHTS, {
        seed: SEED,
        maxRounds: MAX_ROUNDS,
        scoreConfig: ATTACK_HEAVY_POINTS_CONFIG
      });

      expect(
        heavy.finalP1Score !== baseline.finalP1Score ||
          heavy.finalP2Score !== baseline.finalP2Score
      ).toBe(true);
      expect(heavy.record).not.toEqual(baseline.record);
    });

    it('a single scoreConfig passed to HeadlessBenchmark.run changes the AI action trajectory (default weights)', () => {
      const benchmark = new HeadlessBenchmark();
      const base = { matches: 40, baseSeed: 10000, maxRounds: MAX_ROUNDS };
      const baseline = benchmark.run({ ...base, scoreConfig: POINTS_CONFIG });
      const heavy = benchmark.run({ ...base, scoreConfig: ATTACK_HEAVY_POINTS_CONFIG });

      expect([heavy.guiYuanCount, heavy.p1Wins, heavy.avgRounds]).not.toEqual([
        baseline.guiYuanCount,
        baseline.p1Wins,
        baseline.avgRounds
      ]);
    });

    it('an explicit pre-built DecisionStrategy keeps its own evaluator (explicit wins)', () => {
      // 已构造的函数策略按自身估值器运行，入口配置不改写它（向后兼容）。
      // 要让它读到注入配置，须传权重模板（上一用例）或自行用 createScoreBoundStrategy 绑定。
      const match = new HeadlessMatch();
      const baseline = match.run(balancedStrategy, balancedStrategy, {
        seed: SEED,
        maxRounds: MAX_ROUNDS,
        scoreConfig: POINTS_CONFIG
      });
      const resolverOnly = match.run(balancedStrategy, balancedStrategy, {
        seed: SEED,
        maxRounds: MAX_ROUNDS,
        scoreConfig: ATTACK_HEAVY_POINTS_CONFIG
      });

      expect(
        resolverOnly.finalP1Score !== baseline.finalP1Score ||
          resolverOnly.finalP2Score !== baseline.finalP2Score
      ).toBe(true);
      expect(resolverOnly.record).toEqual(baseline.record);
    });
  });

  describe('rule-switch seam', () => {
    it('board-only switch changes the AI action trajectory (observable, not silently ignored)', () => {
      const match = new HeadlessMatch();
      const defaultStrategy = createScoreBoundStrategy(BALANCED_WEIGHTS, POINTS_CONFIG);
      const boardOnlyStrategy = createScoreBoundStrategy(BALANCED_WEIGHTS, POINTS_CONFIG, {
        isBoardOnly: true
      });

      const defaultResult = match.run(defaultStrategy, defaultStrategy, {
        seed: SEED,
        maxRounds: MAX_ROUNDS
      });
      const boardOnlyResult = match.run(boardOnlyStrategy, boardOnlyStrategy, {
        seed: SEED,
        maxRounds: MAX_ROUNDS,
        rules: { isBoardOnly: true }
      });

      expect(boardOnlyResult.record).not.toEqual(defaultResult.record);
    });

    it('omitted rules and explicitly-false rules are byte-identical', () => {
      const match = new HeadlessMatch();
      const omitted = match.run(balancedStrategy, balancedStrategy, { seed: SEED, maxRounds: MAX_ROUNDS });
      const explicitFalse = match.run(balancedStrategy, balancedStrategy, {
        seed: SEED,
        maxRounds: MAX_ROUNDS,
        rules: { isBoardOnly: false }
      });

      expect(explicitFalse.record).toEqual(omitted.record);
      expect(explicitFalse.finalP1Score).toBe(omitted.finalP1Score);
    });

    it('the board-only switch does not alter the candidate set (candidate seam is default-identity)', () => {
      const state = createInitialGameState(MAX_ROUNDS);
      const tianGan = TIAN_GAN_LIST[0];
      const plain = getAvailableActions(state, tianGan);
      const withSwitch = getAvailableActions(state, tianGan, { rules: { isBoardOnly: true } });

      expect(withSwitch).toEqual(plain);
    });
  });

  describe('HeadlessBenchmark batch entry', () => {
    it('forwards scoreConfig and reports average scores', () => {
      const benchmark = new HeadlessBenchmark();
      const base = {
        matches: 20,
        baseSeed: 10000,
        maxRounds: MAX_ROUNDS,
        strategyP1: balancedStrategy,
        strategyP2: balancedStrategy
      };
      const defaultMetrics = benchmark.run(base);
      const zeroMetrics = benchmark.run({ ...base, scoreConfig: ZERO_POINTS_CONFIG });

      expect(defaultMetrics.avgP1Score).toBeGreaterThan(0);
      expect(zeroMetrics.avgP1Score).toBe(0);
      expect(zeroMetrics.avgP2Score).toBe(0);
    });

    it('accepts rules and keeps the default path unchanged', () => {
      const benchmark = new HeadlessBenchmark();
      const base = {
        matches: 20,
        baseSeed: 10000,
        maxRounds: MAX_ROUNDS,
        strategyP1: balancedStrategy,
        strategyP2: balancedStrategy
      };
      const defaultMetrics = benchmark.run(base);
      const withEmptyRules = benchmark.run({ ...base, rules: {} });

      expect(withEmptyRules.guiYuanCount).toBe(defaultMetrics.guiYuanCount);
      expect(withEmptyRules.avgP1Score).toBe(defaultMetrics.avgP1Score);
    });

    it('board-only strategies change batch metrics', () => {
      const benchmark = new HeadlessBenchmark();
      const boardOnlyStrategy = createScoreBoundStrategy(BALANCED_WEIGHTS, POINTS_CONFIG, {
        isBoardOnly: true
      });
      const base = { matches: 30, baseSeed: 10000, maxRounds: MAX_ROUNDS };
      const defaultMetrics = benchmark.run({
        ...base,
        strategyP1: balancedStrategy,
        strategyP2: balancedStrategy
      });
      const boardOnlyMetrics = benchmark.run({
        ...base,
        strategyP1: boardOnlyStrategy,
        strategyP2: boardOnlyStrategy,
        rules: { isBoardOnly: true }
      });

      expect(boardOnlyMetrics.guiYuanCount).not.toBe(defaultMetrics.guiYuanCount);
    });
  });

  describe('in-game entry (TurnManager / GameManager)', () => {
    it('TurnManager accepts rules and keeps candidate generation unchanged by default', () => {
      const plain = new TurnManager({ prng: createPRNG(777), rules: {} });
      const switched = new TurnManager({ prng: createPRNG(777), rules: { isBoardOnly: true } });

      expect(switched.startTurn()).toEqual(plain.startTurn());
    });

    it('GameManager binds the rule switch to its AI valuation path', () => {
      // 受控盘面：P2 木归一 (1,1)，火阳道损；P1 土 (-1,0)。
      // 固定抽 甲木（阳）：候选为 ATK / BURST / BURST_ATK。
      // 默认计分下 AI 选 BURST_ATK（消耗木阳 1->0）；关闭计分轴后改选 ATK（不消耗）。
      const fixedPrng: PRNG = {
        next: () => 0,
        nextInt: (min) => min,
        getState: () => 0
      };

      const controlledState = (): GameState => {
        const base = createInitialGameState(MAX_ROUNDS);
        return {
          ...base,
          currentPlayer: 'P2',
          players: {
            ...base.players,
            P2: {
              ...base.players.P2,
              board: {
                ...base.players.P2.board,
                [WuXing.WOOD]: { yin: 1, yang: 1 },
                [WuXing.FIRE]: { yin: 0, yang: -1 }
              }
            },
            P1: {
              ...base.players.P1,
              board: {
                ...base.players.P1.board,
                [WuXing.EARTH]: { yin: -1, yang: 0 }
              }
            }
          }
        };
      };

      const driveAiOnce = (rules?: { isBoardOnly?: boolean }): GameState => {
        const gm = new GameManager({ prng: fixedPrng, initialState: controlledState(), rules });
        for (let i = 0; i < 90; i++) {
          gm.update();
        }
        return gm.getState();
      };

      const defaultState = driveAiOnce();
      const boardOnlyState = driveAiOnce({ isBoardOnly: true });

      // 默认：BURST_ATK 消耗木阳 1 -> 0
      expect(defaultState.players.P2.board[WuXing.WOOD].yang).toBe(0);
      // 关闭计分轴：ATK 保留木阳
      expect(boardOnlyState.players.P2.board[WuXing.WOOD].yang).toBe(1);
    });
  });
});
