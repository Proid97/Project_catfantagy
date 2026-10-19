import { test, expect } from '@playwright/test';
import { TERRAIN, createBoard, hexToPixel, hexDistance, portSpots } from '../src/board.js';
import { UNKNOWN, vision } from '../src/vision.js';

const names = ['풀밭', '숲', '호수', '금광', '수정산', '바위산'];
const COLORS = { me: [242, 179, 61], blue: [63, 127, 224], red: [224, 82, 74], purple: [154, 90, 214] }; // 플레이어 색(나, 봇 1~3)
const RESOURCE_NAMES = { gold: '금', crystal: '수정', wood: '나무', fish: '생선' };
const HUD = ['.hud-players', '.hud-resources', '.minimap', '.mode-change', '.dice-roll', '.hand'];
const view = page => page.locator('.minimap .minimap-view');
const box = locator => locator.boundingBox();
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
// 지도 그림과 글꼴이 온 뒤 다시 그린 것까지 끝나기를 기다린다.
async function settled(page) {
  await expect(page.locator('#map')).toHaveAttribute('data-art', 'ready');
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
}
async function open(page, hash = '#map') {
  await page.goto(`/${hash}`);
  await expect(page.locator('.map-canvas')).toBeVisible();
  await settled(page);
}
async function center(page) {
  const area = await box(page.locator('.map-canvas'));
  return [area.x + area.width / 2, area.y + area.height / 2];
}
// 가운데 근처에서 육지 칸이 잡힐 때까지 누른다. 대륙 모양이 판마다 달라 가운데가 바다일 수도 있다.
async function tapLand(page) {
  const [x, y] = await center(page);
  const status = page.locator('#map [role="status"]');
  for (const [dx, dy] of [[0, 0], [30, 0], [-30, 0], [0, 30], [0, -30], [60, 40], [-60, -40]]) {
    await page.mouse.click(x + dx, y + dy);
    if ((await status.textContent()).startsWith('선택: ')) return status.textContent();
  }
  throw new Error('육지 칸을 찾지 못함');
}
// 지금 화면의 판을 같은 시드로 다시 만들고 나(0번)의 시야를 계산한다. 화면과 같은 규칙 모듈을 쓴다.
async function boardOf(page) {
  const [mode, seed] = await page.locator('#map').evaluate(root => [root.dataset.mode, Number(root.dataset.seed)]);
  const board = createBoard({ mode, seed });
  return { board, state: vision(board).state };
}
const lastRender = page => page.evaluate(() => performance.getEntriesByName('map-render').at(-1).detail);
// src/map-screen.js와 같은 값: 칸 반지름 TILE, 전체 보기 여백 FIT. 전체 보기에서 월드 점(TILE 단위 좌표)의 화면 위치.
const TILE = 100;
const FIT = 0.96;
async function fitPoint(page, board, { x, y }) {
  const area = await box(page.locator('.map-canvas'));
  const ratio = await page.locator('#map').evaluate(root => Number(root.style.getPropertyValue('--board-ratio')));
  const w = (board.cols - 1) * 1.5 * TILE + 2 * TILE;
  const h = w / ratio;
  const s = Math.min(area.width * FIT / w, area.height * FIT / h);
  return { x: area.x + area.width / 2 + (x + TILE - w / 2) * s, y: area.y + area.height / 2 + (y + TILE * Math.sqrt(3) / 2 - h / 2) * s };
}
const tilePoint = (page, board, { q, r }) => fitPoint(page, board, hexToPixel(q, r, TILE));
// 그 화면 점을 누르면 지도에 닿는지(HUD에 가려지지 않는지)
const onMap = (page, { x, y }) => page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.classList.contains('map-canvas'), [x, y]);
// 그림판에서 플레이어 색과 똑같은 점의 수
const colorCount = (locator, rgb) => locator.evaluate((canvas, [r, g, b]) => {
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  let count = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i] === r && data[i + 1] === g && data[i + 2] === b) count++;
  return count;
}, rgb);
// 시점 이동(300ms)이 끝나고 다시 그리기도 멈출 때까지 기다린다.
async function glided(page) {
  await page.waitForTimeout(400);
  await settled(page);
}
// src/map-screen.js의 기본 배율 NATURAL과 같은 값. 이 배율부터 성은 120 월드 단위다.
const NATURAL = 0.7;
// 지도 그림판의 마지막 한 번 그리기에서 그림과 숫자를 그린 순서(drawOrder)와 그림 크기(drawSizes: [높이(월드 단위), 월드 1단위의 기기 px]).
function recordDraws() {
  const proto = CanvasRenderingContext2D.prototype;
  window.drawOrder = [];
  window.drawSizes = [];
  for (const name of ['clearRect', 'drawImage', 'fillText']) {
    const original = proto[name];
    proto[name] = function (...args) {
      if (this.canvas.classList?.contains('map-canvas')) {
        if (name === 'clearRect') {
          window.drawOrder = [];
          window.drawSizes = [];
        } else window.drawOrder.push(name);
        if (name === 'drawImage') window.drawSizes.push([args[4], this.getTransform().a]);
      }
      return original.apply(this, args);
    };
  }
}
// 성은 판에서 마지막으로 그리는 그림 count장이다(숫자 패는 그림이 아니다). [배율, 화면 높이(CSS px), 월드 높이]
async function castleDraws(page, count) {
  const [sizes, dpr] = await page.evaluate(() => [window.drawSizes, devicePixelRatio]);
  return sizes.slice(-count).map(([height, scale]) => [scale / dpr, height * scale / dpr, height]);
}
// 미니맵에서 플레이어 색 점(그 플레이어의 성 자리)의 가운데와, 시야 사각형(화면 가운데)의 가운데(페이지 좌표)
async function miniCenters(page, rgb) {
  const canvas = page.locator('.minimap canvas');
  const [area, rect] = await Promise.all([box(canvas), box(view(page))]);
  const dot = await canvas.evaluate((canvas, [r, g, b]) => {
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    let x = 0, y = 0, count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== r || data[i + 1] !== g || data[i + 2] !== b) continue;
      x += i / 4 % canvas.width + .5;
      y += Math.floor(i / 4 / canvas.width) + .5;
      count++;
    }
    const scale = canvas.width / canvas.clientWidth;
    return { x: x / count / scale, y: y / count / scale };
  }, rgb);
  return { dot: { x: area.x + dot.x, y: area.y + dot.y }, view: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } };
}
// requestAnimationFrame 호출 수(window.rafCalls). addInitScript로 넣는다.
function countFrames() {
  window.rafCalls = 0;
  const request = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => { window.rafCalls++; return request(callback); };
}
// 주사위 연출(src/dice.js): 각 주사위에서 화면 쪽(+z)을 가장 많이 보는 면의 눈. 면은 1~6 순서로 놓인다.
const diceFaces = page => page.locator('.die').evaluateAll(dice => dice.map(die => {
  const turn = new DOMMatrix(getComputedStyle(die).transform);
  const toward = [...die.children].map(face => {
    const n = turn.multiply(new DOMMatrix(getComputedStyle(face).transform)).transformPoint(new DOMPoint(0, 0, 1, 0));
    return n.z / Math.hypot(n.x, n.y, n.z);
  });
  return toward.indexOf(Math.max(...toward)) + 1;
}));
// 임시 주사위 버튼을 누르고, 지도 알림에서 미리 정해진 두 눈을 읽는다.
async function roll(page) {
  await page.getByRole('button', { name: '임시 주사위 굴리기' }).click();
  const [, a, b, sum] = (await page.locator('#map [role="status"]').textContent()).match(/^주사위 ([1-6]), ([1-6]) · 합 (\d+)$/);
  expect(Number(sum)).toBe(Number(a) + Number(b));
  return [Number(a), Number(b)];
}
function watchErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => errors.push(`${request.url()} ${request.failure()?.errorText}`));
  return errors;
}

