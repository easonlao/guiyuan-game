import { describe, it, expect } from 'vitest';
import { HeadlessMatch } from '../../src/core/headless/HeadlessMatch.js';
import { HeadlessBenchmark } from '../../src/core/headless/HeadlessBenchmark.js';
import { ScoreCalculator, PointsConfig, POINTS_CONFIG } from '../../src/core/logic/ScoreCalculator.js';
import { balancedStrategy } from '../../src/core/ai/Strategy.js';

/**
 * 刻意不同的计分配置：将全部行为分、状态分以及里程碑/道损惩罚清零。
 * 与默认配置的差异足够大，只要注入真正生效，分数就不可能相同。
 */
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

const SEED = 8888;
const MAX_ROUNDS = 30;

describe('Headless score config injection (Ticket 01)', () => {
  describe('HeadlessMatch (single-match entry)', () => {
    it('reproduces the default result exactly when injecting the default POINTS_CONFIG via constructor', () => {
      const defaultResult = new HeadlessMatch().run(balancedStrategy, balancedStrategy, {
        seed: SEED,
        maxRounds: MAX_ROUNDS
      });
      const injectedResult = new HeadlessMatch({
        scoreCalculator: new ScoreCalculator(POINTS_CONFIG)
      }).run(balancedStrategy, balancedStrategy, { seed: SEED, maxRounds: MAX_ROUNDS });

      expect(injectedResult.finalP1Score).toBe(defaultResult.finalP1Score);
      expect(injectedResult.finalP2Score).toBe(defaultResult.finalP2Score);
      expect(injectedResult.winner).toBe(defaultResult.winner);
      expect(injectedResult.endReason).toBe(defaultResult.endReason);
      expect(injectedResult.closureType).toBe(defaultResult.closureType);
      expect(injectedResult.roundsPlayed).toBe(defaultResult.roundsPlayed);
      expect(injectedResult.record).toEqual(defaultResult.record);
    });

    it('takes effect through constructor injection: a deliberately different config changes the scores', () => {
      const defaultResult = new HeadlessMatch().run(balancedStrategy, balancedStrategy, {
        seed: SEED,
        maxRounds: MAX_ROUNDS
      });
      const injectedResult = new HeadlessMatch({
        scoreCalculator: new ScoreCalculator(ZERO_POINTS_CONFIG)
      }).run(balancedStrategy, balancedStrategy, { seed: SEED, maxRounds: MAX_ROUNDS });

      // 零分配置下所有分数来源被清零，默认路径在相同种子下必然产生非零分数
      expect(defaultResult.finalP1Score).not.toBe(0);
      expect(injectedResult.finalP1Score).toBe(0);
      expect(injectedResult.finalP2Score).toBe(0);
      expect(
        injectedResult.finalP1Score !== defaultResult.finalP1Score ||
          injectedResult.finalP2Score !== defaultResult.finalP2Score
      ).toBe(true);
    });

    it('takes effect through MatchOptions.scoreConfig per-run override', () => {
      const match = new HeadlessMatch();
      const defaultResult = match.run(balancedStrategy, balancedStrategy, {
        seed: SEED,
        maxRounds: MAX_ROUNDS
      });
      const injectedResult = match.run(balancedStrategy, balancedStrategy, {
        seed: SEED,
        maxRounds: MAX_ROUNDS,
        scoreConfig: ZERO_POINTS_CONFIG
      });

      expect(injectedResult.finalP1Score).toBe(0);
      expect(injectedResult.finalP2Score).toBe(0);
      expect(injectedResult.finalP1Score).not.toBe(defaultResult.finalP1Score);
    });

    it('reproduces the default result exactly when MatchOptions.scoreConfig is the default POINTS_CONFIG', () => {
      const match = new HeadlessMatch();
      const defaultResult = match.run(balancedStrategy, balancedStrategy, {
        seed: SEED,
        maxRounds: MAX_ROUNDS
      });
      const injectedResult = match.run(balancedStrategy, balancedStrategy, {
        seed: SEED,
        maxRounds: MAX_ROUNDS,
        scoreConfig: POINTS_CONFIG
      });

      expect(injectedResult.finalP1Score).toBe(defaultResult.finalP1Score);
      expect(injectedResult.finalP2Score).toBe(defaultResult.finalP2Score);
      expect(injectedResult.record).toEqual(defaultResult.record);
    });
  });

  describe('HeadlessBenchmark (batch entry)', () => {
    it('forwards BenchmarkOptions.scoreConfig to every match it runs', () => {
      const benchmark = new HeadlessBenchmark();
      const baseOptions = {
        matches: 20,
        baseSeed: 10000,
        maxRounds: MAX_ROUNDS,
        strategyP1: balancedStrategy,
        strategyP2: balancedStrategy
      };
      const defaultMetrics = benchmark.run(baseOptions);
      const injectedMetrics = benchmark.run({ ...baseOptions, scoreConfig: ZERO_POINTS_CONFIG });

      expect(defaultMetrics.avgP1Score).toBeGreaterThan(0);
      expect(injectedMetrics.avgP1Score).toBe(0);
      expect(injectedMetrics.avgP2Score).toBe(0);
      expect(injectedMetrics.avgP1Score).not.toBe(defaultMetrics.avgP1Score);
    });

    it('honors a score-injected HeadlessMatch passed to its constructor', () => {
      const injectedMatch = new HeadlessMatch({
        scoreCalculator: new ScoreCalculator(ZERO_POINTS_CONFIG)
      });
      const benchmark = new HeadlessBenchmark(injectedMatch);
      const metrics = benchmark.run({
        matches: 20,
        baseSeed: 10000,
        maxRounds: MAX_ROUNDS,
        strategyP1: balancedStrategy,
        strategyP2: balancedStrategy
      });

      expect(metrics.avgP1Score).toBe(0);
      expect(metrics.avgP2Score).toBe(0);
    });
  });
});
