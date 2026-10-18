import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, stat, rename, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = new URL('../assets/title/', import.meta.url);
const output = new URL('../public/title/', import.meta.url);
const generated = new URL('../src/generated/', import.meta.url);
const layout = JSON.parse(await readFile(new URL('layout.json', source), 'utf8'));
await mkdir(output, { recursive: true });
await mkdir(generated, { recursive: true });
const changedAt = Math.max((await stat(new URL('layout.json', source))).mtimeMs, (await stat(new URL(import.meta.url))).mtimeMs);
let originalBytes = 0;
let outputBytes = 0;
// 결과 파일이 없거나 changed 시각보다 오래됐으면 다시 만든다.
async function stale(destination, changed) {
  try { return (await stat(destination)).mtimeMs < changed; } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return true;
  }
}
// 생성 원본을 그대로 쓴다(사용자 결정). 예외 하나: 예전 원본(냥법사·냥살자·로고)은 몸 안쪽도 알파 128~254로 살짝 비쳐
// 뒤 층이 보인다. 그림 경계(알파 128 미만)에서 3px 넘게 들어간 픽셀만 불투명하게 하고, 1~2px의 부드러운 가장자리와 색은 원본 그대로 둔다.
async function opaque(png) {
  const { data, info: { width, height } } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const solid = (x, y) => x < 0 || y < 0 || x >= width || y >= height || data[(y * width + x) * 4 + 3] >= 128;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4 + 3;
    if (data[i] < 128 || data[i] === 255) continue;
    let inner = true;
    for (let dy = -3; dy <= 3 && inner; dy++) for (let dx = -3; dx <= 3 && inner; dx++) inner = solid(x + dx, y + dy);
    if (inner) data[i] = 255;
  }
  return sharp(data, { raw: { width, height, channels: 4 } });
}
// sourceBounds가 없는 층은 원본에서 실제 그림 영역(알파 128 이상)을 재고 2px 여유를 둔다. 그림을 바꿔도 다시 잴 필요가 없다.
async function bounds(png) {
  const { data, info } = await sharp(png).extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = 0, bottom = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[y * info.width + x] >= 128) {
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return [Math.max(0, left - 2), Math.max(0, top - 2), Math.min(info.width, right + 3), Math.min(info.height, bottom + 3)];
}
for (const layer of layout.layers) {
  const file = `${layer.name}.png`;
  const input = new URL(file, source);
  originalBytes += (await stat(input)).size;
  const destination = new URL(`${layer.name}.webp`, output);
  if (await stale(destination, Math.max((await stat(input)).mtimeMs, changedAt))) {
    const png = await readFile(input);
    const [left, top, right, bottom] = layer.sourceBounds ?? await bounds(png);
    // iPad 세로(2배 화면)에서 캔버스 1px이 기기 1px이라 캐릭터·성·로고는 1배로 둔다.
    // 넓은 색면뿐인 지형(stretch)은 절반으로 줄여 디코드 메모리를 아낀다. 2배로 늘려 보여도 1배보다 거칠지 않았다(2026-10-18 비교).
    const scale = layer.fit === 'stretch' ? .5 : 1;
    const temporary = new URL(`${layer.name}.tmp.webp`, output);
    await (await opaque(png)).extract({ left, top, width: right - left, height: bottom - top })
      .resize({ width: Math.ceil(layer.w * scale), height: Math.ceil(layer.h * scale), fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 88, alphaQuality: 100, effort: 6 }).toFile(fileURLToPath(temporary));
    await rename(temporary, destination);
  }
  const bytes = await readFile(destination);
  layer.revision = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  outputBytes += bytes.length;
}
await writeFile(new URL('title-layout.json', generated), JSON.stringify(layout));
console.log(`타이틀 이미지 ${(originalBytes / 1e6).toFixed(2)} MB → ${(outputBytes / 1e6).toFixed(2)} MB (${Math.round((1 - outputBytes / originalBytes) * 100)}% 감소)`);

