// 쉬운 봇. 지금 상태에서 할 명령 하나를 고른다(없으면 턴 종료). 화면은 한 동작씩 보여 주고, 시뮬레이션은 끝까지 빠르게 돌린다.
// 임시: 봇은 상대 왕성 위치를 안다(설계서 11장 "봇도 안개를 적용받는지" 미정). 숨은 유닛과 함정은 모른다.
import { TERRAIN } from '../board.js';
import { RESOURCES, skillsOf } from './rules.js';

const pips = n => (n ? 6 - Math.abs(7 - n) : 0);
const TIER = { 기본: 1, 정예: 3, 전설: 6 };

// 카드 가치(버릴 때·고를 때). 유닛이 가장 귀하고, 비싼 전설은 자원이 모자라면 조금 낮춘다.
function cardValue(g, player, uid) {
  const def = g.card(uid);
  const res = g.state.players[player].resources;
  if (def.type === 'unit') return 10 + TIER[def.tier] * 2 - (g.has(res, def.costMap) ? 0 : 1);
  if (def.type === 'magic') return ['magic-fireball', 'magic-market', 'magic-rewrite', 'magic-harvest'].includes(def.id) ? 7 : 5;
  return 4;
}

// 내 정상 건물이 받는 자원 종류
function incomeKinds(g, player) {
  const kinds = new Set();
  for (const b of g.buildingsOf(player)) if (g.working(b)) for (const k of g.geo.vertices.get(b.vertex).land) { const res = TERRAIN[g.geo.tiles.get(k).type].resource; if (res) kinds.add(res); }
  return kinds;
}
// 꼭짓점 점수: 붙은 자원 칸의 숫자 확률 합 + 자원 종류 다양성 + 아직 못 받는 자원 + 교환소
function spotScore(g, player, v, have = incomeKinds(g, player)) {
  const vert = g.geo.vertices.get(v);
  let score = 0;
  const kinds = new Set();
  for (const k of vert.land) {
    const tile = g.geo.tiles.get(k);
    const res = TERRAIN[tile.type].resource;
    if (!res) continue;
    score += pips(tile.number) * (res === 'crystal' ? 1.3 : 1);
    kinds.add(res);
  }
  score += kinds.size * 1.5;
  for (const res of kinds) if (!have.has(res) && res !== 'crystal') score += 3;
  if (g.geo.ports.some(p => p.spots.includes(v))) score += 2;
  return score;
}

// 꼭짓점 그래프에서 내 길 그물에서 목표까지 가는 길(상대 건물·상대 길은 못 지남)
function roadPath(g, player, goal) {
  const s = g.state;
  const start = [...g.reached(player)].filter(v => !s.buildings.has(v) || s.buildings.get(v).owner === player);
  const prev = new Map(start.map(v => [v, null]));
  const list = [...start];
  for (let i = 0; i < list.length && i < 400; i++) {
    const v = list[i];
    if (v === goal) break;
    for (const e of g.geo.vertexEdges.get(v) ?? []) {
      const owner = s.roads.get(e);
      if (owner !== undefined && owner !== player) continue;
      const edge = g.geo.edges.get(e);
      if (!edge.hexes.some(h => g.geo.tiles.has(h))) continue;
      const next = edge.a === v ? edge.b : edge.a;
      if (prev.has(next)) continue;
      const b = s.buildings.get(next);
      if (b && b.owner !== player) continue;
      prev.set(next, { v, e });
      list.push(next);
    }
  }
  if (!prev.has(goal)) return null;
  const edges = [];
  for (let at = goal; prev.get(at); at = prev.get(at).v) edges.unshift(prev.get(at).e);
  return edges;
}

