import './map.css';
import { MODES, TERRAIN, PORT_RATE, createBoard, hexToPixel, pixelToHex, hexCorners, hexDistance, portSpots } from './board.js';
import { UNKNOWN, KNOWN, VISIBLE, vision, pieceSeen, boardPieces } from './vision.js';
import cards from './generated/cards.json';
import { useReducedMotion } from './motion.js';
import { rollDice } from './dice.js';
import { files } from './generated/map-art.json';
import bakedArt from './generated/art.json';
import { image as bakedImage } from './card-view.js';
import { tint } from './tint.js';

const TILE = 100; // 칸 중심에서 꼭짓점까지(월드 단위)
const MAX_ZOOM = 1.4; // 칸 너비 280 CSS px
const FIT = 0.96; // 판 상자 전체를 볼 때 양쪽에 2%씩 여백
const DETAIL = 22; // 칸 반지름이 이 CSS px보다 작으면(전체 보기) 숫자 패를 숨긴다
const NUMBER_FONT = '700 30px "Catfantagy UI", sans-serif';
// 타일 그림(원본 1024px): 윗면은 (511.5, 477.5)가 중심이고 반지름 481px인 정육각형, 그 아래 두께 66px.
// 윗면이 월드 칸과 딱 맞게 원본 1px을 TILE / 481로 줄여 그린다. 줄인 그림(600px 등)도 같은 자리에 그린다.
const UNIT = TILE / 481;
const SPRITE = 1024 * UNIT;
const SPRITE_X = 511.5 * UNIT;
const SPRITE_Y = 477.5 * UNIT;
const DEPTH = 66 * UNIT;
const REACH = 115; // 칸 중심에서 그림 끝까지(위 99, 아래 114)보다 조금 넉넉히. 화면 밖 칸을 거를 때 쓴다.
const GROUNDS = ['grass-1', 'grass-2', 'grass-3', 'barren', 'lake'];
const ON_BARREN = new Set(['gold', 'crystal', 'rock']); // 임시: 거친 땅은 흙빛 바탕에 둔다
// 자원 지형 타일(2026-10-20 사용자 결정, PR #16): 자원을 칸 그림에 그려 넣은 타일. 바탕 타일과 윤곽이 같아 같은 자리에 그린다.
// 안개 속 모르는 칸은 이 타일 대신 바탕(풀밭·빈 땅)을 그려 자원을 숨긴다.
const OBJECTS = { forest: 'forest-tile', gold: 'gold-mine-tile', crystal: 'crystal-tile', rock: 'rock-tile' };
const DISC_Y = 0.40 * TILE; // 숫자 패: 칸 아래쪽 가운데. 오브젝트 그림은 위쪽을 쓴다.
const DISC_R = 0.26 * TILE;
// 성 크기(월드 단위). 구운 성 그림(받침 포함, 폭:높이 680:900)은 폭을 CASTLE × CASTLE_W로 그린다. 보이는 성의 폭은 약 90으로 칸 폭의 45%.
// 임시: 이웃 꼭짓점(100 떨어짐, 길이 지날 자리)을 가리지 않는 가장 큰 크기. 테두리까지 잰 실루엣이 가장 가까운 이웃(오른쪽 위, 깃발 쪽)과 약 9 떨어진다.
// 이웃 칸 숫자 패 가장자리를 약 10% 덮지만, 숫자 패를 성보다 나중에 그려 숫자는 가려지지 않는다.
const CASTLE = 120;
// 임시: 멀리 볼수록 성을 땅보다 크게 그린다(castleSize). 기본 배율 NATURAL 이상에서는 CASTLE 그대로,
// 판 전체를 볼 때는 화면에서 CASTLE_FAR CSS px(4인 판 iPad 세로에서 칸 폭 35px의 약 2배).
// 휴대폰처럼 칸이 작게 보이면 그때 칸 폭의 CASTLE_FAR_TILES배까지만 키워 판을 덮지 않게 한다(4인 판 휴대폰 세로 약 44px).
const NATURAL = 0.7; // 칸 폭 140 CSS px. 플레이어를 눌러 왕성으로 갈 때 전체 보기였다면 이 배율로 확대한다
const CASTLE_FAR = 72; // 기본 배율의 성(120 × 0.7 = 84px)보다 크면 확대할 때 성이 줄어 보이므로 그보다 작게 둔다
const CASTLE_FAR_TILES = 2.5;
const CASTLE_ABOVE = 2; // 성이 제 크기의 2배를 넘으면(숫자 글자 약 9 CSS px 이하) 숫자 패 위에 그린다
const CASTLE_W = 100 / 120; // 성 그림 폭 / 성 크기
const CASTLE_RATIO = 900 / 680; // 성 그림 높이 / 폭(scripts/bake-art.mjs의 BUILDING_BOX)
const [CASTLE_AX, CASTLE_AY] = bakedArt.pieces['castle@anchor']; // 받침 가운데(그림 안 비율). 꼭짓점에 맞춘다
// 유닛 동전 토큰(2026-10-21). 그림 안의 동전 가운데·테두리·체력·마나 자리(1024 기준)는 굽는 코드와 같은 값(art.json의 token).
const TK = bakedArt.token;
const TOKEN_D = 88; // 임시: 동전 지름(월드 단위, 칸 폭 200의 44%)
const TOKEN_SCALE = 1024 / (2 * TK.rim); // 동전 지름 → 그림 폭
const TOKEN_FAR = 26; // 멀리 볼 때도 동전이 화면에서 이 CSS px보다 작아지지 않게 한다
const TOKEN_UP = 22; // 동전을 칸 가운데보다 위로 올려 아래쪽 숫자 패를 덜 가린다(숫자 패는 말 위에 그린다)
const STATS = Object.fromEntries(cards.filter(card => card.type === 'unit').map(card => [card.id, card.stats]));
const GLIDE = 300; // 왕성으로 가는 시점 이동 시간(ms)
const FOAM = 26; // 해안 거품 굵기. 절반은 육지 그림에 덮인다
// 임시 · 안개(볼류메트릭): 짙은 회색으로 판 상자 전체(바다 포함)를 덮어, 보이는 곳(내 성·말 둘레)에 눈이 가게 한다.
// 바닥 질감은 비친다. 모르는 칸·바다는 짙게, 아는 칸은 옅게 덮는다. 보이는 칸은 다 밝고, 흐린 경계는 칸 바깥(이웃 칸 쪽)에 생긴다.
// 안개 그림은 시야가 바뀔 때만 다시 만들고(buildFog), 매번 그릴 때는 한 장을 판 크기로 늘려 붙이기만 한다. 상자 밖은 같은 색(--sea-fog)으로 칠한다.
const FOG_SCALE = 10; // 안개 그림 1px = 월드 10단위(4인 판 465×362px, 약 0.7MB). 흐린 그림이라 늘려도 거칠지 않다
const FOG_REACH = 1.25 * TILE; // 보이는 칸(아는 칸)마다 이 반지름의 원만큼 안개를 걷는다. 칸 꼭짓점(1.0)보다 커서 경계가 칸 바깥에 생기고, 이웃 칸 가운데(1.73)까지는 닿지 않는다
const FOG_BLUR = 20; // 안개 가장자리가 번지는 정도(가우스 σ, 월드 단위)
const FOG_MARGIN = 2 * TILE; // 판 상자 둘레. 가장자리 칸의 걷힌 곳이 번질 자리이고, 그 바깥은 모르는 곳 짙기라 상자 밖 색과 이어진다
const FOG_UNKNOWN = 0.62; // 모르는 칸과 바다 안개의 불투명도
const FOG_KNOWN = 0.38; // 아는 칸
// 교환소: 변 가운데에서 바다 쪽으로 부두 그림, 그 끝에 두 자원 아이콘과 ⇄ 표지(임시, 코드로 그림).
// 부두 그림(원본 512px)은 땅에 닿는 점(256, 400)을 변 가운데에 두고, 위쪽 끝(y 131)이 바다 쪽을 향하게 돌린다.
const DOCK = 110; // 부두 그림 크기(월드 단위). 보이는 부두는 길이 58, 폭 53
const DOCK_FOOT = 400 / 512;
const SIGN = 40; // 표지 높이(월드 단위). 너비는 SIGN_RATIO배
const SIGN_RATIO = 2.6;
const SIGN_MIN = 18; // 멀리 볼 때도 표지 높이가 화면에서 이 CSS px보다 작아지지 않게 한다(성과 같은 방식)
const PIER = 46; // 해안에서 표지까지(월드 단위). 표지가 부두 끝 기둥을 조금 덮는다
const PIER_W = 40; // 부두를 누르는 폭. 멀리서는 화면 3px보다 가늘어지지 않는다
const SPOT = 9; // 교환소 자리(변의 두 꼭짓점) 표시 반지름. 숫자 패처럼 가까이 볼 때만 그린다
const HIT = 8; // 교환소를 누르는 판정 여유(CSS px)
// ⇄ 화살표(표지 높이 1 기준). 글꼴에 없을 수 있어 선으로 그린다.
const ARROW = new Path2D('M-.26 -.12H.26M.14 -.24L.26 -.12L.14 0M.26 .12H-.26M-.14 0L-.26 .12L-.14 .24');
const CLASS_NAMES = { warrior: '냥전사', mage: '냥법사', assassin: '냥살자' };
// 임시: 나와 봇. 인원수만큼 앞에서부터 쓴다. 판의 starts 순서와 같다(팀전은 0·1번이 한 팀).
const PLAYERS = [
  { name: '나', classId: 'warrior' },
  { name: '봇 1', classId: 'mage' },
  { name: '봇 2', classId: 'assassin' },
  { name: '봇 3', classId: 'warrior' },
];
// 임시 색. 지형 색은 미니맵과 그림이 오기 전(또는 실패한 뒤)의 대체 그림에 쓴다.
const PALETTE = {
  grass: '#a5bf76',
  forest: '#4f9a48',
  lake: '#5cbfe8',
  gold: '#f0c24f',
  crystal: '#b496f0',
  rock: '#9a958b',
  barren: '#cdb487', // 금광·수정산·바위산의 바탕(빈 땅). 안개 속에서는 이 칸들이 바닥 색으로만 보인다
  sea: '#3d9fcb',
  fog: '#2a2c30', // 안개: 짙은 회색
  foam: 'rgba(255, 255, 255, .6)',
  disc: '#fff6df',
  discEdge: 'rgba(70, 48, 20, .35)',
  number: '#3b2b1b',
  hot: '#c8372d', // 6과 8: 자주 나오는 숫자
  outline: '#000', // 코드로 그리는 교환소 표지·성 받침 테두리
  select: '#ffda63',
  selectEdge: 'rgba(40, 28, 8, .55)',
  players: ['#e0453a', '#1f9e5a', '#3a7fe0', '#f2c230'], // 빨강, 초록(풀밭과 갈리게 푸른 쪽), 파랑, 노랑. 판 위 말과 프로필 틀에 쓴다. 지금은 목록 순서대로(나 빨강)
};
const RESOURCES = [['gold', '금'], ['crystal', '수정'], ['wood', '나무'], ['fish', '생선']];
const RESOURCE_NAMES = Object.fromEntries(RESOURCES);
// 매크로 채팅: 자유 채팅 없이 정해진 말만 고른다. 임시 수치는 설계서 "게임 화면"과 같다.
const CHAT = ['안녕하세요', '잘 부탁해요', '감사합니다', '미안해요', '좋은 수네요!', '잠깐만요', '야옹~', '수고하셨어요'];
const CHAT_COOLDOWN = 5000; // 보낸 뒤 다시 보낼 수 있을 때까지(ms). 단추 안 막대가 이 시간 동안 줄어든다
const BUBBLE_SHOW = 3000; // 말풍선이 또렷하게 보이는 시간(ms)
const BUBBLE_FADE = 300; // 그 뒤 흐려지며 사라지는 시간(ms). map.css의 .bubble transition과 같다
const BUBBLE_TAIL = 8; // 말풍선 꼬리 길이(px). map.css와 같다
const GROUND_NAMES = { grass: '풀밭', barren: '빈 땅', lake: '호수' }; // 안개 속 칸은 바닥만 알린다
const CORNERS = hexCorners(0, 0, TILE);
// 꼭짓점 i와 i+1 사이 변 너머의 이웃
const EDGE_DIRS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