for (const [width, height, hash, players, name] of [
  [768, 1024, '#map', 2, 'ipad-duel'],
  [768, 1024, '#map-team', 4, 'ipad-team'],
  [390, 844, '#map-team', 4, 'phone-team'],
  [390, 844, '#map-ffa', 4, 'phone-ffa'],
  [1024, 768, '#map-team', 4, 'landscape-team'],
]) {
  test(`지도 ${name} ${width}×${height}: HUD가 화면 안에 겹치지 않게 있음`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ width, height });
    await open(page, hash);
    await expect(page.locator('.stage')).toBeHidden();
    await expect(page.locator('.hud-players .avatar')).toHaveCount(players);
    // 가로 화면은 높이의 3/4 폭인 세로 기둥이 가운데에 온다.
    const column = await box(page.locator('#map'));
    expect(column.width).toBeCloseTo(Math.min(width, height * 3 / 4), 0);
    expect(column.x).toBeCloseTo((width - column.width) / 2, 0);
    const boxes = [];
    for (const selector of HUD) {
      await expect(page.locator(selector)).toBeInViewport({ ratio: 1 });
      const item = await box(page.locator(selector));
      expect(item.x).toBeGreaterThanOrEqual(column.x);
      expect(item.x + item.width).toBeLessThanOrEqual(column.x + column.width);
      boxes.push([selector, item]);
    }
    for (const [i, [a, first]] of boxes.entries()) {
      for (const [b, second] of boxes.slice(i + 1)) expect(overlaps(first, second), `${a}와 ${b}가 겹침`).toBe(false);
    }
    await expect(page.getByRole('img', { name: '내 카드 3장' })).toBeVisible();
    // 재화 아이콘(이름은 화면 읽기용 글자)과 카드 뒷면 그림이 다 왔다.
    await expect(page.getByRole('list', { name: '보유 자원' }).getByRole('listitem')).toHaveText(['금0', '수정0', '나무0', '생선0']);
    await expect.poll(() => page.locator('.hud img').evaluateAll(images => images.filter(image => image.complete && image.naturalWidth > 0).length)).toBe(7);
    for (const name of ['미니맵 크게 보기', '임시 모드 바꾸기', '임시 주사위 굴리기']) expect((await box(page.getByRole('button', { name }))).height).toBeGreaterThanOrEqual(44);
    // 플레이어 줄(왕성으로 가는 버튼)은 누르는 판정이 가로세로 44px 이상이고 서로 겹치지 않는다.
    const rows = await page.locator('.hud-players button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().toJSON()));
    expect(rows).toHaveLength(players);
    for (const [i, row] of rows.entries()) {
      expect(Math.min(row.width, row.height)).toBeGreaterThanOrEqual(44);
      for (const other of rows.slice(i + 1)) expect(overlaps(row, other)).toBe(false);
    }
    await page.screenshot({ path: test.info().outputPath(`map-${name}-${width}x${height}.png`) });
    expect(errors).toEqual([]);
  });
}

