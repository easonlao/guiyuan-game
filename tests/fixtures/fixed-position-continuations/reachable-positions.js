import { createHash } from 'node:crypto';
import { createInitialHeadlessState } from '../../../src/js/logic/headless/HeadlessMatch.js';
import { extractReachableFixedPosition } from '../../../src/js/logic/headless/FixedPositionContinuations.js';
import { runSeededMatch } from '../../../src/js/logic/headless/SeededMatch.js';

const FIXTURES = [
  {
    id: 'reachable-balanced-turn-7',
    classification: 'balanced',
    opportunity: 7,
    playerId: 'P1',
    stateSha256: 'e1b2d200049530433e781bc93366c0c6d15c7042484c2abe2e46504f8b88c769'
  },
  {
    id: 'reachable-extra-opportunity-turn-11',
    classification: 'extra-action-semantics',
    opportunity: 11,
    playerId: 'P2',
    stateSha256: '326057f86e1388cb4f0ec19a26f54b7d9d69b62d190a626068c457f160e08d3d'
  },
  {
    id: 'reachable-trailing-needs-disruption-turn-14',
    classification: 'trailing-needs-disruption',
    opportunity: 14,
    playerId: 'P1',
    stateSha256: '00c3013fc0e044fc6eb107c43aeb2a876731844de44893e772d5dce0535110a3'
  },
  {
    id: 'reachable-near-turn-limit-turn-19',
    classification: 'near-turn-limit',
    opportunity: 19,
    playerId: 'P2',
    stateSha256: '1d1feba4040717b4a05ab3a52efc186027acd8bbc95015a6f61c00eaf093ad89'
  }
];

export const baselineMatch = runSeededMatch({
  initialState: createInitialHeadlessState({ maxTurns: 20 }),
  seed: 1,
  strategies: { P1: 'build-priority', P2: 'attack-priority' }
});

export const reachableFixedPositions = Object.freeze(FIXTURES.map(({ stateSha256, ...selection }) => {
  const position = extractReachableFixedPosition(baselineMatch, selection);
  const digest = createHash('sha256').update(JSON.stringify(position.state)).digest('hex');
  if (digest !== stateSha256) {
    throw new Error(`frozen fixed-position fixture drifted: ${selection.id}`);
  }
  return position;
}));

export const reachableBurstPosition = extractReachableFixedPosition(baselineMatch, {
  id: 'reachable-burst-opportunity-turn-10',
  classification: 'has-burst-opportunity',
  opportunity: 10,
  playerId: 'P2'
});
const burstDigest = createHash('sha256').update(JSON.stringify(reachableBurstPosition.state)).digest('hex');
if (burstDigest !== 'e4571a29162fba0b036537222c9809289d3f0b792b4451202dc1eb8b5e1e12d7') {
  throw new Error('frozen burst fixed-position fixture drifted: reachable-burst-opportunity-turn-10');
}
