import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { playOut } from '../scripts/simulate.mjs';
import { parseCards } from '../scripts/cards-data.mjs';
import { createBoard } from '../src/board.js';
import { createGame } from '../src/game/rules.js';
import { botStep } from '../src/game/bot.js';

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

test('건물은 카드가 아니라 건설: 종족 덱은 유닛만, 비용을 내고 종류마다 최대 개수까지', async () => {
  const cards = parseCards(await readFile(new URL('../docs/cards.md', import.meta.url), 'utf8'));
  const g = createGame({ board: createBoard({ mode: 'duel', seed: 7 }), races: ['warrior', 'warrior'], cards });
  const s = g.state;
  for (const q of s.players) assert.ok([...q.raceDeck, ...q.hand].every(uid => g.card(uid).type !== 'building'));
  while (s.phase !== 'main') assert.ok(g.apply(botStep(g, s.pending[0]?.player ?? s.current)).ok);
  const p = s.current;
  s.players[p].resources = { gold: 50, crystal: 50, wood: 50, fish: 50 };
  for (let i = 0; i < 12 && g.buildSpots(p).length < 2; i++) assert.ok(g.apply({ type: 'road', player: p, edge: g.roadSpots(p)[0] }).ok);
  assert.ok(g.buildSpots(p).length >= 2);
  const card = 'building-warrior-training'; // 최대 1개
  const before = { ...s.players[p].resources };
  assert.ok(g.apply({ type: 'build', player: p, card, vertex: g.buildSpots(p)[0] }).ok);
  assert.deepEqual(s.players[p].resources, { ...before, gold: before.gold - 1, wood: before.wood - 1, fish: before.fish - 1 });
  assert.match(g.apply({ type: 'build', player: p, card, vertex: g.buildSpots(p)[0] }).error, /1개까지/);
  assert.equal(g.apply({ type: 'build', player: p, card: 'building-mage-tower', vertex: g.buildSpots(p)[0] }).ok, false); // 다른 종족 건물
});
