/**
 * 布局原型一次性探针（开发用，非正式实现，非测试）。
 *
 * 目的：用**真实** `GameScene` 在无头环境跑到中盘，打印各候选种子 / 回合的盘面摘要，
 * 供 `layout-prototype.ts` 选定一个固定的「代表性相同对局状态」。
 * 驱动方式：玩家（P1）回合固定取候选动作的第一个（确定性），其余交给场景自身的表现时钟。
 *
 * 运行：npx tsx tools/minigame-preview/probe-layout-snapshot.ts
 */
import { GameScene } from '../../src/minigame/game-scene.js';
import { formatActionButton } from '../../src/minigame/action-button-formatter.js';
import { isNodeGuiYi } from '../../src/core/logic/State.js';
import { PlayerId, WuXing } from '../../src/core/types/domain.js';

const DT = 1 / 60;
const MAX_STEPS = 60 * 60 * 20;

interface Checkpoint {
  readonly seed: number;
  readonly round: number;
  readonly p1Levels: number;
  readonly p2Levels: number;
  readonly guiYi: number;
  readonly actions: number;
  readonly lastAction: string;
  readonly scores: string;
}

function boardLevels(scene: GameScene, player: PlayerId): number {
  const board = scene.turnManager.getState().players[player].board;
  let levels = 0;
  for (const element of Object.values(WuXing)) {
    levels += Math.max(0, board[element].yin) + Math.max(0, board[element].yang);
  }
  return levels;
}

function boardGuiYi(scene: GameScene, player: PlayerId): number {
  const board = scene.turnManager.getState().players[player].board;
  let count = 0;
  for (const element of Object.values(WuXing)) {
    if (isNodeGuiYi(board[element])) count += 1;
  }
  return count;
}

function scanSeed(seed: number, stopRound: number): Checkpoint[] {
  const scene = new GameScene({ width: 430, height: 900, safeTop: 24, safeBottom: 12, seed });
  scene.start();
  const checkpoints: Checkpoint[] = [];
  let steps = 0;
  while (steps < MAX_STEPS) {
    if (scene.phase === 'awaiting-player') {
      const state = scene.turnManager.getState();
      const actions = scene.turnManager.getAvailableActions();
      if (state.round >= 2) {
        checkpoints.push({
          seed,
          round: state.round,
          p1Levels: boardLevels(scene, 'P1'),
          p2Levels: boardLevels(scene, 'P2'),
          guiYi: boardGuiYi(scene, 'P1') + boardGuiYi(scene, 'P2'),
          actions: actions.length,
          lastAction: scene.lastAction.title,
          scores: `${state.players.P1.score}/${state.players.P2.score}`,
        });
      }
      if (state.round >= stopRound) break;
      const action = actions[0];
      if (action === undefined) break;
      const result = scene.turnManager.executeAction(action);
      if (!result.success) break;
      continue;
    }
    if (scene.phase === 'game-over') break;
    scene.update(DT);
    steps += 1;
  }
  return checkpoints;
}

const detailSeed = Number(process.argv[2]);
const detailRound = Number(process.argv[3]);

if (Number.isFinite(detailSeed) && Number.isFinite(detailRound)) {
  const scene = new GameScene({
    width: 430,
    height: 900,
    safeTop: 24,
    safeBottom: 12,
    seed: detailSeed,
  });
  scene.start();
  let steps = 0;
  while (steps < MAX_STEPS) {
    if (scene.phase === 'awaiting-player') {
      const state = scene.turnManager.getState();
      if (state.round >= detailRound) {
        const tianGan = scene.turnManager.getCurrentTianGan();
        console.log('state:', {
          round: state.round,
          maxRounds: state.maxRounds,
          currentPlayer: state.currentPlayer,
          score: `${state.players.P1.score}/${state.players.P2.score}`,
          tianGan,
          phase: scene.phase,
        });
        console.log('candidates:');
        for (const action of scene.turnManager.getAvailableActions()) {
          console.log(' ', JSON.stringify(formatActionButton(action)));
        }
        console.log(
          'last action:',
          scene.lastAction.title,
          '|',
          scene.lastAction.note ?? '',
          '|',
          scene.lastAction.changes
            .map(
              (change) =>
                `${change.player}·${change.element}${change.polarity} ${change.before}->${change.after}`,
            )
            .join(', '),
        );
        for (const player of ['P1', 'P2'] as const) {
          const board = state.players[player].board;
          console.log(
            player,
            Object.values(WuXing)
              .map((element) => `${element}:${board[element].yin}/${board[element].yang}`)
              .join(' '),
          );
        }
        break;
      }
      const action = scene.turnManager.getAvailableActions()[0];
      if (action === undefined) break;
      if (!scene.turnManager.executeAction(action).success) break;
      continue;
    }
    if (scene.phase === 'game-over') break;
    scene.update(DT);
    steps += 1;
  }
} else {
  const rows: Checkpoint[] = [];
  for (let seed = 1; seed <= 24; seed += 1) {
    rows.push(...scanSeed(seed, 5));
  }

  const header = ['seed', 'round', 'P1级', 'P2级', '归一', '候选', '比分', '上一招'];
  console.log(header.join('\t'));
  for (const row of rows) {
    console.log(
      [
        row.seed,
        row.round,
        row.p1Levels,
        row.p2Levels,
        row.guiYi,
        row.actions,
        row.scores,
        row.lastAction,
      ].join('\t'),
    );
  }
}
