// 임시: 모드별 판 크기(가로×세로 칸), 육지 칸 수, 인원. 근거는 docs/game-design.md 2장
export const MODES = {
  duel: { name: '1대1', cols: 20, rows: 13, land: 160, players: 2 },
  ffa: { name: '4인 개인전', cols: 28, rows: 18, land: 315, players: 4 },
  team: { name: '2대2 팀전', cols: 28, rows: 18, land: 315, players: 4 },
};

export const TERRAIN = {
  grass: { name: '풀밭', move: 'open', resource: null },
  forest: { name: '숲', move: 'rough', resource: 'wood' },
  lake: { name: '호수', move: 'blocked', resource: 'fish' },
  gold: { name: '금광', move: 'rough', resource: 'gold' },
  crystal: { name: '수정산', move: 'rough', resource: 'crystal' },
  rock: { name: '바위산', move: 'blocked', resource: null },
};

// 임시: 육지 기준 비율. 풀밭은 나머지. 수정산을 먼저 놓아야 가운데 자리를 고를 수 있다.
const SHARE = { crystal: 0.07, forest: 0.14, lake: 0.14, gold: 0.10, rock: 0.10 };

// 임시: 자원이 뭉치지 않게 하는 한도. 같은 종류가 이어진 덩어리는 최대 3칸(수정산 2칸).
// 육지 한 칸과 그 육지 이웃(최대 7칸) 안의 자원 칸(숲·호수·금광·수정산)은 최대 4칸. 바위산·풀밭은 세지 않는다.
const GROUP_MAX = { crystal: 2 };
const GROUP_MAX_DEFAULT = 3;
const DENSE_MAX = 4;

// 임시: 카탄식 숫자 묶음. 이 게임에는 도둑이 없어서 7도 넣는다.
const NUMBER_BASE = [2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12];

// 이웃 여섯 방향. 이웃한 두 방향은 서로도 이웃이라 꼭짓점 하나를 이룬다.
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

// 임시: 대륙 모양. 타원 거리에 더할 잡음 세기. 클수록 해안선이 거칠다.
const COAST_NOISE = 1.5;

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

