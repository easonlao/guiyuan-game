/**
 * 归元弈 · 道藏图鉴与规则指南弹层 (RuleModal)
 *
 * 包含五行生克、十天干阴阳、节点四态、神通六法与决胜快刀说明。
 * 支持顶部五大标签页无缝切换。
 */

import { ModalOverlay, ModalOverlayOptions } from './modal-overlay.js';
import { THEME } from '../theme.js';
import { audioSynthesizer } from '../audio/audio-synthesizer.js';

type TabKey = 'shengke' | 'tiangan' | 'fourstates' | 'actions' | 'rules';

interface TabItem {
  key: TabKey;
  label: string;
}

const TABS: TabItem[] = [
  { key: 'shengke', label: '生克' },
  { key: 'tiangan', label: '天干' },
  { key: 'fourstates', label: '四态' },
  { key: 'actions', label: '神通' },
  { key: 'rules', label: '决胜' },
];

export class RuleModal extends ModalOverlay {
  private activeTab: TabKey = 'shengke';

  public constructor(options: Omit<ModalOverlayOptions, 'title'>) {
    super({
      ...options,
      title: '道藏秘典 · 规则图鉴',
      panelHeight: Math.min(options.height - 80, 560),
    });
  }

  protected override handlePanelTap(screenX: number, screenY: number): void {
    // 检查标签栏点击
    const tabY = this.panelY + 54;
    const tabH = 28;
    const tabCount = TABS.length;
    const tabW = (this.panelW - 24) / tabCount;

    if (screenY >= tabY && screenY <= tabY + tabH) {
      for (let i = 0; i < tabCount; i += 1) {
        const x = this.panelX + 12 + i * tabW;
        if (screenX >= x && screenX <= x + tabW) {
          if (this.activeTab !== TABS[i].key) {
            this.activeTab = TABS[i].key;
            audioSynthesizer.play('tap');
          }
          return;
        }
      }
    }
  }

