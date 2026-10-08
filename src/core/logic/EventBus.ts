/**
 * 归元弈 (Guiyuan) - 轻量事件总线 (EventBus)
 * 用于 Layer 1 逻辑层与 Layer 3 Cocos 表现层解耦
 */

import { ActionType, GameState, PlayerId, WuXing, Polarity, NodeLevel } from '../types/domain.js';

export interface GameEvents {
  'node:stateChanged': {
    player: PlayerId;
    element: WuXing;
    polarity: Polarity;
    prevLevel: NodeLevel;
    newLevel: NodeLevel;
  };
  'action:executed': {
    player: PlayerId;
    actionType: ActionType;
    scoreDelta: number;
    extraTurn: boolean;
  };
  'game:over': {
    winner: PlayerId | 'DRAW' | null;
    endReason: 'GUI_YUAN' | 'MAX_ROUNDS' | null;
  };
}

export type EventKey = keyof GameEvents;
export type EventHandler<K extends EventKey> = (data: GameEvents[K]) => void;

export class EventBus {
  private readonly listeners = new Map<EventKey, Set<EventHandler<any>>>();

  on<K extends EventKey>(event: K, handler: EventHandler<K>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);

    return () => this.off(event, handler);
  }

  off<K extends EventKey>(event: K, handler: EventHandler<K>): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  emit<K extends EventKey>(event: K, data: GameEvents[K]): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach(h => {
        try {
          h(data);
        } catch (e) {
          console.error(`[EventBus] Error handling event ${String(event)}:`, e);
        }
      });
    }
  }

  /**
   * 对比新旧状态，自动向表现层派发差量事件
   */
  diffAndEmit(prevState: GameState, nextState: GameState): void {
    // 派发节点变动事件
    const players: PlayerId[] = ['P1', 'P2'];
    const elements = Object.values(WuXing);

    for (const player of players) {
      const prevBoard = prevState.players[player].board;
      const nextBoard = nextState.players[player].board;

      for (const el of elements) {
        if (prevBoard[el].yin !== nextBoard[el].yin) {
          this.emit('node:stateChanged', {
            player,
            element: el,
            polarity: Polarity.YIN,
            prevLevel: prevBoard[el].yin,
            newLevel: nextBoard[el].yin
          });
        }
        if (prevBoard[el].yang !== nextBoard[el].yang) {
          this.emit('node:stateChanged', {
            player,
            element: el,
            polarity: Polarity.YANG,
            prevLevel: prevBoard[el].yang,
            newLevel: nextBoard[el].yang
          });
        }
      }
    }

    // 终局事件
    if (!prevState.isGameOver && nextState.isGameOver) {
      this.emit('game:over', {
        winner: nextState.winner,
        endReason: nextState.endReason
      });
    }
  }
}
