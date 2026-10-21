// node fit.mjs <칠한.png> <밑그림 렌더.png> <출력.png> — 칠한 그림의 영역을 밑그림 영역에 맞춰 줄이고(바닥 가운데 기준) 1024 캔버스에 둠. 실루엣 겹침(IoU) 출력

import sharp from 'sharp';
const [hf, bf, out, mode] = process.argv.slice(2); // mode=body: 가는 무기 자루를 빼고 몸통 높이로 맞춤(유닛)
const S = 1024;
async function bbox(buf, w, h) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (buf[(y * w + x) * 4 + 3] > 40) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
const b = await sharp(bf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const h = await sharp(hf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const B = await bbox(b.data, S, S), H = await bbox(h.data, h.info.width, h.info.height);
// 몸통: 불투명 픽셀이 가장 넓은 줄의 25% 이상인 줄들의 범위(무기 자루·깃대처럼 가는 줄은 빠짐)
function body(buf, w, h, bb) {
  const rows = []; for (let y = bb.y0; y <= bb.y1; y++) { let c = 0; for (let x = bb.x0; x <= bb.x1; x++) if (buf[(y * w + x) * 4 + 3] > 128) c++; rows.push(c); }
  const lim = Math.max(...rows) * 0.25; let y0 = rows.findIndex(c => c >= lim), y1 = rows.length - 1 - [...rows].reverse().findIndex(c => c >= lim);
  return y1 - y0 + 1;
}
const s = mode === 'body' ? body(b.data, S, S, B) / body(h.data, h.info.width, h.info.height, H) : Math.sqrt((B.w / H.w) * (B.h / H.h));
const w = Math.round(H.w * s), hh = Math.round(H.h * s);
const art = await sharp(hf).extract({ left: H.x0, top: H.y0, width: H.w, height: H.h }).resize(w, hh).png().toBuffer();
const left = Math.round(B.x0 + B.w / 2 - w / 2), top = B.y1 + 1 - hh;
const placed = await sharp({ create: { width: S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: art, left, top }]).png().toBuffer();
await sharp(placed).toFile(out);
const p = await sharp(placed).raw().toBuffer();
let i1 = 0, u = 0;
for (let i = 0; i < S * S; i++) { const A = b.data[i * 4 + 3] > 128, P = p[i * 4 + 3] > 128; if (A && P) i1++; if (A || P) u++; }
console.log(`${out}: 배율 ${s.toFixed(3)} (가로 ${(B.w / H.w).toFixed(3)}, 세로 ${(B.h / H.h).toFixed(3)}), IoU ${(i1 / u).toFixed(3)}`);
