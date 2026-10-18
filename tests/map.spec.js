import { test, expect } from '@playwright/test';

const names = ['풀밭', '숲', '호수', '금광', '수정산', '바위산'];
const HUD = ['.hud-players', '.hud-resources', '.minimap', '.mode-change', '.hand'];
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
    for (const name of ['미니맵 크게 보기', '임시 모드 바꾸기']) expect((await box(page.getByRole('button', { name }))).height).toBeGreaterThanOrEqual(44);
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
  await page.addInitScript(() => {
    window.rafCalls = 0;
    const request = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => { window.rafCalls++; return request(callback); };
  });
  await open(page, '#map-ffa');
  expect(await page.evaluate(() => performance.getEntriesByName('map-render').length)).toBeGreaterThan(0);
  const before = await page.evaluate(() => window.rafCalls);
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.rafCalls)).toBe(before);
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
  expect(names.some(name => text.startsWith(`선택: ${name}`))).toBe(true);
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
      for (const entry of list.getEntries()) if (entry.name === 'map-render') window.renders.push([entry.duration, entry.detail.tiles, entry.detail.objects]);
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
    return { count: times.length, average, max: Math.max(...times), tiles: Math.max(...list.map(([, tiles]) => tiles)), objects: Math.max(...list.map(([, , objects]) => objects)) };
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
  // 전체 보기에서도 오브젝트를 그린다(예전의 색 점 대신). 육지의 약 41%가 오브젝트 칸이다.
  expect(results.fit.objects).toBeGreaterThan(results.fit.tiles * 0.25);
  await context.close();
});

// iPad 2배 화면. 큰 미니맵에서 내 성 점(나의 색)을 눌러 그 꼭짓점으로 간 뒤 끝까지 확대한다.
test('지형 그림과 성: 2배 화면 전체 보기와 내 성 가까이', async ({ browser }) => {
  test.setTimeout(40000);
  const context = await browser.newContext({ viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2 });
  // 지도 그림판의 마지막 한 번 그리기에서 그림과 숫자를 그린 순서
  await context.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype;
    window.drawOrder = [];
    for (const name of ['clearRect', 'drawImage', 'fillText']) {
      const original = proto[name];
      proto[name] = function (...args) {
        if (this.canvas.classList?.contains('map-canvas')) {
          if (name === 'clearRect') window.drawOrder = [];
          else window.drawOrder.push(name);
        }
        return original.apply(this, args);
      };
    }
  });
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.goto('http://127.0.0.1:4173/#map');
  await settled(page);
  await page.screenshot({ path: test.info().outputPath('map-ipad-duel-fit-2x.png') });
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
  const [x, y] = await center(page);
  await page.mouse.move(x, y);
  for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -400);
  await settled(page);
  await page.screenshot({ path: test.info().outputPath('map-ipad-duel-castle-2x.png') });
  // 내 색을 곱한 지붕·깃발(마스크의 두 회색 202, 155 × #f2b33d)은 다른 그림에 없는 색이다.
  // 땅에 닿는 점이 화면 가운데(꼭짓점)에 있으면 지붕은 꼭짓점보다 43~120 CSS px 위, 좌우 58 CSS px 안에만 있다.
  const roof = await page.locator('.map-canvas').evaluate(canvas => {
    const { data } = canvas.getContext('2d').getImageData(canvas.width / 2 - 180, canvas.height / 2 - 300, 360, 420);
    const count = { above: 0, near: 0 };
    for (let i = 0; i < data.length; i += 4) {
      if (![[192, 142, 48], [147, 109, 37]].some(([r, g, b]) => Math.abs(data[i] - r) <= 6 && Math.abs(data[i + 1] - g) <= 6 && Math.abs(data[i + 2] - b) <= 6)) continue;
      // 가운데에서 20 CSS px 위보다 높으면 위, 그 아래(가운데 아래 60px까지)는 가까이
      count[Math.floor(i / 4 / 360) < 260 ? 'above' : 'near']++;
    }
    return count;
  });
  expect(roof.above).toBeGreaterThan(2000);
  expect(roof.near).toBe(0);
  // 숫자 패는 성보다 나중에 그려 성에 가려지지 않는다.
  const order = await page.evaluate(() => window.drawOrder);
  expect(order).toContain('fillText');
  expect(order.lastIndexOf('drawImage')).toBeLessThan(order.indexOf('fillText'));
  await page.locator('.hud-resources').screenshot({ path: test.info().outputPath('map-hud-resources-2x.png') });
  // 팀전 전체 보기: 성 받침(플레이어 색 그대로)이 네 성 모두 보인다.
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
  for (const count of discs) expect(count).toBeGreaterThan(300);
  expect(errors).toEqual([]);
  await context.close();
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
