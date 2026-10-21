// 판 위 말·카드·아이콘을 실행용 그림 한 장으로 굽는다(2026-10-21 사용자 결정: 받침·외곽선·동전 틀은 코드로 그려 미리 이미지화).
// 생성 원본은 바꾸지 않고, 여기서 합치고 줄이기만 한다. 결과는 public/에 두고 커밋하지 않는다.
import sharp from 'sharp';

export const S = 1024;
const raw = async input => sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const png = (data, width, height) => sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
const svg = (width, height, body) => Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`);

// 알파가 있는 그림 둘레에 매끈한 외곽선을 깐다. 반지름 r px의 원판으로 넓히고, 가장자리 1px은 거리로 부드럽게 한다.
// 2026-10-19에 빌드 외곽선이 덩어리지고 거칠다는 평이 있어, 최종 크기에서 얇게(2~3px) 그리고 색은 순검정 대신 짙은 갈색을 쓴다.
export async function outline(input, r = 2.5, color = [31, 23, 18]) {
  const { data, info: { width: w, height: h } } = await raw(input);
  const out = Buffer.alloc(w * h * 4);
  const R = Math.ceil(r + 1), offsets = [];
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const k = Math.min(1, Math.max(0, r + 0.5 - Math.hypot(dx, dy)));
    if (k > 0) offsets.push([dx, dy, k]);
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let a = 0;
    for (const [dx, dy, k] of offsets) {
      const X = x + dx, Y = y + dy;
      if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
      const v = data[(Y * w + X) * 4 + 3] * k;
      if (v > a) { a = v; if (a >= 255) break; }
    }
    const i = (y * w + x) * 4;
    out[i] = color[0]; out[i + 1] = color[1]; out[i + 2] = color[2]; out[i + 3] = a;
  }
  return sharp(await png(out, w, h)).composite([{ input: await sharp(input).png().toBuffer() }]).png().toBuffer();
}

// 그림 영역(알파 > t)
export async function bbox(input, t = 40) {
  const { data, info: { width: w, height: h } } = await raw(input);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > t) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

// 건물 말: 1024 캔버스(땅 가운데 512, 840) 그림 + 팀 색 마스크.
// 1) 플레이어 색 받침(타원 윗면과 두께)을 회색으로 그려 건물 뒤에 깔고, 마스크에도 넣는다(코드가 플레이어 색으로 칠함).
// 2) 받침까지 포함한 실루엣에 외곽선. 3) 모든 건물이 같은 상자(BUILDING_BOX)로 잘려 기준점이 같다.
export const BUILDING_BOX = { left: 172, top: 160, width: 680, height: 900 }; // 받침이 원본 캔버스(1024) 아래로 나갈 수 있어 1080 높이 캔버스에서 자른다
export async function bakeBuilding(artFile, teamFile, width) {
  // 받침 크기: 그림 아래쪽 160px 줄들의 가장 넓은 폭(건물 바닥 둘레)보다 양옆 34px씩 크게. 아래 끝은 건물보다 30px 아래.
  const { data, info } = await raw(artFile);
  const { top, height } = await bbox(artFile, 128), y1 = top + height - 1;
  let fx0 = S, fx1 = 0;
  for (let y = y1 - 160; y <= y1; y++) for (let x = 0; x < S; x++) if (data[(y * info.width + x) * 4 + 3] > 128) { fx0 = Math.min(fx0, x); fx1 = Math.max(fx1, x); }
  const th = 18, rx = Math.round(Math.min(240, (fx1 - fx0) / 2 + 34)), ry = Math.round(rx * 0.5), cx = Math.round((fx0 + fx1) / 2), cy = y1 + 30 - ry - th;
  // 받침 회색: 윗면 112(플레이어 색 그대로), 두께 72(어둡게)
  const base = svg(S, S + 56, `<ellipse cx="${cx}" cy="${cy + th}" rx="${rx}" ry="${ry}" fill="rgb(72,72,72)"/><rect x="${cx - rx}" y="${cy}" width="${rx * 2}" height="${th}" fill="rgb(72,72,72)"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="rgb(112,112,112)"/>`);
  const art = await sharp(base).composite([{ input: artFile }]).png().toBuffer();
  // 마스크: 받침에서 건물이 가리는 곳을 빼고, 지붕·깃발 마스크를 올린다
  const team = await sharp(base).composite([{ input: artFile, blend: 'dest-out' }, { input: teamFile }]).png().toBuffer();
  const crop = async (b, line) => {
    const small = await sharp(b).extract(BUILDING_BOX).resize(width).png().toBuffer();
    return line ? outline(small, width / 120) : small;
  };
  // 받침 가운데(판에서 꼭짓점에 맞출 점)를 잘린 그림 안의 비율로 돌려준다
  return { art: await crop(art, true), team: await crop(team, false), anchor: [(cx - BUILDING_BOX.left) / BUILDING_BOX.width, (cy - BUILDING_BOX.top) / BUILDING_BOX.height] };
}

// 캐릭터 그림의 '몸'과 '머리' 위치. 가는 무기·깃대는 빼려고 폭이 가장 넓은 줄의 25% 이상인 줄만 몸으로 본다.
// 머리 가로 위치는 몸 위쪽 40% 줄의 불투명 픽셀 평균.
export async function focus(input) {
  const { data, info: { width: w, height: h } } = await raw(input);
  const rows = [];
  for (let y = 0; y < h; y++) { let c = 0; for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 128) c++; rows.push(c); }
  const lim = Math.max(...rows) * 0.25;
  const top = rows.findIndex(c => c >= lim), bottom = h - 1 - [...rows].reverse().findIndex(c => c >= lim);
  let sx = 0, n = 0;
  for (let y = top; y < top + (bottom - top) * 0.4; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 128) { sx += x; n++; }
  return { top, bottom, headX: sx / n, width: w, height: h };
}

// 동전 토큰(2026-10-21 사용자 결정: 코드로 그린 동전). 1024 캔버스, 동전 가운데 (TOKEN.cx, TOKEN.cy).
// 바깥 테두리와 두께는 회색(팀 색 마스크, 코드가 플레이어 색으로 칠함), 안쪽 크림색 고리, 그 안에 종족 배경과 캐릭터.
// 캐릭터는 원판 밖으로 나가지 않게 자르고, 머리가 원판 지름의 절반이 되게 키워 얼굴이 크게 보이게 한다(잘려도 됨).
// 왼쪽 위에 체력(하트)·마나(물방울) 아이콘을 굽고, 숫자는 실행 중 코드가 TOKEN.hp·TOKEN.mana 자리([가운데 x, y, 반지름])에 쓴다.
export const TOKEN = { cx: 548, cy: 528, rim: 400, ring: 350, disc: 326, depth: 46, head: 0.5, hp: [184, 186, 146], mana: [130, 468, 116] };
export async function bakeToken(artFile, look, bgFile, icons, width) {
  const { cx, cy, rim, ring, disc, depth } = TOKEN;
  const g = v => `rgb(${v},${v},${v})`;
  const studs = [0, 45, 90, 135, 180, 225, 270, 315].map(a => {
    const t = a * Math.PI / 180, r = (rim + ring) / 2, x = cx + r * Math.cos(t), y = cy + r * Math.sin(t);
    return `<rect x="${x - 12}" y="${y - 12}" width="24" height="24" fill="#fff6dc" transform="rotate(${a + 45} ${x} ${y})"/>`;
  }).join('');
  // 왼쪽 위가 밝고 오른쪽 아래가 어두운 두 톤(대각선으로 나눔)
  const half = (r, light, dark, id) => `<clipPath id="${id}"><polygon points="0,0 ${S},0 0,${S}" transform="rotate(-8 ${cx} ${cy})"/></clipPath>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${dark}"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="${light}" clip-path="url(#${id})"/>`;
  const frame = svg(S, S, `<circle cx="${cx}" cy="${cy + depth}" r="${rim}" fill="${g(60)}"/><rect x="${cx - rim}" y="${cy}" width="${rim * 2}" height="${depth}" fill="${g(60)}"/>
    ${half(rim, g(126), g(96), 'a')}${half(ring, '#fff6dc', '#e2cfa4', 'b')}${studs}`);
  const team = svg(S, S, `<circle cx="${cx}" cy="${cy + depth}" r="${rim}" fill="${g(60)}"/><rect x="${cx - rim}" y="${cy}" width="${rim * 2}" height="${depth}" fill="${g(60)}"/>
    ${half(rim, g(126), g(96), 'a')}<circle cx="${cx}" cy="${cy}" r="${ring}" fill="#000" fill-opacity="1"/>`);
  const D = disc * 2;
  const circle = svg(D, D, `<circle cx="${disc}" cy="${disc}" r="${disc}" fill="#fff"/>`);
  const bg = await sharp(bgFile).resize(D, D, { fit: 'cover' }).composite([{ input: circle, blend: 'dest-in' }]).png().toBuffer();
  // 얼굴 가운데를 원판의 (0.5, 0.46)에, 머리 높이를 원판 지름의 TOKEN.head배로 맞춘다(focus.json)
  const { width: iw, height: ih } = await sharp(artFile).metadata();
  const k = TOKEN.head * D / (look.head * ih);
  const w = Math.round(iw * k), h = Math.round(ih * k);
  const left = Math.round(D * 0.5 - look.face[0] * iw * k), top = Math.round(D * 0.46 - look.face[1] * ih * k);
  // 캐릭터를 원판 크기 캔버스에 놓고(밖은 잘림) 원으로 자른다
  const big = await sharp(artFile).resize(w, h).png().toBuffer();
  // 둘레에 D만큼 빈 곳을 덧대고 원판 자리만 잘라 낸다(캐릭터가 원판보다 커도 됨)
  const padded = await sharp(big).extend({ top: D, bottom: D, left: D, right: D, background: '#0000' }).png().toBuffer();
  const cut = await sharp(padded).extract({ left: D - left, top: D - top, width: D, height: D }).png().toBuffer();
  const portrait = await sharp(cut).composite([{ input: circle, blend: 'dest-in' }]).png().toBuffer();
  // 아이콘: 지름 2r 안에 7px 여백을 두고 넣은 뒤 외곽선(여백 안에 그려져 잘리지 않음)
  const badge = async ([x, y, r], file) => ({ input: await outline(await sharp(file).resize(r * 2 - 14, r * 2 - 14, { fit: 'contain', background: '#0000' }).extend({ top: 7, bottom: 7, left: 7, right: 7, background: '#0000' }).png().toBuffer(), 6), left: x - r, top: y - r });
  const layers = [{ input: bg, left: cx - disc, top: cy - disc }, { input: portrait, left: cx - disc, top: cy - disc },
    await badge(TOKEN.hp, icons.heart), await badge(TOKEN.mana, icons.mana)];
  const art = await sharp(frame).composite(layers).png().toBuffer();
  const out = async (b, line) => { const s = await sharp(b).resize(width).png().toBuffer(); return line ? outline(s, width / 120) : s; };
  // 마스크: 테두리·두께만(안쪽 원판과 아이콘 자리는 지움)
  const teamCut = await sharp(team).composite([{ input: Buffer.from(`<svg width="${S}" height="${S}"><circle cx="${cx}" cy="${cy}" r="${ring}" fill="#000"/></svg>`), blend: 'dest-out' }, ...layers.slice(2).map(l => ({ ...l, blend: 'dest-out' }))]).png().toBuffer();
  return { art: await out(art, true), team: await out(teamCut, false) };
}