// 임시 · 스티커 테두리: 그림 둘레에 크림색 띠, 그 바깥에 얇은 짙은 선을 빌드 때 굽는다. 그릴 때 드는 비용이 없다.
// band·line은 결과 그림의 px. 그림(알파 128 이상)에서 떨어진 거리로 칠해 모서리가 둥글고 바깥 1px이 부드럽다.
// 캔버스 크기는 그대로라 둘레에 band + line + 0.5px 넘게 빈 곳이 있어야 한다. 성·재화 아이콘에 쓰고, 마을·길·다른 건물도 이걸로 두른다.
const OUTLINE = { band: [255, 246, 223], line: [43, 32, 20] }; // 지도 화면의 숫자 패(#fff6df)·성 테두리(#2b2014)와 같은 색
async function sticker(image, band, line) {
  const { data, info: { width, height } } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const reach = band + line;
  const r = Math.ceil(reach + .5);
  const near = []; // 가까운 순서의 이웃 [dx, dy, 거리]
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) near.push([dx, dy, Math.hypot(dx, dy)]);
  near.sort((a, b) => a[2] - b[2]);
  const back = Buffer.alloc(data.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const hit = near.find(([dx, dy]) => {
      const u = x + dx, v = y + dy;
      return u >= 0 && v >= 0 && u < width && v < height && data[(v * width + u) * 4 + 3] >= 128;
    });
    if (!hit) continue;
    const t = Math.min(Math.max(hit[2] - band, 0), 1); // 0이면 띠, 1이면 선. 사이 1px은 섞는다
    const i = (y * width + x) * 4;
    for (let c = 0; c < 3; c++) back[i + c] = Math.round(OUTLINE.band[c] + (OUTLINE.line[c] - OUTLINE.band[c]) * t);
    back[i + 3] = Math.round(255 * Math.min(Math.max(reach + .5 - hit[2], 0), 1));
  }
  const raw = { width, height, channels: 4 };
  return sharp(back, { raw }).composite([{ input: data, raw }]);
}

// 지도 화면 그림. 이미 깨끗한 색면 그림이라 줄이기만 하고, 성·아이콘에는 스티커 테두리를 두른다. 크기는 2배 화면에서 가장 크게 보일 때 기준.
// 지형 오브젝트는 타일과 같은 1024px 캔버스다. 같은 비율로 줄이되, 네 장을 모두 담는 상자만 잘라 디코드 메모리를 줄인다.
const OBJECTS = ['forest', 'gold-mine', 'crystal', 'rock'];
const objectFiles = OBJECTS.map(name => new URL(`../assets/map/${name}.png`, import.meta.url));
const boxes = await Promise.all(objectFiles.map(async file => bounds(await readFile(file))));
const left = Math.min(...boxes.map(box => box[0]));
const top = Math.min(...boxes.map(box => box[1]));
const width = Math.max(...boxes.map(box => box[2])) - left;
const height = Math.max(...boxes.map(box => box[3])) - top;
// 한 장이 바뀌면 상자가 바뀔 수 있어 네 장을 함께 다시 만든다.
const objectsChangedAt = Math.max(...await Promise.all(objectFiles.map(async file => (await stat(file)).mtimeMs)));
const mapArt = [
  // 바닥 타일·호수: 가장 크게 확대하면 칸 그림 하나가 약 600px.
  ...['grass-1', 'grass-2', 'grass-3', 'barren', 'lake'].map(name => [`map/${name}`, image => image.resize(600, 600)]),
  ...OBJECTS.map(name => [`map/${name}`, image => image.extract({ left, top, width, height }).resize(Math.round(width * 600 / 1024)), objectsChangedAt]),
  // 성(원본 512px)은 판에서 120 단위로 그린다. 최대 확대 1.4배 × 2배 화면 = 336px.
  // 지붕·깃발 마스크는 테두리 없이 같은 크기로 둬 성 그림과 픽셀이 맞는다. 테두리(9.8px)는 화면에서 약 3.5~4.9 CSS px(확대 1~1.4배).
  // 원본 둘레에 투명한 곳이 40px(줄이면 26px) 넘게 있어 캔버스를 넓히지 않는다.
  ['game/castle', image => sticker(image.resize(336), 7, 2.8)],
  ['game/castle-team', image => image.resize(336)],
  // 재화 아이콘은 24 CSS px(2배 화면 48px)로 보인다. 둘레의 투명한 곳을 잘라 그림을 34px 안에 맞추고,
  // 테두리(6.3px, 약 3.2 CSS px)가 들어갈 자리로 둘레를 7px 넓혀 48px로 만든다.
  ...['gold', 'crystal', 'wood', 'fish'].map(name => [`game/icon-${name}`, image => sticker(image.trim().resize(34, 34, { fit: 'contain', background: '#0000' }).extend({ top: 7, bottom: 7, left: 7, right: 7, background: '#0000' }), 4.2, 2.1)]),
  // 카드 뒷면은 64 CSS px 너비로 보인다. 둘레의 투명한 여백을 잘라 카드 칸을 꽉 채운다.
  ['game/card-back', image => image.trim().resize(128)],
];
const files = {};
let mapBytes = 0;
for (const [path, resize, changed = 0] of mapArt) {
  const input = new URL(`../assets/${path}.png`, import.meta.url);
  const destination = new URL(`../public/${path}.webp`, import.meta.url);
  await mkdir(new URL('.', destination), { recursive: true });
  if (await stale(destination, Math.max((await stat(input)).mtimeMs, changedAt, changed))) {
    const temporary = new URL(`../public/${path}.tmp.webp`, import.meta.url);
    await (await resize(sharp(await readFile(input)))).webp({ quality: 90, alphaQuality: 100, smartSubsample: true, effort: 6 }).toFile(fileURLToPath(temporary));
    await rename(temporary, destination);
  }
  const bytes = await readFile(destination);
  files[path] = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  mapBytes += bytes.length;
}
// 지도 화면은 상자 자리(원본 1024px 기준 x, y, 너비, 높이)로 오브젝트를 타일과 같은 곳에 그린다.
await writeFile(new URL('map-art.json', generated), JSON.stringify({ files, objectBox: [left, top, width, height] }));
console.log(`지도 그림 ${mapArt.length}종 ${(mapBytes / 1000).toFixed(1)} KB`);

