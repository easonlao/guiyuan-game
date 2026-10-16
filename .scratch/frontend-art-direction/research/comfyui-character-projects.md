# ComfyUI 游戏角色项目研究：先解决单张设计，再谈精灵动画

获取日期：2026-10-15。本文是研究证据与建议，不是已验收工作流、人物定稿或实施授权。

## 结论先说

**值得换的是控制方法，而不是再找一个自动抽图 skill。** 本轮找到 8 个相关项目，涵盖调用工具、参考图/草图控制、完整工作流和后置动画；但没有核验到一套同时满足「精致国风、非幼态 Q 版、黑白金分层长袍、3060 Ti 8GB」且能原样直接复现的现成方案。

优先建议验证：**一张自行绘制或有权使用的 Q 版轮廓/服装草图 → 同架构 SDXL 轮廓控制 → 必要时加 IP-Adapter 画风参考 → 局部修改手和剑**。先借用下文 sepro 的完整控制工作流和 cubiq 的参考图工作流；如需要直接在画布上修改，Acly/Krita 是更完整的设计工具。它们比纯文生图多了可见的结构输入和局部修改入口，但不会替我们完成原创服装设计。

- **最小新增软件路线**：参考 sepro 的 `dual_controlnet_basic.json`，后续在获准时适配成单个轮廓控制分支，使用现有 SDXL Control-LoRA；画风仍漂移时，再参考 cubiq 的 SDXL style/composition 示例。不是原样照搬双控制，也不是拼到 Z-Image 上。8GB 能否承受最终组合尚未实测。
- **最贴近人工角色设计路线**：Acly/Krita 的草图、图层、选区、参考图和局部重绘。Windows 支持有作者依据；作者的「推荐至少 6GB」不是本目标组合在 8GB 的性能保证。
- **可研究的完整二维线稿上色图**：dseditor 的 `SDXL/LineArtColor.json`。实际有 Nova Anime XL–IL、MistoLine、线稿预处理和完整采样链；但含平台模型 ID、外部图片地址及额外节点，不能称为下载即跑。
- **暂不做**：新 MCP 安装、角色 LoRA 训练、Flux/Qwen/Wan 大组合迁移、动画、图集、抠图。它们没有先解决本轮最缺的单张设计。

## 1. 范围与证据等级

### 本轮问题

目标来自本轮用户简报：原创中文修仙二维人物；大头小身但不是儿童教育卡通；精致头发、衣料和柔和光影；黑白金长袍有领肩、腰袖、内外下摆层次；神态洒脱。动画和图集后置。

已有失败只说明**此前的具体输出与纯文字工作流未满足目标**，不能据此认定 Z-Image 模型根本不行。本地 `artifacts/frontend-art-direction/character-redesign/run-record.md:7,37,54–66` 和 `workflow-api.json:1–130` 显示：实际是 Z-Image Turbo、空 latent、文字条件、denoise=1；没有 LoadImage、IP-Adapter 或姿态/轮廓控制。参考图仅被本地观察，并未作为图像条件进入生成。这些报告是证据，不是定义。

### 本次做了什么、没做什么

- 用 Exa 发现项目；发现内容不直接当成核验结论。先 discover searchcode 工具 schema，再读取公开仓库 README、工作流及实现。
- 补用 GitHub API、raw、提交页面和 Atom 获取一手数据。部分 GitHub API 请求被匿名限流；缺证据的字段标为 unknown，不以推测填补。
- 实际打开作者公开截图/示例：cubiq 的示例图、Acly 的姿态与区域画图截图、sepro 的控制对比图、mor-o 的 idle 图集、MistoLine 的草图渲染对比。MistoLine 对比图为本地缩小预览；没有逐像素审查原大图。
- 作者视频链接列在对应项目下；**没有完整观看视频**，不能把视频标题当成画质验证。
- 对用户服务只 GET `/system_stats`、`/object_info`，只提取版本、相关节点与模型选项。没有读取用户图片、完整历史、输出目录或其他人的作业。
- 没有生成、安装、下载模型、clone 仓库、改服务器、改代码/票/map，也没有上传参考图。公开示例的临时副本只在 `/tmp/guiyuan-comfy-research/`；唯一报告为本文。

证据用词：**核验**＝读到了文件/实现或打开了示例；**作者声称**＝作者的效果/性能主张；**建议/推测**＝本研究的选择，不是运行结果。仓库有 JSON，不等于图片已能在用户环境复现。

## 2. 现有 skill 是否已经能做