// 꼭짓점(붙은 세 칸)의 월드 좌표: 세 칸 중심의 평균. 왕성과 교환소 자리에 쓴다.
function vertexAt(hexes) {
  const [a, b, c] = hexes.map(({ q, r }) => hexToPixel(q, r, TILE));
  return { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
}

// 교환소 표지의 크기(월드 단위)와 부두 폭. 멀리 볼수록 월드 단위로는 커져 화면에서 읽을 만한 크기를 지킨다.
function signSize(zoom) {
  const h = Math.max(SIGN, SIGN_MIN / zoom);
  return { w: h * SIGN_RATIO, h, pier: Math.max(PIER_W, 3 / zoom) };
}

// 표지 가운데: 해안 변 가운데에서 바다 쪽으로, 부두 PIER만큼 떨어진 곳에 표지 가장자리가 오게 한다.
function signAt(port, { w, h }) {
  const d = PIER + Math.min(w / 2 / Math.abs(port.ox), h / 2 / Math.abs(port.oy));
  return { x: port.mx + port.ox * d, y: port.my + port.oy * d };
}

// 성 크기(월드 단위). 화면 크기는 전체 보기 far px에서 기본 배율 CASTLE × NATURAL px까지 log 배율의 세제곱으로 늘고,
// 그 뒤로는 땅과 함께 커진다. 확대할수록 화면 크기가 줄지 않고, 세제곱이라 기본 배율에서 꺾이는 느낌이 smoothstep보다 작다.
// 화면 크기와 판 전체 배율(minZoom)만으로 정해져 화면을 몇 번 돌려도 같은 크기로 돌아온다.
function castleSize(zoom, minZoom) {
  if (zoom >= NATURAL) return CASTLE;
  const far = Math.min(CASTLE_FAR, CASTLE_FAR_TILES * 2 * TILE * minZoom);
  const t = Math.max(Math.log(zoom / minZoom) / Math.log(NATURAL / minZoom), 0);
  return Math.max(CASTLE, far * (CASTLE * NATURAL / far) ** (t ** 3) / zoom);
}

function polygon(path, x, y, points) {
  points.forEach(([px, py], i) => (i ? path.lineTo(x + px, y + py) : path.moveTo(x + px, y + py)));
  path.closePath();
}

// 칸 좌표로 정해지는 0 이상 정수. 이웃끼리 줄무늬가 생기지 않게 좌표를 섞는다.
function hashOf(q, r) {
  let h = Math.imul(q, 374761393) + Math.imul(r, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

// 같은 칸은 늘 같은 풀밭 그림
const grassOf = (q, r) => hashOf(q, r) % 3;

// 내용 해시를 붙인 주소. 그림이 바뀌면 주소도 바뀌어 예전 그림이 캐시에 남지 않는다.
// 지도 그림(map/)과 구운 그림(ui/, pieces/ 등, art.json)
const source = path => path.startsWith('map/') ? `${import.meta.env.BASE_URL}${path}.webp?v=${files[path]}` : bakedImage(path, path.split('/')[0]);

async function decode(path) {
  const image = new Image();
  image.src = source(path);
  await image.decode();
  return image;
}

// 그림마다 원본과 절반씩 줄인 4단계(타일은 600, 300, 150, 75, 38px). 크게 줄여 그리면 느리고 거칠어서, 판에 필요한 크기 이상인 가장 작은 단계를 쓴다.
function mips(image) {
  const levels = [image];
  for (let i = 0; i < 4; i++) {
    const last = levels.at(-1);
    const level = document.createElement('canvas');
    level.width = Math.round(last.width / 2);
    level.height = Math.round(last.height / 2);
    const g = level.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(last, 0, 0, level.width, level.height);
    levels.push(level);
  }
  return levels;
}

// 너비가 size(기기 px) 이상인 가장 작은 단계
function levelOf(levels, size) {
  let level = 0;
  while (level < levels.length - 1 && levels[level + 1].width >= size) level++;
  return level;
}

// 플레이어 색으로 칠한 말(성·건물·동전)과 그 축소 단계
const tintCastle = (base, team, color) => mips(tint(base, team, color));

// 판 위 말(건물·유닛 동전) 그림. 판에 실제로 나온 그림·플레이어 짝만 받아 한 번 칠해 두고 다시 쓴다(iPad mini 메모리).
// 아직 오지 않았으면 null을 돌려주고, 오면 다시 그린다.
const pieceCache = new Map();
function pieceImage(path, player, onReady) {
  const key = `${path}|${player}`;
  if (!pieceCache.has(key)) {
    pieceCache.set(key, null);
    Promise.all([decode(path), decode(`${path}-team`)]).then(([base, team]) => {
      pieceCache.set(key, tintCastle(base, team, PALETTE.players[player]));
      onReady();
    }, () => pieceCache.delete(key));
  }
  return pieceCache.get(key);
}

// 보기용 말(#map-demo): 판 그림과 가독성을 확인하려고 내 왕성 둘레에 건물·유닛을, 그 앞에 쳐들어온 상대 유닛을 놓는다.
// 게임 규칙(건설·소환)이 생기면 그 결과로 바뀐다.
const DEMO = {
  mine: { buildings: ['village', 'building-warrior-watchtower', 'building-warrior-barracks'], units: ['unit-warrior-shield', 'unit-warrior-knight', 'unit-warrior-flag'] },
  enemy: { buildings: ['building-mage-tower', 'village'], units: ['unit-mage-broom', 'unit-mage-apprentice'] },
};
function demoPieces(board) {
  const land = new Map(board.tiles.map(tile => [`${tile.q},${tile.r}`, tile]));
  const pick = (list, count, gap) => {
    const chosen = [];
    for (const item of list) if (chosen.length < count && chosen.every(other => Math.hypot(other.x - item.x, other.y - item.y) >= gap)) chosen.push(item);
    return chosen;
  };
  // 세 칸이 모두 육지인 꼭짓점
  const spots = [];
  for (const tile of board.tiles) for (let i = 0; i < 6; i++) {
    const [a, b] = [EDGE_DIRS[(i + 5) % 6], EDGE_DIRS[i]];
    const hexes = [tile, land.get(`${tile.q + a[0]},${tile.r + a[1]}`), land.get(`${tile.q + b[0]},${tile.r + b[1]}`)];
    if (hexes.every(Boolean)) spots.push({ hexes, ...vertexAt(hexes) });
  }
  const walkable = board.tiles.filter(tile => !['lake', 'rock'].includes(tile.type)).map(tile => ({ hexes: [tile], ...hexToPixel(tile.q, tile.r, TILE) }));
  const pieces = [];
  const place = (player, { buildings, units }, unitRange) => {
    const start = board.starts[player], home = vertexAt(start.hexes);
    const near = (list, min, max) => list.map(item => ({ ...item, d: Math.hypot(item.x - home.x, item.y - home.y) })).filter(({ d }) => d >= min && d <= max).sort((a, b) => a.d - b.d);
    const taken = [home, ...pieces];
    pick(near(spots, 170, 420).filter(spot => taken.every(p => Math.hypot(p.x - spot.x, p.y - spot.y) >= 170)), buildings.length, 170)
      .forEach((spot, i) => pieces.push({ kind: 'building', id: buildings[i], player, ...spot }));
    pick(near(walkable, ...unitRange).filter(tile => !start.hexes.some(h => hexDistance(h, tile.hexes[0]) === 0)), units.length, 180)
      .forEach((tile, i) => pieces.push({ kind: 'unit', id: units[i], player, ...tile }));
  };
  place(0, DEMO.mine, [120, 360]);
  place(1, { buildings: DEMO.enemy.buildings, units: [] }, [0, 0]);
  // 상대 유닛은 내 말 가까이(내 시야 안)
  const mineAt = pieces.filter(p => p.player === 0);
  const front = walkable.filter(tile => !pieces.some(p => p.hexes.length === 1 && hexDistance(p.hexes[0], tile.hexes[0]) === 0))
    .map(tile => ({ ...tile, d: Math.min(...mineAt.map(p => Math.hypot(p.x - tile.x, p.y - tile.y))) })).filter(({ d }) => d >= 300 && d <= 420).sort((a, b) => a.d - b.d);
  pick(front, DEMO.enemy.units.length, 300).forEach((tile, i) => pieces.push({ kind: 'unit', id: DEMO.enemy.units[i], player: 1, ...tile }));
  return pieces;
}

// 바닥 타일·호수·지형 오브젝트·재화 아이콘(교환소 표지)·성을 한 번에 받는다. 하나라도 실패하면 지형 색 칸으로 그리고, 다시 부르면 처음부터 받는다.
// 재화 아이콘은 HUD가 같은 주소로 받으므로 브라우저 캐시를 함께 쓴다.
let art = null;
let artLoad = null;
export function loadMapArt() {
  const names = [...GROUNDS, ...Object.values(OBJECTS), 'port'];
  const icons = RESOURCES.map(([type]) => `ui/icon-${type}`);
  artLoad ??= Promise.all([...names.map(name => `map/${name}`), ...icons, 'pieces/castle', 'pieces/castle-team'].map(decode)).then(images => {
    const [castle, team] = images.splice(-2);
    const iconImages = images.splice(-icons.length);
    art = {
      sprites: Object.fromEntries(names.map((name, i) => [name, mips(images[i])])),
      icons: Object.fromEntries(RESOURCES.map(([type], i) => [type, iconImages[i]])),
      castles: PALETTE.players.map(color => tintCastle(castle, team, color)),
    };
  }, error => { artLoad = null; throw error; });
  return artLoad;
}

// 프로필 얼굴: 종족 전설 유닛의 얼굴(구운 그림)에 플레이어 색 테두리
const avatar = (player, index) => `<span class="avatar ${player.classId}" style="--player: ${PALETTE.players[index]}" aria-hidden="true"><img src="${source(`ui/avatar-${player.classId}`)}" alt=""></span>`;
// 누르면 그 플레이어의 왕성으로 시점이 간다. 종족 이름은 버튼 밖에 둬 버튼 이름은 할 일만 말한다(눈에 보이는 종족 글자는 읽지 않게 숨김).
const playerButton = (player, index, tag = 'span') => `<button class="player" data-player="${index}" style="--player: ${PALETTE.players[index]}" aria-label="${index ? `${player.name}의` : '내'} 왕성으로 이동">${avatar(player, index)}<span class="who"><${tag}>${player.name}</${tag}><small class="${player.classId}" aria-hidden="true">${CLASS_NAMES[player.classId]}</small></span></button><span class="sr-only">${CLASS_NAMES[player.classId]}</span>`;

export function mapScreen(root, onModes) {
  // HUD 그림은 loading="lazy"라 지도 화면이 보일 때 받는다. 타이틀 첫 로딩과 겹치지 않는다.
  root.innerHTML = `
    <h2 id="map-title" class="sr-only" tabindex="-1">냥국 지도</h2>
    <canvas class="map-canvas"></canvas>
    <p class="sr-only" role="status"></p>
    <div class="hud">
      <div class="hud-panel hud-players"></div>
      <div class="hud-corner">
        <ul class="hud-panel hud-resources" aria-label="보유 자원">${RESOURCES.map(([type, name]) => `<li><img src="${source(`ui/icon-${type}`)}" alt="" loading="lazy"><span class="sr-only">${name}</span><span>0</span></li>`).join('')}</ul>
        <div class="hud-buttons">
          <button class="hud-round mode-change" aria-label="대전 방식 바꾸기"><img src="${source('ui/icon-settings')}" alt="" loading="lazy"></button>
          <div class="chat">
            <button class="hud-round chat-toggle" aria-label="채팅" aria-expanded="false" aria-controls="chat-list"><img src="${source('ui/icon-chat')}" alt="" loading="lazy"></button>
            <ul id="chat-list" class="hud-panel chat-list" aria-label="말 고르기" hidden>${CHAT.map(text => `<li><button>${text}</button></li>`).join('')}</ul>
          </div>
        </div>
      </div>
      <button class="minimap" aria-label="미니맵 크게 보기"><canvas></canvas><span class="minimap-view"></span></button>
      <button class="ui-button dice-roll"><img src="${source('ui/icon-dice')}" alt="" loading="lazy">주사위 굴리기</button>
      <div class="hand" role="img" aria-label="내 카드 3장">${`<img src="${source('cards/back')}" alt="" loading="lazy">`.repeat(3)}</div>
      <button class="map-retry" hidden>지도 그림 다시 불러오기</button>
    </div>
    <dialog class="minimap-dialog" aria-label="전체 지도"><canvas></canvas><span class="minimap-view"></span></dialog>`;
  // 판 상자 밖과 미니맵 바다: 바다에 모르는 곳 안개를 덮은 색
  root.style.setProperty('--sea-fog', `color-mix(in srgb, ${PALETTE.fog} ${FOG_UNKNOWN * 100}%, ${PALETTE.sea})`);
  const heading = root.querySelector('h2');
  const canvas = root.querySelector('.map-canvas');
  const ctx = canvas.getContext('2d');
  const status = root.querySelector('[role="status"]');
  const minimap = root.querySelector('.minimap');
  const [miniCanvas, miniView] = minimap.children;
  const dialog = root.querySelector('dialog');
  const [bigCanvas, bigView] = dialog.children;
  const retry = root.querySelector('.map-retry');
  const hud = root.querySelector('.hud');
  const players = root.querySelector('.hud-players');
  const view = { w: 0, h: 0, left: 0, top: 0, dpr: 1 };
  const pointers = new Map();
  const fog = document.createElement('canvas');
  let board, sight, camera, bounds, paths, sprites, numbers, castles, shown, ports, tiles, selected, minZoom, mini, big, tap, glide;
  let pieces = []; // 판 위 건물·유닛(지금은 #map-demo의 보기용만)
  let seenPieces = []; // 그중 내가 볼 수 있는 것(그릴 자리와 그림 경로를 붙여 둠)
  let frame = 0;
  let renders = 0;
  let fogBuilds = 0;

  // 내 편(나와 팀전의 팀원)의 왕성은 늘 알고, 상대 왕성은 붙은 칸이 지금 보일 때만 안다.
  const castleKnown = player => board.starts[player].team === board.starts[0].team || pieceSeen(sight.state, board.starts[player].hexes);

  // 판이 바뀔 때 한 번만 경로와 그리는 순서를 만든다. 그릴 때는 종류별로 한 번씩 채우기만 한다.
  function prepare() {
    const land = new Set(board.tiles.map(({ q, r }) => `${q},${r}`));
    paths = { coast: new Path2D() };
    tiles = new Map();
    sprites = [];
    for (const tile of board.tiles) {
      const { x, y } = hexToPixel(tile.q, tile.r, TILE);
      // base: 안개 속에서도 보이는 바닥(풀밭·빈 땅·호수)
      const base = tile.type === 'lake' ? 'lake' : ON_BARREN.has(tile.type) ? 'barren' : 'grass';
      const ground = base === 'grass' ? GROUNDS[grassOf(tile.q, tile.r)] : base;
      const item = { ...tile, x, y, text: String(tile.number), base, ground, object: OBJECTS[tile.type] };
      tiles.set(`${tile.q},${tile.r}`, item);
      sprites.push(item);
      // 바다와 닿은 변. 아래쪽 두께까지 감싸도록 살짝 내려 그린다.
      EDGE_DIRS.forEach(([dq, dr], i) => {
        if (land.has(`${tile.q + dq},${tile.r + dr}`)) return;
        const [ax, ay] = CORNERS[i];
        const [bx, by] = CORNERS[(i + 1) % 6];
        paths.coast.moveTo(x + ax, y + ay + DEPTH / 2);
        paths.coast.lineTo(x + bx, y + by + DEPTH / 2);
      });
    }
    // 위쪽 줄부터 그려 아랫줄 타일이 윗줄의 두께를 덮게 한다. 오브젝트는 제 칸 윗면 안에만 있어 칸 바로 뒤에 그려도 된다.
    sprites.sort((a, b) => a.y - b.y || a.x - b.x);
    // 성은 세 칸이 만나는 꼭짓점에 놓는다.
    castles = board.starts.map(({ player, hexes }) => ({ player, ...vertexAt(hexes) }));
    // 교환소: 변의 두 꼭짓점(a, b), 변 가운데(mx, my), 칸 중심에서 바다 쪽으로 가는 방향(ox, oy)
    ports = board.ports.map(port => {
      const [a, b] = portSpots(port).map(vertexAt);
      const center = hexToPixel(port.q, port.r, TILE);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const length = Math.hypot(mx - center.x, my - center.y);
      const [give, get] = port.pair;
      return { ...port, a, b, mx, my, ox: (mx - center.x) / length, oy: (my - center.y) / length, text: `교환소: ${RESOURCE_NAMES[give]} ⇄ ${RESOURCE_NAMES[get]} (${PORT_RATE}:1)` };
    });
    // 바다를 포함한 판 상자(가로 cols × 세로 rows 칸)
    const half = TILE * Math.sqrt(3) / 2;
    bounds = { minX: -TILE, maxX: (board.cols - 1) * 1.5 * TILE + TILE, minY: -half, maxY: (board.rows - 0.5) * 2 * half + half + DEPTH };
    Object.assign(bounds, { w: bounds.maxX - bounds.minX, h: bounds.maxY - bounds.minY, cx: (bounds.minX + bounds.maxX) / 2, cy: (bounds.minY + bounds.maxY) / 2 });
  }

  // 시야가 바뀔 때만(지금은 판을 열 때, 나중에는 말이 움직일 때) 부른다. 칸 단계에 맞춰 숫자 패, 지형 색 경로(미니맵·대체 그림),
  // 보이는 성, 안개 그림을 다시 만든다. 모르는 칸은 오브젝트·숫자 없이 바닥 색만 쓴다.
  function applyVision() {
    paths.disc = new Path2D();
    paths.fill = {};
    paths.mist = { [UNKNOWN]: new Path2D(), [KNOWN]: new Path2D() };
    numbers = [];
    for (const tile of sprites) {
      tile.state = sight.state.get(`${tile.q},${tile.r}`);
      polygon(paths.fill[tile.state === UNKNOWN ? tile.base : tile.type] ??= new Path2D(), tile.x, tile.y, CORNERS);
      if (tile.state !== VISIBLE) polygon(paths.mist[tile.state], tile.x, tile.y, CORNERS);
      if (tile.number === null || tile.state === UNKNOWN) continue;
      paths.disc.moveTo(tile.x + DISC_R, tile.y + DISC_Y);
      paths.disc.arc(tile.x, tile.y + DISC_Y, DISC_R, 0, Math.PI * 2);
      numbers.push(tile);
    }
    shown = castles.filter(({ player }) => castleKnown(player));
    const myTeam = board.starts[0].team;
    seenPieces = pieces.filter(p => board.starts[p.player].team === myTeam || pieceSeen(sight.state, p.hexes)).map(p => ({
      ...p, path: `${p.kind === 'unit' ? 'tokens' : 'pieces'}/${p.id}`, anchor: bakedArt.pieces[`${p.id}@anchor`], ...(p.kind === 'unit' ? STATS[p.id] : {}),
    }));
    buildFog();
  }

  // 안개 그림(둘레 FOG_MARGIN을 더한 판 상자를 FOG_SCALE분의 1로 줄인 크기). 전체를 모르는 곳 짙기로 칠하고 아는 칸·보이는 칸 둘레를 흐리게 걷어 낸다.
  // 흐림은 ctx.filter(Safari 18 미만에 없음) 대신 그림자로 낸다. 원은 그림판 밖에 그리고 흐린 그림자만 제자리에서 지운다.
  // 아는 칸과 보이는 칸을 FOG_KNOWN까지 걷고, 보이는 칸을 마저 걷는다. 한 층은 경로 하나라 원이 겹쳐도 더 걷히지 않는다.
  function buildFog() {
    fogBuilds++;
    fog.width = Math.ceil((bounds.w + 2 * FOG_MARGIN) / FOG_SCALE);
    fog.height = Math.ceil((bounds.h + 2 * FOG_MARGIN) / FOG_SCALE);
    const away = fog.width * 2;
    const g = fog.getContext('2d');
    g.globalAlpha = FOG_UNKNOWN;
    g.fillStyle = PALETTE.fog;
    g.fillRect(0, 0, fog.width, fog.height);
    g.setTransform(1 / FOG_SCALE, 0, 0, 1 / FOG_SCALE, (FOG_MARGIN - bounds.minX) / FOG_SCALE - away, (FOG_MARGIN - bounds.minY) / FOG_SCALE);
    g.shadowOffsetX = away;
    g.shadowBlur = 2 * FOG_BLUR / FOG_SCALE; // 그림자 흐림 값은 σ의 2배
    g.shadowColor = '#000';
    g.globalCompositeOperation = 'destination-out';
    for (const [level, alpha] of [[KNOWN, 1 - FOG_KNOWN / FOG_UNKNOWN], [VISIBLE, 1]]) {
      const holes = new Path2D();
      for (const tile of sprites) {
        if (tile.state < level) continue;
        holes.moveTo(tile.x + FOG_REACH, tile.y);
        holes.arc(tile.x, tile.y, FOG_REACH, 0, Math.PI * 2);
      }
      g.globalAlpha = alpha;
      g.fill(holes);
    }
  }

  // 판 전체가 w×h 안에 여백을 두고 들어가는 배율과 위치
  function fit(w, h) {
    const s = Math.min(w * FIT / bounds.w, h * FIT / bounds.h);
    return { s, ox: w / 2 - bounds.cx * s, oy: h / 2 - bounds.cy * s };
  }

  // 지형 색 칸(모르는 칸은 바닥 색). 미니맵과, 그림이 없을 때의 판에 쓴다.
  function fillTerrain(g) {
    for (const [look, path] of Object.entries(paths.fill)) {
      g.fillStyle = PALETTE[look];
      g.fill(path);
    }
  }

  // 미니맵은 안개를 칸 모양 그대로 단순하게 덮는다. 바다는 바탕색(--sea-fog)이 이미 안개 낀 색이라 보이는 칸만 밝다. 상대 왕성은 보일 때만 찍는다.
  function drawMini(target) {
    const w = target.clientWidth;
    const h = target.clientHeight;
    const t = fit(w, h);
    target.width = Math.round(w * view.dpr);
    target.height = Math.round(h * view.dpr);
    const g = target.getContext('2d');
    g.setTransform(view.dpr * t.s, 0, 0, view.dpr * t.s, view.dpr * t.ox, view.dpr * t.oy);
    fillTerrain(g);
    g.fillStyle = PALETTE.fog;
    for (const [level, alpha] of [[UNKNOWN, FOG_UNKNOWN], [KNOWN, FOG_KNOWN]]) {
      g.globalAlpha = alpha;
      g.fill(paths.mist[level]);
    }
    g.globalAlpha = 1;
    castleDots(g, 4 / t.s);
    return t;
  }

  // 보이는 성 자리를 플레이어 색 점으로 찍는다. 미니맵과, 그림이 없을 때의 판에 쓴다.
  function castleDots(g, radius) {
    g.lineWidth = radius * 0.375;
    g.strokeStyle = PALETTE.outline;
    for (const { player, x, y } of shown) {
      g.beginPath();
      g.arc(x, y, radius, 0, Math.PI * 2);
      g.fillStyle = PALETTE.players[player];
      g.fill();
      g.stroke();
    }
  }

  // 미니맵 위 시야 사각형은 캔버스를 다시 그리지 않고 위치와 크기만 바꾼다.
  function placeView(element, t) {
    const w = view.w / camera.zoom;
    const h = view.h / camera.zoom;
    element.style.width = `${w * t.s}px`;
    element.style.height = `${h * t.s}px`;
    element.style.transform = `translate(${t.ox + (camera.x - w / 2) * t.s}px, ${t.oy + (camera.y - h / 2) * t.s}px)`;
  }

  function requestRender() {
    if (!root.hidden) frame ||= requestAnimationFrame(render);
  }

  function render() {
    frame = 0;
    const start = performance.now();
    if (glide) {
      // 끝에서 부드럽게 멈춘다(ease-out). 배율은 비율로 섞고, 목표점은 화면에서 곧게 가운데로 온다.
      const t = Math.min((start - glide.start) / GLIDE, 1);
      const eased = 1 - (1 - t) ** 3;
      const { from, to } = glide;
      camera.zoom = clamp(from.zoom * (to.zoom / from.zoom) ** eased, minZoom, MAX_ZOOM);
      const rest = (1 - eased) * from.zoom / camera.zoom;
      camera.x = to.x - (to.x - from.x) * rest;
      camera.y = to.y - (to.y - from.y) * rest;
      if (t < 1) requestRender();
      else glide = null;
    }
    const { dpr, w, h } = view;
    const { x: cx, y: cy, zoom } = camera;
    const k = dpr * zoom;
    const ox = dpr * w / 2 - cx * k;
    const oy = dpr * h / 2 - cy * k;
    // 안개 그림 자리(기기 px에 맞춘 사각형). 바다는 이 안에만 칠하고 밖은 바탕색(--sea-fog)이 보인다. 둘 다 같은 사각형이라 이음매가 없다.
    const fx = Math.round(ox + (bounds.minX - FOG_MARGIN) * k);
    const fy = Math.round(oy + (bounds.minY - FOG_MARGIN) * k);
    const fw = Math.round(ox + (bounds.minX - FOG_MARGIN + fog.width * FOG_SCALE) * k) - fx;
    const fh = Math.round(oy + (bounds.minY - FOG_MARGIN + fog.height * FOG_SCALE) * k) - fy;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = PALETTE.sea;
    ctx.fillRect(fx, fy, fw, fh);
    ctx.setTransform(k, 0, 0, k, ox, oy);
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.lineWidth = FOAM;
    ctx.strokeStyle = PALETTE.foam;
    ctx.stroke(paths.coast);
    // 화면 안(과 그림이 걸치는 가장자리)의 칸만 그린다.
    const reachX = w / 2 / zoom + REACH;
    const reachY = h / 2 / zoom + REACH;
    let drawn = 0;
    let objects = 0;
    let texts = 0;
    if (art) {
      // 오브젝트는 타일과 같은 비율로 줄인 그림이라 같은 단계를 쓴다. 전체 보기에서도 그대로 그린다.
      const level = levelOf(art.sprites['grass-1'], SPRITE * k);
      for (const tile of sprites) {
        if (Math.abs(tile.x - cx) > reachX || Math.abs(tile.y - cy) > reachY) continue;
        ctx.drawImage(art.sprites[tile.ground][level], tile.x - SPRITE_X, tile.y - SPRITE_Y, SPRITE, SPRITE);
        drawn++;
        if (!tile.object || tile.state === UNKNOWN) continue;
        ctx.drawImage(art.sprites[tile.object][level], tile.x - SPRITE_X, tile.y - SPRITE_Y, SPRITE, SPRITE);
        objects++;
      }
    } else {
      // 그림이 오기 전(또는 실패)에는 지형 색 칸으로 대신 그린다. 판이 비어 보이는 일이 없다.
      fillTerrain(ctx);
    }
    // 안개는 바닥·오브젝트 위, 교환소·선택·성·숫자 아래. 미리 만든 한 장을 판 크기로 늘려 붙인다(부드럽게 보간).
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(fog, fx, fy, fw, fh);
    ctx.setTransform(k, 0, 0, k, ox, oy);
    const signs = drawPorts(zoom, reachX, reachY);
    if (selected) {
      // 밝은 칸에서도 보이게 어두운 테두리를 먼저 깐다.
      const width = Math.max(7, 3 / zoom);
      ctx.lineWidth = width + 5;
      ctx.strokeStyle = PALETTE.selectEdge;
      ctx.stroke(selected);
      ctx.lineWidth = width;
      ctx.strokeStyle = PALETTE.select;
      ctx.stroke(selected);
    }
    // 제 크기 가까이에서는 숫자 패를 성 다음에 그린다. 성 가장자리가 이웃 칸 숫자 패에 걸쳐도 숫자는 늘 보인다.
    // 멀리서 크게 키운 성은 숫자 패(이때는 아주 작다) 위에 그린다.
    const size = castleSize(zoom, minZoom);
    const above = size > CASTLE * CASTLE_ABOVE;
    if (!above) drawCastles(size, k);
    if (TILE * zoom >= DETAIL) {
      ctx.fillStyle = PALETTE.disc;
      ctx.fill(paths.disc);
      ctx.lineWidth = 2;
      ctx.strokeStyle = PALETTE.discEdge;
      ctx.stroke(paths.disc);
      ctx.font = NUMBER_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const tile of numbers) {
        if (Math.abs(tile.x - cx) > reachX || Math.abs(tile.y - cy) > reachY) continue;
        ctx.fillStyle = tile.number === 6 || tile.number === 8 ? PALETTE.hot : PALETTE.number;
        ctx.fillText(tile.text, tile.x, tile.y + DISC_Y + 1);
        texts++;
      }
    }
    if (above) drawCastles(size, k);
    placeView(miniView, mini);
    // 시험용 수: 그린 타일·오브젝트·숫자·성·교환소 표지, 안개 그림을 만든 횟수
    performance.measure('map-render', { start, detail: { tiles: drawn, objects, numbers: texts, castles: shown.length, ports: signs, fog: fogBuilds } });
    if (++renders % 120 === 0) performance.clearMeasures('map-render');
  }

  // 성은 땅에 닿는 점을 꼭짓점에 두고 위로 커진다. size는 월드 단위, k는 월드 1단위의 기기 px.
  // 건물은 성과 같은 카메라·축척으로 구워 같은 폭으로 그리면 크기 비율이 그대로다. 멀리 볼 때 성과 같은 비율로 커진다.
  // 유닛 동전은 칸 가운데보다 조금 위. 아래(앞)에 있는 말이 위 말을 덮게 y 순서로 그린다.
  function drawCastles(size, k) {
    if (!art) return castleDots(ctx, size * 0.2);
    // 플레이어 색 받침과 외곽선은 그림에 구워져 있다(전체 보기에서도 그대로 찾기 쉽다).
    const w = size * CASTLE_W, h = w * CASTLE_RATIO;
    const level = levelOf(art.castles[0], w * k);
    const coin = Math.max(TOKEN_D, TOKEN_FAR / camera.zoom), tw = coin * TOKEN_SCALE;
    const items = [...shown.map(c => ({ ...c, kind: 'castle' })), ...seenPieces];
    items.sort((a, b) => a.y - b.y);
    for (const item of items) {
      if (item.kind === 'castle') { ctx.drawImage(art.castles[item.player][level], item.x - w * CASTLE_AX, item.y - h * CASTLE_AY, w, h); continue; }
      const levels = pieceImage(item.path, item.player, requestRender);
      if (!levels) continue;
      if (item.kind === 'building') {
        ctx.drawImage(levels[levelOf(levels, w * k)], item.x - w * item.anchor[0], item.y - h * item.anchor[1], w, h);
        continue;
      }
      const left = item.x - tw * TK.cx / 1024, top = item.y - TOKEN_UP - tw * TK.cy / 1024;
      ctx.drawImage(levels[levelOf(levels, tw * k)], left, top, tw, tw);
      // 체력·마나 숫자: 동전이 화면에서 44 CSS px 이상일 때만(작으면 읽히지 않고 그리기만 늘어난다)
      if (coin * camera.zoom < 44) continue;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      for (const [[x, y, r], value] of [[TK.hp, item.hp], [TK.mana, item.mana]]) {
        const px = left + tw * x / 1024, py = top + tw * y / 1024, fs = tw * r / 1024;
        ctx.font = `700 ${fs}px "Catfantagy UI", sans-serif`;
        ctx.lineWidth = fs * 0.22;
        ctx.strokeStyle = '#1f1712';
        ctx.strokeText(value, px, py + fs * 0.06);
        ctx.fillStyle = '#fff';
        ctx.fillText(value, px, py + fs * 0.06);
      }
    }
  }

  // 교환소: 부두(나무 판 + 널빤지 틈) → 자리 표시(가까이 볼 때만) → 표지(두 자원 아이콘과 ⇄). 처음부터 아는 칸이라 안개 위에 그린다.
  // 화면 안에 있는 표지 수를 돌려준다.
  function drawPorts(zoom, reachX, reachY) {
    const size = signSize(zoom);
    const { w, h } = size;
    const onScreen = ports.map(port => ({ port, ...signAt(port, size) }))
      .filter(({ x, y }) => Math.abs(x - camera.x) <= reachX + w && Math.abs(y - camera.y) <= reachY + w);
    if (!onScreen.length) return 0;
    if (art) {
      const level = levelOf(art.sprites.port, DOCK * view.dpr * zoom);
      for (const { port } of onScreen) {
        ctx.save();
        ctx.translate(port.mx, port.my);
        ctx.rotate(Math.atan2(port.ox, -port.oy));
        ctx.drawImage(art.sprites.port[level], -DOCK / 2, -DOCK * DOCK_FOOT, DOCK, DOCK);
        ctx.restore();
      }
    }
    if (TILE * zoom >= DETAIL) {
      const spots = new Path2D();
      for (const { port } of onScreen) for (const { x, y } of [port.a, port.b]) {
        spots.moveTo(x + SPOT, y);
        spots.arc(x, y, SPOT, 0, Math.PI * 2);
      }
      ctx.fillStyle = PALETTE.disc;
      ctx.fill(spots);
      ctx.lineWidth = 3;
      ctx.strokeStyle = PALETTE.outline;
      ctx.stroke(spots);
    }
    // 표지: 둥근 양끝 안에 아이콘, 가운데에 화살표
    const signs = new Path2D();
    for (const { x, y } of onScreen) {
      signs.moveTo(x + w / 2 - h / 2, y - h / 2);
      signs.arc(x + w / 2 - h / 2, y, h / 2, -Math.PI / 2, Math.PI / 2);
      signs.arc(x - w / 2 + h / 2, y, h / 2, Math.PI / 2, Math.PI * 1.5);
      signs.closePath();
    }
    ctx.fillStyle = PALETTE.disc;
    ctx.fill(signs);
    ctx.lineWidth = h * 0.07;
    ctx.strokeStyle = PALETTE.outline;
    ctx.stroke(signs);
    ctx.strokeStyle = PALETTE.number;
    for (const { port, x, y } of onScreen) {
      if (art) port.pair.forEach((type, i) => ctx.drawImage(art.icons[type], x + (i ? 1 : -1) * (w / 2 - h / 2) - h / 2, y - h / 2, h, h));
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(h, h);
      ctx.lineWidth = 0.08;
      ctx.stroke(ARROW);
      ctx.restore();
    }
    return onScreen.length;
  }

  // 월드 점 (x, y)에 있는 교환소(표지나 부두). 표지 크기가 배율에 따라 바뀌므로 그릴 때와 같은 계산을 쓴다.
  function portAt(x, y) {
    const size = signSize(camera.zoom);
    const pad = HIT / camera.zoom;
    return ports.find(port => {
      const sign = signAt(port, size);
      if (Math.abs(x - sign.x) <= size.w / 2 + pad && Math.abs(y - sign.y) <= size.h / 2 + pad) return true;
      // 부두: 변 가운데에서 표지 가운데까지의 선분과의 거리
      const dx = sign.x - port.mx;
      const dy = sign.y - port.my;
      const t = clamp(((x - port.mx) * dx + (y - port.my) * dy) / (dx * dx + dy * dy), 0, 1);
      return Math.hypot(x - port.mx - t * dx, y - port.my - t * dy) <= size.pier / 2 + pad;
    });
  }

  // 전체 보기(기본 배율보다 멀리)였다면 기본 배율까지 확대하고, 아니면 배율을 그대로 둔다. 판을 만지면 멈춘다(lookAt, pointerdown).
  function goToCastle(player) {
    const castle = castles.find(item => item.player === player);
    if (!castle) return;
    if (!castleKnown(player)) {
      status.textContent = `${PLAYERS[player].name}의 왕성은 아직 안개 속에 있어요`;
      return;
    }
    const zoom = Math.max(camera.zoom, NATURAL);
    if (!useReducedMotion()) {
      glide = { from: { ...camera }, to: { x: castle.x, y: castle.y, zoom }, start: performance.now() };
      return requestRender();
    }
    camera.zoom = zoom;
    lookAt(castle.x, castle.y);
  }

  function resize() {
    if (root.hidden) return;
    // 전체 보기였다면 화면을 돌려도 전체 보기를 유지한다. 시점 중심은 그대로 둔다.
    const fitted = camera.zoom <= minZoom * 1.001;
    view.dpr = Math.min(devicePixelRatio || 1, 2);
    const box = canvas.getBoundingClientRect();
    Object.assign(view, { w: box.width, h: box.height, left: box.left, top: box.top });
    canvas.width = Math.round(view.w * view.dpr);
    canvas.height = Math.round(view.h * view.dpr);
    minZoom = fit(view.w, view.h).s;
    camera.zoom = fitted ? minZoom : clamp(camera.zoom, minZoom, MAX_ZOOM);
    mini = drawMini(miniCanvas);
    requestRender();
  }

  // 화면의 (fx, fy) 아래 있던 월드 점을 (tx, ty)로 옮기며 factor만큼 확대한다. 끌기·핀치·휠이 함께 쓴다.
  function moveCamera(fx, fy, tx, ty, factor = 1) {
    const wx = camera.x + (fx - view.w / 2) / camera.zoom;
    const wy = camera.y + (fy - view.h / 2) / camera.zoom;
    camera.zoom = clamp(camera.zoom * factor, minZoom, MAX_ZOOM);
    lookAt(wx - (tx - view.w / 2) / camera.zoom, wy - (ty - view.h / 2) / camera.zoom);
  }

  // 판을 잃어버리지 않게 화면 가운데는 판 상자 안에만 둔다.
  function lookAt(x, y) {
    glide = null;
    camera.x = clamp(x, bounds.minX, bounds.maxX);
    camera.y = clamp(y, bounds.minY, bounds.maxY);
    requestRender();
  }

  // 교환소(표지·부두)를 먼저 본다. 교환소를 누르면 칸은 고르지 않는다. 안개 속 칸은 바닥만 알린다.
  function select(x, y) {
    const wx = camera.x + (x - view.w / 2) / camera.zoom;
    const wy = camera.y + (y - view.h / 2) / camera.zoom;
    const port = portAt(wx, wy);
    const { q, r } = pixelToHex(wx, wy, TILE);
    const tile = port ? null : tiles.get(`${q},${r}`);
    selected = null;
    if (tile) polygon(selected = new Path2D(), tile.x, tile.y, CORNERS);
    if (port) status.textContent = port.text;
    else if (!tile) status.textContent = '선택 해제';
    else if (tile.state === UNKNOWN) status.textContent = `선택: 안개 속 ${GROUND_NAMES[tile.base]}`;
    else status.textContent = `선택: ${TERRAIN[tile.type].name}${tile.number === null ? '' : ` ${tile.number}`}`;
    requestRender();
  }

  function showArt() {
    retry.hidden = true;
    root.dataset.art = art ? 'ready' : 'loading';
    if (art) return;
    loadMapArt().then(() => {
      root.dataset.art = 'ready';
      requestRender();
    }, error => {
      root.dataset.art = 'error';
      retry.hidden = false;
      console.error('지도 그림 로딩 실패', error);
    });
  }

  const point = event => ({ x: event.clientX - view.left, y: event.clientY - view.top });
  canvas.addEventListener('pointerdown', event => {
    glide = null;
    if (event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    const at = point(event);
    pointers.set(event.pointerId, at);
    tap = pointers.size === 1 ? { id: event.pointerId, ...at, time: event.timeStamp } : null;
  });
  // ponytail: 손을 떼면 바로 멈춘다. 관성 이동은 실제 기기에서 필요하다고 느낄 때 더한다.
  canvas.addEventListener('pointermove', event => {
    const last = pointers.get(event.pointerId);
    if (!last) return;
    const now = point(event);
    if (tap && Math.hypot(now.x - tap.x, now.y - tap.y) >= 8) tap = null;
    const [a, b] = pointers.values();
    if (pointers.size === 1) moveCamera(last.x, last.y, now.x, now.y);
    // 두 손가락: 이전 중점 아래 점을 새 중점으로 옮기고 거리 비율만큼 확대한다. 세 번째 손가락은 무시한다.
    else if (last === a || last === b) {
      const other = last === a ? b : a;
      const before = Math.hypot(last.x - other.x, last.y - other.y);
      moveCamera((last.x + other.x) / 2, (last.y + other.y) / 2, (now.x + other.x) / 2, (now.y + other.y) / 2, before ? Math.hypot(now.x - other.x, now.y - other.y) / before : 1);
    }
    // 각 손가락의 마지막 위치에서 이어 가므로 핀치 중 한 손가락을 떼도 화면이 튀지 않는다.
    Object.assign(last, now);
  });
  const release = event => {
    if (!pointers.delete(event.pointerId)) return;
    if (event.type === 'pointerup' && tap?.id === event.pointerId && event.timeStamp - tap.time < 350) select(tap.x, tap.y);
    tap = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    const { x, y } = point(event);
    moveCamera(x, y, x, y, Math.exp(-event.deltaY * (event.deltaMode === 1 ? 16 : 1) * 0.002));
  }, { passive: false });

  minimap.addEventListener('click', () => {
    dialog.showModal();
    big = drawMini(bigCanvas);
    placeView(bigView, big);
  });
  // 바깥(투명한 배경)을 누르면 dialog 자체가 눌린다. 지도 안을 누르면 그곳으로 시점을 옮긴다.
  dialog.addEventListener('click', event => {
    if (event.target === bigCanvas) lookAt((event.offsetX - big.ox) / big.s, (event.offsetY - big.oy) / big.s);
    dialog.close();
  });
  dialog.addEventListener('close', () => minimap.focus());
  players.addEventListener('click', event => {
    const button = event.target.closest('[data-player]');
    if (button) goToCastle(Number(button.dataset.player));
  });
  retry.addEventListener('click', showArt);
  root.querySelector('.mode-change').addEventListener('click', () => {
    root.hidden = true;
    onModes();
  });
  // 임시: 눈을 먼저 정하고 연출은 보여 주기만 한다. 연출하는 동안 버튼을 잠근다.
  // shortcut: Math.random이라 다시 만들 수 없다. 턴 규칙을 만들 때 판 시드로 이어지는 주사위로 바꾼다.
  const diceButton = root.querySelector('.dice-roll');
  diceButton.addEventListener('click', () => {
    const values = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
    const refocus = document.activeElement === diceButton;
    diceButton.disabled = true;
    status.textContent = `주사위 ${values[0]}, ${values[1]} · 합 ${values[0] + values[1]}`;
    rollDice(root, values, { reducedMotion: useReducedMotion() }).finished.then(() => {
      diceButton.disabled = false;
      // 잠그는 동안 키보드 초점이 빠졌다면 버튼으로 돌려준다.
      if (refocus && document.activeElement === document.body) diceButton.focus({ preventScroll: true });
    });
  });
  // 매크로 채팅. 말 목록이 열려 있을 때만 바깥 누름과 Esc를 들어, 닫혀 있을 땐 지도 끌기에 끼어들지 않는다.
  const toggle = root.querySelector('.chat-toggle');
  const list = root.querySelector('.chat-list');
  const onOutside = event => { if (!event.target.closest('.chat')) setChat(false); };
  const onKey = event => {
    if (event.key !== 'Escape') return;
    setChat(false);
    toggle.focus();
  };
  function setChat(open) {
    list.hidden = !open;
    toggle.setAttribute('aria-expanded', open);
    const listen = open ? 'addEventListener' : 'removeEventListener';
    document[listen]('pointerdown', onOutside);
    document[listen]('keydown', onKey);
  }

  // 그 플레이어 줄의 오른쪽(목록 판 바깥)에 꼬리를 줄 쪽으로 두고 띄운다. 가로는 재화 칸 앞까지만 늘고 넘치면 말줄임이다.
  // 온라인 상대와 봇도 같은 길을 쓴다: root.dispatchEvent(new CustomEvent('map:say', { detail: { player, text } }))
  function say(player, text) {
    const row = players.querySelector(`[data-player="${player}"]`);
    if (!row) return;
    hud.querySelector(`.bubble[data-player="${player}"]`)?.remove();
    const [at, panel, line, corner] = [hud, players, row, root.querySelector('.hud-corner')].map(element => element.getBoundingClientRect());
    const bubble = document.createElement('div');
    bubble.className = useReducedMotion() ? 'hud-panel bubble calm' : 'hud-panel bubble';
    bubble.dataset.player = player;
    bubble.style.cssText = `left: ${panel.right - at.left + BUBBLE_TAIL}px; top: ${line.top + line.height / 2 - at.top}px; max-width: ${Math.max(0, corner.left - panel.right - 2 * BUBBLE_TAIL)}px`;
    bubble.append(Object.assign(document.createElement('span'), { textContent: text }));
    bubble.setAttribute('aria-hidden', 'true'); // 읽어 주는 건 아래 알림이 맡는다
    hud.append(bubble);
    status.textContent = `${PLAYERS[player].name}: ${text}`;
    setTimeout(() => {
      bubble.classList.add('out');
      setTimeout(() => bubble.remove(), BUBBLE_FADE);
    }, BUBBLE_SHOW);
  }
  root.addEventListener('map:say', ({ detail }) => say(detail.player, detail.text));
  toggle.style.setProperty('--cooldown', `${CHAT_COOLDOWN}ms`);
  toggle.addEventListener('click', () => setChat(list.hidden));
  list.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    const refocus = list.contains(document.activeElement);
    setChat(false);
    say(0, button.textContent);
    toggle.disabled = true;
    setTimeout(() => {
      toggle.disabled = false;
      // 키보드로 보냈는데 그 사이 초점이 빠졌다면 단추로 돌려준다.
      if (refocus && document.activeElement === document.body) toggle.focus({ preventScroll: true });
    }, CHAT_COOLDOWN);
  });
  // 창 크기 이벤트가 아니라 그림판의 실제 크기 변화를 본다. iOS 홈 화면 앱의 높이 보정(main.js)보다 먼저 재는 일이 없다.
  new ResizeObserver(resize).observe(canvas);

  return function openMap(mode = 'duel', { demo = false } = {}) {
    board = createBoard({ mode });
    pieces = demo ? demoPieces(board) : [];
    // 지금은 나(0번)의 시야. 처음 상태라 아는 칸은 교환소와 숫자 6·8 칸뿐이다. 건물은 마을처럼 붙은 칸만, 유닛은 2칸을 본다.
    sight = vision(board, { pieces: [...boardPieces(board), ...pieces.map(p => ({ player: p.player, kind: p.kind === 'unit' ? 'unit' : 'village', hexes: p.hexes }))] });
    prepare();
    applyVision();
    root.dataset.seed = board.seed; // 시험이 같은 판을 다시 만들어 안개 결과와 맞춰 본다
    const [me, ...others] = PLAYERS.slice(0, board.starts.length);
    // 팀전은 0·1번이 한 팀이라 같은 팀(봇 1)을 먼저 보인다.
    const groups = mode === 'team' ? [['같은 팀', others.slice(0, 1)], ['상대 팀', others.slice(1)]] : [['상대', others]];
    hud.querySelectorAll('.bubble').forEach(bubble => bubble.remove());
    players.innerHTML = `
      ${playerButton(me, 0, 'strong')}
      ${groups.map(([label, list]) => `<p class="group-label" aria-hidden="true">${label}</p><ul class="opponents" aria-label="${label}">${list.map(player => `<li>${playerButton(player, PLAYERS.indexOf(player))}</li>`).join('')}</ul>`).join('')}`;
    heading.textContent = `냥국 지도 · ${MODES[mode].name}`;
    root.dataset.mode = mode;
    root.style.setProperty('--board-ratio', bounds.w / bounds.h);
    selected = null;
    glide = null;
    status.textContent = '';
    root.hidden = false;
    // zoom 0은 resize가 판 전체가 보이는 배율로 올린다.
    camera = { x: bounds.cx, y: bounds.cy, zoom: 0 };
    resize();
    if (demo) { const home = castles[0]; camera = { x: home.x, y: home.y + 40, zoom: 1 }; requestRender(); }
    showArt();
    heading.focus({ preventScroll: true });
    // 숫자 글꼴이 늦게 오면 한 번만 다시 그린다.
    document.fonts.load(NUMBER_FONT, '0123456789').then(requestRender);
  };
}
