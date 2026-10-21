import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const dist = new URL('../dist/', import.meta.url);
const html = await readFile(new URL('index.html', dist), 'utf8');
const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', dist), 'utf8'));
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.start_url, './');
assert.equal(manifest.scope, './');
assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
assert.match(html, /name="viewport"[^>]*viewport-fit=cover/);
assert.ok(!html.includes('%BASE_URL%'));
assert.match(html, /rel="manifest" href="\.\/manifest.webmanifest"/);
for (const [name, size] of [['icons/app-192.png', 192], ['icons/app-512.png', 512], ['icons/apple-touch-icon.png', 180]]) {
  const meta = await sharp(await readFile(new URL(name, dist))).metadata();
  assert.equal(meta.width, size);
  assert.equal(meta.height, size);
  assert.equal(meta.hasAlpha, false);
}
// 첫 화면 CSS(index-). 게임 화면 CSS는 첫 판을 열 때 따로 받는다.
const css = await readFile(new URL((await readdir(new URL('assets/', dist))).find(name => name.startsWith('index-') && name.endsWith('.css')), new URL('assets/', dist)), 'utf8');
assert.ok(css.includes('safe-area-inset-top'));
for (const path of ['./', './Project_catfantagy/']) {
  const root = new URL(path, 'https://example.invalid/');
  assert.equal(new URL(manifest.start_url, root).href, root.href);
  for (const icon of manifest.icons) assert.ok(new URL(icon.src, root).pathname.startsWith(root.pathname));
}
const layout = JSON.parse(await readFile(new URL('../src/generated/title-layout.json', import.meta.url), 'utf8'));
const { files } = JSON.parse(await readFile(new URL('../src/generated/map-art.json', import.meta.url), 'utf8'));
for (const layer of layout.layers) {
  // 몸 안쪽이 비치지 않는다. 반투명(알파 128~254)은 가장자리뿐이라 그림의 10%보다 적다(보정이 빠지면 97%가 넘는다).
  const alpha = await sharp(await readFile(new URL(`title/${layer.name}.webp`, dist))).ensureAlpha().extractChannel(3).raw().toBuffer();
  let solid = 0, semi = 0;
  for (const a of alpha) if (a >= 128) { solid++; if (a < 255) semi++; }
  assert.ok(solid > 0 && semi < solid * .1, `타이틀 ${layer.name}의 몸 안쪽이 비침`);
}
// 판 위 말(받침·외곽선을 구운 그림)과 플레이어 색 마스크는 크기가 같아야 픽셀이 맞는다.
const art = JSON.parse(await readFile(new URL('../src/generated/art.json', import.meta.url), 'utf8'));
for (const [group, list] of [['pieces', art.pieces], ['tokens', art.tokens]]) {
  for (const name of Object.keys(list).filter(name => !name.includes('@') && !name.endsWith('-team'))) {
    const [base, mask] = await Promise.all([name, `${name}-team`].map(async file => sharp(await readFile(new URL(`${group}/${file}.webp`, dist))).metadata()));
    assert.deepEqual([base.width, base.height], [mask.width, mask.height], `${group}/${name}`);
  }
}
// 구운 그림: 주소의 내용 해시가 실제 파일과 같다.
for (const [group, list] of [['pieces', art.pieces], ['tokens', art.tokens], ['ui', art.ui]]) {
  for (const [name, revision] of Object.entries(list)) if (!name.includes('@')) assert.equal(createHash('sha256').update(await readFile(new URL(`${group}/${name}.webp`, dist))).digest('hex').slice(0, 12), revision, `${group}/${name}`);
}
// 지도 그림: 주소의 내용 해시가 실제 파일과 같고, 쓰지 않는 그림(예전 오브젝트·안개·구름·주사위)은 싣지 않는다.
for (const [path, revision] of Object.entries(files)) {
  assert.equal(createHash('sha256').update(await readFile(new URL(`${path}.webp`, dist))).digest('hex').slice(0, 12), revision, path);
}
const shipped = (await readdir(new URL('map/', dist))).map(name => `map/${name}`);
assert.deepEqual(shipped.sort(), Object.keys(files).map(path => `${path}.webp`).sort());
console.log(`웹앱 설정 확인: 독립 실행, 상대 경로, 아이콘 3종, 안전 영역, 타이틀 층 불투명, 말 마스크 크기, 지도 그림 ${shipped.length}종, 구운 그림 해시 통과`);
