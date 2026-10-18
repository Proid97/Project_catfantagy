import './map.css';
import { createBoard, TILE_TYPES, hexToPixel, pixelToHex, hexCorners } from './board.js';
import { CLASSES } from './setup.js';

const TILE = 100; // 칸 중심에서 꼭짓점까지(월드 단위)
const MAX_ZOOM = 1.4; // 칸 너비 280 CSS px
const FIT = 0.88; // 판 전체를 볼 때 양쪽에 6%씩 여백
const NUMBER_FONT = '700 34px "Catfantagy UI", sans-serif';
const DEFAULT_PLAYERS = [{ name: '나', classId: 'warrior' }, { name: '봇', classId: 'mage' }];
// 임시: 아트 타일이 오기 전까지 쓰는 색. 사용자가 어두운 화면을 싫어해 밝고 대비 크게 고른다.
const PALETTE = {
  gold: { base: '#cfae6e', facet: '#e3ca94', ink: '#74541d' },
  crystal: { base: '#b9a4ea', facet: '#d6caf6', ink: '#56408f' },
  wood: { base: '#5daa57', facet: '#83c67a', ink: '#285a27' },
  fish: { base: '#72cdf2', facet: '#a8e2f9', ink: '#17668f' },
  barren: { base: '#e8d6a6', facet: '#f3e6c3' },
  rim: 'rgba(255, 255, 255, .5)',
  disk: '#fff6df',
  diskEdge: 'rgba(70, 48, 20, .3)',
  number: '#3b2b1b',
  select: '#ffda63',
  selectEdge: 'rgba(40, 28, 8, .55)',
};
// 칸 종류 표시(월드 단위 다각형). 지도와 자원 칸이 같은 모양을 쓴다.
const GLYPHS = {
  gold: [[[-17, 9], [-12, -7], [0, -13], [14, -7], [17, 9]]],
  crystal: [[[-4, -18], [5, -4], [-4, 17], [-13, -4]], [[10, -8], [17, 3], [10, 14], [4, 3]]],
  wood: [[[0, -18], [16, 8], [-16, 8]], [[-4, 8], [4, 8], [4, 17], [-4, 17]]],
  fish: [[[-18, 0], [-3, -10], [10, 0], [-3, 10]], [[8, 0], [18, -9], [18, 9]]],
};
const RESOURCES = [['gold', '금'], ['crystal', '수정'], ['wood', '나무'], ['fish', '물고기']];
// 칸 사이로 바다가 가늘게 보이게 3% 안쪽으로 그린다.
const CORNERS = hexCorners(0, 0, TILE * 0.97);
const RIM = hexCorners(0, 0, TILE * 0.95);
const FACET = [[0, 0], CORNERS[3], CORNERS[4], CORNERS[5]]; // 왼쪽 위에서 오는 빛을 받는 면

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function polygon(path, x, y, points) {
  points.forEach(([px, py], i) => (i ? path.lineTo(x + px, y + py) : path.moveTo(x + px, y + py)));
  path.closePath();
}

const icon = type => `<svg viewBox="-20 -20 40 40" aria-hidden="true" fill="${PALETTE[type].base}" stroke="${PALETTE[type].ink}" stroke-width="2.5" stroke-linejoin="round">${GLYPHS[type].map(points => `<polygon points="${points.join(' ')}"/>`).join('')}</svg>`;
const avatar = classId => `<span class="avatar ${classId}" aria-hidden="true">${CLASSES[classId].name[1]}</span>`;

