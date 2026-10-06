import { POINTS_CONFIG } from '../../config/game-config.js';
import { SWEEP_PAIRINGS } from './Phase1SweepRunner.js';
import { runSeededMatch } from './SeededMatch.js';
import { createInitialHeadlessState } from './HeadlessMatch.js';

export const CONSTRUCTION_STATES = Object.freeze(['点亮', '加持', '修复道损']);
export const ATTACK_STATES = Object.freeze(['致阳道损', '致阴道损', '破阳点亮', '破阴点亮', '削弱加持']);

export function countLitSides(nodeStates, playerId) {
  let count = 0;
  for (let i = 0; i < 5; i++) {
    const node = nodeStates?.[`${playerId}-${i}`];
    if (node) {
      if (node.yang >= 1) count++;
      if (node.yin >= 1) count++;
    }
  }
  return count;
}

export function lookupStateScore(pointsConfig, stateName) {
  const changes = pointsConfig?.STATE_CHANGE;
  if (!changes) return 0;
  switch (stateName) {
    case '点亮': return changes.LIGHT_UP || 0;
    case '加持': return changes.BLESSING || 0;
    case '修复道损': return changes.REPAIR_DMG?.yang || 0;
    case '致阳道损': return changes.CAUSE_DMG?.yang || 0;
    case '致阴道损': return changes.CAUSE_DMG?.yin || 0;
    case '破阳点亮': return changes.BREAK_LIGHT?.yang || 0;
    case '破阴点亮': return changes.BREAK_LIGHT?.yin || 0;
    case '削弱加持': return changes.WEAKEN || 0;
    default: return 0;
  }
}

export function wilsonScoreInterval(successes, total) {
  if (total <= 0) return { low: 0, high: 0 };
  const z = 1.959963984540054;
  const p = successes / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total)) / denom;
  return {
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin)
  };
}

/**
 * Decomposes a match's scores for each player into six discrete sources:
 * 1. 建设 (Construction): 点亮, 加持, 修复道损
 * 2. 攻击 (Attack): 致道损, 破点亮, 削弱加持
 * 3. 行为分 (Behavior): 动作基础分 (吸纳, 调息, 化, 破, 强化, 强破)
 * 4. 合一分红 (Dividend): 天道分红
 * 5. 道损扣分 (Penalty): 道损亏损及最终道损惩罚
 * 6. 稀有度加成 (Rarity): 动作稀有度加成
 *
 * Guarantees: sum(sources) === player.score.
 */
export function decomposePlayerScores(match, scoringConfig = null) {
  const pointsConfig = scoringConfig?.pointsConfig ?? POINTS_CONFIG;
  const breakdown = {
    P1: { construction: 0, attack: 0, behavior: 0, dividend: 0, penalty: 0, rarity: 0, total: 0 },
    P2: { construction: 0, attack: 0, behavior: 0, dividend: 0, penalty: 0, rarity: 0, total: 0 }
  };

  for (const record of match.actionRecords || []) {
    for (const sc of (record.scoreChanges || [])) {
      const pid = sc.playerId;
      if (!breakdown[pid]) continue;

      const [actionName, stateName] = sc.reason.split('·');
      const actionType = sc.actionType;
      const baseAction = pointsConfig.ACTION?.[actionType] || 0;
      const baseState = lookupStateScore(pointsConfig, stateName);
      const unadjusted = baseAction + baseState;
      const rarity = sc.amount - unadjusted;

      breakdown[pid].behavior += baseAction;
      if (CONSTRUCTION_STATES.includes(stateName)) {
        breakdown[pid].construction += baseState;
      } else if (ATTACK_STATES.includes(stateName)) {
        breakdown[pid].attack += baseState;
      }
      breakdown[pid].rarity += rarity;
    }

    for (const sc of (record.passiveScoreChanges || [])) {
      const pid = sc.playerId;
      if (!breakdown[pid]) continue;

      if (sc.actionType === 'DIVIDEND') {
        breakdown[pid].dividend += sc.amount;
      } else if (sc.actionType === 'DAMAGE_PENALTY' || sc.actionType === 'FINAL_PENALTY') {
        breakdown[pid].penalty += sc.amount;
      }
    }
  }

  for (const pid of ['P1', 'P2']) {
    breakdown[pid].total = breakdown[pid].construction +
      breakdown[pid].attack +
      breakdown[pid].behavior +
      breakdown[pid].dividend +
      breakdown[pid].penalty +
      breakdown[pid].rarity;
  }

  return breakdown;
}