// 유닛이 향할 곳: 내 왕성 가까이 온 적 → 바로 곁(2칸 안)의 보이는 적 → 가장 가까운 상대 왕성.
// 왕성에는 한 기씩 들어가면 차례로 맞아 쓰러지므로, 왕성 사거리 바로 밖에서 모였다가(마나 가득, 공격 유닛 2기 이상) 함께 들어간다.
// 왕성보다 사거리가 긴 유닛은 사거리 밖에서 쏜다. 공격하지 못하는 유닛(깃발냥·결계냥)은 가장 가까운 아군 공격 유닛을 따라간다. 목표 꼴: { tile, range } 칸에서 range 안, { vertex, min, max } 꼭짓점 거리 min~max.
export function goalFor(g, u, mine) {
  const s = g.state;
  const team = g.teamOf(u.owner);
  const myCastle = s.players[u.owner].castle;
  const rng = Math.max(1, g.defs.get(u.card).stats.rng);
  const foes = [...s.units.values()].filter(o => g.enemies(o.owner, u.owner) && g.unitVisible(team, o));
  // 내 왕성 가까이 온 적은 가장 가까운 2기만 막으러 간다(적 하나가 맴돌아도 나머지는 공격을 이어 감)
  const threat = foes.filter(o => g.geo.distanceToVertex(o.tile, myCastle) <= 3).sort((a, b) => g.geo.distance(u.tile, a.tile) - g.geo.distance(u.tile, b.tile))[0];
  if (threat && g.geo.distance(u.tile, threat.tile) <= 6) {
    const defenders = mine.filter(o => g.defs.get(o.card).stats.atk > 0).sort((a, b) => g.geo.distance(a.tile, threat.tile) - g.geo.distance(b.tile, threat.tile)).slice(0, 2);
    if (defenders.includes(u)) return { tile: threat.tile, range: rng };
  }
  const near = foes.filter(o => g.geo.distance(u.tile, o.tile) <= 2).sort((a, b) => a.hp - b.hp)[0];
  if (near) return { tile: near.tile, range: rng };
  const castles = s.players.filter(p => p.alive && g.enemies(p.id, u.owner)).map(p => p.castle);
  const castle = castles.sort((a, b) => g.geo.distanceToVertex(u.tile, a) - g.geo.distanceToVertex(u.tile, b))[0];
  if (!castle) return null;
  // 목표 달성이 2개 앞인 상대가 있으면 그 상대의 가장 가까운 건물을 부수러 간다(파손되면 세지 않음)
  const hit0 = rng - 1;
  if (g.rules.goal) {
    const targets = s.players.filter(p => p.alive && g.enemies(p.id, u.owner) && g.goalCount(p.id) >= g.rules.goal - 2)
      .flatMap(p => g.buildingsOf(p.id).filter(b => b.kind !== 'castle' && g.working(b)));
    const b = targets.sort((a, c) => g.geo.distanceToVertex(u.tile, a.vertex) - g.geo.distanceToVertex(u.tile, c.vertex))[0];
    if (b) return { vertex: b.vertex, min: 0, max: hit0 };
  }
  const attackers = mine.filter(o => g.defs.get(o.card).stats.atk > 0);
  if (g.defs.get(u.card).stats.atk <= 0) {
    const lead = attackers.sort((a, b) => g.geo.distance(u.tile, a.tile) - g.geo.distance(u.tile, b.tile))[0];
    if (lead) return { tile: lead.tile, range: 1 };
  }
  const danger = g.rules.castle.reach - 1; // 왕성이 쏘는 꼭짓점 거리(주변 2칸 = 거리 1 이하)
  const hit = rng - 1; // 내가 왕성을 칠 수 있는 꼭짓점 거리
  if (hit > danger) return { vertex: castle, min: danger + 1, max: hit };
  // 왕성 앞을 막아선 적부터 친다(붙은 칸이 하나뿐인 왕성은 그 칸을 비워야 칠 수 있다)
  const guard = foes.filter(o => g.geo.distanceToVertex(o.tile, castle) <= danger + 1).sort((a, b) => g.geo.distance(u.tile, a.tile) - g.geo.distance(u.tile, b.tile))[0];
  if (guard) return { tile: guard.tile, range: rng };
  const inside = g.geo.distanceToVertex(u.tile, castle) <= danger;
  // 대기 칸이 막혀 한 칸 뒤에 선 유닛도 모인 것으로 센다
  const staged = attackers.filter(o => g.geo.distanceToVertex(o.tile, castle) <= danger + 2).length;
  // 3라운드를 기다려도 모이지 않으면(길목이 좁아 뒤가 못 옴) 있는 대로 들어간다
  const waits = g.botWaits ?? (g.botWaits = new Map());
  const close = g.geo.distanceToVertex(u.tile, castle) <= danger + 2;
  if (!close) waits.delete(u.id); else if (!waits.has(u.id)) waits.set(u.id, s.round);
  const ready = inside || (u.mana >= u.maxMana && (staged >= Math.min(2, attackers.length) || (close && s.round - waits.get(u.id) >= 3)));
  return ready ? { vertex: castle, min: 0, max: hit } : { vertex: castle, min: danger + 1, max: danger + 1 };
}
// 목표까지 실제 걸음 수(호수·바위산을 돌아감, 험지는 2걸음으로 침). 목표 칸에서 거꾸로 넓혀 판 전체의 값을 한 번에 구한다.
function pathField(g, goal) {
  const key = goal.vertex ? `v${goal.vertex}:${goal.min}-${goal.max}` : `t${goal.tile}:${goal.range}`;
  const cache = g.botFields ?? (g.botFields = new Map());
  const version = g.state.round;
  const hit = cache.get(key);
  if (hit && hit.version === version) return hit.field;
  const field = new Map();
  const inGoal = t => { if (!goal.vertex) return g.geo.distance(t, goal.tile) <= goal.range; const d = g.geo.distanceToVertex(t, goal.vertex); return d >= goal.min && d <= goal.max; };
  const start = [...g.geo.tiles.keys()].filter(t => g.passable(t) && inGoal(t));
  let frontier = start.map(t => [t, 0]);
  for (const [t] of frontier) field.set(t, 0);
  while (frontier.length) {
    const next = [];
    for (const [t, d] of frontier) for (const n of g.geo.neighborsOf.get(t)) {
      if (!g.passable(n)) continue;
      const cost = d + (g.geo.tiles.get(n).type === 'grass' ? 1 : 2);
      if (field.has(n) && field.get(n) <= cost) continue;
      field.set(n, cost); next.push([n, cost]);
    }
    frontier = next;
  }
  cache.set(key, { version, field });
  return field;
}

