---
title: "里程碑 1 路线图：核心逻辑完全脱水与无头推演闭环 (Milestone 1.1 升级版)"
labels:
  - "wayfinder:map"
  - "ready-for-agent"
---

## Destination

在纯 Node.js / TypeScript 环境下达成 Layer 1 核心计算逻辑 100% 规则完备，建立确定性随机 (PRNG) 与零 GC 隐患的增量状态转换，重构纯 TS 策略 AI 并完成万局无头推演与平衡性/内存性能基线验证，固化视图事件契约并通过 Vitest 与 Stryker 突变测试验收，为后续 Cocos 接入与微信小游戏发布提供零腐化底层。

## Notes

- 遵循 AI-First 三层解耦架构规范（`docs/HLD.md`，`docs/adr/0003-ai-first-layered-skeleton.md`）。
- 绝不在 Layer 1（`src/core/`）引入任何 DOM/BOM/Cocos 运行时 API。
- 经过 Gemini 3.1 Pro 架构评审修订：强制引入确定性随机种子（PRNG）、增量不可变状态设计以避免 GC 抖动、明确回合生命周期流转、并引入轻量纯文本/ASCII 回放验证事件流。
- 保持 `npm run oxlint` 与 `npm run check:deps` 100% 绿色。
- 子任务由 `.scratch/` 下的各 Issue 承载，以任务名称标识。

## Decisions so far

<!-- the index: one line per closed ticket, enough to judge relevance, then zoom the link for the detail the ticket holds -->

- [T0: 确定性随机生成器 (PRNG) 与轻量对局日志契约](007-deterministic-prng-and-record.md): 基于 Mulberry32 实现可重现 PRNG，定义 GameRecord 动作回放格式，消除全局 Math.random() 依赖。
- [T1: 完备规则与合法动作候选生成器 (ActionCandidates) 及增量状态转换](004-action-candidates.md): 实现 ActionCandidates 纯函数全规则候选生成器，重构 ActionResolver 增量结构共享浅更新，降低 GC 压力。


## Not yet specified

<!-- see "Fog of war": in-scope fog you can't ticket yet; graduates as the frontier advances -->
- [T4: 万局无头批量推演基线与内存/耗时双指标诊断]: 依赖 T2 回合引擎与 T3 纯 TS AI 决策器就绪后，设定详细的自动化评估指标与基线对比参数。
- [T5: EventBus 表现层视图契约固化与 Stryker 突变体检]: 待 T1-T4 逻辑与推演完全稳定后，冻结向 Cocos 派发的具体颗粒事件规范，并做发布前突变测试体检。

## Out of scope

<!-- see "Out of scope": work ruled beyond the destination; closed, never graduates -->
- Cocos Creator 3.x 场景、Prefab 与 UI 视图节点绑定（属于里程碑 2）。
- 微信小游戏真机打包、音频与微信开放能力接口适配（属于里程碑 3）。
- Supabase / LocalPVP 云端网络联机对战（已归档至 legacy，MVP 定位纯单机）。
