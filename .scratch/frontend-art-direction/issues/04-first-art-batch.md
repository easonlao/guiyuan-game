# 确定 A 布局的首批美术范围与代码绘制边界

Parent: ../map.md
Type: grilling
Label: wayfinder:grilling
Status: claimed
Assignee: main-agent
Blocked by: 03

## Question

在人物上方、棋盘中央的 A 布局下，第一批静态美术应保留、替换或新增哪些内容？角色、场景背景、按钮装饰中先验证哪一项，哪些继续由代码绘制？明确最小样张及其放回 A 布局后的判断标准，而非一次生成整套资产。具体角色外貌、素材尺寸契约、工具和成本在需要时进一步调查或决策；不由 agent 擅自决定用户审美。

## Comments

用户同意推荐顺序：先做人物静态样张并放回 A 布局检查，人物方向确认后再配山水背景；棋盘、文字与操作提示继续由代码绘制；施法与受击等动画后置。尚需确认静态样张的角色设定、画风细化和验收关注点，不开始批量生成。

### 人物方向讨论

- 用户确认：替换现有角色设计；保留大头、小身体的 Q 版比例；首张只做全身待机样张，适配 A 布局，不改正式代码。
- 用户曾考虑「传统人物本人」，希望为换装和换角色建立稳定背景；讨论八仙、孙悟空、哪吒后，认为辨识度与修仙气质不能同时满足预期。
- 最新确认：改为原创修士，以传统文化作为设计参考，而非直接使用传统名人。先探索 Q 版少年剑修；此前「传统人物本人」方向不再采用。
- 人设稳定性由身份、性格、标志物、服饰轮廓维持；换装是后续设计目标，本轮不实现换装系统或角色专属技能。
- 具体发型、配色、服饰和标志物仍待样张简报确认，不沿用被放弃的吕洞宾提案或旧角色设定作为默认。

### Z-Image Turbo 单张视觉草案运行记录

- 按用户要求通过指定 ComfyUI 原生 HTTP API 生成一张待评价样张；没有替用户批准外观，不改正式源码、不替换资产、不接入原型。
- [运行记录与官方参数来源](../../../artifacts/frontend-art-direction/character-study/run-record.md)；[原图](../../../artifacts/frontend-art-direction/character-study/original.png)；[原图与近似原型尺寸对比](../../../artifacts/frontend-art-direction/character-study/comparison.png)。
- prompt_id：`943fa4a8-654d-4ea4-902a-0d58a8d57a2e`；768×1024；服务器执行 56.168 秒；一次提交成功，无重试。已打开图检查：全身双鞋完整、Q 版明确；外袍偏长、红装饰偏飘带、剑鞘尖端被身体遮住，待用户看图评价。
- `artifacts/` 为本地报告目录，不入库；票状态不变。

### 画风反馈与单张对照（未批准）

- 用户认为首张「不够特色」；之后已生成葫芦游侠、符纸剑修、松枝小剑仙三个方向，见[三方向运行记录](../../../artifacts/frontend-art-direction/character-directions/run-record.md)。这是生成与检查证据，不是角色定稿或规则定义。
- 用户最新澄清：不喜欢的是画法「太像儿童卡通」，不是 Q 版比例。继续保留大头小身体，本轮以首张少年剑修的人设和构图作文字对照，只试细致、克制的国风 2D 手绘画风，不再生成三方向。
- [本轮运行与观察记录](../../../artifacts/frontend-art-direction/character-style-refinement/run-record.md)、[原图](../../../artifacts/frontend-art-direction/character-style-refinement/original.png)、[旧版/画风试验对照](../../../artifacts/frontend-art-direction/character-style-refinement/comparison.png)。这些是证据，不是定义；结果未批准，等待用户评价。
- 一次提交成功，零重试。prompt_id：`0b6dfdf0-9fbe-472f-ba0c-1ed46f664936`。线条变细、衣褶明暗增加，但仍偏卡通平涂，不能宣称已达到细致国风手绘目标；头部相对变小、身体更修长，外貌与配件也漂移。没有把比例变化当作画风改善，不声称严格同角色或单变量实验。
- 没有替换正式资产或接入原型，票不关闭，状态保持 claimed；没有按审美偏好追加生成。