// 고를 것(pending) 처리
function resolveFor(g, player, top) {
  const s = g.state;
  const p = s.players[player];
  switch (top.type) {
    case 'village': {
      const best = g.villageSpots(player).sort((a, b) => spotScore(g, player, b.vertex) - spotScore(g, player, a.vertex))[0];
      return { type: 'placeVillage', player, vertex: best.vertex };
    }
    case 'discard': {
      const order = [...p.hand].sort((a, b) => cardValue(g, player, a) - cardValue(g, player, b));
      return { type: 'resolve', player, uids: order.slice(0, top.count) };
    }
    case 'market': return { type: 'resolve', player, uid: [...top.cards].sort((a, b) => cardValue(g, player, b) - cardValue(g, player, a))[0] };
    case 'stargaze': {
      if (!top.deck) return { type: 'resolve', player, deck: g.unitsOf(player).length < g.unitCap(player) ? 'race' : 'field' };
      return { type: 'resolve', player, uid: [...top.cards].sort((a, b) => cardValue(g, player, b) - cardValue(g, player, a))[0] };
    }
    case 'fate': {
      // 내 건물이 받는 자원이 더 많은 쪽
      const value = dice => g.board.tiles.filter(t => t.number === dice[0] + dice[1]).reduce((sum, t) => sum + g.geo.tileVertices.get(`${t.q},${t.r}`).filter(v => s.buildings.get(v)?.owner === player).length, 0);
      return { type: 'resolve', player, index: value(top.options[1]) > value(top.options[0]) ? 1 : 0 };
    }
    case 'warp': {
      // 상대 유닛을 내 왕성에서 가장 먼 곳으로
      const castle = p.castle;
      const tile = [...top.tiles].sort((a, b) => g.geo.distanceToVertex(b, castle) - g.geo.distanceToVertex(a, castle))[0];
      return { type: 'resolve', player, tile };
    }
  }
  return null;
}

