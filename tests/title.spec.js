import { test, expect } from '@playwright/test';

const stage = page => page.locator('.stage');
const intro = page => expect(stage(page)).toHaveAttribute('data-state', 'intro');
const ready = page => expect(stage(page)).toHaveAttribute('data-state', 'ready');
// 반복 연출과 횟수. 끝없이 도는 연출이 있으면 Infinity가 나와 실패한다.
const loops = page => page.evaluate(() => document.getAnimations().filter(item => item.effect.getTiming().iterations > 1).map(item => `${item.animationName} ${item.effect.getTiming().iterations}`).sort());
// 인트로 뒤 대기 연출. 캐릭터는 약 74초 동안, 시작 문구는 3번만 한다.
const idleLoops = ['assassin-hover 17', 'mage-float 20', 'mage-shadow 20', 'mage-sway 14', 'staff-twinkle 15', 'start-pulse 3', 'warrior-breathe 24', 'warrior-shadow 24'];
// 시작 문구가 나타날 자리. 연출 중 이곳을 눌러도 건너뛰기만 해야 한다.
const startSpot = async page => { const box = await page.locator('.canvas').boundingBox(); return [box.x + box.width / 2, box.y + box.height * .94]; };

test('등장 순서, 자연 종료, 시작 입력과 되돌아오기', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await intro(page);
  const times = await page.locator('.art').evaluate(art => [...art.children].map(layer => ({
    name: layer.dataset.layer, delay: layer.getAnimations()[0].effect.getTiming().delay,
  })));
  expect(times.sort((a, b) => a.delay - b.delay).map(item => item.name)).toEqual([
    'sky-tall', 'hills-tall', 'ground-tall', 'peaks', 'castle-hill', 'warrior-front-shadow', 'warrior-front', 'assassin', 'mage-shadow', 'mage', 'logo',
  ]);
  await ready(page);
  expect(await page.evaluate(() => document.getAnimations().every(item => item instanceof CSSAnimation))).toBe(true);
  expect(await loops(page)).toEqual(idleLoops);
  expect(await page.evaluate(() => document.fonts.check('700 24px "Catfantagy UI"'))).toBe(true);
  const start = page.getByRole('button', { name: '게임 시작' });
  expect(await start.evaluate(button => ['backgroundColor', 'boxShadow', 'borderTopWidth'].map(key => getComputedStyle(button)[key]))).toEqual(['rgba(0, 0, 0, 0)', 'none', '0px']);
  await page.evaluate(() => { window.starts = 0; window.addEventListener('title:start', () => window.starts++); });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /^1대1 매치/ })).toBeVisible();
  expect(await page.evaluate(() => window.starts)).toBe(1);
  await page.getByRole('button', { name: '← 타이틀로' }).click();
  await ready(page);
  const [x, y] = await startSpot(page);
  await page.getByRole('button', { name: '타이틀 연출 다시 보기' }).click();
  await intro(page);
  await page.mouse.click(x, y);
  await ready(page);
  expect(await page.evaluate(() => window.starts)).toBe(1);
  expect(errors).toEqual([]);
});

for (const [width, height] of [[768, 1024], [390, 844], [1024, 768], [2560, 1080], [844, 390]]) {
  test(`화면 ${width}×${height}: 핵심 영역과 버튼이 모두 보임`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await ready(page);
    const box = await page.locator('.canvas').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(-1);
    expect(box.y).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
    // 지도 화면과 같은 가운데 세로 기둥(폭은 높이의 3/4까지).
    const column = await stage(page).boundingBox();
    expect(column.width).toBeCloseTo(Math.min(width, height * 3 / 4), 0);
    expect(column.x).toBeCloseTo((width - column.width) / 2, 0);
    if (width / height >= 3 / 4) {
      // 3:4이거나 더 넓으면 핵심 영역이 기둥을 띠 없이 꽉 채운다.
      expect([box.x - column.x, box.y, column.x + column.width - box.x - box.width, height - box.y - box.height].every(gap => Math.abs(gap) <= 1)).toBe(true);
    } else {
      // 더 긴 화면은 하늘이 위로, 땅이 아래로 이어진다.
      expect((await page.locator('[data-layer="sky-tall"]').boundingBox()).y).toBeLessThanOrEqual(0);
      const ground = await page.locator('[data-layer="ground-tall"]').boundingBox();
      expect(ground.y + ground.height).toBeGreaterThan(box.y + box.height + 100);
    }
    expect(await loops(page)).toEqual([]);
    await expect(page.getByRole('button', { name: '타이틀 연출 다시 보기' })).toBeInViewport();
    const start = page.getByRole('button', { name: '게임 시작' });
    await expect(start).toBeInViewport();
    const startBox = await start.boundingBox();
    expect(startBox.height).toBeGreaterThanOrEqual(44);
    // 시작 문구는 전사 발 아래 어두운 땅 위에 있다.
    const warrior = await page.locator('[data-layer="warrior-front"]').boundingBox();
    expect(startBox.y).toBeGreaterThanOrEqual(warrior.y + warrior.height - 1);
    await page.screenshot({ path: test.info().outputPath(`title-${width}x${height}.png`) });
    await start.click();
    await expect(page.getByRole('button', { name: /^1대1 매치/ })).toBeVisible();
  });
}

