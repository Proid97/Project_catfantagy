import './style.css';
import { setupScreen } from './setup-screen.js';
import { animateTitle, syncIntroVisibility } from './title-intro.js';

const stage = document.querySelector('.stage');
const art = document.querySelector('.art');
const start = document.querySelector('.start');
const skip = document.querySelector('.skip');
const replay = document.querySelector('.replay');
const motionNote = document.querySelector('.motion-note');
const motionToggle = document.querySelector('.motion-toggle');
const status = document.querySelector('.status');
const retry = document.querySelector('.retry');
const setup = document.querySelector('#setup');
const openSetup = setupScreen(setup, () => { stage.hidden = false; ready(); start.focus(); });
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const assetRoot = `${import.meta.env.BASE_URL}title/`;
let animations = [];
let loading = false;
let motionPreference;
try { motionPreference = localStorage.getItem('title-motion'); } catch { /* 저장이 막혀도 재생은 가능하다. */ }

function useReducedMotion() {
  return motionPreference === 'reduced' || (motionPreference !== 'full' && reducedMotion.matches);
}

function rememberMotion(value) {
  motionPreference = value;
  try { localStorage.setItem('title-motion', value); } catch { /* 현재 화면에만 적용한다. */ }
}

function state(value) {
  stage.dataset.state = value;
  stage.setAttribute('aria-busy', String(value === 'loading'));
  start.hidden = value !== 'ready';
  skip.hidden = value !== 'intro';
  replay.hidden = value !== 'ready';
  motionToggle.hidden = value !== 'ready';
  motionToggle.textContent = `움직임: ${stage.dataset.motion === 'reduced' ? '줄임' : '전체'}`;
  motionToggle.setAttribute('aria-pressed', String(stage.dataset.motion === 'full'));
  motionNote.hidden = value !== 'ready' || stage.dataset.motion !== 'reduced';
  motionNote.textContent = motionPreference === 'reduced' ? '선택한 설정: 움직임 줄임' : '기기 설정: 동작 줄이기';
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
    layer.style.willChange = 'auto';
  }
  state('ready');
}

function intro({ fullMotion = false } = {}) {
  cancelAnimations();
  const reduced = useReducedMotion() && !fullMotion;
  stage.dataset.motion = reduced ? 'reduced' : 'full';
  state('intro');
  animations = animateTitle(art.children, { reducedMotion: reduced, fullMotion });
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
    const response = await fetch(`${assetRoot}layout.json`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`layout: ${response.status}`);
    const layout = await response.json();
    for (const layer of layout.layers) {
      const name = layer.file.replace('.png', '');
        const element = document.createElement('div');
        element.className = `layer ${name}`;
        element.dataset.layer = name;
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
        image.src = `${assetRoot}${name}.webp?v=${layer.revision}`;
        image.style.objectPosition = layer.align?.replaceAll('-', ' ') ?? 'center';
        element.append(image);
        art.append(element);
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
replay.addEventListener('click', () => { rememberMotion('full'); intro({ fullMotion: true }); });
motionToggle.addEventListener('click', () => {
  rememberMotion(stage.dataset.motion === 'full' ? 'reduced' : 'full');
  intro();
});
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
  if (useReducedMotion() && stage.dataset.state === 'intro') {
    stage.dataset.motion = 'reduced';
    ready();
  }
});
load();
