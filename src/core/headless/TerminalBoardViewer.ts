/**
 * 归元弈 (Guiyuan) - ASCII / 纯文本棋盘回放检视器 (TerminalBoardViewer)
 * 纯 TS 实现，零任何 DOM/BOM 依赖，可在脱水/Node.js/CI 环境中可视化棋盘与事件流
 */

import {
  ActionPayload,
  ActionType,
  GameState,
  NodeData,
  NodeLevel,
  PlayerId,
  Polarity,
  WuXing,
  GENERATION_CYCLE,
  OVERCOMING_CYCLE
} from '../types/domain.js';
import { isNodeGuiYi, isNodeKangJi } from '../logic/State.js';
import { EventBus } from '../logic/EventBus.js';

export const WUXING_NAMES: Readonly<Record<WuXing, string>> = {
  [WuXing.WOOD]: '木',
  [WuXing.FIRE]: '火',
  [WuXing.EARTH]: '土',
  [WuXing.METAL]: '金',
  [WuXing.WATER]: '水'
};

export const POLARITY_NAMES: Readonly<Record<Polarity, string>> = {
  [Polarity.YIN]: '阴',
  [Polarity.YANG]: '阳'
};

export const LEVEL_CHARS: Readonly<Record<NodeLevel, string>> = {
  [-1]: '损',
  [0]: '空',
  [1]: '明',
  [2]: '亢'
};

export interface ViewerAttachOptions {
  readonly autoPrint?: boolean;
  readonly logger?: (msg: string) => void;
}

export class TerminalBoardViewer {
  private history: string[] = [];

  /**
   * 将棋盘节点等级格式化为单字符文本
   */
  formatLevel(level: NodeLevel): string {
    return LEVEL_CHARS[level] ?? '?';
  }

  /**
   * 获取单节点状态标记
   */
  private formatNodeStatus(node: NodeData): string {
    if (isNodeKangJi(node)) {
      return '⭐ 亢极';
    }
    if (isNodeGuiYi(node)) {
      return '⭐ 归一';
    }
    if (node.yin === -1 && node.yang === -1) {
      return '⚠️ 道损';
    }
    return '-';
  }

  /**
   * 格式化并输出对齐美观的 ASCII/Unicode 双方棋盘
   */
  formatBoard(state: GameState): string {
    const lines: string[] = [];
    const elements = [WuXing.WOOD, WuXing.FIRE, WuXing.EARTH, WuXing.METAL, WuXing.WATER];

    lines.push('============================================================');
    if (state.isGameOver) {
      lines.push(
        ` [对局结束] 胜者: ${state.winner ?? '平局'} | 原因: ${state.endReason ?? '无'} (回合: ${state.round}/${state.maxRounds})`
      );
    } else {
      lines.push(
        ` 归元弈棋盘 [回合: ${state.round}/${state.maxRounds}] [当前行动: ${state.currentPlayer}]`
      );
    }
    lines.push('============================================================');

    const players: PlayerId[] = ['P1', 'P2'];
    for (let pIdx = 0; pIdx < players.length; pIdx++) {
      const pid = players[pIdx];
      const player = state.players[pid];
      const board = player.board;

      let guiYiCount = 0;
      for (const el of elements) {
        if (isNodeGuiYi(board[el])) {
          guiYiCount++;
        }
      }

      lines.push(`--- [${pid}] 得分: ${player.score} | 归一进度: ${guiYiCount}/5 ---`);
      lines.push('  五行   阴     阳    状态');

      for (const el of elements) {
        const node = board[el];
        const elName = WUXING_NAMES[el];
        const yinChar = this.formatLevel(node.yin);
        const yangChar = this.formatLevel(node.yang);
        const status = this.formatNodeStatus(node);

        lines.push(`   ${elName}    ${yinChar}     ${yangChar}      ${status}`);
      }

      if (pIdx < players.length - 1) {
        lines.push('------------------------------------------------------------');
      }
    }

    lines.push('============================================================');
    return lines.join('\n');
  }

