import './dice.css';
import { createRng } from './board.js';

// 시간(ms). 눈은 굴리기 전에 정해지고, 연출은 그 결과를 보여 주기만 한다.
const RISE = 220;             // 던진 주사위가 가장 높이 오르기까지. 떨어지는 데도 같은 시간이 든다
const BOUNCES = [0.1, 0.025]; // 닿은 뒤 다시 튀는 높이(처음 높이 대비). 오르내리는 시간은 높이의 제곱근에 비례
const SETTLE = 70;            // 마지막으로 닿고 똑바로 서기까지
const SECOND_DIE = [50, 110]; // 두 번째 주사위가 늦게 출발하는 범위. 둘이 똑같이 움직이지 않게 한다
const BEAT = 60;              // 둘 다 멈춘 뒤 숫자가 나오기까지
const POP = 280;              // 숫자가 톡 튀어나오는 시간
const SPARK = 360;            // 숫자 둘레 반짝임 하나의 길이
const HOLD = 520;             // 숫자를 다 보여 주는 시간
const OUT = 240;              // 작아지며 사라지는 시간
const SKIP_HOLD = 350;        // 건너뛰면 결과를 이만큼 보여 준 뒤 사라진다
const FADE = 300;             // 움직임 줄임: 나타나고 사라지는 시간
const CALM_HOLD = 1000;       // 움직임 줄임: 결과를 보여 주는 시간
const OUT_QUAD = 'cubic-bezier(.33,.67,.67,1)'; // 오를 때 점점 느려짐(중력)
const IN_QUAD = 'cubic-bezier(.33,0,.67,.33)';  // 내려올 때 점점 빨라짐
const POP_EASE = 'cubic-bezier(.34,1.56,.64,1)';

// 크기와 자리. S는 주사위 한 변, W·H는 host 크기(px)
const SIZE = [52, 0.12, 88];  // 최소 px, 짧은 변에 대한 비율, 최대 px
const START_Y = 0.68;         // 던지는 자리(아래 가운데)
const LAND_Y = 0.5;           // 떨어지는 자리(가운데)
const TOSS = 0.2;             // 오르는 높이(H 비율)
const ROLL = 0.45;            // 처음 닿은 뒤 더 굴러가는 거리(S 비율)
const NEAR = 0.15;            // 가장 높을 때 커지는 비율. 눈앞으로 다가온 느낌
const SHADOW_DRIFT = [0.22, 0.08]; // 높이에 비례해 그림자가 오른쪽 아래로 밀리는 정도(빛은 왼쪽 위)
const TILT_X = -16;           // 멈춘 주사위를 위에서 내려다본 듯 기울여 윗면이 조금 보이게
const TILT_Y = 12;            // 두 주사위가 서로 안쪽 옆면을 조금 보이게
const SUM_ABOVE = 1.45;       // 숫자 가운데가 주사위 위로 떨어진 거리(S 비율)
// 면 음영: 빛(왼쪽 위 앞)을 덜 받는 면일수록 어둡게. 멈춘 모습 기준으로 한 번만 정한다.
const LIGHT = [-0.45, -0.75, 0.5];
const SHADE = [0.2, 0.5, 0.4]; // 이 밝기 아래부터 어두워짐, 기울기, 최대 어둡기

// 눈 n을 앞(화면 쪽)으로 돌리는 회전. dice.css의 면 배치를 되돌린 것이다(1↔6, 2↔5, 3↔4 마주 봄).
const FACE = {
  1: 'rotateX(0deg) rotateY(0deg)', 2: 'rotateX(-90deg) rotateY(0deg)', 3: 'rotateX(0deg) rotateY(-90deg)',
  4: 'rotateX(0deg) rotateY(90deg)', 5: 'rotateX(90deg) rotateY(0deg)', 6: 'rotateX(0deg) rotateY(180deg)',
};
const NORMAL = [[0, 0, 1], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, -1]]; // 1~6 면이 바깥으로 향하는 방향(y는 아래)
const FACES = [1, 2, 3, 4, 5, 6].map(n => `<i class="die-face f${n}"></i>`).join('');