export function mapScreen(root) {
  root.innerHTML = `
    <h2 id="map-title" class="sr-only" tabindex="-1">냥국 지도</h2>
    <canvas class="map-canvas"></canvas>
    <p class="sr-only" role="status"></p>
    <div class="hud">
      <div class="hud-panel hud-players"></div>
      <ul class="hud-panel hud-resources" aria-label="보유 자원">${RESOURCES.map(([type, name]) => `<li>${icon(type)}<span class="sr-only">${name}</span><span>0</span></li>`).join('')}</ul>
      <button class="minimap" aria-label="미니맵 크게 보기"><canvas></canvas><span class="minimap-view"></span></button>
      <div class="hand" role="img" aria-label="내 카드 3장"><span></span><span></span><span></span></div>
    </div>
    <dialog class="minimap-dialog" aria-label="전체 지도"><canvas></canvas><span class="minimap-view"></span></dialog>`;
  const canvas = root.querySelector('.map-canvas');
  const ctx = canvas.getContext('2d');
  const status = root.querySelector('[role="status"]');
  const minimap = root.querySelector('.minimap');
  const [miniCanvas, miniView] = minimap.children;
  const dialog = root.querySelector('dialog');
  const [bigCanvas, bigView] = dialog.children;
  const view = { w: 0, h: 0, left: 0, top: 0, dpr: 1 };
  const pointers = new Map();
  let camera, bounds, paths, numbers, tiles, selected, minZoom, mini, big, tap;
  let frame = 0;
  let renders = 0;

  // 판이 바뀔 때 한 번만 경로를 만든다. 그릴 때는 종류별로 한 번씩 채우기만 한다.
  function prepare(board) {
    paths = { rim: new Path2D(), disk: new Path2D() };
    for (const type of Object.keys(TILE_TYPES)) paths[type] = { base: new Path2D(), facet: new Path2D(), glyph: new Path2D() };
    numbers = [];
    tiles = new Map();
    const xs = [];
    const ys = [];
    for (const tile of board.tiles) {
      const { x, y } = hexToPixel(tile.q, tile.r, TILE);
      const path = paths[tile.type];
      tiles.set(`${tile.q},${tile.r}`, { ...tile, x, y });
      xs.push(x);
      ys.push(y);
      polygon(path.base, x, y, CORNERS);
      polygon(path.facet, x, y, FACET);
      polygon(paths.rim, x, y, RIM);
      if (tile.number === null) continue;
      paths.disk.moveTo(x + TILE * 0.32, y);
      paths.disk.arc(x, y, TILE * 0.32, 0, Math.PI * 2);
      for (const points of GLYPHS[tile.type]) polygon(path.glyph, x, y - 58, points);
      numbers.push({ text: String(tile.number), x, y });
    }
    const half = TILE * Math.sqrt(3) / 2;
    bounds = { minX: Math.min(...xs) - TILE, maxX: Math.max(...xs) + TILE, minY: Math.min(...ys) - half, maxY: Math.max(...ys) + half };
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
    for (const type of Object.keys(TILE_TYPES)) {
      g.fillStyle = PALETTE[type].base;
      g.fill(paths[type].base);
    }
    return t;
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
    frame ||= requestAnimationFrame(render);
  }

  // ponytail: 61칸이라 화면 밖 칸도 다 그린다. 큰 판을 쓰면 보이는 칸만 고르는 컬링을 더한다.
  function render() {
    frame = 0;
    performance.mark('map-render-start');
    const { dpr } = view;
    const k = dpr * camera.zoom;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(k, 0, 0, k, dpr * (view.w / 2 - camera.x * camera.zoom), dpr * (view.h / 2 - camera.y * camera.zoom));
    for (const type of Object.keys(TILE_TYPES)) {
      ctx.fillStyle = PALETTE[type].base;
      ctx.fill(paths[type].base);
      ctx.fillStyle = PALETTE[type].facet;
      ctx.fill(paths[type].facet);
    }
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = PALETTE.rim;
    ctx.stroke(paths.rim);
    ctx.fillStyle = PALETTE.disk;
    ctx.fill(paths.disk);
    ctx.lineWidth = 2;
    ctx.strokeStyle = PALETTE.diskEdge;
    ctx.stroke(paths.disk);
    for (const type of Object.keys(GLYPHS)) {
      ctx.fillStyle = PALETTE[type].ink;
      ctx.fill(paths[type].glyph);
    }
    ctx.fillStyle = PALETTE.number;
    ctx.font = NUMBER_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const { text, x, y } of numbers) ctx.fillText(text, x, y + 2);
    if (selected) {
      // 모래색 칸에서도 보이게 어두운 테두리를 먼저 깐다.
      const width = Math.max(7, 3 / camera.zoom);
      ctx.lineWidth = width + 5;
      ctx.strokeStyle = PALETTE.selectEdge;
      ctx.stroke(selected);
      ctx.lineWidth = width;
      ctx.strokeStyle = PALETTE.select;
      ctx.stroke(selected);
    }
    placeView(miniView, mini);
    performance.measure('map-render', 'map-render-start');
    performance.clearMarks('map-render-start');
    if (++renders % 120 === 0) performance.clearMeasures('map-render');
  }

  function resize() {
    if (root.hidden) return;
    view.dpr = Math.min(devicePixelRatio || 1, 2);
    const box = canvas.getBoundingClientRect();
    Object.assign(view, { w: box.width, h: box.height, left: box.left, top: box.top });
    canvas.width = Math.round(view.w * view.dpr);
    canvas.height = Math.round(view.h * view.dpr);
    minZoom = fit(view.w, view.h).s;
    camera.zoom = clamp(camera.zoom, minZoom, MAX_ZOOM);
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

  // 판을 잃어버리지 않게 화면 가운데는 판의 테두리 상자 안에만 둔다.
  function lookAt(x, y) {
    camera.x = clamp(x, bounds.minX, bounds.maxX);
    camera.y = clamp(y, bounds.minY, bounds.maxY);
    requestRender();
  }

  function select(x, y) {
    const { q, r } = pixelToHex(camera.x + (x - view.w / 2) / camera.zoom, camera.y + (y - view.h / 2) / camera.zoom, TILE);
    const tile = tiles.get(`${q},${r}`);
    selected = null;
    if (tile) polygon(selected = new Path2D(), tile.x, tile.y, CORNERS);
    status.textContent = tile ? `선택: ${TILE_TYPES[tile.type].name}${tile.number === null ? '' : ` ${tile.number}`}` : '선택 해제';
    requestRender();
  }

  const point = event => ({ x: event.clientX - view.left, y: event.clientY - view.top });
  canvas.addEventListener('pointerdown', event => {
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
  // 창 크기 이벤트가 아니라 그림판의 실제 크기 변화를 본다. iOS 홈 화면 앱의 높이 보정(main.js)보다 먼저 재는 일이 없다.
  new ResizeObserver(resize).observe(canvas);

  return function openMap({ players = DEFAULT_PLAYERS } = {}) {
    prepare(createBoard());
    const [me, ...others] = players;
    root.querySelector('.hud-players').innerHTML = `
      <p class="player">${avatar(me.classId)}<strong>${me.name}</strong><span class="sr-only">${CLASSES[me.classId].name}</span></p>
      <ul class="opponents" aria-label="상대">${others.map(player => `<li class="player">${avatar(player.classId)}<span>${player.name}</span><span class="sr-only">${CLASSES[player.classId].name}</span><span class="opponent-dice" hidden></span></li>`).join('')}</ul>`;
    dialog.style.aspectRatio = `${bounds.w} / ${bounds.h}`;
    selected = null;
    status.textContent = '';
    root.hidden = false;
    // zoom 0은 resize가 판 전체가 보이는 배율로 올린다.
    camera = { x: bounds.cx, y: bounds.cy, zoom: 0 };
    resize();
    root.querySelector('h2').focus({ preventScroll: true });
    // 숫자 글꼴이 늦게 오면 한 번만 다시 그린다.
    document.fonts.load(NUMBER_FONT, '0123456789').then(requestRender);
  };
}
