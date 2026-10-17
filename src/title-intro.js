const entrances = {
  sky: [0, 220, 'scale(1.025)', 'none'],
  hills: [100, 470, 'translateY(65%)', 'translateY(-1.5%)'],
  mountains: [330, 500, 'translateY(90%)', 'translateY(-2%)'],
  mine: [620, 480, 'translateY(125%) scale(.94)', 'translateY(-3%) scale(1.01)'],
  crystals: [620, 480, 'translateY(125%) scale(.94)', 'translateY(-3%) scale(1.01)'],
  castle: [620, 480, 'translateY(125%) scale(.94)', 'translateY(-2%) scale(1.01)'],
  warrior: [1050, 510, 'translate(-125%, 12%) rotate(-10deg)', 'translate(2%, -1%) rotate(1deg)'],
  assassin: [1090, 510, 'translate(125%, -14%) rotate(12deg)', 'translate(-2%, 1%) rotate(-1deg)'],
  mage: [1170, 570, 'translateY(210%) scale(.86)', 'translateY(-4%) scale(1.025)'],
  logo: [1740, 460, 'translateY(-14%) scale(1.16)', 'translateY(1%) scale(.985)'],
};

export function animateTitle(layers, { reducedMotion = false, fullMotion = false } = {}) {
  return [...layers].map(layer => {
    const [delay, duration, from, settle] = entrances[layer.dataset.layer];
    const reduced = reducedMotion && !fullMotion;
    layer.style.opacity = '0';
    layer.style.willChange = 'transform, opacity';
    return layer.animate([
      { opacity: 0, transform: reduced ? 'none' : from, offset: 0, easing: 'cubic-bezier(.16,1,.3,1)' },
      { opacity: 1, transform: reduced ? 'none' : settle, offset: .78, easing: 'ease-out' },
      { opacity: 1, transform: 'none', offset: 1 },
    ], { delay, duration, fill: 'both' });
  });
}

export function syncIntroVisibility(animations, hidden) {
  for (const animation of animations) {
    if (animation.playState === 'finished' || animation.playState === 'idle') continue;
    if (hidden) animation.pause();
    else animation.play();
  }
}
