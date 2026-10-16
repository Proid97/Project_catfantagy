import sharp from 'sharp';
import { readFile, mkdir, writeFile, stat, rename } from 'node:fs/promises';

const source = new URL('../assets/title/', import.meta.url);
const output = new URL('../public/title/', import.meta.url);
const layout = JSON.parse(await readFile(new URL('layout.json', source), 'utf8'));
await mkdir(output, { recursive: true });
const changedAt = Math.max((await stat(new URL('layout.json', source))).mtimeMs, (await stat(new URL(import.meta.url))).mtimeMs);
let originalBytes = 0;
let outputBytes = 0;
for (const layer of layout.layers) {
  const input = new URL(layer.file, source);
  const name = layer.file.replace('.png', '.webp');
  const destination = new URL(name, output);
  const original = await stat(input);
  originalBytes += original.size;
  let current;
  try { current = await stat(destination); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (!current || current.mtimeMs < Math.max(original.mtimeMs, changedAt)) {
    let image = sharp(await readFile(input));
    if (!layer.useFullImage) {
      const [left, top, right, bottom] = layer.sourceBounds;
      image = image.extract({ left, top, width: right - left, height: bottom - top });
    }
    const temporary = new URL(`${name}.tmp.webp`, output);
    await image.webp({ quality: 88, alphaQuality: 100, effort: 6 }).toFile(temporary.pathname);
    await rename(temporary, destination);
  }
  outputBytes += (await stat(destination)).size;
}
await writeFile(new URL('layout.json', output), JSON.stringify(layout));
console.log(`타이틀 이미지 ${(originalBytes / 1e6).toFixed(2)} MB → ${(outputBytes / 1e6).toFixed(2)} MB (${Math.round((1 - outputBytes / originalBytes) * 100)}% 감소)`);

// UI에서 쓰는 글자만 포함한다. 새 화면을 추가할 때 이 입력 목록에도 연결한다.
const { createFont, woff2 } = await import('fonteditor-core');
await woff2.init();
const font = await readFile(new URL('../node_modules/@fontsource/pretendard/files/pretendard-latin-700-normal.woff2', import.meta.url));
const texts = await Promise.all(['../index.html', '../src/main.js'].map(path => readFile(new URL(path, import.meta.url), 'utf8')));
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
const generated = new URL('../src/generated/', import.meta.url);
await mkdir(generated, { recursive: true });
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
