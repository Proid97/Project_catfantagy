import './map.css';
import { MODES, TERRAIN, createBoard, hexToPixel, pixelToHex, hexCorners } from './board.js';
import { files, objectBox } from './generated/map-art.json';

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
// 지형 오브젝트(칸 종류 → 그림). 타일과 같은 캔버스에서 잘라 낸 상자(objectBox: x, y, 너비, 높이)라 그 자리에 그린다.
const OBJECTS = { forest: 'forest', gold: 'gold-mine', crystal: 'crystal', rock: 'rock' };
const OBJECT_X = (objectBox[0] - 511.5) * UNIT;
const OBJECT_Y = (objectBox[1] - 477.5) * UNIT;
const OBJECT_W = objectBox[2] * UNIT;
const OBJECT_H = objectBox[3] * UNIT;
const TYPES = Object.keys(TERRAIN);
const DISC_Y = 0.40 * TILE; // 숫자 패: 칸 아래쪽 가운데. 오브젝트 그림은 위쪽을 쓴다.
const DISC_R = 0.26 * TILE;
// 성 그림(원본 512px)을 그리는 크기(월드 단위). 보이는 성의 폭은 약 82로 칸 폭의 41%.
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
const CASTLE_BASE = 0.26; // 전체 보기에서 성 아래 플레이어 색 받침의 반지름(성 그림 크기에 대한 비율)
const CASTLE_FOOT = 420 / 512; // 땅에 닿는 점(원본 256, 420)을 꼭짓점에 둔다
const GLIDE = 300; // 왕성으로 가는 시점 이동 시간(ms)
const FOAM = 26; // 해안 거품 굵기. 절반은 육지 그림에 덮인다
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
  foam: 'rgba(255, 255, 255, .6)',
  disc: '#fff6df',
  discEdge: 'rgba(70, 48, 20, .35)',
  number: '#3b2b1b',
  hot: '#c8372d', // 6과 8: 자주 나오는 숫자
  castleEdge: '#2b2014',
  select: '#ffda63',
  selectEdge: 'rgba(40, 28, 8, .55)',
  players: ['#f2b33d', '#3f7fe0', '#e0524a', '#9a5ad6'], // 나(따뜻한 금색), 파랑, 빨강, 보라. 성 지붕·깃발에 곱한다
};
const RESOURCES = [['gold', '금'], ['crystal', '수정'], ['wood', '나무'], ['fish', '생선']];
const CORNERS = hexCorners(0, 0, TILE);
// 꼭짓점 i와 i+1 사이 변 너머의 이웃
const EDGE_DIRS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
// ponytail: 지금은 모든 왕성 자리를 안다. 안개가 생기면 본 적 있는 왕성만 참이 되게 여기만 바꾼다.
const castleKnown = player => true;

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

// 같은 칸은 늘 같은 풀밭 그림. 이웃끼리 줄무늬가 생기지 않게 좌표를 섞는다.
function grassOf(q, r) {
  let h = Math.imul(q, 374761393) + Math.imul(r, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) % 3;
}

// 내용 해시를 붙인 주소. 그림이 바뀌면 주소도 바뀌어 예전 그림이 캐시에 남지 않는다.
const source = path => `${import.meta.env.BASE_URL}${path}.webp?v=${files[path]}`;

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

// 플레이어 성: 회색 마스크(지붕·깃발)에 플레이어 색을 곱하고 마스크 모양만 남긴 뒤, 그 아래에 기본 성을 깐다.
function tintCastle(castle, team, color) {
  const canvas = document.createElement('canvas');
  canvas.width = castle.width;
  canvas.height = castle.height;
  const g = canvas.getContext('2d');
  g.drawImage(team, 0, 0);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = color;
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(team, 0, 0);
  g.globalCompositeOperation = 'destination-over';
  g.drawImage(castle, 0, 0);
  return mips(canvas);
}

