const bounce = 'cubic-bezier(.2,1.15,.35,1)';
const rise = 'cubic-bezier(.2,1.2,.35,1)';
const pop = 'cubic-bezier(.34,1.56,.64,1)';
const fall = 'cubic-bezier(.55,0,.9,.45)'; // 떨어질수록 빨라진다
// [지연, 길이, 시작 모양, 움직임, 불투명해지는 지점]. 지점이 없으면 처음부터 보인다. 시작 모양 대신 프레임 목록을 줄 수도 있다.
// 앞 땅은 처음부터 깔려 있다. 긴 휴대폰에서 땅이 올라오기 전 화면 아래가 빈 판으로 보이지 않는다.
// 언덕은 앞 땅 뒤에서, 뒷산과 성은 언덕 뒤에서 숨은 자리부터 올라온다. 뒷산 아래끝이 평평해 언덕이 먼저 자리 잡는다.
// 성은 89%만 내려 숨긴다. 깃발 끝은 언덕 능선 아래, 바위 아래끝은 언덕 아래끝(2000) 위에 있다.
const entrances = {
  'sky-tall': [0, 1200, 'scale(1.06)', 'ease-out'],
  'ground-tall': [0, 0, 'none'],
  'hills-tall': [0, 700, 'translateY(100%)', bounce, .001], // 꼭대기(854)가 앞 땅 윗선(1629) 아래로 숨는다
  peaks: [420, 650, 'translateY(100%)', 'cubic-bezier(.2,1.1,.35,1)', .001],
  'castle-hill': [600, 650, 'translateY(89%)', rise, .001],
  // 전사는 살짝 위에서 떨어져 앞 땅에 내려앉는다. 발이 변형 기준점이라 짧게 눌렸다 펴져도 발은 땅에 붙어 있다.
  'warrior-front': [1100, 560, [
    { offset: 0, opacity: 0, transform: 'translateY(-16%)', easing: fall },
    { offset: .1, opacity: 1 },
    { offset: .5, transform: 'none', easing: 'ease-out' },
    { offset: .66, transform: 'scale(1.05, .93)', easing: 'ease-in-out' },
    { offset: .84, transform: 'scale(.99, 1.02)', easing: 'ease-in-out' },
    { offset: 1, opacity: 1, transform: 'none' },
  ]],
  // 그림자는 전사가 다가올수록 커지고 진해지며, 전사가 눌릴 때 옆으로 퍼진다.
  'warrior-front-shadow': [1100, 560, [
    { offset: 0, opacity: 0, transform: 'scale(.5)', easing: fall },
    { offset: .5, opacity: 1, transform: 'none', easing: 'ease-out' },
    { offset: .66, transform: 'scale(1.08, 1)', easing: 'ease-in-out' },
    { offset: 1, opacity: 1, transform: 'none' },
  ]],
  // 냥살자와 냥법사는 전사 뒤에서 각자 바깥쪽으로 튀어나온다.
  assassin: [1560, 460, 'translate(32%, 6%) scale(.6) rotate(8deg)', pop, .2],
  'mage-shadow': [1680, 460, 'scale(.4)', 'ease-out', .2],
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
    const frames = Array.isArray(from) ? from
      : fadeBy ? [{ offset: 0, opacity: 0, transform: from, easing }, { offset: fadeBy, opacity: 1 }, { offset: 1, opacity: 1, transform: 'none' }]
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

// 대기 연출은 숨으면 그 자세로 멈춘다. 다시 보이면 같은 자세에서 횟수를 처음부터 센다.
// 이미 끝났으면 쉬는 자세(첫 반복 시작)부터 다시 한다. 반복마다 쉬는 자세로 끝나서 어느 쪽이든 튀지 않는다.
export function syncIdleVisibility(animations, hidden) {
  for (const animation of animations) {
    if (hidden) {
      animation.pause();
      continue;
    }
    const { delay, duration } = animation.effect.getTiming();
    animation.currentTime = delay + (animation.currentTime - delay) % duration;
    animation.play();
  }
}
