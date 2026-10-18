const bounce = 'cubic-bezier(.2,1.15,.35,1)';
const rise = 'cubic-bezier(.2,1.2,.35,1)';
const pop = 'cubic-bezier(.34,1.56,.64,1)';
// [지연, 길이, 시작 모양, 움직임, 불투명해지는 지점]. 지점이 없으면 처음부터 보인다.
// 100vh는 화면 아래 밖에서 출발한다는 뜻이다. 긴 휴대폰에서도 시작 모습이 보이지 않는다.
// 뒷산과 성은 언덕 뒤에 숨은 자리에서 올라온다. 뒷산 아래끝이 평평해 언덕이 먼저 자리 잡는다.
// 성은 89%만 내려 숨긴다. 깃발 끝은 언덕 능선 아래, 바위 아래끝은 언덕 아래끝(2000) 위에 있다.
const entrances = {
  'sky-tall': [0, 1200, 'scale(1.06)', 'ease-out'],
  'hills-tall': [0, 700, 'translateY(100vh)', bounce, .001],
  peaks: [420, 650, 'translateY(100%)', 'cubic-bezier(.2,1.1,.35,1)', .001],
  'castle-hill': [600, 650, 'translateY(89%)', rise, .001],
  'ground-tall': [760, 600, 'translateY(100vh)', bounce, .001],
  'warrior-front': [1100, 560, 'translateY(100vh)', rise, .001],
  // 냥살자와 냥법사는 전사 뒤에서 각자 바깥쪽으로 튀어나온다.
  assassin: [1560, 460, 'translate(32%, 6%) scale(.6) rotate(8deg)', pop, .2],
  mage: [1680, 460, 'translate(-32%, 6%) scale(.6) rotate(-8deg)', pop, .2],
  logo: [2120, 560, 'scale(1.7)', pop, .15],
};

export function animateTitle(layers, { reducedMotion = false, fullMotion = false } = {}) {
  return [...layers].map(layer => {
    const [delay, duration, from, easing, fadeBy] = entrances[layer.dataset.layer];
    if (reducedMotion && !fullMotion) {
      return layer.animate([{ opacity: 0, transform: 'none' }, { opacity: 1, transform: 'none' }], { delay, duration: 300, fill: 'both' });
    }
    // 지형 뒤나 화면 밖에서 기다리다가 움직이는 순간 완전히 보인다.
    const frames = fadeBy ? [{ offset: 0, opacity: 0, transform: from, easing }, { offset: fadeBy, opacity: 1 }, { offset: 1, opacity: 1, transform: 'none' }]
      : [{ offset: 0, opacity: 1, transform: from, easing }, { offset: 1, opacity: 1, transform: 'none' }];
    return layer.animate(frames, { delay, duration, fill: 'both' });
  });
}

export function syncIntroVisibility(animations, hidden) {
  for (const animation of animations) {
    if (animation.playState === 'finished' || animation.playState === 'idle') continue;
    if (hidden) animation.pause();
    else animation.play();
  }
}