test('팀전: 같은 팀을 먼저, 팀을 나눠 보임', async ({ page }) => {
  await open(page, '#map-team');
  await expect(page.getByRole('list', { name: '같은 팀' }).getByRole('listitem')).toHaveText([/봇 1/]);
  await expect(page.getByRole('list', { name: '상대 팀' }).getByRole('listitem')).toHaveText([/봇 2/, /봇 3/]);
  await expect(page.getByRole('heading', { name: '냥국 지도 · 2대2 팀전' })).toBeAttached();
});

test('가만히 있으면 다시 그리지 않음', async ({ page }) => {
  await page.addInitScript(countFrames);
  await open(page, '#map-ffa');
  expect(await page.evaluate(() => performance.getEntriesByName('map-render').length)).toBeGreaterThan(0);
  const before = await page.evaluate(() => window.rafCalls);
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.rafCalls)).toBe(before);
});

test('플레이어를 누르면 그 왕성으로 시점이 감(안개 속 상대 왕성으로는 가지 않음)', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.addInitScript(countFrames);
  await page.addInitScript(recordDraws);
  await open(page, '#map-team');
  const zoom = async () => (await castleDraws(page, 1))[0][0];
  const expectAt = async rgb => {
    const { dot, view } = await miniCenters(page, rgb);
    expect(Math.abs(dot.x - view.x)).toBeLessThan(1.5);
    expect(Math.abs(dot.y - view.y)).toBeLessThan(1.5);
  };
  // 상대 팀(봇 2)의 왕성은 아직 안개 속이라 시점이 그대로이고, 그렇다고 알려 준다.
  const fitted = await box(view(page));
  const bot2 = page.getByRole('button', { name: '봇 2의 왕성으로 이동' });
  await expect(bot2).toBeVisible();
  await bot2.click();
  await expect(page.locator('#map [role="status"]')).toHaveText('봇 2의 왕성은 아직 안개 속에 있어요');
  await glided(page);
  expect(await box(view(page))).toEqual(fitted);
  // 전체 보기에서 팀원(봇 1)을 누르면 기본 배율까지 확대하며 그 성으로 간다. 끝나면 다시 그리지 않는다.
  await page.getByRole('button', { name: '봇 1의 왕성으로 이동' }).click();
  await glided(page);
  await expectAt(COLORS.blue);
  expect(await zoom()).toBeCloseTo(NATURAL, 3);
  const before = await page.evaluate(() => window.rafCalls);
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.rafCalls)).toBe(before);
  // 기본 배율보다 가까이 보고 있었다면 배율은 그대로 두고 옮기기만 한다.
  const [x, y] = await center(page);
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, -100);
  await settled(page);
  const closer = await zoom();
  expect(closer).toBeGreaterThan(NATURAL + 0.05);
  await page.getByRole('button', { name: '내 왕성으로 이동' }).click();
  await glided(page);
  await expectAt(COLORS.me);
  expect(await zoom()).toBeCloseTo(closer, 3);
  // 판을 만지면(휠) 이동이 바로 멈춘다. 같은 순간에 눌러 첫 화면도 그리기 전에 멈추므로 시점이 그대로다.
  await page.evaluate(([x, y]) => {
    document.querySelector('[data-player="1"]').click();
    document.querySelector('.map-canvas').dispatchEvent(new WheelEvent('wheel', { clientX: x, clientY: y, cancelable: true }));
  }, [x, y]);
  await glided(page);
  await expectAt(COLORS.me);
  // 동작 줄이기: 미끄러지지 않고 바로 옮긴다.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '봇 1의 왕성으로 이동' }).click();
  await settled(page);
  await expectAt(COLORS.blue);
});

test('타이틀에서 고른 "움직임 줄임"이 지도의 시점 이동에도 적용됨', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('title-motion', 'reduced'));
  await open(page);
  const fitted = await box(view(page));
  await page.getByRole('button', { name: '내 왕성으로 이동' }).click();
  // 미끄러지면 300ms가 걸린다. 두 프레임 안에 이미 옮겨졌다.
  await settled(page);
  const moved = await box(view(page));
  expect(moved.width).toBeLessThan(fitted.width * 0.9);
  await page.waitForTimeout(400);
  expect(await box(view(page))).toEqual(moved);
});

test('끌면 이동, 휠을 올리면 확대', async ({ page }) => {
  await open(page);
  const [x, y] = await center(page);
  const fitted = await box(view(page));
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, -300);
  await expect.poll(async () => (await box(view(page))).width).toBeLessThan(fitted.width * 0.9);
  const start = await box(view(page));
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 120, y + 80, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await box(view(page))).x).not.toBe(start.x);
  const moved = await box(view(page));
  expect(moved.width).toBeCloseTo(start.width, 1);
  await page.mouse.wheel(0, -400);
  await expect.poll(async () => (await box(view(page))).width).toBeLessThan(moved.width * 0.9);
});

test('칸을 누르면 선택을 알려 줌', async ({ page }) => {
  await open(page);
  const text = await tapLand(page);
  expect(['안개 속 ', ...names].some(name => text.startsWith(`선택: ${name}`))).toBe(true);
});