// 카드(2026-10-21 사용자 결정: 새 카드 구성). 750×1050. 틀 그림은 색마다 한 장이고 그림 창은 뚫려 있다.
// 이름·별·비용·수치·종류·설명은 실행 중 코드가 CARD 자리에 넣는다.
export const CARD = {
  width: 750, height: 1050, radius: 42,
  art: { left: 41, top: 60, width: 668, height: 592, radius: 26 },
  ribbon: { left: 112, top: 12, width: 572, height: 90 },
  medal: { cx: 76, cy: 74, r: 58 },
  stars: { left: 294, top: 110, width: 162, height: 48 },
  cost: { cx: 62, top: 178, step: 104, r: 48 },
  stats: { left: 66, top: 566, width: 618, height: 100 },
  panel: { left: 41, top: 664, width: 668, height: 346, radius: 26 },
};
export const CARD_COLORS = {
  warrior: { c1: '#f8cf5c', c2: '#e5a52e', c3: '#a8681a', dark: '#4e2e0e', panel: '#43270d', tab: '#ffe7a6' },
  mage: { c1: '#c39cf0', c2: '#9461d2', c3: '#5f3598', dark: '#2f1656', panel: '#2a1449', tab: '#ead7ff' },
  assassin: { c1: '#6a6f80', c2: '#434654', c3: '#25272f', dark: '#101116', panel: '#16171d', tab: '#d9dde8' },
  magic: { c1: '#7cb4ff', c2: '#3f84e4', c3: '#2052a4', dark: '#0e2856', panel: '#0f244b', tab: '#d6e7ff' },
  trap: { c1: '#ff8a7a', c2: '#e04a3e', c3: '#a42a22', dark: '#561310', panel: '#47110e', tab: '#ffd9d3' },
};
export async function cardFrame(color, paw, withStars) {
  const { width: W, height: H, radius: r, art: a, ribbon: b, medal: m, stars: st, panel: p } = CARD;
  const c = CARD_COLORS[color];
  const ribbon = `M${b.left} ${b.top}H${b.left + b.width}L${b.left + b.width - 26} ${b.top + b.height / 2}L${b.left + b.width} ${b.top + b.height}H${b.left}Z`;
  const tab = `M${st.left} ${st.top - 10}H${st.left + st.width}V${st.top + st.height - 18}Q${st.left + st.width} ${st.top + st.height} ${st.left + st.width - 18} ${st.top + st.height}H${st.left + 18}Q${st.left} ${st.top + st.height} ${st.left} ${st.top + st.height - 18}Z`;
  const body = `<defs><clipPath id="card"><rect width="${W}" height="${H}" rx="${r}"/></clipPath>
      <mask id="hole"><rect width="${W}" height="${H}" fill="#fff"/><rect x="${a.left}" y="${a.top}" width="${a.width}" height="${a.height}" rx="${a.radius}" fill="#000"/></mask></defs>
    <g mask="url(#hole)">
      <g clip-path="url(#card)"><rect width="${W}" height="${H}" fill="${c.c2}"/>
        <polygon points="0,0 ${W * 0.5},0 0,${W * 0.5}" fill="${c.c1}"/><polygon points="${W},${H} ${W * 0.35},${H} ${W},${H - W * 0.65}" fill="${c.c3}"/></g>
      <rect x="3.5" y="3.5" width="${W - 7}" height="${H - 7}" rx="${r - 3}" fill="none" stroke="${c.dark}" stroke-width="7"/>
      <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="${r - 14}" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="4"/>
      <rect x="${a.left - 6}" y="${a.top - 6}" width="${a.width + 12}" height="${a.height + 12}" rx="${a.radius + 6}" fill="${c.dark}"/>
      <rect x="${p.left}" y="${p.top}" width="${p.width}" height="${p.height}" rx="${p.radius}" fill="${c.panel}"/>
      <rect x="${p.left + 3}" y="${p.top + 3}" width="${p.width - 6}" height="${p.height - 6}" rx="${p.radius - 3}" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="3"/>
    </g>
    ${withStars ? `<path d="${tab}" fill="${c.dark}"/>` : ''}
    <path d="${ribbon}" transform="translate(0 6)" fill="#000" fill-opacity=".35"/>
    <path d="${ribbon}" fill="#fff6dc"/><path d="M${b.left} ${b.top + b.height * 0.56}H${b.left + b.width - 23}L${b.left + b.width} ${b.top + b.height}H${b.left}Z" fill="#f1dfb0"/>
    <path d="${ribbon}" fill="none" stroke="${c.c3}" stroke-width="6" stroke-linejoin="round"/>
    <circle cx="${m.cx}" cy="${m.cy + 6}" r="${m.r}" fill="#000" fill-opacity=".35"/>
    <circle cx="${m.cx}" cy="${m.cy}" r="${m.r}" fill="#a8681a"/><circle cx="${m.cx}" cy="${m.cy}" r="${m.r - 6}" fill="#f6c54a"/><circle cx="${m.cx}" cy="${m.cy}" r="${m.r - 16}" fill="${c.dark}"/><circle cx="${m.cx}" cy="${m.cy}" r="${m.r - 20}" fill="${c.c2}"/>`;
  const s = (m.r - 24) * 2;
  const icon = await sharp(paw).resize(s, s, { fit: 'contain', background: '#0000' }).png().toBuffer();
  return sharp(svg(W, H, body)).composite([{ input: icon, left: m.cx - s / 2, top: m.cy - s / 2 }]).png().toBuffer();
}

