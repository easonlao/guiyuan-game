# 01: 删掉 check:gates 的位置分叉，两种位置取证

**Type:** task
**Blocked by:** None
**Status:** resolved
**Slice:** S1

**What to build:** 删掉 `check:gates` 里「在不在主 checkout」的分叉，改成行为统一；两种位置各跑一次留证据。

## 改法

| 项 | 改前 | 改后 |
|---|---|---|
| 位置判断 | `worktreeList[0] === root`（永远不等，`root` 带末尾斜杠） | **删掉** |
| 传给 `check-delivery` 的 `--worktrees` | 只在「非主 checkout」时传实际数量 | **始终**传实际数量 |
| 说明文字 | 「本次在 worktree 里跑，④未受检」 | 常驻说明：④ 是状态断言，工作期间必然红，由收尾的 `check:delivery` 不带参数真测 |

## 验收清单

- [x] `inMainCheckout` 从脚本里彻底消失（`grep -c inMainCheckout` = 0）
- [x] **worktree 位置**跑一次：8 个门禁全绿 + 常驻说明，退出 0
- [x] **主 checkout 位置**跑一次：输出与上一行**完全一致**，退出 0（证明不再按位置分叉）
- [x] `npm run check:delivery`（不带参数）在收尾时仍真测断言④
- [x] `npm run verify` 全绿
- [x] `CONTRIBUTING.md` §6.6 补一句：④ 是状态断言，不在自检范围

## 证据（两种位置的实际输出）

**worktree 位置**（在 `ticket/fix-gates-root/01` 的 worktree 里跑）：

```
check:gates: check-worktrees.mjs → 绿
check:gates: 说明——check-delivery 的断言④（worktree 数量）是状态断言，工作期间必然红，
    所以自检按实际数量传参、不在自检范围内；它由收尾的 npm run check:delivery（不带参数）真测。
check:gates: 8 个门禁在当前状态下全部是绿的。
exit=0
```

**主 checkout 位置**（把这个脚本临时拷进主 checkout 跑一次，跑完 `git checkout --` 还原；主 checkout 的工作区未留在改动状态）：

```
check:gates: check-worktrees.mjs → 绿
check:gates: 说明——check-delivery 的断言④（worktree 数量）是状态断言，工作期间必然红，
    所以自检按实际数量传参、不在自检范围内；它由收尾的 npm run check:delivery（不带参数）真测。
check:gates: 8 个门禁在当前状态下全部是绿的。
exit=0
```

两段逐行一致——位置不再影响结果。

## Answer

已落地（2026-10-25）。走 §6 流程；spec、票、改动合成一个交付提交。

**这票的教训比修复本身重要**：一开始我按「末尾斜杠导致路径比较失败」去修，修完发现主 checkout 里反而红了——**因为那个分叉本身就不该存在**。是「两种位置各跑一次」这个要求把这一点逼出来的；如果只修斜杠、只在 worktree 里验一遍，就会交付一个「主 checkout 里恒红」的门禁，正是本票要防的那类毛病。

**留下的判据**：同一个命令不该因运行位置不同而报不同结果。如果非要有差异，那差异该写成显式参数，不该藏在一个位置判断里。

**没做的**：让自检测断言④。它是状态断言，测它的地方是收尾那次不带参数的 `check:delivery`。