// 지금 할 명령 하나. memo는 이번 턴에 실패한 시도를 기억해 같은 것을 되풀이하지 않게 한다.
export function botStep(g, player, memo = new Set()) {
  const s = g.state;
  if (s.phase === 'over') return null;
  const top = s.pending[0];
  if (top) return top.player === player ? resolveFor(g, player, top) : null;
  if (s.phase === 'setup' || s.current !== player) return null;
  if (s.phase === 'roll') return { type: 'roll', player };
  const p = s.players[player];
  const res = p.resources;
  const fresh = cmd => { const key = JSON.stringify(cmd); if (memo.has(key)) return null; memo.add(key); return cmd; };
  const team = g.teamOf(player);
  const mine = g.unitsOf(player);
  const foes = [...s.units.values()].filter(o => g.enemies(o.owner, player) && g.unitVisible(team, o));
  const enemyCastles = s.players.filter(q => q.alive && g.enemies(q.id, player)).map(q => q.castle);

  // 1. 공격·스킬: 잡을 수 있는 적, 왕성, 그다음 체력이 낮은 적
  for (const u of mine) {
    if (!g.canAttack(u) && !skillsOf(u.card).length) continue;
    const def = g.defs.get(u.card);
    // 공격 스킬이 더 세면 스킬
    for (const [i, skill] of skillsOf(u.card).entries()) {
      if (u.moved || u.attacked || u.skilled || u.mana < skill.mana) continue;
      const options = g.skillTargets(u, i);
      if (!options.length) continue;
      if (skill.kind === 'attack') {
        const t = options.map(o => s.units.get(o.unit)).filter(Boolean).sort((a, b) => a.hp - b.hp)[0];
        if (t) { const cmd = fresh({ type: 'skill', player, unit: u.id, index: i, target: { unit: t.id } }); if (cmd) return cmd; }
      }
      if (skill.kind === 'dir' && u.card === 'unit-warrior-knight') {
        const o = options[0]; const cmd = fresh({ type: 'skill', player, unit: u.id, index: i, target: { dir: o.dir, tile: o.tile } }); if (cmd) return cmd;
      }
      if (skill.kind === 'tile' || skill.kind === 'tiles') {
        // 적이 가장 많이 맞는 칸
        const hit = tile => foes.filter(o => o.tile === tile || g.geo.neighborsOf.get(tile).includes(o.tile)).length;
        if (skill.kind === 'tile') {
          const best = options.map(o => o.tile).sort((a, b) => hit(b) - hit(a))[0];
          if (best && hit(best) >= 1) { const cmd = fresh({ type: 'skill', player, unit: u.id, index: i, target: { tile: best } }); if (cmd) return cmd; }
        } else {
          const tiles = foes.filter(o => options.some(x => x.tile === o.tile)).slice(0, 3).map(o => o.tile);
          if (tiles.length) { const cmd = fresh({ type: 'skill', player, unit: u.id, index: i, target: { tiles } }); if (cmd) return cmd; }
        }
      }
      if (skill.kind === 'self' || skill.kind === 'ally') {
        const enemyNear = foes.some(o => g.geo.distance(o.tile, u.tile) <= 2);
        const useful = { 응원: enemyNear && mine.some(o => o.id !== u.id && g.geo.distance(o.tile, u.tile) === 1), '전투의 야옹': foes.some(o => g.geo.distance(o.tile, u.tile) <= 2 && g.geo.distance(o.tile, u.tile) > 1), 결계: enemyNear, 위장: !enemyNear && !u.camo && u.mana >= 3, 예언: !foes.length && u.mana >= 4 };
        if (useful[skill.name]) {
          const target = skill.kind === 'ally' ? { unit: (mine.filter(o => g.geo.distance(o.tile, u.tile) <= 1).sort((a, b) => a.hp - b.hp)[0] ?? u).id } : {};
          const cmd = fresh({ type: 'skill', player, unit: u.id, index: i, target }); if (cmd) return cmd;
        }
      }
    }
    if (!g.canAttack(u)) continue;
    const targets = g.attackTargets(u);
    if (!targets.length) continue;
    const atk = def.stats.atk;
    const ranked = targets.map(t => {
      if (t.vertex) { const b = s.buildings.get(t.vertex); const race = g.rules.goal && g.goalCount(b.owner) >= g.rules.goal - 2; return { t, score: b.kind === 'castle' || race ? 50 : 20 }; }
      const o = s.units.get(t.unit);
      return { t, score: (o.hp <= atk ? 100 : 30) - o.hp };
    }).sort((a, b) => b.score - a.score);
    const t = ranked[0].t;
    const cmd = fresh({ type: 'attack', player, unit: u.id, target: t.vertex ? { vertex: t.vertex } : { unit: t.unit } });
    if (cmd) return cmd;
  }

  const have = incomeKinds(g, player);
  // 보이는 적이 2칸 안에 있는 자리는 짓자마자 부서지므로 뺀다
  const ranked = list => list.filter(v => !foes.some(o => g.geo.distanceToVertex(o.tile, v) <= 2)).map(v => [v, spotScore(g, player, v, have)]).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  const villages = g.buildingsOf(player).filter(b => b.kind === 'village').length;
  // 2. 소환: 상한이 남으면 가장 센 유닛을 상대 쪽 칸에
  const summon = () => {
    if (mine.length >= g.unitCap(player)) return null;
    const units = p.hand.filter(uid => g.card(uid).type === 'unit' && g.has(res, g.card(uid).costMap)).sort((a, b) => TIER[g.card(b).tier] - TIER[g.card(a).tier]);
    const tiles = g.summonTiles(player);
    if (!units.length || !tiles.length) return null;
    const target = enemyCastles[0];
    const exposed = tile => foes.some(o => g.geo.distance(o.tile, tile) <= 2);
    const tile = tiles.sort((a, b) => exposed(a) - exposed(b) || g.geo.distanceToVertex(a, target) - g.geo.distanceToVertex(b, target))[0];
    return fresh({ type: 'play', player, uid: units[0], tile });
  };
  // 3. 마을: 가장 좋은 자리
  const village = () => {
    if (!g.has(res, g.rules.cost.village)) return null;
    const spot = ranked(g.buildSpots(player))[0];
    return spot ? fresh({ type: 'village', player, vertex: spot }) : null;
  };
  // 유닛이 하나라도 있으면 마을 4개까지는 마을이 먼저(상한과 수입이 함께 는다)
  const grow = mine.length >= 1 && villages < 4;
  for (const step of grow ? [village, summon] : [summon, village]) { const cmd = step(); if (cmd) return cmd; }

  // 4. 종족 건물(건설 탭): 유닛 상한이 찼으면 막사를 먼저, 나머지는 목록 순서
  const vertex = ranked(g.buildSpots(player))[0];
  if (vertex) {
    const full = mine.length >= g.unitCap(player);
    const list = g.buildable(player).filter(({ def, count }) => count < def.max && g.has(res, def.costMap))
      .sort((a, b) => (full && b.def.id === 'building-warrior-barracks') - (full && a.def.id === 'building-warrior-barracks'));
    for (const { def } of list) { const cmd = fresh({ type: 'build', player, card: def.id, vertex }); if (cmd) return cmd; }
  }

  // 5. 마법·함정
  for (const uid of p.hand) {
    const def = g.card(uid);
    if (def.type === 'magic') {
      const target = magicPlan(g, player, def.id, foes);
      if (target) { const cmd = fresh({ type: 'play', player, uid, target }); if (cmd) return cmd; }
    }
    if (def.type === 'trap') {
      const options = g.trapTargets(player, def.id);
      if (!options.length) continue;
      let pickT;
      if (def.target === '칸') {
        // 내 왕성과 상대 왕성 사이, 내 왕성에서 2~3칸 떨어진 칸
        const mineCastle = p.castle, foeCastle = enemyCastles[0];
        pickT = options.filter(o => { const d = g.geo.distanceToVertex(o.tile, mineCastle); return d >= 1 && d <= 3; }).sort((a, b) => g.geo.distanceToVertex(a.tile, foeCastle) - g.geo.distanceToVertex(b.tile, foeCastle))[0];
      } else pickT = options[0];
      if (pickT) { const cmd = fresh({ type: 'play', player, uid, target: pickT }); if (cmd) return cmd; }
    }
  }

  // 6. 길: 놓을 마을 자리가 없으면 가장 좋은 자리로 길을 늘린다(마을 자원 1번 몫은 남김)
  const canRoad = g.has(res, g.rules.cost.road);
  if (canRoad && g.buildSpots(player).length === 0) {
    const goals = [...g.geo.vertices.keys()].filter(v => { const vert = g.geo.vertices.get(v); return vert.land.length >= 2 && !s.buildings.has(v) && g.geo.vertexNeighbors(v).every(n => !s.buildings.has(n)); });
    let best = null;
    const scored = goals.map(v => [v, spotScore(g, player, v, have)]).sort((a, b) => b[1] - a[1]).slice(0, 12);
    for (const [v, value0] of scored) {
      const path = roadPath(g, player, v);
      if (!path || !path.length) continue;
      const value = value0 / (path.length + 1);
      if (!best || value > best.value) best = { value, edge: path[0] };
    }
    if (best && g.roadSpots(player).includes(best.edge)) { const cmd = fresh({ type: 'road', player, edge: best.edge }); if (cmd) return cmd; }
  }

  // 7. 교환: 남는 자원으로 다음에 살 것에 모자란 자원을 산다
  const want = nextWant(g, player, mine.length, villages);
  if (want) {
    for (const need of RESOURCES) {
      if ((want[need] ?? 0) <= res[need]) continue;
      for (const give of RESOURCES) {
        if (give === need) continue;
        const rate = g.tradeRate(player, give, need);
        if (res[give] - (want[give] ?? 0) >= rate) { const cmd = fresh({ type: 'trade', player, give, get: need }); if (cmd) return cmd; }
      }
    }
  }

  // 8. 이동: 목표 쪽으로. 공격할 수 있는 칸을 먼저
  for (const u of mine) {
    if (!g.canMove(u)) continue;
    const goal = goalFor(g, u, mine);
    if (!goal) continue;
    const options = [...g.reach(u).keys()];
    if (!options.length) continue;
    const field = pathField(g, goal);
    const score = tile => field.get(tile) ?? 999;
    const here = score(u.tile);
    const best = options.sort((a, b) => score(a) - score(b))[0];
    if (score(best) < here) { const cmd = fresh({ type: 'move', player, unit: u.id, tile: best }); if (cmd) return cmd; }
  }

  return fresh({ type: 'end', player }) ?? { type: 'end', player };
}

