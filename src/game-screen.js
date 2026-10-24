// 한 판 진행: 나(0번)와 봇. 규칙은 엔진(src/game/rules.js), 판 그리기는 지도 화면(map-screen.js)이 맡는다.
// 여기서는 누름을 명령으로 바꾸고, 명령의 결과(이벤트)를 차례로 보여 준다. 봇은 한 동작씩 보여 준다.
// 내 턴은 순서가 정해져 있다(2026-10-22 사용자 결정): MY TURN → 주사위(나머지는 어둡게 잠금) → 자원 연출(조작 잠금) → 행동 1분.
// 2026-10-24 사용자 피드백: 건물은 카드가 아니라 건설 탭, 버리기는 펼친 패에서, 턴 종료는 한 번 묻기, 봇 주사위는 프로필에 숫자로, 봇은 느리게·말없이.
import './game.css';
import { createBoard, createRng, MODES } from './board.js';
import { createGame, RESOURCES, RESOURCE_NAMES, skillsOf } from './game/rules.js';
import { botStep } from './game/bot.js';
import { parseHex } from './game/geometry.js';
import { VISIBLE } from './vision.js';
import cards from './generated/cards.json';
import { cardHTML, image, kindText } from './card-view.js';
import { tinted } from './tint.js';
import { rollDice } from './dice.js';
import { useReducedMotion } from './motion.js';

