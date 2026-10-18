import './style.css';
import { mapScreen, loadMapArt } from './map-screen.js';
import { animateTitle, syncIntroVisibility } from './title-intro.js';
import layout from './generated/title-layout.json';

const app = document.querySelector('#app');
const stage = document.querySelector('.stage');
const art = document.querySelector('.art');
const start = document.querySelector('.start');
const skip = document.querySelector('.skip');
const replay = document.querySelector('.replay');
const motionNote = document.querySelector('.motion-note');
const motionToggle = document.querySelector('.motion-toggle');
const status = document.querySelector('.status');
const retry = document.querySelector('.retry');
const modes = document.querySelector('#modes');
const modeBack = modes.querySelector('.mode-back');
const [modeFirst, modeFour] = modes.querySelectorAll('.mode-list');
const openMap = mapScreen(document.querySelector('#map'), () => showModes(false));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const assetRoot = `${import.meta.env.BASE_URL}title/`;
let animations = [];
let loading = false;
let motionPreference;
try { motionPreference = localStorage.getItem('title-motion'); } catch { /* 저장이 막혀도 재생은 가능하다. */ }

// iOS 홈 화면 앱은 CSS 화면 높이를 상태 표시줄만큼 짧게 줄 때가 있다(iPad mini 5 실측: 768 중 736).
// 앱이 화면 폭을 다 쓸 때만 실제 화면 높이와 비교해 모자란 만큼 채운다. WebKit이 고쳐지면 차이가 0이 된다.
// 높이는 문서 기준값으로 잰다. Safari는 CSS가 오기 전에 이 스크립트를 실행할 수 있어 #app 높이는 믿을 수 없다.
const ios = CSS.supports('-webkit-touch-callout', 'none');
const installed = matchMedia('(display-mode: standalone)');
function fillScreen() {
  const [short, long] = [screen.width, screen.height].sort((a, b) => a - b);
  const full = innerWidth === long ? short : innerWidth === short ? long : 0;
  const standalone = navigator.standalone || installed.matches;
  const gap = ios && standalone && full ? full - document.documentElement.clientHeight : 0;
  document.documentElement.style.setProperty('--viewport-gap', `${Math.max(gap, 0)}px`);
}

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
    for (const layer of layout.layers) {
      const element = document.createElement('div');
      element.className = `layer ${layer.name}`;
      element.dataset.layer = layer.name;
      Object.assign(element.style, {
        left: `${layer.x / layout.canvas.width * 100}%`,
        top: `${layer.y / layout.canvas.height * 100}%`,
        width: `${layer.w / layout.canvas.width * 100}%`,
        height: `${layer.h / layout.canvas.height * 100}%`,
      });
      const image = new Image();
      image.alt = '';
      image.decoding = 'async';
      image.src = `${assetRoot}${layer.name}.webp?v=${layer.revision}`;
      image.style.objectFit = layer.fit === 'stretch' ? 'fill' : 'contain';
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

// 임시 대전 방식 선택. four가 참이면 4인 매치의 개인전·팀전 단계.
function showModes(four) {
  modes.hidden = false;
  modeFirst.hidden = four;
  modeFour.hidden = !four;
  modeBack.textContent = four ? '← 뒤로' : '← 타이틀로';
  modes.querySelector('h2').textContent = four ? '4인 매치 방식 고르기' : '대전 방식 고르기';
  modes.querySelector('h2').focus({ preventScroll: true });
}

function modesBack() {
  if (modeFirst.hidden) return showModes(false);
  modes.hidden = true;
  stage.hidden = false;
  // #map 등으로 바로 들어왔다면 타이틀 그림을 아직 받지 않았다.
  if (!art.children.length) return load();
  ready();
  start.focus();
}

start.addEventListener('click', () => {
  if (stage.dataset.state !== 'ready') return;
  state('started');
  stage.hidden = true;
  showModes(false);
  // 고르는 동안 지도 그림(바닥 타일·지형 오브젝트·성)을 미리 받는다. 실패하면 지도 화면이 다시 시도한다.
  loadMapArt().catch(() => {});
  window.dispatchEvent(new CustomEvent('title:start'));
});
modes.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (button === modeBack) modesBack();
  else if (button?.hasAttribute('data-next')) showModes(true);
  else if (button?.dataset.mode) {
    modes.hidden = true;
    openMap(button.dataset.mode);
  }
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
  // Esc는 대전 방식 선택에서 한 단계 뒤로. 지도에서는 큰 미니맵만 닫고(dialog 기본 동작) 판을 떠나지 않는다.
  if (event.key === 'Escape' && !modes.hidden) return modesBack();
  if (event.repeat || !['Enter', ' '].includes(event.key)) return;
  if (stage.hidden || event.target instanceof HTMLButtonElement) return;
  event.preventDefault();
  if (stage.dataset.state === 'intro') ready();
  else if (stage.dataset.state === 'ready') start.click();
});
reducedMotion.addEventListener('change', () => {
  if (stage.dataset.state === 'ready' || (useReducedMotion() && stage.dataset.state === 'intro')) ready();
});
addEventListener('resize', fillScreen);
fillScreen();
// 개발·시험용: #map(1대1), #map-ffa(4인 개인전), #map-team(2대2 팀전)으로 열면 타이틀을 건너뛰고 판을 바로 본다.
const shortcut = { '#map': 'duel', '#map-ffa': 'ffa', '#map-team': 'team' }[location.hash];
if (shortcut) {
  stage.hidden = true;
  openMap(shortcut);
} else load();