// 카드 뒷면: 같은 틀 모양에 짙은 남색과 금 테두리, 가운데 큰 발바닥 메달
export async function cardBack(paw) {
  const { width: W, height: H, radius: r } = CARD;
  const dots = [];
  for (let y = 40, row = 0; y < H; y += 70, row++) for (let x = row % 2 ? 35 : 70; x < W; x += 70) dots.push(`<rect x="${x - 7}" y="${y - 7}" width="14" height="14" transform="rotate(45 ${x} ${y})" fill="#fff" fill-opacity=".07"/>`);
  const body = `<defs><clipPath id="c"><rect width="${W}" height="${H}" rx="${r}"/></clipPath></defs>
    <g clip-path="url(#c)"><rect width="${W}" height="${H}" fill="#1d3a5c"/><polygon points="0,0 ${W * 0.5},0 0,${W * 0.5}" fill="#27507a"/><polygon points="${W},${H} ${W * 0.35},${H} ${W},${H - W * 0.65}" fill="#152a44"/>${dots.join('')}</g>
    <rect x="3.5" y="3.5" width="${W - 7}" height="${H - 7}" rx="${r - 3}" fill="none" stroke="#0c1a2c" stroke-width="7"/>
    <rect x="26" y="26" width="${W - 52}" height="${H - 52}" rx="${r - 18}" fill="none" stroke="#f3c552" stroke-width="8"/>
    <rect x="44" y="44" width="${W - 88}" height="${H - 88}" rx="${r - 26}" fill="none" stroke="#f3c552" stroke-opacity=".45" stroke-width="3"/>
    <circle cx="${W / 2}" cy="${H / 2 + 8}" r="190" fill="#000" fill-opacity=".3"/><circle cx="${W / 2}" cy="${H / 2}" r="190" fill="#a8681a"/><circle cx="${W / 2}" cy="${H / 2}" r="176" fill="#f6c54a"/>
    <circle cx="${W / 2}" cy="${H / 2}" r="150" fill="#0c1a2c"/><circle cx="${W / 2}" cy="${H / 2}" r="138" fill="#27507a"/>`;
  const icon = await sharp(paw).resize(220, 220, { fit: 'contain', background: '#0000' }).png().toBuffer();
  return sharp(svg(W, H, body)).composite([{ input: icon, left: W / 2 - 110, top: H / 2 - 110 }]).png().toBuffer();
}

