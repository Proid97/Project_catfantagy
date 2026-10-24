// 게임 규칙 엔진. 화면과 따로 두고, 모든 플레이를 명령(apply)으로 처리한다. 같은 시드·같은 명령이면 같은 결과가 나온다.
// 규칙의 기준은 docs/game-design.md, 카드 수치는 docs/cards.md(빌드가 src/generated/cards.json으로 만든다).
// "임시"로 적은 값은 설계서에 없거나 미정인 것을 시뮬레이션으로 정한 값이다(RULES).
import { createRng, TERRAIN, MODES } from '../board.js';
import { vision, startKnown, VISIBLE } from '../vision.js';
import { geometry, hexKey, parseHex } from './geometry.js';

export const RESOURCES = Object.freeze(['gold', 'crystal', 'wood', 'fish']); // 얼려 둠: 제자리 정렬하면 다음 판 순서가 바뀌어 같은 시드가 다른 결과를 냄
export const RESOURCE_NAMES = { gold: '금', crystal: '수정', wood: '나무', fish: '생선' };

// 임시 수치(설계서 "미정"을 채움). 시뮬레이션(scripts/simulate.mjs)으로 맞춘다.
// 수급은 라운드마다 받는 양이 인원과 상관없게 1대1은 2, 4인은 1(4인은 한 라운드에 주사위가 네 번).
// 왕성은 붙은 세 칸(reach 1)의 적만 쏜다. 2칸이면 근접 유닛만 일방적으로 맞아 냥전사가 왕성을 거의 못 친다.
export const RULES = {
  startResources: { gold: 2, crystal: 0, wood: 2, fish: 2 },
  cost: { road: { wood: 1, fish: 1 }, village: { gold: 1, wood: 1, fish: 1 } },
  castle: { hp: 10, reach: 1, damage: 2, weakDamage: 1 },
  castleYield: 2, buildingYield: 2,
  byMode: { ffa: { castleYield: 1, buildingYield: 1 }, team: { castleYield: 1, buildingYield: 1 } },
  hand: { start: 5, max: 6 },
  units: { max: 6 },
  trade: 4,
  goal: 12, // 목표 달성 승리: 내 턴에 왕성 말고 정상·활성 건물이 이만큼이면 승리(null이면 끔). 없으면 봇끼리 판이 200라운드를 넘기도 함
};

// 유닛 스킬. targets(g, u)는 고를 수 있는 대상 목록, run(g, u, target)이 효과. mana는 드는 마나.
// 대상 꼴: { unit } 유닛, { tile } 칸, { tiles } 칸 여러 개, { dir } 방향
const SKILLS = {
  'unit-warrior-axe': { name: '쪼개기', mana: 2, kind: 'attack' },
  'unit-warrior-flag': { name: '응원', mana: 2, kind: 'self' },
  'unit-warrior-knight': { name: '돌진', mana: 2, kind: 'dir' },
  'unit-warrior-general': { name: '전투의 야옹', mana: 2, kind: 'self' },
  'unit-mage-barrier': { name: '결계', mana: 3, kind: 'ally' },
  'unit-mage-broom': { name: '비행', mana: 2, kind: 'dir' },
  'unit-mage-seer': [{ name: '예언', mana: 2, kind: 'self' }, { name: '별똥별', mana: 3, kind: 'tiles', count: 3, reach: 3 }],
  'unit-mage-archmage': { name: '대폭발', mana: 4, kind: 'tile', reach: 4 },
  'unit-assassin-scout': { name: '위장', mana: 2, kind: 'self' },
  'unit-assassin-dagger': { name: '위장', mana: 2, kind: 'self' },
  'unit-assassin-poison': [{ name: '맹독침', mana: 2, kind: 'attack', reach: 2 }, { name: '위장', mana: 2, kind: 'self' }],
  'unit-assassin-shadow': { name: '그림자 도약', mana: 2, kind: 'attack', reach: 2 },
};
export const skillsOf = id => [SKILLS[id] ?? []].flat();
const SHIELDED = new Set(['unit-warrior-shield', 'unit-warrior-knight']); // 튼튼한 방패: 독·함정 피해 면역
const STEALTH = new Set(['unit-assassin-scout', 'unit-assassin-shadow']); // 은신(패시브)
const TOWERS = { 'building-warrior-watchtower': { reach: 1 }, 'building-mage-tower': { reach: 2 }, 'building-assassin-shade-tower': { reach: 1 } };

