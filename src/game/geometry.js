// 판의 꼭짓점(건물 자리)·변(길 자리)·칸 이웃 관계. 판(board.js)에서 한 번 만들고 규칙과 화면이 함께 쓴다.
// 꼭짓점은 붙은 세 칸, 변은 사이에 둔 두 칸의 좌표로 나타낸다(시작 자리·교환소 자리와 같은 꼴).
import { hexDistance, portSpots } from '../board.js';

// 이웃 여섯 방향. 꼭짓점 i는 방향 i-1과 i의 이웃 사이, 변 i(꼭짓점 i와 i+1 사이)는 방향 i의 이웃과 맞닿는다(지도 화면과 같음).
export const DIRS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
export const hexKey = ({ q, r }) => `${q},${r}`;
export const parseHex = key => { const [q, r] = key.split(',').map(Number); return { q, r }; };
export const vertexKey = hexes => hexes.map(hexKey).sort().join('|');
const edgeKey = (a, b) => [a, b].sort().join('~');

export function geometry(board) {
  const tiles = new Map(board.tiles.map(tile => [hexKey(tile), tile]));
  const vertices = new Map(); // 꼭짓점 → { key, hexes, land: 붙은 육지 칸 key }
  const edges = new Map(); // 변 → { key, a, b: 양 끝 꼭짓점, hexes: 두 칸 key }
  const vertexEdges = new Map(); // 꼭짓점 → 붙은 변
  const tileVertices = new Map(); // 칸 → 여섯 꼭짓점
  const corner = (t, i) => {
    const [a, b] = [DIRS[(i + 5) % 6], DIRS[i]];
    const hexes = [{ q: t.q, r: t.r }, { q: t.q + a[0], r: t.r + a[1] }, { q: t.q + b[0], r: t.r + b[1] }];
    const key = vertexKey(hexes);
    if (!vertices.has(key)) vertices.set(key, { key, hexes, land: hexes.map(hexKey).filter(k => tiles.has(k)) });
    return key;
  };
  for (const tile of board.tiles) {
    const around = DIRS.map((_, i) => corner(tile, i));
    tileVertices.set(hexKey(tile), around);
    DIRS.forEach(([dq, dr], i) => {
      const other = hexKey({ q: tile.q + dq, r: tile.r + dr });
      const key = edgeKey(hexKey(tile), other);
      if (edges.has(key)) return;
      const edge = { key, a: around[i], b: around[(i + 1) % 6], hexes: [hexKey(tile), other] };
      edges.set(key, edge);
      for (const v of [edge.a, edge.b]) {
        if (!vertexEdges.has(v)) vertexEdges.set(v, []);
        vertexEdges.get(v).push(key);
      }
    });
  }
  const neighborsOf = new Map([...tiles.keys()].map(key => {
    const { q, r } = parseHex(key);
    return [key, DIRS.map(([dq, dr]) => hexKey({ q: q + dq, r: r + dr })).filter(k => tiles.has(k))];
  }));
  // 꼭짓점 둘레: 1칸은 붙은 육지 칸, 2칸은 그 칸들의 이웃까지(카드의 "주변 N칸")
  const around = (vertex, reach = 1) => {
    const near = new Set(vertices.get(vertex).land);
    if (reach >= 2) for (const k of [...near]) for (const n of neighborsOf.get(k)) near.add(n);
    return [...near];
  };
  const ports = board.ports.map(port => ({ pair: port.pair, spots: portSpots(port).map(vertexKey) }));
  return {
    tiles, vertices, edges, vertexEdges, tileVertices, neighborsOf, around, ports,
    // 꼭짓점의 이웃 꼭짓점(변 하나로 이어짐)
    vertexNeighbors: v => (vertexEdges.get(v) ?? []).map(e => { const edge = edges.get(e); return edge.a === v ? edge.b : edge.a; }),
    // 칸 거리(좌표만으로 잼)
    distance: (a, b) => hexDistance(parseHex(a), parseHex(b)),
    // 꼭짓점 위 건물까지 칸 거리: 붙은 칸 중 가장 가까운 칸까지(그 칸에 서 있으면 0)
    distanceToVertex: (tile, vertex) => Math.min(...vertices.get(vertex).land.map(k => hexDistance(parseHex(tile), parseHex(k)))),
    // 칸 a에서 b로 가는 방향(같은 직선이 아니면 가장 가까운 방향)
    direction(a, b) {
      const A = parseHex(a), B = parseHex(b);
      const dq = B.q - A.q, dr = B.r - A.r;
      let best = 0, score = -Infinity;
      DIRS.forEach(([q, r], i) => {
        // 축 좌표를 화면 좌표로 바꿔 각도가 가장 가까운 방향
        const x1 = 1.5 * dq, y1 = Math.sqrt(3) * (dr + dq / 2), x2 = 1.5 * q, y2 = Math.sqrt(3) * (r + q / 2);
        const s = (x1 * x2 + y1 * y2) / (Math.hypot(x1, y1) * Math.hypot(x2, y2) || 1);
        if (s > score) { score = s; best = i; }
      });
      return best;
    },
    step: (key, dir) => { const { q, r } = parseHex(key); return hexKey({ q: q + DIRS[dir][0], r: r + DIRS[dir][1] }); },
  };
}
