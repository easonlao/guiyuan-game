import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../../src/core/logic/EventBus.js';
import { createInitialGameState } from '../../src/core/logic/State.js';
import { WuXing, Polarity } from '../../src/core/types/index.js';

describe('EventBus (Layer 1 to Layer 3 UI Decoupling)', () => {
  it('should emit and listen to node:stateChanged events', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const unsubscribe = bus.on('node:stateChanged', handler);

    bus.emit('node:stateChanged', {
      player: 'P1',
      element: WuXing.WOOD,
      polarity: Polarity.YANG,
      prevLevel: 0,
      newLevel: 1
    });

    expect(handler).toHaveBeenCalledWith({
      player: 'P1',
      element: WuXing.WOOD,
      polarity: Polarity.YANG,
      prevLevel: 0,
      newLevel: 1
    });

    unsubscribe();
    bus.emit('node:stateChanged', {
      player: 'P1',
      element: WuXing.WOOD,
      polarity: Polarity.YANG,
      prevLevel: 1,
      newLevel: 2
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('diffAndEmit: should automatically detect changes between states and emit events', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('node:stateChanged', handler);

    const prevState = createInitialGameState();
    const nextState = {
      ...prevState,
      players: {
        ...prevState.players,
        P1: {
          ...prevState.players.P1,
          board: {
            ...prevState.players.P1.board,
            [WuXing.FIRE]: {
              ...prevState.players.P1.board[WuXing.FIRE],
              yang: 1 as const
            }
          }
        }
      }
    };

    bus.diffAndEmit(prevState, nextState);
    expect(handler).toHaveBeenCalledWith({
      player: 'P1',
      element: WuXing.FIRE,
      polarity: Polarity.YANG,
      prevLevel: 0,
      newLevel: 1
    });
  });

  it('diffAndEmit: should emit a YIN node:stateChanged for a yin-side change', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('node:stateChanged', handler);

    const prevState = createInitialGameState();
    const nextState = {
      ...prevState,
      players: {
        ...prevState.players,
        P1: {
          ...prevState.players.P1,
          board: {
            ...prevState.players.P1.board,
            [WuXing.WATER]: { yin: 1 as const, yang: 0 as const }
          }
        }
      }
    };

    bus.diffAndEmit(prevState, nextState);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      player: 'P1',
      element: WuXing.WATER,
      polarity: Polarity.YIN,
      prevLevel: 0,
      newLevel: 1
    });
  });

  it('diffAndEmit: should not emit anything when boards are unchanged', () => {
    const bus = new EventBus();
    const nodeHandler = vi.fn();
    const overHandler = vi.fn();
    bus.on('node:stateChanged', nodeHandler);
    bus.on('game:over', overHandler);

    const state = createInitialGameState();
    bus.diffAndEmit(state, state);

    expect(nodeHandler).not.toHaveBeenCalled();
    expect(overHandler).not.toHaveBeenCalled();
  });

  it('diffAndEmit: should emit game:over exactly once on the transition into game over', () => {
    const bus = new EventBus();
    const overHandler = vi.fn();
    bus.on('game:over', overHandler);

    const prevState = createInitialGameState();
    const nextState = {
      ...prevState,
      isGameOver: true,
      winner: 'P1' as const,
      endReason: 'GUI_YUAN' as const
    };

    bus.diffAndEmit(prevState, nextState);
    expect(overHandler).toHaveBeenCalledTimes(1);
    expect(overHandler).toHaveBeenCalledWith({ winner: 'P1', endReason: 'GUI_YUAN' });

    // 已在终局态不再重发
    bus.diffAndEmit(nextState, nextState);
    expect(overHandler).toHaveBeenCalledTimes(1);
  });
});
