// 봇끼리 대전 시뮬레이션. node scripts/simulate.mjs [판 수=200] [모드=duel|ffa|team|all] [시작 시드]
// 명령마다 규칙이 깨지지 않았는지 검사하고, 판 길이·승률·막힘을 모아 알린다. 실패하면 종료 코드 1.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createBoard, MODES } from '../src/board.js';
import { createGame } from '../src/game/rules.js';
import { botStep } from '../src/game/bot.js';
import { parseCards } from './cards-data.mjs';

// 카드 자료는 문서에서 바로 읽는다(빌드 전 시험에서도 돌게)
const cards = parseCards(await readFile(new URL('../docs/cards.md', import.meta.url), 'utf8'));
const RACES = ['warrior', 'mage', 'assassin'];

export function playOut({ mode, seed, races, maxTurns = 600, check = true, rules }) {
  const board = createBoard({ mode, seed });
  const g = createGame({ board, races, cards, ...(rules ? { rules } : {}) });
  const s = g.state;
  const problems = [];
  let steps = 0, rejects = 0, memo = new Set(), memoTurn = -1, stuck = 0, how = null;
  while (s.phase !== 'over' && s.turnCount <= maxTurns && steps < 60000) {
    steps++;
    const top = s.pending[0];
    const actor = top ? top.player : s.current;
    if (s.turnCount !== memoTurn) { memo = new Set(); memoTurn = s.turnCount; stuck = 0; }
    const cmd = botStep(g, actor, memo);
    if (!cmd) { problems.push(`행동 없음: ${JSON.stringify({ phase: s.phase, top, current: s.current })}`); break; }
    const result = g.apply(cmd);
    if (!result.ok) {
      rejects++; stuck++;
      if (cmd.type === 'end' || stuck > 200) { problems.push(`막힘: ${cmd.type} → ${result.error}`); break; }
      continue;
    }
    for (const e of result.events) if (e.type === 'over') how = e.goal !== undefined ? 'goal' : 'castle';
    if (check) for (const issue of invariants(g)) problems.push(`${issue} (턴 ${s.turnCount}, ${cmd.type})`);
    if (problems.length > 5) break;
  }
  const over = s.phase === 'over';
  return {
    seed, mode, races, over, how, rounds: s.round, turns: s.turnCount, winner: s.winner, problems, rejects, steps,
    castles: s.players.map(p => p.castleHp), units: s.players.map(p => g.unitsOf(p.id).length),
    villages: s.players.map(p => g.buildingsOf(p.id).filter(b => b.kind === 'village').length),
  };
}

// 언제나 지켜야 하는 것
function invariants(g) {
  const s = g.state, out = [];
  const tiles = new Set();
  for (const u of s.units.values()) {
    if (tiles.has(u.tile)) out.push(`한 칸에 유닛 둘: ${u.tile}`);
    tiles.add(u.tile);
    if (!g.passable(u.tile)) out.push(`지나갈 수 없는 칸의 유닛: ${u.card} ${u.tile}`);
    if (u.hp <= 0 || u.hp > u.maxHp) out.push(`체력 범위 밖: ${u.card} ${u.hp}/${u.maxHp}`);
    if (u.mana < 0 || u.mana > u.maxMana) out.push(`마나 범위 밖: ${u.card} ${u.mana}/${u.maxMana}`);
    if (!s.players[u.owner].alive) out.push('탈락한 플레이어의 유닛');
  }
  for (const p of s.players) {
    for (const [r, v] of Object.entries(p.resources)) if (v < 0) out.push(`자원 음수: ${r} ${v}`);
    if (g.unitsOf(p.id).length > 6) out.push(`유닛 6기 초과: ${g.unitsOf(p.id).length}`);
    if (p.alive && !s.buildings.has(p.castle)) out.push('살아 있는데 왕성이 없음');
  }
  for (const b of s.buildings.values()) for (const n of g.geo.vertexNeighbors(b.vertex)) if (s.buildings.has(n)) out.push(`이웃 꼭짓점에 건물 둘: ${b.vertex}`);
  return out;
}

const pct = (a, b) => `${Math.round(100 * a / Math.max(b, 1))}%`;
async function main() {
  const [count = '200', which = 'duel', start = '1'] = process.argv.slice(2);
  const modes = which === 'all' ? Object.keys(MODES) : [which];
  let failed = false;
  for (const mode of modes) {
    const results = [];
    const t0 = performance.now();
    for (let i = 0; i < Number(count); i++) {
      const seed = Number(start) + i * 7919;
      // 종족 조합을 고르게 돈다(1대1은 9가지 순서쌍)
      const races = Array.from({ length: MODES[mode].players }, (_, k) => RACES[Math.floor(i / 3 ** k) % 3]);
      results.push(playOut({ mode, seed, races }));
    }
    const ms = performance.now() - t0;
    const done = results.filter(r => r.over);
    const bad = results.filter(r => r.problems.length);
    const rounds = done.map(r => r.rounds).sort((a, b) => a - b);
    const median = rounds[Math.floor(rounds.length / 2)] ?? 0;
    console.log(`\n[${MODES[mode].name}] ${results.length}판, ${(ms / results.length).toFixed(0)}ms/판`);
    console.log(`  끝난 판 ${done.length} (${pct(done.length, results.length)}), 규칙 문제 ${bad.length}판, 거부된 봇 명령 평균 ${(results.reduce((s, r) => s + r.rejects, 0) / results.length).toFixed(1)}회`);
    console.log(`  라운드: 최소 ${rounds[0] ?? '-'}, 중간 ${median}, 최대 ${rounds.at(-1) ?? '-'}`);
    console.log(`  승리 방식: 왕성 파괴 ${pct(done.filter(r => r.how === 'castle').length, done.length)}, 목표 달성 ${pct(done.filter(r => r.how === 'goal').length, done.length)}`);
    if (mode === 'duel') {
      // 종족별 승률(1대1): 이긴 판의 승자 종족 / 그 종족이 나온 판
      for (const race of RACES) {
        const played = done.filter(r => r.races.includes(race) && new Set(r.races).size === 2);
        const won = played.filter(r => r.races[r.winner] === race);
        console.log(`  ${race}: 다른 종족과 ${played.length}판 중 ${won.length}승 (${pct(won.length, played.length)})`);
      }
      const first = done.filter(r => r.winner === 0).length;
      console.log(`  0번 플레이어 승: ${pct(first, done.length)}`);
    }
    for (const r of bad.slice(0, 5)) console.log(`  문제 seed ${r.seed}: ${r.problems.slice(0, 3).join(' / ')}`);
    const unfinished = results.filter(r => !r.over && !r.problems.length);
    for (const r of unfinished.slice(0, 3)) console.log(`  안 끝남 seed ${r.seed}: ${r.turns}턴, 왕성 ${r.castles}, 유닛 ${r.units}, 마을 ${r.villages}`);
    if (bad.length || unfinished.length > results.length * 0.02) failed = true;
  }
  process.exitCode = failed ? 1 : 0;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
