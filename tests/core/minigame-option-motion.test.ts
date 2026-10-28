import { describe, expect, it } from 'vitest';
import { ActionType, Polarity, WuXing } from '../../src/core/types/domain.js';
import { GameScene } from '../../src/minigame/game-scene.js';
import { BoardView } from '../../src/minigame/views/board-view.js';
import { RuneFlightView } from '../../src/minigame/views/rune-flight-view.js';
import { CharacterView } from '../../src/minigame/views/character-view.js';
import { gameStateWith } from '../../tools/BoardFixture.js';
import { WUXING_PALETTE } from '../../src/minigame/pixel-art.js';
import { CHARACTER_ATLAS_FRAMES } from '../../src/minigame/character-sprite.js';
import { RecordingContext } from './helpers/recording-context.js';

const stem = { name: '甲', element: WuXing.WOOD, polarity: Polarity.YANG };

describe('Option animation timing', () => {
  it('anticipates at the source, hits once on arrival, and completes after the landing effect', () => {
    const board = new BoardView();
    const view = new RuneFlightView({ board, flightDuration: 0.5, impactDuration: 0.3 });
    const events: string[] = [];
    view.playEntrance(stem);
    view.flyTo('P2', WuXing.EARTH, Polarity.YANG, {
      actionType: ActionType.ATK,
      onImpact: () => events.push('hit'),
      onComplete: () => events.push('done'),
    });
    view.update(0.05);
    expect(view.position).toEqual({ x: 0, y: 0 });
    view.update(0.2);
    expect(view.position).not.toEqual({ x: 0, y: 0 });
    expect(events).toEqual([]);
    view.update(0.25);
    const target = board.getSlot('P2', WuXing.EARTH, Polarity.YANG);
    expect(view.position).toEqual({ x: target.x, y: target.y });
    expect(events).toEqual(['hit']);
    expect(view.isAnimating).toBe(true);
    view.update(0.3);
    view.update(1);
    expect(events).toEqual(['hit', 'done']);
  });

  it('a blocked pass dissolves at the center without a board hit', () => {
    const view = new RuneFlightView({ board: new BoardView(), centerX: 120, centerY: 300 });
    const events: string[] = [];
    view.playEntrance(stem);
    view.flyTo('P1', WuXing.WOOD, Polarity.YANG, {
      actionType: ActionType.PASS,
      onImpact: () => events.push('hit'),
      onComplete: () => events.push('done'),
    });
    view.update(0.45);
    expect(view.position).toEqual({ x: 120, y: 300 });
    view.update(1);
    expect(events).toEqual(['done']);
    expect(view.phase).toBe('absorbed');
  });

  it('restarting or cancelling before arrival cannot deliver a stale hit or completion', () => {
    for (const cancel of [true, false]) {
      const view = new RuneFlightView({ board: new BoardView() });
      const events: string[] = [];
      view.playEntrance(stem);
      view.flyTo('P2', WuXing.EARTH, Polarity.YANG, {
        actionType: ActionType.BURST_ATK,
        onImpact: () => events.push('hit'),
        onComplete: () => events.push('done'),
      });
      view.update(0.2);
      if (cancel) view.cancel();
      else view.playEntrance(stem);
      view.update(2);
      expect(events).toEqual([]);
      expect(view.isAnimating).toBe(false);
    }
  });

  it('all eight options draw in travel and landing phases without leaking canvas saves', () => {
    for (const actionType of Object.values(ActionType)) {
      const view = new RuneFlightView({ board: new BoardView() });
      view.playEntrance(stem);
      view.flyTo('P1', WuXing.FIRE, Polarity.YANG, { actionType });
      view.update(0.3);
      const travel = new RecordingContext();
      view.render(travel.asContext());
      expect(travel.drawCallCount()).toBeGreaterThan(0);
      expect(travel.calls.filter((call) => call === 'save').length).toBe(
        travel.calls.filter((call) => call === 'restore').length,
      );
      view.update(0.4);
      const landing = new RecordingContext();
      view.render(landing.asContext());
      if (actionType === ActionType.PASS) expect(landing.drawCallCount()).toBe(0);
      else expect(landing.drawCallCount()).toBeGreaterThan(0);
      expect(landing.calls.filter((call) => call === 'save').length).toBe(
        landing.calls.filter((call) => call === 'restore').length,
      );
    }
  });
});