test('임시 주사위: 정한 눈으로 멈춰 합을 보인 뒤 모두 지우고, 그 뒤 다시 그리지 않으며 지도 조작이 됨', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.addInitScript(countFrames);
  await open(page);
  const button = page.getByRole('button', { name: '임시 주사위 굴리기' });
  const values = await roll(page);
  await expect(button).toBeDisabled();
  // 두 주사위의 회전이 끝나면(멈추면) 앞면이 미리 정한 눈이다. 합은 그 뒤에 나온다.
  await page.waitForFunction(() => document.querySelectorAll('.die').length === 2 && !document.getAnimations().some(a => a.effect.target.classList.contains('die')));
  expect(await diceFaces(page)).toEqual(values);
  await expect(page.locator('.dice-sum')).toHaveText(String(values[0] + values[1]));
  await expect(page.locator('.dice-sum')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: test.info().outputPath('dice-roll-768x1024.png') });
  // 끝나면 층을 지우고 버튼을 푼다. 도는 애니메이션도, 다시 그리기도 없다.
  await expect(page.locator('.dice-layer')).toHaveCount(0);
  await expect(button).toBeEnabled();
  expect(await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length)).toBe(0);
  const before = await page.evaluate(() => window.rafCalls);
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.rafCalls)).toBe(before);
  // 지도를 다시 누르고 끌 수 있다.
  await tapLand(page);
  const [x, y] = await center(page);
  const start = await box(view(page));
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 120, y + 80, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await box(view(page))).x).not.toBe(start.x);
  expect(errors).toEqual([]);
});

test('임시 주사위: 연출 중 화면을 누르면 결과로 건너뛰고 곧 끝남(누른 곳의 칸은 고르지 않음)', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  const values = await roll(page);
  const status = page.locator('#map [role="status"]');
  const told = await status.textContent();
  await page.waitForTimeout(150);
  const [x, y] = await center(page);
  await page.mouse.click(x, y);
  const tapped = Date.now();
  // 누르는 즉시 결과 면과 합이 다 보인다.
  expect(await diceFaces(page)).toEqual(values);
  await expect(page.locator('.dice-sum')).toHaveCSS('opacity', '1');
  // 그냥 두면 1.7초 넘게 남는다. 건너뛰면 결과를 0.35초 보여 주고 0.24초에 걸쳐 사라진다.
  await expect(page.locator('.dice-layer')).toHaveCount(0, { timeout: 1500 });
  expect(Date.now() - tapped).toBeLessThan(1300);
  await expect(status).toHaveText(told);
  await expect(page.getByRole('button', { name: '임시 주사위 굴리기' })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('타이틀에서 고른 "움직임 줄임"이면 주사위가 구르지 않고 결과 면으로 나타났다 사라짐', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: '연출 건너뛰기' }).click();
  await page.getByRole('button', { name: '움직임: 전체', exact: true }).click();
  await expect(page.locator('.stage')).toHaveAttribute('data-motion', 'reduced');
  await page.getByRole('button', { name: '게임 시작' }).click();
  await page.getByRole('button', { name: /^1대1 매치/ }).click();
  await settled(page);
  const values = await roll(page);
  // 처음부터 결과 면이고, 투명도만 바뀐다(이동·회전·크기 변화 없음).
  expect(await diceFaces(page)).toEqual(values);
  const changed = await page.locator('.dice-layer').evaluate(layer => [...new Set(layer.getAnimations({ subtree: true }).flatMap(a => a.effect.getKeyframes().flatMap(Object.keys)))]);
  expect(changed.filter(key => !['offset', 'computedOffset', 'easing', 'composite'].includes(key))).toEqual(['opacity']);
  await expect(page.locator('.dice-layer')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '임시 주사위 굴리기' })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('안개 속 칸은 바닥만, 아는 칸은 지형과 숫자까지 알려 줌', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await open(page);
  const { board, state } = await boardOf(page);
  const status = page.locator('#map [role="status"]');
  // 교환소 표지와 HUD에서 떨어진, 판 가운데에 가까운 칸부터 고른다.
  const middle = { q: board.cols >> 1, r: (board.rows >> 1) - (board.cols >> 2) };
  const tiles = board.tiles.filter(t => board.ports.every(p => hexDistance(p, t) >= 3)).sort((a, b) => hexDistance(a, middle) - hexDistance(b, middle));
  async function tapFirst(list) {
    for (const tile of list) {
      const point = await tilePoint(page, board, tile);
      if (!await onMap(page, point)) continue;
      await page.mouse.click(point.x, point.y);
      return tile;
    }
    throw new Error('누를 칸이 없음');
  }
  const ground = { grass: '풀밭', forest: '풀밭', lake: '호수', gold: '빈 땅', crystal: '빈 땅', rock: '빈 땅' };
  // 모르는 숲은 풀밭, 금광·수정산·바위산은 빈 땅으로만 보인다. 숫자도 말하지 않는다.
  const unknown = await tapFirst(tiles.filter(t => state.get(`${t.q},${t.r}`) === UNKNOWN));
  await expect(status).toHaveText(`선택: 안개 속 ${ground[unknown.type]}`);
  const known = await tapFirst(tiles.filter(t => state.get(`${t.q},${t.r}`) !== UNKNOWN));
  await expect(status).toHaveText(`선택: ${TERRAIN[known.type].name}${known.number === null ? '' : ` ${known.number}`}`);
});

