import test from 'node:test';
import assert from 'node:assert/strict';
import { hexToPixel, pixelToHex, hexCorners, hexDistance, createRng, MODES, TERRAIN, createBoard } from '../src/board.js';

const near = (a, b) => Math.abs(a - b) < 1e-9;
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const key = ({ q, r }) => `${q},${r}`;
const mean = list => list.reduce((sum, v) => sum + v, 0) / list.length;
const SHARE = { grass: 0.45, forest: 0.14, lake: 0.14, gold: 0.10, crystal: 0.07, rock: 0.10 };

// 시작 칸들에서 ok인 이웃으로 이어지는 칸 모두
function reach(starts, ok) {
  const seen = new Map(starts.map(c => [key(c), c]));
  for (const c of seen.values()) {
    for (const [dq, dr] of DIRS) {
      const n = { q: c.q + dq, r: c.r + dr };
      if (!seen.has(key(n)) && ok(n)) seen.set(key(n), n);
    }
  }
  return seen;
}

// 두 시작 자리에 붙은 칸끼리 가장 가까운 칸 수
const gap = (a, b) => Math.min(...a.hexes.flatMap(h => b.hexes.map(g => hexDistance(h, g))));
const centerOf = ({ cols, rows }) => ({ x: (cols - 1) * 0.75, y: (rows - 0.5) * Math.sqrt(3) / 2 });

// 판마다 같은 시드 200개를 쓴다. 한 번 만든 판은 다시 쓴다.
const cache = {};
const boardsOf = mode => cache[mode] ??= Array.from({ length: 200 }, (_, i) => createBoard({ mode, seed: i + 1 }));

test('칸 중심과 중심 근처 점이 같은 칸으로 돌아옴', () => {
  const size = 40;
  for (let q = -4; q <= 4; q++) {
    for (let r = -4; r <= 4; r++) {
      if (Math.abs(q + r) > 4) continue;
      const { x, y } = hexToPixel(q, r, size);
      assert.deepEqual(pixelToHex(x, y, size), { q, r });
      for (let angle = 0; angle < 360; angle += 45) {
        const rad = angle * Math.PI / 180;
        assert.deepEqual(pixelToHex(x + 0.4 * size * Math.cos(rad), y + 0.4 * size * Math.sin(rad), size), { q, r });
      }
    }
  }
});

test('이웃 칸 중심 사이 거리는 sqrt(3) * size', () => {
  const size = 40;
  const { x, y } = hexToPixel(2, -1, size);
  for (const [dq, dr] of DIRS) {
    const n = hexToPixel(2 + dq, -1 + dr, size);
    assert.ok(near(Math.hypot(n.x - x, n.y - y), Math.sqrt(3) * size));
  }
});

test('꼭짓점 6개는 중심에서 size 만큼 떨어지고 첫 꼭짓점은 오른쪽', () => {
  const corners = hexCorners(10, 20, 40);
  assert.equal(corners.length, 6);
  for (const [px, py] of corners) assert.ok(near(Math.hypot(px - 10, py - 20), 40));
  assert.ok(near(corners[0][0], 50));
  assert.ok(near(corners[0][1], 20));
});

test('육각 거리: 같은 칸 0, 이웃 1, 곧은 방향 n칸이면 n, 비스듬히도 칸 수로 센다', () => {
  const origin = { q: 0, r: 0 };
  assert.equal(hexDistance(origin, origin), 0);
  for (const [dq, dr] of DIRS) {
    assert.equal(hexDistance(origin, { q: dq, r: dr }), 1);
    assert.equal(hexDistance({ q: dq * 3, r: dr * 3 }, origin), 3);
  }
  assert.equal(hexDistance(origin, { q: 2, r: 1 }), 3);
  assert.equal(hexDistance(origin, { q: 2, r: -2 }), 2);
});

test('난수 1000번이 모두 0 이상 1 미만', () => {
  const rng = createRng(42);
  for (let i = 0; i < 1000; i++) {
    const value = rng();
    assert.ok(value >= 0 && value < 1);
  }
});

test('같은 시드·모드는 같은 판, 다른 시드는 다른 판', (t) => {
  t.mock.method(Math, 'random', () => { throw new Error('시드가 있으면 Math.random을 쓰지 않아요'); });
  for (const mode of Object.keys(MODES)) {
    assert.deepEqual(createBoard({ mode, seed: 123 }), createBoard({ mode, seed: 123 }));
    assert.notDeepEqual(createBoard({ mode, seed: 1 }).tiles, createBoard({ mode, seed: 2 }).tiles);
  }
});

test('잘못된 모드·시드 거절', () => {
  for (const mode of ['solo', 'toString', 1, null]) assert.throws(() => createBoard({ mode, seed: 1 }), RangeError);
  for (const seed of [NaN, 1.5, Infinity, '7']) assert.throws(() => createBoard({ seed }), RangeError);
});