| 本地 skill | 核验结果 | 本轮用途 |
|---|---|---|
| `.agents/skills/sprite-sheet/SKILL.md` | 描述明确排除单张插图；正文说核心不是画，而是交付前约束、抠图、切帧和验收。其「不能选模型/不能指定像素尺寸」是该技能所假定后端的限制，不是 ComfyUI 限制。 | 可借用验收纪律，不适合作为本轮角色设计后端，也不能靠切图修复设计。依据：`:3,10,29–31`。 |
| `.agents/skills/sprite-gen/SKILL.md` 与 `docs/user-workflow.md` | 主图像交互流程是 GPT/Grok；另有明确命名的 OpenAI API、Claude 像素网格等路线，但不是 ComfyUI。全目录按 `ComfyUI/comfyui/comfy` 检索未找到支持文档。 | 没有核验到现成 ComfyUI provider/workflow；不能称「已经支持」。单独图像编辑能力不等于能调用户的局域网 ComfyUI。依据：`SKILL.md` Execution routes，`docs/user-workflow.md:5–14`。 |
| sprite-gen 的图集流程 | `docs/atlas-workflow.md:5–7` 明确要求先有用户认可的完整静态底图，再做动作。 | 此阶段仍缺认可的底图；后置工具不应提前。 |

结论：不需要重复找另一个切图 skill。需要的是**经过兼容核验的结构/画风控制工作流，以及合格的设计输入**。

## 3. 用户环境：已经具备什么

2026-10-15 对 `http://10.10.10.70:8188/system_stats` 和 `/object_info` 的只读观察：

- 版本仍为 **0.37.0**。本轮不展示系统完整信息。Windows、RTX 3060 Ti 8GB、RAM 32GB 是用户给定约束，不把它们当成性能测量。
- 注册了 `LoadImage`、`VAEEncode`、`ControlNetLoader`、`ControlNetApplyAdvanced`、`IPAdapterModelLoader`、`IPAdapterUnifiedLoader`、`IPAdapterAdvanced`、`IPAdapterStyleComposition`；也有 lineart、DWPose 相关预处理节点。
- 模型选项中可见 `SDXL\sai_xl_canny_256lora.safetensors`、`SDXL\sai_xl_sketch_256lora.safetensors`、`SDXL\sai_xl_depth_256lora.safetensors` 等；IP-Adapter 选项含 `ip-adapter-plus_sdxl_vit-h.safetensors`、`ip-adapter_sdxl_vit-h.safetensors`，CLIP Vision 有若干 ViT-H 命名文件。
- 有 SDXL 动漫、Illustrious、NoobAI 命名的 checkpoint 选项。**名称存在不证明文件内容、预测类型、授权或特定控制模型的效果兼容**，更不证明显存够用。
- 没看到名为 MistoLine 的 ControlNet 选项；官方 MistoLine JSON 使用的精确节点名 `AnyLinePreprocessor` 也未注册。其他类似名称不等于可直接替换。
- Unified Loader 按文件命名规则自动匹配模型；现有 `clip_vision_h` 等别名是否命中其规则未验证。可手动 Loader 的存在也不代表已实测配对成功。

`/tmp/guiyuan-comfy-nodes.json`、`/tmp/guiyuan-comfy-stats.json` 旧快照仍在。上面所述关键字段已用本轮 GET 重新确认；没有把旧快照当作当前安装证明。

**因此第一步不必先安装一整套新东西。** 已有节点看起来足够研究一个小型 SDXL 控制图；具体权重配对、加载、峰值显存和画质仍未验证。

## 4. 候选总览与维护状态

日期为默认分支最后提交的 committer 日期，统一按 UTC 日期列示；不是发行版兼容保证。没有用 star 排名，也没有把「未归档」等同于积极维护。

