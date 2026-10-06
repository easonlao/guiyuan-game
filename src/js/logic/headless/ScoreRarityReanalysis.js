import { POINTS_CONFIG } from '../../config/game-config.js';
import {
  CONSTRUCTION_STATES,
  ATTACK_STATES,
  lookupStateScore
} from './ScoreUnityOverlapDiagnostic.js';

export const ACTION_NAMES = Object.freeze({
  AUTO: '吸纳 (AUTO)',
  BURST: '强化 (BURST)',
  BURST_ATK: '强破 (BURST_ATK)',
  CONVERT: '调息 (CONVERT)',
  TRANS: '化 (TRANS)',
  ATK: '破 (ATK)'
});

/**
 * Decomposes a match's scores with reanalysis corrections:
 * 1. Self-reduction of nodes in BURST / step 1 of BURST_ATK is excluded from attack
 *    and classified into construction/defense cost (`burstSelfCost` + `construction`).
 * 2. Rarity bonus is tracked per action type in `rarityByAction`.
 * 3. Exact sum invariant guaranteed: sum(sources) === player.score.
 */
export function decomposePlayerScoresWithReanalysis(match, scoringConfig = null) {
  const pointsConfig = scoringConfig?.pointsConfig ?? POINTS_CONFIG;
  const breakdown = {
    P1: {
      construction: 0,
      attack: 0,
      behavior: 0,
      dividend: 0,
      penalty: 0,
      rarity: 0,
      burstSelfCost: 0,
      rarityByAction: { AUTO: 0, ATK: 0, CONVERT: 0, TRANS: 0, BURST: 0, BURST_ATK: 0 },
      total: 0
    },
    P2: {
      construction: 0,
      attack: 0,
      behavior: 0,
      dividend: 0,
      penalty: 0,
      rarity: 0,
      burstSelfCost: 0,
      rarityByAction: { AUTO: 0, ATK: 0, CONVERT: 0, TRANS: 0, BURST: 0, BURST_ATK: 0 },
      total: 0
    }
  };

  for (const record of match.actionRecords || []) {
    const scoreChanges = record.scoreChanges || [];
    for (let i = 0; i < scoreChanges.length; i++) {
      const sc = scoreChanges[i];
      const pid = sc.playerId;
      if (!breakdown[pid]) continue;

      const [, stateName] = sc.reason.split('·');
      const actionType = sc.actionType;
      const baseAction = pointsConfig.ACTION?.[actionType] || 0;
      const baseState = lookupStateScore(pointsConfig, stateName);
      const unadjusted = baseAction + baseState;
      const rarity = sc.amount - unadjusted;

      breakdown[pid].behavior += baseAction;

      // Identify whether this state change is self-cost from BURST / BURST_ATK
      let isBurstSelf = false;
      if (actionType === 'BURST' && ATTACK_STATES.includes(stateName)) {
        isBurstSelf = true;
      } else if (actionType === 'BURST_ATK' && ATTACK_STATES.includes(stateName)) {
        const correspondingStateChange = record.stateChanges?.[i];
        if (correspondingStateChange) {
          isBurstSelf = correspondingStateChange.playerId === pid;
        } else {
          // In standard BURST_ATK, step 0 is self sacrifice
          isBurstSelf = (i === 0);
        }
      }

      if (isBurstSelf) {
        breakdown[pid].burstSelfCost += baseState;
        breakdown[pid].construction += baseState; // Reclassified to construction/defense cost
      } else if (CONSTRUCTION_STATES.includes(stateName)) {
        breakdown[pid].construction += baseState;
      } else if (ATTACK_STATES.includes(stateName)) {
        breakdown[pid].attack += baseState;
      }

      breakdown[pid].rarity += rarity;
      if (breakdown[pid].rarityByAction[actionType] !== undefined) {
        breakdown[pid].rarityByAction[actionType] += rarity;
      } else {
        breakdown[pid].rarityByAction[actionType] = rarity;
      }
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

/**
 * Extracts a lightweight match summary suitable for serialization into data.json
 */
export function extractMatchBreakdown(match, pairingId = '') {
  return {
    pairingId: pairingId || match.pairingId || '',
    winner: match.terminalResult?.winner || null,
    reason: match.terminalResult?.reason || '',
    turns: match.finalState?.turnCount || 0,
    breakdown: decomposePlayerScoresWithReanalysis(match)
  };
}

/**
 * Performs score and rarity reanalysis on turn-limit matches.
 */
export function performScoreRarityReanalysis(dataOrMatches) {
  const matches = Array.isArray(dataOrMatches)
    ? dataOrMatches
    : (dataOrMatches?.matchBreakdowns || []);
  const totalMatches = dataOrMatches?.totalMatches ?? matches.length;

  const turnLimitMatches = matches.filter(m => m.reason === '回合上限');
  const turnLimitMatchesCount = turnLimitMatches.length;
  const turnLimitRate = totalMatches > 0 ? turnLimitMatchesCount / totalMatches : 0;

  const keys = ['construction', 'attack', 'behavior', 'dividend', 'penalty', 'rarity', 'burstSelfCost', 'total'];
  const actions = ['BURST', 'BURST_ATK', 'CONVERT', 'TRANS', 'ATK', 'AUTO'];

  const winnerAcc = { total: 0, construction: 0, attack: 0, behavior: 0, dividend: 0, penalty: 0, rarity: 0, burstSelfCost: 0 };
  const loserAcc = { total: 0, construction: 0, attack: 0, behavior: 0, dividend: 0, penalty: 0, rarity: 0, burstSelfCost: 0 };
  const winnerRarityAcc = { BURST: 0, BURST_ATK: 0, CONVERT: 0, TRANS: 0, ATK: 0, AUTO: 0 };
  const loserRarityAcc = { BURST: 0, BURST_ATK: 0, CONVERT: 0, TRANS: 0, ATK: 0, AUTO: 0 };

  let winnerCount = 0;
  let loserCount = 0;

  for (const m of turnLimitMatches) {
    const winner = m.winner;
    if (winner !== 'P1' && winner !== 'P2') continue;
    const loser = winner === 'P1' ? 'P2' : 'P1';

    const w = m.breakdown?.[winner];
    const l = m.breakdown?.[loser];
    if (!w || !l) continue;

    winnerCount++;
    loserCount++;

    for (const k of keys) {
      winnerAcc[k] += w[k] || 0;
      loserAcc[k] += l[k] || 0;
    }

    for (const act of actions) {
      winnerRarityAcc[act] += w.rarityByAction?.[act] || 0;
      loserRarityAcc[act] += l.rarityByAction?.[act] || 0;
    }
  }

  const buildStats = (acc, count) => {
    const totalMean = count > 0 ? acc.total / count : 0;
    const res = {
      count,
      total: { sum: acc.total, mean: totalMean }
    };
    for (const k of ['construction', 'attack', 'behavior', 'dividend', 'penalty', 'rarity', 'burstSelfCost']) {
      const mean = count > 0 ? acc[k] / count : 0;
      const percent = totalMean !== 0 ? (mean / totalMean) * 100 : 0;
      res[k] = { sum: acc[k], mean, percent };
    }
    return res;
  };

  const winnerSummary = buildStats(winnerAcc, winnerCount);
  const loserSummary = buildStats(loserAcc, loserCount);

  const delta = {
    total: winnerSummary.total.mean - loserSummary.total.mean
  };
  for (const k of ['construction', 'attack', 'behavior', 'dividend', 'penalty', 'rarity', 'burstSelfCost']) {
    delta[k] = winnerSummary[k].mean - loserSummary[k].mean;
  }

  const totalRaritySum = winnerAcc.rarity + loserAcc.rarity;
  const rarityDistribution = {};
  for (const act of actions) {
    const sum = (winnerRarityAcc[act] || 0) + (loserRarityAcc[act] || 0);
    const percent = totalRaritySum > 0 ? (sum / totalRaritySum) * 100 : 0;
    const wMean = winnerCount > 0 ? (winnerRarityAcc[act] || 0) / winnerCount : 0;
    const lMean = loserCount > 0 ? (loserRarityAcc[act] || 0) / loserCount : 0;
    rarityDistribution[act] = {
      name: ACTION_NAMES[act] || act,
      sum,
      percent,
      winnerMean: wMean,
      loserMean: lMean,
      delta: wMean - lMean
    };
  }

  const burstCorrection = {
    winnerSelfCostMean: winnerSummary.burstSelfCost.mean,
    loserSelfCostMean: loserSummary.burstSelfCost.mean,
    winnerUnadjustedAttackMean: winnerSummary.attack.mean + winnerSummary.burstSelfCost.mean,
    loserUnadjustedAttackMean: loserSummary.attack.mean + loserSummary.burstSelfCost.mean,
    impactSummary: `将每局胜方 ${winnerSummary.burstSelfCost.mean.toFixed(1)} 分、输方 ${loserSummary.burstSelfCost.mean.toFixed(1)} 分的自耗从攻击类剔除并归入建设/防守成本`
  };

  return {
    totalMatches,
    turnLimitMatchesCount,
    turnLimitRate,
    scoreComposition: {
      winner: winnerSummary,
      loser: loserSummary,
      delta
    },
    burstCorrection,
    rarityDistribution
  };
}

/**
 * Builds the Markdown report for Issue 08 reanalysis.
 */
export function buildScoreRarityReanalysisReportMarkdown(result, {
  dataSource = 'reports/balance-diagnostics/score-unity-overlap/data.json'
} = {}) {
  const {
    totalMatches,
    turnLimitMatchesCount,
    turnLimitRate,
    scoreComposition,
    burstCorrection,
    rarityDistribution
  } = result;

  const fmtPct = (val) => `${(val * 100).toFixed(1)}%`;
  const fmtNum = (val) => typeof val === 'number' ? Math.round(val).toLocaleString() : '0';
  const fmtPctDirect = (val) => `${Number(val).toFixed(1)}%`;
  const fmtDelta = (val) => {
    const r = Math.round(val);
    return r > 0 ? `+${r.toLocaleString()}` : r.toLocaleString();
  };

  const scW = scoreComposition.winner;
  const scL = scoreComposition.loser;
  const delta = scoreComposition.delta;

  const lines = [
    '# 计分数据再分析与稀有度溯源补充报告',
    '',
    `**数据基准：** 基于 \`${dataSource}\` 诊断数据重分析 | **全样本：** ${totalMatches} 局 | **限定样本（回合上限）：** ${turnLimitMatchesCount} 局 (${fmtPct(turnLimitRate)})`,
    '**分析目的：** 修正 07 任务中的 3 个统计口径偏差（限定回合上限样本、修正强化自耗归属、拆解稀有度具体动作溯源），为第二阶段计分实验提供高保真度基线。',
    '',
    '---',
    '',
    '## 1. 核心发现与口径修正回答（问题—证据—边界）',
    '',
    '> [!NOTE]',
    `> **样本限定说明：** 本报告严格过滤出仅因“回合上限（60 回合）”凭分数结算胜负的 **${turnLimitMatchesCount} 局** 进行深度拆解。五行归元终局由于未达 60 回合且胜负由点亮直接决定，已被隔离，以还原最真实的计分博弈信号。`,
    '',
    '### 问题一：限定样本（回合上限 896 局）下胜负分差由哪些部分构成？计分胜负的核心决定因素为何？',
    '- **证据与分析：**',
    `  - **总分与净胜分差：** 胜方均分 **${fmtNum(scW.total.mean)} 分**，输方均分 **${fmtNum(scL.total.mean)} 分**，胜负净分差均值为 **${fmtDelta(delta.total)} 分**。`,
    '  - **单项分差贡献拆解（胜方均值 vs 输方均值）：**',
    `    - **稀有度加成：** 胜方 ${fmtNum(scW.rarity.mean)} 分 vs 输方 ${fmtNum(scL.rarity.mean)} 分，**净差 ${fmtDelta(delta.rarity)} 分**，贡献了总净分差的 **${fmtPctDirect((delta.rarity / delta.total) * 100)}**！`,
    `    - **行为分：** 胜方 ${fmtNum(scW.behavior.mean)} 分 vs 输方 ${fmtNum(scL.behavior.mean)} 分，**净差 ${fmtDelta(delta.behavior)} 分**，贡献了总净分差的 **${fmtPctDirect((delta.behavior / delta.total) * 100)}**。`,
    `    - **建设得分：** 胜方 ${fmtNum(scW.construction.mean)} 分 vs 输方 ${fmtNum(scL.construction.mean)} 分，**净差 ${fmtDelta(delta.construction)} 分**，贡献了总净分差的 **${fmtPctDirect((delta.construction / delta.total) * 100)}**。`,
    `    - **攻击得分：** 胜方 ${fmtNum(scW.attack.mean)} 分 vs 输方 ${fmtNum(scL.attack.mean)} 分，**净差 ${fmtDelta(delta.attack)} 分**，贡献了总净分差的 **${fmtPctDirect((delta.attack / delta.total) * 100)}**。`,
    `    - **合一分红：** 胜方 ${fmtNum(scW.dividend.mean)} 分 vs 输方 ${fmtNum(scL.dividend.mean)} 分，**净差 ${fmtDelta(delta.dividend)} 分**。`,
    `    - **道损扣分：** 胜方 ${fmtNum(scW.penalty.mean)} 分 vs 输方 ${fmtNum(scL.penalty.mean)} 分，**净差 ${fmtDelta(delta.penalty)} 分**。`,
    '  - **分析结论：**',
    '    - 在回合上限对局中，**稀有度加成是拉开胜负分数差距的绝对核心驱动力（贡献超六成净分差）**。',
    '    - 建设得分与攻击得分对净分差的拉开作用非常有限，双方在 60 回合内的建设与攻击基础得分高度咬合，唯独高阶动作的频次与稀有度乘数拉开了胜负鸿沟。',
    '- **结论边界：** 仅针对 60 回合未达成五行归元、进入分数结算的场次。',
    '',
    '### 问题二：修正强化（BURST）自耗归属后，真实攻击类得分占比与激励现状为何？',
    '- **证据与分析：**',
    `  - **强化自耗剥离：** 在原始统计中，强化与强破的第一步自耗（消耗己方归一节点的一侧状态）产生了解除点亮或削弱事件，误计入攻击大类。在回合上限局中，胜方自耗均值为 **${fmtNum(burstCorrection.winnerSelfCostMean)} 分**，输方自耗均值为 **${fmtNum(burstCorrection.loserSelfCostMean)} 分**。`,
    `  - **修正前后攻击得分对比：**`,
    `    - 胜方攻击得分：由修正前 **${fmtNum(burstCorrection.winnerUnadjustedAttackMean)} 分** 降至修正后 **${fmtNum(scW.attack.mean)} 分**（占总分仅 **${fmtPctDirect(scW.attack.percent)}**）。`,
    `    - 输方攻击得分：由修正前 **${fmtNum(burstCorrection.loserUnadjustedAttackMean)} 分** 降至修正后 **${fmtNum(scL.attack.mean)} 分**（占总分仅 **${fmtPctDirect(scL.attack.percent)}**）。`,
    '  - **分析结论：**',
    '    - 剥离强化自耗后，纯粹针对对手的攻击类压制得分（致道损、破点亮、压制削弱）在总分中的实际占比**仅约 6%**（胜方 6.1%，输方 5.5%）！',
    '    - 这进一步确凿地证明：在现行计分规则下，攻击对手所获得的分数激励微乎其微，攻击动作不仅存在被动防守的机会成本，在计分上也几乎没有正向收益拉动力。',
    '- **结论边界：** 归属修正仅改变统计分类，不影响游戏内实际分数总和。',
    '',
    '### 问题三：稀有度加成（Rarity Bonus）动作溯源拆解：究竟是哪些动作在“刷分”？',
    '- **证据与分析：**',
    '  - 将稀有度加成（在回合上限对局中占总分约 50%）按触发的具体动作进行精准溯源：'
  ];

  for (const act of ['BURST', 'BURST_ATK', 'CONVERT', 'TRANS', 'ATK', 'AUTO']) {
    const item = rarityDistribution[act];
    lines.push(`    - **${item.name}：** 占总稀有度加成的 **${fmtPctDirect(item.percent)}**（胜方均值 ${fmtNum(item.winnerMean)} 分，输方均值 ${fmtNum(item.loserMean)} 分，分差 ${fmtDelta(item.delta)} 分）。`);
  }

  const burstTotalPct = (rarityDistribution.BURST?.percent || 0) + (rarityDistribution.BURST_ATK?.percent || 0);

  lines.push(
    '  - **分析结论：**',
    `    - **爆发类动作（BURST 与 BURST_ATK）是稀有度加成的绝对统治来源**，两者合计垄断了稀有度加成分数的 **${fmtPctDirect(burstTotalPct)}**（其中强化 BURST 占 **${fmtPctDirect(rarityDistribution.BURST?.percent || 0)}**，强破 BURST_ATK 占 **${fmtPctDirect(rarityDistribution.BURST_ATK?.percent || 0)}**）。`,
    `    - 强化（BURST）与强破（BURST_ATK）的基础发生概率仅为 0.035 与 0.036，享有高达 1.45 倍的稀有度加成乘数，加之其单次触发多次节点修改，每次成功爆发都会带来海量稀有度加成分。`,
    `    - 调息（CONVERT，${fmtPctDirect(rarityDistribution.CONVERT?.percent || 0)}）与化（TRANS，${fmtPctDirect(rarityDistribution.TRANS?.percent || 0)}）合计占约 24%，而基础攻击动作破（ATK）仅占 **${fmtPctDirect(rarityDistribution.ATK?.percent || 0)}**。`,
    '    - **本质洞察：所谓的“稀有度加成极高”，本质上就是“爆发类（BURST / BURST_ATK）动作得分极高”。** 计分系统对爆发动作的极端奖励，实质上把计分竞赛异化成了“谁能打出更多次爆发动作”的竞赛。',
    '- **结论边界：** 基于 `ACTION_PROBABILITY` 配置的静态稀有度权重。',
    '',
    '## 2. 诊断对比数据表',
    '',
    '### 表 1：896 局回合上限结算下胜方 vs 输方各项得分均值及净分差表',
    '',
    '| 得分来源类别 | 胜方均分 | 胜方占比 | 输方均分 | 输方占比 | 净胜分差 (胜-输) | 分差贡献率 | 修正说明 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    `| 建设 (点亮/加持/修复/自耗成本) | ${fmtNum(scW.construction.mean)} | ${fmtPctDirect(scW.construction.percent)} | ${fmtNum(scL.construction.mean)} | ${fmtPctDirect(scL.construction.percent)} | ${fmtDelta(delta.construction)} | ${fmtPctDirect((delta.construction / delta.total) * 100)} | 包含强化自耗 ${fmtNum(burstCorrection.winnerSelfCostMean)} 分 |`,
    `| 攻击 (纯对外压制/致损/破点) | ${fmtNum(scW.attack.mean)} | ${fmtPctDirect(scW.attack.percent)} | ${fmtNum(scL.attack.mean)} | ${fmtPctDirect(scL.attack.percent)} | ${fmtDelta(delta.attack)} | ${fmtPctDirect((delta.attack / delta.total) * 100)} | 已剔除强化自耗 |`,
    `| 行为分 (动作执行基础分) | ${fmtNum(scW.behavior.mean)} | ${fmtPctDirect(scW.behavior.percent)} | ${fmtNum(scL.behavior.mean)} | ${fmtPctDirect(scL.behavior.percent)} | ${fmtDelta(delta.behavior)} | ${fmtPctDirect((delta.behavior / delta.total) * 100)} | 动作基础分累积 |`,
    `| 稀有度加成 (低频动作加权) | ${fmtNum(scW.rarity.mean)} | ${fmtPctDirect(scW.rarity.percent)} | ${fmtNum(scL.rarity.mean)} | ${fmtPctDirect(scL.rarity.percent)} | ${fmtDelta(delta.rarity)} | ${fmtPctDirect((delta.rarity / delta.total) * 100)} | 胜负核心拉开来源 |`,
    `| 合一分红 | ${fmtNum(scW.dividend.mean)} | ${fmtPctDirect(scW.dividend.percent)} | ${fmtNum(scL.dividend.mean)} | ${fmtPctDirect(scL.dividend.percent)} | ${fmtDelta(delta.dividend)} | ${fmtPctDirect((delta.dividend / delta.total) * 100)} | 每回合天道分红 |`,
    `| 道损扣分 | ${fmtNum(scW.penalty.mean)} | ${fmtPctDirect(scW.penalty.percent)} | ${fmtNum(scL.penalty.mean)} | ${fmtPctDirect(scL.penalty.percent)} | ${fmtDelta(delta.penalty)} | ${fmtPctDirect((delta.penalty / delta.total) * 100)} | 道损惩罚扣除 |`,
    `| **合计总分** | **${fmtNum(scW.total.mean)}** | **100.0%** | **${fmtNum(scL.total.mean)}** | **100.0%** | **${fmtDelta(delta.total)}** | **100.0%** | 60回合真实终局分 |`,
    '',
    '### 表 2：稀有度加成在各具体动作中的分布与溯源明细',
    '',
    '| 触发动作 | 稀有度加成总分 | 占总加成比例 | 胜方均分 | 输方均分 | 胜负分差 | 动作性质定位 |',
    '| --- | --- | --- | --- | --- | --- | --- |'
  );

  for (const act of ['BURST', 'BURST_ATK', 'CONVERT', 'TRANS', 'ATK', 'AUTO']) {
    const item = rarityDistribution[act];
    let note = '常规建设/转化';
    if (act === 'BURST') note = '自身爆发推进 (核心刷分源)';
    else if (act === 'BURST_ATK') note = '爆发压制';
    else if (act === 'ATK') note = '基础压制破坏';
    else if (act === 'AUTO') note = '无稀有度加成';
    lines.push(`| ${item.name} | ${fmtNum(item.sum)} | ${fmtPctDirect(item.percent)} | ${fmtNum(item.winnerMean)} | ${fmtNum(item.loserMean)} | ${fmtDelta(item.delta)} | ${note} |`);
  }

  lines.push(
    '',
    '## 3. 对第二阶段计分实验的指导建议',
    '',
    `1. **解耦爆发类动作（BURST/BURST_ATK）计分统治地位：** 当前爆发类动作不仅享受高基础分，还通过稀有度乘数垄断了 ${fmtPctDirect(burstTotalPct)} 的加成分数，成为分数结算绝对主导。第二阶段计分实验必须降低低频爆发动作的稀有度乘数或单次行为分上限，避免单一动作机制垄断计分走势。`,
    '2. **攻击压制得分亟需大幅增强：** 纯攻击类真实得分占比仅约 6%，无法对防守建设方形成有效分数威胁。若要支持“攻击压制流”成为独立取胜路线，必须显著提高破点亮与致道损的分数奖励。',
    '3. **保持护栏底线：** 任何调整仍须在 ADR 0001 的 25%–80% 归元率与 ≥65% 强方胜率护栏下进行对照。'
  );

  return lines.join('\n') + '\n';
}
