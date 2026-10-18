import assert from 'node:assert/strict';
import { readFile, stat, readdir } from 'node:fs/promises';
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
const css = await readFile(new URL((await readdir(new URL('assets/', dist))).find(name => name.endsWith('.css')), new URL('assets/', dist)), 'utf8');
assert.ok(css.includes('safe-area-inset-top'));
for (const path of ['./', './Project_catfantagy/']) {
  const root = new URL(path, 'https://example.invalid/');
  assert.equal(new URL(manifest.start_url, root).href, root.href);
  for (const icon of manifest.icons) assert.ok(new URL(icon.src, root).pathname.startsWith(root.pathname));
}
const layout = JSON.parse(await readFile(new URL('../src/generated/title-layout.json', import.meta.url), 'utf8'));
const { files } = JSON.parse(await readFile(new URL('../src/generated/map-art.json', import.meta.url), 'utf8'));
for (const layer of layout.layers) assert.ok((await stat(new URL(`title/${layer.name}.webp`, dist))).size > 0);
// 지도 그림: 주소의 내용 해시가 실제 파일과 같고, 아직 쓰지 않는 그림(안개·마을·구름·주사위)은 싣지 않는다.
for (const [path, revision] of Object.entries(files)) {
  assert.equal(createHash('sha256').update(await readFile(new URL(`${path}.webp`, dist))).digest('hex').slice(0, 12), revision, path);
}
const shipped = (await Promise.all(['map', 'game'].map(async folder => (await readdir(new URL(`${folder}/`, dist))).map(name => `${folder}/${name}`)))).flat();
assert.deepEqual(shipped.sort(), Object.keys(files).map(path => `${path}.webp`).sort());
console.log(`웹앱 설정 확인: 독립 실행, 상대 경로, 아이콘 3종, 안전 영역, 지도 그림 ${shipped.length}종 통과`);
