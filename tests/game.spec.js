import { test, expect } from '@playwright/test';

// 한 판 진행 화면(src/game-screen.js). 규칙 자체는 tests/game.test.js(엔진 시뮬레이션)가 본다.
// 시드 5(1대1): 내가 먼저 둔다(scripts/simulate.mjs와 같은 엔진·봇).
const game = page => page.locator('#map').evaluate(root => {
  const { g, busy } = root.game();
  const s = g.state;
  return { phase: s.phase, current: s.current, round: s.round, pending: s.pending[0]?.type ?? null, busy,
    roads: [...s.roads.values()].filter(owner => owner === 0).length, resources: { ...s.players[0].resources }, hand: s.players[0].hand.length,
    pick: root.game().pick?.kind ?? null, chosen: Boolean(root.game().pick?.chosen) };
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
// 첫 마을 자리(엔진의 첫 후보)를 화면에서 누르고 ✓로 확정한다. 시점이 내 왕성으로 다 옮겨 간 뒤에 잰다.
async function placeFirstVillage(page) {
  const map = page.locator('#map');
  await expect.poll(async () => (await game(page)).pending).toBe('village');
  await page.waitForTimeout(400);
  const { x, y } = await map.evaluate(root => root.mapDebug().screenOf(root.game().g.villageSpots(0)[0].vertex));
  await page.mouse.click(x, y);
  // 누르면 흐리게 놓이고 확정 전에는 아직 놓이지 않는다
  await expect(page.getByRole('button', { name: '확정' })).toBeVisible();
  expect(await map.evaluate(root => root.game().g.state.players[0].village)).toBeNull();
  await page.getByRole('button', { name: '확정' }).click();
  await expect.poll(() => map.evaluate(root => root.game().g.state.players[0].village)).not.toBeNull();
  await expect(page.getByRole('button', { name: '확정' })).toBeHidden();
}
// 내 턴 시작 화면의 큰 주사위 단추를 누르고, 자원 연출이 끝나 행동할 수 있을 때까지 기다린다
async function roll(page) {
  await page.getByRole('button', { name: '주사위 굴리기' }).click();
  await expect(page.locator('.turn-intro')).toBeHidden();
  await expect(page.getByRole('button', { name: /^턴 끝내기/ })).toBeVisible();
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

test('직접 두기: 첫 마을 → 턴 시작 화면 → 주사위 → 카드 펼치기 → 길 놓기(확정) → 턴 끝내기 → 봇 턴 뒤 다시 내 차례', async ({ page }) => {
  test.setTimeout(60000);
  const errors = watchErrors(page);
  await start(page, '/?seed=5#play');
  await placeFirstVillage(page);
  await expect(page.locator('.hud-players')).toContainText('1/12');
  // 턴 시작 화면: 굴리기 전에는 도구·턴 끝내기가 없고, 나머지 HUD는 잠겨 있다
  await expect(page.locator('.turn-intro')).toBeVisible();
  await expect(page.locator('.tools')).toBeHidden();
  expect(await page.locator('.hud').evaluate(hud => hud.inert)).toBe(true);
  await roll(page);
  expect(await page.locator('.hud').evaluate(hud => hud.inert)).toBe(false);
  // 패: 장수만큼 펼치고, 누른 카드를 크게(사용·뒤로가기)
  const { hand } = await game(page);
  await page.getByRole('button', { name: '내 카드 보기' }).click();
  await expect(page.locator('.fan-card')).toHaveCount(hand);
  await page.locator('.fan-card').first().click();
  await expect(page.locator('.fan-focus .card')).toBeVisible();
  await expect(page.getByRole('button', { name: '사용' })).toBeVisible();
  await page.getByRole('button', { name: '뒤로가기' }).click();
  await expect(page.locator('.fan-focus')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('.fan')).toBeHidden();
  // 길: 노란 변을 누르면 흐리게 놓이고(아직 그대로), ✓를 누르면 길이 늘고 나무·생선이 1씩 준다
  const before = await game(page);
  await page.locator('.tool[data-tool="road"]').click();
  await expect(page.locator('.pick-bar')).toBeVisible();
  const edge = await page.locator('#map').evaluate(root => [...root.game().marks.edges.keys()][0]);
  const point = await page.locator('#map').evaluate((root, key) => root.mapDebug().screenOf(key), edge);
  await page.mouse.click(point.x, point.y);
  await expect.poll(async () => (await game(page)).chosen).toBe(true);
  expect((await game(page)).roads).toBe(before.roads);
  await page.getByRole('button', { name: '확정' }).click();
  await expect.poll(async () => (await game(page)).roads).toBe(before.roads + 1);
  const after = await game(page);
  expect([after.resources.wood, after.resources.fish]).toEqual([before.resources.wood - 1, before.resources.fish - 1]);
  await page.locator('.pick-bar').getByRole('button', { name: '취소' }).click();
  // 건설 탭: 마을과 종족 건물 5개. 마을을 고르면 지을 자리 고르기로 들어간다
  await page.locator('.tool[data-tool="build"]').click();
  await expect(page.locator('.build-item')).toHaveCount(6);
  await expect(page.locator('.build-item').first()).toContainText('마을');
  await page.locator('.tool[data-tool="build"]').click();
  await expect(page.locator('.build-panel')).toBeHidden();
  // 턴 끝내기는 한 번 묻는다: 취소하면 그대로, 확인하면 넘어간다
  await page.getByRole('button', { name: /^턴 끝내기/ }).click();
  await expect(page.locator('.end-ask')).toContainText('턴을 종료하시겠습니까?');
  await page.locator('.end-ask').getByRole('button', { name: '취소' }).click();
  await expect(page.locator('.end-ask')).toBeHidden();
  expect((await game(page)).current).toBe(0);
  await page.getByRole('button', { name: /^턴 끝내기/ }).click();
  await page.locator('.end-ask').getByRole('button', { name: '확인' }).click();
  // 턴을 넘기면 봇이 두고(주사위는 봇 프로필에 숫자로), 다시 내 주사위 차례가 온다(중간에 고를 것이 생기면 처리)
  await expect(page.locator('.turn-banner')).toContainText('봇 1');
  await expect(page.locator('.player[data-player="1"] .roll-badge')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.dice-layer')).toHaveCount(0);
  await expect.poll(async () => {
    const take = page.getByRole('button', { name: '이 카드 가져가기' });
    if (await take.isVisible()) await take.click();
    if (await page.locator('.fan.discarding').isVisible()) {
      await page.locator('.fan-card').first().click();
      await page.getByRole('button', { name: '버리기' }).click();
    }
    const now = await game(page);
    return now.current === 0 && now.phase === 'roll' && !now.pending;
  }, { timeout: 40000 }).toBe(true);
  await expect(page.getByRole('button', { name: '주사위 굴리기' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('카드 빠른 사용: 쓸 수 있는 카드를 위로 쏘듯이 끌면 바로 사용 모드', async ({ page }) => {
  test.setTimeout(40000);
  const errors = watchErrors(page);
  await start(page, '/?seed=5#play');
  await placeFirstVillage(page);
  await roll(page);
  await page.getByRole('button', { name: '내 카드 보기' }).click();
  const card = page.locator('.fan-card.usable').first();
  await expect(card).toBeVisible();
  const uid = Number(await card.getAttribute('data-uid'));
  // 조금 끌다 놓으면 제자리로 돌아간다
  let b = await card.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 - 30, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.fan')).toBeVisible();
  // 위로 길게 끌면 패를 접고 그 카드의 사용 모드(판에 표시, 또는 고르기 창)
  b = await card.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 - 220, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('.fan')).toBeHidden();
  const using = await page.locator('#map').evaluate((root, uid) => {
    const { pick, g } = root.game();
    return (pick?.kind === 'card' && pick.uid === uid) || document.querySelector('.game-dialog').open || !g.state.players[0].hand.includes(uid);
  }, uid);
  expect(using).toBe(true);
  expect(errors).toEqual([]);
});

test('패가 넘치면 펼친 패에서 버림: 바깥을 눌러도 안 접히고, 위로 끌면 그 카드를 버림', async ({ page }) => {
  test.setTimeout(40000);
  const errors = watchErrors(page);
  await start(page, '/?seed=5#play');
  await placeFirstVillage(page);
  await roll(page);
  // 패를 6장으로 채워 두면 턴 끝에 1장을 뽑아 7장이 된다
  await page.locator('#map').evaluate(root => { const p = root.game().g.state.players[0]; while (p.hand.length < 6) p.hand.push(p.raceDeck.pop()); });
  await page.getByRole('button', { name: /^턴 끝내기/ }).click();
  await page.locator('.end-ask').getByRole('button', { name: '확인' }).click();
  await expect(page.locator('.fan.discarding')).toBeVisible();
  await expect(page.locator('.fan-note')).toContainText('1장을 버려요');
  await expect(page.locator('.fan-card')).toHaveCount(7);
  await expect(page.locator('.game-dialog')).not.toHaveAttribute('open');
  await page.mouse.click(20, 200);
  await expect(page.locator('.fan')).toBeVisible();
  const card = page.locator('.fan-card').first();
  const uid = Number(await card.getAttribute('data-uid'));
  const b = await card.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 - 220, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('.fan')).toBeHidden();
  const { hand, pending } = await page.locator('#map').evaluate(root => ({ hand: root.game().g.state.players[0].hand, pending: root.game().g.state.pending[0]?.type ?? null }));
  expect(hand).not.toContain(uid);
  expect(hand.length).toBeLessThanOrEqual(6);
  expect(pending).not.toBe('discard');
  expect(errors).toEqual([]);
});

for (const [width, height] of [[390, 844], [768, 1024], [1024, 768]]) {
  test(`게임 HUD ${width}×${height}: 단추·카드·띠가 화면 안에 겹치지 않게 있음`, async ({ page }) => {
    test.setTimeout(40000);
    await page.setViewportSize({ width, height });
    await start(page, '/?seed=5#play');
    await placeFirstVillage(page);
    const dice = await box(page.getByRole('button', { name: '주사위 굴리기' }));
    expect(dice.x >= 0 && dice.x + dice.width <= width && dice.y > height / 2 && dice.y + dice.height <= height, '주사위 단추: 화면 안, 아래쪽').toBe(true);
    await roll(page);
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
    // 펼친 패: 카드가 모두 화면 안
    await page.locator('.pick-bar').getByRole('button', { name: '취소' }).click();
    await page.getByRole('button', { name: '내 카드 보기' }).click();
    for (const card of await page.locator('.fan-card').all()) {
      const c = await box(card);
      expect(c.x >= 0 && c.y >= 0 && c.x + c.width <= width && c.y + c.height <= height, '펼친 카드 화면 안').toBe(true);
    }
  });
}