### 画风试验反馈：右侧新版可接受

用户查看 `artifacts/frontend-art-direction/character-style-refinement/comparison.png`（左旧右新）后回复「这个可以」，确认右侧新版的画法可作为后续视觉基线：减弱粗黑描边，增加头发与衣服的层次，保留风格化 Q 版表现。

确认范围仅为本轮所问的画法方向，不扩展为最终角色造型、身材比例、全部资产或生成流程已验收。最初「不够特色」的问题仍未解决；下一步应沿此画法比较有辨识度的造型，而非继续沿旧的儿童卡通画法出图。图与运行记录见上方本轮记录；用户未选定葫芦游侠、符纸剑修或松枝小剑仙中的具体方向。

### 行云剑客：参考气质后的单张试图（未定稿）

- 用户明确否决葫芦游侠、符纸剑修、松枝小剑仙三个旧造型。用户提供的新参考只借洒脱成年侠客气质、强轮廓与统一设计感，仍保留风格化 Q 版大头小身体，不改成人修长比例，不照搬人物、竹子、熊猫或绿色主题。
- 用户批准本轮原创「行云剑客」单张视觉试图：沿已接受 refinement 画法，高束发、肩扛入鞘长剑、偏侧重心、短外衣与不对称披袖/衣摆配长裤，云白靛青加少量朱红，风与流云主题。批准的是试图，结果与人设均未定稿。
- [运行记录与检查结果](../../../artifacts/frontend-art-direction/cloud-swordsman/run-record.md)、[原图](../../../artifacts/frontend-art-direction/cloud-swordsman/original.png)、[大图与小尺寸模拟显示](../../../artifacts/frontend-art-direction/cloud-swordsman/comparison.png)、[提示词](../../../artifacts/frontend-art-direction/cloud-swordsman/prompt.txt)、[API 工作流](../../../artifacts/frontend-art-direction/cloud-swordsman/workflow-api.json)。这些是证据，不是定义；预览不代表游戏尺寸。
- 指定 ComfyUI + Z-Image Turbo，一次提交成功，零重试，768×1024。prompt_id：`f2c6cd69-9f41-4b7e-944d-f43c7b176e4f`。提交前队列为空，参考图未上传。
- 已打开原图与小图检查：Q版、高束发、抬手扛剑姿态及全身留边可见；但武器更像出鞘剑，不能算入鞘；服装仍是长袍，短外衣配长裤未实现；不对称主要来自腰侧飘片而非清楚的单侧披袖，偏侧重心不强。手握剑柄可辨，肩部接触点被遮挡；未按审美偏好重抽。
- 不接入原型、不替换正式资产、不新增技能或规则。等待用户评价，不替用户认可；票不关闭，状态保持 claimed，map 不变。

### 黑白金分层长袍：新服装参考后的单张试图（未定稿）

- 用户提供新服装参考，明确长袍本身不是问题；认可参考服装的设计感，批准借黑白分层、宽窄对比和重点金饰。仅提炼服装结构，不照搬人物或具体图案，不借成人写实比例，继续保留已认可的 Q 版画法；允许对称长袍，不再强求短外衣或不对称。
- 本轮只生成一张：白内袍/白长裤、黑色开襟无袖长外搭及两侧长片、窄黑前垂片、宽白袖配黑护腕、宽黑腰封和简化金扣，少量有位置的大金饰；尽量沿用肩扛入鞘长剑。参考图仅本地查看，未上传。
- [运行记录与目视检查](../../../artifacts/frontend-art-direction/black-white-gold-swordsman/run-record.md)、[原图](../../../artifacts/frontend-art-direction/black-white-gold-swordsman/original.png)、[上一张/本轮并排图](../../../artifacts/frontend-art-direction/black-white-gold-swordsman/comparison.png)、[提示词](../../../artifacts/frontend-art-direction/black-white-gold-swordsman/prompt.txt)、[API workflow](../../../artifacts/frontend-art-direction/black-white-gold-swordsman/workflow-api.json)。这些是证据，不是定义；未定稿，等待用户评价。
- 同一指定 ComfyUI + Z-Image Turbo，768×1024，一次提交成功，零重试。prompt_id：`1661ee47-4984-4093-bdfb-6531ae66b825`。提交前队列为空，未清队列或中断他人。
- 已打开原图、并排图和小图：黑白外搭、宽袖收腰、腰间金饰可读；但身材明显偏成人修长，未保留目标 Q 版比例；武器仍有亮白刃边和尖端，不能算明确入鞘。窄前垂片偏侧，金饰未落在预期黑肩片，白裤被长袍遮住。没有因这些偏差重抽，不声称用户已接受。
- 仅追加本 Comments 与本轮报告，不改游戏/原型/map，不替换资产，不关闭票，状态保持 claimed。

