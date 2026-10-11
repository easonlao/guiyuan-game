---
title: "技术规格书：实装 ADR 0002 双轨制计分与 2.5 倍攻击压制加成"
labels:
  - "completed"
---

## Problem Statement

在系统由旧版 Web 代码重构为纯 TypeScript AI-First 架构后，双轨制计分器被过度简化为仅具备几项微缩数值的占位实现。历史数值实验与决策（ADR 0002）中已被验证有效的关键机制未实际实装，包括：
1. 缺乏行为基础分（调息 CONVERT 50分、化 TRANS 30分、破 ATK 40分、爆发动作 80~100分）。
2. 缺乏根据破坏状态区分的 2.5 倍攻击状态得分（致道损 250~300分、破点亮 150~200分、削弱加持 200分）。
3. 爆发动作（BURST / BURST_ATK）未配置稀有度黑名单过滤，可能导致连环爆发刷分垄断。
4. 由于计分收益失真，AI 策略评估器无法体现攻击压制的战术价值，导致无头推演中先手（P1）胜率异常偏高（超 70%），背离了 ADR 0001 的平衡性护栏。

## Solution

在核心引擎（Layer 1）中全面恢复并严格实装 ADR 0002 规定的双轨制计分机制：
1. 重构并扩展计分配置与计分器，完整支持行为基础分、己方建设状态分、2.5 倍强化的敌方攻击压制状态分，以及爆发动作稀有度豁免。
2. 在动作解析执行过程中，完整结算行为分与状态变动分，并更新当前行动方总分。
3. 策略评估器消费准确的动作净得分，使 AI 能够准确识别进攻压制与自保防守的真实博弈价值。
4. 执行万局无头推演验证，确保先手胜率与归元率收敛并符合 ADR 0001 护栏规范。

## User Stories

1. As a player, I want to receive 50 behavior points when executing CONVERT (调息), so that my resource realignment has immediate score recognition.
2. As a player, I want to receive 30 behavior points when executing TRANS (化), so that generative energy flow rewards my progression.
3. As a player, I want to receive 40 behavior points when executing ATK (破), so that offensive pressure has guaranteed base value regardless of target level.
4. As a player, I want to receive 100 behavior points when executing BURST (强化), so that unlocking unified elemental power provides strategic rewards.
5. As a player, I want to receive 80 behavior points when executing BURST_ATK (强破), so that sacrificing unity for offense gives high-impact return.
6. As a player, I want to gain 100 points when lighting up a void node (0 -> 1), so that early-game board development is rewarded.
7. As a player, I want to gain 200 points when blessing an already lit node (1 -> 2), so that achieving deep elemental strength is recognized.
8. As a player, I want to gain 200 points when repairing damage (-1 -> 0), so that defensive stabilization is appropriately compensated.
9. As a player, I want to gain 250 points (Yin) or 300 points (Yang) when driving an opponent's node into damage (0 -> -1), so that inflicting critical disruption creates an offensive path to victory.
10. As a player, I want to gain 150 points (Yin) or 200 points (Yang) when breaking an opponent's lit node (1 -> 0), so that dismantling opponent unity progress yields substantial advantage.
11. As a player, I want to gain 200 points when weakening an opponent's blessed node (2 -> 1), so that neutralizing high-tier threats is lucrative.
12. As a player, I want rarity multiplier bonuses to apply to regular actions (CONVERT, TRANS, ATK) but be completely bypassed for BURST and BURST_ATK, so that burst actions cannot generate unchecked snowball scoring.
13. As a strategy AI, I want action evaluations to reflect the true score yields of attack suppression, so that I can dynamically choose between defensive Guiyuan rushing and offensive control.
14. As a game designer, I want 10,000 headless benchmark matches to stay within ADR 0001 guardrails (25%–80% Guiyuan finish rate, fair first-player win rate confidence intervals), so that match balance remains robust.

## Implementation Decisions

1. **配置常量化与严格类型定义**：
   - 将 ADR 0002 对应的计分常量（`POINTS_CONFIG`）形式化为强类型只读配置对象。
   - 包含 `ACTION`（行为分）、`STATE_CHANGE`（己方提升分与 2.5 倍放大的攻击压制分）、`RARITY_MULTIPLIER`（1.5x）、以及 `NO_RARITY_ACTIONS: ['BURST', 'BURST_ATK']`。

2. **双轨计分器职责收敛**：
   - 计分器提供纯函数方法，分别接收动作类型、节点变化前等级、变化后等级、极性以及是否为攻击行为，输出最终计算后的分值。
   - 对命中稀有度黑名单的动作跳过乘数加成，直接返回原始分值。

3. **动作解析器增量结算契约**：
   - 在解析动作时，不仅更新棋盘数据结构，同时根据变化的源/目标节点等级及极性，精准计算状态变化得分，并与动作行为基础分累加至行动方 `score`。

4. **AI 决策评估器无缝对接**：
   - 评估器利用真实动作解析所产出的 `scoreDelta`，结合各策略维度的权重进行综合打分，不需要维护第二套独立的计分逻辑。

## Testing Decisions

- **外部行为优先**：测试专注于 `ActionResolver.resolve` 抛出的 `scoreDelta` 与 `players.score`，不测内部辅助私有方法。
- **覆盖所有动作与状态跃迁**：
  - 测试用例覆盖 6 大动作的行为分。
  - 测试用例覆盖 6 大状态跃迁（修复道损、点亮、加持、致道损、破点亮、削弱加持）在阴阳两极下的具体分值。
  - 测试用例覆盖稀有度黑名单动作（`BURST` / `BURST_ATK`）不应用加成乘数，而普通动作应用加成乘数。
- **批量推演健康度检验**：运行 10,000 局无头推演脚本，采集平衡性指标与 GC 内存指标。

## Out of Scope

- 修改游戏核心回合流转规则或 60 回合终局上限。
- 修改五行相生相克拓扑或节点等级范围（-1 至 2）。
- Cocos Creator 视图层 UI 绑定与渲染特效。

## Further Notes

- 本规格书完全继承并严格落实 [docs/adr/0002-attack-buff-and-rarity-nerf.md](file:///home/easonlao/projects/guiyuan-game/docs/adr/0002-attack-buff-and-rarity-nerf.md) 与 [docs/adr/0001-unity-rate-guardrails.md](file:///home/easonlao/projects/guiyuan-game/docs/adr/0001-unity-rate-guardrails.md)。
