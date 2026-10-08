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
});
