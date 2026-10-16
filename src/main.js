import './style.css';
import { setupScreen } from './setup-screen.js';
import { animateTitle, syncIntroVisibility } from './title-intro.js';

const stage = document.querySelector('.stage');
const art = document.querySelector('.art');
const start = document.querySelector('.start');
const skip = document.querySelector('.skip');
const replay = document.querySelector('.replay');
const motionNote = document.querySelector('.motion-note');
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
  motionNote.hidden = value !== 'ready' || stage.dataset.motion !== 'reduced';
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

function intro({ fullMotion = false } = {}) {
  cancelAnimations();
  stage.dataset.motion = reducedMotion.matches && !fullMotion ? 'reduced' : 'full';
  state('intro');
  animations = animateTitle(art.children, { reducedMotion: reducedMotion.matches, fullMotion });
  syncIntroVisibility(animations, document.hidden);
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
// 직접 누른 재생은 전체 연출을 요청한 것으로 처리한다.
replay.addEventListener('click', () => intro({ fullMotion: true }));
document.addEventListener('visibilitychange', () => {
  if (stage.dataset.state === 'intro') syncIntroVisibility(animations, document.hidden);
});
retry.addEventListener('click', load);
document.addEventListener('keydown', event => {
  if (event.repeat || !['Enter', ' '].includes(event.key)) return;
  if (stage.hidden || event.target instanceof HTMLButtonElement) return;
  event.preventDefault();
  if (stage.dataset.state === 'intro') ready();
  else if (stage.dataset.state === 'ready') start.click();
});
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches && stage.dataset.state === 'intro') {
    stage.dataset.motion = 'reduced';
    ready();
  }
});
load();