// host 안에 주사위 두 개를 굴려 values 눈으로 멈추고 합을 보여 준 뒤 지운다.
// 화면 어디든 누르거나 skip()을 부르면 결과 화면으로 바로 넘어가고, 한 번 더 누르면 바로 끝난다.
// 그림은 화면 읽기에서 숨긴다. 결과 알림은 부르는 화면이 제 알림 영역에 넣는다(연출이 끝나도 남는다).
export function rollDice(host, values, { reducedMotion = false, seed = Math.floor(Math.random() * 2 ** 32) } = {}) {
  if (values.length !== 2 || !values.every(v => Number.isInteger(v) && v >= 1 && v <= 6)) throw new RangeError('주사위 눈은 1~6 두 개여야 해요');
  const rng = createRng(seed);
  const { width: W, height: H } = host.getBoundingClientRect();
  const S = Math.round(Math.min(Math.max(Math.min(W, H) * SIZE[1], SIZE[0]), SIZE[2]));
  const total = values[0] + values[1];
  const layer = document.createElement('div');
  layer.className = 'dice-layer';
  layer.style.setProperty('--die', `${S}px`);
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = `<div class="die-slot"><i class="die-shadow"></i><div class="die-lift"><div class="die">${FACES}</div></div></div>`.repeat(2)
    + `<b class="dice-sum">${total}${'<i class="dice-spark"></i>'.repeat(3)}</b>`;
  const slots = layer.querySelectorAll('.die-slot');
  const sum = layer.querySelector('.dice-sum');
  const main = [];
  let settled = 0;

  // 끝난 모습을 인라인 스타일로 먼저 둔다. 애니메이션은 시작 전 모습만 채우고(backwards), 끝나면 이 모습이 남는다.
  slots.forEach((slot, i) => {
    const side = i ? 1 : -1;
    const delay = i ? SECOND_DIE[0] + rng() * (SECOND_DIE[1] - SECOND_DIE[0]) : 0;
    const land = [W / 2 + side * S * (0.66 + rng() * 0.14), H * LAND_Y + S * (rng() - 0.5) * 0.3];
    const rest = { x: TILT_X, y: side * TILT_Y, z: (rng() < 0.5 ? 0 : 90) + (rng() - 0.5) * 16 };
    const turn = (x, y, z) => `rotateX(${rest.x + x}deg) rotateY(${rest.y + y}deg) rotateZ(${rest.z + z}deg) ${FACE[values[i]]}`;
    const [shadow, lift] = slot.children;
    const die = lift.firstChild;
    slot.style.left = `${land[0]}px`;
    slot.style.top = `${land[1]}px`;
    die.style.transform = turn(0, 0, 0);
    // 면 음영은 애니메이션 없이 한 번 칠한다. 구르는 동안에도 면마다 밝기가 달라 입체로 보인다.
    const restMatrix = new DOMMatrix(die.style.transform);
    [...die.children].forEach((face, k) => {
      const n = restMatrix.transformPoint(new DOMPoint(...NORMAL[k], 0));
      const light = n.x * LIGHT[0] + n.y * LIGHT[1] + n.z * LIGHT[2];
      face.style.setProperty('--shade', Math.min(Math.max((SHADE[0] - light) * SHADE[1], 0), SHADE[2]).toFixed(2));
    });
    if (reducedMotion) {
      main.push(slot.animate({ opacity: [0, 1] }, { duration: FADE, fill: 'backwards' }));
      return;
    }

    // 높이 [시각, px]. 땅에서 오를 땐 점점 느려지고, 꼭대기에서 내려올 땐 점점 빨라진다.
    const toss = H * TOSS * (0.9 + rng() * 0.2);
    const up = RISE * (0.92 + rng() * 0.16);
    const hops = [[0, 0], [up, toss], [2 * up, 0]];
    for (const b of BOUNCES) {
      const [t] = hops.at(-1);
      hops.push([t + up * Math.sqrt(b), toss * b], [t + 2 * up * Math.sqrt(b), 0]);
    }
    const end = hops.at(-1)[0] + SETTLE;
    hops.push([end, 0]);
    const touch = hops[2][0] / end;
    const timing = { delay, duration: end, fill: 'backwards' };
    const height = make => hops.map(([t, h]) => ({ offset: t / end, easing: h ? IN_QUAD : OUT_QUAD, ...make(h / toss, h) }));
    // 바닥 위 자리: 아래 가운데에서 일정한 빠르기로 날아와 닿고, 조금 더 굴러가며 멈춘다.
    const from = [W / 2 + side * S * (0.95 + rng() * 0.2) - land[0], H * START_Y - land[1]];
    const ground = k => `translate(${from[0] * k}px, ${from[1] * k}px)`;
    // 회전: 앞으로 구르며(X) 옆으로도 돌다가, 닿을 때마다 크게 줄어 결과 면에 선다.
    const sy = rng() < 0.5 ? -1 : 1;
    const sz = rng() < 0.5 ? -1 : 1;
    const spin = [-(360 + rng() * 180), sy * (150 + rng() * 200), sz * rng() * 120];
    const tip = [-(25 + rng() * 20), sy * (10 + rng() * 15), sz * rng() * 10];
    main.push(
      slot.animate({ opacity: [0, 1] }, { delay, duration: 80, fill: 'backwards' }),
      slot.animate([{ transform: ground(1) }, { offset: touch, transform: ground(ROLL * S / Math.hypot(...from)), easing: 'ease-out' }, { transform: ground(0) }], timing),
      lift.animate(height((k, h) => ({ transform: `translateY(${-h}px) scale(${1 + NEAR * k})` })), timing),
      shadow.animate(height((k, h) => ({ transform: `translate(${h * SHADOW_DRIFT[0]}px, ${h * SHADOW_DRIFT[1]}px) scale(${1 - 0.45 * k})`, opacity: 1 - 0.6 * k })), timing),
      die.animate([
        { transform: turn(...spin) },
        { offset: touch, transform: turn(...tip), easing: 'ease-out' },
        { offset: hops[4][0] / end, transform: turn(...tip.map(a => a * 0.2)), easing: 'ease-out' },
        { transform: turn(0, 0, 0) },
      ], timing),
    );
    settled = Math.max(settled, delay + end);
  });

  sum.style.left = `${W / 2}px`;
  sum.style.top = `${H * LAND_Y - S * SUM_ABOVE}px`;
  const popAt = reducedMotion ? 0 : settled + BEAT;
  main.push(reducedMotion ? sum.animate({ opacity: [0, 1] }, { duration: FADE, fill: 'backwards' })
    : sum.animate([{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'scale(1)' }], { delay: popAt, duration: POP, easing: POP_EASE, fill: 'backwards' }));
  if (!reducedMotion) sum.querySelectorAll('.dice-spark').forEach((spark, i) => main.push(spark.animate([
    { opacity: 0, transform: 'scale(0) rotate(-45deg)' },
    { offset: 0.4, opacity: 1, transform: 'scale(1) rotate(0deg)' },
    { opacity: 0, transform: 'scale(.5) rotate(30deg)' },
  ], { delay: popAt + POP * 0.4 + i * 70, duration: SPARK, easing: 'ease-out' })));

  const outAt = reducedMotion ? FADE + CALM_HOLD : popAt + POP + HOLD;
  const outro = [...slots, sum].map(el => el.animate(reducedMotion ? { opacity: [1, 0] } : { opacity: [1, 0], scale: [1, 0.6] },
    { delay: outAt, duration: reducedMotion ? FADE : OUT, easing: 'ease-in', fill: 'forwards' }));

  // 첫 번째: 남은 움직임을 끝내 결과를 보여 주고 잠시 뒤 사라진다. 그 뒤에 또 부르면 바로 끝난다.
  const skip = () => {
    for (const animation of main) animation.finish();
    for (const animation of outro) {
      if (animation.currentTime < outAt - SKIP_HOLD) animation.currentTime = outAt - SKIP_HOLD;
      else animation.finish();
    }
  };
  layer.addEventListener('pointerdown', skip);
  host.append(layer);
  const finished = Promise.all(outro.map(animation => animation.finished)).then(() => layer.remove());
  return { finished, skip };
}