test('화면을 돌려도 시점과 선택이 그대로', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await open(page, '#map-team');
  const text = await tapLand(page);
  const [x, y] = await center(page);
  await page.mouse.wheel(0, -500);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 90, y + 40, { steps: 4 });
  await page.mouse.up();
  await settled(page);
  const relative = async () => {
    const [mini, rect] = await Promise.all([box(page.locator('.minimap')), box(view(page))]);
    return { cx: rect.x + rect.width / 2 - mini.x, cy: rect.y + rect.height / 2 - mini.y, w: rect.width, h: rect.height };
  };
  const before = await relative();
  await page.setViewportSize({ width: 1024, height: 768 });
  await settled(page);
  const turned = await relative();
  expect(turned.cx).toBeCloseTo(before.cx, 0);
  expect(turned.cy).toBeCloseTo(before.cy, 0);
  await page.setViewportSize({ width: 768, height: 1024 });
  await settled(page);
  const back = await relative();
  for (const key of ['cx', 'cy', 'w', 'h']) expect(back[key]).toBeCloseTo(before[key], 1);
  await expect(page.locator('#map [role="status"]')).toHaveText(text);
});

test('미니맵: 크게 열고 누른 곳으로 이동, Esc로 닫기', async ({ page }) => {
  await open(page);
  const button = page.getByRole('button', { name: '미니맵 크게 보기' });
  const dialog = page.getByRole('dialog', { name: '전체 지도' });
  const start = await box(view(page));
  await button.click();
  await expect(dialog).toBeVisible();
  const panel = await box(dialog);
  // 큰 미니맵도 판 비율을 따르고 화면 안에 들어온다.
  const ratio = await page.locator('#map').evaluate(root => Number(root.style.getPropertyValue('--board-ratio')));
  expect(panel.width / panel.height).toBeCloseTo(ratio, 1);
  await expect(dialog).toBeInViewport({ ratio: 1 });
  await page.mouse.click(panel.x + panel.width * 0.22, panel.y + panel.height * 0.2);
  await expect(dialog).toBeHidden();
  await expect(button).toBeFocused();
  await expect.poll(async () => (await box(view(page))).x).toBeLessThan(start.x - 5);
  await button.click();
  await expect(dialog).toBeVisible();
  const moved = await box(view(page));
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(button).toBeFocused();
  expect((await box(view(page))).x).toBe(moved.x);
});

test('두 손가락으로 벌리면 확대', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP 터치 입력은 Chromium에서만 쓸 수 있다.');
  const context = await browser.newContext({ viewport: { width: 768, height: 1024 }, hasTouch: true });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/#map');
  await settled(page);
  const start = await box(view(page));
  const cdp = await context.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  await touch('touchStart', [[344, 512], [424, 512]]);
  for (let step = 1; step <= 10; step++) await touch('touchMove', [[344 - step * 15, 512 - step * 5], [424 + step * 15, 512 + step * 5]]);
  await touch('touchEnd', []);
  await expect.poll(async () => (await box(view(page))).width).toBeLessThan(start.width * 0.8);
  await context.close();
});

for (const file of ['map/barren.webp', 'game/castle-team.webp']) test(`지도 그림(${file})을 못 받아도 판이 보이고 다시 불러올 수 있음`, async ({ page }) => {
  await page.route(`**/${file}*`, route => route.abort());
  await page.goto('/#map');
  await expect(page.locator('#map')).toHaveAttribute('data-art', 'error');
  const retry = page.getByRole('button', { name: '지도 그림 다시 불러오기' });
  await expect(retry).toBeVisible();
  // 대신 그린 지형 색 칸이 있어 판이 비어 있지 않다(불투명한 점이 많다).
  expect(await page.locator('.map-canvas').evaluate(canvas => {
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    let solid = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] === 255) solid++;
    return solid;
  })).toBeGreaterThan(20000);
  await page.unroute(`**/${file}*`);
  await retry.click();
  await settled(page);
  await expect(retry).toBeHidden();
});

// iPad mini 5 기준: 세로 768×1024, 2배 화면. CPU를 6배 느리게 해 4인 판을 전체 보기와 확대 상태에서 끌어 본다.
test('그리기 비용(4인 판, CPU 6배 느리게)', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'CPU 감속은 Chromium CDP에서만 쓸 수 있다.');
  test.setTimeout(60000);
  const context = await browser.newContext({ viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2 });
  await context.addInitScript(() => {
    window.renders = [];
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) if (entry.name === 'map-render') window.renders.push([entry.duration, entry.detail.tiles, entry.detail.objects, entry.detail.fog]);
    }).observe({ entryTypes: ['measure'] });
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/#map-ffa');
  await settled(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  const [x, y] = await center(page);
  async function drags() {
    await page.evaluate(() => { window.renders = []; });
    for (const [dx, dy] of [[150, 60], [-200, -100], [80, 120], [-60, -90]]) {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + dx, y + dy, { steps: 8 });
      await page.mouse.up();
    }
    await settled(page);
    const list = await page.evaluate(() => window.renders);
    const times = list.map(([time]) => time);
    const average = times.reduce((sum, time) => sum + time, 0) / times.length;
    return { count: times.length, average, max: Math.max(...times), tiles: Math.max(...list.map(([, tiles]) => tiles)), objects: Math.max(...list.map(([, , objects]) => objects)), fog: [...new Set(list.map(([, , , fog]) => fog))] };
  }
  const results = { fit: await drags() };
  for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -400);
  results.zoomed = await drags();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  for (const [label, result] of Object.entries(results)) {
    console.log(`지도 그리기(${label}) ${result.count}회: 평균 ${result.average.toFixed(2)}ms, 최대 ${result.max.toFixed(2)}ms, 그린 타일 ${result.tiles}개, 오브젝트 ${result.objects}개`);
    expect(result.count).toBeGreaterThan(3);
    expect(result.average).toBeLessThan(8);
  }
  expect(results.zoomed.tiles).toBeLessThan(results.fit.tiles / 4);
  // 전체 보기에서도 아는 칸의 오브젝트는 그린다. 안개 그림은 판을 열 때 한 번만 만들고, 끌거나 확대해도 다시 만들지 않는다.
  expect(results.fit.objects).toBeGreaterThan(0);
  for (const result of Object.values(results)) expect(result.fog).toEqual([1]);
  await context.close();
});