describe('Scene landing and character motion', () => {
  function makeScene(
    initialState = gameStateWith({
      P1: { [WuXing.WOOD]: { yin: 1, yang: 1 } },
      P2: { [WuXing.EARTH]: { yin: 1, yang: -1 } },
    }),
  ): GameScene {
    const scene = new GameScene({
      width: 390,
      height: 844,
      initialState,
      prng: { next: () => 0, nextInt: () => 0, getState: () => 0 },
      autoExecuteDelay: 60,
      aiThinkDelay: 60,
    });
    scene.start();
    scene.update(0.44);
    return scene;
  }

  it('core commits immediately, but the board and opponent react only when the attack lands', () => {
    const scene = makeScene();
    const action = scene.turnManager
      .getAvailableActions()
      .find((candidate) => candidate.actionType === ActionType.ATK)!;
    expect(scene.turnManager.executeAction(action).success).toBe(true);
    expect(scene.turnManager.getState().players.P2.board[WuXing.EARTH].yin).toBe(0);
    expect(scene.turnManager.getState().currentPlayer).toBe('P2');
    expect(scene.characters.currentPlayer).toBe('P1');
    expect(scene.board.getSlot('P2', WuXing.EARTH, Polarity.YIN).level).toBe(1);
    expect(scene.characters.getExpression('P2')).toBe('idle');
    scene.update(0.5);
    expect(scene.characters.getExpression('P1')).toBe('attack');
    expect(scene.characters.getExpression('P2')).toBe('idle');
    expect(scene.x).toBe(0);
    expect(scene.y).toBe(0);
    scene.update(0.05);
    expect(scene.board.getSlot('P2', WuXing.EARTH, Polarity.YIN).level).toBe(0);
    expect(scene.characters.getExpression('P2')).not.toBe('celebrate');
    for (let i = 0; i < 600 && scene.phase === 'flying'; i++) scene.update(1 / 120);
    expect(scene.x).toBe(0);
    expect(scene.y).toBe(0);
    expect(scene.characters.getExpression('P1')).toBe('idle');
    expect(scene.phase).toBe('result');
    expect(scene.characters.currentPlayer).toBe('P1');
    scene.update(0.66);
    expect(scene.characters.currentPlayer).toBe('P2');
  });

  it('reinforcement lands on the actual changed side when the yin target is already full', () => {
    const scene = makeScene(
      gameStateWith({
        P1: { [WuXing.WOOD]: { yin: 1, yang: 1 }, [WuXing.FIRE]: { yin: 2, yang: 0 } },
        P2: { [WuXing.EARTH]: { yin: -1, yang: -1 } },
      }),
    );
    const action = scene.turnManager
      .getAvailableActions()
      .find((candidate) => candidate.actionType === ActionType.BURST)!;
    expect(scene.turnManager.executeAction(action).success).toBe(true);
    scene.update(0.55);
    const target = scene.board.getSlot('P1', WuXing.FIRE, Polarity.YANG);
    expect(scene.runeFlight.position).toEqual({ x: target.x, y: target.y });
    expect(target.level).toBe(2);
  });

  it('restart during flight clears the old landing, celebration and character motion', () => {
    const scene = makeScene();
    const action = scene.turnManager
      .getAvailableActions()
      .find((candidate) => candidate.actionType === ActionType.ATK)!;
    scene.turnManager.executeAction(action);
    scene.update(0.2);
    scene.restart(42);
    scene.update(0.55);
    expect(scene.characters.getExpression('P2')).toBe('idle');
    expect(scene.characters.getExpression('P1')).toBe('idle');
    expect(scene.x).toBe(0);
    expect(scene.phase).not.toBe('flying');
  });

  it('a short custom timeline still anticipates, strikes, recovers and can be interrupted', () => {
    const view = new CharacterView({ width: 390 });
    view.playAction('P1', ActionType.ATK, 0.1, 0.1);
    expect(view.getExpression('P1')).toBe('cast');
    view.updateTimers(0.03);
    expect(view.getExpression('P1')).toBe('attack');
    view.updateTimers(0.14);
    expect(view.getExpression('P1')).toBe('attack');
    view.updateTimers(0.03);
    expect(view.getExpression('P1')).toBe('idle');
    view.playAction('P2', ActionType.BURST_ATK, 0.5, 0.3);
    view.setExpression('P2', 'hurt', 0.2);
    view.updateTimers(0.1);
    expect(view.getExpression('P2')).toBe('hurt');
    view.resetFeedback();
    view.updateTimers(1);
    expect(view.getExpression('P2')).toBe('idle');
  });
});