export function hexDistance(a, b) {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
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

const pick = (list, rng) => list[Math.floor(rng() * list.length)];

// 가로 cols × 세로 rows 상자의 칸. 번호 i = 열 * rows + 줄, 축 좌표 r = 줄 - floor(열 / 2).
// ring[i]는 방향별 이웃(판 밖은 -1), nbrs[i]는 판 안의 이웃, center[i]는 상자 중심에서 잰 타원 거리(가장자리 근처가 1).
function makeGrid(cols, rows) {
  const at = (q, r) => {
    const row = r + Math.floor(q / 2);
    return q >= 0 && q < cols && row >= 0 && row < rows ? q * rows + row : -1;
  };
  const hex = Array.from({ length: cols * rows }, (_, i) => {
    const q = Math.floor(i / rows);
    return { q, r: i % rows - Math.floor(q / 2) };
  });
  const px = hex.map(({ q, r }) => hexToPixel(q, r, 1));
  const ring = hex.map(({ q, r }) => DIRS.map(([dq, dr]) => at(q + dq, r + dr)));
  const cx = (cols - 1) * 0.75;
  const cy = (rows - 0.5) * Math.sqrt(3) / 2;
  const center = px.map(({ x, y }) => Math.hypot((x - cx) / (cols * 0.75), (y - cy) / (rows * Math.sqrt(3) / 2)));
  return { cols, rows, hex, px, ring, nbrs: ring.map(list => list.filter(n => n >= 0)), center, midX: cx };
}

// seeds에서 ok인 이웃으로 이어지는 칸 모두
function flood(nbrs, seeds, ok) {
  const list = [...new Set(seeds)];
  const seen = new Set(list);
  for (let i = 0; i < list.length; i++) {
    for (const n of nbrs[list[i]]) {
      if (!seen.has(n) && ok(n)) { seen.add(n); list.push(n); }
    }
  }
  return list;
}

// 대륙: 중심에서 가까울수록 낮고 부드러운 잡음을 더한 점수가 낮은 칸 target개를 고른다.
// 가장 큰 덩어리만 남기고, 바다에 둘러싸인 구멍은 메운다(안쪽 바다는 없고 호수는 지형으로 둔다). 육지 칸 번호를 돌려준다.
function makeLand({ cols, rows, px, nbrs, center }, target, rng) {
  let noise = px.map(() => rng());
  for (let pass = 0; pass < 2; pass++) {
    noise = noise.map((v, i) => (v + nbrs[i].reduce((sum, n) => sum + noise[n], 0)) / (nbrs[i].length + 1));
  }
  const all = [...px.keys()];
  const score = center.map((c, i) => c + COAST_NOISE * noise[i]);
  const picked = new Set([...all].sort((a, b) => score[a] - score[b]).slice(0, target));
  let main = [];
  const seen = new Set();
  for (const i of picked) {
    if (seen.has(i)) continue;
    const part = flood(nbrs, [i], n => picked.has(n));
    part.forEach(n => seen.add(n));
    if (part.length > main.length) main = part;
  }
  const solid = new Set(main);
  const edge = all.filter(i => {
    const q = Math.floor(i / rows);
    const row = i % rows;
    return !solid.has(i) && (q === 0 || q === cols - 1 || row === 0 || row === rows - 1);
  });
  const sea = new Set(flood(nbrs, edge, n => !solid.has(n)));
  return all.filter(i => !sea.has(i));
}

// 지형: 비율대로 정확히 세어, 씨앗 한 칸에서 작은 덩어리(1~3칸, 수정산 1~2칸)로 자라게 놓는다. 나머지는 풀밭.
// 같은 종류 덩어리끼리는 맞닿지 않게 하고(합쳐져 커지지 않게), 자원 칸이 한 칸 둘레에 DENSE_MAX개를 넘지 않게 한다.
// 호수·바위산 덩어리가 지나갈 수 있는 칸을 끊으면 그 덩어리만 물리고 다른 곳에서 다시 놓는다.
function paintTerrain({ nbrs, center }, land, rng) {
  const kind = [];
  const free = new Set(land);
  // dense[i]: 육지 칸 i와 그 육지 이웃 중 자원 칸 수. 바다 칸은 undefined.
  const dense = [];
  land.forEach(i => { dense[i] = 0; });
  const joined = () => {
    const open = land.filter(i => kind[i] === undefined || TERRAIN[kind[i]].move !== 'blocked');
    const walk = new Set(open);
    return flood(nbrs, [open[0]], n => walk.has(n)).length === open.length;
  };
  // 칸 c를 type으로 놓거나(add) 되돌린다. 자원이면 c와 그 육지 이웃의 dense를 함께 고친다.
  const mark = (c, type, add) => {
    if (add) { kind[c] = type; free.delete(c); } else { delete kind[c]; free.add(c); }
    if (TERRAIN[type].resource) for (const x of [c, ...nbrs[c]]) if (dense[x] !== undefined) dense[x] += add ? 1 : -1;
  };
  for (const [type, share] of Object.entries(SHARE)) {
    let left = Math.round(share * land.length);
    const max = GROUP_MAX[type] ?? GROUP_MAX_DEFAULT;
    const resource = TERRAIN[type].resource;
    // 놓을 수 있는 칸: 비었고, 같은 종류의 다른 덩어리와 맞닿지 않고, 자원이면 둘레가 이미 꽉 차지 않음
    const fits = (c, group) => free.has(c)
      && nbrs[c].every(n => kind[n] !== type || group.includes(n))
      && (!resource || [c, ...nbrs[c]].every(x => dense[x] === undefined || dense[x] < DENSE_MAX));
    // 놓을 곳이 끝내 없으면 남은 칸은 풀밭으로 둔다. 판 생성이 멈추지 않게 하는 안전장치.
    for (let tries = 0; left > 0 && tries < 1000; tries++) {
      const pool = [...free].filter(c => fits(c, []));
      if (!pool.length) break;
      let seed = pick(pool, rng);
      // 수정산은 세 곳을 뽑아 가운데에 가장 가까운 곳에서 시작한다.
      if (type === 'crystal') for (let t = 0; t < 2; t++) { const c = pick(pool, rng); if (center[c] < center[seed]) seed = c; }
      const group = [seed];
      mark(seed, type, true);
      const size = Math.min(left, 1 + Math.floor(rng() * max));
      while (group.length < size) {
        const near = group.flatMap(g => nbrs[g]).filter(n => fits(n, group));
        if (!near.length) break;
        const next = pick(near, rng);
        mark(next, type, true);
        group.push(next);
      }
      if (TERRAIN[type].move === 'blocked' && !joined()) {
        for (const g of group) mark(g, type, false);
        continue;
      }
      left -= group.length;
    }
  }
  for (const i of free) kind[i] = 'grass';
  return kind;
}

// 시작 후보 꼭짓점: 붙은 세 칸이 모두 육지, 자원 칸 2개 이상, 그 숫자의 확률 점수 합이 6 이상.
// 확률 점수는 주사위 두 개 합이 나오는 경우의 수(7이 6, 2·12가 1).
function startVertices({ hex, px, ring }, land, kind, number) {
  const out = [];
  for (const c of land) {
    for (let d = 0; d < 6; d++) {
      const a = ring[c][d];
      const b = ring[c][(d + 1) % 6];
      // 세 칸 중 번호가 가장 작은 칸에서만 모아 같은 꼭짓점을 한 번만 센다.
      if (a <= c || b <= c || kind[a] === undefined || kind[b] === undefined) continue;
      const tri = [c, a, b];
      const res = tri.filter(i => TERRAIN[kind[i]].resource);
      const pips = res.reduce((sum, i) => sum + 6 - Math.abs(7 - number[i]), 0);
      if (res.length >= 2 && pips >= 6) out.push({ hexes: tri.map(i => hex[i]), x: (px[c].x + px[a].x + px[b].x) / 3 });
    }
  }
  return out;
}

// 두 시작 자리에 붙은 칸끼리 가장 가까운 칸 수
const gap = (a, b) => Math.min(...a.hexes.flatMap(h => b.hexes.map(g => hexDistance(h, g))));

// 임시 거리 규칙: 서로 10칸 이상. 팀전은 0·1번이 왼쪽 반, 2·3번이 오른쪽 반에 서고 팀원끼리 7~11칸, 적과 12칸 이상.
function fits(mode, player, v, chosen, midX) {
  if (mode !== 'team') return chosen.every(o => gap(o, v) >= 10);
  if ((player < 2) !== (v.x < midX)) return false;
  return chosen.every((o, i) => {
    const d = gap(o, v);
    return (i < 2) === (player < 2) ? d >= 7 && d <= 11 : d >= 12;
  });
}

// 순서대로 후보 중에서 무작위로 고른다. 누군가 고를 곳이 없으면 처음부터 다시, 200번 실패하면 null.
function placeStarts(mode, cands, midX, rng) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const chosen = [];
    for (let p = 0; p < MODES[mode].players; p++) {
      const pool = cands.filter(v => fits(mode, p, v, chosen, midX));
      if (!pool.length) break;
      chosen.push(pick(pool, rng));
    }
    if (chosen.length === MODES[mode].players) return chosen;
  }
  return null;
}