// iPad 2배 화면. 큰 미니맵에서 내 성 점(나의 색)을 눌러 그 꼭짓점으로 간 뒤 끝까지 확대한다.
test('지형 그림과 성: 2배 화면 전체 보기와 내 성 가까이', async ({ browser }) => {
  test.setTimeout(40000);
  const context = await browser.newContext({ viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2 });
  await context.addInitScript(recordDraws);
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.goto('http://127.0.0.1:4173/#map');
  await settled(page);
  await page.screenshot({ path: test.info().outputPath('map-ipad-duel-fit-2x.png') });
  // 1대1 전체 보기(숫자 글자 약 7 CSS px): 크게 키운 성을 숫자 패 위에 그린다. 상대 성은 안개 속이라 마지막 그림이 내 성 하나다.
  let order = await page.evaluate(() => window.drawOrder);
  expect(order).toContain('fillText');
  expect((await lastRender(page)).castles).toBe(1);
  expect(order.lastIndexOf('fillText')).toBeLessThan(order.length - 1);
  expect(order.at(-1)).toBe('drawImage');
  // 내 줄을 누르면 기본 배율로 내 성에 간다. 제 크기에서는 숫자 패를 성 다음에 그린다.
  await page.getByRole('button', { name: '내 왕성으로 이동' }).click();
  await glided(page);
  order = await page.evaluate(() => window.drawOrder);
  expect(order.lastIndexOf('drawImage')).toBeLessThan(order.indexOf('fillText'));
  await page.screenshot({ path: test.info().outputPath('map-ipad-duel-natural-2x.png') });
  const [x, y] = await center(page);
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, 400);
  await settled(page);
  await page.screenshot({ path: test.info().outputPath('map-ipad-duel-middle-2x.png') });
  await page.getByRole('button', { name: '미니맵 크게 보기' }).click();
  const big = page.locator('.minimap-dialog canvas');
  const dot = await big.evaluate(canvas => {
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    let x = 0, y = 0, count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== 242 || data[i + 1] !== 179 || data[i + 2] !== 61) continue;
      x += i / 4 % canvas.width;
      y += Math.floor(i / 4 / canvas.width);
      count++;
    }
    const scale = canvas.width / canvas.clientWidth;
    return { x: x / count / scale, y: y / count / scale };
  });
  await big.click({ position: dot });
  await expect(page.locator('.minimap-dialog')).toBeHidden();
  await page.mouse.move(x, y);
  for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -400);
  await settled(page);
  await page.screenshot({ path: test.info().outputPath('map-ipad-duel-castle-2x.png') });
  // 내 색으로 칠한 지붕·깃발(마스크 회색 약 102·133 → #f2b33d × 102/112, × 133/112)은 다른 그림에 없는 색이다.
  // 땅에 닿는 점이 화면 가운데(꼭짓점)에 있으면 지붕은 꼭짓점보다 43~120 CSS px 위, 좌우 58 CSS px 안에만 있다.
  const roof = await page.locator('.map-canvas').evaluate(canvas => {
    const { data } = canvas.getContext('2d').getImageData(canvas.width / 2 - 180, canvas.height / 2 - 300, 360, 420);
    const count = { above: 0, near: 0 };
    for (let i = 0; i < data.length; i += 4) {
      if (![[220, 163, 56], [255, 213, 72]].some(([r, g, b]) => Math.abs(data[i] - r) <= 6 && Math.abs(data[i + 1] - g) <= 6 && Math.abs(data[i + 2] - b) <= 6)) continue;
      // 가운데에서 20 CSS px 위보다 높으면 위, 그 아래(가운데 아래 60px까지)는 가까이
      count[Math.floor(i / 4 / 360) < 260 ? 'above' : 'near']++;
    }
    return count;
  });
  expect(roof.above).toBeGreaterThan(2000);
  expect(roof.near).toBe(0);
  // 숫자 패는 성보다 나중에 그려 성에 가려지지 않는다.
  order = await page.evaluate(() => window.drawOrder);
  expect(order).toContain('fillText');
  expect(order.lastIndexOf('drawImage')).toBeLessThan(order.indexOf('fillText'));
  await page.locator('.hud-resources').screenshot({ path: test.info().outputPath('map-hud-resources-2x.png') });
  // 팀전 전체 보기: 성 받침(플레이어 색 그대로)이 내 편 두 성(나, 봇 1)에만 보인다. 상대 팀 성은 안개 속이다.
  const team = await context.newPage();
  team.on('pageerror', error => errors.push(error.message));
  await team.goto('http://127.0.0.1:4173/#map-team');
  await settled(team);
  await team.screenshot({ path: test.info().outputPath('map-ipad-team-fit-2x.png') });
  const discs = await team.locator('.map-canvas').evaluate((canvas, colors) => {
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    const count = colors.map(() => 0);
    for (let i = 0; i < data.length; i += 4) {
      const hex = `#${[data[i], data[i + 1], data[i + 2]].map(v => v.toString(16).padStart(2, '0')).join('')}`;
      const index = colors.indexOf(hex);
      if (index >= 0) count[index]++;
    }
    return count;
  }, ['#f2b33d', '#3f7fe0', '#e0524a', '#9a5ad6']);
  expect(discs[0]).toBeGreaterThan(300);
  expect(discs[1]).toBeGreaterThan(300);
  expect(discs.slice(2)).toEqual([0, 0]);
  expect(errors).toEqual([]);
  await context.close();
});

