import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, stat, rename, readdir } from 'node:fs/promises';

const source = new URL('../assets/title/', import.meta.url);
const output = new URL('../public/title/', import.meta.url);
const generated = new URL('../src/generated/', import.meta.url);
const layout = JSON.parse(await readFile(new URL('layout.json', source), 'utf8'));
await mkdir(output, { recursive: true });
await mkdir(generated, { recursive: true });
const changedAt = Math.max((await stat(new URL('layout.json', source))).mtimeMs, (await stat(new URL(import.meta.url))).mtimeMs);
let originalBytes = 0;
let outputBytes = 0;
for (const file of new Set(layout.layers.map(layer => layer.file))) originalBytes += (await stat(new URL(file, source))).size;
for (const layer of layout.layers) {
  const input = new URL(layer.file, source);
  const destination = new URL(`${layer.name}.webp`, output);
  let current;
  try { current = await stat(destination); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (!current || current.mtimeMs < Math.max((await stat(input)).mtimeMs, changedAt)) {
    const [left, top, right, bottom] = layer.sourceBounds;
    // 비율을 지키는 그림은 큰 화면에서도 선명하게, 늘려 채우는 지형은 원본 크기로 둔다.
    const scale = layer.fit === 'stretch' ? 1 : 1.75;
    const temporary = new URL(`${layer.name}.tmp.webp`, output);
    await sharp(await readFile(input)).extract({ left, top, width: right - left, height: bottom - top })
      .resize({ width: Math.ceil(layer.w * scale), height: Math.ceil(layer.h * scale), fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 88, alphaQuality: 100, effort: 6 }).toFile(temporary.pathname);
    await rename(temporary, destination);
  }
  const bytes = await readFile(destination);
  layer.revision = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  outputBytes += bytes.length;
}
await writeFile(new URL('title-layout.json', generated), JSON.stringify(layout));
console.log(`타이틀 이미지 ${(originalBytes / 1e6).toFixed(2)} MB → ${(outputBytes / 1e6).toFixed(2)} MB (${Math.round((1 - outputBytes / originalBytes) * 100)}% 감소)`);

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
const logo = layout.layers.find(layer => layer.file === 'logo.png');
const [left, top, right, bottom] = logo.sourceBounds;
for (const [name, size] of [['app-192.png', 192], ['app-512.png', 512], ['apple-touch-icon.png', 180]]) {
  const content = await sharp(await readFile(new URL(logo.file, source)))
    .extract({ left, top, width: right - left, height: bottom - top })
    .resize(Math.round(size * .7), Math.round(size * .7), { fit: 'inside' }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: '#103d42' } })
    .composite([{ input: content, gravity: 'centre' }]).removeAlpha().png().toFile(new URL(name, icons).pathname);
}
