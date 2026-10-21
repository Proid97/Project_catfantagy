// node team3d.mjs <맞춘 그림.png> <블렌더 팀 자리 렌더.png> <출력 -team.png> [넓힐 px=14]
// 블렌더가 아는 팀 색 자리(지붕·깃발)를 넓힌 범위와 겹치는 칠한 그림의 회색 덩어리를 원본 그대로 복사한다.

import sharp from 'sharp';
const [f, tf, out, gr] = process.argv.slice(2);
const S = 1024, G = Number(gr || 14), N = S * S;
const a = await sharp(f).ensureAlpha().raw().toBuffer();
const t = await sharp(tf).ensureAlpha().raw().toBuffer();
let zone = new Uint8Array(N);
for (let i = 0; i < N; i++) zone[i] = t[i * 4 + 3] > 20 ? 1 : 0;
for (let k = 0; k < G; k++) { const z = Uint8Array.from(zone); for (let i = 0; i < N; i++) if (!zone[i]) { const x = i % S; if ((x > 0 && zone[i - 1]) || (x < S - 1 && zone[i + 1]) || zone[i - S] || zone[i + S]) z[i] = 1; } zone = z; }
// 회색 덩어리(8방향 연결)의 20% 이상이 팀 자리와 겹치면 덩어리 전체를 넣음(깃발이 몇 px 어긋나도 통째로). 아주 어두운 곳(문·창 구멍)은 뺌
const gray = new Uint8Array(N);
for (let i = 0; i < N; i++) { const r = a[i * 4], g = a[i * 4 + 1], b = a[i * 4 + 2]; if (a[i * 4 + 3] > 0 && Math.max(r, g, b) >= 45 && Math.max(r, g, b) - Math.min(r, g, b) <= 16) gray[i] = 1; }
const pick = new Uint8Array(N), seen = new Uint8Array(N);
for (let i = 0; i < N; i++) if (gray[i] && !seen[i]) {
  const comp = [i]; seen[i] = 1; let hit = 0;
  for (let k = 0; k < comp.length; k++) { const p = comp[k], x = p % S; if (zone[p]) hit++;
    for (const d of [-1, 1, -S, S, -S - 1, -S + 1, S - 1, S + 1]) { const q = p + d; if (q < 0 || q >= N || Math.abs((q % S) - x) > 1 || seen[q] || !gray[q]) continue; seen[q] = 1; comp.push(q); } }
  if (comp.length >= 40 && hit >= comp.length * 0.2) for (const p of comp) pick[p] = 1;
}
const m = Buffer.alloc(N * 4); let n = 0, op = 0;
for (let i = 0; i < N; i++) { if (a[i * 4 + 3] > 128) op++; if (pick[i]) { a.copy(m, i * 4, i * 4, i * 4 + 4); n++; } }
await sharp(m, { raw: { width: S, height: S, channels: 4 } }).png().toFile(out);
console.log(`${out}: 팀 색 ${(100 * n / op).toFixed(1)}%`);
