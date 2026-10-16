import './style.css';
import { setupScreen } from './setup-screen.js';

const stage = document.querySelector('.stage');
const art = document.querySelector('.art');
const start = document.querySelector('.start');
const skip = document.querySelector('.skip');
const replay = document.querySelector('.replay');
const status = document.querySelector('.status');
const retry = document.querySelector('.retry');
const setup = document.querySelector('#setup');
const openSetup = setupScreen(setup, () => { stage.hidden = false; ready(); start.focus(); });
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const assetRoot = `${import.meta.env.BASE_URL}title/`;
let animations = [];
let loading = false;

function state(value) {
  stage.dataset.state = value;
  stage.setAttribute('aria-busy', String(value === 'loading'));
  start.hidden = value !== 'ready';
  skip.hidden = value !== 'intro';
  replay.hidden = value !== 'ready';
}

function cancelAnimations() {
  for (const animation of animations) animation.cancel();
  animations = [];
}

function ready() {
  cancelAnimations();
  for (const layer of art.children) {
    layer.style.opacity = '1';
    layer.style.transform = 'none';
  }
  state('ready');
}

function intro() {
  cancelAnimations();
  if (reducedMotion.matches) return ready();
  state('intro');
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
  for (const layer of art.children) {
    const [delay, duration, from] = entrances[layer.dataset.layer];
    layer.style.opacity = '0';
    const animation = layer.animate([
      { opacity: 0, transform: from },
      { opacity: 1, transform: 'none' },
    ], { delay, duration, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' });
    animations.push(animation);
  }
  Promise.all(animations.map(animation => animation.finished)).then(() => {
    if (stage.dataset.state === 'intro') ready();
  }).catch(error => { if (error.name !== 'AbortError') throw error; });
}

async function load() {
  if (loading) return;
  loading = true;
  state('loading');
  status.hidden = false;
  status.textContent = '냥국을 불러오는 중…';
  retry.hidden = true;
  art.replaceChildren();
  try {
    const response = await fetch(`${assetRoot}layout.json`);
    if (!response.ok) throw new Error(`layout: ${response.status}`);
    const layout = await response.json();
    // 지형 한 장을 고정된 경계로 나눠 동산과 먼 자원 지형을 차례로 올린다.
    for (const layer of layout.layers) {
      const name = layer.file.replace('.png', '');
      const parts = name === 'landscape' ? ['regions', 'ground'] : [name];
      for (const part of parts) {
        const element = document.createElement('div');
        element.className = `layer ${name} ${part}`;
        element.dataset.layer = part;
        Object.assign(element.style, {
          left: `${layer.x / layout.canvas.width * 100}%`,
          top: `${layer.y / layout.canvas.height * 100}%`,
          width: `${layer.w / layout.canvas.width * 100}%`,
          height: `${layer.h / layout.canvas.height * 100}%`,
          zIndex: String(layer.z),
        });
        const image = new Image();
        image.alt = '';
        image.decoding = 'async';
        image.src = `${assetRoot}${name}.webp`;
        image.style.objectPosition = layer.align?.replaceAll('-', ' ') ?? 'center';
        element.append(image);
        art.append(element);
      }
    }
    await Promise.all([...art.querySelectorAll('img')].map(image => image.decode()));
    await document.fonts.load('700 24px "Catfantagy UI"', 'TOUCH TO START');
    status.hidden = true;
    intro();
  } catch (error) {
    state('error');
    status.textContent = '냥국을 불러오지 못했어요. 다시 시도해 주세요.';
    retry.hidden = false;
    console.error('타이틀 로딩 실패', error);
  } finally {
    loading = false;
  }
}

start.addEventListener('click', () => {
  if (stage.dataset.state !== 'ready') return;
  state('started');
  stage.hidden = true;
  openSetup();
  window.dispatchEvent(new CustomEvent('title:start'));
});
skip.addEventListener('click', ready);
replay.addEventListener('click', intro);
retry.addEventListener('click', load);
document.addEventListener('keydown', event => {
  if (event.repeat || !['Enter', ' '].includes(event.key)) return;
  if (stage.hidden || event.target instanceof HTMLButtonElement) return;
  event.preventDefault();
  if (stage.dataset.state === 'intro') ready();
  else if (stage.dataset.state === 'ready') start.click();
});
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches && stage.dataset.state === 'intro') ready();
});
load();