// 바닥 타일·호수·지형 오브젝트·성을 한 번에 받는다. 하나라도 실패하면 지형 색 칸으로 그리고, 다시 부르면 처음부터 받는다.
let art = null;
let artLoad = null;
export function loadMapArt() {
  const names = [...GROUNDS, ...Object.values(OBJECTS)];
  artLoad ??= Promise.all([...names.map(name => `map/${name}`), 'game/castle', 'game/castle-team'].map(decode)).then(images => {
    const [castle, team] = images.splice(-2);
    art = {
      sprites: Object.fromEntries(names.map((name, i) => [name, mips(images[i])])),
      castles: PALETTE.players.map(color => tintCastle(castle, team, color)),
    };
  }, error => { artLoad = null; throw error; });
  return artLoad;
}

const avatar = (player, index) => `<span class="avatar ${player.classId}" style="--player: ${PALETTE.players[index]}" aria-hidden="true">${CLASS_NAMES[player.classId][1]}</span>`;
// 누르면 그 플레이어의 왕성으로 시점이 간다. 종족 이름은 버튼 밖에 둬 버튼 이름은 할 일만 말한다.
const playerButton = (player, index, tag = 'span') => `<button class="player" data-player="${index}" aria-label="${index ? `${player.name}의` : '내'} 왕성으로 이동">${avatar(player, index)}<${tag}>${player.name}</${tag}></button><span class="sr-only">${CLASS_NAMES[player.classId]}</span>`;