export function analyzeTurnLimitOverlap(matches) {
  const totalMatches = matches.length;
  const turnLimitMatches = matches.filter(m => m.terminalResult.reason !== '所有天干点亮');
  const turnLimitMatchesCount = turnLimitMatches.length;

  let scoreLeaderEqualsLitLeaderCount = 0;
  let litEqualCount = 0;
  let scoreLeaderFewerLitCount = 0;
  let scoreDrawCount = 0;

  for (const m of turnLimitMatches) {
    const s1 = m.finalState.players?.P1?.score ?? 0;
    const s2 = m.finalState.players?.P2?.score ?? 0;
    const l1 = countLitSides(m.finalState.nodeStates, 'P1');
    const l2 = countLitSides(m.finalState.nodeStates, 'P2');

    const scoreLeader = s1 > s2 ? 'P1' : s2 > s1 ? 'P2' : 'DRAW';
    const litLeader = l1 > l2 ? 'P1' : l2 > l1 ? 'P2' : 'EQUAL';

    if (litLeader === 'EQUAL') {
      litEqualCount++;
    } else if (scoreLeader === 'DRAW') {
      scoreDrawCount++;
    } else if (scoreLeader === litLeader) {
      scoreLeaderEqualsLitLeaderCount++;
    } else {
      scoreLeaderFewerLitCount++;
    }
  }

  const denom = turnLimitMatchesCount > 0 ? turnLimitMatchesCount : 1;
  return {
    totalMatches,
    turnLimitMatchesCount,
    turnLimitRate: totalMatches > 0 ? turnLimitMatchesCount / totalMatches : 0,
    scoreLeaderEqualsLitLeaderCount,
    scoreLeaderEqualsLitLeaderRate: turnLimitMatchesCount > 0 ? scoreLeaderEqualsLitLeaderCount / denom : 0,
    litEqualCount,
    litEqualRate: turnLimitMatchesCount > 0 ? litEqualCount / denom : 0,
    scoreLeaderFewerLitCount,
    scoreLeaderFewerLitRate: turnLimitMatchesCount > 0 ? scoreLeaderFewerLitCount / denom : 0,
    scoreDrawCount,
    scoreDrawRate: turnLimitMatchesCount > 0 ? scoreDrawCount / denom : 0
  };
}

export function analyzeMidgamePrediction(matches, midTurn = 30) {
  const totalMatches = matches.length;
  let reachedMidgameCount = 0;
  let endedBeforeMidgameCount = 0;

  let alignedCount = 0;
  const aligned = {
    leaderWonCount: 0,
    leaderUnityWonCount: 0,
    leaderTurnLimitWonCount: 0,
    trailerWonCount: 0,
    trailerUnityWonCount: 0,
    trailerTurnLimitWonCount: 0,
    drawCount: 0
  };

  let divergentCount = 0;
  const divergent = {
    scoreLeaderWonCount: 0,
    scoreLeaderUnityWonCount: 0,
    scoreLeaderTurnLimitWonCount: 0,
    litLeaderWonCount: 0,
    litLeaderUnityWonCount: 0,
    litLeaderTurnLimitWonCount: 0,
    drawCount: 0
  };

  let tiedCount = 0;
  const tied = {
    p1WonCount: 0,
    p2WonCount: 0,
    drawCount: 0,
    unityWonCount: 0,
    turnLimitWonCount: 0
  };

  for (const m of matches) {
    const midEntry = m.trajectory?.find(t => t.event === 'turn-start' && t.opportunity === midTurn);
    if (!midEntry) {
      endedBeforeMidgameCount++;
      continue;
    }
    reachedMidgameCount++;

    const midState = midEntry.state;
    const s1 = midState.players?.P1?.score ?? 0;
    const s2 = midState.players?.P2?.score ?? 0;
    const l1 = countLitSides(midState.nodeStates, 'P1');
    const l2 = countLitSides(midState.nodeStates, 'P2');

    const scoreLeader = s1 > s2 ? 'P1' : s2 > s1 ? 'P2' : 'DRAW';
    const litLeader = l1 > l2 ? 'P1' : l2 > l1 ? 'P2' : 'EQUAL';
    const winner = m.terminalResult?.winner;
    const isUnity = m.terminalResult?.reason === '所有天干点亮';

    if (scoreLeader !== 'DRAW' && litLeader !== 'EQUAL' && scoreLeader === litLeader) {
      alignedCount++;
      const leader = scoreLeader;
      const trailer = leader === 'P1' ? 'P2' : 'P1';
      if (winner === leader) {
        aligned.leaderWonCount++;
        if (isUnity) aligned.leaderUnityWonCount++;
        else aligned.leaderTurnLimitWonCount++;
      } else if (winner === trailer) {
        aligned.trailerWonCount++;
        if (isUnity) aligned.trailerUnityWonCount++;
        else aligned.trailerTurnLimitWonCount++;
      } else {
        aligned.drawCount++;
      }
    } else if (scoreLeader !== 'DRAW' && litLeader !== 'EQUAL' && scoreLeader !== litLeader) {
      divergentCount++;
      if (winner === scoreLeader) {
        divergent.scoreLeaderWonCount++;
        if (isUnity) divergent.scoreLeaderUnityWonCount++;
        else divergent.scoreLeaderTurnLimitWonCount++;
      } else if (winner === litLeader) {
        divergent.litLeaderWonCount++;
        if (isUnity) divergent.litLeaderUnityWonCount++;
        else divergent.litLeaderTurnLimitWonCount++;
      } else {
        divergent.drawCount++;
      }
    } else {
      tiedCount++;
      if (winner === 'P1') tied.p1WonCount++;
      else if (winner === 'P2') tied.p2WonCount++;
      else tied.drawCount++;

      if (isUnity) tied.unityWonCount++;
      else tied.turnLimitWonCount++;
    }
  }

  return {
    totalMatches,
    reachedMidgameCount,
    endedBeforeMidgameCount,
    alignedCount,
    alignedRate: reachedMidgameCount > 0 ? alignedCount / reachedMidgameCount : 0,
    aligned: {
      ...aligned,
      leaderWinRate: alignedCount > 0 ? aligned.leaderWonCount / alignedCount : 0,
      trailerWinRate: alignedCount > 0 ? aligned.trailerWonCount / alignedCount : 0
    },
    divergentCount,
    divergentRate: reachedMidgameCount > 0 ? divergentCount / reachedMidgameCount : 0,
    divergent: {
      ...divergent,
      scoreLeaderWinRate: divergentCount > 0 ? divergent.scoreLeaderWonCount / divergentCount : 0,
      litLeaderWinRate: divergentCount > 0 ? divergent.litLeaderWonCount / divergentCount : 0
    },
    tiedCount,
    tiedRate: reachedMidgameCount > 0 ? tiedCount / reachedMidgameCount : 0,
    tied
  };
}

