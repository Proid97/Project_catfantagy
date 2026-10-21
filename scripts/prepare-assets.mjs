import sharp from 'sharp';
import * as bake from './bake-art.mjs';
import { parseCards } from './cards-data.mjs';
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

// 지도 화면 그림. 생성 원본을 줄이기만 한다(외곽선 등 후처리 없음). 크기는 2배 화면에서 가장 크게 보일 때 기준.
// 왕성·재화 아이콘·카드 뒷면은 굽는 단계(아래)로 옮겼다. 예전 지형 오브젝트(forest.png 등)는 지형 타일로 바뀌어 원본만 보관한다.
const mapArt = [
  // 바닥 타일·호수·자원 지형 타일: 가장 크게 확대하면 칸 그림 하나가 약 600px.
  ...['grass-1', 'grass-2', 'grass-3', 'lake', 'forest-tile', 'gold-mine-tile', 'crystal-tile', 'rock-tile'].map(name => [`map/${name}`, image => image.resize(600, 600)]),
  // 안개 속 모르는 칸(2026-10-21 사용자 결정): 지형을 숨기려고 풀밭 타일의 색을 뺀 회색 칸. 모양·테두리·두께는 같다.
  ['map/unknown', image => image.resize(600, 600).modulate({ saturation: 0, brightness: 0.92 }), 0, 'grass-1'],
  // 교환소 부두(원본 512px)는 판에서 110 단위로 그린다. 최대 확대 1.4배 × 2배 화면 = 308px.
  ['map/port', image => image.resize(320)],
];
const files = {};
let mapBytes = 0;
for (const [path, resize, changed = 0, from] of mapArt) {
  // from: 다른 원본에서 만드는 그림(안개 속 회색 칸은 풀밭 타일에서)
  const input = new URL(`../assets/${from ? `map/${from}` : path}.png`, import.meta.url);
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
await writeFile(new URL('map-art.json', generated), JSON.stringify({ files }));
console.log(`지도 그림 ${mapArt.length}종 ${(mapBytes / 1000).toFixed(1)} KB`);

// 판 위 말·토큰·카드·아이콘을 굽는다(scripts/bake-art.mjs). 원본이나 굽는 코드가 바뀐 것만 다시 만든다.
const bakeCode = Math.max(changedAt, (await stat(new URL('bake-art.mjs', import.meta.url))).mtimeMs);
const art = { pieces: {}, tokens: {}, cards: {}, ui: {}, token: bake.TOKEN, card: bake.CARD };
let artBytes = 0;
async function baked(path, inputs, make, record) {
  const destination = new URL(`../public/${path}.webp`, import.meta.url);
  await mkdir(new URL('.', destination), { recursive: true });
  const newest = Math.max(bakeCode, ...await Promise.all(inputs.map(async file => (await stat(file)).mtimeMs)));
  if (await stale(destination, newest)) {
    const temporary = new URL(`../public/${path}.tmp.webp`, import.meta.url);
    await sharp(await make()).webp({ quality: 90, alphaQuality: 100, smartSubsample: true, effort: 6 }).toFile(fileURLToPath(temporary));
    await rename(temporary, destination);
  }
  const bytes = await readFile(destination);
  artBytes += bytes.length;
  record[path.split('/').pop()] = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
}
const asset = path => fileURLToPath(new URL(`../assets/${path}`, import.meta.url));
// 아이콘(블렌더 렌더): HUD 24~32 CSS px, 카드 수치 약 28 CSS px. 2배 화면 기준 96px에 외곽선.
for (const name of (await readdir(new URL('../assets/icons/', import.meta.url))).filter(file => file.endsWith('.png')).map(file => file.slice(0, -4))) {
  const file = asset(`icons/${name}.png`);
  await baked(`ui/icon-${name}`, [file], async () => bake.outline(await sharp(file).trim().resize(88, 88, { fit: 'contain', background: '#0000' }).extend({ top: 4, bottom: 4, left: 4, right: 4, background: '#0000' }).png().toBuffer(), 2.2), art.ui);
}
// 건물 말: 판에서 최대 확대 1.4배 × 2배 화면 기준 폭 288px. 받침 가운데(anchor)를 꼭짓점에 맞춘다.
const pieceNames = (await readdir(new URL('../assets/pieces/', import.meta.url))).filter(file => file.endsWith('.png') && !file.endsWith('-team.png')).map(file => file.slice(0, -4));
for (const name of pieceNames) {
  const files = [asset(`pieces/${name}.png`), asset(`pieces/${name}-team.png`)];
  let result;
  const make = async () => (result ??= await bake.bakeBuilding(...files, 288));
  await baked(`pieces/${name}`, files, async () => (await make()).art, art.pieces);
  await baked(`pieces/${name}-team`, files, async () => (await make()).team, art.pieces);
  // 기준점은 그림을 다시 굽지 않아도 알아야 해서 따로 잰다(잘라 낸 상자에 대한 비율).
  art.pieces[`${name}@anchor`] = (await bake.bakeBuilding(...files, 64)).anchor;
}
// 유닛 동전 토큰: 판에서 동전 지름은 칸 폭의 약 절반. 최대 확대 기준 폭 288px.
const focusData = JSON.parse(await readFile(new URL('../assets/cards/focus.json', import.meta.url), 'utf8'));
const units = Object.entries(focusData).filter(([id]) => id.startsWith('unit-'));
const badgeIcons = { heart: asset('icons/heart.png'), mana: asset('icons/mana.png') };
for (const [id, look] of units) {
  const race = id.split('-')[1];
  const files = [asset(look.file), asset(`cards/background-${race}.png`), badgeIcons.heart, badgeIcons.mana, new URL('../assets/cards/focus.json', import.meta.url)];
  let result;
  const make = async () => (result ??= await bake.bakeToken(asset(look.file), look, asset(`cards/background-${race}.png`), badgeIcons, 288));
  await baked(`tokens/${id}`, files, async () => (await make()).art, art.tokens);
  await baked(`tokens/${id}-team`, files, async () => (await make()).team, art.tokens);
}
// 카드: 틀 5색(그림 창은 뚫림)과 뒷면, 카드마다 그림 창. 보통 카드 330 CSS px × 2배 화면에 맞춰 원본(750)의 80%로 줄인다.
const CARD_SCALE = 0.8;
const shrink = async (buffer, width) => sharp(buffer).resize(Math.round(width * CARD_SCALE)).png().toBuffer();
// 종족 틀은 별 자리가 있는 유닛용과 없는 건물용(-plain) 두 가지
for (const [frame, color, stars] of [...Object.keys(bake.CARD_COLORS).map(color => [color, color, !['magic', 'trap'].includes(color)]), ...['warrior', 'mage', 'assassin'].map(color => [`${color}-plain`, color, false])]) {
  await baked(`cards/frame-${frame}`, [asset('icons/paw.png')], async () => shrink(await bake.cardFrame(color, asset('icons/paw.png'), stars), bake.CARD.width), art.cards);
}
// 손패 뒷면은 64 CSS px로 보이지만 카드를 크게 넘길 때도 쓰므로 폭 300px.
await baked('cards/back', [asset('icons/paw.png')], async () => sharp(await bake.cardBack(asset('icons/paw.png'))).resize(300).png().toBuffer(), art.cards);
const ROOF = { warrior: '#c8323b', mage: '#2fb5a8', assassin: '#f07060' }; // 카드 속 건물 지붕: 종족 강조색(판 위에서는 플레이어 색)
const cardArts = [
  ...units.map(([id, look]) => [id, 'unit', asset(look.file), `background-${id.split('-')[1]}`, { look }]),
  ...pieceNames.filter(name => name.startsWith('building-')).map(name => [name, 'building', asset(`pieces/${name}.png`), `background-${name.split('-')[1]}`, { team: asset(`pieces/${name}-team.png`), roof: ROOF[name.split('-')[1]] }]),
  ...(await readdir(new URL('../assets/cards/', import.meta.url))).filter(file => /^(magic|trap)-.+\.png$/.test(file)).map(file => [file.slice(0, -4), 'spell', asset(`cards/${file}`), `background-${file.split('-')[0]}`, {}]),
];
for (const [id, kind, file, background, opts] of cardArts) {
  const bg = asset(`cards/${background}.png`);
  await baked(`cards/art/${id}`, [file, bg, ...(opts.team ? [opts.team] : []), new URL('../assets/cards/focus.json', import.meta.url)], async () => shrink(await bake.cardArt(kind, file, bg, opts), bake.CARD.art.width), art.cards);
}
// 종족 얼굴(프로필): 전설 유닛 얼굴을 종족 배경 위에. 96 CSS px까지 쓰므로 192px.
const LEGEND = { warrior: 'unit-warrior-general', mage: 'unit-mage-archmage', assassin: 'unit-assassin-shadow' };
for (const [race, id] of Object.entries(LEGEND)) {
  const look = focusData[id];
  await baked(`ui/avatar-${race}`, [asset(look.file), asset(`cards/background-${race}.png`)], async () => bake.portrait(asset(look.file), look, asset(`cards/background-${race}.png`), 192), art.ui);
}
await writeFile(new URL('art.json', generated), JSON.stringify(art));
// 카드 자료는 docs/cards.md 표에서 읽는다(scripts/cards-data.mjs).
await writeFile(new URL('cards.json', generated), JSON.stringify(parseCards(await readFile(new URL('../docs/cards.md', import.meta.url), 'utf8'))));
console.log(`말·토큰·카드·아이콘 ${Object.keys(art.pieces).length + Object.keys(art.tokens).length + Object.keys(art.cards).length + Object.keys(art.ui).length}종 ${(artBytes / 1e6).toFixed(2)} MB`);

// 모든 화면의 소스에서 필요한 글자를 모아 부분 글꼴을 만든다.
const { createFont, woff2 } = await import('fonteditor-core');
await woff2.init();
const font = await readFile(new URL('../node_modules/@fontsource/pretendard/files/pretendard-latin-700-normal.woff2', import.meta.url));
const scripts = (await readdir(new URL('../src/', import.meta.url), { recursive: true })).filter(path => path.endsWith('.js')).map(path => `../src/${path}`);
const texts = await Promise.all(['../index.html', '../src/generated/cards.json', ...scripts].map(path => readFile(new URL(path, import.meta.url), 'utf8')));
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