// 안개: 같은 시드로 규칙 모듈이 낸 시야와 실제로 그린 수가 같다. 모르는 칸은 바닥만, 상대 왕성은 안 보이면 그리지 않는다.
test('안개: 모르는 칸의 오브젝트·숫자와 상대 왕성은 그리지 않고, 안개 그림은 시야가 바뀔 때만 만듦', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.goto('http://127.0.0.1:4173/#map');
  await settled(page);
  const { board, state } = await boardOf(page);
  const shown = board.tiles.filter(t => state.get(`${t.q},${t.r}`) !== UNKNOWN);
  const objects = shown.filter(t => ['forest', 'gold', 'crystal', 'rock'].includes(t.type)).length;
  // 1대1 iPad 전체 보기는 모든 칸과 숫자 패를 그린다. 그중 아는 칸·보이는 칸의 오브젝트와 숫자만 그린다.
  expect(await lastRender(page)).toEqual({ tiles: board.tiles.length, objects, numbers: shown.filter(t => t.number !== null).length, castles: 1, ports: 6, fog: 1 });
  expect(board.tiles.filter(t => !['grass', 'lake'].includes(t.type)).length).toBeGreaterThan(objects + 20);
  // 미니맵에도 내 성만 찍힌다.
  expect(await colorCount(page.locator('.minimap canvas'), COLORS.me)).toBeGreaterThan(0);
  expect(await colorCount(page.locator('.minimap canvas'), COLORS.blue)).toBe(0);
  // 끌고, 확대하고, 화면을 돌려도 안개 그림은 다시 만들지 않는다.
  const [x, y] = await center(page);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 100, y + 60, { steps: 4 });
  await page.mouse.up();
  await page.mouse.wheel(0, -300);
  await page.setViewportSize({ width: 1024, height: 768 });
  await settled(page);
  expect((await lastRender(page)).fog).toBe(1);

  // 4인 개인전 전체 보기: 상대 셋의 성은 판과 미니맵 어디에도 없다(성 받침은 300점이 넘는다).
  const ffa = await context.newPage();
  ffa.on('pageerror', error => errors.push(error.message));
  await ffa.goto('http://127.0.0.1:4173/#map-ffa');
  await settled(ffa);
  expect((await lastRender(ffa)).castles).toBe(1);
  expect(await colorCount(ffa.locator('.map-canvas'), COLORS.me)).toBeGreaterThan(300);
  for (const rgb of [COLORS.blue, COLORS.red, COLORS.purple]) {
    expect(await colorCount(ffa.locator('.minimap canvas'), rgb)).toBe(0);
    expect(await colorCount(ffa.locator('.map-canvas'), rgb)).toBeLessThan(20);
  }
  await ffa.screenshot({ path: test.info().outputPath('fog-ipad-ffa-fit-2x.png') });
  expect(errors).toEqual([]);
  await context.close();
});

// 교환소는 처음부터 아는 칸이라 안개 위에 보인다. 전체 보기에서 부두가 시작하는 변 가운데를 누르고, 그곳을 크게 확대해 본다.
test('교환소: 표지나 부두를 누르면 교환 짝을 알리고 칸은 고르지 않음', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/#map');
  await settled(page);
  const { board } = await boardOf(page);
  const status = page.locator('#map [role="status"]');
  // 교환소 변 가운데 = 두 교환소 자리(꼭짓점)의 가운데 = 두 자리에 붙은 여섯 칸 중심의 평균
  let found;
  for (const port of board.ports) {
    const centers = portSpots(port).flat().map(({ q, r }) => hexToPixel(q, r, TILE));
    const point = await fitPoint(page, board, { x: centers.reduce((sum, c) => sum + c.x, 0) / 6, y: centers.reduce((sum, c) => sum + c.y, 0) / 6 });
    if (await onMap(page, point)) { found = { port, point }; break; }
  }
  const { port, point } = found;
  const text = `교환소: ${RESOURCE_NAMES[port.pair[0]]} ⇄ ${RESOURCE_NAMES[port.pair[1]]} (2:1)`;
  await page.mouse.click(point.x, point.y);
  await expect(status).toHaveText(text);
  // 그 점을 중심으로 최대한 확대하고 화면 가운데로 끌어온다.
  await page.mouse.move(point.x, point.y);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -400);
  const [x, y] = await center(page);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 6 });
  await page.mouse.up();
  await settled(page);
  expect((await lastRender(page)).ports).toBeGreaterThan(0);
  await page.screenshot({ path: test.info().outputPath('port-closeup-2x.png') });
  // 다른 칸을 고른 뒤 다시 교환소를 눌러도 교환 짝만 알린다.
  await tapLand(page);
  await page.mouse.click(x, y);
  await expect(status).toHaveText(text);
  await context.close();
});