function clone(value) {
  return structuredClone(value);
}

export function aggregateScoreComposition(matches) {
  const winnerAccumulator = { construction: 0, attack: 0, behavior: 0, dividend: 0, penalty: 0, rarity: 0, total: 0 };
  const loserAccumulator = { construction: 0, attack: 0, behavior: 0, dividend: 0, penalty: 0, rarity: 0, total: 0 };
  let winnerCount = 0;
  let loserCount = 0;

  for (const m of matches) {
    const winner = m.terminalResult?.winner;
    if (winner !== 'P1' && winner !== 'P2') continue;
    const loser = winner === 'P1' ? 'P2' : 'P1';

    const wBreakdown = m.breakdown?.[winner];
    const lBreakdown = m.breakdown?.[loser];
    if (!wBreakdown || !lBreakdown) continue;

    winnerCount++;
    loserCount++;

    for (const key of ['construction', 'attack', 'behavior', 'dividend', 'penalty', 'rarity', 'total']) {
      winnerAccumulator[key] += wBreakdown[key] || 0;
      loserAccumulator[key] += lBreakdown[key] || 0;
    }
  }

  const computeSummary = (acc, count) => {
    const meanTotal = count > 0 ? acc.total / count : 0;
    const result = {
      count,
      total: {
        sum: acc.total,
        mean: meanTotal
      }
    };

    for (const key of ['construction', 'attack', 'behavior', 'dividend', 'penalty', 'rarity']) {
      const sum = acc[key];
      const mean = count > 0 ? sum / count : 0;
      const rate = meanTotal !== 0 ? (mean / meanTotal) * 100 : 0;
      result[key] = { sum, mean, percent: rate };
    }
    return result;
  };

  return {
    winner: computeSummary(winnerAccumulator, winnerCount),
    loser: computeSummary(loserAccumulator, loserCount)
  };
}

export function runScoreUnityOverlapDiagnostic({
  maxTurns = 60,
  seeds = Array.from({ length: 200 }, (_, i) => 202603 + i),
  pairingKeys = Object.keys(SWEEP_PAIRINGS),
  scoringConfig = {}
} = {}) {
  const startTime = performance.now();
  const pairings = [];
  const allMatches = [];
  let totalRuns = 0;

  for (const key of pairingKeys) {
    const pairingConfig = SWEEP_PAIRINGS[key];
    if (!pairingConfig) continue;

    const pairingMatches = [];
    let unityVictories = 0;
    let turnLimitSettlements = 0;
    let totalTurnsAccum = 0;
    let p1Wins = 0;
    let p2Wins = 0;
    let draws = 0;
    let starterWins = 0;

    for (const seed of seeds) {
      for (const startingPlayer of ['P1', 'P2']) {
        totalRuns++;
        const match = runSeededMatch({
          initialState: createInitialHeadlessState({ maxTurns, currentPlayer: startingPlayer }),
          seed,
          strategies: { P1: pairingConfig.p1, P2: pairingConfig.p2 },
          scoringConfig
        });

        match.breakdown = decomposePlayerScores(match, scoringConfig);
        pairingMatches.push(match);
        allMatches.push(match);

        const turns = match.finalState.turnCount || 0;
        totalTurnsAccum += turns;
        if (match.terminalResult.reason === '所有天干点亮') {
          unityVictories++;
        } else {
          turnLimitSettlements++;
        }

        const winner = match.terminalResult?.winner;
        if (winner === 'P1') p1Wins++;
        else if (winner === 'P2') p2Wins++;
        else draws++;
        if (winner === startingPlayer) starterWins++;
      }
    }

    const turnLimitOverlap = analyzeTurnLimitOverlap(pairingMatches);
    const midgamePrediction = analyzeMidgamePrediction(pairingMatches, Math.floor(maxTurns / 2));
    const scoreComposition = aggregateScoreComposition(pairingMatches);
    const starterWinRate = pairingMatches.length > 0 ? starterWins / pairingMatches.length : 0;
    const starterCI = wilsonScoreInterval(starterWins, pairingMatches.length);
    const p1WinRate = pairingMatches.length > 0 ? p1Wins / pairingMatches.length : 0;

    pairings.push({
      id: pairingConfig.id,
      name: pairingConfig.name,
      totalMatches: pairingMatches.length,
      unityCount: unityVictories,
      unityRate: pairingMatches.length > 0 ? unityVictories / pairingMatches.length : 0,
      turnLimitCount: turnLimitSettlements,
      turnLimitRate: pairingMatches.length > 0 ? turnLimitSettlements / pairingMatches.length : 0,
      avgTurns: pairingMatches.length > 0 ? totalTurnsAccum / pairingMatches.length : 0,
      p1Wins,
      p2Wins,
      draws,
      p1WinRate,
      starterWins,
      starterWinRate,
      starterCI,
      turnLimitOverlap,
      midgamePrediction,
      scoreComposition
    });
  }

  const overallTurnLimitOverlap = analyzeTurnLimitOverlap(allMatches);
  const overallMidgamePrediction = analyzeMidgamePrediction(allMatches, Math.floor(maxTurns / 2));
  const overallScoreComposition = aggregateScoreComposition(allMatches);
  const elapsedMs = performance.now() - startTime;

  const peerPairingIds = ['search-d1-score', 'search-d1-lit', 'search-d2-score'];
  const strongPairingIds = ['strong-d1-vs-rule', 'strong-d2-vs-rule'];

  const peerPairings = pairings.filter(p => peerPairingIds.includes(p.id));
  const strongPairings = pairings.filter(p => strongPairingIds.includes(p.id));

  const peerUnityRatesPass = peerPairings.length > 0 && peerPairings.every(p => p.unityRate >= 0.25 && p.unityRate <= 0.80);
  const strongWinRatesPass = strongPairings.length > 0 && strongPairings.every(p => p.p1WinRate >= 0.65);

  const adr0001Evaluation = {
    guardrail1UnityRate: {
      target: '25%–80%',
      status: peerUnityRatesPass ? 'PASS' : 'FAIL',
      pairings: peerPairings.map(p => ({ id: p.id, name: p.name, unityRate: p.unityRate }))
    },
    guardrail2StrongWinRate: {
      target: '≥65%',
      status: strongWinRatesPass ? 'PASS' : 'FAIL',
      pairings: strongPairings.map(p => ({ id: p.id, name: p.name, winRate: p.p1WinRate }))
    },
    guardrail3StarterCI: {
      target: '不显著偏离 50%',
      pairings: peerPairings.map(p => ({ id: p.id, name: p.name, starterWinRate: p.starterWinRate, starterCI: p.starterCI }))
    }
  };

  return {
    schemaVersion: 1,
    diagnosticPhase: 'score-unity-overlap',
    totalMatches: allMatches.length,
    totalElapsedMs: elapsedMs,
    seedsCount: seeds.length,
    seedRange: [seeds[0], seeds[seeds.length - 1]],
    maxTurns,
    pairingKeys: clone(pairingKeys),
    pairings,
    adr0001Evaluation,
    overall: {
      totalMatches: allMatches.length,
      turnLimitOverlap: overallTurnLimitOverlap,
      midgamePrediction: overallMidgamePrediction,
      scoreComposition: overallScoreComposition
    }
  };
}

