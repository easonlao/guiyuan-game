import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  GUARDRAIL_GUIYUAN_MIN,
  GUARDRAIL_GUIYUAN_MAX,
  GUARDRAIL_P1_WIN_MIN,
  GUARDRAIL_P1_WIN_MAX
} from '../../src/core/headless/GuardrailBand.js';

/**
 * 护栏带防再漂移守卫（工单 03）。
 *
 * 历史缺陷：护栏带在仓库里曾有两份副本、值不同——live 测试是 [0.89, 0.95] / [0.47, 0.51]，
 * 而 `CandidateValidation` 的 CLI 判据停留在采纳前的 [0.75, 0.95] / [0.45, 0.55]，
 * 于是 `npm run benchmark:candidate-validation` 用旧带判定候选，下界 0.75 拦不住任何回退。
 *
 * 本文件用三层断言让这种漂移再次发生时会**变红**：
 *   1. 契约层：带必须包含实测锚点、且把「无进度定价」的回退挡在带外——这是带存在的理由，
 *      与带值本身无关，因此能抓住「静默把界改松」。
 *   2. 结构层：四个带字面量只允许出现在唯一定义处 `GuardrailBand.ts`，任何消费方重新硬编码即红。
 *   3. 引用层：live 测试与 CLI 的带比较必须引用共享常量，而不是换回字面量。
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const read = (relativePath: string): string => readFileSync(resolve(repoRoot, relativePath), 'utf8');
/** 去掉注释，避免注释里的数字被误判为代码里的硬编码。 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const GUARDRAIL_BAND_SRC = 'src/core/headless/GuardrailBand.ts';
const CANDIDATE_VALIDATION_SRC = 'src/core/headless/CandidateValidation.ts';
const LIVE_GUARDRAIL_TEST_SRC = 'tests/core/ai-evaluator-benchmark-guardrails.test.ts';

/** 锚点：500 局平衡自对弈、baseSeed 10000、maxRounds 30（ADR 0011「采纳记录」）。 */
const ANCHOR_GUIYUAN_RATE = 0.904;
const ANCHOR_P1_WIN_RATE = 0.504;
/** 回退：关闭生产「攻击进度定价」后同口径实测（工单 02 复现，ADR 0011）。 */
const NO_PROGRESS_PRICING_GUIYUAN_RATE = 0.884;
const NO_PROGRESS_PRICING_P1_WIN_RATE = 0.512;

describe('护栏带唯一定义与防漂移守卫', () => {
  it('带包含实测锚点（90.40% / 50.40%）', () => {
    expect(ANCHOR_GUIYUAN_RATE).toBeGreaterThanOrEqual(GUARDRAIL_GUIYUAN_MIN);
    expect(ANCHOR_GUIYUAN_RATE).toBeLessThanOrEqual(GUARDRAIL_GUIYUAN_MAX);
    expect(ANCHOR_P1_WIN_RATE).toBeGreaterThanOrEqual(GUARDRAIL_P1_WIN_MIN);
    expect(ANCHOR_P1_WIN_RATE).toBeLessThanOrEqual(GUARDRAIL_P1_WIN_MAX);
  });

  it('带把「无进度定价」的回退挡在带外（88.40% / 51.20%）', () => {
    // 归元率下界必须 > 88.40%，否则回退（0.884）重新落进带内，带就拦不住它。
    expect(NO_PROGRESS_PRICING_GUIYUAN_RATE).toBeLessThan(GUARDRAIL_GUIYUAN_MIN);
    // 先手胜率上界必须 < 51.20%，否则回退（0.512）重新落进带内。
    expect(NO_PROGRESS_PRICING_P1_WIN_RATE).toBeGreaterThan(GUARDRAIL_P1_WIN_MAX);
  });

  it('四个带字面量只出现在唯一定义处（GuardrailBand.ts）', () => {
    const bandSource = read(GUARDRAIL_BAND_SRC);
    const consumers = [
      { path: LIVE_GUARDRAIL_TEST_SRC, source: stripComments(read(LIVE_GUARDRAIL_TEST_SRC)) },
      { path: CANDIDATE_VALIDATION_SRC, source: stripComments(read(CANDIDATE_VALIDATION_SRC)) }
    ];
    const literals = [
      String(GUARDRAIL_GUIYUAN_MIN),
      String(GUARDRAIL_GUIYUAN_MAX),
      String(GUARDRAIL_P1_WIN_MIN),
      String(GUARDRAIL_P1_WIN_MAX)
    ];
    for (const literal of literals) {
      expect(bandSource).toContain(literal);
      for (const consumer of consumers) {
        expect(
          consumer.source,
          `${consumer.path} 重新硬编码了带字面量 ${literal}；请改为从 ${GUARDRAIL_BAND_SRC} import`
        ).not.toContain(literal);
      }
    }
  });

  it('live 测试与 CLI 的带比较引用共享常量，而不是换回字面量', () => {
    const liveSource = stripComments(read(LIVE_GUARDRAIL_TEST_SRC));
    const cliSource = stripComments(read(CANDIDATE_VALIDATION_SRC));

    // 两处都必须从共享模块 import。
    expect(liveSource).toContain("from '../../src/core/headless/GuardrailBand.js'");
    expect(cliSource).toContain("from './GuardrailBand.js'");

    // live 测试的四个界必须直接与共享常量比较（换成任何字面量都会让这里红）。
    expect(liveSource).toContain('toBeGreaterThanOrEqual(GUARDRAIL_GUIYUAN_MIN)');
    expect(liveSource).toContain('toBeLessThanOrEqual(GUARDRAIL_GUIYUAN_MAX)');
    expect(liveSource).toContain('toBeGreaterThanOrEqual(GUARDRAIL_P1_WIN_MIN)');
    expect(liveSource).toContain('toBeLessThanOrEqual(GUARDRAIL_P1_WIN_MAX)');

    // CLI 判据同样引用共享常量。
    for (const name of [
      'GUARDRAIL_GUIYUAN_MIN',
      'GUARDRAIL_GUIYUAN_MAX',
      'GUARDRAIL_P1_WIN_MIN',
      'GUARDRAIL_P1_WIN_MAX'
    ]) {
      expect(cliSource).toContain(name);
    }
  });
});
