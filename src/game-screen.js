// 한 판 진행: 나(0번)와 봇. 규칙은 엔진(src/game/rules.js), 판 그리기는 지도 화면(map-screen.js)이 맡는다.
// 여기서는 누름을 명령으로 바꾸고, 명령의 결과(이벤트)를 차례로 보여 준다. 봇은 한 동작씩 보여 준다.
import './game.css';
import { createBoard, createRng, MODES } from './board.js';
import { createGame, RESOURCES, RESOURCE_NAMES, skillsOf } from './game/rules.js';
import { botStep } from './game/bot.js';
import { parseHex } from './game/geometry.js';
import { VISIBLE } from './vision.js';
import cards from './generated/cards.json';
import { cardHTML, image } from './card-view.js';
import { rollDice } from './dice.js';
import { useReducedMotion } from './motion.js';

const ME = 0;
const RACES = ['warrior', 'mage', 'assassin'];
const RACE_NAMES = { warrior: '냥전사', mage: '냥법사', assassin: '냥살자' };
const TURN_TIME = 60; // 합의: 주사위 뒤 1분. 고르는 중에는 멈추되, 멈춘 시간은 한 턴에 합쳐 1분까지
const SETUP_TIME = 15; // 임시: 첫 마을 자리 고르기
const PACE = { normal: 450, fast: 120, auto: 60 }; // 봇 동작 사이(ms). auto: 내 자리도 봇이 두는 자동 대전
const STEP = 170; // 유닛이 한 칸 가는 시간(ms)
const GAIN_COLOR = { gold: '#ffd54a', crystal: '#d2b2ff', wood: '#9be07a', fish: '#8fd8ff' };
const icon = name => `<img src="${image(`ui/icon-${name}`, 'ui')}" alt="">`;
const costHTML = cost => Object.entries(cost).map(([r, n]) => `<span class="cost">${icon(r)}${n}</span>`).join('');
const wait = ms => new Promise(done => setTimeout(done, ms));
const hexesOf = key => key.split(key.includes('|') ? '|' : '~').map(parseHex);

