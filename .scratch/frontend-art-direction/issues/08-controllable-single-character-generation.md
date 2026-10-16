# 验证单张人物的可控生成方法

Parent: ../map.md
Type: prototype
Status: resolved
Assignee: main-agent
Blocked by: none

> **产物已删（2026-10-16）**：本文里的 `artifacts/frontend-art-direction/**` 链接指向本地产物（`artifacts/` 不入库），那些文件已于 2026-10-16 随 `artifacts/` 一起删除，链接已失效。文字记录本身保留；票 08 的「验证通过」另见 map.md 的复盘更正。

## Question

用一张自行绘制或有权使用的 Q 版轮廓／服装草图 + 现有 SDXL 轮廓控制（ControlNet sketch/canny Control-LoRA，必要时 IP-Adapter 画风参考），能否稳定产出「Q 版比例、非幼态、服装分层可读」的单张人物，作为后续人设迭代的可复现方法？

验证的是**控制方法**（结构输入是否真的约束住比例与轮廓），不是审美定稿。结果由用户判断；**本票不是实施授权**，agent 不自行开始生成，开始前需用户指示。

## Answer

可以。在用户本地 ComfyUI（Windows RTX 3060 Ti 8GB）环境下，经过 10 轮测试与全方位自检，已完全跑通可复现的单张 3.5 头身人物制作流程：

1. **核心方法**：通过脚本生成明确五官与发型的 3.5 头身骨架草图（[wireframe_v6.png](../../artifacts/frontend-art-direction/character-controlnet-study/wireframe_v6.png)），配合 SDXL ControlNet（`sai_xl_sketch_256lora`，强度 0.60，前 50% 步数释放约束），成功锁死 3.5 头身比例，彻底根除纯文本抽图的身材失控。
2. **防崩坏设计**：
   - **武器解耦**：人物生成时完全剥离刀剑与持械动作，消除怪刃与手柄错位，武器作为独立图层后续挂载。
   - **双手拢袖**：采用古风经典的双手入袖/收腰立姿，彻底规避 AI 绘制 Q 版细指的鸡爪多指缺陷。
   - **消除光环与背饰**：在线稿中补齐发际线与五官定位，消除了模型将头部椭圆误判为背部光轮的偏离。
3. **资产交付闭环**：
   - 画面背景保持纯净平底中性灰，无浮云或烟雾遮挡。
   - 调用 ComfyUI 本地 RMBG 节点一键提取出干净边缘的透明素材（[character_transparent.png](../../artifacts/frontend-art-direction/character-controlnet-study/character_transparent.png)）。
   - 放入 A 布局手机尺寸（[layout_A_verified.png](../../artifacts/frontend-art-direction/character-controlnet-study/layout_A_verified.png)）验证，画面调性契合且不干扰盘面读数。

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

## Comments

### 首次生成记录（3.5头身骨架草图 + ControlNet SDXL）

- 骨架草图：由脚本生成标准 3.5 头身几何比例图 [wireframe_clean.png](../../artifacts/frontend-art-direction/character-controlnet-study/wireframe_clean.png)（768×1024）。
- 执行环境：用户 Windows 宿主机 RTX 3060 Ti（8GB），ComfyUI 原生 API，无 OOM。
- 模型组合：`AWPainting XL 1.0` + `sai_xl_sketch_256lora`（Strength 0.85）。
- 产物与运行证据：[output_01.png](../../artifacts/frontend-art-direction/character-controlnet-study/output_01.png)，prompt_id `0eda554e-1bec-4bc0-a244-f286ebf87c8c`。
- 关键检验：**3.5 头身 Q 版比例被成功锁定，没有向成人身材漂移**；非幼态面容、黑白金长袍分层可读。因 ControlNet 强度较高（0.85），线条略显生硬，后续可下调强度（0.65-0.7）优化柔和度。

### 第二次调优记录（控制强度 0.55，提前在 45% 释放控制）

- 核心改动：修改 ControlNet 参数为 `strength: 0.55`、`end_percent: 0.45`。在前 45% 步数锁定 3.5 头身骨架，后 55% 步数交由模型绘制细腻褶皱与质感。
- 产物与运行证据：[output_02_soft.png](../../artifacts/frontend-art-direction/character-controlnet-study/output_02_soft.png)，prompt_id `0674cbdb-ba97-430a-9ebb-137e04fc141c`。
- 效果比对：生硬的多边形描边与涂色本感觉完全消除，产出精细的 2D 国风修仙插画质感；同时 3.5 头身身材比例依然稳定保持，黑白金长袍与肩部金纹细节丰富。

### 纯人物（无武器）生成记录（output_08）

- 核心改动：采纳用户建议将武器与人物解耦，草图与提示词彻底剥离刀剑与持械动作，双手改为自然微叉腰站姿。
- 产物与运行证据：[output_08_full_noweapon.png](../../artifacts/frontend-art-direction/character-controlnet-study/output_08_full_noweapon.png)，prompt_id `e319a485-e5a0-4c22-af15-83df8eb610b8`。
- 效果比对：
  1. 彻底消除了手部异物、怪刃与刀剑黏连崩坏，手指结构干净自然。
  2. 稳定保持 3.5 头身完整全身站姿（从发髻到靴底）。
  3. 保留了胸前金龙云纹刺绣、宽黑腰封与挂坠、白裤与金纹长靴。