  protected override renderContent(ctx: CanvasRenderingContext2D): void {
    // 1. 渲染顶部 Tab
    const tabY = this.panelY + 52;
    const tabH = 26;
    const tabCount = TABS.length;
    const tabW = (this.panelW - 24) / tabCount;

    for (let i = 0; i < tabCount; i += 1) {
      const tab = TABS[i];
      const x = this.panelX + 12 + i * tabW;
      const isActive = tab.key === this.activeTab;

      ctx.fillStyle = isActive ? THEME.gold : 'rgba(16, 46, 53, 0.6)';
      ctx.fillRect(x + 1, tabY, tabW - 2, tabH);

      ctx.strokeStyle = isActive ? THEME.gold : THEME.edge;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 1, tabY, tabW - 2, tabH);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${isActive ? 'bold' : 'normal'} 12px ${THEME.font}`;
      ctx.fillStyle = isActive ? THEME.ink : THEME.muted;
      ctx.fillText(tab.label, x + tabW / 2, tabY + tabH / 2);
    }

    // 2. 渲染具体 Tab 的说明内容
    const contentY = tabY + tabH + 16;
    const contentX = this.panelX + 16;
    const contentW = this.panelW - 32;

    switch (this.activeTab) {
      case 'shengke':
        this.renderShengKe(ctx, contentX, contentY, contentW);
        break;
      case 'tiangan':
        this.renderTianGan(ctx, contentX, contentY, contentW);
        break;
      case 'fourstates':
        this.renderFourStates(ctx, contentX, contentY, contentW);
        break;
      case 'actions':
        this.renderActions(ctx, contentX, contentY, contentW);
        break;
      case 'rules':
        this.renderRules(ctx, contentX, contentY, contentW);
        break;
    }
  }

  /** 五行生克图谱 */
  private renderShengKe(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    ctx.font = `bold 14px ${THEME.font}`;
    ctx.fillStyle = THEME.jade;
    ctx.fillText('五行相生 · 循环流转', x, y);

    ctx.font = `12px ${THEME.font}`;
    ctx.fillStyle = THEME.ivory;
    ctx.fillText('木 生 火 → 火 生 土 → 土 生 金 → 金 生 水 → 水 生 木', x, y + 22);

    ctx.fillStyle = THEME.muted;
    ctx.fillText('【化 (TRANS)】：将自身本元导向相生之位，促成点亮与加持。', x, y + 42);

    ctx.font = `bold 14px ${THEME.font}`;
    ctx.fillStyle = THEME.damage;
    ctx.fillText('五行相克 · 破阵封脉', x, y + 78);

    ctx.font = `12px ${THEME.font}`;
    ctx.fillStyle = THEME.ivory;
    ctx.fillText('木 克 土 → 火 克 金 → 土 克 水 → 金 克 木 → 水 克 火', x, y + 100);

    ctx.fillStyle = THEME.muted;
    ctx.fillText('【破 (ATK)】：以相克法则直击敌方阵眼，制造破绽与道损。', x, y + 120);

    // 绘制简易生克五角小星示意底框
    ctx.fillStyle = 'rgba(8, 27, 34, 0.5)';
    ctx.fillRect(x, y + 155, w, 160);
    ctx.strokeStyle = THEME.edge;
    ctx.strokeRect(x, y + 155, w, 160);

    ctx.textAlign = 'center';
    ctx.fillStyle = THEME.gold;
    ctx.font = `bold 13px ${THEME.font}`;
    ctx.fillText('【五行玄枢】顺时针相生 · 隔位相克', x + w / 2, y + 172);

    const elements = [
      { name: '木 (绿)', color: '#7bc8a4' },
      { name: '火 (红)', color: '#ee7766' },
      { name: '土 (黄)', color: '#d8b876' },
      { name: '金 (白)', color: '#cfd8dc' },
      { name: '水 (蓝)', color: '#64b5f6' },
    ];

    elements.forEach((elem, idx) => {
      ctx.fillStyle = elem.color;
      ctx.font = `12px ${THEME.font}`;
      ctx.fillText(elem.name, x + 35 + idx * ((w - 70) / 4), y + 215);
    });

    ctx.fillStyle = THEME.muted;
    ctx.font = `11px ${THEME.font}`;
    ctx.fillText('内环为先手(阳)，外环为后手(天道/阴)。', x + w / 2, y + 265);
    ctx.fillText('圆环连线亮起即为本次可选之机缘通道。', x + w / 2, y + 285);
  }

  /** 十天干与阴阳 */
  private renderTianGan(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    ctx.font = `bold 14px ${THEME.font}`;
    ctx.fillStyle = THEME.gold;
    ctx.fillText('十天干与五行阴阳映射表', x, y);

    const rows = [
      { elem: '木', yang: '甲 (阳木)', yin: '乙 (阴木)' },
      { elem: '火', yang: '丙 (阳火)', yin: '丁 (阴火)' },
      { elem: '土', yang: '戊 (阳土)', yin: '己 (阴土)' },
      { elem: '金', yang: '庚 (阳金)', yin: '辛 (阴金)' },
      { elem: '水', yang: '壬 (阳水)', yin: '癸 (阴水)' },
    ];

    const rowH = 34;
    const startY = y + 30;

    // 表头
    ctx.fillStyle = THEME.panelRaised;
    ctx.fillRect(x, startY, w, 24);
    ctx.fillStyle = THEME.muted;
    ctx.font = `12px ${THEME.font}`;
    ctx.fillText('五行', x + 16, startY + 6);
    ctx.fillText('阳干 (主攻·克制)', x + 85, startY + 6);
    ctx.fillText('阴干 (主化·生生)', x + w - 110, startY + 6);

    rows.forEach((r, idx) => {
      const curY = startY + 28 + idx * rowH;
      ctx.fillStyle = idx % 2 === 0 ? 'rgba(16, 46, 53, 0.4)' : 'transparent';
      ctx.fillRect(x, curY, w, rowH);

      ctx.fillStyle = THEME.gold;
      ctx.font = `bold 13px ${THEME.font}`;
      ctx.fillText(r.elem, x + 20, curY + 8);

      ctx.fillStyle = THEME.damage;
      ctx.font = `12px ${THEME.font}`;
      ctx.fillText(r.yang, x + 85, curY + 8);

      ctx.fillStyle = THEME.jade;
      ctx.fillText(r.yin, x + w - 110, curY + 8);
    });

    const tipsY = startY + 28 + rows.length * rowH + 20;
    ctx.fillStyle = THEME.muted;
    ctx.font = `12px ${THEME.font}`;
    ctx.fillText('• 抽中【阳干】：若本节点未虚空，优先解锁【破】(克制敌方)。', x, tipsY);
    ctx.fillText('• 抽中【阴干】：若本节点未虚空，优先解锁【化】(相生己方)。', x, tipsY + 20);
    ctx.fillText('• 抽中对应侧为虚空或道损时：强制触发【吸纳】(填充自身)。', x, tipsY + 40);
  }

  /** 节点四态 */
  private renderFourStates(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    ctx.font = `bold 14px ${THEME.font}`;
    ctx.fillStyle = THEME.gold;
    ctx.fillText('节点四态（每个五行拥有阳侧与阴侧两轨）', x, y);

    const states = [
      {
        tag: '道损 (-1)',
        color: THEME.damage,
        desc: '受克跌入道损。终局扣分惩罚！无法发动化/破。',
      },
      {
        tag: '虚空 (0)',
        color: THEME.muted,
        desc: '未被点亮。抽中天干时必须吸纳回填。',
      },
      {
        tag: '点亮 (1)',
        color: THEME.jade,
        desc: '道力初显。阴阳双侧均点亮即达成【归一】！',
      },
      {
        tag: '加持 (2)',
        color: THEME.gold,
        desc: '双重加持。加成防护，可抵抗一次削弱。',
      },
    ];

    states.forEach((st, idx) => {
      const curY = y + 30 + idx * 56;
      ctx.fillStyle = 'rgba(8, 27, 34, 0.45)';
      ctx.fillRect(x, curY, w, 48);
      ctx.strokeStyle = st.color;
      ctx.strokeRect(x, curY, w, 48);

      ctx.fillStyle = st.color;
      ctx.font = `bold 13px ${THEME.font}`;
      ctx.fillText(st.tag, x + 12, curY + 8);

      ctx.fillStyle = THEME.ivory;
      ctx.font = `11px ${THEME.font}`;
      ctx.fillText(st.desc, x + 12, curY + 28);
    });

    const bottomY = y + 30 + states.length * 56 + 10;
    ctx.fillStyle = THEME.gold;
    ctx.font = `bold 13px ${THEME.font}`;
    ctx.fillText('【阴阳归一】五行的阴侧与阳侧均 ≥ 1 时，达成归一成就！', x, bottomY);
    ctx.fillStyle = THEME.muted;
    ctx.font = `11px ${THEME.font}`;
    ctx.fillText('达成归一立即获赠高额里程碑分数，并解锁强力【爆发】神通！', x, bottomY + 20);
  }

  /** 神通六法 */
  private renderActions(ctx: CanvasRenderingContext2D, x: number, y: number, _w: number): void {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const acts = [
      {
        name: '吸纳 (AUTO)',
        color: THEME.muted,
        desc: '低位或道损时强制触发，将天干灵气注入本节点。',
      },
      {
        name: '调息 (CONVERT)',
        color: THEME.jade,
        desc: '放弃生克，将天干能量直接强化自身对侧轨道(+1)。',
      },
      { name: '化 (TRANS)', color: '#80d6ba', desc: '以阴相生：保持自身等级，相生之节点阴侧+1。' },
      { name: '破 (ATK)', color: '#ee8d77', desc: '以阳克敌：保持自身等级，重击对手相克节点-1。' },
      {
        name: '强化 (BURST)',
        color: THEME.gold,
        desc: '自损阴侧1级，使相生位连加2级！获得连动再动！',
      },
      {
        name: '强破 (BURST_ATK)',
        color: '#ff6644',
        desc: '自损阳侧1级，连削对手相克位2级！获得连动再动！',
      },
    ];

    acts.forEach((a, idx) => {
      const curY = y + idx * 48;
      ctx.font = `bold 13px ${THEME.font}`;
      ctx.fillStyle = a.color;
      ctx.fillText(`【${a.name}】`, x, curY);

      ctx.font = `11px ${THEME.font}`;
      ctx.fillStyle = THEME.ivory;
      ctx.fillText(a.desc, x + 10, curY + 20);
    });
  }

  /** 决胜规则与智能快刀 */
  private renderRules(ctx: CanvasRenderingContext2D, x: number, y: number, _w: number): void {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    ctx.font = `bold 14px ${THEME.font}`;
    ctx.fillStyle = THEME.gold;
    ctx.fillText('两大胜负裁决目标', x, y);

    ctx.font = `bold 12px ${THEME.font}`;
    ctx.fillStyle = THEME.jade;
    ctx.fillText('一、终极目标：五行归元（瞬结胜出）', x, y + 26);
    ctx.font = `11px ${THEME.font}`;
    ctx.fillStyle = THEME.ivory;
    ctx.fillText('己方金木水火土五大节点全部达成“归一”（10个侧全点亮）。', x + 10, y + 44);
    ctx.fillText('一旦达成，对局立即判定大获全胜！', x + 10, y + 60);

    ctx.font = `bold 12px ${THEME.font}`;
    ctx.fillStyle = THEME.gold;
    ctx.fillText('二、次要目标：三十大回合终局计分', x, y + 86);
    ctx.font = `11px ${THEME.font}`;
    ctx.fillStyle = THEME.ivory;
    ctx.fillText('对局上限为30大回合。满回合无人归元时按总分裁决：', x + 10, y + 104);
    ctx.fillText('• 行为分：每次施展调息/化/破/强化均给付基础分。', x + 16, y + 120);
    ctx.fillText('• 状态分：修复道损、点亮、加持及击损对手均得高分。', x + 16, y + 136);
    ctx.fillText('• 终局残损扣分：残留的道损(-1)每处均扣减大额惩罚分。', x + 16, y + 152);

    ctx.font = `bold 14px ${THEME.font}`;
    ctx.fillStyle = '#64b5f6';
    ctx.fillText('智能快刀决胜机制 (ADR 0007)', x, y + 185);

    ctx.font = `11px ${THEME.font}`;
    ctx.fillStyle = THEME.muted;
    ctx.fillText('先手先达成归元时，根据后手剩余未点亮侧数判定：', x + 10, y + 205);
    ctx.fillText('• 若后手差 ≥ 2 侧：数学上已无法逆转，系统立即秒结胜负；', x + 10, y + 223);
    ctx.fillText('• 若后手严格只差 1 侧（已听牌）：触发“终轮天命揭牌”，', x + 10, y + 241);
    ctx.fillText('  若揭出的天干契合，后手后发制人胜；否则先手胜！', x + 10, y + 257);
  }
}
