import { test, expect } from '@playwright/test';

async function enter(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: '게임 시작' }).click();
}

test('두 냥국 선택 → 주사위 → 준비 완료, 되돌아오기', async ({ page }) => {
  await enter(page);
  await expect(page.getByRole('button', { name: '냥국을 골라주세요' })).toBeDisabled();
  await page.getByRole('radio', { name: '냥전사', exact: true }).check();
  await page.getByRole('button', { name: '플레이어 1 선택 완료 →' }).click();
  await expect(page.getByRole('heading', { name: '플레이어 2의 냥국을 골라요' })).toBeVisible();
  await page.getByRole('radio', { name: '냥살자', exact: true }).check();
  await page.getByRole('button', { name: '플레이어 2 선택 완료 →' }).click();
  await expect(page.getByRole('button', { name: '플레이어 2 주사위 굴리기' })).toBeDisabled();
  await page.evaluate(() => { window.prepared = null; window.addEventListener('setup:ready', event => window.prepared = event.detail); });
  await page.getByRole('button', { name: '플레이어 1 주사위 굴리기' }).click();
  await page.getByRole('button', { name: '플레이어 2 주사위 굴리기' }).click();
  const game = await page.evaluate(() => window.prepared);
  expect(game.players.map(player => player.classId)).toEqual(['warrior', 'assassin']);
  expect(game.players[0].startDie).not.toBe(game.players[1].startDie);
  await expect(page.getByRole('heading', { name: `플레이어 ${game.order[0]}부터 시작해요!` })).toBeVisible();
  await page.getByRole('button', { name: '← 냥국 선택 바꾸기' }).click();
  await page.getByRole('button', { name: '시작 순서 확인 →' }).click();
  await expect(page.getByRole('heading', { name: `플레이어 ${game.order[0]}부터 시작해요!` })).toBeVisible();
  await page.getByRole('button', { name: '처음부터', exact: true }).click();
  await expect(page.getByRole('button', { name: '냥국을 골라주세요' })).toBeDisabled();
  await page.getByRole('button', { name: '← 타이틀로' }).click();
  await expect(page.getByRole('button', { name: '게임 시작' })).toBeVisible();
});

for (const [width, height] of [[390, 844], [844, 390], [768, 1024]]) {
  test(`선택 화면 ${width}×${height} 스크롤과 버튼 접근`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await enter(page);
    await page.getByRole('radio', { name: '냥법사', exact: true }).check();
    const button = page.getByRole('button', { name: '플레이어 1 선택 완료 →' });
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeInViewport();
    const box = await button.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    const overflow = await page.locator('#setup').evaluate(root => root.scrollWidth > root.clientWidth);
    expect(overflow).toBe(false);
    await button.click();
    await expect(page.getByRole('heading', { name: '플레이어 2의 냥국을 골라요' })).toBeInViewport();
  });
}