describe('Animation continuity and target identity', () => {
  it('crossfades key poses briefly at a shared body scale, then keeps only the new pose', () => {
    const view = new CharacterView({ width: 390 });
    view.setSpriteAtlas({
      image: {} as CanvasImageSource,
      width: 1254,
      height: 1254,
      frames: CHARACTER_ATLAS_FRAMES,
    });
    view.playAction('P1', ActionType.ATK, 0.55, 0.35);
    view.updateTimers(0.04);
    const midway = new RecordingContext();
    view.render(midway.asContext());
    const layers = midway.images.filter((image) => image.x < 100);
    expect(layers).toHaveLength(2);
    expect(layers[0].alpha).toBeCloseTo(0.5);
    expect(layers[1].alpha).toBeCloseTo(0.5);
    expect(layers[0].w / layers[0].sw).toBeCloseTo(layers[1].w / layers[1].sw);
    expect(layers[0].y + (338 - layers[0].sy) * (layers[0].h / layers[0].sh)).toBeCloseTo(
      layers[1].y + (338 - layers[1].sy) * (layers[1].h / layers[1].sh),
    );
    view.updateTimers(0.15);
    const released = new RecordingContext();
    view.render(released.asContext());
    expect(released.images.filter((image) => image.x < 100)).toHaveLength(1);
    view.resetFeedback();
    const reset = new RecordingContext();
    view.render(reset.asContext());
    expect(reset.images).toHaveLength(2);
    expect(reset.images[0].sx).toBe(CHARACTER_ATLAS_FRAMES.P1.idle.x);
  });

  it('rune scale remains continuous across charge and release', () => {
    const view = new RuneFlightView({ board: new BoardView(), flightDuration: 0.5 });
    view.playEntrance(stem);
    view.flyTo('P1', WuXing.FIRE, Polarity.YANG, { actionType: ActionType.TRANS });
    const scale = (): number => {
      const ctx = new RecordingContext();
      view.render(ctx.asContext());
      return ctx.scales.find((scale) => scale.x !== 1)?.x ?? 1;
    };
    view.update(0.0895);
    const before = scale();
    view.update(0.001);
    expect(Math.abs(scale() - before)).toBeLessThan(0.005);
    view.update(0.2);
    expect(scale()).toBeCloseTo(0.62);
  });

  it('a second changed side receives one elemental pulse without extra rays', () => {
    const board = new BoardView();
    const view = new RuneFlightView({ board });
    view.playEntrance(stem);
    view.flyTo('P2', WuXing.EARTH, Polarity.YIN, {
      actionType: ActionType.BURST_ATK,
      secondaryPolarity: Polarity.YANG,
    });
    view.update(0.75);
    const ctx = new RecordingContext();
    view.render(ctx.asContext());
    const target = board.getSlot('P2', WuXing.EARTH, Polarity.YANG);
    expect(ctx.arcs.some((arc) => arc.x === target.x && arc.y === target.y)).toBe(true);
    const pulse = ctx.paths.find(
      (path) => path.offset.x === 0 && path.offset.y === 0 && path.strokeWidth === 2,
    );
    expect(pulse?.color).toBe(WUXING_PALETTE[WuXing.EARTH].light);
    expect(ctx.paths.every((path) => path.points.length === 0)).toBe(true);
  });
});