### 完整人物重新设计：用户批准单张尝试，仍未最终验收

- 用户明确批准重新设计完整原创男修士，不再只简化换装。批准边界：保留约3至3.5头身大头小身体Q版、非圆眼奶萌脸、深色高束发和自信松弛姿态；沿已接受的弱轮廓精致二维国风画法，重设计黑白金分层长袍，重点是有形领肩、成块原创金纹、内外层、宽袖护腕、宽腰封金扣、错落下摆与可读裤鞋。成熟气质由眉眼肩颈与姿态表达，不靠成人身材；不简化成黑背心加细金线，不复制参考IP/纹样组合，不用竹、熊猫、葫芦、符纸、松枝或无关配件。
- 本轮只做一张全身静态人物设计：轻微三分之四、重心轻偏一腿，腰侧一柄收鞘剑安静随身、不扛剑遮领；浅灰底、发顶鞋底剑鞘完整，无文字多格。优先级为Q版比例 > 服装结构 > 神态 > 武器细节。不做动画、不接入游戏或原型、不替换正式资产。
- [原图](../../../artifacts/frontend-art-direction/character-redesign/original.png)、[原图与192×256模拟小图预览](../../../artifacts/frontend-art-direction/character-redesign/preview.png)、[prompt](../../../artifacts/frontend-art-direction/character-redesign/prompt.txt)、[API workflow](../../../artifacts/frontend-art-direction/character-redesign/workflow-api.json)、[运行元数据](../../../artifacts/frontend-art-direction/character-redesign/run-state.json)、[运行记录与目视检查](../../../artifacts/frontend-art-direction/character-redesign/run-record.md)。这些是证据，不是定义；预览标签由后处理添加，模拟显示并非尺寸契约。
- 沿用指定ComfyUI Z-Image Turbo原生API与已验证参数，实际768×1024，batch_size=1，一次提交成功、零重试。prompt_id：`f315a960-dd6b-4574-a319-c4e1a8bdba98`，响应后立即保存。两次队列检查为空，未清队列、中断他人、换模型、装插件或改全局设置；四张指定参考均已实际用read打开，只本地分析、未上传。
- 已打开原图和大小预览：**人物依然偏成人修长，未保住目标Q版比例，是首要失败；不能按成功设计验收。** 领肩叠层和大块金纹较上轮清楚，宽袖收腰与黑白层次可读；但中央黑垂片过长过宽，下端出现类似竹枝的金纹，画法仍偏硬边平涂，站姿偏直。腰侧武器更像有鞘，但持物手在鞘口/护手下套件处、未清楚握柄，尖末端仍有歧义；不能声称手部与收鞘细节全合格。没有因为偏差自动多抽，仍待用户评价。
- 只追加本Comments与全新本轮报告目录；票不关闭、状态保持claimed，map、源码、原型与既有资产不变，尚未最终验收。

### 整理：范围收回与可控生成方法独立成票（本轮任务整理）

- 本票问题回到票面的「首批静态美术范围与代码绘制边界」；上方人物试画的历史与未决反馈原样保留，不下结论、不关闭，状态保持 claimed。
- 「能否用可控生成方法稳定产出单张人物」独立为[票 08](08-controllable-single-character-generation.md)（prototype，结果由用户判断，不是实施授权）。
- 相关外部调研已作为已决票收录：[票 05](05-art-style-route-research.md)、[票 06](06-controllable-generation-tooling-research.md)。

## Context

用户目标为新玩家能看懂。已选《弈仙牌》的山水场景和人物方向，装饰克制；A 原型现有角色与背景均为占位，不代表最终美术通过。行动反馈与角色动作仍属后续规划，本票不交付正式素材或实现代码。
