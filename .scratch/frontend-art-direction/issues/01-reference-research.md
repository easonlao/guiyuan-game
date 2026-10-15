# 收集清晰且有修炼氛围的画面参考

Parent: ../map.md
Type: research
Label: wayfinder:research
Status: resolved
Assignee: agent-reference-research
Blocked by: none

## Question

哪些可从官方来源直接查看的游戏画面，适合帮助用户比较「清楚为主、修炼氛围为辅」的视觉方向？挑选少量差异明确的参考，说明各自可借鉴的布局、背景、按钮与角色呈现，以及不可直接套用之处。不替用户选择风格，不将参考图当作可复用资产。

## Context

研究产物：../research/visual-references.md。研究分支：research/frontend-art-references；若工作区无法安全切换或工具不支持分支，保持只新增研究文件并注明未建分支。

## Answer

已完成[画面参考研究](../research/visual-references.md)：用 Exa 查找官方 Steam 商品页，从 Steam 商品数据取得截图并实际打开核验。提供《弈仙牌》《Slay the Spire》《Inkulinati 神笔谈兵》三个差异明确的参考，逐项说明布局、背景、按钮与角色；区分可见事实、研究建议和未验证的交互行为。

研究文件包含官方页面、原图链接和内嵌外链预览。参考不等于授权复用资产；本票不替用户决定风格，不读游戏代码，不实施改版，也不修改 02/03。下一步请用户比较背景明暗与细节、角色复杂度、按钮及分区，再做当前游戏的粗略改版图。

隔离保存：已在 `/tmp/guiyuan-frontend-art-references` 创建独立 worktree 和 `research/frontend-art-references` 分支；未切换主线程分支。研究文件已写入该 worktree 并同步到主工作区，但后续向 worktree 同步票据/map 并提交的操作被权限工具拒绝，未重试，**分支尚无研究提交**。完整交付以主工作区的研究文件、本票和 map 指针为准；独立 worktree 的票据/map 仍为研究前副本。

验证：已核对引用图片与 Steam 商品数据中的截图地址一致，已打开引用图片，三个文件中的 Markdown 相对链接均存在。未运行游戏测试，因为没有代码变更。仅更改本研究文件、本票和 map，未改 02/03。