// 카드 그림 창(668×592): 배경을 꽉 채우고 그 위에 주인공.
// 유닛: 얼굴을 (0.5, 0.40)에, 머리 높이를 창 높이의 29%로(focus.json). 냥전사 다섯 장의 카드 크기에 맞춘 값이고 창 밖은 잘린다.
// 건물: 창의 86%×82% 안에 바닥이 86% 높이에 오게. 지붕은 종족 강조색(opts.roof)으로 칠한다. 마법·함정: 창의 76% 안 가운데.
export async function cardArt(kind, artFile, bgFile, opts = {}) {
  const { width: W, height: H } = CARD.art;
  const bg = await sharp(bgFile).resize(W, H, { fit: 'cover' }).png().toBuffer();
  let subject, left = 0, top = 0;
  if (kind === 'unit') {
    const { width: iw, height: ih } = await sharp(artFile).metadata();
    const k = 0.29 * H / (opts.look.head * ih);
    const x = Math.round(W * 0.5 - opts.look.face[0] * iw * k), y = Math.round(H * 0.40 - opts.look.face[1] * ih * k);
    const big = await sharp(artFile).resize(Math.round(iw * k), Math.round(ih * k)).png().toBuffer();
    const padded = await sharp(big).extend({ top: H, bottom: H, left: W, right: W, background: '#0000' }).png().toBuffer();
    subject = await sharp(padded).extract({ left: W - x, top: H - y, width: W, height: H }).png().toBuffer();
  } else {
    let file = artFile;
    if (opts.team) {
      const { data, info } = await raw(opts.team);
      const rgb = [1, 3, 5].map(i => parseInt(opts.roof.slice(i, i + 2), 16));
      for (let i = 0; i < data.length; i += 4) { const g = data[i]; for (let ch = 0; ch < 3; ch++) data[i + ch] = Math.min(255, rgb[ch] * g / 112); }
      file = await sharp(artFile).composite([{ input: await png(data, info.width, info.height) }]).png().toBuffer();
    }
    const box = await bbox(file);
    const cut = await sharp(file).extract(box).png().toBuffer();
    const [lw, lh] = kind === 'building' ? [W * 0.86, H * 0.82] : [W * 0.76, H * 0.76];
    const k = Math.min(lw / box.width, lh / box.height);
    const w = Math.round(box.width * k), h = Math.round(box.height * k);
    subject = await sharp(cut).resize(w, h).png().toBuffer();
    left = Math.round((W - w) / 2); top = kind === 'building' ? Math.round(H * 0.86 - h) : Math.round(H * 0.48 - h / 2);
  }
  return sharp(bg).composite([{ input: subject, left, top }]).png().toBuffer();
}

// 종족 얼굴(프로필 사진): 정사각형에 종족 배경, 얼굴을 가운데(0.5, 0.52)에 두고 머리 높이를 칸의 58%로.
export async function portrait(artFile, look, bgFile, size) {
  const { width: iw, height: ih } = await sharp(artFile).metadata();
  const k = 0.58 * size / (look.head * ih);
  const x = Math.round(size * 0.5 - look.face[0] * iw * k), y = Math.round(size * 0.52 - look.face[1] * ih * k);
  const big = await sharp(artFile).resize(Math.round(iw * k), Math.round(ih * k)).png().toBuffer();
  const padded = await sharp(big).extend({ top: size, bottom: size, left: size, right: size, background: '#0000' }).png().toBuffer();
  const face = await sharp(padded).extract({ left: size - x, top: size - y, width: size, height: size }).png().toBuffer();
  return sharp(await sharp(bgFile).resize(size, size, { fit: 'cover' }).png().toBuffer()).composite([{ input: face }]).png().toBuffer();
}
