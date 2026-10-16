import { test, expect } from '@playwright/test';

const ready = page => expect(page.locator('.stage')).toHaveAttribute('data-state', 'ready');

test('등장 순서, 자연 종료, 시작 입력과 되돌아오기', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.stage')).toHaveAttribute('data-state', 'intro');
  const times = await page.locator('.art').evaluate(art => [...art.children].map(layer => ({
    name: layer.dataset.layer, delay: layer.getAnimations()[0].effect.getTiming().delay,
  })));
  expect(times.sort((a, b) => a.delay - b.delay).map(item => item.name)).toEqual([
    'sky', 'ground', 'regions', 'castle', 'warrior', 'assassin', 'mage', 'logo',
  ]);
  await ready(page);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  expect(await page.evaluate(() => document.fonts.check('700 24px "Catfantagy UI"'))).toBe(true);
  await page.evaluate(() => { window.starts = 0; window.addEventListener('title:start', () => window.starts++); });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => window.starts)).toBe(1);
  await page.getByRole('button', { name: '타이틀로 돌아가기' }).click();
  await ready(page);
  await page.getByRole('button', { name: '타이틀 연출 다시 보기' }).click();
  await expect(page.locator('.stage')).toHaveAttribute('data-state', 'intro');
  await page.getByRole('button', { name: '연출 건너뛰기' }).click();
  await ready(page);
  await page.waitForTimeout(4300);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  expect(errors).toEqual([]);
});

for (const [width, height] of [[1672, 941], [844, 390], [390, 844], [2560, 1080]]) {
  test(`화면 ${width}×${height}: 요소 잘림과 시작 버튼`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await ready(page);
    const box = await page.locator('.stage').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(-1);
    expect(box.y).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    await expect(page.getByRole('button', { name: '게임 시작' })).toBeInViewport();
    await page.screenshot({ path: `test-results/title-${width}x${height}.png` });
    await page.getByRole('button', { name: '게임 시작' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
}

test('터치로 시작', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/');
  await ready(page);
  await page.getByRole('button', { name: '게임 시작' }).tap();
  await expect(page.getByRole('dialog')).toBeVisible();
  await context.close();
});

test('이미지 실패 뒤 재시도', async ({ page }) => {
  await page.route('**/title/mage.webp', route => route.abort());
  await page.goto('/');
  await expect(page.locator('.stage')).toHaveAttribute('data-state', 'error');
  await expect(page.getByRole('button', { name: '다시 불러오기' })).toBeVisible();
  await page.unroute('**/title/mage.webp');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '다시 불러오기' }).click();
  await ready(page);
  expect(await page.locator('.art img').count()).toBe(8);
});

test('연출 중 모션 줄이기 적용', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.stage')).toHaveAttribute('data-state', 'intro');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
});

test('첫 로딩 용량과 시작 버튼 터치 크기', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await ready(page);
  const entries = await page.evaluate(() => performance.getEntriesByType('resource').map(item => ({ name: item.name, bytes: item.transferSize })));
  const bytes = entries.reduce((sum, item) => sum + item.bytes, 0);
  expect(entries.some(item => item.name.endsWith('.woff2'))).toBe(true);
  expect(bytes).toBeGreaterThan(500000);
  expect(bytes).toBeLessThan(1100000);
  const button = await page.getByRole('button', { name: '게임 시작' }).boundingBox();
  expect(button.height).toBeGreaterThanOrEqual(44);
  console.log(`첫 로딩 리소스: ${bytes} bytes`);
});