// 모든 화면의 소스에서 필요한 글자를 모아 부분 글꼴을 만든다.
const { createFont, woff2 } = await import('fonteditor-core');
await woff2.init();
const font = await readFile(new URL('../node_modules/@fontsource/pretendard/files/pretendard-latin-700-normal.woff2', import.meta.url));
const scripts = (await readdir(new URL('../src/', import.meta.url), { recursive: true })).filter(path => path.endsWith('.js')).map(path => `../src/${path}`);
const texts = await Promise.all(['../index.html', ...scripts].map(path => readFile(new URL(path, import.meta.url), 'utf8')));
const text = [...new Set(texts.join('') + 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ↻…')].join('');
const uiFont = createFont(font, { type: 'woff2', subset: [...text].map(char => char.codePointAt(0)), compound2simple: true, kerning: true });
// OFL의 예약 이름을 보존하기 위해 배포용 부분 글꼴에 새 이름을 붙인다.
Object.assign(uiFont.get().name, {
  fontFamily: 'Catfantagy UI', preferredFamily: 'Catfantagy UI',
  fullName: 'Catfantagy UI Bold', postScriptName: 'CatfantagyUI-Bold',
  uniqueSubFamily: 'CatfantagyUI-Bold-0.1',
});
const subset = uiFont.write({ type: 'woff2', kerning: true });
const restored = createFont(subset, { type: 'woff2' }).get();
for (const char of 'TOUCH TO START냥국을불러오는중') {
  if (!(char.codePointAt(0) in restored.cmap)) throw new Error(`폰트에 글자가 없음: ${char}`);
}
await writeFile(new URL('catfantagy-ui-bold.woff2', generated), subset);
console.log(`Pretendard ${(font.length / 1000).toFixed(1)} KB → ${(subset.length / 1000).toFixed(1)} KB`);

const icons = new URL('../public/icons/', import.meta.url);
await mkdir(icons, { recursive: true });
// 아이콘은 이미 잘라 둔 로고에서 만든다.
const logo = await readFile(new URL('logo.webp', output));
for (const [name, size] of [['app-192.png', 192], ['app-512.png', 512], ['apple-touch-icon.png', 180]]) {
  const content = await sharp(logo).resize(Math.round(size * .7), Math.round(size * .7), { fit: 'inside' }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: '#103d42' } })
    .composite([{ input: content, gravity: 'centre' }]).removeAlpha().png().toFile(fileURLToPath(new URL(name, icons)));
}