export function gameScreen(map, root) {
  const hud = root.querySelector('.hud');
  const mainButton = hud.querySelector('.dice-roll');
  hud.insertAdjacentHTML('beforeend', `
    <div class="strip">
      <p class="turn-banner"><span></span><button class="ui-button small blue pace" hidden aria-pressed="false">빠르게</button></p>
      <div class="pick-bar hud-panel" hidden><p></p><button class="ui-button small confirm" hidden>확인</button><button class="ui-button small blue cancel">취소</button></div>
      <div class="unit-panel hud-panel" hidden></div>
    </div>
    <p class="toast" aria-hidden="true"></p>
    <div class="tools" hidden>
      <button class="tool" data-tool="village">${icon('home')}<span>마을</span><small>${costHTML({ gold: 1, wood: 1, fish: 1 })}</small></button>
      <button class="tool" data-tool="road"><i class="road-icon"></i><span>길</span><small>${costHTML({ wood: 1, fish: 1 })}</small></button>
      <button class="tool" data-tool="trade">${icon('trade')}<span>교환</span></button>
    </div>
    <button class="game-hand" aria-label="내 카드 보기"><span class="backs"></span><b class="hand-count">0</b></button>`);
  root.insertAdjacentHTML('beforeend', '<dialog class="game-dialog"></dialog>');
  const strip = hud.querySelector('.strip');
  const banner = strip.querySelector('.turn-banner');
  const paceButton = banner.querySelector('.pace');
  const pickBar = strip.querySelector('.pick-bar');
  const unitPanel = strip.querySelector('.unit-panel');
  const toast = hud.querySelector('.toast');
  const tools = hud.querySelector('.tools');
  const handButton = hud.querySelector('.game-hand');
  const dialog = root.querySelector('.game-dialog');

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

  const team = () => g.teamOf(ME);
  const myMain = () => s.phase === 'main' && s.current === ME && !s.pending.length;
  const me = () => s.players[ME];
  const name = player => roster[player].name;
  const canAct = u => g.canMove(u) || (g.canAttack(u) && g.attackTargets(u).length > 0) || skillsOf(u.card).some((_, i) => g.canSkill(u, i)) || g.canGate(u);

  // ── 지도에 넘길 장면 ───────────────────────────────────────
  function scene() {
    const t = team();
    const sight = g.sight(t);
    const pieces = [];
    for (const b of s.buildings.values()) {
      if (b.kind === 'castle' || !g.buildingVisible(t, b)) continue;
      pieces.push({ kind: 'building', id: b.kind === 'village' ? 'village' : b.card, player: b.owner, hexes: g.geo.vertices.get(b.vertex).hexes, damaged: b.damaged, hp: b.hp ?? undefined });
    }
    for (const u of s.units.values()) {
      if (!g.unitVisible(t, u)) continue;
      pieces.push({ kind: 'unit', id: u.card, player: u.owner, hexes: [parseHex(u.tile)], hp: u.hp, maxHp: u.maxHp, mana: u.mana, maxMana: u.maxMana, unitId: u.id,
        done: u.owner === ME && myMain() && !canAct(u), chosen: pick?.unit === u.id });
    }
    const roads = [];
    for (const [edge, player] of s.roads) if (g.teamOf(player) === t || g.geo.edges.get(edge).hexes.some(h => sight.state.get(h) === VISIBLE)) roads.push({ player, edge });
    marks = markPick();
    return {
      sight, pieces, roads, marks,
      castleHp: s.players.map(p => (p.alive ? p.castleHp : 0)),
      traps: [...s.traps].filter(([, trap]) => trap.owner === ME).map(([tile]) => tile),
      tap, leave: stop,
    };
  }
  const refresh = () => { map.setScene(scene()); updateHud(); };

  // ── 고를 수 있는 곳 ────────────────────────────────────────
  function markPick() {
    if (!pick) return null;
    const tiles = new Map(), vertices = new Map(), edges = new Map();
    const u = pick.unit !== undefined ? s.units.get(pick.unit) : null;
    switch (pick.kind) {
      case 'setup': for (const spot of g.villageSpots(ME)) vertices.set(spot.vertex, 'place'); break;
      case 'warp': for (const tile of pick.tiles) if (!g.unitAt(tile)) tiles.set(tile, 'place'); break;
      case 'road': for (const edge of g.roadSpots(ME)) edges.set(edge, 'place'); break;
      case 'village': for (const vertex of g.buildSpots(ME)) vertices.set(vertex, 'place'); break;
      case 'gate': for (const tile of g.gateTiles(ME)) tiles.set(tile, 'place'); break;
      case 'unit':
        if (!u) break;
        if (g.canMove(u)) for (const tile of g.reach(u).keys()) tiles.set(tile, 'move');
        if (g.canAttack(u)) for (const t of g.attackTargets(u)) (t.vertex ? vertices : tiles).set(t.vertex ?? t.tile, 'attack');
        break;
      case 'skill': case 'card':
        for (const o of pick.options) {
          const kind = pick.picked?.includes(o.tile) ? 'attack' : pick.look;
          if (o.vertex) vertices.set(o.vertex, kind); else if (o.tile) tiles.set(o.tile, kind);
        }
        break;
    }
    return { tiles, vertices, edges };
  }

  // 지도를 누르면: 표시한 꼭짓점·변·칸이면 고르고, 내 유닛이면 그 유닛을 고른다. 처리했으면 true(지도는 칸을 고르지 않음)
  function tap(hit) {
    if (busy || s.phase === 'over') return true;
    if (marks) {
      if (marks.vertices.size && hit.vertexDist < hit.near && marks.vertices.has(hit.vertex)) return choose({ vertex: hit.vertex }), true;
      if (marks.edges.size && hit.edgeDist < hit.near && marks.edges.has(hit.edge)) return choose({ edge: hit.edge }), true;
      // 동전(유닛)을 노리는 표시는 동전 자리 칸을 먼저 본다
      const order = ['attack', 'ally'].includes(marks.tiles.get(hit.coinTile)) ? [hit.coinTile, hit.tile] : [hit.tile, hit.coinTile];
      for (const tile of order) if (tile && marks.tiles.has(tile)) return choose({ tile }), true;
    }
    const tile = hit.coinTile ?? hit.tile;
    const u = tile ? g.unitAt(tile) : null;
    if (u && u.owner === ME && myMain()) { selectUnit(u); return true; }
    if (u && g.unitVisible(team(), u)) {
      const def = g.defs.get(u.card);
      map.status.textContent = `${name(u.owner)}의 ${def.name}: 체력 ${u.hp}/${u.maxHp}, 마나 ${u.mana}/${u.maxMana}`;
      say(map.status.textContent);
      return true;
    }
    if (pick && ['unit', 'skill', 'gate'].includes(pick.kind)) { clearPick(); refresh(); }
    return false;
  }

  function choose({ tile, vertex, edge }) {
    const p = pick;
    switch (p.kind) {
      case 'setup': return act({ type: 'placeVillage', vertex });
      case 'warp': return act({ type: 'resolve', tile });
      case 'road': return act({ type: 'road', edge }, { keep: true });
      case 'village': return act({ type: 'village', vertex });
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
      case 'card': {
        const o = p.options.find(x => (vertex ? x.vertex === vertex : x.tile === tile));
        const def = g.card(p.uid);
        if (def.type === 'unit') return act({ type: 'play', uid: p.uid, tile });
        if (def.type === 'building') return act({ type: 'play', uid: p.uid, vertex });
        return act({ type: 'play', uid: p.uid, target: o.unit !== undefined ? { unit: o.unit } : vertex ? { vertex } : { tile } });
      }
    }
  }

  // ── 명령 ──────────────────────────────────────────────────
  // 내 명령을 엔진에 넣고 결과를 보여 준 뒤 다음으로. keep: 고르기를 이어 감(길 여러 개), reselect: 그 유닛을 다시 고름(이동 뒤 공격)
  async function act(cmd, { keep = false, reselect = null } = {}) {
    if (busy) return false;
    const result = g.apply({ ...cmd, player: ME });
    if (!result.ok) { say(result.error); return false; }
    const run = alive;
    busy = true;
    if (!keep) clearPick();
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
      if (!result.ok) continue; // memo가 같은 시도를 막는다
      await present(result.events, actor);
      if (run !== alive) return;
      if (!['resolve', 'placeVillage'].includes(cmd.type)) await wait(PACE[pace]);
    }
    if (run === alive && s.phase === 'over') { busy = false; refresh(); gameOver(); }
  }

  // 내 차례: 대기 중인 고르기(창), 주사위, 또는 턴 행동
  function ask() {
    busy = false;
    const top = s.pending[0];
    if (top?.type === 'village') { setPick({ kind: 'setup' }); startClock(SETUP_TIME, () => autoPick()); }
    else if (top?.type === 'warp') setPick({ kind: 'warp', tiles: top.tiles });
    else if (top) showChoice(top);
    else if (s.phase === 'main') startClock(TURN_TIME, () => timeUp());
    refresh();
  }

  // 시간이 다 되면 봇과 같은 방법으로 대신 고른다
  async function autoPick() {
    closeDialog();
    clearPick();
    const cmd = botStep(g, ME, new Set());
    if (cmd) await act(cmd);
  }
  async function timeUp() {
    closeDialog();
    clearPick();
    say('시간이 다 되어 턴을 넘겨요');
    await act({ type: 'end' });
  }

  // ── 결과 보여 주기 ─────────────────────────────────────────
  async function present(events, actor) {
    const t = team();
    const seen = key => key && (key.includes('|') ? g.geo.vertices.get(key)?.land.some(k => g.sees(t, k)) : g.sees(t, key));
    const unitTile = new Map(); // 쓰러진 유닛의 마지막 칸
    refresh();
    for (const e of events) {
      switch (e.type) {
        case 'turn':
          break;
        case 'order': say(`순서: ${e.order.map(name).join(' → ')}`); break;
        case 'roll': await showDice(e, actor); break;
        case 'gain':
          if (/^-?\d+,-?\d+$/.test(e.from) && seen(e.from)) map.float(hexesOf(e.from), `+${e.amount}`, GAIN_COLOR[e.resource]);
          if (e.player === ME) flashResource(e.resource);
          break;
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
        case 'attack': {
          const to = e.to;
          if (seen(e.from) || seen(to)) {
            if (actor !== ME) map.show(hexesOf(to));
            await map.bump(e.unit, hexesOf(to));
          }
          break;
        }
        case 'damage':
          if (e.vertex ? seen(e.vertex) : seen(e.tile)) map.float(hexesOf(e.vertex ?? e.tile), `-${e.amount}`);
          if (e.tile) unitTile.set(e.unit, e.tile);
          break;
        case 'heal': { const u = s.units.get(e.unit); if (u && seen(u.tile)) map.float([parseHex(u.tile)], `+${e.amount}`, '#5bd36a'); break; }
        case 'block': { const at = e.vertex ?? s.units.get(e.unit)?.tile; if (at && seen(at)) map.float(hexesOf(at), e.reason, '#fff6e6'); break; }
        case 'undying': { const u = s.units.get(e.unit); if (u && seen(u.tile)) map.float([parseHex(u.tile)], '불굴!', '#ffd54a'); break; }
        case 'die': if (seen(e.tile)) map.float([parseHex(e.tile)], '쓰러짐', '#c9c9c9'); break;
        case 'damaged': if (seen(e.vertex)) map.float(hexesOf(e.vertex), '파손', '#ffb35a'); break;
        case 'destroyed': if (seen(e.vertex)) map.float(hexesOf(e.vertex), '부서짐', '#ff5a4a'); break;
        case 'ambush': if (seen(e.tile)) map.float([parseHex(e.tile)], '매복!', '#ff5a4a'); break;
        case 'trap': { const at = e.tile ?? e.vertex; if (at && (seen(at) || e.owner === ME)) map.float(hexesOf(at), g.defs.get(e.id).name, '#ff8a7a'); break; }
        case 'effect': if (seen(e.vertex)) map.float(hexesOf(e.vertex), g.defs.get(e.card).name, '#d2b2ff'); break;
        case 'meteor-fall': for (const tile of e.tiles) if (seen(tile)) map.float([parseHex(tile)], '쾅!', '#ffb35a'); break;
        case 'skill': if (actor !== ME) say(`${name(actor)}: ${e.name}`); break;
        case 'lose-card': if (e.player === ME) say('정보원 둥지에 카드 1장을 잃었어요'); break;
        case 'trade': if (actor !== ME) say(`${name(actor)}이(가) 교환했어요`); break;
        case 'log': say(e.text.replace(/^나이\(가\)/, '내가').replace(/^나의/, '내')); break;
        case 'over': overHow = e.goal !== undefined ? 'goal' : 'castle'; break;
        case 'build': case 'summon': if (actor !== ME) { const at = e.vertex ?? e.tile; if (seen(at)) map.show(hexesOf(at)); } break;
      }
      if (e.type === 'move' || e.type === 'attack' || e.type === 'fly') refresh();
    }
    refresh();
  }

  async function showDice(e, actor) {
    const label = `${actor === ME ? '내' : `${name(actor)}의`} 주사위 ${e.dice[0]} + ${e.dice[1]} = ${e.sum}`;
    map.status.textContent = label;
    if (auto || (actor !== ME && pace === 'fast')) return say(label);
    await rollDice(root, e.dice, { reducedMotion: useReducedMotion() }).finished;
  }

  // ── HUD ───────────────────────────────────────────────────
  function updateHud() {
    if (!g) return;
    const p = me();
    hud.querySelectorAll('.hud-resources li').forEach((li, i) => { li.lastElementChild.textContent = p.resources[RESOURCES[i]]; });
    for (const q of s.players) {
      const stat = hud.querySelector(`[data-stat="${q.id}"]`);
      if (stat) stat.innerHTML = q.alive ? `${icon('heart')}${q.castleHp}${g.rules.goal ? ` ${icon('home')}${g.goalCount(q.id)}/${g.rules.goal}` : ''}` : '탈락';
      hud.querySelector(`.player[data-player="${q.id}"]`)?.classList.toggle('now', s.current === q.id && s.phase !== 'over');
    }
    handButton.querySelector('.backs').innerHTML = `<img src="${image('cards/back', 'cards')}" alt="">`.repeat(Math.min(3, p.hand.length));
    handButton.querySelector('.hand-count').textContent = p.hand.length;
    // 아래 가운데 큰 단추: 주사위 → 턴 끝내기
    const mine = s.current === ME && !s.pending.length && s.phase !== 'over';
    mainButton.hidden = !mine || auto;
    mainButton.disabled = busy;
    if (s.phase === 'roll') mainButton.innerHTML = `${icon('dice')}주사위 굴리기`;
    else mainButton.innerHTML = `${icon('turn')}턴 끝내기<b class="clock"></b>`;
    tickClock();
    tools.hidden = !myMain() || Boolean(pick) || auto;
    if (!tools.hidden) {
      tools.querySelector('[data-tool="village"]').disabled = busy || !g.has(p.resources, g.rules.cost.village) || !g.buildSpots(ME).length;
      tools.querySelector('[data-tool="road"]').disabled = busy || !g.has(p.resources, g.rules.cost.road) || !g.roadSpots(ME).length;
      tools.querySelector('[data-tool="trade"]').disabled = busy;
    }
    // 띠: 고르는 중이면 고르기 안내, 아니면 누구 턴인지
    const top = s.pending[0];
    let text = '';
    if (s.phase === 'over') text = '';
    else if (top?.type === 'village' && top.player === ME) text = '노란 자리에 첫 마을을 놓으세요';
    else if (top && top.player !== ME) text = `${name(top.player)}이(가) 고르는 중…`;
    else if (s.current !== ME) text = `${name(s.current)} 턴 진행 중…`;
    else if (s.phase === 'roll') text = '내 턴! 주사위를 굴리세요';
    banner.querySelector('span').textContent = text;
    banner.hidden = !text || !pickBar.hidden || !unitPanel.hidden;
    paceButton.hidden = (top ? top.player : s.current) === ME || s.phase === 'over';
  }

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
      // 고르는 중(표시·창이 열림)에는 멈춘다. 멈춘 시간은 한 턴에 합쳐 1분까지
      if ((pick || dialog.open) && clock.pause > 0) clock.pause -= dt; else clock.left -= dt;
      if (clock.left <= 0) { const { onEnd, run } = clock; stopClock(); if (run === alive) onEnd(); return; }
    }
    const left = Math.ceil(clock.left);
    const text = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    const target = s.pending[0]?.type === 'village' ? banner.querySelector('span') : mainButton.querySelector('.clock');
    if (s.pending[0]?.type === 'village') target.textContent = `노란 자리에 첫 마을을 놓으세요 · ${left}`;
    else if (target) target.textContent = text;
    mainButton.classList.toggle('hurry', left <= 10);
  }

  // ── 고르기 ────────────────────────────────────────────────
  function setPick(next) {
    pick = next;
    const text = {
      setup: '', warp: '공간 뒤틀림: 상대 유닛을 보낼 칸을 고르세요', road: '길을 놓을 곳(노란 선)을 고르세요',
      village: '마을을 지을 자리를 고르세요', gate: '왕성 곁 빈 칸을 고르세요',
    }[next.kind];
    if (text) showPick(text);
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
    if (g.canAttack(u) && g.attackTargets(u).length) parts.push('빨간 표시 공격');
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
    if (!button || busy || !myMain()) return;
    if (button.dataset.tool === 'trade') return showTrade();
    setPick({ kind: button.dataset.tool });
    refresh();
  });

  mainButton.addEventListener('click', () => {
    if (!g || busy || s.current !== ME || s.pending.length) return;
    clearPick();
    act({ type: s.phase === 'roll' ? 'roll' : 'end' });
  });
  paceButton.addEventListener('click', () => {
    pace = pace === 'fast' ? 'normal' : 'fast';
    paceButton.setAttribute('aria-pressed', pace === 'fast');
    paceButton.textContent = pace === 'fast' ? '보통 속도' : '빠르게';
  });

  // ── 창: 카드·교환·고르기·끝 ─────────────────────────────────
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
    const res = me().resources;
    if (def.type === 'unit') {
      if (!g.has(res, def.costMap)) return { why: '자원이 모자라요' };
      if (g.unitsOf(ME).length >= g.unitCap(ME)) return { why: `유닛은 ${g.unitCap(ME)}기까지예요(마을을 지으면 늘어요)` };
      const options = g.summonTiles(ME).map(tile => ({ tile }));
      return options.length ? { options, look: 'place', text: `${def.name}: 소환할 칸을 고르세요` } : { why: '소환할 빈 칸이 없어요' };
    }
    if (def.type === 'building') {
      if (!g.has(res, def.costMap)) return { why: '자원이 모자라요' };
      const options = g.buildSpots(ME).map(vertex => ({ vertex }));
      return options.length ? { options, look: 'place', text: `${def.name}: 지을 자리를 고르세요` } : { why: '지을 자리가 없어요(내 길이 닿은 빈 자리)' };
    }
    const options = def.type === 'trap' ? g.trapTargets(ME, def.id) : g.magicTargets(ME, def.id);
    if (!options.length) return { why: '쓸 대상이 없어요' };
    if (options.length === 1 && !Object.keys(options[0]).length) return { now: {} };
    if (options[0].resource) return { ask: options };
    const look = options[0].unit !== undefined ? 'ally' : 'place';
    return { options, look, text: `${def.name}: ${def.type === 'trap' ? '놓을 곳' : '대상'}을 고르세요` };
  }

  // 카드 고르기 창: 위는 작은 카드 줄, 아래는 고른 카드를 크게 보인다.
  // mode: hand(쓰기), discard(count장 골라 버리기), take(한 장 가져가기: 시장·점성대)
  let picker = null;
  function showCards(next) {
    picker = next;
    const { mode, uids, focus, chosen = [], count = 1, title } = picker;
    let note = '', buttons = '';
    if (mode === 'hand') {
      const use = cardUse(focus);
      note = use.why ?? '';
      buttons = `<button class="ui-button use" ${use.why ? 'disabled' : ''}>쓰기</button><button class="ui-button blue close">닫기</button>`;
    } else if (mode === 'discard') {
      note = `버릴 카드 ${chosen.length}/${count}장`;
      buttons = `<button class="ui-button blue mark">${chosen.includes(focus) ? '버리지 않기' : '이 카드 버리기'}</button><button class="ui-button do-discard" ${chosen.length === count ? '' : 'disabled'}>${count}장 버리기</button>`;
    } else buttons = '<button class="ui-button take">이 카드 가져가기</button>';
    openDialog(`<h2>${title}</h2>
      <div class="hand-row">${uids.map(uid => `<button class="hand-card${uid === focus ? ' on' : ''}${chosen.includes(uid) ? ' marked' : ''}" data-uid="${uid}" aria-pressed="${uid === focus}" aria-label="${g.card(uid).name}">${cardHTML(g.card(uid))}</button>`).join('')}</div>
      <div class="hand-focus">${cardHTML(g.card(focus), { big: true })}</div>
      <p class="hand-note">${note}</p>
      <div class="dialog-buttons">${buttons}</div>`, 'hand-dialog');
    dialog.querySelector('.hand-card.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }
  function showHand() {
    const hand = me().hand;
    if (!hand.length) return say('카드가 없어요');
    showCards({ mode: 'hand', uids: hand, focus: hand[0], title: `내 카드 ${hand.length}장` });
  }
  handButton.addEventListener('click', () => { if (g && !busy) showHand(); });

  function useCard(uid) {
    const use = cardUse(uid);
    if (use.why) return say(use.why);
    closeDialog();
    if (use.now) return act({ type: 'play', uid, target: use.now });
    if (use.ask) {
      // 풍년(자원), 소매치기(상대와 자원)
      openDialog(`<h2>${g.card(uid).name}</h2><div class="choice-list">${use.ask.map((o, i) => `<button class="ui-button choice" data-i="${i}">${o.player !== undefined ? `${name(o.player)}의 ` : ''}${icon(o.resource)}${RESOURCE_NAMES[o.resource]}${o.player !== undefined ? ` (${s.players[o.player].resources[o.resource]})` : ''}</button>`).join('')}</div>
        <div class="dialog-buttons"><button class="ui-button blue close">닫기</button></div>`, 'choice-dialog');
      Object.assign(dialog.dataset, { ask: JSON.stringify(use.ask), uid });
      return;
    }
    pick = { kind: 'card', uid, options: use.options, look: use.look };
    showPick(use.text);
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
    const hand = me().hand;
    if (top.type === 'discard') {
      showCards({ mode: 'discard', uids: hand, focus: hand[0], chosen: [], count: top.count, title: `카드가 6장을 넘어요. ${top.count}장을 버려요` });
    } else if (top.type === 'market' || (top.type === 'stargaze' && top.deck)) {
      showCards({ mode: 'take', uids: top.cards, focus: top.cards[0], title: top.type === 'market' ? '시장: 한 장을 가져가세요' : '점성대: 손에 넣을 카드를 고르세요' });
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
    if (button.classList.contains('mark')) {
      const { chosen, focus } = picker;
      return showCards({ ...picker, chosen: chosen.includes(focus) ? chosen.filter(x => x !== focus) : [...chosen, focus] });
    }
    if (button.classList.contains('do-discard')) return resolveChoice({ uids: picker.chosen });
    if (button.classList.contains('take')) return resolveChoice({ uid: picker.focus });
    if (button.dataset.deck) return resolveChoice({ deck: button.dataset.deck });
    if (button.dataset.index !== undefined && top?.type === 'fate') return resolveChoice({ index: Number(button.dataset.index) });
    if (button.classList.contains('use')) return useCard(picker.focus);
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
    delete dialog.dataset.locked;
    closeDialog();
    busy = false;
    root.querySelector('.dice-layer')?.remove();
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
    map.open(mode, { board, players: roster, scene: scene() });
    root.dataset.game = 'on';
    map.focus(g.geo.vertices.get(s.players[ME].castle).hexes);
    say(`${RACE_NAMES[race]}로 시작해요. 내 왕성 가까이 첫 마을을 놓으세요`);
    next();
  }
  // 시험용: 지금 판의 엔진과 고르기 상태(Playwright가 읽는다)
  root.game = () => ({ g, pick, marks, busy });
  return start;
}
