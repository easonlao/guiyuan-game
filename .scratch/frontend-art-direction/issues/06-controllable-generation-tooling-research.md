# 可控角色生成工具与工作流的外部调研

Parent: ../map.md
Type: research
Label: wayfinder:research
Status: resolved
Blocked by: none

## Question

在用户现有 ComfyUI（Windows、RTX 3060 Ti 8GB）环境下，哪些可获得的开源项目或工作流支持「可控单张人物生成」——轮廓／参考图控制、局部修改——值得优先验证；哪些明确不应现在做？

## Answer

已完成外部调研，报告：[comfyui-character-projects.md](../research/comfyui-character-projects.md)（证据，不是定义；调研日期 2026-10-15，对用户服务只读了 `/system_stats` 与 `/object_info`）。

- 核心结论：值得换的是控制方法，不是再找一个自动抽图工具。优先验证「一张自行绘制或有权使用的 Q 版轮廓草稿 + 现有 SDXL 轮廓控制（ControlNet sketch/canny Control-LoRA），必要时加 IP-Adapter 画风参考，局部修手和剑」；候选工作流与证据等级（sepro 的 SDXL 控制工作流、cubiq 的 IPAdapter 示例、Acly/Krita 画布内设计、dseditor 线稿上色图等）见报告正文。
- 用户环境已注册 `LoadImage`、`ControlNetLoader`／`ControlNetApplyAdvanced`、`IPAdapter*` 与 SDXL sketch/canny Control-LoRA 等节点；未核验项（如 MistoLine 精确节点、权重配对、峰值显存）在报告内逐项标注。
- 明确「暂不做」：新 MCP 安装、角色 LoRA 训练、Flux/Qwen/Wan 迁移、动画、图集、抠图——它们没有先解决单张设计。
- 8GB 显存能否承受最终组合尚未实测；模型授权独立于本项目，未核验。
- 报告称未生成、未安装、未下载模型、未改代码／票／map；未完整观看作者视频，未逐像素审查原大图。

方法验证的下一步独立为[票 08](08-controllable-single-character-generation.md)；结果由用户判断。
