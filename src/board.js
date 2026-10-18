// 임시: 경제 설계 전까지 쓰는 칸 종류
export const TILE_TYPES = {
  gold: { name: '금광' },
  crystal: { name: '수정산' },
  wood: { name: '숲' },
  fish: { name: '호수' },
  barren: { name: '빈 땅' },
};

// 임시: 카탄식 숫자 묶음. 이 게임에는 도둑이 없어서 7도 넣는다.
const NUMBER_BASE = [2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12];

export function hexToPixel(q, r, size) {
  return { x: size * 1.5 * q, y: size * Math.sqrt(3) * (r + q / 2) };
}

export function pixelToHex(x, y, size) {
  const q = (2 / 3 * x) / size;
  const r = (-1 / 3 * x + Math.sqrt(3) / 3 * y) / size;
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq + 0, r: rr + 0 };
}

export function hexCorners(x, y, size) {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = Math.PI / 3 * i;
    return [x + size * Math.cos(angle), y + size * Math.sin(angle)];
  });
}

export function boardCells(radius) {
  const cells = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) cells.push({ q, r });
  }
  return cells;
}

export function createRng(seed) {
  let a = seed | 0;
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function shuffle(list, rng) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export function createBoard({ radius = 4, seed = Math.floor(Math.random() * 2 ** 32) } = {}) {
  if (!Number.isInteger(radius) || radius < 1 || radius > 8) throw new RangeError('판 크기는 1~8 사이 정수');
  if (!Number.isInteger(seed)) throw new RangeError('시드는 정수여야 해요');
  const cells = boardCells(radius);
  const rng = createRng(seed);
  const barren = Math.round(cells.length * 0.08);
  const resources = Object.keys(TILE_TYPES).filter(type => type !== 'barren');
  const rest = cells.length - barren;
  const types = shuffle([
    ...resources.flatMap((type, i) => Array(Math.floor(rest / 4) + (i < rest % 4 ? 1 : 0)).fill(type)),
    ...Array(barren).fill('barren'),
  ], rng);
  const numbers = shuffle(Array.from({ length: rest }, (_, i) => NUMBER_BASE[i % NUMBER_BASE.length]), rng);
  let next = 0;
  const tiles = cells.map((cell, i) => ({ ...cell, type: types[i], number: types[i] === 'barren' ? null : numbers[next++] }));
  return { radius, seed, tiles };
}
