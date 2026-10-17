const bounce = 'cubic-bezier(.2,1.15,.35,1)';
const rise = 'cubic-bezier(.2,1.2,.35,1)';
const pop = 'cubic-bezier(.34,1.56,.64,1)';
const dash = 'cubic-bezier(.18,1.25,.4,1)';
// [지연, 길이, 시작 모양, 움직임, 불투명해지는 지점]. 지점이 없으면 처음부터 보인다.
const entrances = {
  sky: [0, 1200, 'scale(1.06)', 'ease-out'],
  hills: [0, 650, 'translateY(70%)', bounce, .001],
  foreground: [120, 620, 'translateY(100%)', bounce, .001],
  mountains: [320, 700, 'translateY(100%)', 'cubic-bezier(.2,1.1,.35,1)', .001],
  mine: [560, 600, 'translateY(100%)', rise, .001],
  'trees-left': [600, 480, 'scale(.5, 0)', pop, .001],
  crystals: [640, 600, 'translateY(100%)', rise, .001],
  'trees-right': [660, 480, 'scale(.5, 0)', pop, .001],
  castle: [760, 680, 'translateY(100%)', rise, .001],
  warrior: [1300, 420, 'translate(-120%, 8%) rotate(-8deg)', dash, .001],
  assassin: [1420, 420, 'translate(120%, -10%) rotate(9deg)', dash, .001],
  mage: [1720, 560, 'translateY(-35%) scale(.55) rotate(-8deg)', pop, .2],
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
