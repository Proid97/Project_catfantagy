import { test, expect } from '@playwright/test';

const names = ['금광', '수정산', '숲', '호수', '빈 땅'];
const view = page => page.locator('.minimap .minimap-view');
const box = async locator => (await locator.boundingBox());
// 첫 그림과 글꼴이 온 뒤 다시 그린 것까지 끝나기를 기다린다.
const settled = page => page.evaluate(async () => {
  await document.fonts.ready;
  await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
});
async function open(page) {
  await page.goto('/#map');
  await expect(page.locator('.map-canvas')).toBeVisible();
  await settled(page);
}
async function center(page) {
  const area = await box(page.locator('.map-canvas'));
  return [area.x + area.width / 2, area.y + area.height / 2];
}

for (const [width, height] of [[1024, 768], [390, 844]]) {
  test(`지도 ${width}×${height}: 오류 없이 열리고 HUD가 화면 안에 있음`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height });
    await open(page);
    await expect(page.locator('.stage')).toBeHidden();
    for (const selector of ['.hud-players', '.hud-resources', '.minimap', '.hand']) await expect(page.locator(selector)).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('img', { name: '내 카드 3장' })).toBeVisible();
    expect((await box(page.getByRole('button', { name: '미니맵 크게 보기' }))).height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: test.info().outputPath(`map-${width}x${height}.png`) });
    expect(errors).toEqual([]);
  });
}

test('가만히 있으면 다시 그리지 않음', async ({ page }) => {
  await page.addInitScript(() => {
    window.rafCalls = 0;
    const request = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => { window.rafCalls++; return request(callback); };
  });
  await open(page);
  expect(await page.evaluate(() => performance.getEntriesByName('map-render').length)).toBeGreaterThan(0);
  const before = await page.evaluate(() => window.rafCalls);
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.rafCalls)).toBe(before);
});

test('끌면 이동, 휠을 올리면 확대', async ({ page }) => {
  await open(page);
  const [x, y] = await center(page);
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
  await page.mouse.click(...await center(page));
  const status = page.locator('#map [role="status"]');
  await expect(status).toHaveText(/^선택: /);
  const text = await status.textContent();
  expect(names.some(name => text.startsWith(`선택: ${name}`))).toBe(true);
});

test('미니맵: 크게 열고 누른 곳으로 이동, Esc로 닫기', async ({ page }) => {
  await open(page);
  const button = page.getByRole('button', { name: '미니맵 크게 보기' });
  const dialog = page.getByRole('dialog', { name: '전체 지도' });
  const start = await box(view(page));
  await button.click();
  await expect(dialog).toBeVisible();
  const panel = await box(dialog);
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
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/#map');
  await settled(page);
  const start = await box(view(page));
  const cdp = await context.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  await touch('touchStart', [[472, 384], [552, 384]]);
  for (let step = 1; step <= 10; step++) await touch('touchMove', [[472 - step * 15, 384 - step * 5], [552 + step * 15, 384 + step * 5]]);
  await touch('touchEnd', []);
  await expect.poll(async () => (await box(view(page))).width).toBeLessThan(start.width * 0.8);
  await context.close();
});

test('그리기 비용', async ({ page }) => {
  await open(page);
  const [x, y] = await center(page);
  for (const [dx, dy] of [[150, 60], [-200, -100], [80, 120]]) {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 8 });
    await page.mouse.up();
    await page.mouse.wheel(0, -200);
  }
  await settled(page);
  const times = await page.evaluate(() => performance.getEntriesByName('map-render').map(entry => entry.duration));
  expect(times.length).toBeGreaterThan(3);
  const average = times.reduce((sum, time) => sum + time, 0) / times.length;
  console.log(`지도 그리기 ${times.length}회: 평균 ${average.toFixed(2)}ms, 최대 ${Math.max(...times).toFixed(2)}ms`);
  expect(average).toBeLessThan(16);
});

test('타이틀에서 냥국을 고르고 판 보기', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: '게임 시작' }).click();
  await page.getByRole('radio', { name: '냥전사', exact: true }).check();
  await page.getByRole('button', { name: '플레이어 1 선택 완료 →' }).click();
  await page.getByRole('radio', { name: '냥살자', exact: true }).check();
  await page.getByRole('button', { name: '플레이어 2 선택 완료 →' }).click();
  await page.getByRole('button', { name: '플레이어 1 주사위 굴리기' }).click();
  await page.getByRole('button', { name: '플레이어 2 주사위 굴리기' }).click();
  await page.getByRole('button', { name: '판 보기 →' }).click();
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('#setup')).toBeHidden();
  await expect(page.locator('.hud-players .avatar')).toHaveText(['전', '살']);
  await expect(page.locator('.hud-players')).toContainText('나');
});