for (const [mode, { cols, rows, land: target, players }] of Object.entries(MODES)) {
  test(`${MODES[mode].name}: 육지·지형·숫자·이어짐·시작 자리 규칙이 200개 시드에서 모두 맞음`, () => {
    const midX = centerOf({ cols, rows }).x;
    for (const board of boardsOf(mode)) {
      const why = `${mode} 시드 ${board.seed}`;
      assert.deepEqual([board.mode, board.cols, board.rows], [mode, cols, rows], why);
      const { tiles, starts } = board;
      const byKey = new Map(tiles.map(t => [key(t), t]));
      const inBox = ({ q, r }) => q >= 0 && q < cols && r + Math.floor(q / 2) >= 0 && r + Math.floor(q / 2) < rows;

      // 육지: 상자 안, 목표의 ±10%, 안쪽 바다 없음(바다는 모두 가장자리 바다와 이어짐)
      assert.equal(byKey.size, tiles.length, why);
      assert.ok(tiles.every(inBox), why);
      assert.ok(Math.abs(tiles.length - target) <= target * 0.1, `${why}: 육지 ${tiles.length}`);
      const sea = [];
      for (let q = 0; q < cols; q++) for (let row = 0; row < rows; row++) {
        const cell = { q, r: row - Math.floor(q / 2) };
        if (!byKey.has(key(cell))) sea.push({ ...cell, edge: q === 0 || q === cols - 1 || row === 0 || row === rows - 1 });
      }
      const outer = reach(sea.filter(c => c.edge), c => inBox(c) && !byKey.has(key(c)));
      assert.equal(outer.size, sea.length, `${why}: 안쪽 바다`);

      // 지형 개수와 숫자
      const counts = Object.fromEntries(Object.keys(TERRAIN).map(type => [type, 0]));
      for (const tile of tiles) {
        counts[tile.type]++;
        if (TERRAIN[tile.type].resource) assert.ok(Number.isInteger(tile.number) && tile.number >= 2 && tile.number <= 12, why);
        else assert.equal(tile.number, null, why);
      }
      // 풀밭은 나머지라 반올림 오차가 모여 최대 3칸까지 어긋난다.
      for (const [type, share] of Object.entries(SHARE)) {
        assert.ok(Math.abs(counts[type] - share * tiles.length) <= (type === 'grass' ? 3 : 1), `${why}: ${type} ${counts[type]}`);
      }

      // 지나갈 수 있는 칸은 하나로 이어짐
      const open = tiles.filter(t => TERRAIN[t.type].move !== 'blocked');
      const openKeys = new Set(open.map(key));
      assert.equal(reach([open[0]], c => openKeys.has(key(c))).size, open.length, `${why}: 끊긴 땅`);

      // 시작 자리: 세 칸이 서로 붙은 육지, 자원 2개 이상, 확률 점수 6 이상
      assert.equal(starts.length, players, why);
      starts.forEach((start, i) => {
        assert.equal(start.player, i, why);
        assert.equal(start.team, mode === 'team' ? i >> 1 : i, why);
        assert.equal(start.hexes.length, 3, why);
        const hexes = start.hexes.map(h => byKey.get(key(h)));
        assert.ok(hexes.every(Boolean), `${why}: 육지 아닌 시작`);
        for (const a of start.hexes) for (const b of start.hexes) if (a !== b) assert.equal(hexDistance(a, b), 1, why);
        const resource = hexes.filter(t => TERRAIN[t.type].resource);
        assert.ok(resource.length >= 2, why);
        assert.ok(resource.reduce((sum, t) => sum + 6 - Math.abs(7 - t.number), 0) >= 6, why);
        // 팀전: 0·1번은 왼쪽 반, 2·3번은 오른쪽 반
        if (mode === 'team') {
          const x = mean(start.hexes.map(h => hexToPixel(h.q, h.r, 1).x));
          assert.ok(i < 2 ? x < midX : x >= midX, `${why}: 팀 위치`);
        }
      });

      // 시작 자리 사이 거리
      for (let i = 0; i < players; i++) {
        for (let j = i + 1; j < players; j++) {
          const d = gap(starts[i], starts[j]);
          if (mode !== 'team') assert.ok(d >= 10, `${why}: ${i}-${j} 거리 ${d}`);
          else if (i >> 1 === j >> 1) assert.ok(d >= 7 && d <= 11, `${why}: 팀원 ${i}-${j} 거리 ${d}`);
          else assert.ok(d >= 12, `${why}: 적 ${i}-${j} 거리 ${d}`);
        }
      }
    }
  });

  test(`${MODES[mode].name}: 수정산은 육지 평균보다 판 가운데에 뚜렷이 가까움`, () => {
    const c = centerOf({ cols, rows });
    const dist = ({ q, r }) => { const p = hexToPixel(q, r, 1); return Math.hypot(p.x - c.x, p.y - c.y); };
    const boards = boardsOf(mode);
    const crystal = boards.flatMap(b => b.tiles.filter(t => t.type === 'crystal')).map(dist);
    const all = boards.flatMap(b => b.tiles).map(dist);
    // 쏠림이 없으면 비율이 1에 가깝고, 지금은 0.7 안팎이다.
    assert.ok(mean(crystal) < 0.85 * mean(all), `수정산 ${mean(crystal).toFixed(2)} / 육지 ${mean(all).toFixed(2)}`);
  });
}

test('4인 판 하나를 만드는 데 평균 100ms 미만', () => {
  for (const mode of ['ffa', 'team']) {
    const start = performance.now();
    for (let seed = 1001; seed <= 1050; seed++) createBoard({ mode, seed });
    const average = (performance.now() - start) / 50;
    assert.ok(average < 100, `${mode} 평균 ${average.toFixed(1)}ms`);
  }
});
