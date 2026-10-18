import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoard, hexDistance } from '../src/board.js';
import { UNKNOWN, KNOWN, VISIBLE, SIGHT, vision, startKnown, pieceSeen, tileKey } from '../src/vision.js';

// 가운데 (0, 0)에서 반지름 6칸 안이 모두 풀밭인 시험용 판. 0번 왕성은 가운데 꼭짓점, 1번은 멀리.
const tiles = [];
for (let q = -6; q <= 6; q++) for (let r = -6; r <= 6; r++) if (Math.abs(q + r) <= 6) tiles.push({ q, r, type: 'grass', number: null });
const corner = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 1, r: -1 }];
const far = [{ q: -5, r: 5 }, { q: -4, r: 5 }, { q: -4, r: 4 }];
const plain = (starts, extra = {}) => ({ tiles, ports: [], starts, ...extra });
const duel = plain([{ player: 0, team: 0, hexes: corner }, { player: 1, team: 1, hexes: far }]);
const visibleOf = ({ state }) => [...state].filter(([, level]) => level === VISIBLE).map(([key]) => key).sort();
const within = (hexes, n) => tiles.filter(t => hexes.some(h => hexDistance(h, t) <= n)).map(tileKey).sort();

test('왕성 시야: 붙은 세 칸과 그 이웃(12칸). 상대 왕성 쪽은 보이지 않음', () => {
  const seen = visibleOf(vision(duel));
  assert.equal(SIGHT.castle, 1);
  assert.equal(seen.length, 12);
  assert.deepEqual(seen, within(corner, 1));
  for (const h of far) assert.ok(!seen.includes(tileKey(h)));
  // 상대(1번)가 보는 판은 반대
  assert.deepEqual(visibleOf(vision(duel, { viewer: 1 })), within(far, 1));
});

test('마을은 붙은 세 칸, 길은 변 양쪽 두 칸, 유닛은 2칸을 봄', () => {
  const look = (kind, hexes) => visibleOf(vision(duel, { pieces: [{ player: 0, kind, hexes }] }));
  assert.deepEqual(look('village', corner), corner.map(tileKey).sort());
  assert.deepEqual(look('road', corner.slice(0, 2)), corner.slice(0, 2).map(tileKey).sort());
  assert.equal(look('unit', [{ q: 0, r: 0 }]).length, 19);
});

test('한 번 본 칸은 시야에서 벗어나도 앎으로 남고, 넘긴 known은 바꾸지 않음', () => {
  const first = vision(duel);
  const before = new Set(first.known);
  // 왕성 대신 멀리 있는 유닛만 남았다고 치면, 처음 본 칸은 앎(1)이다.
  const next = vision(duel, { pieces: [{ player: 0, kind: 'unit', hexes: [{ q: -3, r: 0 }] }], known: first.known });
  assert.deepEqual(first.known, before);
  for (const key of within(corner, 1)) assert.equal(next.state.get(key), within([{ q: -3, r: 0 }], 2).includes(key) ? VISIBLE : KNOWN, key);
  assert.equal(next.state.get('6,0'), UNKNOWN);
  assert.ok(within([{ q: -3, r: 0 }], 2).every(key => next.known.has(key)));
});

test('처음부터 교환소 칸과 숫자 6·8 칸은 앎, 나머지 안 보이는 칸은 모름', () => {
  for (const mode of ['duel', 'ffa', 'team']) {
    for (let seed = 1; seed <= 20; seed++) {
      const board = createBoard({ mode, seed });
      const { state, known } = vision(board);
      const start = startKnown(board);
      const ports = new Set(board.ports.map(tileKey));
      assert.ok(board.ports.every(port => state.get(tileKey(port)) >= KNOWN));
      for (const tile of board.tiles) {
        const key = tileKey(tile);
        const hot = tile.number === 6 || tile.number === 8;
        assert.equal(start.has(key), hot || ports.has(key), key);
        if (state.get(key) !== VISIBLE) assert.equal(state.get(key), hot || ports.has(key) ? KNOWN : UNKNOWN, `${mode} ${seed} ${key}`);
        assert.equal(known.has(key), state.get(key) !== UNKNOWN);
      }
    }
  }
});

test('팀전은 팀원 시야를 함께 쓰고, 1대1·개인전은 나만. 상대 왕성은 붙은 칸이 보일 때만 보임', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const team = createBoard({ mode: 'team', seed });
    const { state } = vision(team);
    // 나(0)와 팀원(1)의 왕성 둘레는 보이고, 상대 팀(2, 3) 왕성은 12칸 넘게 떨어져 안 보인다.
    for (const player of [0, 1]) for (const key of team.tiles.filter(t => team.starts[player].hexes.some(h => hexDistance(h, t) <= 1)).map(tileKey)) assert.equal(state.get(key), VISIBLE);
    for (const player of [2, 3]) assert.equal(pieceSeen(state, team.starts[player].hexes), false);
    assert.equal(pieceSeen(state, team.starts[1].hexes), true);
    for (const mode of ['duel', 'ffa']) {
      const board = createBoard({ mode, seed });
      const seen = vision(board).state;
      const mine = new Set(board.tiles.filter(t => board.starts[0].hexes.some(h => hexDistance(h, t) <= 1)).map(tileKey));
      for (const [key, level] of seen) assert.equal(level === VISIBLE, mine.has(key), `${mode} ${seed} ${key}`);
      for (const start of board.starts.slice(1)) assert.equal(pieceSeen(seen, start.hexes), false);
    }
  }
  // 상대 왕성에 붙은 칸 하나만 보여도 그 왕성이 보인다.
  const { state } = vision(duel, { pieces: [{ player: 0, kind: 'unit', hexes: [{ q: -2, r: 4 }] }] });
  assert.equal(hexDistance({ q: -2, r: 4 }, far[2]), 2);
  assert.equal(pieceSeen(state, far), true);
});
