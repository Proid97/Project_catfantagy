import './style.css';
import { setupScreen } from './setup-screen.js';
import { animateTitle, shakeTitle, syncIntroVisibility } from './title-intro.js';
import layout from './generated/title-layout.json';

const stage = document.querySelector('.stage');
const art = document.querySelector('.art');
const canvas = document.querySelector('.canvas');
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
  }
  stage.dataset.motion = useReducedMotion() ? 'reduced' : 'full';
  state('ready');
}

function intro({ fullMotion = false } = {}) {
  cancelAnimations();
  const reduced = useReducedMotion() && !fullMotion;
  stage.dataset.motion = reduced ? 'reduced' : 'full';
  state('intro');
  animations = [...animateTitle(art.children, { reducedMotion: reduced, fullMotion }), ...(reduced ? [] : shakeTitle(canvas))];
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
    for (const layer of layout.layers) {
      const element = document.createElement('div');
      element.className = `layer ${layer.name}`;
      element.dataset.layer = layer.name;
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
      image.src = `${assetRoot}${layer.name}.webp?v=${layer.revision}`;
      image.style.objectFit = layer.fit === 'stretch' ? 'fill' : 'contain';
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
// 연출 중 화면을 누르면 건너뛰기만 한다. pointerdown이면 같은 터치의 클릭이 새로 나타난 시작 버튼에 닿는다.
stage.addEventListener('click', event => {
  if (stage.dataset.state === 'intro' && !event.target.closest('button')) ready();
});
// 다시 보기는 저장된 설정을 바꾸지 않고 전체 연출을 한 번 보여준다.
replay.addEventListener('click', () => intro({ fullMotion: true }));
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
  if (stage.dataset.state === 'ready' || (useReducedMotion() && stage.dataset.state === 'intro')) ready();
});
load();