export function mapScreen(root, onModes) {
  // HUD 그림은 loading="lazy"라 지도 화면이 보일 때 받는다. 타이틀 첫 로딩과 겹치지 않는다.
  root.innerHTML = `
    <h2 id="map-title" class="sr-only" tabindex="-1">냥국 지도</h2>
    <canvas class="map-canvas"></canvas>
    <p class="sr-only" role="status"></p>
    <div class="hud">
      <div class="hud-panel hud-players"></div>
      <ul class="hud-panel hud-resources" aria-label="보유 자원">${RESOURCES.map(([type, name]) => `<li><img src="${source(`game/icon-${type}`)}" alt="" loading="lazy"><span class="sr-only">${name}</span><span>0</span></li>`).join('')}</ul>
      <button class="minimap" aria-label="미니맵 크게 보기"><canvas></canvas><span class="minimap-view"></span></button>
      <button class="mode-change"><small>임시</small>모드 바꾸기</button>
      <div class="hand" role="img" aria-label="내 카드 3장">${`<img src="${source('game/card-back')}" alt="" loading="lazy">`.repeat(3)}</div>
      <button class="map-retry" hidden>지도 그림 다시 불러오기</button>
    </div>
    <dialog class="minimap-dialog" aria-label="전체 지도"><canvas></canvas><span class="minimap-view"></span></dialog>`;
  const heading = root.querySelector('h2');
  const canvas = root.querySelector('.map-canvas');
  const ctx = canvas.getContext('2d');
  const status = root.querySelector('[role="status"]');
  const minimap = root.querySelector('.minimap');
  const [miniCanvas, miniView] = minimap.children;
  const dialog = root.querySelector('dialog');
  const [bigCanvas, bigView] = dialog.children;
  const retry = root.querySelector('.map-retry');
  const view = { w: 0, h: 0, left: 0, top: 0, dpr: 1 };
  const pointers = new Map();
  let camera, bounds, paths, sprites, numbers, castles, tiles, selected, minZoom, mini, big, tap, glide;
  let frame = 0;
  let renders = 0;

  // 판이 바뀔 때 한 번만 경로와 그리는 순서를 만든다. 그릴 때는 종류별로 한 번씩 채우기만 한다.
  function prepare(board) {
    const land = new Set(board.tiles.map(({ q, r }) => `${q},${r}`));
    paths = { coast: new Path2D(), disc: new Path2D() };
    for (const type of TYPES) paths[type] = new Path2D();
    tiles = new Map();
    sprites = [];
    numbers = [];
    for (const tile of board.tiles) {
      const { x, y } = hexToPixel(tile.q, tile.r, TILE);
      const ground = tile.type === 'lake' ? 'lake' : ON_BARREN.has(tile.type) ? 'barren' : GROUNDS[grassOf(tile.q, tile.r)];
      const item = { ...tile, x, y, text: String(tile.number), ground, object: OBJECTS[tile.type] };
      tiles.set(`${tile.q},${tile.r}`, item);
      sprites.push(item);
      polygon(paths[tile.type], x, y, CORNERS);
      // 바다와 닿은 변. 아래쪽 두께까지 감싸도록 살짝 내려 그린다.
      EDGE_DIRS.forEach(([dq, dr], i) => {
        if (land.has(`${tile.q + dq},${tile.r + dr}`)) return;
        const [ax, ay] = CORNERS[i];
        const [bx, by] = CORNERS[(i + 1) % 6];
        paths.coast.moveTo(x + ax, y + ay + DEPTH / 2);
        paths.coast.lineTo(x + bx, y + by + DEPTH / 2);
      });
      if (tile.number === null) continue;
      paths.disc.moveTo(x + DISC_R, y + DISC_Y);
      paths.disc.arc(x, y + DISC_Y, DISC_R, 0, Math.PI * 2);
      numbers.push(item);
    }
    // 위쪽 줄부터 그려 아랫줄 타일이 윗줄의 두께를 덮게 한다. 오브젝트는 제 칸 윗면 안에만 있어 칸 바로 뒤에 그려도 된다.
    sprites.sort((a, b) => a.y - b.y || a.x - b.x);
    // 성은 세 칸이 만나는 꼭짓점, 곧 세 칸 중심의 평균에 놓는다.
    castles = board.starts.map(({ player, hexes }) => {
      const points = hexes.map(({ q, r }) => hexToPixel(q, r, TILE));
      return { player, x: points.reduce((sum, p) => sum + p.x, 0) / 3, y: points.reduce((sum, p) => sum + p.y, 0) / 3 };
    });
    // 바다를 포함한 판 상자(가로 cols × 세로 rows 칸)
    const half = TILE * Math.sqrt(3) / 2;
    bounds = { minX: -TILE, maxX: (board.cols - 1) * 1.5 * TILE + TILE, minY: -half, maxY: (board.rows - 0.5) * 2 * half + half + DEPTH };
    Object.assign(bounds, { w: bounds.maxX - bounds.minX, h: bounds.maxY - bounds.minY, cx: (bounds.minX + bounds.maxX) / 2, cy: (bounds.minY + bounds.maxY) / 2 });
  }

  // 판 전체가 w×h 안에 여백을 두고 들어가는 배율과 위치
  function fit(w, h) {
    const s = Math.min(w * FIT / bounds.w, h * FIT / bounds.h);
    return { s, ox: w / 2 - bounds.cx * s, oy: h / 2 - bounds.cy * s };
  }

  function drawMini(target) {
    const w = target.clientWidth;
    const h = target.clientHeight;
    const t = fit(w, h);
    target.width = Math.round(w * view.dpr);
    target.height = Math.round(h * view.dpr);
    const g = target.getContext('2d');
    g.setTransform(view.dpr * t.s, 0, 0, view.dpr * t.s, view.dpr * t.ox, view.dpr * t.oy);
    for (const type of TYPES) {
      g.fillStyle = PALETTE[type];
      g.fill(paths[type]);
    }
    castleDots(g, 4 / t.s);
    return t;
  }

  // 성 자리를 플레이어 색 점으로 찍는다. 미니맵과, 그림이 없을 때의 판에 쓴다.
  function castleDots(g, radius) {
    g.lineWidth = radius * 0.375;
    g.strokeStyle = PALETTE.castleEdge;
    for (const { player, x, y } of castles) {
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
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
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
    if (art) {
      // 오브젝트는 타일과 같은 비율로 줄인 그림이라 같은 단계를 쓴다. 전체 보기에서도 그대로 그린다.
      const level = levelOf(art.sprites['grass-1'], SPRITE * k);
      for (const tile of sprites) {
        if (Math.abs(tile.x - cx) > reachX || Math.abs(tile.y - cy) > reachY) continue;
        ctx.drawImage(art.sprites[tile.ground][level], tile.x - SPRITE_X, tile.y - SPRITE_Y, SPRITE, SPRITE);
        drawn++;
        if (!tile.object) continue;
        ctx.drawImage(art.sprites[tile.object][level], tile.x + OBJECT_X, tile.y + OBJECT_Y, OBJECT_W, OBJECT_H);
        objects++;
      }
    } else {
      // 그림이 오기 전(또는 실패)에는 지형 색 칸으로 대신 그린다. 판이 비어 보이는 일이 없다.
      for (const type of TYPES) {
        ctx.fillStyle = PALETTE[type];
        ctx.fill(paths[type]);
      }
    }
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
      }
    }
    if (above) drawCastles(size, k);
    placeView(miniView, mini);
    performance.measure('map-render', { start, detail: { tiles: drawn, objects } });
    if (++renders % 120 === 0) performance.clearMeasures('map-render');
  }

  // 성은 땅에 닿는 점을 꼭짓점에 두고 위로 커진다. size는 월드 단위, k는 월드 1단위의 기기 px.
  function drawCastles(size, k) {
    if (!art) return castleDots(ctx, size * 0.2);
    // 전체 보기에서는 지붕 색만으로 찾기 어려워 성 아래에 플레이어 색 받침을 깐다.
    if (TILE * camera.zoom < DETAIL) castleDots(ctx, size * CASTLE_BASE);
    const level = levelOf(art.castles[0], size * k);
    for (const { player, x, y } of castles) ctx.drawImage(art.castles[player][level], x - size / 2, y - size * CASTLE_FOOT, size, size);
  }

  // 전체 보기(기본 배율보다 멀리)였다면 기본 배율까지 확대하고, 아니면 배율을 그대로 둔다. 판을 만지면 멈춘다(lookAt, pointerdown).
  function goToCastle(player) {
    const castle = castles.find(item => item.player === player);
    if (!castle || !castleKnown(player)) return;
    const zoom = Math.max(camera.zoom, NATURAL);
    if (!reduceMotion.matches) {
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

  function select(x, y) {
    const { q, r } = pixelToHex(camera.x + (x - view.w / 2) / camera.zoom, camera.y + (y - view.h / 2) / camera.zoom, TILE);
    const tile = tiles.get(`${q},${r}`);
    selected = null;
    if (tile) polygon(selected = new Path2D(), tile.x, tile.y, CORNERS);
    status.textContent = tile ? `선택: ${TERRAIN[tile.type].name}${tile.number === null ? '' : ` ${tile.number}`}` : '선택 해제';
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
  root.querySelector('.hud-players').addEventListener('click', event => {
    const button = event.target.closest('[data-player]');
    if (button) goToCastle(Number(button.dataset.player));
  });
  retry.addEventListener('click', showArt);
  root.querySelector('.mode-change').addEventListener('click', () => {
    root.hidden = true;
    onModes();
  });
  // 창 크기 이벤트가 아니라 그림판의 실제 크기 변화를 본다. iOS 홈 화면 앱의 높이 보정(main.js)보다 먼저 재는 일이 없다.
  new ResizeObserver(resize).observe(canvas);

  return function openMap(mode = 'duel') {
    const board = createBoard({ mode });
    prepare(board);
    const [me, ...others] = PLAYERS.slice(0, board.starts.length);
    // 팀전은 0·1번이 한 팀이라 같은 팀(봇 1)을 먼저 보인다.
    const groups = mode === 'team' ? [['같은 팀', others.slice(0, 1)], ['상대 팀', others.slice(1)]] : [['상대', others]];
    root.querySelector('.hud-players').innerHTML = `
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
    showArt();
    heading.focus({ preventScroll: true });
    // 숫자 글꼴이 늦게 오면 한 번만 다시 그린다.
    document.fonts.load(NUMBER_FONT, '0123456789').then(requestRender);
  };
}