// 다음에 살 것의 비용: 유닛 2기(상한 안)를 먼저 갖추고, 마을 4개까지 마을(자리가 없으면 길), 그다음 유닛
function nextWant(g, player, units, villages) {
  const p = g.state.players[player];
  const cap = g.unitCap(player);
  const unit = p.hand.map(uid => g.card(uid)).filter(d => d.type === 'unit').sort((a, b) => TIER[a.tier] - TIER[b.tier])[0];
  const build = g.buildSpots(player).length ? g.rules.cost.village : g.rules.cost.road;
  if (unit && units < Math.min(2, cap)) return unit.costMap;
  if (villages < 4) return build;
  if (unit && units < cap) return unit.costMap;
  return build;
}

function magicPlan(g, player, id, foes) {
  const s = g.state;
  const mine = g.unitsOf(player);
  const options = g.magicTargets(player, id);
  if (!options.length) return null;
  const fight = mine.filter(u => foes.some(o => g.geo.distance(o.tile, u.tile) <= 2));
  const castle = s.players[player].castle;
  switch (id) {
    case 'magic-warcry': return fight.length >= 2 ? {} : null;
    case 'magic-ironwall': return fight.length ? { unit: fight.sort((a, b) => a.hp - b.hp)[0].id } : null;
    case 'magic-fireball': {
      const hit = tile => foes.filter(o => o.tile === tile || g.geo.neighborsOf.get(tile).includes(o.tile)).length;
      const best = options.map(o => o.tile).sort((a, b) => hit(b) - hit(a))[0];
      return best && hit(best) >= 1 ? { tile: best } : null;
    }
    case 'magic-sprint': return null;
    case 'magic-farsight': return null;
    case 'magic-repair': return { vertex: options[0].vertex };
    case 'magic-market': case 'magic-rewrite': return {};
    case 'magic-harvest': {
      const count = r => g.buildingsOf(player).filter(b => g.working(b) && g.geo.vertices.get(b.vertex).land.some(k => TERRAIN[g.geo.tiles.get(k).type].resource === r)).length;
      const best = [...RESOURCES].sort((a, b) => count(b) - count(a))[0];
      return count(best) ? { resource: best } : null;
    }
    case 'magic-closegate': return foes.some(o => g.geo.distanceToVertex(o.tile, castle) <= 2) ? {} : null;
    case 'magic-pickpocket': {
      const best = options.filter(o => s.players[o.player].resources[o.resource] > 0).sort((a, b) => s.players[b.player].resources[b.resource] - s.players[a.player].resources[a.resource])[0];
      return best ?? null;
    }
  }
  return null;
}
