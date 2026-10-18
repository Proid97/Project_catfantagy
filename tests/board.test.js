import test from 'node:test';
import assert from 'node:assert/strict';
import { hexToPixel, pixelToHex, hexCorners, boardCells, createRng, TILE_TYPES, createBoard } from '../src/board.js';

const near = (a, b) => Math.abs(a - b) < 1e-9;

test('칸 수는 3r(r+1)+1, 중복 없이 반지름 안에 있음', () => {
  for (let radius = 1; radius <= 5; radius++) {
    const cells = boardCells(radius);
    assert.equal(cells.length, 3 * radius * (radius + 1) + 1);
    assert.equal(new Set(cells.map(({ q, r }) => `${q},${r}`)).size, cells.length);
    for (const { q, r } of cells) assert.ok(Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= radius);
  }
});

test('칸 중심과 중심 근처 점이 같은 칸으로 돌아옴', () => {
  const size = 40;
  for (const cell of boardCells(4)) {
    const { x, y } = hexToPixel(cell.q, cell.r, size);
    assert.deepEqual(pixelToHex(x, y, size), cell);
    for (let angle = 0; angle < 360; angle += 45) {
      const rad = angle * Math.PI / 180;
      assert.deepEqual(pixelToHex(x + 0.4 * size * Math.cos(rad), y + 0.4 * size * Math.sin(rad), size), cell);
    }
  }
});

test('이웃 칸 중심 사이 거리는 sqrt(3) * size', () => {
  const size = 40;
  const { x, y } = hexToPixel(2, -1, size);
  for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]) {
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

test('반지름 4 판은 61칸, 종류별 개수와 숫자 규칙이 맞음', () => {
  const board = createBoard({ seed: 7 });
  assert.equal(board.radius, 4);
  assert.equal(board.seed, 7);
  assert.equal(board.tiles.length, 61);
  assert.deepEqual(board.tiles.map(({ q, r }) => ({ q, r })), boardCells(4));
  const counts = Object.fromEntries(Object.keys(TILE_TYPES).map(type => [type, board.tiles.filter(tile => tile.type === type).length]));
  assert.deepEqual(counts, { gold: 14, crystal: 14, wood: 14, fish: 14, barren: 5 });
  for (const tile of board.tiles) {
    if (tile.type === 'barren') assert.equal(tile.number, null);
    else assert.ok(Number.isInteger(tile.number) && tile.number >= 2 && tile.number <= 12);
  }
});

test('같은 시드는 같은 판, 다른 시드는 다른 판', (t) => {
  t.mock.method(Math, 'random', () => { throw new Error('시드가 있으면 Math.random을 쓰지 않아요'); });
  assert.deepEqual(createBoard({ radius: 4, seed: 123 }), createBoard({ radius: 4, seed: 123 }));
  assert.notDeepEqual(createBoard({ seed: 1 }).tiles, createBoard({ seed: 2 }).tiles);
});

test('난수 1000번이 모두 0 이상 1 미만', () => {
  const rng = createRng(42);
  for (let i = 0; i < 1000; i++) {
    const value = rng();
    assert.ok(value >= 0 && value < 1);
  }
});

test('잘못된 반지름·시드 거절', () => {
  for (const radius of [0, 9, 2.5, '4']) assert.throws(() => createBoard({ radius, seed: 1 }), RangeError);
  for (const seed of [NaN, 1.5, Infinity]) assert.throws(() => createBoard({ radius: 4, seed }), RangeError);
});