  /**
   * 格式化人可读的操作描述
   * 如 "P1 执行 [化 TRANS] 木 -> 火 (阴)"
   */
  formatAction(action: ActionPayload): string {
    const p = action.player;
    const type = action.actionType;

    const polarityStr = action.polarity ? `(${POLARITY_NAMES[action.polarity]})` : '';

    switch (type) {
      case ActionType.AUTO: {
        const elName = action.element ? WUXING_NAMES[action.element] : '?';
        return `${p} 执行 [吸纳 AUTO] ${elName} ${polarityStr}`;
      }
      case ActionType.CONVERT: {
        const elName = action.element ? WUXING_NAMES[action.element] : '?';
        return `${p} 执行 [调息 CONVERT] ${elName} ${polarityStr}`;
      }
      case ActionType.TRANS: {
        const srcName = action.sourceElement ? WUXING_NAMES[action.sourceElement] : '?';
        const targetEl =
          action.targetElement ??
          (action.sourceElement ? GENERATION_CYCLE[action.sourceElement] : undefined);
        const targetName = targetEl ? WUXING_NAMES[targetEl] : '?';
        return `${p} 执行 [化 TRANS] ${srcName} -> ${targetName} ${polarityStr}`;
      }
      case ActionType.ATK: {
        const srcName = action.sourceElement ? WUXING_NAMES[action.sourceElement] : '?';
        const targetEl =
          action.targetElement ??
          (action.sourceElement ? OVERCOMING_CYCLE[action.sourceElement] : undefined);
        const targetName = targetEl ? WUXING_NAMES[targetEl] : '?';
        return `${p} 执行 [破 ATK] ${srcName} -> ${targetName} ${polarityStr}`;
      }
      case ActionType.BURST: {
        const srcName = action.sourceElement ? WUXING_NAMES[action.sourceElement] : '?';
        const targetEl =
          action.targetElement ??
          (action.sourceElement ? GENERATION_CYCLE[action.sourceElement] : undefined);
        const targetName = targetEl ? WUXING_NAMES[targetEl] : '?';
        return `${p} 执行 [强化 BURST] ${srcName} -> ${targetName} ${polarityStr}`;
      }
      case ActionType.BURST_ATK: {
        const srcName = action.sourceElement ? WUXING_NAMES[action.sourceElement] : '?';
        const targetEl =
          action.targetElement ??
          (action.sourceElement ? OVERCOMING_CYCLE[action.sourceElement] : undefined);
        const targetName = targetEl ? WUXING_NAMES[targetEl] : '?';
        return `${p} 执行 [强破 BURST_ATK] ${srcName} -> ${targetName} ${polarityStr}`;
      }
      case ActionType.PASS: {
        return `${p} 执行 [消散 PASS]`;
      }
      default:
        return `${p} 执行 [${String(type)}]`;
    }
  }

  /**
   * 订阅 EventBus 事件流，记录并可选地输出摘要
   * 返回取消订阅的清理函数
   */
  attach(eventBus: EventBus, options?: ViewerAttachOptions): () => void {
    const autoPrint = options?.autoPrint ?? false;
    const logger = options?.logger ?? console.log;

    const record = (msg: string) => {
      this.history.push(msg);
      if (autoPrint) {
        logger(msg);
      }
    };

    const unsubTurnStart = eventBus.on('turn:start', data => {
      const extra = data.isExtraTurn ? ' (连动行动)' : '';
      record(`[回合开始] 回合 ${data.round} - 玩家 ${data.player}${extra}`);
    });

    const unsubActionExec = eventBus.on('action:execute', data => {
      record(`[动作开始] ${this.formatAction(data.action)}`);
    });

    const unsubActionDone = eventBus.on('action:executed', data => {
      const extra = data.extraTurn ? ', 获得连动' : '';
      record(
        `[动作结算] 玩家 ${data.player} 执行 [${data.actionType}] 完成 (得分: +${data.scoreDelta}${extra})`
      );
    });

    const unsubBurstExtra = eventBus.on('burst:extra_turn', data => {
      record(`[爆发连动] 玩家 ${data.player} 获得连动额外回合！`);
    });

    const unsubGameOver = eventBus.on('game:over', data => {
      record(`[对局结束] 胜者: ${data.winner ?? '平局'}, 原因: ${data.endReason ?? '未知'}`);
    });

    return () => {
      unsubTurnStart();
      unsubActionExec();
      unsubActionDone();
      unsubBurstExtra();
      unsubGameOver();
    };
  }

  /**
   * 获取格式化的历史记录
   */
  getHistory(): string[] {
    return [...this.history];
  }

  /**
   * 清空历史记录
   */
  clearHistory(): void {
    this.history = [];
  }
}
