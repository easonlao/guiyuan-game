# 验证单张人物的可控生成方法

Parent: ../map.md
Type: prototype
Label: wayfinder:prototype
Blocked by: none

## Question

用一张自行绘制或有权使用的 Q 版轮廓／服装草图 + 现有 SDXL 轮廓控制（ControlNet sketch/canny Control-LoRA，必要时 IP-Adapter 画风参考），能否稳定产出「Q 版比例、非幼态、服装分层可读」的单张人物，作为后续人设迭代的可复现方法？

验证的是**控制方法**（结构输入是否真的约束住比例与轮廓），不是审美定稿。结果由用户判断；**本票不是实施授权**，agent 不自行开始生成，开始前需用户指示。

## 范围

- 输入：自绘或有权使用的 Q 版轮廓草稿。既有参考（本地证据，不入库）：`artifacts/frontend-art-direction/character-redesign/`（原图、预览、prompt 与 workflow）、`artifacts/frontend-art-direction/character-style-refinement/`（旧版／画风试验对照）。参考图只作对照，不上传、不照搬。
- 控制手段：只用现有环境已注册的 `LoadImage` / `ControlNetLoader` / `ControlNetApplyAdvanced` / `IPAdapter*` 与 SDXL sketch/canny Control-LoRA（只读观察见[票 06](06-controllable-generation-tooling-research.md)）；不安装新软件、不训练 LoRA、不迁移 Flux/Qwen/Wan。
- 产出：少量「草稿 + 输出」并排对照，不做图集、不做动画、不接入游戏、不替换正式资产。
- 验收关注：Q 版头身比是否被草稿固定、轮廓与服装分层是否可辨、画风是否接近用户已认可的方向；不做「像不像参考角色」评分，不替用户判定。
- 8GB 显存的实际组合未实测（调研 06 的未验证项）；若失败，如实记录失败阶段，不补抽掩盖。

## Context

- 方法候选与证据等级见[票 06](06-controllable-generation-tooling-research.md) 与报告 `../research/comfyui-character-projects.md`。
- 本票只回答「方法是否可用」；角色造型定稿与最终审美验收仍归[票 04](04-first-art-batch.md) 与用户。
- 与活动票 [07](07-wechat-atlas-and-layout-acceptance.md) 无依赖：07 是产物验收，本票是制作方法验证。
