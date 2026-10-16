# 归元 2D 角色动画与雪碧图自动化制作工具链 (Sprite Pipeline)

本工具链为《归元》游戏量身定制，彻底打通 **参数化姿态线稿 ➔ ComfyUI SDXL + ControlNet ➔ 自动透贴抠像 ➔ 基准线锁定打包 ➔ 交互式动效检视** 的全自动化闭环。

---

## 1. 工具链核心能力

| 环节 | 模块 | 核心职责 |
| :--- | :--- | :--- |
| **姿态生成** | `pose_generator.py` | 基于 3.5 头身黄金 Q 版几何法则，参数化输出严格对齐的各动作线稿（`idle` 呼吸循环、`cast` 施法序列等） |
| **批处理生图** | `comfyui_runner.py` | 驱动宿主机 ComfyUI 原生 HTTP API，通过 SDXL + ControlNet Sketch + RMBG-1.4 单图全自动产出 100% 边缘纯净的透明 PNG 序列 |
| **对齐与打包** | `spritesheet_packer.py` | 扫描各帧脚底接触线（`footY`）与中轴线，进行绝对基准对齐并打包为雪碧图（Strip/Grid）及 JSON 元数据，导出透明循环 GIF |
| **动效检视** | `preview_generator.py` | 生成带播放控制、帧率调节、基准参考线的 HTML5 交互式播放器，并合成回微信小游戏 A 布局实际对局画布 |

---

## 2. 命令行调用 (CLI)

### 生成待机呼吸循环 (Idle, 4 帧)
```bash
no_proxy=10.10.10.70 python3 tools/sprite-pipeline/pipeline_cli.py --action idle --fps 6
```

### 生成施法动作序列 (Cast, 4 帧)
```bash
no_proxy=10.10.10.70 python3 tools/sprite-pipeline/pipeline_cli.py --action cast --fps 6
```

### 一键全量生成 (All)
```bash
no_proxy=10.10.10.70 python3 tools/sprite-pipeline/pipeline_cli.py --action all
```

### 仅重新对齐打包与生成检视器（跳过 GPU 生图）
```bash
python3 tools/sprite-pipeline/pipeline_cli.py --action idle --skip-gen --fps 8
```

---

## 3. 产物交付标准

运行完成后，素材统一保存在 `artifacts/frontend-art-direction/sprite-pipeline/<action>/`：
* `<action>_spritesheet.png`：透明 RGBA 雪碧图条带（单格 384×512，基准线锁定）
* `<action>_metadata.json`：包含每帧坐标、边界、`targetFootYInCell` 的帧契约
* `<action>_animation.gif`：直观查看循环动态的 GIF
* `<action>_viewer.html`：双击即可在浏览器中微调 FPS 与基准线的交互检视器
* `<action>_layout_A.png`：放入微信小游戏 390×844 棋盘实际界面的综合对齐图