const ME = 0;
const RACES = ['warrior', 'mage', 'assassin'];
const RACE_NAMES = { warrior: '냥전사', mage: '냥법사', assassin: '냥살자' };
const TURN_TIME = 60; // 합의: 주사위 뒤 1분. 고르는 중에는 멈추되, 멈춘 시간은 한 턴에 합쳐 1분까지
const SETUP_TIME = 15; // 임시: 첫 마을 자리 고르기
const PACE = { normal: 950, fast: 250, auto: 60 }; // 봇 동작 사이(ms). auto: 내 자리도 봇이 두는 자동 대전. 임시: 보통 0.95초(2026-10-24 "너무 빠름")
const BOT_DICE = { normal: 1300, fast: 350, auto: 0 }; // 봇 주사위 숫자를 프로필에 보인 뒤 자원으로 넘어가기까지(ms)
const STEP = 170; // 유닛이 한 칸 가는 시간(ms)
const GAIN_COLOR = { gold: '#ffd54a', crystal: '#d2b2ff', wood: '#9be07a', fish: '#8fd8ff' };
const FALL = 320; // 쓰러지거나 부서지는 말이 붉게 번쩍인 뒤 사라지기까지(ms). 지도의 FLASH와 같다
const LIFT = { tile: 70, vertex: 125, edge: 24 }; // 확정 단추(✓✕)를 대상 위로 띄우는 높이(월드 단위): 동전, 건물, 길 위
const CONFIRM = new Set(['setup', 'village', 'build', 'road', 'card']); // 자리를 고르면 흐리게 놓아 보고 ✓로 확정하는 고르기
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
const CROSS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const icon = name => `<img src="${image(`ui/icon-${name}`, 'ui')}" alt="">`;
const costHTML = cost => Object.entries(cost).map(([r, n]) => `<span class="cost">${icon(r)}${n}</span>`).join('');
const wait = ms => new Promise(done => setTimeout(done, ms));
const hexesOf = key => key.split(key.includes('|') ? '|' : '~').map(parseHex);
const isPlace = key => /^-?\d/.test(key); // 칸·꼭짓점 key(자원이 'market' 같은 효과에서 오면 아님)
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export function gameScreen(map, root) {
  const hud = root.querySelector('.hud');
  const mainButton = hud.querySelector('.dice-roll');
  hud.insertAdjacentHTML('beforeend', `
    <div class="strip">
      <p class="turn-banner"><span></span><button class="ui-button small blue pace" hidden aria-pressed="false">빠르게</button></p>
      <div class="pick-bar hud-panel" hidden><p></p><button class="ui-button small confirm" hidden>확인</button><button class="ui-button small blue cancel">취소</button></div>
      <div class="unit-panel hud-panel" hidden></div>
      <div class="end-ask hud-panel" role="alertdialog" aria-label="턴 종료 확인" hidden><p>턴을 종료하시겠습니까?</p><button class="ui-button small ok">확인</button><button class="ui-button small blue no">취소</button></div>
    </div>
    <p class="toast" aria-hidden="true"></p>
    <div class="tools" hidden>
      <button class="tool" data-tool="build" aria-expanded="false">${icon('home')}<span>건설</span></button>
      <button class="tool" data-tool="road"><i class="road-icon"></i><span>길</span><small>${costHTML({ wood: 1, fish: 1 })}</small></button>
      <button class="tool" data-tool="trade">${icon('trade')}<span>교환</span></button>
    </div>
    <div class="build-panel hud-panel" role="group" aria-label="건설" hidden></div>
    <button class="game-hand" aria-label="내 카드 보기"><span class="backs"></span><b class="hand-count">0</b></button>`);
  mainButton.innerHTML = `${icon('turn')}턴 끝내기<b class="clock"></b>`; // 게임에서는 턴 끝내기만(주사위는 턴 시작 화면)
  root.insertAdjacentHTML('beforeend', `
    <div class="confirm-pin" hidden><button class="ok" aria-label="확정">${CHECK}</button><button class="no" aria-label="취소">${CROSS}</button></div>
    <div class="fan" hidden>
      <p class="fan-note" hidden></p>
      <div class="fan-cards" role="group" aria-label="내 카드"></div>
      <div class="fan-focus" hidden><div class="focus-card"></div><p class="focus-note"></p><div class="focus-buttons"><button class="ui-button use">사용</button><button class="ui-button blue back">뒤로가기</button></div></div>
    </div>
    <div class="turn-intro" hidden><b class="intro-title" aria-hidden="true">MY TURN</b><button class="ui-button intro-roll">${icon('dice')}주사위 굴리기</button></div>
    <dialog class="game-dialog"></dialog>`);
  const strip = hud.querySelector('.strip');
  const banner = strip.querySelector('.turn-banner');
  const paceButton = banner.querySelector('.pace');
  const pickBar = strip.querySelector('.pick-bar');
  const unitPanel = strip.querySelector('.unit-panel');
  const toast = hud.querySelector('.toast');
  const tools = hud.querySelector('.tools');
  const buildPanel = hud.querySelector('.build-panel');
  const endAsk = strip.querySelector('.end-ask');
  const handButton = hud.querySelector('.game-hand');
  const dialog = root.querySelector('.game-dialog');
  const pin = root.querySelector('.confirm-pin');
  const fan = root.querySelector('.fan');
  const fanCards = fan.querySelector('.fan-cards');
  const focusView = fan.querySelector('.fan-focus');
  const fanNote = fan.querySelector('.fan-note');
  const intro = root.querySelector('.turn-intro');
  const introRoll = intro.querySelector('.intro-roll');

  let g = null, s = null, mode = 'duel', race = 'warrior', roster = [];
  let alive = 0; // 판마다 늘어, 지난 판의 봇 진행·타이머를 멈춘다
  let busy = false; // 연출 중에는 누름을 받지 않는다
  let pick = null; // 고르는 중인 것: { kind, ... }
  let marks = null; // 지금 판에 표시한 고를 수 있는 곳
  let memo = new Set(), memoTurn = -1; // 봇이 이번 턴에 실패한 시도
  let pace = 'normal';
  let auto = false; // 자동 대전(#play-auto): 내 자리도 봇이 둔다
  let clock = null; // 턴 시간
  let toastTimer = 0;
  let overHow = 'castle';
  let lag = {}; // 아직 날아오는 중인 내 자원. 재화 칸에는 받은 수에서 이만큼 빼고 보인다(아이콘이 닿을 때 오른다)
  // 연출이 닿기 전 모습: 맞기 전 체력(유닛 id·꼭짓점 → 체력), 쓰러질 유닛, 부서질 건물, 파손될 건물
  const held = { hp: new Map(), units: new Map(), buildings: new Map(), whole: new Set() };
  let fanKey = '', fanFocus = null, drag = null; // 펼친 패: 다시 그릴지 볼 열쇠, 크게 보는 카드, 끄는 카드
  let discard = null; // 패가 넘쳐 버리는 중: { count, chosen: [uid] }. 펼친 패에서 고른다
  let buildArt = {}; // 건설 탭의 건물 그림(내 색으로 칠함): id → 주소

  const team = () => g.teamOf(ME);
  const myMain = () => s.phase === 'main' && s.current === ME && !s.pending.length;
  const me = () => s.players[ME];
  const name = player => roster[player].name;
  // 주사위와 자원 연출이 끝나 행동할 수 있는 때(턴 시간이 흐름)
  const ready = () => myMain() && clock !== null && !auto;
  const seen = key => key && isPlace(key) && (key.includes('|') ? g.geo.vertices.get(key)?.land.some(k => g.sees(team(), k)) : g.sees(team(), key));
  const canAct = u => g.canMove(u) || (g.canAttack(u) && g.attackTargets(u).length > 0) || skillsOf(u.card).some((_, i) => g.canSkill(u, i)) || g.canGate(u);

  // ── 지도에 넘길 장면 ───────────────────────────────────────
  function scene() {
    const t = team();
    const sight = g.sight(t);
    const pieces = [];
    const building = (id, player, vertex, more) => ({ kind: 'building', id, player, key: vertex, hexes: g.geo.vertices.get(vertex).hexes, ...more });
    for (const b of s.buildings.values()) {
      if (b.kind === 'castle' || !g.buildingVisible(t, b)) continue;
      pieces.push(building(b.kind === 'village' ? 'village' : b.card, b.owner, b.vertex, { damaged: b.damaged && !held.whole.has(b.vertex), hp: held.hp.get(b.vertex) ?? b.hp ?? undefined }));
    }
    for (const [vertex, e] of held.buildings) pieces.push(building(e.kind === 'village' ? 'village' : e.card, e.owner, vertex, { damaged: true }));
    for (const u of s.units.values()) {
      if (!g.unitVisible(t, u)) continue;
      pieces.push({ kind: 'unit', id: u.card, player: u.owner, hexes: [parseHex(u.tile)], hp: held.hp.get(u.id) ?? u.hp, maxHp: u.maxHp, mana: u.mana, maxMana: u.maxMana, unitId: u.id,
        done: u.owner === ME && myMain() && !canAct(u), chosen: pick?.unit === u.id });
    }
    for (const [id, e] of held.units) {
      const stats = g.defs.get(e.card).stats;
      pieces.push({ kind: 'unit', id: e.card, player: e.owner, hexes: [parseHex(e.tile)], hp: held.hp.get(id) ?? 0, maxHp: stats.hp, mana: 0, maxMana: stats.mana, unitId: id });
    }
    const ghost = ghostPiece();
    if (ghost) pieces.push(ghost);
    const roads = [];
    for (const [edge, player] of s.roads) if (g.teamOf(player) === t || g.geo.edges.get(edge).hexes.some(h => sight.state.get(h) === VISIBLE)) roads.push({ player, edge });
    const chosen = pick?.chosen;
    if (chosen?.edge) roads.push({ player: ME, edge: chosen.edge, ghost: true });
    marks = markPick();
    return {
      sight, pieces, roads, marks,
      castleHp: s.players.map(p => held.hp.get(p.castle) ?? (p.alive ? p.castleHp : 0)),
      traps: [...s.traps].filter(([, trap]) => trap.owner === ME).map(([tile]) => tile),
      pin: chosen ? { el: pin, key: chosen.edge ?? chosen.vertex ?? chosen.tile, lift: LIFT[chosen.edge ? 'edge' : chosen.vertex ? 'vertex' : 'tile'] } : null,
      tap, leave: stop,
    };
  }
  const refresh = () => { pin.hidden = !pick?.chosen; map.setScene(scene()); updateHud(); };

  // 확정을 기다리며 흐리게 놓아 본 마을·건물·유닛
  function ghostPiece() {
    const c = pick?.chosen;
    if (!c || c.edge) return null;
    const def = pick.kind === 'card' ? g.card(pick.uid) : null;
    if (c.vertex && !def) return { kind: 'building', id: pick.kind === 'build' ? pick.id : 'village', player: ME, hexes: g.geo.vertices.get(c.vertex).hexes, ghost: true };
    if (c.tile && def?.type === 'unit') return { kind: 'unit', id: def.id, player: ME, hexes: [parseHex(c.tile)], hp: def.stats.hp, maxHp: def.stats.hp, mana: def.stats.mana, maxMana: def.stats.mana, ghost: true };
    return null;
  }

  // ── 고를 수 있는 곳 ────────────────────────────────────────
  function markPick() {
    if (!pick) return null;
    const tiles = new Map(), vertices = new Map(), edges = new Map(), range = new Set();
    const u = pick.unit !== undefined ? s.units.get(pick.unit) : null;
    switch (pick.kind) {
      case 'setup': for (const spot of g.villageSpots(ME)) vertices.set(spot.vertex, 'place'); break;
      case 'warp': for (const tile of pick.tiles) if (!g.unitAt(tile)) tiles.set(tile, 'place'); break;
      case 'road': for (const edge of g.roadSpots(ME)) edges.set(edge, 'place'); break;
      case 'village': case 'build': for (const vertex of g.buildSpots(ME)) vertices.set(vertex, 'place'); break;
      case 'gate': for (const tile of g.gateTiles(ME)) tiles.set(tile, 'place'); break;
      case 'unit': {
        if (!u) break;
        if (g.canMove(u)) for (const tile of g.reach(u).keys()) tiles.set(tile, 'move');
        const { atk, rng } = g.defs.get(u.card).stats;
        if (!g.canAttack(u) || !(atk > 0)) break;
        // 공격 범위(하늘색 칸)와 칠 수 있는 대상(빨강)
        for (const tile of g.geo.tiles.keys()) if (tile !== u.tile && g.geo.distance(u.tile, tile) <= rng) range.add(tile);
        for (const t of g.attackTargets(u)) (t.vertex ? vertices : tiles).set(t.vertex ?? t.tile, 'attack');
        break;
      }
      case 'skill': case 'card':
        for (const o of pick.options) {
          const kind = pick.picked?.includes(o.tile) ? 'attack' : pick.look;
          if (o.vertex) vertices.set(o.vertex, kind); else if (o.tile) tiles.set(o.tile, kind);
        }
        break;
    }
    // 확정을 기다리는 곳: 길·마을·건물·유닛은 흐린 말이 대신 보이고, 나머지 대상(마법·함정)은 하얗게
    const c = pick.chosen;
    if (c?.edge) edges.delete(c.edge);
    else if (c && !ghostPiece()) (c.vertex ? vertices : tiles).set(c.vertex ?? c.tile, 'picked');
    return { tiles, vertices, edges, range };
  }

  // 지도를 누르면: 표시한 꼭짓점·변·칸이면 고르고, 내 유닛이면 그 유닛을 고른다. 처리했으면 true(지도는 칸을 고르지 않음)
  function tap(hit) {
    if (s.phase === 'over') return true;
    if (!endAsk.hidden || !buildPanel.hidden) { closePops(); refresh(); return true; } // 열린 물음·건설 탭은 판을 누르면 닫는다
    if (busy) { look(hit); return true; } // 봇이 두는 중에도 유닛 정보는 볼 수 있다
    if (marks) {
      if (marks.vertices.size && hit.vertexDist < hit.near && marks.vertices.has(hit.vertex)) return choose({ vertex: hit.vertex }), true;
      if (marks.edges.size && hit.edgeDist < hit.near && marks.edges.has(hit.edge)) return choose({ edge: hit.edge }), true;
      // 동전(유닛)을 노리는 표시는 동전 자리 칸을 먼저 본다
      const order = ['attack', 'ally', 'picked'].includes(marks.tiles.get(hit.coinTile)) ? [hit.coinTile, hit.tile] : [hit.tile, hit.coinTile];
      for (const tile of order) if (tile && marks.tiles.has(tile)) return choose({ tile }), true;
    }
    if (pick?.chosen) return true; // 확정을 기다리는 중에는 표시 밖을 눌러도 그대로
    const tile = hit.coinTile ?? hit.tile;
    const u = tile ? g.unitAt(tile) : null;
    if (u && u.owner === ME && ready()) { selectUnit(u); return true; }
    if (look(hit)) return true;
    if (pick && ['unit', 'skill', 'gate'].includes(pick.kind)) { clearPick(); refresh(); }
    return false;
  }
  // 보이는 유닛을 누르면 이름·체력·마나를 알린다
  function look(hit) {
    const tile = hit.coinTile ?? hit.tile;
    const u = tile ? g.unitAt(tile) : null;
    if (!u || !g.unitVisible(team(), u)) return false;
    map.status.textContent = `${u.owner === ME ? '내' : `${name(u.owner)}의`} ${g.defs.get(u.card).name}: 체력 ${u.hp}/${u.maxHp}, 마나 ${u.mana}/${u.maxMana}`;
    say(map.status.textContent);
    return true;
  }

  function choose(at) {
    const p = pick;
    // 놓을 곳·대상은 흐리게 놓아 보고 ✓로 확정한다. 다른 표시를 누르면 그리로 옮긴다
    if (CONFIRM.has(p.kind)) {
      p.chosen = at;
      if (p.kind !== 'setup') showPick('✓를 누르면 확정, ✕를 누르면 다시 골라요');
      return refresh();
    }
    const { tile, vertex } = at;
    switch (p.kind) {
      case 'warp': return act({ type: 'resolve', tile });
      case 'gate': return act({ type: 'gate', unit: p.unit, tile });
      case 'unit': {
        if (marks.tiles.get(tile) === 'move') return act({ type: 'move', unit: p.unit, tile }, { reselect: p.unit });
        const target = vertex ? { vertex } : { unit: g.unitAt(tile).id };
        return act({ type: 'attack', unit: p.unit, target }, { reselect: p.unit });
      }
      case 'skill': {
        const o = p.options.find(x => (vertex ? x.vertex === vertex : x.tile === tile));
        if (p.skill.kind === 'tiles') {
          // 별똥별: 칸을 3개까지 골라 확인
          p.picked = p.picked.includes(tile) ? p.picked.filter(x => x !== tile) : [...p.picked, tile].slice(-p.skill.count);
          showPick(`별똥별 떨어질 칸을 ${p.skill.count}개까지 고르세요 (${p.picked.length}/${p.skill.count})`, p.picked.length > 0);
          return refresh();
        }
        const target = o.unit !== undefined ? { unit: o.unit } : o.dir !== undefined ? { dir: o.dir, tile: o.tile } : { tile: o.tile };
        return act({ type: 'skill', unit: p.unit, index: p.index, target });
      }
    }
  }

  // ✓: 흐리게 놓아 본 곳으로 명령을 보낸다
  function commit() {
    const p = pick, { tile, vertex, edge } = p.chosen;
    p.chosen = null;
    switch (p.kind) {
      case 'setup': return act({ type: 'placeVillage', vertex });
      case 'village': return act({ type: 'village', vertex });
      case 'build': return act({ type: 'build', card: p.id, vertex });
      case 'road': showPick(p.hint); return act({ type: 'road', edge }, { keep: true });
      case 'card': {
        const def = g.card(p.uid);
        if (def.type === 'unit') return act({ type: 'play', uid: p.uid, tile });
        const o = p.options.find(x => (vertex ? x.vertex === vertex : x.tile === tile));
        return act({ type: 'play', uid: p.uid, target: o.unit !== undefined ? { unit: o.unit } : vertex ? { vertex } : { tile } });
      }
    }
  }
  pin.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || busy || !pick?.chosen) return;
    if (button.classList.contains('ok')) return commit();
    pick.chosen = null;
    if (pick.hint) showPick(pick.hint);
    refresh();
  });

  // ── 명령 ──────────────────────────────────────────────────
  // 내 명령을 엔진에 넣고 결과를 보여 준 뒤 다음으로. keep: 고르기를 이어 감(길 여러 개), reselect: 그 유닛을 다시 고름(이동 뒤 공격)
  async function act(cmd, { keep = false, reselect = null } = {}) {
    if (busy) return false;
    const result = g.apply({ ...cmd, player: ME });
    if (!result.ok) { say(result.error); refresh(); return false; }
    const run = alive;
    busy = true;
    if (!keep) clearPick();
    closePops();
    if (cmd.type === 'end' || cmd.type === 'placeVillage') stopClock();
    await present(result.events, ME);
    if (run !== alive) return true;
    busy = false;
    const u = reselect !== null ? s.units.get(reselect) : null;
    if (u && myMain() && canAct(u)) selectUnit(u, false);
    if (keep && pick && !markPick()?.edges.size) clearPick();
    if (keep && pick && !g.has(me().resources, g.rules.cost.road)) clearPick();
    next();
    return true;
  }

  // 봇·대기 중인 고르기를 차례로 진행한다. 내가 고를 차례가 되면 멈추고 기다린다.
  async function next() {
    const run = alive;
    let refused = 0; // 봇 명령이 연달아 거부된 횟수(시뮬레이션에서는 0). 많으면 멈춰 화면이 굳지 않게 한다
    while (run === alive && s.phase !== 'over') {
      const top = s.pending[0];
      const actor = top ? top.player : s.current;
      if (actor === ME && !auto) return ask();
      busy = true;
      updateHud();
      if (s.turnCount !== memoTurn) { memo = new Set(); memoTurn = s.turnCount; }
      const cmd = botStep(g, actor, memo);
      if (!cmd) { console.error('봇이 할 일을 찾지 못함', top); busy = false; return; }
      const result = g.apply(cmd);
      if (!result.ok) {
        // memo가 같은 시도를 막는다
        if (++refused > 50) { console.error('봇 명령이 계속 거부됨', cmd, result.error); busy = false; return; }
        continue;
      }
      refused = 0;
      await present(result.events, actor);
      if (run !== alive) return;
      if (!['resolve', 'placeVillage'].includes(cmd.type)) await wait(PACE[pace]);
    }
    if (run === alive && s.phase === 'over') { busy = false; refresh(); gameOver(); }
  }

  // 내 차례: 대기 중인 고르기(창), 턴 시작 화면(주사위), 또는 턴 행동(1분)
  function ask() {
    busy = false;
    const top = s.pending[0];
    if (top?.type === 'discard') { openDiscard(top.count); return refresh(); }
    if (top || s.phase === 'roll') closeFan();
    if (top?.type === 'village') { if (pick?.kind !== 'setup') setPick({ kind: 'setup' }); startClock(SETUP_TIME, () => autoPick()); }
    else if (top?.type === 'warp') setPick({ kind: 'warp', tiles: top.tiles });
    else if (top) showChoice(top);
    else if (s.phase === 'roll') showIntro();
    else if (s.phase === 'main') startClock(TURN_TIME, () => timeUp());
    refresh();
  }

  // 시간이 다 되면 고르던 자리로, 없으면 봇과 같은 방법으로 대신 고른다
  async function autoPick() {
    closeDialog();
    if (pick?.kind === 'setup' && pick.chosen) return commit();
    clearPick();
    const cmd = botStep(g, ME, new Set());
    if (cmd) await act(cmd);
  }
  async function timeUp() {
    closeDialog();
    closeFan();
    closePops();
    clearPick();
    say('시간이 다 되어 턴을 넘겨요');
    await act({ type: 'end' });
  }

  // ── 턴 시작: MY TURN과 큰 주사위 단추. 굴리기 전에는 나머지를 어둡게 덮고 잠근다 ──
  const lockHud = () => { hud.inert = !intro.hidden || !fan.hidden; };
  function showIntro() {
    intro.classList.toggle('calm', useReducedMotion());
    intro.hidden = false;
    lockHud();
    map.status.textContent = '내 턴이에요. 주사위를 굴리세요';
    if (useReducedMotion()) introRoll.focus({ preventScroll: true });
  }
  function hideIntro() {
    intro.hidden = true;
    lockHud();
  }
  // 단추는 글자 연출 뒤에 나타난다(그 전에는 숨어 있어 누를 수 없음). 나타나면 키보드 초점을 준다
  introRoll.addEventListener('animationend', event => { if (event.animationName === 'intro-button') introRoll.focus({ preventScroll: true }); });
  introRoll.addEventListener('click', () => {
    if (busy || intro.hidden || s.current !== ME || s.phase !== 'roll' || s.pending.length) return;
    hideIntro();
    act({ type: 'roll' });
  });

  // ── 결과 보여 주기 ─────────────────────────────────────────
  // 연출이 닿기 전 모습을 잡아 둔다: 맞기 전 체력, 쓰러질 유닛, 부서질 건물, 날아올 내 자원.
  // 엔진은 결과를 한 번에 내므로, 이렇게 해야 맞기 전에 체력이 줄거나 말이 먼저 사라지지 않는다.
  function hold(events) {
    for (const e of events) {
      if (e.type === 'damage') { const key = e.unit ?? e.vertex; if (!held.hp.has(key)) held.hp.set(key, e.hp + e.amount); }
      else if (e.type === 'die' && (g.teamOf(e.owner) === team() || seen(e.tile))) held.units.set(e.unit, e);
      else if (e.type === 'destroyed' && seen(e.vertex)) held.buildings.set(e.vertex, e);
      else if (e.type === 'damaged') held.whole.add(e.vertex);
      else if (e.type === 'gain' && e.player === ME) lag[e.resource] += e.amount;
    }
  }

  async function present(events, actor) {
    const run = alive;
    hold(events);
    refresh();
    let gains = [];
    for (const e of events) {
      if (run !== alive) return;
      // 이어서 나온 자원 받기는 한꺼번에 연출한다
      if (gains.length && e.type !== 'gain') { await harvest(gains, actor); gains = []; }
      switch (e.type) {
        case 'order': say(`순서: ${e.order.map(name).join(' → ')}`); break;
        case 'roll': await showDice(e, actor); map.glow(e.sum); break;
        case 'gain': gains.push(e); break;
        case 'move': {
          const path = [e.from, ...e.path.filter(x => x !== e.from)];
          if (path.length > 1 && path.some(seen)) {
            if (actor !== ME) map.show(hexesOf(path.at(-1)));
            await map.move(e.unit, path.map(k => parseHex(k)), STEP * (path.length - 1));
          }
          break;
        }
        case 'fly': case 'teleport':
          if (seen(e.from) || seen(e.to)) await map.move(e.unit, [parseHex(e.from), parseHex(e.to)], 260);
          break;
        case 'attack':
          // 몸통박치기: 대상 쪽으로 부딪혔다 돌아온다. 맞은 쪽은 아래 damage에서 붉게 번쩍인다
          if (seen(e.from) || seen(e.to)) {
            if (actor !== ME) map.show(hexesOf(e.to));
            await map.bump(e.unit, hexesOf(e.to));
          }
          break;
        case 'tower': if (seen(e.to) && actor !== ME) map.show(hexesOf(e.to)); break;
        case 'damage': { const key = e.unit ?? e.vertex; held.hp.delete(key); strike(key, e.vertex ?? e.tile, `-${e.amount}`); break; }
        case 'damaged': held.whole.delete(e.vertex); strike(e.vertex, e.vertex, '파손', '#ffb35a'); break;
        // 쓰러지는 말은 번쩍임이 보이게 잠깐 둔 뒤 치운다
        case 'die': if (held.units.delete(e.unit)) { await wait(FALL); map.float([parseHex(e.tile)], '쓰러짐', '#c9c9c9'); } break;
        case 'destroyed': if (held.buildings.delete(e.vertex)) { await wait(FALL); map.float(hexesOf(e.vertex), '부서짐', '#ff5a4a'); } break;
        case 'heal': { const u = s.units.get(e.unit); if (u && seen(u.tile)) map.float([parseHex(u.tile)], `+${e.amount}`, '#5bd36a'); break; }
        case 'block': { const at = e.vertex ?? s.units.get(e.unit)?.tile; if (at && seen(at)) map.float(hexesOf(at), e.reason, '#fff6e6'); break; }
        case 'undying': { const u = s.units.get(e.unit); if (u && seen(u.tile)) map.float([parseHex(u.tile)], '불굴!', '#ffd54a'); break; }
        case 'ambush': if (seen(e.tile)) map.float([parseHex(e.tile)], '매복!', '#ff5a4a'); break;
        case 'trap': { const at = e.tile ?? e.vertex; if (at && (seen(at) || e.owner === ME)) map.float(hexesOf(at), g.defs.get(e.id).name, '#ff8a7a'); break; }
        case 'effect': if (seen(e.vertex)) map.float(hexesOf(e.vertex), g.defs.get(e.card).name, '#d2b2ff'); break;
        case 'meteor-fall': for (const tile of e.tiles) if (seen(tile)) map.float([parseHex(tile)], '쾅!', '#ffb35a'); break;
        // 봇의 행동은 글로 알리지 않는다(2026-10-24 사용자 결정). 판 위 연출로만 보인다
        case 'lose-card': if (e.player === ME) say('정보원 둥지에 카드 1장을 잃었어요'); break;
        case 'log': if (actor === ME) say(e.text.replace(/^나이\(가\)/, '내가').replace(/^나의/, '내')); break;
        case 'turn': hud.querySelectorAll('.roll-badge').forEach(badge => badge.remove()); break;
        case 'over': overHow = e.goal !== undefined ? 'goal' : 'castle'; break;
        // 새로 놓인 건물·유닛은 톡 커지며 나타난다
        case 'build': if (seen(e.vertex) || e.player === ME) { if (actor !== ME) map.show(hexesOf(e.vertex)); map.pop(e.vertex); } break;
        case 'summon': if (seen(e.tile)) { if (actor !== ME) map.show(hexesOf(e.tile)); map.pop(e.unit); } break;
      }
      if (['move', 'attack', 'fly', 'teleport', 'damage', 'damaged', 'die', 'destroyed'].includes(e.type)) refresh();
    }
    if (gains.length) await harvest(gains, actor);
    refresh();
  }
  // 맞은 말: 붉게 번쩍이고 숫자·글자가 떠오른다
  function strike(key, at, text, color) {
    if (!seen(at)) return;
    map.hit(key);
    map.float(hexesOf(at), text, color);
  }

  // 내 주사위는 판 위에서 굴린다. 봇 주사위는 화면을 가리지 않게 그 봇의 프로필 옆에 주사위 아이콘과 합을 띄운다(턴 끝까지 남음)
  async function showDice(e, actor) {
    const label = `${actor === ME ? '내' : `${name(actor)}의`} 주사위 ${e.dice[0]} + ${e.dice[1]} = ${e.sum}`;
    map.status.textContent = label;
    if (actor === ME && !auto) return rollDice(root, e.dice, { reducedMotion: useReducedMotion() }).finished;
    const row = hud.querySelector(`.player[data-player="${actor}"]`);
    if (!row) return;
    row.querySelector('.roll-badge')?.remove();
    row.insertAdjacentHTML('beforeend', `<b class="roll-badge${useReducedMotion() ? ' calm' : ''}" aria-hidden="true">${icon('dice')}${e.sum}</b>`);
    await wait(BOT_DICE[pace]);
  }

  // 받은 자원. 내 것은 나온 칸에서 아이콘이 떨어져 +n을 보인 뒤 오른쪽 위 재화 칸으로 쏙 들어가고, 재화 칸이 톡 튀며 숫자가 오른다.
  // 상대 것은 보이는 칸이면 +n만 떠오른다.
  async function harvest(list, actor) {
    const mine = new Map(); // 같은 칸·같은 자원은 아이콘 하나로 합친다
    for (const e of list) {
      if (e.player !== ME) { if (seen(e.from)) map.float(hexesOf(e.from), `+${e.amount}`, GAIN_COLOR[e.resource]); continue; }
      const key = `${e.from}#${e.resource}`;
      if (mine.has(key)) mine.get(key).amount += e.amount; else mine.set(key, { ...e });
    }
    const quick = auto || useReducedMotion() || (actor !== ME && pace === 'fast');
    await Promise.all([...mine.values()].map((e, i) => (quick ? land(e) : fly(e, i * 130))));
  }
  function land({ resource, amount }) {
    lag[resource] -= amount;
    updateHud();
    flashResource(resource);
  }
  async function fly(e, delay) {
    const run = alive;
    const box = root.getBoundingClientRect();
    // 칸이 화면 밖이면 그쪽 가장자리에서, 효과(시장 등)에서 왔으면 화면 가운데에서 떨어진다
    const at = isPlace(e.from) ? map.toScreen(e.from) : { x: box.width / 2, y: box.height / 2 };
    const x = clamp(at.x, 40, box.width - 40), y = clamp(at.y, 110, box.height - 110);
    const target = hud.querySelectorAll('.hud-resources img')[RESOURCES.indexOf(e.resource)].getBoundingClientRect();
    const dx = target.left + target.width / 2 - box.left - x, dy = target.top + target.height / 2 - box.top - y;
    const drop = document.createElement('div');
    drop.className = 'drop';
    drop.style.cssText = `left: ${x}px; top: ${y}px`;
    drop.innerHTML = `${icon(e.resource)}<b style="color: ${GAIN_COLOR[e.resource]}">+${e.amount}</b>`;
    root.append(drop);
    // 위에서 떨어져 한 번 통 튄다
    await drop.animate([
      { transform: 'translateY(-70px) scale(.5)', opacity: 0 },
      { transform: 'translateY(0) scale(1.12)', opacity: 1, offset: 0.5 },
      { transform: 'translateY(-14px) scale(1)', offset: 0.75 },
      { transform: 'none' },
    ], { duration: 560, delay, easing: 'ease-in', fill: 'backwards' }).finished;
    await wait(300);
    drop.lastElementChild.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: 'forwards' });
    await drop.animate([{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(.7)` }], { duration: 480, easing: 'cubic-bezier(.5,0,.8,.5)', fill: 'forwards' }).finished;
    drop.remove();
    if (run === alive) land(e);
  }

  // ── HUD ───────────────────────────────────────────────────
  function updateHud() {
    if (!g) return;
    const p = me();
    hud.querySelectorAll('.hud-resources li').forEach((li, i) => { li.lastElementChild.textContent = p.resources[RESOURCES[i]] - lag[RESOURCES[i]]; });
    for (const q of s.players) {
      const stat = hud.querySelector(`[data-stat="${q.id}"]`);
      if (stat) stat.innerHTML = q.alive ? `${icon('heart')}${q.castleHp}${g.rules.goal ? ` ${icon('home')}${g.goalCount(q.id)}/${g.rules.goal}` : ''}` : '탈락';
      hud.querySelector(`.player[data-player="${q.id}"]`)?.classList.toggle('now', s.current === q.id && s.phase !== 'over');
    }
    handButton.querySelector('.backs').innerHTML = `<img src="${image('cards/back', 'cards')}" alt="">`.repeat(Math.min(3, p.hand.length));
    handButton.querySelector('.hand-count').textContent = p.hand.length;
    // 턴 끝내기·도구는 주사위와 자원 연출이 끝난 뒤에 나온다
    const go = ready();
    mainButton.hidden = !go;
    mainButton.disabled = busy;
    tickClock();
    tools.hidden = !go || Boolean(pick);
    if (!tools.hidden) {
      tools.querySelector('[data-tool="build"]').disabled = busy;
      tools.querySelector('[data-tool="road"]').disabled = busy || !g.has(p.resources, g.rules.cost.road) || !g.roadSpots(ME).length;
      tools.querySelector('[data-tool="trade"]').disabled = busy;
    }
    if (tools.hidden || busy) closePops();
    else if (!buildPanel.hidden) layoutBuild();
    // 띠: 고르는 중이면 고르기 안내, 아니면 누구 턴인지
    const top = s.pending[0];
    let text = '';
    if (s.phase === 'over') text = '';
    else if (top?.type === 'village' && top.player === ME) text = setupText();
    else if (top && top.player !== ME) text = `${name(top.player)}이(가) 고르는 중…`;
    else if (s.current !== ME) text = `${name(s.current)} 턴 진행 중…`;
    banner.querySelector('span').textContent = text;
    banner.hidden = !text || !pickBar.hidden || !unitPanel.hidden || !endAsk.hidden;
    paceButton.hidden = (top ? top.player : s.current) === ME || s.phase === 'over';
    if (!fan.hidden && fanFocus === null) layoutFan(false);
  }
  const setupText = () => (pick?.chosen ? '✓를 눌러 첫 마을을 확정하세요' : '노란 자리에 첫 마을을 놓으세요');

  function flashResource(resource) {
    const li = hud.querySelectorAll('.hud-resources li')[RESOURCES.indexOf(resource)];
    li.classList.remove('gain');
    void li.offsetWidth; // 연달아 받아도 다시 반짝이게
    li.classList.add('gain');
  }

  function say(text) {
    toast.textContent = text;
    toast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('on'), 2600);
  }

  // ── 턴 시간 ───────────────────────────────────────────────
  function startClock(seconds, onEnd) {
    if (clock) return;
    clock = { left: seconds, pause: seconds === TURN_TIME ? TURN_TIME : 0, at: performance.now(), onEnd, id: setInterval(() => tickClock(true), 250), run: alive };
  }
  function stopClock() { if (clock) clearInterval(clock.id); clock = null; mainButton.classList.remove('hurry'); }
  function tickClock(advance = false) {
    if (!clock) return;
    if (advance) {
      const now = performance.now(), dt = (now - clock.at) / 1000;
      clock.at = now;
      // 고르는 중(표시·창·펼친 패)에는 멈춘다. 멈춘 시간은 한 턴에 합쳐 1분까지
      if ((pick || dialog.open || !fan.hidden || !buildPanel.hidden) && clock.pause > 0) clock.pause -= dt; else clock.left -= dt;
      if (clock.left <= 0) { const { onEnd, run } = clock; stopClock(); if (run === alive) onEnd(); return; }
    }
    const left = Math.ceil(clock.left);
    if (s.pending[0]?.type === 'village') banner.querySelector('span').textContent = `${setupText()} · ${left}`;
    else mainButton.querySelector('.clock').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    mainButton.classList.toggle('hurry', left <= 10);
  }

  // ── 고르기 ────────────────────────────────────────────────
  // hint: 고르기 안내(✕로 확정을 물리면 다시 보인다)
  function setPick(next) {
    const hint = {
      setup: '', warp: '공간 뒤틀림: 상대 유닛을 보낼 칸을 고르세요', road: '길을 놓을 곳(노란 선)을 고르세요',
      village: '마을을 지을 자리를 고르세요', gate: '왕성 곁 빈 칸을 고르세요',
      build: next.id && `${g.defs.get(next.id)?.name}: 지을 자리를 고르세요`,
    }[next.kind] ?? next.hint;
    pick = { ...next, hint };
    if (hint) showPick(hint);
  }
  function showPick(text, confirm = false) {
    pickBar.hidden = false;
    unitPanel.hidden = true;
    pickBar.querySelector('p').textContent = text;
    pickBar.querySelector('.confirm').hidden = !confirm;
    pickBar.querySelector('.cancel').hidden = pick?.kind === 'warp';
  }
  function clearPick() {
    pick = null;
    pin.hidden = true;
    pickBar.hidden = true;
    unitPanel.hidden = true;
  }

  function selectUnit(u, announce = true) {
    clearPick();
    pick = { kind: 'unit', unit: u.id };
    const def = g.defs.get(u.card);
    const skills = skillsOf(u.card).map((skill, i) => `<button class="ui-button small skill" data-skill="${i}" ${g.canSkill(u, i) ? '' : 'disabled'}>${skill.name} ${icon('mana')}${skill.mana}</button>`).join('');
    unitPanel.innerHTML = `<p><b>${def.name}</b> ${icon('heart')}${u.hp}/${u.maxHp} ${icon('mana')}${u.mana}/${u.maxMana}<small>${hint(u)}</small></p>
      <div>${skills}${g.canGate(u) ? '<button class="ui-button small gate">순간이동</button>' : ''}<button class="ui-button small blue cancel">닫기</button></div>`;
    unitPanel.hidden = false;
    pickBar.hidden = true;
    if (announce) map.status.textContent = `${def.name} 고름: ${hint(u)}`;
    refresh();
  }
  function hint(u) {
    if (u.fresh) return '소환한 턴에는 쉬어요';
    const parts = [];
    if (g.canMove(u) && g.reach(u).size) parts.push('노란 칸으로 이동');
    if (g.canAttack(u) && g.defs.get(u.card).stats.atk > 0) parts.push(g.attackTargets(u).length ? '빨간 표시 공격(하늘색: 공격 범위)' : '하늘색 칸이 공격 범위');
    if (!parts.length) return u.mana < 1 ? '마나가 없어요' : '이번 턴 행동을 다 했어요';
    return parts.join(' · ');
  }
  unitPanel.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || busy) return;
    if (button.classList.contains('cancel')) { clearPick(); return refresh(); }
    const u = s.units.get(pick.unit);
    if (button.classList.contains('gate')) { setPick({ kind: 'gate', unit: u.id }); return refresh(); }
    const index = Number(button.dataset.skill);
    const skill = skillsOf(u.card)[index];
    const options = g.skillTargets(u, index);
    if (skill.kind === 'self') return act({ type: 'skill', unit: u.id, index, target: {} });
    // 유닛을 노리면 빨강(아군은 초록), 칸을 고르면 노랑
    const look = skill.kind === 'ally' ? 'ally' : ['attack'].includes(skill.kind) || u.card === 'unit-warrior-knight' ? 'attack' : 'place';
    pick = { kind: 'skill', unit: u.id, index, skill, options, look, picked: [] };
    showPick(skill.kind === 'tiles' ? `별똥별 떨어질 칸을 ${skill.count}개까지 고르세요 (0/${skill.count})` : `${skill.name}: 대상을 고르세요`);
    refresh();
  });
  pickBar.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || busy) return;
    if (button.classList.contains('cancel')) {
      const back = pick?.kind === 'skill' || pick?.kind === 'gate' ? s.units.get(pick.unit) : null;
      if (back) return selectUnit(back, false);
      clearPick();
      return refresh();
    }
    if (pick?.kind === 'skill' && pick.picked.length) act({ type: 'skill', unit: pick.unit, index: pick.index, target: { tiles: pick.picked } });
  });

  // ── 도구: 마을·길·교환 ─────────────────────────────────────
  tools.addEventListener('click', event => {
    const button = event.target.closest('[data-tool]');
    if (!button || busy || !ready()) return;
    if (button.dataset.tool === 'trade') { closePops(); return showTrade(); }
    if (button.dataset.tool === 'build') return buildPanel.hidden ? openBuild() : (closePops(), refresh());
    closePops();
    setPick({ kind: button.dataset.tool });
    refresh();
  });

  // ── 건설 탭: 마을과 내 종족 건물. 고르면 놓을 곳을 표시한다(카드 없이 비용만) ──
  const VILLAGE = { name: '마을', max: Infinity, text: ['유닛을 1기 더 둘 수 있다(최대 6기). 붙은 칸의 숫자가 나오면 자원을 얻는다.'] };
  function openBuild() {
    clearPick();
    endAsk.hidden = true;
    buildPanel.hidden = false;
    tools.querySelector('[data-tool="build"]').setAttribute('aria-expanded', 'true');
    layoutBuild(true);
    refresh();
    buildPanel.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
  }
  // 줄마다: 그림, 이름·개수, 비용, 효과. 못 지으면 흐리게 하고 이유를 보인다
  function layoutBuild(force = false) {
    const res = me().resources, spots = g.buildSpots(ME).length;
    const rows = [{ id: 'village', def: { ...VILLAGE, costMap: g.rules.cost.village }, count: null }, ...g.buildable(ME).map(({ def, count }) => ({ id: def.id, def, count }))];
    const why = ({ def, count }) => (count >= def.max ? `${def.max}개까지 지어요` : !g.has(res, def.costMap) ? '자원이 모자라요' : !spots ? '지을 자리가 없어요(길이 닿은 빈 자리)' : '');
    const key = rows.map(row => `${row.count}${why(row)}${buildArt[row.id] ? 1 : 0}`).join('|');
    if (!force && key === buildPanel.dataset.key) return;
    buildPanel.dataset.key = key;
    buildPanel.innerHTML = rows.map(row => {
      const { id, def, count } = row, no = why(row);
      return `<button class="build-item" data-build="${id}" ${no ? 'disabled' : ''}>
        <span class="build-art">${buildArt[id] ? `<img src="${buildArt[id]}" alt="">` : ''}</span>
        <span class="build-head"><b>${def.name}</b>${count === null ? '' : `<small>${count}/${def.max}</small>`}<span class="build-cost">${costHTML(def.costMap)}</span></span>
        <span class="build-text">${def.type && def.kind !== '건물' ? `<i>${kindText(def).replace('건물 · ', '')}</i> ` : ''}${def.text.join(' ')}${no ? `<em>${no}</em>` : ''}</span>
      </button>`;
    }).join('');
  }
  buildPanel.addEventListener('click', event => {
    const button = event.target.closest('[data-build]');
    if (!button || button.disabled || busy || !ready()) return;
    closePops();
    const id = button.dataset.build;
    setPick(id === 'village' ? { kind: 'village' } : { kind: 'build', id });
    refresh();
  });
  // 건설 탭 그림: 판 위 말과 같은 그림을 내 색으로 칠해 작게 줄여 둔다(판마다 한 번)
  async function prepareBuildArt(race) {
    const color = hud.querySelector('.player[data-player="0"]')?.style.getPropertyValue('--player') || '#e0453a';
    const ids = ['village', ...cards.filter(c => c.type === 'building' && c.look === race).map(c => c.id)];
    const out = {};
    await Promise.all(ids.map(async id => {
      const big = await tinted(image(`pieces/${id}`, 'pieces'), image(`pieces/${id}-team`, 'pieces'), color);
      const small = document.createElement('canvas');
      small.width = 96;
      small.height = Math.round(96 * big.height / big.width);
      small.getContext('2d').drawImage(big, 0, 0, small.width, small.height);
      out[id] = small.toDataURL();
    })).catch(() => {}); // 그림을 못 받으면 글자만 보인다
    return out;
  }

  // 열린 물음(턴 종료)·건설 탭을 닫는다
  function closePops() {
    endAsk.hidden = true;
    if (buildPanel.hidden) return;
    buildPanel.hidden = true;
    tools.querySelector('[data-tool="build"]').setAttribute('aria-expanded', 'false');
  }

  // 턴 끝내기: 한 번 묻는다(확인·취소). 묻는 동안에도 턴 시간은 흐른다
  mainButton.addEventListener('click', () => {
    if (!g || busy || !ready()) return;
    if (!endAsk.hidden) { closePops(); return refresh(); }
    clearPick();
    closePops();
    endAsk.hidden = false;
    refresh();
    endAsk.querySelector('.ok').focus({ preventScroll: true });
  });
  endAsk.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || busy) return;
    closePops();
    if (button.classList.contains('ok') && ready()) return act({ type: 'end' });
    refresh();
    mainButton.focus({ preventScroll: true });
  });
  paceButton.addEventListener('click', () => {
    pace = pace === 'fast' ? 'normal' : 'fast';
    paceButton.setAttribute('aria-pressed', pace === 'fast');
    paceButton.textContent = pace === 'fast' ? '보통 속도' : '빠르게';
  });

  // ── 창: 교환·고르기·끝 ─────────────────────────────────────
  function openDialog(html, className) {
    for (const key of Object.keys(dialog.dataset)) if (key !== 'locked') delete dialog.dataset[key];
    dialog.className = `game-dialog hud-panel ${className}`;
    dialog.innerHTML = html;
    if (!dialog.open) dialog.showModal();
  }
  function closeDialog() { if (dialog.open) dialog.close(); }
  dialog.addEventListener('cancel', event => { if (dialog.dataset.locked) event.preventDefault(); });

  // 카드를 쓸 수 있는지와 고를 곳
  function cardUse(uid) {
    const def = g.card(uid);
    if (!myMain()) return { why: s.current === ME && s.phase === 'roll' ? '주사위를 먼저 굴려요' : '내 턴에 쓸 수 있어요' };
    if (!ready()) return { why: '자원을 다 받은 뒤에 쓸 수 있어요' };
    const res = me().resources;
    if (def.type === 'unit') {
      if (!g.has(res, def.costMap)) return { why: '자원이 모자라요' };
      if (g.unitsOf(ME).length >= g.unitCap(ME)) return { why: `유닛은 ${g.unitCap(ME)}기까지예요(마을을 지으면 늘어요)` };
      const options = g.summonTiles(ME).map(tile => ({ tile }));
      return options.length ? { options, look: 'place', text: `${def.name}: 소환할 칸을 고르세요` } : { why: '소환할 빈 칸이 없어요' };
    }
    const options = def.type === 'trap' ? g.trapTargets(ME, def.id) : g.magicTargets(ME, def.id);
    if (!options.length) return { why: '쓸 대상이 없어요' };
    if (options.length === 1 && !Object.keys(options[0]).length) return { now: {} };
    if (options[0].resource) return { ask: options };
    // 내 건물·유닛을 고르는 카드는 고를 수 있는 것을 깜빡여 보인다(2026-10-24 사용자 결정)
    if (options[0].vertex) return { options, look: 'target', text: `${def.name}: 깜빡이는 건물을 고르세요` };
    if (options[0].unit !== undefined) return { options, look: 'ally', text: `${def.name}: 깜빡이는 아군을 고르세요` };
    return { options, look: 'place', text: `${def.name}: ${def.type === 'trap' ? '놓을 곳' : '대상'}을 고르세요` };
  }

  // 카드 고르기 창(시장·점성대에서 한 장 가져가기): 위는 작은 카드 줄, 아래는 고른 카드를 크게 보인다.
  let picker = null;
  function showCards(next) {
    picker = next;
    const { uids, focus, title } = picker;
    openDialog(`<h2>${title}</h2>
      <div class="hand-row">${uids.map(uid => `<button class="hand-card${uid === focus ? ' on' : ''}" data-uid="${uid}" aria-pressed="${uid === focus}" aria-label="${g.card(uid).name}">${cardHTML(g.card(uid))}</button>`).join('')}</div>
      <div class="hand-focus">${cardHTML(g.card(focus), { big: true })}</div>
      <div class="dialog-buttons"><button class="ui-button take">이 카드 가져가기</button></div>`, 'hand-dialog');
    dialog.querySelector('.hand-card.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  // ── 패: 누르면 카드 묶음에서 왼쪽으로 촤르륵 펼친다. 쓸 수 있는 카드는 빛나는 테두리 ──
  // 카드를 누르면 가운데로 크게(사용·뒤로가기), 위(판 쪽)로 쏘듯이 끌면 바로 사용 모드로 들어간다.
  function openFan() {
    if (!me().hand.length) return say('카드가 없어요');
    fan.hidden = false;
    focusView.hidden = true;
    fanFocus = null;
    lockHud();
    layoutFan(true);
    fanCards.firstElementChild?.focus({ preventScroll: true });
  }
  function closeFan() {
    if (fan.hidden) return;
    fan.hidden = true;
    fanFocus = drag = null;
    lockHud();
  }
  // 패가 넘치면 펼친 패에서 버린다(2026-10-24 사용자 결정: 따로 창을 띄우지 않음). 다 고를 때까지 접히지 않는다
  function openDiscard(count) {
    if (discard?.count !== count) discard = { count, chosen: [] };
    if (fan.hidden) openFan(); else layoutFan(true);
  }
  // 버릴 카드로 고르거나 되돌린다. 다 고르면 바로 버린다
  function toggleDiscard(uid) {
    const { chosen, count } = discard;
    discard.chosen = chosen.includes(uid) ? chosen.filter(x => x !== uid) : [...chosen, uid];
    if (discard.chosen.length < count) return layoutFan(false);
    const uids = discard.chosen;
    discard = null;
    closeFan();
    act({ type: 'resolve', uids });
  }
  // 패나 쓸 수 있는 카드가 바뀌었을 때만 다시 그린다(force: 처음 펼칠 때)
  function layoutFan(force) {
    const hand = me().hand;
    const usable = hand.map(uid => !discard && !cardUse(uid).why);
    const marked = hand.map(uid => Boolean(discard?.chosen.includes(uid)));
    const key = `${hand}|${usable}|${marked}`;
    if (!force && key === fanKey) return;
    fanKey = key;
    if (!hand.length) return closeFan();
    fan.classList.toggle('discarding', Boolean(discard));
    fanNote.hidden = !discard;
    if (discard) fanNote.textContent = `카드는 ${g.rules.hand.max}장까지예요. ${discard.count}장을 버려요${discard.count > 1 ? ` (${discard.chosen.length}/${discard.count})` : ''} · 위로 끌거나 눌러서 버리기`;
    const n = hand.length, width = root.clientWidth;
    const w = clamp(width * 0.25, 84, 130); // 카드 폭: 휴대폰 약 98px, iPad 130px
    const step = n > 1 ? Math.min(w * 0.95, (width - 32 - w) / (n - 1)) : 0;
    const edge = ((n - 1) / 2) ** 2;
    fanCards.style.setProperty('--card-width', `${w}px`);
    fanCards.innerHTML = hand.map((uid, i) => {
      const def = g.card(uid), j = i - (n - 1) / 2;
      const place = `translate(${(i - n + 1) * step}px, ${(j * j - edge) * 3}px) rotate(${j * 2.5}deg)`; // 오른쪽 아래 묶음 자리에서 왼쪽으로, 가운데가 살짝 높은 부채꼴
      return `<button class="fan-card${usable[i] ? ' usable' : ''}${marked[i] ? ' marked' : ''}" data-uid="${uid}" data-place="${place}" style="transform: ${place}" aria-label="${def.name}${usable[i] ? ', 쓸 수 있음' : marked[i] ? ', 버릴 카드' : ''}">${cardHTML(def)}</button>`;
    }).join('');
    if (!force || useReducedMotion()) return;
    // 묶음에 가까운 카드부터 차례로 미끄러져 나온다
    [...fanCards.children].reverse().forEach((card, k) => card.animate(
      [{ transform: 'translate(0, 8px) rotate(6deg) scale(.85)', opacity: 0.4 }, { transform: card.dataset.place, opacity: 1 }],
      { duration: 300, delay: k * 45, easing: 'cubic-bezier(.2,.9,.3,1.15)', fill: 'backwards' },
    ));
  }
  handButton.addEventListener('click', () => { if (g) openFan(); });
  // 바깥(어두운 곳)을 누르면 접는다(버리는 중에는 그대로)
  fan.addEventListener('click', event => { if (!discard && (event.target === fan || event.target === fanCards)) closeFan(); });
  fan.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    if (fanFocus !== null) return unfocusCard();
    if (discard) return;
    closeFan();
    handButton.focus({ preventScroll: true });
  });

  // 누름: 크게 보기. 끌기: 카드가 손가락을 따라오고, 위로 충분히(또는 빠르게) 쏘면 바로 쓴다
  fanCards.addEventListener('pointerdown', event => {
    const card = event.target.closest('.fan-card');
    if (!card || drag || fanFocus !== null) return;
    card.setPointerCapture(event.pointerId);
    drag = { card, id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, vy: 0, last: { y: event.clientY, t: event.timeStamp } };
  });
  fanCards.addEventListener('pointermove', event => {
    if (event.pointerId !== drag?.id) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 10) return;
    drag.moved = true;
    const dt = event.timeStamp - drag.last.t;
    if (dt > 0) drag.vy = (event.clientY - drag.last.y) / dt;
    drag.last = { y: event.clientY, t: event.timeStamp };
    drag.card.classList.add('dragging');
    drag.card.style.transform = `translate(${dx}px, ${dy}px) ${drag.card.dataset.place} scale(1.1)`;
  });
  function dropCard(event) {
    if (event.pointerId !== drag?.id) return;
    const { card, moved, y, vy } = drag;
    drag = null;
    card.classList.remove('dragging');
    const uid = Number(card.dataset.uid);
    if (!moved) { if (event.type === 'pointerup') focusCard(uid); return; }
    const up = y - event.clientY;
    if (event.type === 'pointerup' && (up > 110 || (up > 40 && vy < -0.5))) {
      card.style.transform = card.dataset.place;
      if (discard) return toggleDiscard(uid);
      const use = cardUse(uid);
      if (!use.why) { closeFan(); return useCard(uid); }
      say(use.why);
    }
    card.style.transform = card.dataset.place; // 제자리로 돌아간다
  }
  fanCards.addEventListener('pointerup', dropCard);
  fanCards.addEventListener('pointercancel', dropCard);
  // 키보드(Enter·Space)로 누른 카드도 크게 본다. 손가락·마우스 누름은 pointerup이 맡는다(detail 0이 키보드)
  fanCards.addEventListener('click', event => {
    const card = event.target.closest('.fan-card');
    if (card && event.detail === 0) focusCard(Number(card.dataset.uid));
  });

  // 크게 보기: 작은 카드 자리에서 가운데로 커지며 옮겨 온다. 아래에 사용·뒤로가기
  function focusCard(uid) {
    const small = fanCards.querySelector(`[data-uid="${uid}"]`);
    if (!small) return;
    fanFocus = uid;
    const use = discard ? {} : cardUse(uid);
    focusView.querySelector('.focus-card').innerHTML = cardHTML(g.card(uid), { big: true });
    focusView.querySelector('.focus-note').textContent = use.why ?? '';
    const useButton = focusView.querySelector('.use');
    useButton.textContent = !discard ? '사용' : discard.chosen.includes(uid) ? '되돌리기' : '버리기';
    useButton.disabled = Boolean(use.why);
    focusView.hidden = false;
    small.style.visibility = 'hidden';
    flip(small, focusView.querySelector('.card'));
    (use.why ? focusView.querySelector('.back') : useButton).focus({ preventScroll: true });
  }
  async function unfocusCard() {
    const small = fanCards.querySelector(`[data-uid="${fanFocus}"]`);
    fanFocus = null;
    if (small) await flip(small, focusView.querySelector('.card'), true);
    focusView.hidden = true;
    if (small) { small.style.visibility = ''; small.focus({ preventScroll: true }); }
    if (!fan.hidden) layoutFan(false);
  }
  // 작은 카드와 큰 카드 사이를 옮겨 가는 연출: 큰 카드를 작은 카드 자리·크기에서 제자리로(back이면 반대로)
  function flip(small, big, back = false) {
    if (useReducedMotion()) return Promise.resolve();
    const a = small.getBoundingClientRect(), b = big.getBoundingClientRect();
    const frames = [{ transform: `translate(${a.left + a.width / 2 - b.left - b.width / 2}px, ${a.top + a.height / 2 - b.top - b.height / 2}px) scale(${a.width / b.width})` }, { transform: 'none' }];
    return big.animate(back ? frames.reverse() : frames, { duration: 260, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' }).finished;
  }
  focusView.addEventListener('click', event => {
    if (fanFocus === null) return;
    const button = event.target.closest('button');
    if (button?.classList.contains('use') && discard) {
      const uid = fanFocus;
      fanFocus = null;
      focusView.hidden = true;
      return toggleDiscard(uid);
    }
    if (button?.classList.contains('use')) { const uid = fanFocus; closeFan(); return useCard(uid); }
    if (event.target === focusView || button?.classList.contains('back')) unfocusCard();
  });

  function useCard(uid) {
    const use = cardUse(uid);
    if (use.why) return say(use.why);
    if (use.now) return act({ type: 'play', uid, target: use.now });
    if (use.ask) {
      // 풍년(자원), 소매치기(상대와 자원)
      openDialog(`<h2>${g.card(uid).name}</h2><div class="choice-list">${use.ask.map((o, i) => `<button class="ui-button choice" data-i="${i}">${o.player !== undefined ? `${name(o.player)}의 ` : ''}${icon(o.resource)}${RESOURCE_NAMES[o.resource]}${o.player !== undefined ? ` (${s.players[o.player].resources[o.resource]})` : ''}</button>`).join('')}</div>
        <div class="dialog-buttons"><button class="ui-button blue close">닫기</button></div>`, 'choice-dialog');
      Object.assign(dialog.dataset, { ask: JSON.stringify(use.ask), uid });
      return;
    }
    setPick({ kind: 'card', uid, options: use.options, look: use.look, hint: use.text });
    refresh();
  }

  function showTrade(give = null, get = null) {
    const res = me().resources;
    const rate = give && get ? g.tradeRate(ME, give, get) : null;
    const row = (role, chosen) => RESOURCES.map(r => `<button class="trade-pick${r === chosen ? ' on' : ''}" data-${role}="${r}" aria-pressed="${r === chosen}" ${role === 'get' && r === give ? 'disabled' : ''}>${icon(r)}<span>${RESOURCE_NAMES[r]}</span>${role === 'give' ? `<small>${res[r]}개 · ${Math.min(...RESOURCES.filter(x => x !== r).map(x => g.tradeRate(ME, r, x)))}:1</small>` : ''}</button>`).join('');
    openDialog(`<h2>교환</h2><p class="trade-note">교환소에 마을이 있으면 그 두 자원끼리 2:1, 아니면 4:1이에요</p>
      <h3>줄 자원</h3><div class="trade-row">${row('give', give)}</div>
      <h3>받을 자원</h3><div class="trade-row">${row('get', get)}</div>
      <p class="trade-rate">${rate ? `${RESOURCE_NAMES[give]} ${rate}개 → ${RESOURCE_NAMES[get]} 1개` : '줄 것과 받을 것을 고르세요'}</p>
      <div class="dialog-buttons"><button class="ui-button do-trade" ${rate && res[give] >= rate ? '' : 'disabled'}>바꾸기</button><button class="ui-button blue close">닫기</button></div>`, 'trade-dialog');
    Object.assign(dialog.dataset, { give: give ?? '', get: get ?? '' });
  }

  // 대기 중인 고르기(창). 닫을 수 없다(고를 때까지)
  function showChoice(top) {
    dialog.dataset.locked = '1';
    if (top.type === 'market' || (top.type === 'stargaze' && top.deck)) {
      showCards({ uids: top.cards, focus: top.cards[0], title: top.type === 'market' ? '시장: 한 장을 가져가세요' : '점성대: 손에 넣을 카드를 고르세요' });
    } else if (top.type === 'stargaze') {
      openDialog(`<h2>점성대</h2><p>어느 덱의 위 2장을 볼까요?</p><div class="choice-list"><button class="ui-button choice" data-deck="race">종족 덱</button><button class="ui-button choice" data-deck="field">필드 덱</button></div>`, 'choice-dialog');
    } else if (top.type === 'fate') {
      openDialog(`<h2>운명 다시 쓰기</h2><p>이번 턴 주사위를 고르세요</p><div class="choice-list">${top.options.map((d, i) => `<button class="ui-button choice" data-index="${i}">${icon('dice')}${d[0]} + ${d[1]} = ${d[0] + d[1]}</button>`).join('')}</div>`, 'choice-dialog');
    }
  }

  dialog.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || busy) return;
    const top = s.pending[0];
    if (button.classList.contains('close')) return closeDialog();
    if (button.classList.contains('hand-card')) return showCards({ ...picker, focus: Number(button.dataset.uid) });
    if (button.classList.contains('take')) return resolveChoice({ uid: picker.focus });
    if (button.dataset.deck) return resolveChoice({ deck: button.dataset.deck });
    if (button.dataset.index !== undefined && top?.type === 'fate') return resolveChoice({ index: Number(button.dataset.index) });
    if (button.dataset.give || button.dataset.get) return showTrade(button.dataset.give ?? (dialog.dataset.give || null), button.dataset.get ?? (dialog.dataset.get || null));
    if (button.classList.contains('do-trade')) {
      const { give, get } = dialog.dataset;
      return act({ type: 'trade', give, get }).then(ok => ok && dialog.open && showTrade(give, get));
    }
    if (button.dataset.i !== undefined) {
      const option = JSON.parse(dialog.dataset.ask)[Number(button.dataset.i)];
      closeDialog();
      return act({ type: 'play', uid: Number(dialog.dataset.uid), target: option });
    }
    if (button.classList.contains('again')) return start({ mode, race, auto });
    if (button.classList.contains('leave')) { closeDialog(); root.querySelector('.mode-change').click(); }
  });

  async function resolveChoice(choice) {
    delete dialog.dataset.locked;
    closeDialog();
    await act({ type: 'resolve', ...choice });
  }

  function gameOver() {
    stopClock();
    clearPick();
    discard = null;
    closeFan();
    closePops();
    hideIntro();
    const winner = s.winner === team();
    const goal = overHow === 'goal';
    dialog.dataset.locked = '1';
    openDialog(`<h2 class="${winner ? 'win' : 'lose'}">${winner ? '승리!' : '패배'}</h2>
      <p>${goal ? `건물 ${g.rules.goal}개를 먼저 세웠어요` : '왕성을 무너뜨렸어요'} · ${s.round}라운드</p>
      <div class="dialog-buttons"><button class="ui-button again">다시 하기</button><button class="ui-button blue leave">나가기</button></div>`, 'over-dialog');
    map.status.textContent = winner ? '승리했어요' : '졌어요';
  }

  function stop() {
    alive++;
    stopClock();
    clearPick();
    discard = null;
    closeFan();
    closePops();
    hideIntro();
    delete dialog.dataset.locked;
    closeDialog();
    busy = false;
    root.querySelectorAll('.dice-layer, .drop').forEach(element => element.remove());
    root.dataset.game = 'off';
  }

  // 새 판: 나는 고른 종족, 봇은 무작위 종족(같은 종족도 나올 수 있음)
  function start({ mode: nextMode, race: nextRace, seed = (Date.now() ^ Math.floor(Math.random() * 2 ** 31)) >>> 0, auto: watch = false }) {
    stop();
    auto = watch;
    pace = auto ? 'auto' : 'normal';
    mode = nextMode;
    race = nextRace;
    const board = createBoard({ mode, seed });
    const rng = createRng(seed ^ 0x2545f491);
    const races = [race, ...Array.from({ length: MODES[mode].players - 1 }, () => RACES[Math.floor(rng() * 3)])];
    g = createGame({ board, races, cards });
    s = g.state;
    roster = races.map((r, i) => ({ name: i ? `봇 ${i}` : '나', classId: r }));
    memo = new Set(); memoTurn = -1;
    lag = Object.fromEntries(RESOURCES.map(r => [r, 0]));
    for (const list of Object.values(held)) list.clear();
    map.open(mode, { board, players: roster, scene: scene() });
    root.dataset.game = 'on';
    buildArt = {};
    const run = alive;
    prepareBuildArt(race).then(art => { if (run === alive) { buildArt = art; if (!buildPanel.hidden) layoutBuild(); } });
    map.focus(g.geo.vertices.get(s.players[ME].castle).hexes);
    say(`${RACE_NAMES[race]}로 시작해요. 내 왕성 가까이 첫 마을을 놓으세요`);
    next();
  }
  // 시험용: 지금 판의 엔진과 고르기 상태(Playwright가 읽는다)
  root.game = () => ({ g, pick, marks, busy, ready: Boolean(g) && ready() });
  return start;
}