export function createGame({ board, races, cards, seed = board.seed, rules: base = RULES }) {
  const rules = { ...base, ...base.byMode?.[board.mode] };
  const geo = geometry(board);
  const rng = createRng((seed ^ 0x5bd1e995) >>> 0);
  const defs = new Map(cards.map(card => [card.id, { ...card, costMap: Object.fromEntries(card.cost ?? []) }]));
  const roll = () => 1 + Math.floor(rng() * 6);
  const shuffle = list => { for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } return list; };
  const choice = list => list[Math.floor(rng() * list.length)];
  const cardOf = new Map(); // 카드 한 장(uid) → 카드 id
  let nextUid = 1;
  const deal = ids => shuffle(ids.flatMap(id => Array.from({ length: defs.get(id).copies }, () => { const uid = nextUid++; cardOf.set(uid, id); return uid; })));
  const playerCount = MODES[board.mode].players;
  const state = {
    mode: board.mode, seed, phase: 'setup', turnCount: 0, round: 0, current: null, order: [], winner: null, log: [],
    players: board.starts.map(({ player, team, hexes }, i) => ({
      id: player, team, race: races[i], alive: true, turns: 0, resources: { ...rules.startResources }, hand: [],
      raceDeck: deal(cards.filter(c => c.look === races[i] && c.type === 'unit').map(c => c.id)), raceDiscard: [], // 건물은 카드가 아니라 건설 탭(2026-10-24)
      castle: null, castleHp: rules.castle.hp, castleHexes: hexes.map(hexKey), village: null,
      warcry: false, gateClosed: false, fateNext: false, stealTurn: -99, gateUsed: false, sights: [], meteors: [],
    })),
    fieldDeck: deal(cards.filter(c => c.type === 'magic' || c.type === 'trap').map(c => c.id)), fieldDiscard: [],
    buildings: new Map(), roads: new Map(), units: new Map(), traps: new Map(), pending: [],
    known: [], nextUnit: 1, dice: null, version: 0,
  };
  const teams = [...new Set(state.players.map(p => p.team))];
  state.known = teams.map(() => startKnown(board));
  state.players.forEach((p, i) => {
    p.castle = geo.vertices.has(vertexOf(board.starts[i].hexes)) ? vertexOf(board.starts[i].hexes) : null;
    state.buildings.set(p.castle, { vertex: p.castle, owner: i, kind: 'castle', card: null, hp: rules.castle.hp, damaged: false, trap: null });
  });
  function vertexOf(hexes) { return hexes.map(hexKey).sort().join('|'); }

  let events = [];
  const emit = event => { events.push(event); };
  const touch = () => { state.version++; cache.clear(); };
  const cache = new Map();
  const memo = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
  const P = i => state.players[i];
  const teamOf = i => P(i).team;
  const enemies = (a, b) => teamOf(a) !== teamOf(b);
  const terrain = tile => TERRAIN[geo.tiles.get(tile)?.type];
  const passable = tile => geo.tiles.has(tile) && terrain(tile).move !== 'blocked';
  const unitAt = tile => { for (const u of state.units.values()) if (u.tile === tile) return u; return null; };
  const unitsOf = player => [...state.units.values()].filter(u => u.owner === player);
  const has = (res, cost) => Object.entries(cost).every(([k, v]) => (res[k] ?? 0) >= v);
  const pay = (p, cost) => { for (const [k, v] of Object.entries(cost)) p.resources[k] -= v; };
  const gain = (player, resource, amount, from) => { if (amount <= 0) return; P(player).resources[resource] += amount; emit({ type: 'gain', player, resource, amount, from }); };
  const log = text => { state.log.push(text); if (state.log.length > 200) state.log.shift(); emit({ type: 'log', text }); };
  const name = player => `${player === 0 ? '나' : `봇 ${player}`}`;

  // ── 연결과 활성 ─────────────────────────────────────────────
  // 왕성에서 내 길로 이어진 꼭짓점. 상대 건물이 있는 꼭짓점은 지나가지 못한다.
  function reached(player) {
    return memo(`reach${player}`, () => {
      const start = P(player).castle;
      const seen = new Set([start]);
      const list = [start];
      for (let i = 0; i < list.length; i++) {
        const v = list[i];
        const b = state.buildings.get(v);
        if (b && b.owner !== player) continue;
        for (const e of geo.vertexEdges.get(v) ?? []) {
          if (state.roads.get(e) !== player) continue;
          const edge = geo.edges.get(e);
          const next = edge.a === v ? edge.b : edge.a;
          if (!seen.has(next)) { seen.add(next); list.push(next); }
        }
      }
      return seen;
    });
  }
  const isActive = b => b.kind === 'castle' || reached(b.owner).has(b.vertex);
  const working = b => !b.damaged && isActive(b); // 정상·활성: 수급과 고유 기능이 켜짐
  const buildingsOf = player => [...state.buildings.values()].filter(b => b.owner === player);
  const isCard = (b, id) => b.card === id;

  // ── 시야·은신 ───────────────────────────────────────────────
  const unitSight = u => (u.card === 'unit-mage-broom' ? 3 : 2);
  function pieces() {
    return memo('pieces', () => [
      ...[...state.buildings.values()].map(b => ({ player: b.owner, kind: b.kind === 'castle' ? 'castle' : 'village', hexes: geo.vertices.get(b.vertex).hexes })),
      ...[...state.roads].map(([e, owner]) => ({ player: owner, kind: 'road', hexes: geo.edges.get(e).hexes.map(parseHex) })),
      ...[...state.units.values()].map(u => ({ player: u.owner, kind: 'unit', hexes: [parseHex(u.tile)], sight: unitSight(u) })),
    ]);
  }
  // 팀이 지금 보는 칸(시야)과 아는 칸
  function sight(team) {
    return memo(`sight${team}`, () => {
      const viewer = state.players.findIndex(p => p.team === team && p.alive) >= 0 ? state.players.findIndex(p => p.team === team && p.alive) : state.players.findIndex(p => p.team === team);
      const extra = state.players.filter(p => p.team === team).flatMap(p => p.sights.flatMap(s => s.tiles));
      const ti = teams.indexOf(team);
      const result = vision(board, { viewer, pieces: pieces().filter(p => state.players[p.player].alive), known: state.known[ti], extra });
      return result;
    });
  }
  const sees = (team, tile) => sight(team).state.get(tile) === VISIBLE;
  // 은신 탐지: 유닛은 이웃 칸(깃발냥 2칸), 건물은 붙은 세 칸. 드러냄(마법탑 2칸, 천리안)은 위장까지 보인다.
  function detection(team) {
    return memo(`detect${team}`, () => {
      const detect = new Set(), reveal = new Set();
      for (const u of state.units.values()) {
        if (teamOf(u.owner) !== team) continue;
        const reach = u.card === 'unit-warrior-flag' ? 2 : 1;
        for (const tile of geo.tiles.keys()) if (geo.distance(u.tile, tile) <= reach) detect.add(tile);
      }
      for (const b of state.buildings.values()) {
        if (teamOf(b.owner) !== team) continue;
        for (const tile of geo.around(b.vertex, 1)) detect.add(tile);
        if (isCard(b, 'building-mage-tower') && working(b)) for (const tile of geo.around(b.vertex, 2)) reveal.add(tile);
      }
      for (const p of state.players) if (p.team === team) for (const s of p.sights) if (s.reveal) s.tiles.forEach(t => reveal.add(t));
      return { detect, reveal };
    });
  }
  function inHideout(u) {
    if (u.hideoutBlock > 0) return false;
    return buildingsOf(u.owner).some(b => isCard(b, 'building-assassin-hideout') && working(b) && geo.around(b.vertex, 1).includes(u.tile));
  }
  function hiddenFrom(team, u) {
    if (teamOf(u.owner) === team || u.revealed) return false;
    const { detect, reveal } = detection(team);
    if (reveal.has(u.tile)) return false;
    if (u.camo || inHideout(u)) return true;
    if (STEALTH.has(u.card)) return !detect.has(u.tile);
    return false;
  }
  const unitVisible = (team, u) => teamOf(u.owner) === team || (sees(team, u.tile) && !hiddenFrom(team, u));
  const buildingVisible = (team, b) => {
    if (teamOf(b.owner) === team) return true;
    if (isCard(b, 'building-assassin-shade-tower') && !b.revealed && !geo.around(b.vertex, 1).some(t => detection(team).reveal.has(t))) return false;
    return geo.vertices.get(b.vertex).land.some(t => sees(team, t));
  };
  function remember() {
    teams.forEach((team, ti) => { const v = sight(team); for (const t of v.known) state.known[ti].add(t); });
  }

  // ── 카드 더미 ───────────────────────────────────────────────
  function drawFrom(player, which) {
    const p = P(player);
    const piles = { race: [p.raceDeck, p.raceDiscard], field: [state.fieldDeck, state.fieldDiscard] };
    let [deck, discard] = piles[which];
    if (!deck.length && discard.length) { deck.push(...shuffle(discard.splice(0))); }
    if (!deck.length) { [deck, discard] = piles[which === 'race' ? 'field' : 'race']; if (!deck.length && discard.length) deck.push(...shuffle(discard.splice(0))); }
    return deck.pop() ?? null;
  }
  // 한 장마다 종족 덱과 필드 덱 중 하나를 반반 확률로 정해 뽑는다(설계서 6장)
  function draw(player, count = 1) {
    for (let i = 0; i < count; i++) {
      const uid = drawFrom(player, rng() < 0.5 ? 'race' : 'field');
      if (uid !== null) { P(player).hand.push(uid); emit({ type: 'draw', player, uid }); }
    }
  }
  const discardCard = (player, uid) => {
    const def = defs.get(cardOf.get(uid));
    if (def.type === 'magic' || def.type === 'trap') state.fieldDiscard.push(uid); else P(player).raceDiscard.push(uid);
  };
  const takeFromHand = (player, uid) => { const hand = P(player).hand; const i = hand.indexOf(uid); if (i < 0) return false; hand.splice(i, 1); return true; };

  // ── 피해 ───────────────────────────────────────────────────
  function reduction(u) {
    let best = 0;
    for (const r of u.reduce) best = Math.max(best, r.amount);
    if (P(u.owner).warcry) best = Math.max(best, 1);
    for (const b of state.buildings.values()) if (b.owner === u.owner && isCard(b, 'building-warrior-bastion') && working(b) && geo.around(b.vertex, 1).includes(u.tile)) best = Math.max(best, 1);
    return best;
  }
  // kind: attack(공격), effect(마법·스킬 범위), trap(함정), poison(독), self(돌진 반동). pierce: 쪼개기(피해 줄이기·막기 무시)
  function hurtUnit(u, amount, { kind = 'attack', pierce = false, by = null } = {}) {
    if (!state.units.has(u.id) || amount <= 0) return 0;
    if ((kind === 'trap' || kind === 'poison') && SHIELDED.has(u.card)) { emit({ type: 'block', unit: u.id, reason: '튼튼한 방패' }); return 0; }
    if (!pierce && kind !== 'self') {
      if (u.barrier !== null) { emit({ type: 'block', unit: u.id, reason: '결계' }); return 0; }
      amount = Math.max(0, amount - reduction(u));
    }
    if (amount <= 0) { emit({ type: 'block', unit: u.id, reason: '피해 줄이기' }); return 0; }
    u.hp -= amount;
    emit({ type: 'damage', unit: u.id, tile: u.tile, amount, hp: u.hp });
    if (u.hp <= 0) {
      if (u.card === 'unit-warrior-general' && !u.undying) { u.undying = true; u.hp = 1; emit({ type: 'undying', unit: u.id }); return amount; }
      kill(u, by);
    }
    return amount;
  }
  function kill(u, by) {
    state.units.delete(u.id);
    if (u.mirror) state.fieldDiscard.push(u.mirror);
    P(u.owner).raceDiscard.push(u.uid);
    emit({ type: 'die', unit: u.id, tile: u.tile, owner: u.owner, card: u.card });
    log(`${name(u.owner)}의 ${defs.get(u.card).name}이(가) 쓰러졌다`);
    touch();
  }
  function hurtBuilding(b, amount, by = null) {
    if (!state.buildings.has(b.vertex) || amount <= 0) return;
    if (b.kind === 'castle') {
      const p = P(b.owner);
      if (b.trap?.id === 'trap-wallguard') {
        discardCard(b.owner, b.trap.uid); b.trap = null;
        emit({ type: 'trap', id: 'trap-wallguard', vertex: b.vertex, owner: b.owner });
        if (by) hurtUnit(by, 1, { kind: 'effect' });
        return;
      }
      if (p.gateClosed) amount = Math.floor(amount / 2);
      if (amount <= 0) { emit({ type: 'block', vertex: b.vertex, reason: '성문 닫기' }); return; }
      b.hp -= amount; p.castleHp = b.hp;
      emit({ type: 'damage', vertex: b.vertex, amount, hp: b.hp });
      if (b.hp <= 0) eliminate(b.owner);
      return;
    }
    if (TOWERS[b.card]) {
      b.hp -= amount;
      emit({ type: 'damage', vertex: b.vertex, amount, hp: b.hp });
      if (b.hp <= 0) destroy(b);
      return;
    }
    if (b.damaged) destroy(b);
    else { b.damaged = true; emit({ type: 'damaged', vertex: b.vertex }); touch(); }
  }
  function destroy(b) {
    state.buildings.delete(b.vertex);
    if (b.trap) discardCard(b.owner, b.trap.uid);
    emit({ type: 'destroyed', vertex: b.vertex, owner: b.owner, card: b.card, kind: b.kind });
    log(`${name(b.owner)}의 ${b.kind === 'village' ? '마을' : defs.get(b.card).name}이(가) 부서졌다`);
    touch();
  }
  // 왕성이 부서지면 탈락. 임시: 그 플레이어의 말·건물·길을 모두 치운다. 남은 팀이 하나면 승리.
  function eliminate(player) {
    const p = P(player);
    p.alive = false; p.castleHp = 0;
    for (const u of unitsOf(player)) state.units.delete(u.id);
    for (const b of buildingsOf(player)) state.buildings.delete(b.vertex);
    for (const [e, owner] of [...state.roads]) if (owner === player) state.roads.delete(e);
    for (const [t, trap] of [...state.traps]) if (trap.owner === player) state.traps.delete(t);
    emit({ type: 'eliminated', player });
    log(`${name(player)}의 왕성이 무너졌다`);
    touch();
    const left = [...new Set(state.players.filter(q => q.alive).map(q => q.team))];
    if (left.length === 1) { state.winner = left[0]; state.phase = 'over'; emit({ type: 'over', team: left[0] }); }
  }

  // 공격(유닛 → 유닛·건물). 거울 결계, 반격 태세, 등 찌르기, 스리슬쩍을 여기서 처리한다.
  function strike(u, target, amount, { pierce = false, kind = 'attack' } = {}) {
    const victimTeam = teamOf(target.unit ? target.unit.owner : target.building.owner);
    const hidden = hiddenFrom(victimTeam, u); // 등 찌르기: 맞는 쪽에게 숨은 채로 공격
    if (u.card === 'unit-assassin-dagger' && hidden) amount += 2;
    emit({ type: 'attack', unit: u.id, from: u.tile, to: target.unit ? target.unit.tile : target.building.vertex, target: target.unit?.id ?? target.building.vertex });
    let victim = null;
    if (target.unit) {
      const t = target.unit;
      victim = t.owner;
      if (t.mirror && !pierce) {
        discardCard(t.owner, t.mirror); t.mirror = null;
        emit({ type: 'trap', id: 'trap-mirror', tile: t.tile, owner: t.owner });
        hurtUnit(u, amount, { kind: 'effect' });
      } else hurtUnit(t, amount, { kind, pierce, by: u });
      // 반격 태세: 주변 1칸의 아군이 공격받으면 공격한 적에게 피해 2
      for (const b of state.buildings.values()) {
        if (b.owner !== t.owner || b.trap?.id !== 'trap-counter' || !geo.around(b.vertex, 1).includes(t.tile)) continue;
        discardCard(b.owner, b.trap.uid); b.trap = null;
        emit({ type: 'trap', id: 'trap-counter', vertex: b.vertex, owner: b.owner });
        if (state.units.has(u.id)) hurtUnit(u, 2, { kind: 'effect' });
        break;
      }
    } else {
      victim = target.building.owner;
      hurtBuilding(target.building, amount, u);
    }
    if (state.units.has(u.id)) {
      u.revealed = true; u.camo = false; u.hideoutBlock = 2;
      // 스리슬쩍: 내 턴 3번에 1번 훔친다
      if (u.card === 'unit-assassin-thief' && P(u.owner).turns - P(u.owner).stealTurn >= 3 && P(victim)?.alive) {
        const owned = RESOURCES.flatMap(r => Array(P(victim).resources[r]).fill(r));
        if (owned.length) { const r = choice(owned); P(victim).resources[r]--; gain(u.owner, r, 1, 'steal'); P(u.owner).stealTurn = P(u.owner).turns; }
      }
    }
    touch();
  }

  // ── 이동 ───────────────────────────────────────────────────
  // 이동할 수 있는 칸과 길. 험지에 들어가면 그 이동은 거기서 끝난다. 아군 칸은 지나가기만, 보이는 적 칸은 못 지나간다.
  function reach(u, steps = defs.get(u.card).stats.move, { rough = true } = {}) {
    const team = teamOf(u.owner);
    const blockedBy = tile => { const o = unitAt(tile); return o && o.id !== u.id && enemies(o.owner, u.owner) && unitVisible(team, o); };
    const prev = new Map([[u.tile, null]]);
    let frontier = [u.tile];
    for (let s = 0; s < steps; s++) {
      const next = [];
      for (const tile of frontier) {
        if (tile !== u.tile && rough && terrain(tile).move === 'rough') continue;
        for (const n of geo.neighborsOf.get(tile)) {
          if (prev.has(n) || !passable(n) || blockedBy(n)) continue;
          prev.set(n, tile); next.push(n);
        }
      }
      frontier = next;
    }
    const out = new Map();
    for (const tile of prev.keys()) {
      if (tile === u.tile) continue;
      const o = unitAt(tile);
      if (o && unitVisible(team, o)) continue; // 끝 칸은 비어 있어야(모르는 숨은 적은 가 봐야 안다)
      const path = [];
      for (let t = tile; t !== u.tile; t = prev.get(t)) path.unshift(t);
      out.set(tile, path);
    }
    return out;
  }
  // 길을 따라 한 칸씩 간다. 숨은 적에 막히면 그 앞에서 멈추고 적이 드러난다. 상대 함정을 밟으면 터진다.
  function walk(u, path) {
    const from = u.tile;
    const walked = [];
    for (const tile of path) {
      const o = unitAt(tile);
      if (o && o.id !== u.id && enemies(o.owner, u.owner)) { o.revealed = true; emit({ type: 'ambush', unit: o.id, tile }); break; }
      walked.push(tile);
      const trap = state.traps.get(tile);
      if (trap && enemies(trap.owner, u.owner)) {
        u.tile = tile;
        if (springTrap(trap, u, tile)) break;
        if (!state.units.has(u.id)) break;
      }
    }
    // 아군 칸에서 멈추면(숨은 적 때문에) 앞으로 비어 있는 마지막 칸까지 되돌린다
    let end = walked.length ? walked[walked.length - 1] : from;
    while (end !== from && unitAt(end) && unitAt(end).id !== u.id) { walked.pop(); end = walked.length ? walked[walked.length - 1] : from; }
    if (state.units.has(u.id) && !u.warped) u.tile = end;
    u.warped = false;
    emit({ type: 'move', unit: u.id, from, path: walked.length ? walked : [from] });
    touch();
  }
  // 함정이 터지면 버린다. 이동을 멈추게 하면 true.
  function springTrap(trap, u, tile) {
    state.traps.delete(tile);
    discardCard(trap.owner, trap.uid);
    emit({ type: 'trap', id: trap.id, tile, owner: trap.owner, unit: u.id });
    log(`${name(u.owner)}의 ${defs.get(u.card).name}이(가) ${defs.get(trap.id).name}을(를) 밟았다`);
    switch (trap.id) {
      case 'trap-pit': hurtUnit(u, 1, { kind: 'trap' }); return false;
      case 'trap-tripwire': u.rooted = 2; return true;
      case 'trap-poisonneedle': hurtUnit(u, 1, { kind: 'trap' }); if (!SHIELDED.has(u.card) && state.units.has(u.id)) u.poison = 2; return false;
      case 'trap-firerune':
        for (const o of [...state.units.values()]) if (enemies(o.owner, trap.owner) && (o.tile === tile || geo.neighborsOf.get(tile).includes(o.tile))) hurtUnit(o, 2, { kind: 'trap' });
        return false;
      case 'trap-snare': u.mana = 0; return false;
      case 'trap-faketreasure': {
        const owned = RESOURCES.flatMap(r => Array(P(u.owner).resources[r]).fill(r));
        for (let i = 0; i < 2 && owned.length; i++) { const r = owned.splice(Math.floor(rng() * owned.length), 1)[0]; P(u.owner).resources[r]--; gain(trap.owner, r, 1, 'trap'); }
        return true;
      }
      case 'trap-spacewarp': {
        const spots = [...geo.tiles.keys()].filter(t => passable(t) && !unitAt(t) && geo.distance(t, tile) <= 3 && t !== tile);
        if (spots.length) state.pending.unshift({ type: 'warp', player: trap.owner, unit: u.id, tiles: spots });
        u.warped = true;
        return true;
      }
    }
    return false;
  }

  // ── 시작 준비 ───────────────────────────────────────────────
  // 마을 자리: 왕성에서 두 변 떨어진 꼭짓점. 둘 사이 길 2개는 무료.
  function villageSpots(player) {
    const castle = P(player).castle;
    const out = [];
    for (const a of geo.vertexNeighbors(castle)) for (const b of geo.vertexNeighbors(a)) {
      if (b === castle || out.some(o => o.vertex === b)) continue;
      if (!canPlace(b)) continue;
      out.push({ vertex: b, path: [edgeBetween(castle, a), edgeBetween(a, b)] });
    }
    return out;
  }
  const edgeBetween = (a, b) => geo.vertexEdges.get(a).find(e => { const edge = geo.edges.get(e); return edge.a === b || edge.b === b; });
  // 건물을 놓을 수 있는 꼭짓점: 육지가 둘 이상 붙고, 비었고, 이웃 꼭짓점에도 건물이 없다
  function canPlace(v) {
    const vert = geo.vertices.get(v);
    if (!vert || vert.land.length < 2 || state.buildings.has(v)) return false;
    return geo.vertexNeighbors(v).every(n => !state.buildings.has(n));
  }
  function placeVillage(player, vertex) {
    const spot = villageSpots(player).find(s => s.vertex === vertex);
    if (!spot) return '그 자리에는 마을을 놓을 수 없어요';
    for (const e of spot.path) state.roads.set(e, player);
    state.buildings.set(vertex, { vertex, owner: player, kind: 'village', card: null, damaged: false, trap: null });
    P(player).village = vertex;
    emit({ type: 'build', player, vertex, kind: 'village' });
    for (const e of spot.path) emit({ type: 'road', player, edge: e });
    touch();
    state.pending = state.pending.filter(p => !(p.type === 'village' && p.player === player));
    if (!state.pending.some(p => p.type === 'village')) decideOrder();
    return null;
  }
  // 순서 주사위: 합이 큰 사람부터, 같으면 그 사람끼리 다시. 팀전은 가장 큰 사람의 팀부터 두 팀이 번갈아.
  function decideOrder() {
    const rolls = new Map();
    const rank = group => {
      const scored = group.map(p => { const d = [roll(), roll()]; rolls.set(p, [...(rolls.get(p) ?? []), d]); return [p, d[0] + d[1]]; });
      const sums = [...new Set(scored.map(s => s[1]))].sort((a, b) => b - a);
      return sums.flatMap(sum => { const tied = scored.filter(s => s[1] === sum).map(s => s[0]); return tied.length > 1 ? rank(tied) : tied; });
    };
    let order = rank(state.players.map(p => p.id));
    if (state.mode === 'team') {
      const first = teamOf(order[0]);
      const a = order.filter(p => teamOf(p) === first), b = order.filter(p => teamOf(p) !== first);
      order = [a[0], b[0], a[1], b[1]];
    }
    state.order = order;
    emit({ type: 'order', order, rolls: Object.fromEntries(rolls) });
    for (const p of state.players) draw(p.id, rules.hand.start);
    state.round = 1;
    beginTurn(order[0]);
  }

  // ── 턴 ─────────────────────────────────────────────────────
  function beginTurn(player) {
    const p = P(player);
    state.current = player; state.turnCount++; p.turns = (p.turns ?? 0) + 1;
    state.phase = 'roll'; state.dice = null; p.gateUsed = false;
    // "다음 내 턴 시작까지" 효과가 끝난다
    p.warcry = false; p.gateClosed = false; p.sights = [];
    for (const u of state.units.values()) {
      u.reduce = u.reduce.filter(r => r.until !== player);
      if (u.barrier === player) u.barrier = null;
      if (u.owner === player) { u.revealed = false; u.fresh = false; u.moved = u.attacked = u.skilled = false; u.sprint = false; if (u.hideoutBlock > 0) u.hideoutBlock--; }
    }
    emit({ type: 'turn', player, round: state.round });
    // 별똥별: 다음 내 턴 시작에 떨어진다(숨은 적도 맞는다)
    for (const m of p.meteors.splice(0)) {
      emit({ type: 'meteor-fall', player, tiles: m });
      for (const o of [...state.units.values()]) if (enemies(o.owner, player) && m.includes(o.tile)) hurtUnit(o, 3, { kind: 'effect' });
    }
    // 독·은신처·마나 회복·도발
    for (const u of unitsOf(player)) {
      if (u.poison > 0) { u.poison--; hurtUnit(u, 1, { kind: 'poison' }); if (!state.units.has(u.id)) continue; }
      if (inHideout(u) && u.hp < u.maxHp) { u.hp++; emit({ type: 'heal', unit: u.id, amount: 1 }); }
      if (!(u.poison > 0)) {
        let regen = 1;
        if (buildingsOf(player).some(b => isCard(b, 'building-mage-mana-spring') && working(b) && geo.around(b.vertex, 2).includes(u.tile))) regen++;
        u.mana = Math.min(u.maxMana, u.mana + regen);
      }
      if (u.taunt) {
        const by = state.units.get(u.taunt);
        u.taunt = null;
        if (by && geo.distance(u.tile, by.tile) > 1) {
          const step = geo.neighborsOf.get(u.tile).filter(t => passable(t) && !unitAt(t)).sort((a, b) => geo.distance(a, by.tile) - geo.distance(b, by.tile))[0];
          if (step && geo.distance(step, by.tile) < geo.distance(u.tile, by.tile)) walk(u, [step]);
        }
      }
    }
    touch(); remember();
    if (p.fateNext) {
      p.fateNext = false;
      const options = [[roll(), roll()], [roll(), roll()]];
      state.pending.push({ type: 'fate', player, options });
    }
  }
  function rollDice(player, forced) {
    const dice = forced ?? [roll(), roll()];
    state.dice = dice;
    const sum = dice[0] + dice[1];
    emit({ type: 'roll', player, dice, sum });
    // 수급: 숫자가 맞는 칸에 붙은 정상·활성 건물마다(누구 것이든)
    for (const tile of board.tiles) {
      if (tile.number !== sum) continue;
      const res = TERRAIN[tile.type].resource;
      const key = hexKey(tile);
      for (const v of geo.tileVertices.get(key)) {
        const b = state.buildings.get(v);
        if (!b || !working(b) || !P(b.owner).alive) continue;
        let amount = b.kind === 'castle' ? rules.castleYield : rules.buildingYield;
        if (isCard(b, 'building-assassin-fish-store') && tile.type === 'lake') amount++;
        gain(b.owner, res, amount, key);
      }
    }
    // 효과 건물: 고유 숫자가 나오면 누구의 턴이든 발동
    for (const b of [...state.buildings.values()]) {
      const def = b.card && defs.get(b.card);
      if (!def?.dice || def.dice !== sum || !working(b) || !P(b.owner).alive) continue;
      emit({ type: 'effect', vertex: b.vertex, card: b.card });
      triggerEffect(b);
    }
    // 자동공격: 내 왕성과 정상 공격타워가 범위 안의 적을 1회씩
    autoAttacks(player);
    if (state.phase !== 'over') state.phase = 'main';
    touch(); remember();
  }
  function triggerEffect(b) {
    const owner = b.owner;
    switch (b.card) {
      case 'building-warrior-forge': {
        const hurt = unitsOf(owner).filter(u => u.hp < u.maxHp).sort((a, c) => (a.hp - a.maxHp) - (c.hp - c.maxHp))[0];
        if (hurt) { hurt.hp = Math.min(hurt.maxHp, hurt.hp + 2); emit({ type: 'heal', unit: hurt.id, amount: 2 }); }
        break;
      }
      case 'building-warrior-training': draw(owner, 1); break;
      case 'building-mage-crystal-lab': gain(owner, 'crystal', 2, b.vertex); break;
      case 'building-mage-observatory': state.pending.push({ type: 'stargaze', player: owner }); break;
      case 'building-assassin-informant-nest': {
        const foe = richestFoe(owner, q => q.hand.length);
        if (foe !== null && P(foe).hand.length) { const uid = P(foe).hand.splice(Math.floor(rng() * P(foe).hand.length), 1)[0]; discardCard(foe, uid); emit({ type: 'lose-card', player: foe }); }
        break;
      }
      case 'building-assassin-black-market': {
        const foe = richestFoe(owner, q => RESOURCES.reduce((s, r) => s + q.resources[r], 0));
        if (foe !== null) { const owned = RESOURCES.flatMap(r => Array(P(foe).resources[r]).fill(r)); if (owned.length) { const r = choice(owned); P(foe).resources[r]--; gain(owner, r, 1, 'market'); } }
        break;
      }
    }
  }
  // 임시: 상대 한 명을 고르는 효과 건물은 가장 많이 가진 상대를 고른다(같으면 순서가 빠른 쪽)
  function richestFoe(player, score) {
    const foes = state.players.filter(q => q.alive && enemies(q.id, player));
    if (!foes.length) return null;
    return foes.sort((a, b) => score(b) - score(a))[0].id;
  }
  function autoAttacks(player) {
    const team = teamOf(player);
    const foesNear = tiles => [...state.units.values()].filter(u => enemies(u.owner, player) && tiles.includes(u.tile) && unitVisible(team, u));
    for (const b of buildingsOf(player)) {
      if (state.phase === 'over') return;
      if (b.kind === 'castle') {
        const near = foesNear(geo.around(b.vertex, rules.castle.reach));
        if (!near.length) continue;
        // 임시 대상: 가장 가까운 적, 같으면 체력이 낮은 적
        const target = near.sort((a, c) => geo.distanceToVertex(a.tile, b.vertex) - geo.distanceToVertex(c.tile, b.vertex) || a.hp - c.hp)[0];
        const strong = buildingsOf(player).some(o => o !== b && working(o) && edgesBetween(b.vertex, o.vertex) <= 2);
        emit({ type: 'tower', vertex: b.vertex, target: target.id, from: b.vertex, to: target.tile });
        hurtUnit(target, strong ? rules.castle.damage : rules.castle.weakDamage, { kind: 'attack' });
        continue;
      }
      const tower = TOWERS[b.card];
      if (!tower || !working(b)) continue;
      const near = foesNear(geo.around(b.vertex, tower.reach));
      if (!near.length) continue;
      let target;
      if (b.card === 'building-warrior-watchtower') target = choice(near);
      else if (b.card === 'building-mage-tower') target = near.sort((a, c) => geo.distanceToVertex(a.tile, b.vertex) - geo.distanceToVertex(c.tile, b.vertex))[0];
      else { target = near.sort((a, c) => a.hp - c.hp)[0]; b.revealed = true; }
      emit({ type: 'tower', vertex: b.vertex, target: target.id, from: b.vertex, to: target.tile });
      hurtUnit(target, defs.get(b.card).stats.atk, { kind: 'attack' });
    }
  }
  // 두 꼭짓점 사이 최단 변 수(내 길이 아니어도 셈). 왕성 강화 조건(두 변 이내)에 쓴다.
  function edgesBetween(a, b) {
    let frontier = [a]; const seen = new Set([a]);
    for (let d = 0; d <= 3; d++) {
      if (frontier.includes(b)) return d;
      frontier = frontier.flatMap(v => geo.vertexNeighbors(v)).filter(v => !seen.has(v) && seen.add(v));
    }
    return Infinity;
  }
  function endTurn(player) {
    const p = P(player);
    for (const u of unitsOf(player)) { if (u.rooted > 0) u.rooted--; u.sprint = false; }
    draw(player, 1);
    if (p.hand.length > rules.hand.max) { state.pending.push({ type: 'discard', player, count: p.hand.length - rules.hand.max }); return; }
    passTurn();
  }
  function passTurn() {
    const order = state.order;
    let i = order.indexOf(state.current);
    for (let k = 0; k < order.length; k++) {
      i = (i + 1) % order.length;
      if (i === 0) state.round++;
      if (P(order[i]).alive) break;
    }
    beginTurn(order[i]);
  }

  // ── 고를 수 있는 것(화면과 봇이 함께 씀) ───────────────────────
  const unitCap = player => Math.min(rules.units.max, 1
    + buildingsOf(player).filter(b => b.kind === 'village' && working(b)).length
    + buildingsOf(player).filter(b => isCard(b, 'building-warrior-barracks') && working(b)).length);
  // 길: 끝 꼭짓점 하나가 내 건물이거나, 내 길이 닿고 상대 건물이 없는 곳
  function roadSpots(player) {
    return memo(`roads${player}`, () => [...geo.edges.values()].filter(edge => {
      if (state.roads.has(edge.key) || !edge.hexes.some(h => geo.tiles.has(h))) return false;
      return [edge.a, edge.b].some(v => {
        const b = state.buildings.get(v);
        if (b) return b.owner === player;
        return (geo.vertexEdges.get(v) ?? []).some(e => state.roads.get(e) === player);
      });
    }).map(e => e.key));
  }
  // 건설 탭의 종족 건물: 카드 없이 비용만 내면 짓는다. 종류마다 max개까지(임시: 예전 카드 장수)
  const buildable = player => cards.filter(c => c.type === 'building' && c.look === P(player).race)
    .map(c => ({ def: defs.get(c.id), count: buildingsOf(player).filter(b => b.card === c.id).length }));
  // 마을·건물: 놓을 수 있는 꼭짓점 중 내 길이 닿은 곳
  function buildSpots(player) {
    return memo(`build${player}`, () => [...geo.vertices.keys()].filter(v => canPlace(v) && (geo.vertexEdges.get(v) ?? []).some(e => state.roads.get(e) === player) && reached(player).has(v)));
  }
  // 소환: 내 정상·활성 건물에 붙은 빈 칸(지나갈 수 있는 칸)
  function summonTiles(player) {
    const out = new Set();
    for (const b of buildingsOf(player)) if (working(b)) for (const t of geo.vertices.get(b.vertex).land) if (passable(t) && !unitAt(t)) out.add(t);
    return [...out];
  }
  function attackTargets(u) {
    const def = defs.get(u.card);
    const team = teamOf(u.owner);
    const range = def.stats.rng;
    if (!range || def.stats.atk <= 0) return [];
    const out = [];
    for (const o of state.units.values()) if (enemies(o.owner, u.owner) && unitVisible(team, o) && geo.distance(u.tile, o.tile) <= range) out.push({ unit: o.id, tile: o.tile });
    for (const b of state.buildings.values()) if (enemies(b.owner, u.owner) && buildingVisible(team, b) && geo.distanceToVertex(u.tile, b.vertex) <= range - 1) out.push({ vertex: b.vertex });
    return out;
  }
  const canAct = u => !u.fresh && !u.skilled;
  function skillTargets(u, index = 0) {
    const skill = skillsOf(u.card)[index];
    if (!skill || !canAct(u) || u.moved || u.attacked || u.mana < skill.mana) return [];
    const team = teamOf(u.owner);
    const foeUnits = reach => [...state.units.values()].filter(o => enemies(o.owner, u.owner) && unitVisible(team, o) && geo.distance(u.tile, o.tile) <= reach);
    switch (`${u.card}#${skill.name}`) {
      case 'unit-warrior-axe#쪼개기': return foeUnits(defs.get(u.card).stats.rng).map(o => ({ unit: o.id, tile: o.tile }));
      case 'unit-assassin-poison#맹독침': return foeUnits(2).map(o => ({ unit: o.id, tile: o.tile }));
      case 'unit-assassin-shadow#그림자 도약': return foeUnits(2).map(o => ({ unit: o.id, tile: o.tile }));
      case 'unit-mage-barrier#결계': return [u, ...unitsOf(u.owner).filter(o => geo.distance(o.tile, u.tile) === 1)].map(o => ({ unit: o.id, tile: o.tile }));
      case 'unit-warrior-knight#돌진': return [0, 1, 2, 3, 4, 5].flatMap(dir => { const plan = chargePlan(u, dir); return plan ? [{ dir, tile: plan.target.tile }] : []; });
      case 'unit-mage-broom#비행': return [0, 1, 2, 3, 4, 5].flatMap(dir => flightSpots(u, dir).map(tile => ({ dir, tile })));
      case 'unit-mage-seer#별똥별': return [...geo.tiles.keys()].filter(t => geo.distance(t, u.tile) <= 3).map(tile => ({ tile }));
      case 'unit-mage-archmage#대폭발': return [...geo.tiles.keys()].filter(t => geo.distance(t, u.tile) <= 4).map(tile => ({ tile }));
      default: return [{ self: true, tile: u.tile }];
    }
  }
  // 돌진: 한 방향으로 0~3칸 곧게 달려 바로 앞의 적을 찌른다. 길이 막혔거나 끝에 적이 없으면 못 쓴다.
  function chargePlan(u, dir) {
    const team = teamOf(u.owner);
    let tile = u.tile; const path = [];
    for (let s = 0; s <= 3; s++) {
      const next = geo.step(tile, dir);
      const o = unitAt(next);
      if (o && enemies(o.owner, u.owner) && unitVisible(team, o)) return { path, target: o };
      if (s === 3 || !passable(next) || o) return null;
      path.push(next); tile = next;
    }
    return null;
  }
  // 비행: 한 방향으로 곧게 1~3칸, 지나가는 칸은 무엇이든 넘고, 내릴 칸은 비어 있고 지나갈 수 있어야
  function flightSpots(u, dir) {
    const out = []; let tile = u.tile;
    for (let s = 1; s <= 3; s++) {
      tile = geo.step(tile, dir);
      if (passable(tile) && !unitAt(tile)) out.push(tile);
    }
    return out;
  }
  // 함정을 놓을 곳
  function trapTargets(player, id) {
    const target = defs.get(id).target;
    const team = teamOf(player);
    if (target === '칸') return [...geo.tiles.keys()].filter(t => passable(t) && !unitAt(t) && !state.traps.has(t) && sees(team, t)).map(tile => ({ tile }));
    if (target === '건물') return buildingsOf(player).filter(b => b.kind !== 'castle' && !b.trap).map(b => ({ vertex: b.vertex }));
    if (target === '유닛') return unitsOf(player).filter(u => !u.mirror).map(u => ({ unit: u.id, tile: u.tile }));
    if (target === '왕성') { const b = state.buildings.get(P(player).castle); return b && !b.trap ? [{ vertex: b.vertex }] : []; }
    return [];
  }
  function magicTargets(player, id) {
    const mine = unitsOf(player);
    switch (id) {
      case 'magic-ironwall': case 'magic-sprint': return mine.filter(u => id !== 'magic-sprint' || (!u.moved && canAct(u))).map(u => ({ unit: u.id, tile: u.tile }));
      case 'magic-fireball': {
        const from = [...mine.map(u => u.tile)];
        const blds = buildingsOf(player).filter(b => !b.damaged);
        return [...geo.tiles.keys()].filter(t => from.some(f => geo.distance(f, t) <= 3) || blds.some(b => geo.distanceToVertex(t, b.vertex) <= 3)).map(tile => ({ tile }));
      }
      case 'magic-farsight': return [...geo.tiles.keys()].map(tile => ({ tile }));
      case 'magic-repair': return buildingsOf(player).filter(b => b.damaged || (TOWERS[b.card] && b.hp < defs.get(b.card).stats.hp)).map(b => ({ vertex: b.vertex }));
      case 'magic-harvest': return RESOURCES.map(resource => ({ resource }));
      case 'magic-pickpocket': return state.players.filter(q => q.alive && enemies(q.id, player)).flatMap(q => RESOURCES.map(resource => ({ player: q.id, resource })));
      default: return [{}];
    }
  }
  function tradeRates(player) {
    const rates = Object.fromEntries(RESOURCES.map(r => [r, rules.trade]));
    for (const port of geo.ports) {
      if (!port.spots.some(v => state.buildings.get(v)?.owner === player)) continue;
      for (const r of port.pair) rates[r] = 2;
    }
    return rates;
  }
  // 교환소는 두 자원끼리만 2:1. 그 밖은 4:1(원하는 자원).
  function tradeRate(player, give, get) {
    for (const port of geo.ports) if (port.pair.includes(give) && port.pair.includes(get) && port.spots.some(v => state.buildings.get(v)?.owner === player)) return 2;
    return rules.trade;
  }

  // ── 명령 ───────────────────────────────────────────────────
  const fail = text => ({ ok: false, error: text, events: [] });
  function apply(cmd) {
    events = [];
    const error = run(cmd);
    if (error) return fail(error);
    touch(); remember();
    if (state.current !== null && state.phase === 'main') checkGoal(state.current);
    return { ok: true, events };
  }
  const goalCount = player => buildingsOf(player).filter(b => b.kind !== 'castle' && working(b)).length;
  function checkGoal(player) {
    if (!rules.goal || !P(player).alive || goalCount(player) < rules.goal) return;
    state.winner = teamOf(player); state.phase = 'over';
    log(`${name(player)}이(가) 건물 ${rules.goal}개를 세워 이겼다`);
    emit({ type: 'over', team: state.winner, goal: player });
  }
  function run(cmd) {
    const player = cmd.player;
    const p = P(player);
    if (!p) return '플레이어가 없어요';
    if (state.phase === 'over') return '게임이 끝났어요';
    const top = state.pending[0];
    if (top && cmd.type !== 'resolve' && !(top.type === 'village' && cmd.type === 'placeVillage')) return '먼저 고를 것이 있어요';
    if (cmd.type === 'placeVillage') {
      if (state.phase !== 'setup' || !state.pending.some(x => x.type === 'village' && x.player === player)) return '지금은 마을 자리를 고를 때가 아니에요';
      return placeVillage(player, cmd.vertex);
    }
    if (cmd.type === 'resolve') return resolve(player, cmd);
    if (state.current !== player) return '내 턴이 아니에요';
    if (cmd.type === 'roll') {
      if (state.phase !== 'roll') return '이미 주사위를 굴렸어요';
      rollDice(player); return null;
    }
    if (state.phase !== 'main') return '주사위를 먼저 굴려요';
    switch (cmd.type) {
      case 'road': {
        if (!roadSpots(player).includes(cmd.edge)) return '길을 놓을 수 없는 자리예요';
        if (!has(p.resources, rules.cost.road)) return '자원이 모자라요';
        pay(p, rules.cost.road); state.roads.set(cmd.edge, player);
        emit({ type: 'road', player, edge: cmd.edge }); touch(); return null;
      }
      case 'village': {
        if (!buildSpots(player).includes(cmd.vertex)) return '마을을 지을 수 없는 자리예요';
        if (!has(p.resources, rules.cost.village)) return '자원이 모자라요';
        pay(p, rules.cost.village);
        state.buildings.set(cmd.vertex, { vertex: cmd.vertex, owner: player, kind: 'village', card: null, damaged: false, trap: null });
        emit({ type: 'build', player, vertex: cmd.vertex, kind: 'village' }); log(`${name(player)}이(가) 마을을 지었다`); touch(); return null;
      }
      case 'build': {
        const def = defs.get(cmd.card);
        if (def?.type !== 'building' || def.look !== p.race) return '지을 수 없는 건물이에요';
        if (buildingsOf(player).filter(b => b.card === def.id).length >= def.max) return `${def.name}은(는) ${def.max}개까지 지어요`;
        if (!has(p.resources, def.costMap)) return '자원이 모자라요';
        if (!buildSpots(player).includes(cmd.vertex)) return '지을 수 없는 자리예요';
        pay(p, def.costMap);
        state.buildings.set(cmd.vertex, { vertex: cmd.vertex, owner: player, kind: 'building', card: def.id, hp: def.stats?.hp ?? null, damaged: false, trap: null, revealed: false });
        emit({ type: 'build', player, vertex: cmd.vertex, kind: 'building', card: def.id }); log(`${name(player)}이(가) ${def.name}을(를) 지었다`); touch(); return null;
      }
      case 'trade': {
        const rate = tradeRate(player, cmd.give, cmd.get);
        if (cmd.give === cmd.get || !RESOURCES.includes(cmd.give) || !RESOURCES.includes(cmd.get)) return '바꿀 자원을 골라요';
        if (p.resources[cmd.give] < rate) return `${RESOURCE_NAMES[cmd.give]}이(가) ${rate}개 필요해요`;
        p.resources[cmd.give] -= rate; p.resources[cmd.get]++;
        emit({ type: 'trade', player, give: cmd.give, get: cmd.get, rate }); return null;
      }
      case 'play': return play(player, cmd);
      case 'move': return moveUnit(player, cmd);
      case 'attack': return attackUnit(player, cmd);
      case 'skill': return useSkill(player, cmd);
      case 'gate': {
        const u = state.units.get(cmd.unit);
        if (!u || u.owner !== player || p.gateUsed || u.moved || u.fresh || u.skilled) return '옮길 수 없어요';
        const gate = buildingsOf(player).find(b => isCard(b, 'building-mage-teleport-gate') && working(b) && geo.around(b.vertex, 1).includes(u.tile));
        if (!gate) return '순간이동 문 주변 1칸 안의 유닛만 옮겨요';
        const spots = geo.vertices.get(p.castle).land.filter(t => passable(t) && !unitAt(t));
        if (!spots.includes(cmd.tile)) return '왕성에 붙은 빈 칸으로만 옮겨요';
        const from = u.tile; u.tile = cmd.tile; u.moved = true; u.camo = false; p.gateUsed = true;
        emit({ type: 'teleport', unit: u.id, from, to: cmd.tile }); touch(); return null;
      }
      case 'end': {
        if (state.pending.length) return '먼저 고를 것이 있어요';
        endTurn(player); return null;
      }
    }
    return '모르는 명령이에요';
  }
  function play(player, cmd) {
    const p = P(player);
    if (!p.hand.includes(cmd.uid)) return '손에 없는 카드예요';
    const id = cardOf.get(cmd.uid);
    const def = defs.get(id);
    if (def.type === 'unit') {
      if (!has(p.resources, def.costMap)) return '자원이 모자라요';
      if (unitsOf(player).length >= unitCap(player)) return `유닛은 ${unitCap(player)}기까지 둘 수 있어요`;
      if (!summonTiles(player).includes(cmd.tile)) return '내 건물에 붙은 빈 칸에만 소환해요';
      pay(p, def.costMap); takeFromHand(player, cmd.uid);
      const id2 = state.nextUnit++;
      // 임시: 소환할 때 마나는 가득(설계서 미정). 소환한 턴에는 행동하지 않는다.
      const u = { id: id2, uid: cmd.uid, card: id, owner: player, tile: cmd.tile, hp: def.stats.hp, maxHp: def.stats.hp, mana: def.stats.mana, maxMana: def.stats.mana,
        moved: false, attacked: false, skilled: false, fresh: true, reduce: [], barrier: null, mirror: null, poison: 0, rooted: 0, taunt: null, camo: false, revealed: false, hideoutBlock: 0, sprint: false, undying: false, warped: false };
      state.units.set(id2, u);
      emit({ type: 'summon', player, unit: id2, card: id, tile: cmd.tile }); log(`${name(player)}이(가) ${def.name}을(를) 소환했다`); touch(); return null;
    }
    if (def.type === 'trap') {
      const t = cmd.target ?? {};
      const ok = trapTargets(player, id).some(o => (o.tile && o.tile === t.tile && !o.unit) || (o.vertex && o.vertex === t.vertex) || (o.unit && o.unit === t.unit));
      if (!ok) return '함정을 놓을 수 없는 곳이에요';
      takeFromHand(player, cmd.uid);
      if (def.target === '칸') state.traps.set(t.tile, { owner: player, uid: cmd.uid, id });
      else if (def.target === '유닛') state.units.get(t.unit).mirror = cmd.uid;
      else state.buildings.get(t.vertex).trap = { uid: cmd.uid, id };
      emit({ type: 'set-trap', player, id, target: t }); return null;
    }
    // 마법
    const t = cmd.target ?? {};
    const options = magicTargets(player, id);
    const match = options.find(o => Object.keys(o).every(k => k === 'tile' && o.unit ? true : o[k] === t[k]));
    if (!match) return '쓸 수 없는 대상이에요';
    takeFromHand(player, cmd.uid);
    state.fieldDiscard.push(cmd.uid);
    emit({ type: 'magic', player, id, target: t });
    log(`${name(player)}이(가) ${def.name}을(를) 썼다`);
    castMagic(player, id, t);
    touch(); return null;
  }
  function castMagic(player, id, t) {
    const p = P(player);
    switch (id) {
      case 'magic-warcry': p.warcry = true; break;
      case 'magic-ironwall': state.units.get(t.unit).reduce.push({ amount: 2, until: player }); break;
      case 'magic-fireball':
        for (const o of [...state.units.values()]) if (enemies(o.owner, player) && (o.tile === t.tile || geo.neighborsOf.get(t.tile).includes(o.tile))) hurtUnit(o, 1, { kind: 'effect' });
        break;
      case 'magic-sprint': state.units.get(t.unit).sprint = true; break;
      case 'magic-farsight': p.sights.push({ tiles: [...geo.tiles.keys()].filter(k => geo.distance(k, t.tile) <= 2), reveal: true }); break;
      case 'magic-repair': { const b = state.buildings.get(t.vertex); b.damaged = false; if (TOWERS[b.card]) b.hp = defs.get(b.card).stats.hp; break; }
      case 'magic-market': {
        const alive = state.order.filter(q => P(q).alive);
        const start = alive.indexOf(player);
        const order = [...alive.slice(start), ...alive.slice(0, start)];
        const cards = [];
        for (let i = 0; i < order.length; i++) { const uid = drawFrom(player, 'field'); if (uid !== null) cards.push(uid); }
        if (cards.length) state.pending.push({ type: 'market', player: order[0], order, index: 0, cards });
        break;
      }
      case 'magic-harvest': {
        let count = 0;
        for (const b of buildingsOf(player)) if (working(b) && geo.vertices.get(b.vertex).land.some(k => TERRAIN[geo.tiles.get(k).type].resource === t.resource)) count++;
        gain(player, t.resource, Math.min(3, count), 'harvest');
        break;
      }
      case 'magic-closegate': p.gateClosed = true; break;
      case 'magic-rewrite': p.fateNext = true; break;
      case 'magic-pickpocket': if (P(t.player).resources[t.resource] > 0) { P(t.player).resources[t.resource]--; gain(player, t.resource, 1, 'pickpocket'); } break;
    }
  }
  function moveUnit(player, cmd) {
    const u = state.units.get(cmd.unit);
    if (!u || u.owner !== player) return '내 유닛이 아니에요';
    if (u.fresh) return '소환한 턴에는 움직이지 않아요';
    if (u.moved || u.skilled) return '이번 턴에 이미 움직였어요';
    if (u.rooted > 0) return '걸림목에 걸려 움직이지 못해요';
    if (u.mana < 1) return '마나가 모자라요';
    const options = reach(u, defs.get(u.card).stats.move + (u.sprint ? 2 : 0), { rough: !u.sprint });
    const path = options.get(cmd.tile);
    if (!path) return '갈 수 없는 칸이에요';
    u.mana--; u.moved = true; u.camo = false;
    walk(u, path);
    return null;
  }
  function attackUnit(player, cmd) {
    const u = state.units.get(cmd.unit);
    if (!u || u.owner !== player) return '내 유닛이 아니에요';
    if (u.fresh) return '소환한 턴에는 공격하지 않아요';
    if (u.attacked || u.skilled) return '이번 턴에 이미 공격했어요';
    if (u.mana < 1) return '마나가 모자라요';
    const t = attackTargets(u).find(o => (cmd.target.unit && o.unit === cmd.target.unit) || (cmd.target.vertex && o.vertex === cmd.target.vertex));
    if (!t) return '공격할 수 없는 대상이에요';
    u.mana--; u.attacked = true;
    strike(u, t.unit ? { unit: state.units.get(t.unit) } : { building: state.buildings.get(t.vertex) }, defs.get(u.card).stats.atk);
    return null;
  }
  function useSkill(player, cmd) {
    const u = state.units.get(cmd.unit);
    if (!u || u.owner !== player) return '내 유닛이 아니에요';
    const index = cmd.index ?? 0;
    const skill = skillsOf(u.card)[index];
    if (!skill) return '스킬이 없어요';
    if (u.fresh) return '소환한 턴에는 스킬을 쓰지 않아요';
    if (u.moved || u.attacked || u.skilled) return '이미 행동한 유닛은 스킬을 못 써요';
    if (u.mana < skill.mana) return '마나가 모자라요';
    const options = skillTargets(u, index);
    const t = cmd.target ?? {};
    let picked;
    if (skill.kind === 'tiles') {
      const tiles = [...new Set(t.tiles ?? [])];
      if (!tiles.length || tiles.length > skill.count || !tiles.every(k => options.some(o => o.tile === k))) return `칸을 ${skill.count}개까지 골라요`;
      picked = { tiles };
    } else picked = options.find(o => {
      if (skill.kind === 'self') return true;
      if (skill.kind === 'attack' || skill.kind === 'ally') return o.unit === t.unit;
      if (skill.kind === 'dir') return o.dir === t.dir && (t.tile === undefined || o.tile === t.tile);
      return o.tile === t.tile;
    });
    if (!picked) return '쓸 수 없는 대상이에요';
    u.mana -= skill.mana; u.moved = u.attacked = u.skilled = true;
    emit({ type: 'skill', unit: u.id, name: skill.name, target: picked });
    log(`${name(player)}의 ${defs.get(u.card).name}: ${skill.name}`);
    const team = teamOf(player);
    switch (`${u.card}#${skill.name}`) {
      case 'unit-warrior-axe#쪼개기': strike(u, { unit: state.units.get(picked.unit) }, 2, { pierce: true }); break;
      case 'unit-warrior-flag#응원': for (const o of unitsOf(player)) if (o.id !== u.id && geo.distance(o.tile, u.tile) === 1) o.reduce.push({ amount: 1, until: player }); break;
      case 'unit-warrior-knight#돌진': {
        const plan = chargePlan(u, picked.dir);
        if (plan.path.length) walk(u, plan.path);
        if (state.units.has(u.id) && state.units.has(plan.target.id) && geo.distance(u.tile, plan.target.tile) === 1) {
          strike(u, { unit: plan.target }, 3);
          if (state.units.has(u.id)) hurtUnit(u, 1, { kind: 'self' });
        }
        break;
      }
      case 'unit-warrior-general#전투의 야옹':
        for (const o of state.units.values()) if (enemies(o.owner, player) && unitVisible(team, o) && geo.distance(o.tile, u.tile) <= 2 && !o.taunt) o.taunt = u.id;
        u.revealed = true; break;
      case 'unit-mage-barrier#결계': state.units.get(picked.unit).barrier = player; break;
      case 'unit-mage-broom#비행': { const from = u.tile; u.tile = picked.tile; u.camo = false; emit({ type: 'fly', unit: u.id, from, to: picked.tile }); const trap = state.traps.get(picked.tile); if (trap && enemies(trap.owner, player)) springTrap(trap, u, picked.tile); if (u.warped) u.warped = false; break; }
      case 'unit-mage-seer#예언': {
        const fog = [...geo.tiles.keys()].filter(k => !sees(team, k));
        P(player).sights.push({ tiles: shuffle(fog).slice(0, 3), reveal: false });
        break;
      }
      case 'unit-mage-seer#별똥별': P(player).meteors.push(picked.tiles); emit({ type: 'meteors', player, tiles: picked.tiles }); break;
      case 'unit-mage-archmage#대폭발':
        for (const o of [...state.units.values()]) if (enemies(o.owner, player) && (o.tile === picked.tile || geo.neighborsOf.get(picked.tile).includes(o.tile))) hurtUnit(o, 2, { kind: 'effect' });
        u.revealed = true; break;
      case 'unit-assassin-scout#위장': case 'unit-assassin-dagger#위장': case 'unit-assassin-poison#위장': u.camo = true; break;
      case 'unit-assassin-poison#맹독침': {
        const target = state.units.get(picked.unit);
        strike(u, { unit: target }, 1);
        if (state.units.has(target.id) && !SHIELDED.has(target.card)) target.poison = 2;
        break;
      }
      case 'unit-assassin-shadow#그림자 도약': {
        const target = state.units.get(picked.unit);
        const dir = geo.direction(u.tile, target.tile);
        const behind = geo.step(target.tile, dir);
        const front = geo.step(target.tile, (dir + 3) % 6);
        const free = t => t === u.tile || (passable(t) && !unitAt(t));
        const land = free(behind) ? behind : free(front) ? front : u.tile;
        const from = u.tile;
        strike(u, { unit: target }, 3);
        if (state.units.has(u.id) && land !== u.tile) { u.tile = land; emit({ type: 'fly', unit: u.id, from, to: land }); }
        break;
      }
    }
    touch();
    return null;
  }
  function resolve(player, cmd) {
    const top = state.pending[0];
    if (!top || top.player !== player) return '고를 차례가 아니에요';
    switch (top.type) {
      case 'discard': {
        const uids = cmd.uids ?? [];
        if (uids.length !== top.count || !uids.every(uid => P(player).hand.includes(uid)) || new Set(uids).size !== uids.length) return `${top.count}장을 골라 버려요`;
        for (const uid of uids) { takeFromHand(player, uid); discardCard(player, uid); }
        state.pending.shift(); passTurn(); return null;
      }
      case 'market': {
        if (!top.cards.includes(cmd.uid)) return '고를 수 없는 카드예요';
        top.cards.splice(top.cards.indexOf(cmd.uid), 1);
        P(player).hand.push(cmd.uid); emit({ type: 'draw', player, uid: cmd.uid });
        top.index++;
        if (top.index >= top.order.length || !top.cards.length) { state.fieldDiscard.push(...top.cards); state.pending.shift(); }
        else top.player = top.order[top.index];
        return null;
      }
      case 'stargaze': {
        if (!top.deck) {
          if (!['race', 'field'].includes(cmd.deck)) return '덱을 골라요';
          const deck = cmd.deck === 'race' ? P(player).raceDeck : state.fieldDeck;
          top.deck = cmd.deck; top.cards = deck.slice(-2).reverse();
          if (!top.cards.length) state.pending.shift();
          return null;
        }
        if (!top.cards.includes(cmd.uid)) return '고를 수 없는 카드예요';
        const deck = top.deck === 'race' ? P(player).raceDeck : state.fieldDeck;
        for (const uid of top.cards) deck.splice(deck.indexOf(uid), 1);
        P(player).hand.push(cmd.uid);
        const rest = top.cards.filter(uid => uid !== cmd.uid);
        deck.unshift(...rest); // 남은 1장은 그 덱 맨 아래로
        state.pending.shift(); return null;
      }
      case 'fate': {
        const dice = top.options[cmd.index];
        if (!dice) return '결과를 골라요';
        state.pending.shift(); rollDice(player, dice); return null;
      }
      case 'warp': {
        if (!top.tiles.includes(cmd.tile) || unitAt(cmd.tile)) return '옮길 수 없는 칸이에요';
        const u = state.units.get(top.unit);
        state.pending.shift();
        if (u) { const from = u.tile; u.tile = cmd.tile; emit({ type: 'teleport', unit: u.id, from, to: cmd.tile }); touch(); }
        return null;
      }
    }
    return '모르는 선택이에요';
  }

  // 시작: 모두 동시에 마을 자리를 고른다(고를 자리가 없으면 건너뜀)
  for (const q of state.players) if (villageSpots(q.id).length) state.pending.push({ type: 'village', player: q.id });
  remember();
  if (!state.pending.length) decideOrder();

  return {
    state, geo, defs, board, rules, cardOf, apply, teams,
    card: uid => defs.get(cardOf.get(uid)),
    // 질의(화면·봇)
    villageSpots, roadSpots, buildSpots, buildable, summonTiles, attackTargets, skillTargets, trapTargets, magicTargets, tradeRates, tradeRate,
    reach: u => reach(u, defs.get(u.card).stats.move + (u.sprint ? 2 : 0), { rough: !u.sprint }),
    unitCap, unitsOf, buildingsOf, goalCount, working, isActive, teamOf, enemies, unitAt, has, passable,
    sight, sees, unitVisible, buildingVisible, hiddenFrom, detection, reached,
    canMove: u => !u.fresh && !u.moved && !u.skilled && u.rooted <= 0 && u.mana >= 1,
    canAttack: u => !u.fresh && !u.attacked && !u.skilled && u.mana >= 1,
    canSkill: (u, i = 0) => skillTargets(u, i).length > 0,
    gateTiles: player => geo.vertices.get(P(player).castle).land.filter(t => passable(t) && !unitAt(t)),
    canGate: u => !P(u.owner).gateUsed && !u.moved && !u.fresh && !u.skilled && buildingsOf(u.owner).some(b => isCard(b, 'building-mage-teleport-gate') && working(b) && geo.around(b.vertex, 1).includes(u.tile)),
    playerName: name,
  };
}
