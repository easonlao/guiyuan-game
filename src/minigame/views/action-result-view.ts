import {
  ActionType,
  GameState,
  NodeLevel,
  PlayerId,
  Polarity,
  WuXing,
} from '../../core/types/domain.js';
import { Container } from '../scene/container.js';
import { WUXING_PALETTE } from '../pixel-art.js';
import { drawPanel, THEME } from '../theme.js';

export interface NodeChange {
  readonly player: PlayerId;
  readonly element: WuXing;
  readonly polarity: Polarity;
  readonly before: NodeLevel;
  readonly after: NodeLevel;
}
export const LEVEL_LABEL: Record<NodeLevel, string> = {
  [-1]: '道损',
  0: '虚空',
  1: '点亮',
  2: '加持',
};
export const ACTION_LABEL: Record<ActionType, string> = {
  [ActionType.AUTO]: '吸纳',
  [ActionType.CONVERT]: '调息',
  [ActionType.TRANS]: '化',
  [ActionType.ATK]: '破',
  [ActionType.BURST]: '强化',
  [ActionType.BURST_ATK]: '强破',
  [ActionType.DISSIPATE]: '散气',
  [ActionType.PASS]: '消散',
};
export function changedNodes(before: GameState | null, after: GameState): NodeChange[] {
  if (before === null) return [];
  const changes: NodeChange[] = [];
  for (const player of ['P1', 'P2'] as const)
    for (const element of Object.values(WuXing)) {
      for (const polarity of [Polarity.YIN, Polarity.YANG]) {
        const key = polarity === Polarity.YIN ? 'yin' : 'yang';
        const previous = before.players[player].board[element][key];
        const next = after.players[player].board[element][key];
        if (previous !== next)
          changes.push({ player, element, polarity, before: previous, after: next });
      }
    }
  return changes;
}
export function describeNodeChange(change: NodeChange): string {
  return `${change.player === 'P1' ? '你' : '天道'}·${WUXING_PALETTE[change.element].name}${change.polarity === Polarity.YIN ? '阴' : '阳'} ${LEVEL_LABEL[change.before]}→${LEVEL_LABEL[change.after]}`;
}

/** 终局结果条标题与重开提示（顶部播报框已删，终局信息由这条常驻结果区讲清）。 */
export const GAME_OVER_TITLE = '对局结束';
export const GAME_OVER_RESTART_HINT = '点击空白处重新开局';

/** The last action remains readable after the turn changes; tap to see every actual delta. */
export class ActionResultView extends Container {
  public changes: readonly NodeChange[] = [];
  public title = '';
  public note: string | undefined;
  /** 终局模式：非 null 时结果条改画「胜负 / 结束原因 / 重开提示」，覆盖上一招内容。 */
  public gameOverLines: readonly string[] | null = null;
  private width: number;
  private expanded = false;
  public constructor(width: number) {
    super();
    this.width = width;
    this.visible = false;
    this.onTap = () => {
      this.expanded = !this.expanded;
      this.reflow();
      return true;
    };
  }
  public setResult(
    actor: PlayerId,
    action: ActionType | 'showdown',
    stem: string,
    changes: readonly NodeChange[],
    note?: string,
  ): void {
    this.title = `上一招 · ${actor === 'P1' ? '你' : '天道'}用${stem} · ${action === 'showdown' ? '天命抽牌' : ACTION_LABEL[action]}`;
    this.changes = [...changes];
    this.note = note;
    this.gameOverLines = null;
    this.expanded = false;
    this.visible = true;
    this.reflow();
  }
  /** 终局展示：明确胜负、结束原因与重开提示都进现有结果区，不依赖已删的顶部播报框。 */
  public setGameOver(resultText: string, reasonText: string): void {
    this.title = GAME_OVER_TITLE;
    this.changes = [];
    this.note = undefined;
    this.gameOverLines = [resultText, reasonText, GAME_OVER_RESTART_HINT];
    this.expanded = true;
    this.visible = true;
    this.reflow();
  }
  public reset(): void {
    this.visible = false;
    this.title = '';
    this.changes = [];
    this.gameOverLines = null;
    this.expanded = false;
  }
  public resize(width: number): void {
    this.width = width;
    this.reflow();
  }
  private reflow(): void {
    const lineCount =
      this.gameOverLines !== null
        ? this.gameOverLines.length
        : this.changes.length + (this.note ? 1 : 0);
    const height = this.expanded ? 32 + Math.max(1, lineCount) * 18 : 34;
    this.hitArea = { x: 0, y: 34 - height, width: this.width, height };
  }
  protected override renderSelf(ctx: CanvasRenderingContext2D): void {
    const area = this.hitArea!;
    drawPanel(ctx, 0, area.y, this.width, area.height, THEME.edge, THEME.deep);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `11px ${THEME.font}`;
    ctx.fillStyle = THEME.muted;
    ctx.fillText(this.title, 9, area.y + 10);
    ctx.fillStyle = THEME.ivory;
    if (this.expanded) {
      const lines =
        this.gameOverLines !== null
          ? [...this.gameOverLines]
          : this.changes.length === 0
            ? ['未改变任何阴阳状态']
            : this.changes.map(describeNodeChange);
      if (this.note && this.gameOverLines === null) lines.unshift(this.note);
      lines.forEach((line, index) => ctx.fillText(line, 9, area.y + 32 + index * 18));
      if (this.gameOverLines === null) {
        ctx.textAlign = 'right';
        ctx.fillStyle = THEME.muted;
        ctx.fillText('收起', this.width - 9, area.y + 10);
      }
    } else {
      const first = this.changes[0];
      ctx.fillText(
        this.gameOverLines !== null
          ? this.gameOverLines[0]
          : (this.note ?? (first === undefined ? '未改变任何阴阳状态' : describeNodeChange(first))),
        9,
        25,
      );
      ctx.textAlign = 'right';
      ctx.fillStyle = THEME.jade;
      ctx.fillText(
        this.gameOverLines !== null
          ? '展开'
          : this.changes.length > 1
            ? `${this.changes.length}处 · 展开`
            : '查看',
        this.width - 9,
        25,
      );
    }
  }
}
