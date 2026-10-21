import test from 'node:test';
import assert from 'node:assert/strict';
import { playOut } from '../scripts/simulate.mjs';

// 봇끼리 끝까지 두며 명령마다 규칙 검사(scripts/simulate.mjs의 invariants)를 한다.
const RACES = ['warrior', 'mage', 'assassin'];
const games = [
  ...Array.from({ length: 9 }, (_, i) => ({ mode: 'duel', seed: 101 + i, races: [RACES[i % 3], RACES[Math.floor(i / 3)]] })),
  ...[0, 1].map(i => ({ mode: 'ffa', seed: 201 + i, races: ['warrior', 'mage', 'assassin', RACES[i]] })),
  ...[0, 1].map(i => ({ mode: 'team', seed: 301 + i, races: ['mage', 'warrior', RACES[i + 1], 'assassin'] })),
];

for (const game of games) {
  test(`${game.mode} 시드 ${game.seed}: 규칙을 어기지 않고 끝까지 간다`, () => {
    const result = playOut(game);
    assert.deepEqual(result.problems, []);
    assert.equal(result.over, true);
    assert.equal(result.rejects, 0); // 봇이 규칙에 어긋난 명령을 내지 않음
  });
}

test('같은 시드·같은 명령이면 같은 결과(앞 판이 뒤 판에 영향을 주지 않음)', () => {
  const keep = ({ rounds, winner, steps, how, castles }) => ({ rounds, winner, steps, how, castles });
  const first = keep(playOut(games[1]));
  playOut(games[5]);
  assert.deepEqual(keep(playOut(games[1])), first);
});
