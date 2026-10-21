// docs/cards.md의 표를 읽어 카드 자료(src/generated/cards.json)를 만든다. 카드 이름·비용·수치·글의 기준은 그 문서다.
// 그림 파일 이름(영문 id)만 여기서 정한다. 문서에 새 카드가 생기면 ID에 한 줄 더한다.
const ID = {
  방패냥: 'unit-warrior-shield', 도끼냥: 'unit-warrior-axe', 깃발냥: 'unit-warrior-flag', 냥기사: 'unit-warrior-knight', 냥장군: 'unit-warrior-general',
  망루: 'building-warrior-watchtower', 보루: 'building-warrior-bastion', 막사: 'building-warrior-barracks', 대장간: 'building-warrior-forge', 훈련소: 'building-warrior-training',
  견습냥: 'unit-mage-apprentice', 결계냥: 'unit-mage-barrier', 빗자루냥: 'unit-mage-broom', 점술냥: 'unit-mage-seer', 대마법냥: 'unit-mage-archmage',
  마법탑: 'building-mage-tower', 마나샘: 'building-mage-mana-spring', '수정 연구소': 'building-mage-crystal-lab', 점성대: 'building-mage-observatory', '순간이동 문': 'building-mage-teleport-gate',
  도둑냥: 'unit-assassin-thief', 은신냥: 'unit-assassin-scout', 단검냥: 'unit-assassin-dagger', 독침냥: 'unit-assassin-poison', 그림자냥: 'unit-assassin-shadow',
  '그늘 망루': 'building-assassin-shade-tower', 은신처: 'building-assassin-hideout', '생선 창고': 'building-assassin-fish-store', '정보원 둥지': 'building-assassin-informant-nest', 암시장: 'building-assassin-black-market',
  함성: 'magic-warcry', 철벽: 'magic-ironwall', 화염구: 'magic-fireball', 질주: 'magic-sprint', 천리안: 'magic-farsight', '긴급 보수': 'magic-repair',
  시장: 'magic-market', 풍년: 'magic-harvest', '성문 닫기': 'magic-closegate', '운명 다시 쓰기': 'magic-rewrite', 소매치기: 'magic-pickpocket',
  '함정 구덩이': 'trap-pit', 걸림목: 'trap-tripwire', '독 바늘': 'trap-poisonneedle', '화염 룬': 'trap-firerune', 올가미: 'trap-snare',
  '가짜 보물': 'trap-faketreasure', '공간 뒤틀림': 'trap-spacewarp', '반격 태세': 'trap-counter', '거울 결계': 'trap-mirror', '성벽 수호': 'trap-wallguard',
};
const RES = { 금: 'gold', 수정: 'crystal', 나무: 'wood', 생선: 'fish' };
const RACE = { 냥전사: 'warrior', 냥법사: 'mage', 냥살자: 'assassin' };
const TIER = { 3: '기본', 2: '정예', 1: '전설' }; // 유닛은 장수로 단계를 나눈다(3장 기본, 2장 정예, 1장 전설)
const cost = text => [...text.matchAll(/(금|수정|나무|생선)(\d+)/g)].map(([, r, n]) => [RES[r], Number(n)]);
// 마크다운 굵게와 줄바꿈만 HTML로. "설명:" 문단(이야기 글)은 크게 볼 때만 보이게 따로 둔다.
function text(md) {
  const parts = md.split(/<br \/><br \/>/).map(part => part.trim()).filter(Boolean);
  // 문서용 참조 "(설계서 7장)"은 카드에 보이지 않게 뺀다
  const html = part => part.replace(/\s*\(설계서[^)]*\)/g, '').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/<br \/>/g, ' ');
  const flavor = parts.filter(part => part.startsWith('**설명:**')).map(part => html(part.replace('**설명:**', '').trim()));
  const text = parts.filter(part => !part.startsWith('**설명:**')).map(html);
  // 효과가 없는 카드(견습냥)는 이야기 글을 설명판에 쓴다
  return text.length ? { text, flavor: flavor[0] ?? '' } : { text: flavor.slice(0, 1), flavor: '' };
}
export function parseCards(md) {
  const cards = [];
  let race = null, section = null, table = null;
  for (const line of md.split('\n')) {
    const heading = line.match(/^###\s+(\S+)/);
    if (heading) { race = RACE[heading[1]] ?? null; section = heading[1]; table = null; continue; }
    if (!line.startsWith('|')) { table = null; continue; }
    const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
    if (/^-+$/.test(cells[0].replace(/:/g, ''))) continue;
    if (['유닛', '건물', '이름'].includes(cells[0])) { table = cells[0] === '이름' ? section : cells[0]; continue; }
    const id = ID[cells[0]];
    if (!table || !id) continue;
    if (table === '유닛') {
      const [hp, mana, move, atk, rng] = cells[3].split('/').map(v => Number(v.trim()));
      cards.push({ id, name: cells[0], look: race, type: 'unit', copies: Number(cells[1]), tier: TIER[cells[1]], cost: cost(cells[2]), stats: { hp, mana, move, atk, rng }, ...text(cells[4]) });
    } else if (table === '건물') {
      const tower = cells[3].match(/공격타워, 체력 (\d+), 피해 (\d+)/);
      const dice = cells[3].match(/숫자 (\d+)/);
      const range = cells[4].match(/주변 (\d+)칸/);
      cards.push({ id, name: cells[0], look: race, type: 'building', copies: Number(cells[1]), kind: tower ? '공격타워' : dice ? '효과' : '건물', cost: cost(cells[2]),
        ...(tower ? { stats: { hp: Number(tower[1]), atk: Number(tower[2]), rng: range ? Number(range[1]) : 1 } } : {}), ...(dice ? { dice: Number(dice[1]) } : {}), ...text(cells[4]) });
    } else if (table.startsWith('마법')) {
      cards.push({ id, name: cells[0], look: 'magic', type: 'magic', copies: Number(cells[1]), ...text(cells[2]) });
    } else if (table.startsWith('함정')) {
      cards.push({ id, name: cells[0], look: 'trap', type: 'trap', copies: Number(cells[1]), target: cells[2], ...text(cells[3]) });
    }
  }
  return cards;
}
