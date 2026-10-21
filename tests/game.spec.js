import { test, expect } from '@playwright/test';

// 한 판 진행 화면(src/game-screen.js). 규칙 자체는 tests/game.test.js(엔진 시뮬레이션)가 본다.
// 시드 7(1대1): 내가 먼저 둔다(scripts/simulate.mjs와 같은 엔진·봇).
const game = page => page.locator('#map').evaluate(root => {
  const { g, busy } = root.game();
  const s = g.state;
  return { phase: s.phase, current: s.current, round: s.round, pending: s.pending[0]?.type ?? null, busy,
    roads: [...s.roads.values()].filter(owner => owner === 0).length, resources: { ...s.players[0].resources }, hand: s.players[0].hand.length };
});
function watchErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}
async function start(page, url) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(url);
  await expect.poll(() => page.locator('#map').evaluate(root => Boolean(root.game))).toBe(true);
  await expect(page.locator('#map')).toHaveAttribute('data-art', 'ready');
}
// 첫 마을 자리(엔진의 첫 후보)를 화면에서 누른다. 시점이 내 왕성으로 다 옮겨 간 뒤에 잰다.
async function placeFirstVillage(page) {
  const map = page.locator('#map');
  await expect.poll(async () => (await game(page)).pending).toBe('village');
  await page.waitForTimeout(400);
  const { x, y } = await map.evaluate(root => root.mapDebug().screenOf(root.game().g.villageSpots(0)[0].vertex));
  await page.mouse.click(x, y);
  await expect.poll(() => map.evaluate(root => root.game().g.state.players[0].village)).not.toBeNull();
}
const box = locator => locator.boundingBox();
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('자동 대전(1대1): 봇끼리 끝까지 두고, 승패 창이 뜨며 오류가 없음', async ({ page }) => {
  test.setTimeout(180000);
  const errors = watchErrors(page);
  await start(page, '/?seed=11#play-auto');
  await expect(page.locator('.over-dialog')).toBeVisible({ timeout: 170000 });
  await expect(page.locator('.over-dialog h2')).toHaveText(/승리!|패배/);
  const { phase, round } = await game(page);
  expect(phase).toBe('over');
  expect(round).toBeGreaterThan(5);
  expect(errors).toEqual([]);
});

test('자동 대전(2대2 팀전): 30초 동안 오류 없이 진행', async ({ page }) => {
  test.setTimeout(60000);
  const errors = watchErrors(page);
  await start(page, '/?seed=5#play-team-auto');
  await page.waitForTimeout(30000);
  const { round } = await game(page);
  expect(round).toBeGreaterThan(2);
  expect(errors).toEqual([]);
});

test('직접 두기: 첫 마을 → 주사위 → 카드 창 → 길 놓기 → 턴 끝내기 → 봇 턴 뒤 다시 내 차례', async ({ page }) => {
  test.setTimeout(60000);
  const errors = watchErrors(page);
  await start(page, '/?seed=7#play');
  await placeFirstVillage(page);
  await expect(page.locator('.hud-players')).toContainText('1/12');
  await page.getByRole('button', { name: '주사위 굴리기' }).click();
  await expect(page.getByRole('button', { name: /^턴 끝내기/ })).toBeVisible();
  // 카드 창: 패의 장수만큼 작은 카드, 아래에 고른 카드를 크게
  const { hand } = await game(page);
  await page.getByRole('button', { name: '내 카드 보기' }).click();
  await expect(page.locator('.hand-dialog .hand-card')).toHaveCount(hand);
  await expect(page.locator('.hand-focus .card')).toHaveCount(1);
  await page.locator('.hand-dialog').getByRole('button', { name: '닫기' }).click();
  await expect(page.locator('.hand-dialog')).toBeHidden();
  // 길: 노란 변을 눌러 놓으면 길이 늘고 나무·생선이 1씩 준다
  const before = await game(page);
  await page.locator('.tool[data-tool="road"]').click();
  await expect(page.locator('.pick-bar')).toBeVisible();
  const edge = await page.locator('#map').evaluate(root => [...root.game().marks.edges.keys()][0]);
  const point = await page.locator('#map').evaluate((root, key) => root.mapDebug().screenOf(key), edge);
  await page.mouse.click(point.x, point.y);
  await expect.poll(async () => (await game(page)).roads).toBe(before.roads + 1);
  const after = await game(page);
  expect([after.resources.wood, after.resources.fish]).toEqual([before.resources.wood - 1, before.resources.fish - 1]);
  await page.locator('.pick-bar').getByRole('button', { name: '취소' }).click();
  // 턴을 넘기면 봇이 두고, 다시 내 주사위 차례가 온다(중간에 고를 것이 생기면 처리)
  await page.getByRole('button', { name: /^턴 끝내기/ }).click();
  await expect(page.locator('.turn-banner')).toContainText('봇 1');
  await expect.poll(async () => {
    const take = page.getByRole('button', { name: '이 카드 가져가기' });
    if (await take.isVisible()) await take.click();
    const now = await game(page);
    return now.current === 0 && now.phase === 'roll' && !now.pending;
  }, { timeout: 40000 }).toBe(true);
  await expect(page.getByRole('button', { name: '주사위 굴리기' })).toBeVisible();
  expect(errors).toEqual([]);
});

for (const [width, height] of [[390, 844], [768, 1024], [1024, 768]]) {
  test(`게임 HUD ${width}×${height}: 단추·카드·띠가 화면 안에 겹치지 않게 있음`, async ({ page }) => {
    test.setTimeout(40000);
    await page.setViewportSize({ width, height });
    await start(page, '/?seed=7#play');
    await placeFirstVillage(page);
    await page.getByRole('button', { name: '주사위 굴리기' }).click();
    await expect(page.getByRole('button', { name: /^턴 끝내기/ })).toBeVisible();
    const parts = ['.hud-players', '.hud-resources', '.minimap', '.dice-roll', '.tools', '.game-hand', '.mode-change'];
    const boxes = await Promise.all(parts.map(selector => box(page.locator(selector))));
    for (const [i, b] of boxes.entries()) {
      expect(b, parts[i]).not.toBeNull();
      expect(b.x >= 0 && b.y >= 0 && b.x + b.width <= width && b.y + b.height <= height, `${parts[i]} 화면 안`).toBe(true);
      for (const [j, other] of boxes.entries()) if (j > i) expect(overlaps(b, other), `${parts[i]} ↔ ${parts[j]}`).toBe(false);
    }
    // 길 고르기 안내 띠도 아래 줄(미니맵·큰 단추·카드)과 겹치지 않는다
    await page.locator('.tool[data-tool="road"]').click();
    const bar = await box(page.locator('.pick-bar'));
    for (const selector of ['.minimap', '.dice-roll', '.game-hand']) expect(overlaps(bar, await box(page.locator(selector))), selector).toBe(false);
    expect(bar.x >= 0 && bar.x + bar.width <= width).toBe(true);
  });
}