// iPad mini 5 홈 화면 앱 실측: 화면은 1024×768인데 CSS 높이는 736만 받아 아래 32가 비었다.
// 배포 직후 첫 실행처럼 CSS가 스크립트보다 늦게 와도 같은 결과여야 한다(실기기에서 688만큼 밀린 적 있음).
for (const [name, ios, standalone, height, slowCss] of [['iOS 홈 화면 앱은 아래까지 채움', true, true, 768], ['iOS 홈 화면 앱은 CSS가 늦어도 같음', true, true, 768, true], ['iOS 브라우저는 그대로', true, false, 736], ['iOS가 아니면 그대로', false, true, 736]]) {
  test(`화면 높이를 짧게 받을 때 ${name}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1024, height: 736 }, screen: { width: 768, height: 1024 }, reducedMotion: 'reduce' });
    await context.addInitScript(([ios, standalone]) => {
      const supports = CSS.supports.bind(CSS);
      CSS.supports = (...args) => (ios && args[0] === '-webkit-touch-callout') || supports(...args);
      Object.defineProperty(Navigator.prototype, 'standalone', { get: () => standalone });
    }, [ios, standalone]);
    if (slowCss) await context.route('**/assets/*.css', async route => { await new Promise(done => setTimeout(done, 1500)); await route.continue(); });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4173/');
    await ready(page);
    const box = await page.locator('.canvas').boundingBox();
    expect(Math.round(box.y + box.height)).toBe(height);
    expect((await page.locator('.stage').boundingBox()).height).toBe(height);
    await context.close();
  });
}

test('터치: 연출 중 누르면 건너뛰기만 하고 다시 누르면 시작', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/');
  await intro(page);
  await page.touchscreen.tap(...await startSpot(page));
  await ready(page);
  await page.getByRole('button', { name: '게임 시작' }).tap();
  await expect(page.getByRole('button', { name: /^1대1 매치/ })).toBeVisible();
  await context.close();
});

test('이미지 실패 뒤 재시도', async ({ page }) => {
  await page.route('**/title/mage.webp*', route => route.abort());
  await page.goto('/');
  await expect(stage(page)).toHaveAttribute('data-state', 'error');
  await expect(page.getByRole('button', { name: '다시 불러오기' })).toBeVisible();
  await page.unroute('**/title/mage.webp*');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '다시 불러오기' }).click();
  await ready(page);
  expect(await page.locator('.art img').count()).toBe(9);
});

test('연출 중 모션 줄이기 적용', async ({ page }) => {
  await page.goto('/');
  await intro(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  expect(await loops(page)).toEqual([]);
});

test('첫 로딩 용량', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await ready(page);
  const entries = await page.evaluate(() => performance.getEntriesByType('resource').map(item => ({ name: item.name, bytes: item.transferSize })));
  const bytes = entries.reduce((sum, item) => sum + item.bytes, 0);
  expect(entries.some(item => item.name.endsWith('.woff2'))).toBe(true);
  expect(entries.some(item => item.name.includes('layout.json'))).toBe(false);
  expect(bytes).toBeGreaterThan(300000);
  // 세로 타이틀 실측 약 0.46MB(2026-10-18, 생성 원본을 그대로 쓴 뒤). 지형을 절반 크기로 내보내 이전 가로 타이틀(약 0.72MB)보다 작다.
  expect(bytes).toBeLessThan(500000);
  console.log(`첫 로딩 리소스: ${bytes} bytes`);
});

test('동작 줄이기: 순차 등장, 다시 보기는 설정을 바꾸지 않고 한 번만 전체 재생', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await intro(page);
  await expect(stage(page)).toHaveAttribute('data-motion', 'reduced');
  const transforms = await page.locator('.art').evaluate(art => [...art.children].map(layer => layer.getAnimations()[0].effect.getKeyframes()[0].transform));
  expect(transforms.every(value => value === 'none')).toBe(true);
  await ready(page);
  await expect(page.locator('.motion-note')).toBeVisible();
  await page.getByRole('button', { name: '타이틀 연출 다시 보기' }).click();
  await intro(page);
  await expect(stage(page)).toHaveAttribute('data-motion', 'full');
  const from = await page.locator('[data-layer="warrior-front"]').evaluate(layer => layer.getAnimations()[0].effect.getKeyframes()[0].transform);
  expect(from).toContain('translate');
  await page.getByRole('button', { name: '연출 건너뛰기' }).click();
  await ready(page);
  await expect(stage(page)).toHaveAttribute('data-motion', 'reduced');
  await expect(page.locator('.motion-note')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('title-motion'))).toBeNull();
  await page.reload();
  await expect(stage(page)).toHaveAttribute('data-motion', 'reduced');
});

test('화면이 가려진 동안 연출을 멈추고 돌아오면 이어서 재생', async ({ page }) => {
  await page.addInitScript(() => {
    window.testHidden = true;
    Object.defineProperty(document, 'hidden', { get: () => window.testHidden });
  });
  await page.goto('/');
  await intro(page);
  // 처음부터 깔린 앞 땅은 이미 끝난 상태이고, 나머지는 멈춰 있다.
  const paused = await page.locator('.art').evaluate(art => [...art.children].every(layer => ['paused', 'finished'].includes(layer.getAnimations()[0].playState)));
  expect(paused).toBe(true);
  await page.evaluate(() => { window.testHidden = false; document.dispatchEvent(new Event('visibilitychange')); });
  await ready(page);
});

test('대기 연출: 60~90초 안에 멈추고, 화면이 숨으면 멈췄다가 다시 보이면 처음부터', async ({ page }) => {
  await page.addInitScript(() => {
    window.testHidden = false;
    Object.defineProperty(document, 'hidden', { get: () => window.testHidden });
  });
  const visible = shown => page.evaluate(shown => { window.testHidden = !shown; document.dispatchEvent(new Event('visibilitychange')); }, shown);
  const idle = () => page.locator('.art').evaluate(art => art.getAnimations({ subtree: true }).map(item => (
    { state: item.playState, time: item.currentTime, duration: item.effect.getTiming().duration, end: item.effect.getComputedTiming().endTime })));
  await page.goto('/');
  await ready(page);
  const first = await idle();
  expect(first).toHaveLength(7);
  // 무한 반복이면 Infinity라 실패한다.
  expect(first.every(item => item.state === 'running' && item.end >= 60000 && item.end <= 90000)).toBe(true);
  await visible(false);
  expect((await idle()).every(item => item.state === 'paused')).toBe(true);
  await visible(true);
  expect((await idle()).every(item => item.state === 'running')).toBe(true);
  // 횟수를 다 마치면 남는 연출이 없어 화면을 다시 그리지 않는다.
  await page.locator('.art').evaluate(art => { for (const item of art.getAnimations({ subtree: true })) item.currentTime = item.effect.getComputedTiming().endTime; });
  expect(await idle()).toEqual([]);
  await visible(false);
  await visible(true);
  const again = await idle();
  expect(again).toHaveLength(7);
  expect(again.every(item => item.state === 'running' && item.time < item.duration)).toBe(true);
});

test('움직임 설정은 다음 실행에도 유지', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await ready(page);
  await page.getByRole('button', { name: '움직임: 줄임', exact: true }).click();
  await expect(stage(page)).toHaveAttribute('data-motion', 'full');
  await ready(page);
  await page.reload();
  await expect(stage(page)).toHaveAttribute('data-motion', 'full');
  await ready(page);
  await page.getByRole('button', { name: '움직임: 전체', exact: true }).click();
  await ready(page);
  await expect(stage(page)).toHaveAttribute('data-motion', 'reduced');
});