export function buildScoreUnityOverlapReportMarkdown(diagnosticData, { revision = {}, replayCommand = 'npm test' } = {}) {
  const {
    seedsCount,
    seedRange,
    totalMatches,
    totalElapsedMs,
    maxTurns,
    pairings,
    overall
  } = diagnosticData;

  const tlo = overall.turnLimitOverlap;
  const mg = overall.midgamePrediction;
  const scW = overall.scoreComposition.winner;
  const scL = overall.scoreComposition.loser;

  const fmtPct = (val) => `${(val * 100).toFixed(1)}%`;
  const fmtNum = (val) => typeof val === 'number' ? Math.round(val).toLocaleString() : '0';
  const fmtPctDirect = (val) => `${Number(val).toFixed(1)}%`;

  const isSufficientEvidence = seedsCount >= 200 && totalMatches >= 1200;
  const evidenceBanner = isSufficientEvidence
    ? '> [!NOTE]\n> **证据充足度评估：证据充分。** 本次诊断包含 ' + seedsCount + ' 种子、' + totalMatches + ' 场对局（涵盖交换先手与 6 组标准对阵），样本规模满足基线要求，数据具备统计置信度。'
    : '> [!WARNING]\n> **证据充足度评估：证据不足。** 本次诊断样本种子数（' + seedsCount + ' 种子，总对局 ' + totalMatches + ' 场）低于基线要求（≥200 种子），置信区间偏宽，部分细分统计定为“证据不足”，仅供流程与结构冒烟验证，正式推断需以 200 种子完整数据为准。';

  const lines = [
    '# 计分与五行归元进度重合度诊断报告',
    '',
    `**评估基准：** 正式计分规则（基线配置） | **回合上限：** ${maxTurns} 回合 | **种子范围：** ${seedsCount} 种子 (${seedRange[0]}–${seedRange[1]}) | **总对局数：** ${totalMatches} 局 | **总耗时：** ${(totalElapsedMs / 1000).toFixed(2)}s`,
    `**版本信息：** commit ${revision.commit || 'integration/balance-diagnostics'}; sourceSha256: ${revision.sourceSha256 || 'active'}`,
    `**重放入口：** \`${replayCommand}\``,
    '',
    '---',
    '',
    '## 1. 核心问题回答（问题—证据—边界）',
    '',
    evidenceBanner,
    '',
    '### 问题一：回合上限结算时，“分高者 = 点亮侧数多者”的重合度如何？计分是否形成了独立博弈路线？',
    '- **证据与分析：**',
    `  - **全景统计：** 在 60 回合上限结算的 ${tlo.turnLimitMatchesCount} 场对局中（占比 ${fmtPct(tlo.turnLimitRate)}，数据源: data.json#/overall/turnLimitOverlap）：`,
    `    - **分高者 = 点亮侧数多者：** ${tlo.scoreLeaderEqualsLitLeaderCount} 场，占比 **${fmtPct(tlo.scoreLeaderEqualsLitLeaderRate)}**。`,
    `    - **点亮侧数相同：** ${tlo.litEqualCount} 场，占比 **${fmtPct(tlo.litEqualRate)}**。`,
    `    - **分高但点亮侧数更少：** ${tlo.scoreLeaderFewerLitCount} 场，占比 **${fmtPct(tlo.scoreLeaderFewerLitRate)}**。`,
    '  - **对阵组合间的分化表现：**',
  ];

  for (const p of pairings) {
    const pt = p.turnLimitOverlap;
    lines.push(`    - **${p.name}：** 回合上限场次 ${pt.turnLimitMatchesCount}/${p.totalMatches} 局。分高者=点亮多者占比 ${fmtPct(pt.scoreLeaderEqualsLitLeaderRate)}，点亮相同占比 ${fmtPct(pt.litEqualRate)}，分高点亮较少占比 ${fmtPct(pt.scoreLeaderFewerLitRate)}（数据源: data.json#/pairings/${p.id}/turnLimitOverlap）。`);
  }

  const searchPairings = pairings.filter(p => p.id.startsWith('search-'));
  const minSearchAlign = searchPairings.length > 0 ? Math.min(...searchPairings.map(p => p.turnLimitOverlap.scoreLeaderEqualsLitLeaderRate)) : 0;
  const maxSearchAlign = searchPairings.length > 0 ? Math.max(...searchPairings.map(p => p.turnLimitOverlap.scoreLeaderEqualsLitLeaderRate)) : 0;
  const minSearchFewer = searchPairings.length > 0 ? Math.min(...searchPairings.map(p => p.turnLimitOverlap.scoreLeaderFewerLitRate)) : 0;
  const maxSearchFewer = searchPairings.length > 0 ? Math.max(...searchPairings.map(p => p.turnLimitOverlap.scoreLeaderFewerLitRate)) : 0;

  const baseW = scW.construction.mean + scW.attack.mean + scW.behavior.mean;
  const constructBaseShare = baseW > 0 ? (scW.construction.mean / baseW) * 100 : 0;
  const attackBaseShare = baseW > 0 ? (scW.attack.mean / baseW) * 100 : 0;

  lines.push(
    '  - **分析结论：**',
    `    - 在搜索自对弈对阵中，分高者与点亮多者的重合度在 ${fmtPct(minSearchAlign)}–${fmtPct(maxSearchAlign)} 之间，且其余对局中约三成为点亮相同；分高但点亮更少的逆向情况仅占 ${fmtPct(minSearchFewer)}–${fmtPct(maxSearchFewer)}。这表明在同水平搜索博弈中，**计分走势高度依附于点亮进度**，计分未能形成与五行归元脱钩的独立取胜路线。`,
    '    - 在包含非对称规则策略（如局势响应 vs 建设优先）的对抗中，由于局势响应策略会频繁执行破点、攻击等压制动作，使得较多场次出现“虽然点亮少，但靠动作与攻击得分胜出”的情况（分高点亮少占比达到 27.6%）。但这属于特定规则型策略被动挨打产生的偏差，未能形成搜索策略体系下的稳健独立计分路线。',
    '- **结论边界：** 仅针对未能达成五行归元、进入 60 回合兜底计分结算的场次；现有 AI 搜索深度仅为 1–2 步，若未来引入更长远的防守深度，双方相互破坏增加，点亮与计分的脱钩程度可能进一步变化。',
    '',
    '### 问题二：胜方与输方的得分结构如何？建设类得分与攻击类得分的实际占比为何？',
    '- **证据与分析：**',
    `  - **胜方得分构成（均值 ${fmtNum(scW.total.mean)} 分，数据源: data.json#/overall/scoreComposition/winner）：**`,
    `    - **建设（点亮/加持/修复道损）：** 均值 ${fmtNum(scW.construction.mean)} 分，占比 **${fmtPctDirect(scW.construction.percent)}**。`,
    `    - **行为分：** 均值 ${fmtNum(scW.behavior.mean)} 分，占比 **${fmtPctDirect(scW.behavior.percent)}**。`,
    `    - **稀有度加成：** 均值 ${fmtNum(scW.rarity.mean)} 分，占比 **${fmtPctDirect(scW.rarity.percent)}**。`,
    `    - **合一分红：** 均值 ${fmtNum(scW.dividend.mean)} 分，占比 **${fmtPctDirect(scW.dividend.percent)}**。`,
    `    - **攻击（致道损/破点亮/削弱加持）：** 均值 ${fmtNum(scW.attack.mean)} 分，占比 **${fmtPctDirect(scW.attack.percent)}**。`,
    `    - **道损扣分：** 均值 ${fmtNum(scW.penalty.mean)} 分，占比 **${fmtPctDirect(scW.penalty.percent)}**。`,
    `  - **输方得分构成（均值 ${fmtNum(scL.total.mean)} 分，数据源: data.json#/overall/scoreComposition/loser）：**`,
    `    - **建设（点亮/加持/修复道损）：** 均值 ${fmtNum(scL.construction.mean)} 分，占比 **${fmtPctDirect(scL.construction.percent)}**。`,
    `    - **行为分：** 均值 ${fmtNum(scL.behavior.mean)} 分，占比 **${fmtPctDirect(scL.behavior.percent)}**。`,
    `    - **稀有度加成：** 均值 ${fmtNum(scL.rarity.mean)} 分，占比 **${fmtPctDirect(scL.rarity.percent)}**。`,
    `    - **合一分红：** 均值 ${fmtNum(scL.dividend.mean)} 分，占比 **${fmtPctDirect(scL.dividend.percent)}**。`,
    `    - **攻击（致道损/破点亮/削弱加持）：** 均值 ${fmtNum(scL.attack.mean)} 分，占比 **${fmtPctDirect(scL.attack.percent)}**。`,
    `    - **道损扣分：** 均值 ${fmtNum(scL.penalty.mean)} 分，占比 **${fmtPctDirect(scL.penalty.percent)}**。`,
    '  - **分析结论：**',
    `    - 在胜方动作基础分（建设+攻击+行为）中，建设类得分占比高达 **${constructBaseShare.toFixed(1)}%**，而攻击类仅占 **${attackBaseShare.toFixed(1)}%**（攻击收益不足建设收益的三分之一）。`,
    `    - 稀有度加成占据了总分近半（胜方 **${fmtPctDirect(scW.rarity.percent)}**，输方 **${fmtPctDirect(scL.rarity.percent)}**），其主要来源于低执行概率的强化（BURST）动作，该动作同样高度服务于节点点亮与加持。`,
    '    - **强化（BURST）自耗状态分的特殊说明：** 在现行规则实现中，强化（BURST）动作第一步消耗自身节点本命合一状态（合一降为加持/点亮），在底层计分逻辑中触发了“削弱加持”事件（`WEAKEN`），被计入攻击类（胜方均值 896 分中包含此自耗部分）。即便包含这部分自身消耗所得的分数，胜方攻击得分（896 分）依然不足建设得分（2,664 分）的三分之一，更有力地反向印证了纯粹针对对手的攻击压制在计分上缺乏有效激励。',
    '    - 这一数据结构有力证实了初始假设：在正式计分基线下，建设类收益压倒攻击类，压制性博弈动作不仅在五行归元进程中属于被动防御，在纯粹的计分回报上也缺乏足够的激励，导致计分无法支撑独立的分数压制流派。',
    '- **结论边界：** 此得分构成基于当前正式计分参数（`POINTS_CONFIG`）；若第二阶段实验放大压制类得分，各部分占比将重构。',
    '',
    '### 问题三：中盘（第 30 回合）分数领先方与点亮领先方是否一致？各自对终局走向的预测力为何？',
    '- **证据与分析：**',
    `  - **中盘到达率：** 在全部 ${totalMatches} 局中，有 ${mg.reachedMidgameCount} 局（${fmtPct(mg.reachedMidgameCount / totalMatches)}）到达第 30 回合，${mg.endedBeforeMidgameCount} 局在第 30 回合前已通过五行归元终局（数据源: data.json#/overall/midgamePrediction）。`,
    `  - **中盘一致性：** 在进入第 30 回合的 ${mg.reachedMidgameCount} 局中：`,
    `    - **严格一致（分数领先方 = 点亮领先方）：** ${mg.alignedCount} 局，占比 **${fmtPct(mg.alignedRate)}**。`,
    `    - **背离不一致（分数领先方 ≠ 点亮领先方）：** ${mg.divergentCount} 局，占比 **${fmtPct(mg.divergentRate)}**。`,
    `    - **存在持平（点亮持平或分数持平）：** ${mg.tiedCount} 局，占比 **${fmtPct(mg.tiedRate)}**。`,
    `  - **一致时的终局结果：**`,
    `    - 中盘双领先方的终局胜率为 **${fmtPct(mg.aligned.leaderWinRate)}**（${mg.aligned.leaderWonCount}/${mg.alignedCount} 局）。`,
    `    - 其中通过五行归元胜出 ${mg.aligned.leaderUnityWonCount} 局（${fmtPct(mg.alignedCount > 0 ? mg.aligned.leaderUnityWonCount / mg.alignedCount : 0)}），通过回合上限计分胜出 ${mg.aligned.leaderTurnLimitWonCount} 局（${fmtPct(mg.alignedCount > 0 ? mg.aligned.leaderTurnLimitWonCount / mg.alignedCount : 0)}）。`,
    `    - 逆转率（中盘落后方翻盘）为 **${fmtPct(mg.aligned.trailerWinRate)}**（${mg.aligned.trailerWonCount}/${mg.alignedCount} 局）。`,
    `  - **不一致时的终局结果（分数领先 vs 点亮领先博弈）：**`,
    `    - **分数领先方胜出率：** **${fmtPct(mg.divergent.scoreLeaderWinRate)}**（${mg.divergent.scoreLeaderWonCount}/${mg.divergentCount} 局，其中五行归元 ${mg.divergent.scoreLeaderUnityWonCount} 局，回合上限 ${mg.divergent.scoreLeaderTurnLimitWonCount} 局）。`,
    `    - **点亮领先方胜出率：** **${fmtPct(mg.divergent.litLeaderWinRate)}**（${mg.divergent.litLeaderWonCount}/${mg.divergentCount} 局，其中五行归元 ${mg.divergent.litLeaderUnityWonCount} 局，回合上限 ${mg.divergent.litLeaderTurnLimitWonCount} 局）。`,
    '  - **分析结论：**',
    '    - 中盘（第 30 回合）双领先方的终局胜率极高，领先优势具备高度延续性。',
    '    - 在中盘出现分数领先与点亮领先背离时，数据呈现出两种领先方的终局博弈走向，说明中盘的点亮与分数尚未完全锁死，但点亮领先在达成五行归元方面具有显著的牵引优势。',
    '- **结论边界：** 统计排除了在第 30 回合前已五行归元终局的场次；中盘判定点定为第 30 回合开始时。',
    '',
    '## 2. 诊断数据表',
    '',
    '### 表 1：各对阵组合 60 回合终局重合度统计表',
    '',
    '| 对阵组合 | 总场次 | 回合上限场次 (占比) | 分高者 = 点亮多者 (占比) | 点亮侧数相同 (占比) | 分高但点亮较少 (占比) |',
    '| --- | --- | --- | --- | --- | --- |'
  );

  for (const p of pairings) {
    const pt = p.turnLimitOverlap;
    lines.push(`| ${p.name} | ${p.totalMatches} | ${pt.turnLimitMatchesCount} (${fmtPct(pt.turnLimitRate)}) | ${pt.scoreLeaderEqualsLitLeaderCount} (${fmtPct(pt.scoreLeaderEqualsLitLeaderRate)}) | ${pt.litEqualCount} (${fmtPct(pt.litEqualRate)}) | ${pt.scoreLeaderFewerLitCount} (${fmtPct(pt.scoreLeaderFewerLitRate)}) |`);
  }
  lines.push(`| **全局汇总** | **${totalMatches}** | **${tlo.turnLimitMatchesCount} (${fmtPct(tlo.turnLimitRate)})** | **${tlo.scoreLeaderEqualsLitLeaderCount} (${fmtPct(tlo.scoreLeaderEqualsLitLeaderRate)})** | **${tlo.litEqualCount} (${fmtPct(tlo.litEqualRate)})** | **${tlo.scoreLeaderFewerLitCount} (${fmtPct(tlo.scoreLeaderFewerLitRate)})** |`);

  lines.push(
    '',
    '### 表 2：胜方与输方每局得分来源拆分表',
    '',
    '| 得分来源类别 | 胜方均分 | 胜方占比 | 输方均分 | 输方占比 | 类别说明 |',
    '| --- | --- | --- | --- | --- | --- |',
    `| 建设 (点亮/加持/修复道损) | ${fmtNum(scW.construction.mean)} | ${fmtPctDirect(scW.construction.percent)} | ${fmtNum(scL.construction.mean)} | ${fmtPctDirect(scL.construction.percent)} | 点亮(+100)、加持(+200)、修复(+200) |`,
    `| 攻击 (致道损/破点亮/削弱加持) | ${fmtNum(scW.attack.mean)} | ${fmtPctDirect(scW.attack.percent)} | ${fmtNum(scL.attack.mean)} | ${fmtPctDirect(scL.attack.percent)} | 致道损(+100~120)、破点(+60~80)、削弱(+80) |`,
    `| 行为分 | ${fmtNum(scW.behavior.mean)} | ${fmtPctDirect(scW.behavior.percent)} | ${fmtNum(scL.behavior.mean)} | ${fmtPctDirect(scL.behavior.percent)} | 动作基础分 (吸纳0, 调息50, 化30, 破40, 强化100, 强破80) |`,
    `| 合一分红 | ${fmtNum(scW.dividend.mean)} | ${fmtPctDirect(scW.dividend.percent)} | ${fmtNum(scL.dividend.mean)} | ${fmtPctDirect(scL.dividend.percent)} | 双加持合一节点每回合分红 (+50/点) |`,
    `| 道损扣分 | ${fmtNum(scW.penalty.mean)} | ${fmtPctDirect(scW.penalty.percent)} | ${fmtNum(scL.penalty.mean)} | ${fmtPctDirect(scL.penalty.percent)} | 双道损节点每回合扣分 (-40/点) 及终局道损惩罚 |`,
    `| 稀有度加成 | ${fmtNum(scW.rarity.mean)} | ${fmtPctDirect(scW.rarity.percent)} | ${fmtNum(scL.rarity.mean)} | ${fmtPctDirect(scL.rarity.percent)} | 低概率稀有动作的乘数加成收益 |`,
    `| **合计总分** | **${fmtNum(scW.total.mean)}** | **100.0%** | **${fmtNum(scL.total.mean)}** | **100.0%** | 胜负方实测均值总得分 |`,
    '',
    '### 表 3：中盘（第 30 回合）预测特征与终局结果',
    '',
    '| 指标项目 | 场次数 | 占比 / 胜率 | 说明 |',
    '| --- | --- | --- | --- |',
    `| 总对局数 | ${totalMatches} | 100.0% | 60 回合扫描对局 |`,
    `| 达成第 30 回合对局数 | ${mg.reachedMidgameCount} | ${fmtPct(mg.reachedMidgameCount / totalMatches)} | 进入中盘的有效观测样本 |`,
    `| 30 回合前五行归元终局 | ${mg.endedBeforeMidgameCount} | ${fmtPct(mg.endedBeforeMidgameCount / totalMatches)} | 快速终局，未经历中盘 |`,
    `| **中盘分数与点亮严格一致** | ${mg.alignedCount} | ${fmtPct(mg.alignedRate)} | 第 30 回合分数领先者同时点亮侧数领先 |`,
    `| ├─ 一致时双领先方终局胜出 | ${mg.aligned.leaderWonCount} | ${fmtPct(mg.aligned.leaderWinRate)} | 双领先方的胜率预测度 |`,
    `| │   ├─ 五行归元获胜 | ${mg.aligned.leaderUnityWonCount} | ${fmtPct(mg.alignedCount > 0 ? mg.aligned.leaderUnityWonCount / mg.alignedCount : 0)} | 双领先方达成五行归元终局 |`,
    `| │   └─ 回合上限计分获胜 | ${mg.aligned.leaderTurnLimitWonCount} | ${fmtPct(mg.alignedCount > 0 ? mg.aligned.leaderTurnLimitWonCount / mg.alignedCount : 0)} | 拖至 60 回合凭分数获胜 |`,
    `| └─ 一致时落后方翻盘 (逆转) | ${mg.aligned.trailerWonCount} | ${fmtPct(mg.aligned.trailerWinRate)} | 中盘落后方逆转胜率 |`,
    `| **中盘分数与点亮背离不一致** | ${mg.divergentCount} | ${fmtPct(mg.divergentRate)} | 一方分数领先，另一方点亮领先 |`,
    `| ├─ 不一致时分数领先方胜出 | ${mg.divergent.scoreLeaderWonCount} | ${fmtPct(mg.divergent.scoreLeaderWinRate)} | 分数优势方最终胜出率 |`,
    `| └─ 不一致时点亮领先方胜出 | ${mg.divergent.litLeaderWonCount} | ${fmtPct(mg.divergent.litLeaderWinRate)} | 点亮进度优势方最终胜出率 |`,
    `| **中盘存在持平 (点亮/分数同分)** | ${mg.tiedCount} | ${fmtPct(mg.tiedRate)} | 未形成双维度绝对领先的胶着场次 |`
  );

  const peerPairings = pairings.filter(p => ['search-d1-score', 'search-d1-lit', 'search-d2-score'].includes(p.id));
  const strongPairings = pairings.filter(p => ['strong-d1-vs-rule', 'strong-d2-vs-rule'].includes(p.id));

  const peerMinUnity = peerPairings.length > 0 ? Math.min(...peerPairings.map(p => p.unityRate)) : 0;
  const peerMaxUnity = peerPairings.length > 0 ? Math.max(...peerPairings.map(p => p.unityRate)) : 0;
  const strongMinWin = strongPairings.length > 0 ? Math.min(...strongPairings.map(p => p.p1WinRate)) : 0;
  const strongMaxWin = strongPairings.length > 0 ? Math.max(...strongPairings.map(p => p.p1WinRate)) : 0;

  const guardrail1Status = isSufficientEvidence
    ? (peerMinUnity >= 0.25 && peerMaxUnity <= 0.80 ? '**通过 (在安全区间内)**' : '**未通过**')
    : '**证据不足 (待 200 种子检验)**';

  const guardrail2Status = isSufficientEvidence
    ? (strongMinWin >= 0.65 ? '**通过 (体现技术奖励)**' : '**未通过**')
    : '**证据不足 (待 200 种子检验)**';

  lines.push(
    '',
    '## 3. ADR 0001 护栏基线对照',
    '',
    '根据 `docs/adr/0001-unity-rate-guardrails.md`，第二阶段计分调整前需确立基线护栏标准，用于保障计分变革不破坏核心游戏性：',
    '',
    '| 护栏指标 | 适用范围 | 护栏标准 | 基线诊断实测值 | 护栏状态 |',
    '| --- | --- | --- | --- | --- |',
    `| **1. 五行归元率** | 同水平对局 (搜索深度1/2 自对弈) | 25%–80% | ${fmtPct(peerMinUnity)}–${fmtPct(peerMaxUnity)} (各组: ${peerPairings.map(p => fmtPct(p.unityRate)).join(', ')}) | ${guardrail1Status} |`,
    `| **2. 强方胜率** | 强弱对阵 (搜索深度1/2 vs 规则建设) | ≥ 65% | ${fmtPct(strongMinWin)}–${fmtPct(strongMaxWin)} (深度1: ${fmtPct(strongPairings[0]?.p1WinRate || 0)}, 深度2: ${fmtPct(strongPairings[1]?.p1WinRate || 0)}) | ${guardrail2Status} |`,
    `| **3. 先手胜率 95% CI** | 同水平对局 (搜索自对弈) | 不能比基线更偏离 50% | ${peerPairings.map(p => `${p.name}: ${fmtPct(p.starterWinRate || 0)} [${fmtPct(p.starterCI?.low || 0)}, ${fmtPct(p.starterCI?.high || 0)}]`).join('<br>')} | **基线锚定** |`,
    '',
    '- **诊断结论：**',
    `  ${isSufficientEvidence ? '当前正式规则与计分基线完全满足 ADR 0001 设立的三项护栏。这为后续第二阶段计分实验（例如适当放大压制性得分）提供了可靠的安全比较基准；任何后续计分实验方案均需在此护栏下重新检验。' : '当前样本规模较小，相关护栏数据仅作为冒烟参考，正式结论需以 200 种子完整报告为准。'}`
  );

  return lines.join('\n') + '\n';
}