// 4인 판 iPad 세로. 전체 보기에서 최대 확대까지 조금씩 확대하며 성의 화면 크기를 잰다.
test('성 크기: 멀리 볼수록 크게, 확대해도 화면에서 줄지 않음', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.addInitScript(recordDraws);
  await open(page, '#map-team');
  const [x, y] = await center(page);
  // 안개 속 상대 팀 성은 그리지 않아 내 편 두 성(나, 봇 1)을 잰다.
  expect((await lastRender(page)).castles).toBe(2);
  const fit = await castleDraws(page, 2);
  // 전체 보기: 두 성 모두 화면에서 72 CSS px(칸 폭 약 35px의 2배)
  for (const [, height] of fit) expect(height).toBeCloseTo(72, 1);
  // 화면을 돌렸다 돌아와도 같은 크기
  await page.setViewportSize({ width: 1024, height: 768 });
  await settled(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  await settled(page);
  expect((await castleDraws(page, 1))[0][1]).toBeCloseTo(fit[0][1], 3);
  const sweep = [fit[0]];
  await page.mouse.move(x, y);
  for (let step = 0; step < 60 && sweep.at(-1)[0] < 1.4 - 1e-6; step++) {
    await page.mouse.wheel(0, -40);
    await settled(page);
    sweep.push((await castleDraws(page, 1))[0]);
  }
  expect(sweep.at(-1)[0]).toBeCloseTo(1.4, 3);
  expect(sweep.filter(([zoom]) => zoom < NATURAL).length).toBeGreaterThan(8);
  for (const [i, [zoom, height, world]] of sweep.entries()) {
    if (i) {
      expect(zoom).toBeGreaterThan(sweep[i - 1][0]);
      expect(height, `배율 ${zoom.toFixed(3)}에서 성이 화면에서 줄어듦`).toBeGreaterThanOrEqual(sweep[i - 1][1] - 1e-6);
    }
    // 기본 배율부터는 제 크기(120), 그보다 멀면 더 크게
    if (zoom >= NATURAL) expect(world).toBeCloseTo(120, 6);
    else expect(world).toBeGreaterThan(120);
  }
});

test('타이틀에서 대전 방식을 골라 판 보기, 모드 바꾸기로 돌아오기', async ({ page }) => {
  const errors = watchErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: '게임 시작' }).click();
  await page.getByRole('button', { name: /^1대1 매치/ }).click();
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('#modes')).toBeHidden();
  await expect(page.locator('.hud-players .avatar')).toHaveText(['전', '법']);
  await expect(page.locator('.hud-players')).toContainText('나');
  await settled(page);
  await page.getByRole('button', { name: '임시 모드 바꾸기' }).click();
  await expect(page.locator('#map')).toBeHidden();
  await page.getByRole('button', { name: /^4인 매치/ }).click();
  await expect(page.getByRole('button', { name: /^1대1 매치/ })).toBeHidden();
  // 뒤로: 4인 단계 → 첫 단계
  await page.getByRole('button', { name: '← 뒤로' }).click();
  await page.getByRole('button', { name: /^4인 매치/ }).click();
  await page.getByRole('button', { name: /^팀전/ }).click();
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('.hud-players .avatar')).toHaveCount(4);
  await expect(page.getByRole('list', { name: '상대 팀' })).toBeVisible();
  await settled(page);
  expect(errors).toEqual([]);
});

test('대전 방식 선택: Esc와 뒤로 버튼으로 한 단계씩 돌아감', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: '게임 시작' }).click();
  await page.getByRole('button', { name: /^4인 매치/ }).click();
  await expect(page.getByRole('button', { name: /^개인전/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /^1대1 매치/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.stage')).toHaveAttribute('data-state', 'ready');
  await expect(page.getByRole('button', { name: '게임 시작' })).toBeFocused();
  await page.getByRole('button', { name: '게임 시작' }).click();
  await page.getByRole('button', { name: '← 타이틀로' }).click();
  await expect(page.getByRole('button', { name: '게임 시작' })).toBeVisible();
});

for (const [width, height] of [[768, 1024], [390, 844], [1024, 768]]) {
  test(`대전 방식 선택 ${width}×${height}: 버튼이 화면 안, 위아래·좌우로 나뉨`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.getByRole('button', { name: '게임 시작' }).click();
    const duel = await box(page.getByRole('button', { name: /^1대1 매치/ }));
    const four = await box(page.getByRole('button', { name: /^4인 매치/ }));
    expect(duel.y + duel.height / 2).toBeLessThan(height / 2);
    expect(four.y + four.height / 2).toBeGreaterThan(height / 2);
    expect(four.y + four.height).toBeLessThanOrEqual(height);
    await page.getByRole('button', { name: /^4인 매치/ }).click();
    const ffa = await box(page.getByRole('button', { name: /^개인전/ }));
    const team = await box(page.getByRole('button', { name: /^팀전/ }));
    expect(ffa.x + ffa.width).toBeLessThanOrEqual(team.x);
    expect(Math.min(ffa.height, team.height, ffa.width)).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: test.info().outputPath(`modes-${width}x${height}.png`) });
  });
}
