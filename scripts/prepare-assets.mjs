import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, stat, rename, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { vectorizeRaw, ColorMode, Hierarchical, PathSimplifyMode } from '@neplex/vectorizer';

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
// AI 생성 그림의 면 안쪽 얼룩을 없앤다. 색면 도형으로 다시 딴 그림에서 면 안쪽만 가져오고,
// 테두리와 색 경계에서 3px 안은 원본을 그대로 둬 외곽선의 매끈함을 지킨다(2026-10-18 비교 뒤 '2단계' 채택).
// 설정값과 비교 결과는 docs/game-design.md의 '캐릭터 아트 기준'. 원본 PNG는 바꾸지 않는다.
const cleaned = new Map();
function clean(file) {
  if (!cleaned.has(file)) cleaned.set(file, (async () => {
    const { data: original, info } = await sharp(await readFile(new URL(file, source))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height } = info;
    const hard = Buffer.from(original);
    for (let i = 3; i < hard.length; i += 4) hard[i] = hard[i] >= 128 ? 255 : 0;
    const svg = await vectorizeRaw(hard, { width, height }, {
      colorMode: ColorMode.Color, hierarchical: Hierarchical.Stacked, mode: PathSimplifyMode.Spline,
      colorPrecision: 6, layerDifference: 16, filterSpeckle: 6, cornerThreshold: 60,
      lengthThreshold: 4, maxIterations: 10, spliceThreshold: 45, pathPrecision: 2,
    });
    const flat = await sharp(Buffer.from(svg)).resize(width, height).ensureAlpha().raw().toBuffer();
    // 경계: 정리된 그림에서 오른쪽·아래 이웃과 색이나 투명도가 다른 픽셀. 여기서 3px 안은 원본을 쓴다.
    let keep = new Uint8Array(width * height);
    const differs = (p, q) => Math.abs(flat[p] - flat[q]) + Math.abs(flat[p + 1] - flat[q + 1]) + Math.abs(flat[p + 2] - flat[q + 2]) + Math.abs(flat[p + 3] - flat[q + 3]) >= 8;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!(x < width - 1 && differs(i * 4, i * 4 + 4)) && !(y < height - 1 && differs(i * 4, (i + width) * 4))) continue;
      keep[i] = 1;
      if (x < width - 1) keep[i + 1] = 1;
      if (y < height - 1) keep[i + width] = 1;
    }
    for (let step = 0; step < 3; step++) {
      const grown = Uint8Array.from(keep);
      for (let i = 0; i < keep.length; i++) if (!keep[i]) {
        const x = i % width;
        if ((x > 0 && keep[i - 1]) || (x < width - 1 && keep[i + 1]) || keep[i - width] || keep[i + width]) grown[i] = 1;
      }
      keep = grown;
    }
    for (let i = 0; i < keep.length; i++) if (keep[i]) original.copy(flat, i * 4, i * 4, i * 4 + 4);
    return sharp(flat, { raw: { width, height, channels: 4 } }).png().toBuffer();
  })());
  return cleaned.get(file);
}
// sourceBounds가 없는 층은 정리된 그림에서 실제 그림 영역을 재고 2px 여유를 둔다. 그림을 바꿔도 다시 잴 필요가 없다.
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
    const png = await clean(file);
    const [left, top, right, bottom] = layer.sourceBounds ?? await bounds(png);
    // iPad 세로(2배 화면)에서 캔버스 1px이 기기 1px이라 캐릭터·성·로고는 1배로 둔다.
    // 넓은 색면뿐인 지형(stretch)은 절반으로 줄여 디코드 메모리를 아낀다. 2배로 늘려 보여도 1배보다 거칠지 않았다(2026-10-18 비교).
    const scale = layer.fit === 'stretch' ? .5 : 1;
    const temporary = new URL(`${layer.name}.tmp.webp`, output);
    await sharp(png).extract({ left, top, width: right - left, height: bottom - top })
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

// 지도 화면 그림. 이미 깨끗한 색면 그림이라 얼룩 정리 없이 줄이기만 한다. 크기는 2배 화면에서 가장 크게 보일 때 기준.
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
  // 성(원본 512px)은 판에서 88 단위로 그린다. 최대 확대 1.4배 × 2배 화면 = 246px → 원본의 절반인 256px.
  ['game/castle', image => image.resize(256)],
  ['game/castle-team', image => image.resize(256)],
  // 재화 아이콘은 24 CSS px, 카드 뒷면은 64 CSS px 너비로 보인다.
  ...['gold', 'crystal', 'wood', 'fish'].map(name => [`game/icon-${name}`, image => image.resize(48)]),
  // 카드 뒷면은 둘레의 투명한 여백을 잘라 카드 칸을 꽉 채운다.
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
    await resize(sharp(await readFile(input))).webp({ quality: 90, alphaQuality: 100, smartSubsample: true, effort: 6 }).toFile(fileURLToPath(temporary));
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
// 아이콘은 이미 정리하고 잘라 둔 로고에서 만든다.
const logo = await readFile(new URL('logo.webp', output));
for (const [name, size] of [['app-192.png', 192], ['app-512.png', 512], ['apple-touch-icon.png', 180]]) {
  const content = await sharp(logo).resize(Math.round(size * .7), Math.round(size * .7), { fit: 'inside' }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: '#103d42' } })
    .composite([{ input: content, gravity: 'centre' }]).removeAlpha().png().toFile(fileURLToPath(new URL(name, icons)));
}
