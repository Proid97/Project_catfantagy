const entrances = {
  sky: [0, 600, 'scale(1.035)'],
  ground: [350, 900, 'translateY(55%)'],
  regions: [900, 1000, 'translateY(35%)'],
  castle: [1650, 900, 'translateY(70%) scale(.9)'],
  warrior: [2400, 650, 'translate(-110%, 18%) rotate(-14deg)'],
  assassin: [2530, 650, 'translate(110%, -22%) rotate(16deg)'],
  mage: [2660, 750, 'translateY(-110%) scale(.8)'],
  logo: [3450, 650, 'scale(1.25) translateY(-12%)'],
};

export function animateTitle(layers, { reducedMotion = false, fullMotion = false } = {}) {
  return [...layers].map(layer => {
    const [delay, duration, from] = entrances[layer.dataset.layer];
    layer.style.opacity = '0';
    return layer.animate([
      { opacity: 0, transform: reducedMotion && !fullMotion ? 'none' : from },
      { opacity: 1, transform: 'none' },
    ], { delay, duration, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' });
  });
}

export function syncIntroVisibility(animations, hidden) {
  for (const animation of animations) {
    if (animation.playState === 'finished' || animation.playState === 'idle') continue;
    if (hidden) animation.pause();
    else animation.play();
  }
}
