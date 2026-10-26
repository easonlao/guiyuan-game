# Spec: 修 check:gates 的位置分叉 (fix-gates-root)

## Problem Statement

`check:gates` 交付后第一次在**主 checkout** 上跑，打出的是：

```
check:gates: 注意——本次在 worktree 里跑，check-delivery 的断言④（worktree 数量）未受检；
```

它把自己判成了「在 worktree 里」。实测原因：

```
脚本算出的 root      = "/home/easonlao/projects/guiyuan-game/"   ← fileURLToPath 带末尾斜杠
git worktree list 首项 = "/home/easonlao/projects/guiyuan-game"
两者字符串相等 → false
```

## 修的过程中发现真正的问题是设计，不是那行比较

按「末尾斜杠」修好之后，在主 checkout 上重跑，`check-delivery` **反而红了**：

```
check:gates: check-delivery.mjs → 红
   删：git worktree remove <path>（脏的加 --force）
```

原因：断言④ 数 worktree 数量，而交付进行中本来就有 3 个（主 + spec + ticket）。修好之后主 checkout 不再传实际数量，于是拿默认值 1 去比，必然红。

所以**根因是「按位置分叉」这个设计**：同一条命令不该因在不在主 checkout 而报不同结果。两种位置都试一次就能看出来——分叉的两头都不对。

## 决定

1. **删掉位置分叉。** `check:gates` 不再判断自己在哪，行为统一。
2. **始终给 `check:delivery` 传实际 worktree 数量**，让断言①②③ 仍受检。
3. **断言④ 明确划出自检范围**：它是**状态**断言（收尾后应当只剩主 checkout），工作期间必然红，不是漂移信号。它由收尾的 `npm run check:delivery`（不带参数）真测——那是它该被跑的时刻。
4. 说明改成常驻输出，不说「本次在 worktree 里跑」——因为自检不再关心位置。

## 票据

| 票 | 内容 | 切片 | 状态 |
|---|---|---|---|
| 01 | 删位置分叉 + 两种位置各跑一次取证 | S1 | resolved |

切片依赖：S1 独立。无环。

## Out of Scope

- 让 `check:gates` 也测断言④。它是状态断言，测它的地方是收尾的 `check:delivery`。