| 项目 / 层级 | 最后提交（可追溯） | 状态 | 本轮判断 |
|---|---|---|---|
| [ai-game-making-lab/comfyui-mcp](https://github.com/ai-game-making-lab/comfyui-mcp) / 调用编排 | [2026-05-12 · 0877bc7](https://github.com/ai-game-making-lab/comfyui-mcp/commit/0877bc70150d360fa6e1f56d2d74bf122ca08b20) | API：未归档 | 可学调用与工作流管理，不是画质方案。 |
| [tuannguyen14/ComfyAI-MCP-GameAssets](https://github.com/tuannguyen14/ComfyAI-MCP-GameAssets) / 游戏素材 API | [2025-12-22 · 6d8c593](https://github.com/tuannguyen14/ComfyAI-MCP-GameAssets/commit/6d8c593004f654782d2562473e023f9fa9e0fb72) | API：未归档 | 游戏命名很贴题，但实际角色分支仍主要是提示词/普通图生图。 |
| [Acly/krita-ai-diffusion](https://github.com/Acly/krita-ai-diffusion) / 交互设计 | [2026-10-03 · 828b70c](https://github.com/Acly/krita-ai-diffusion/commit/828b70c33c5c97f326e03170cd693beef798231e) | API：未归档，近期有提交 | 设计控制最完整；引入 Krita 和配套节点有成本。 |
| [cubiq/ComfyUI_IPAdapter_plus](https://github.com/cubiq/ComfyUI_IPAdapter_plus) / 参考图 | [2025-04-14 · a0f451a](https://github.com/cubiq/ComfyUI_IPAdapter_plus/commit/a0f451a5113cf9becb0847b92884cb10cbdec0ef) | API：未归档；作者明确 maintenance only | 推荐参考其具体 SDXL 示例，不当成持续活跃项目。 |
| [TheMistoAI/MistoLine](https://github.com/TheMistoAI/MistoLine) / 线稿控制 | [2026-01-06 · c3caab1](https://github.com/TheMistoAI/MistoLine/commit/c3caab172f3539f27564536a00b9c021eb341f34) | 最后提交为 README；页面未见归档提示，API 状态 unknown | 有完整官方工作流；值得研究，当前环境缺对应权重/精确节点。 |
| [dseditor/ComfyuiWorkflows](https://github.com/dseditor/ComfyuiWorkflows) / 完整工作流集合 | [2026-08-17 · b2ea26f](https://github.com/dseditor/ComfyuiWorkflows/commit/b2ea26fa602d6eebadb1de1e4ccf1ecc91875806) | API：未归档 | 找到二维线稿上色图；不同文件有不同年代和架构，必须逐图检查。 |
| [sepro/SDXL-ComfyUI-workflows](https://github.com/sepro/SDXL-ComfyUI-workflows) / 完整控制工作流 | [2024-04-11 · 72a5574](https://github.com/sepro/SDXL-ComfyUI-workflows/commit/72a557473e19e57c8821b16cfa8600128eb846a0) | API：未归档，但工作流较旧 | 结构清楚、依赖相对少，适合小图试验；不是目标国风样例。 |
| [mor-o/comfyui-2d-character-pipeline](https://github.com/mor-o/comfyui-2d-character-pipeline) / 后置动画 | [2026-06-20 · 9fee239](https://github.com/mor-o/comfyui-2d-character-pipeline/commit/9fee239216b8fb5a841401644a4ef629496e563c) | 页面未见归档提示，API 状态 unknown；文档有 WIP 描述 | 真有工作流与样例，但作者以 24GB 为目标，不推荐当前机器照搬。 |

API 查询成功的六个项目（两个 MCP、Acly、cubiq、dseditor、sepro）的状态字段来源为各仓库 `https://api.github.com/repos/<owner>/<repo>`；提交日期来源为 `/commits?per_page=1`。MistoLine 日期补用[作者仓库 Atom](https://github.com/TheMistoAI/MistoLine/commits/main.atom)，mor-o 用上述提交页的 `committedDate`。本轮没有确认任何候选处于 GitHub archived 状态；特别不要误把 cubiq 的 maintenance only 写成 archived。

## 5. 逐项核验

### 5.1 ai-game-making-lab/comfyui-mcp：解决代理操作，不解决人设画质

- **README 与实现**：[README](https://github.com/ai-game-making-lab/comfyui-mcp/blob/0877bc70150d360fa6e1f56d2d74bf122ca08b20/README.md#claude-code-plugin)；[workflow-composer.ts](https://github.com/ai-game-making-lab/comfyui-mcp/blob/0877bc70150d360fa6e1f56d2d74bf122ca08b20/src/services/workflow-composer.ts#L45-L163)。实际提供 txt2img/img2img 模板、工作流修改、提交/查询等；图生图模板确有 LoadImage → VAEEncode → KSampler。
- **作者声称 / 核验区别**：README 有模型兼容知识 skill 和 Windows 支持声明；读到模板不代表其知识表的所有数值都经过本轮核验。没有看到针对本目标的可复现角色设计示例；README 的用法示例不是角色效果对比。
- **依赖与资源**：[package.json](https://github.com/ai-game-making-lab/comfyui-mcp/blob/0877bc70150d360fa6e1f56d2d74bf122ca08b20/package.json#L24-L58) 要 Node ≥22，含原生依赖 better-sqlite3。GPU 负担主要取决于被提交的 ComfyUI 图；没有此 MCP 在 3060 Ti 上完成目标设计的证据。
- **许可证**：package.json 声明 MIT，但请求根 LICENSE 未找到，GitHub API license=null。准确口径是「MIT 声明可见、完整许可文本未核实」，不是许可毫无疑问。模型授权独立；目标角色示例资产未发现。
- **建议**：不优先安装。已有 HTTP 客户端能执行有界单次任务，不必为了 MCP 再扩大软件面。README 会引导自动找/下载模型，也提供安装、重启、清显存等工具；不能给代理无界授权。包元数据指向 artokun 上游，不应把本仓库与任意同名 npm 包直接等同。

### 5.2 ComfyAI-MCP-GameAssets：看似最贴题，但「高质量」不是控制证据

- **README 与实现**：[README](https://github.com/tuannguyen14/ComfyAI-MCP-GameAssets/blob/6d8c593004f654782d2562473e023f9fa9e0fb72/README.md)；[character preset](https://github.com/tuannguyen14/ComfyAI-MCP-GameAssets/blob/6d8c593004f654782d2562473e023f9fa9e0fb72/server/presets.py#L93-L105)；[img2img 图构造](https://github.com/tuannguyen14/ComfyAI-MCP-GameAssets/blob/6d8c593004f654782d2562473e023f9fa9e0fb72/server/backends/comfyui.py#L435-L528)。角色 preset 实质是提示词、尺寸和采样参数。动画一致性分支是普通图生图；另有独立 ControlNet 图构造函数，不等于角色 preset 默认就有服装/姿态锁定。
- **实际示例**：README 声称 production-quality、high-quality、consistent animations。检查文件树未发现配套角色输出画廊；主要是测试脚本，不能把它们当成通过测试或画质示例。
- **依赖/Windows/8GB**：Python ≥3.10、ComfyUI、SDXL/SD1.5 checkpoint；视角工具另需 depth ControlNet。README 有 Windows venv 和 Unity 路径写法，属于使用说明，不是本机测试证据。没有 8GB 峰值或耗时证明。
- **许可证**：README 声明 MIT；根 LICENSE 未找到、API license=null，完整许可文本 unknown。checkpoint/ControlNet 权重另核授权；无目标例图可核资产许可。
- **建议**：不作为主方案。它适合封装生产步骤，不会因为函数叫 `generate_character` 就保住大头比例、长袍分层和手剑关系。代码还以文件名关键词猜 SDXL/SD1.5（[实现](https://github.com/tuannguyen14/ComfyAI-MCP-GameAssets/blob/6d8c593004f654782d2562473e023f9fa9e0fb72/server/backends/comfyui.py#L14-L85)），不能用该判断证明模型兼容，更不能接入 Z-Image 假装通用。

### 5.3 Acly/krita-ai-diffusion：最值得借鉴的角色设计过程

- **README 与实现**：[README](https://github.com/Acly/krita-ai-diffusion/blob/828b70c33c5c97f326e03170cd693beef798231e/README.md#features)；[apply_control / apply_ip_adapter](https://github.com/Acly/krita-ai-diffusion/blob/828b70c33c5c97f326e03170cd693beef798231e/ai_diffusion/backend/workflow.py#L605-L780)。实现按架构分派控制：SD1.5/SDXL-like 的 IP-Adapter 与 Anima、Z-Image 等走不同分支。README 同时列出多个模型家族，**不代表每个家族支持同一套控制节点**。
- **解决问题**：在画布上画出大头小身和衣摆轮廓，用选区只改领肩、手、剑；用图层给区域不同描述。它不是「更会抽图」，而是允许设计者保留已满意区域、明确修改不满意区域。
- **示例与局限**：已看 [区域绘画截图](https://github.com/Acly/krita-ai-diffusion/blob/828b70c33c5c97f326e03170cd693beef798231e/media/screenshot-regions.png)，有二维动漫人物及草画→局部生成；已看 [姿态截图](https://github.com/Acly/krita-ai-diffusion/blob/828b70c33c5c97f326e03170cd693beef798231e/media/screenshot-5.png)，是正常成人比例的击剑人物，不是国风 Q 版。作者视频：[区域绘画](https://youtu.be/PPxOE9YH57E)、[姿态控制](https://youtu.be/-QDPEcVmdLI)，本轮未完整观看。
- **依赖**：Krita ≥5.2，ComfyUI；手动连接现有服务还需作者列出的 aux、IP-Adapter、inpaint、tooling 节点及配套模型。见[官方连接文档](https://github.com/Acly/krita-ai-diffusion/blob/828b70c33c5c97f326e03170cd693beef798231e/docs/src/content/docs/comfyui-setup.mdx#L8-L49)。可用现有/远端服务，但不能假定现在所有必要项都已安装。
- **Windows / 8GB**：README 明确支持 Windows/CUDA，推荐 NVIDIA 至少 6GB。这是一般性硬件说明；8GB 上同时开 SDXL、多个控制图层、IP-Adapter 的峰值和速度 unknown。
- **许可证**：[代码 GPL-3.0](https://github.com/Acly/krita-ai-diffusion/blob/828b70c33c5c97f326e03170cd693beef798231e/LICENSE)。各模型另核；未找到上述截图中角色资产的单独复用授权，不能直接拿来做游戏角色。
- **推荐条件**：愿意画草图/改图时优先。需要补工具与手工设计输入；本轮不安装，也不运行它的批量下载脚本。

### 5.4 cubiq/ComfyUI_IPAdapter_plus：给「画风参考」真正的输入通道

- **README 与具体工作流**：[README](https://github.com/cubiq/ComfyUI_IPAdapter_plus/blob/a0f451a5113cf9becb0847b92884cb10cbdec0ef/README.md#example-workflows)；[ipadapter_style_composition.json](https://github.com/cubiq/ComfyUI_IPAdapter_plus/blob/a0f451a5113cf9becb0847b92884cb10cbdec0ef/examples/ipadapter_style_composition.json)；[实现](https://github.com/cubiq/ComfyUI_IPAdapter_plus/blob/a0f451a5113cf9becb0847b92884cb10cbdec0ef/IPAdapterPlus.py)。实际图为 SDXL AlbedoBaseXL、两个 LoadImage、UnifiedLoader、StyleComposition、KSampler、VAE、SaveImage，不只是节点清单。
- **样例边界**：上述 style/composition JSON 自带的是汽车和波纹风格文件名，不是修仙角色。已打开 [demo_workflow.jpg](https://github.com/cubiq/ComfyUI_IPAdapter_plus/blob/a0f451a5113cf9becb0847b92884cb10cbdec0ef/examples/demo_workflow.jpg)，有盔甲女性参考、插画脸参考和插画人物输出；截图所用的是 SD1.5 realisticVision，不应拿它冒充 SDXL 目标效果证据。作者[风格/构图演示](https://www.youtube.com/watch?v=czcgJnoDVd4)未完整观看。
- **依赖/兼容**：SDXL 路线用相应 SDXL IP-Adapter 与匹配 CLIP Vision；可优先研究 ViT-H，而非误配 bigG。原作者[模型卡](https://huggingface.co/h94/IP-Adapter/blob/main/README.md)分开列 SD1.5/SDXL 权重。[README](https://github.com/cubiq/ComfyUI_IPAdapter_plus/blob/a0f451a5113cf9becb0847b92884cb10cbdec0ef/README.md#installation)还说明 FaceID 要 insightface，多数需配对 LoRA。本轮没有必要为二维画风参考引入 FaceID。
- **Windows / 8GB**：用户服务已注册相关节点，且有 SDXL adapter 模型选项；这只证明当前环境有入口。没有本组合 8GB 实测。ViT-H 比 bigG 参数更少有模型卡依据，但不能据参数/文件大小推算完整峰值显存。
- **许可证**：[代码 GPL-3.0](https://github.com/cubiq/ComfyUI_IPAdapter_plus/blob/a0f451a5113cf9becb0847b92884cb10cbdec0ef/LICENSE)。权重、底模和示例参考图许可独立，本轮没有逐项确立商用授权；不能继承代码许可替它们授权。
- **推荐/限制**：推荐作为草图控制之外的弱画风引导，减少「只看过参考却没把参考送入模型」的问题。它不能准确保证衣领结构、手握剑柄或原创性；参考也可能带入脸、配色、构图。维护仅保养，不应承诺新版本兼容。

### 5.5 TheMistoAI/MistoLine：完整官方轮廓控制图，但不是现成国风角色包

- **README 与工作流**：[README](https://github.com/TheMistoAI/MistoLine/blob/c3caab172f3539f27564536a00b9c021eb341f34/README.md#comfyui-usage)；[Anyline+MistoLine_ComfyUI_workflow.json](https://github.com/TheMistoAI/MistoLine/blob/c3caab172f3539f27564536a00b9c021eb341f34/Anyline%2BMistoLine_ComfyUI_workflow.json)。核验到 LoadImage → AnyLinePreprocessor → ControlNetApplyAdvanced → KSampler → VAE → SaveImage，外加尺寸处理；不是只有安装说明。
- **依赖**：SDXL checkpoint（文件原设 JuggernautXL）、SDXL VAE、MistoLine，Anyline 及尺寸处理节点。图中仍用 `mistoLineV2.safetensors`、`fixed_vae`、本地示例图片等旧名称；模型卡当前公开文件名不同，需要映射，不可照名字盲下载。Anyline 来源为作者[ComfyUI-Anyline](https://github.com/TheMistoAI/ComfyUI-Anyline)。
- **实际示例**：已看 [sketch_rendering.png](https://github.com/TheMistoAI/MistoLine/blob/c3caab172f3539f27564536a00b9c021eb341f34/assets/sketch_rendering.png)的缩小预览；展示场景、建筑、机械的线稿→渲染，不是精致 Q 版修仙人物。它支持研究轮廓控制，但不能拿这些样例证明本角色服装或手部效果。
- **兼容边界**：作者[模型卡](https://huggingface.co/TheMistoAI/MistoLine/blob/main/README.md)称多数 SDXL 可用，排除 PlaygroundV2.5、CosXL，对 SDXL-Lightning 还带不确定说明。dseditor 的 Nova Anime XL–IL 图见下一项，是组合存在的证据，不是本机复现证据。对 Z-Image、Anima 不可直接套用。
- **Windows / 8GB**：路径写法包含 Windows 分隔符，不构成 Windows 全组合测试。没有 8GB 数据；官方图的 latent 尺寸输入又来自图片尺寸，不能只看 EmptyLatentImage 的显示值就断言低显存。用户当前缺 MistoLine 命名权重和精确 AnyLine 节点，因此不列为零安装首试。
- **许可证**：根代码/工作流 LICENSE 未找到，软件授权 unknown；[模型卡](https://huggingface.co/TheMistoAI/MistoLine/blob/main/README.md)标 `openrail++`，且 README 有明确商业署名及用途限制。不能简写成「MIT、可随意商用」。示例图原始资产权利未另核。
- **建议**：第二阶段轮廓控制候选。如果现有 SDXL Canny/Sketch Control-LoRA 控制不了柔和服装线，再评估是否批准补这个权重和节点，不先装全套。

### 5.6 dseditor/ComfyuiWorkflows：真正有二维角色线稿图，但可移植性差

- **README 与具体图**：[README](https://github.com/dseditor/ComfyuiWorkflows/blob/b2ea26fa602d6eebadb1de1e4ccf1ecc91875806/README.md)；[SDXL/LineArtColor.json](https://github.com/dseditor/ComfyuiWorkflows/blob/b2ea26fa602d6eebadb1de1e4ccf1ecc91875806/SDXL/LineArtColor.json)。核验到 Nova Anime XL–IL v6.0、MistoLine fp16、AnyLineArtPreprocessor_aux、文本样式/标签、KSampler、VAE Decode、PreviewImage。是完整的单张二维线稿渲染链，**没有 SaveImage 节点**，需另补保存才能形成落盘交付。
- **为什么不能原样跑**：checkpoint widget 里是平台数值 ID 和显示名，不是常规本地 checkpoint 文件名（`:251–302`）；LoadImage 存的是外部云存储 URL；存在额外自定义节点。图元数据列 aux、Essentials、Chibi-Nodes、PromptStylers、WD14 Tagger、WAS 等历史版本，不能把「元数据有版本」当成所有扩展都还可安装或已兼容。不得自动访问图里的陌生图片 URL。
- **实际示例**：根 README 没有为这个 LineArtColor 文件给出一一对应的输入/输出角色对比；本轮没有核实其最终图像。作者其他图的图片和「效果不怎样」描述不能替代本图证据。
- **避免架构误读**：[ipaclothes.json](https://github.com/dseditor/ComfyuiWorkflows/blob/b2ea26fa602d6eebadb1de1e4ccf1ecc91875806/ipaclothes.json)确有衣服参考、姿态与脸的分工，但实际是 majicmixRealistic_v7、SD1.5 OpenPose、FaceID 和自定义 workflow 子图，不是 SDXL。不能因同仓库 `SDXL/` 下另有文件，就把这一图当成 SDXL 配方。作者[换衣说明](https://github.com/dseditor/ComfyuiWorkflows/blob/b2ea26fa602d6eebadb1de1e4ccf1ecc91875806/Clothes/clothes.md)也明确说不是完全保持衣服原貌。
- **Windows / 8GB**：未找到上述精确线稿图在 Windows/8GB 的性能记录。SDXL+MistoLine+标签器等依赖需要另测；也没核实用户已装匹配 MistoLine。不是直接推荐给当前服务器一键安装。
- **许可证**：[仓库 GPL-3.0](https://github.com/dseditor/ComfyuiWorkflows/blob/b2ea26fa602d6eebadb1de1e4ccf1ecc91875806/LICENSE)；Nova Anime、MistoLine、标签模型各自许可独立；外部参考图资产许可 unknown。
- **建议**：作为「已有完整二维角色控制图」的阅读样本，选取轮廓与画风分工，不导入后自动装缺失节点。不把 Chibi-Nodes 的名称视为 Q 版画质保证。

### 5.7 sepro/SDXL-ComfyUI-workflows：相对简单的完整可适配起点

- **README 与图**：[README](https://github.com/sepro/SDXL-ComfyUI-workflows/blob/72a557473e19e57c8821b16cfa8600128eb846a0/README.md#dual-controlnet-workflow)；[dual_controlnet_basic.json](https://github.com/sepro/SDXL-ComfyUI-workflows/blob/72a557473e19e57c8821b16cfa8600128eb846a0/workflows/dual_controlnet_basic.json)。完整图含 SDXL base、offset LoRA、Canny/Depth Control-LoRA、预处理、VAEEncode、采样、解码保存。图有输入图、空 latent 两种入口的说明，当前 sampler denoise=0.5；切入口时必须同时核对接线与 denoise，不能只改一个数。
- **实际示例**：已看 [dual-controlnet.jpg](https://github.com/sepro/SDXL-ComfyUI-workflows/blob/72a557473e19e57c8821b16cfa8600128eb846a0/images/dual-controlnet.jpg)，是同手势女性照片→绘画/赛博风对比，说明作者展示了结构保留，不是我们想要的全身 Q 版。图内默认提示词另为 3D 玩具，不要原样沿用。
- **另一个完整绘画图**：[painterly_style_workflow.json](https://github.com/sepro/SDXL-ComfyUI-workflows/blob/72a557473e19e57c8821b16cfa8600128eb846a0/workflows/painterly_style_workflow.json)。确实移除了 refiner，但还依赖 `smmtg-000004` 风格 LoRA、offset LoRA、Remacri 放大等；不是无额外权重的国风插画模板，不能只因叫 painterly 就优先整套使用。
- **Windows / 8GB**：没有精确平台和显存实测。Stability 的 [Control-LoRA 模型说明](https://huggingface.co/stabilityai/control-lora/blob/main/README.md)给出低秩权重比完整 ControlNet 更小的依据；这是权重体积，不是峰值显存。用户已有 Canny/Sketch 对应命名选项，因此「先单控制、不加载 refiner/放大器」是降低同时驻留资源的研究建议，**不是已测 8GB 通过**。
- **许可证**：[代码/工作流 MIT](https://github.com/sepro/SDXL-ComfyUI-workflows/blob/72a557473e19e57c8821b16cfa8600128eb846a0/LICENSE)。底模、Control-LoRA、风格 LoRA 和参考照片另核；不能从该 MIT 文件推导示例照片可商用。
- **建议**：适合作为最小控制试验骨架，但模型文件名、旧预处理节点 schema、本地图输入需要适配。原样再现图需原输入与全部依赖；本轮未运行。推荐的是删减后的结构，不是照抄旧提示词与所有分支。

### 5.8 mor-o/comfyui-2d-character-pipeline：有真实资产链，但放在后置

- **README 与实现**：[README](https://github.com/mor-o/comfyui-2d-character-pipeline/blob/9fee239216b8fb5a841401644a4ef629496e563c/README.md)；[W1 pose-edit API JSON](https://github.com/mor-o/comfyui-2d-character-pipeline/blob/9fee239216b8fb5a841401644a4ef629496e563c/workflows/w1-pose-edit/workflow_api.json)；[W2–W5 工作流目录](https://github.com/mor-o/comfyui-2d-character-pipeline/tree/9fee239216b8fb5a841401644a4ef629496e563c/workflows)。实际有角色图→视频→抠背景/图集，另有配件局部重绘和分层链。不是名字叫 pipeline 却没有实现。
- **模型/节点**：W1 为 Qwen-Image-Edit 2509 GGUF + 对应 Lightning LoRA + Qwen ControlNet Union；视频为 Wan 2.2 i2v 14B，配件用 Wan 2.1 VACE；还有 SAM3、BiRefNet、GGUF 和自有显存卸载节点。它没有把 SDXL ControlNet 冒充 Qwen 控制；我们也不能反过来接错。
- **实际示例**：已看 [idle 图集](https://github.com/mor-o/comfyui-2d-character-pipeline/blob/9fee239216b8fb5a841401644a4ef629496e563c/samples/base_animations/idle/idle.png)：灰色大头无脸基础人偶，未展示精致头发、分层长袍或国风材质。W1 提示词也明确要求裸基础体、无发无脸、黑线和平色。该目标与我们本轮角色设计明显不同。
- **Windows / 8GB**：作者以 RTX 3090 **24GB**、RAM 至少 32GB 调整，宣称峰值约 22.5GB；文档使用 `F:/ComfyUI` Windows 路径并记录作者端到端验证。此为作者记录，不是本研究复测。**没有 8GB 适配证据，不推荐原样用于 3060 Ti。** 显存卸载节点不能当成 24GB 工作流自动变成 8GB 的保证。
- **许可证**：[代码 MIT](https://github.com/mor-o/comfyui-2d-character-pipeline/blob/9fee239216b8fb5a841401644a4ef629496e563c/LICENSE)；Qwen/Wan/SAM3 等权重各自另核；样例原始角色资产未找到独立来源许可。README 自报的磁盘总量口径也不完全一致，不把它作为确定下载预算。
- **建议**：保留为后续动画/分层参考，不解决「第一张角色还没设计好」。不采用其完全自动运行设想，也不执行其中下载、清理模型等操作。

## 6. 三层分工：到底该借什么

| 层 | 可以借用的能力 | 不能据此承诺 |
|---|---|---|
| 1. agent skill / MCP / API | 查询节点、修改图、有限队列、保存种子和运行证据；候选 5.1、5.2。 | 提示词经代理改写就会自动变精致；更多自动重抽等于更多控制。 |
| 2. 设计输入与控制（本轮核心） | 草图定头身和袍形；图生图保留已有色块；轮廓控制保结构；参考图引导画风；选区只改手剑。候选 5.3–5.7。 | 骨架自动控制衣领、衣料、剑鞘；风格参考自动成为原创设计；同家族所有衍生模型效果一样。 |
| 3. 像素、动画、切图 | 已认可角色之后做透明、动作、图层和图集；现有 sprite-gen/sprite-sheet 与候选 5.8。 | 通过缩小、像素化、切图、插帧补救失败的人设、长袍或手部。 |

另查了官方 [Comfy-Org/comfy-skills 的 README](https://github.com/Comfy-Org/comfy-skills/blob/d50722a53585d0ab4fd1909fd59294b978aad449/README.md)和 [plugin.json](https://github.com/Comfy-Org/comfy-skills/blob/d50722a53585d0ab4fd1909fd59294b978aad449/claude-code/.claude-plugin/plugin.json)：当前这一套绑定 `cloud.comfy.org/mcp`，是 Comfy Cloud 产品 skill，不是本用户局域网服务的现成客户端。因此只作范围排除，不加入上面 8 个本地方案候选，更不把私有参考送到云端。

## 7. 兼容与资源：核实的、推测的、未知的

### 已有依据

1. IP-Adapter 公开 SDXL/SD1.5 权重不同；MistoLine 基于 SDXL；mor-o 用 Qwen 专用控制。**这些控制不能跨家族直接互换。** 依据分别见 5.4 模型卡、5.5 模型卡、5.8 JSON。
2. Acly 明确给出 Windows/CUDA 和一般硬件建议；mor-o 明确以 24GB 设计。前者不是目标组合 8GB 保证，后者不能当成 8GB 候选。
3. 用户服务当前有 SDXL Control-LoRA、IP-Adapter 等选项。它证明可尝试核对，未证明可加载、预测类型正确或画质合格。

### 研究判断，不是实测

- 比起同时加载大编辑模型、视频模型或多控制分支，**单 checkpoint、单张、单个 Control-LoRA、无 refiner/高清放大**更适合作为这台机器的第一步验证。不要把这句话改写成「8GB 肯定跑得动」。
- 画风参考若要加入，先选已核对的 SDXL adapter + ViT-H 组合；需要的显存、系统内存换入换出和等待成本仍未知。降低分辨率/分块解码可能有帮助，也可能损失衣饰细节；必须以小试测量。
- OpenPose 只表达关节点，不能完整描述大头轮廓、衣领厚度、长袍层次或剑鞘。因此本目标优先考虑**手工轮廓线/色块稿**；骨架只作可选补充，而不是把正常成人姿态参考直接强压成 Q 版。

### 仍缺的关键东西

- 一张比例和服装轮廓正确的原创草图/色块稿。已有失败成图不能自动当作合格底图，否则低噪图生图可能把成人比例也保留下来。
- 一个允许本地生成使用的画风参考，以及与其相配的底模/控制权重组合验证。参考画风、参考服装、参考姿态应分工，不能整张照抄现成商业角色。
- 该精确组合的 8GB 峰值显存、耗时、是否 OOM，以及最终审美验收。**本轮全部未测，不给秒数、成功率或必然提升承诺。**

LoRA 暂不作为先决条件：没有核验到与当前目标、底模和商业使用都匹配的特定风格 LoRA；角色训练更需要先有认可底图和干净数据集。不能为了加一个名词就推荐未知权重。

## 8. 获准后的小验证流程（本轮不执行）

### 先做输入，先不抽图

1. 在本地做**一张**原创轮廓/色块稿：明确头的上下界、紧凑躯干、短四肢、领肩、腰封、内外袍摆、两只鞋，以及剑鞘在身体外侧的位置。先让用户确认轮廓。脸、材质细节可以后补，不能再用成人比例作为底图。
2. 本地选取有权使用的画风参考，只研究细发束、布料与弱轮廓。将风格和服装结构分别说明。未经许可不向云端、第三方演示或 MCP 外传；若之后需要把自有图上传用户自己的 ComfyUI，也先获得明确授权。
3. 再核对精确 checkpoint、控制权重和 CLIP Vision 类型/来源，检查图中实际节点 schema；拒绝自动装全部缺失节点、自动下载模型或无界改环境。

### 第一次只验证一张

4. 先用现有 SDXL 权重建立**单轮廓控制**。参考 sepro 完整图，但先不加载第二 ControlNet、refiner、放大器、FaceID、训练或动画。分辨率、采样等按实际选定底模和 8GB 预算确认，不盲照此前 Z-Image 的参数。
5. 先判断轮廓是否保住；只有结构合格但画法偏离时，才提出加一个 SDXL IP-Adapter 风格参考的小对照。固定种子和其他输入，每次只改变一个控制因素。图生图强度过低会保留草稿瑕疵，过高会丢比例，需要根据结果调整，不预设万能数值。
6. 如只有手剑局部失败，再建议选区重绘或手工修订，不整张重抽。不要让骨架/参考图控制压掉已正确的领肩与金饰。

### 验收和止损

- **比例**：不把发髻算作头高；看是否仍是大头小身，而不是成人长躯干加大眼。
- **服装**：领肩、袖腰、内外袍摆是否能分别读出；黑布不是黑背心、金饰不是几根细线；衣料明暗和头发层次是否达标。
- **神态与手剑**：不靠拉长身材表现洒脱；手到底搭在何处；剑柄、护手、鞘口、封闭鞘尾关系是否清楚。
- **画法**：不能又退回粗黑线、儿童卡通、塑料 3D；同时用缩小预览判断细节是否还可读。
- **资源**：记录实际峰值、耗时、是否内存换入/OOM；若超预算，停止而非偷偷升级/下载/切云端。
- 若结构或目标画法没有改善，先返回草图/模型配对诊断，不靠更多种子、图集或动画掩盖问题。第一张未被用户接受前，不扩量。

## 最终取舍

**先验证「设计草图 + 现有 SDXL 轮廓控制」，再按结果加 cubiq 的画风参考。** 愿意用画布修改时，Acly/Krita 值得作为下一步完整工具评估。dseditor 给出了较接近二维角色的真实完整控制图，但不是直接可移植包；MistoLine 是可研究的轮廓升级方向，不是当前必须新增项。MCP 和动画项目留作编排及后置参考。

这条路线的改进是把比例、服装和画风变成不同的可观察输入，不是把失败归咎于某个模型，也不是承诺找到一个万能 skill。本轮研究到此，未实际运行任何候选。