export function createBoard({ mode = 'duel', seed = Math.floor(Math.random() * 2 ** 32) } = {}) {
  if (!Object.hasOwn(MODES, mode)) throw new RangeError('모드는 duel, ffa, team 중 하나여야 해요');
  if (!Number.isInteger(seed)) throw new RangeError('시드는 정수여야 해요');
  const { cols, rows, land: target } = MODES[mode];
  const rng = createRng(seed);
  const grid = makeGrid(cols, rows);
  // 시작 자리를 못 찾으면 같은 rng로 대륙·지형·숫자를 다시 굴린다.
  for (let round = 0; round < 50; round++) {
    const land = makeLand(grid, target, rng);
    const kind = paintTerrain(grid, land, rng);
    const resource = land.filter(i => TERRAIN[kind[i]].resource);
    const numbers = shuffle(resource.map((_, k) => NUMBER_BASE[k % NUMBER_BASE.length]), rng);
    const number = [];
    resource.forEach((i, k) => { number[i] = numbers[k]; });
    const chosen = placeStarts(mode, startVertices(grid, land, kind, number), grid.midX, rng);
    if (!chosen) continue;
    return {
      mode,
      seed,
      cols,
      rows,
      tiles: land.map(i => ({ ...grid.hex[i], type: kind[i], number: number[i] ?? null })),
      starts: chosen.map((v, player) => ({ player, team: mode === 'team' ? player >> 1 : player, hexes: v.hexes.map(h => ({ ...h })) })),
    };
  }
  throw new Error('판을 만들지 못했어요');
}
