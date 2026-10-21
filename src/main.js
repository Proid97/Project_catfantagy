import './style.css';
import { mapScreen, loadMapArt } from './map-screen.js';
import { cardsScreen } from './cards-screen.js';
import { image } from './card-view.js';
import { animateTitle, syncIntroVisibility, syncIdleVisibility } from './title-intro.js';
import { systemReducedMotion, motionChoice, useReducedMotion, rememberMotion } from './motion.js';
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
// 대전 방식 단추의 아이콘(빌드가 구운 그림, 주소에 내용 해시가 붙어 HTML에 바로 쓸 수 없다)
// 숨은 화면의 그림은 보일 때 받는다(loading=lazy). 타이틀 첫 로딩에 끼지 않는다.
for (const button of modes.querySelectorAll('[data-icon]')) button.prepend(Object.assign(new Image(), { src: image(`ui/icon-${button.dataset.icon}`, 'ui'), alt: '', loading: 'lazy' }));
const map = mapScreen(document.querySelector('#map'), () => showModes(false));
const openMap = map.open;
// 게임(엔진·봇·게임 화면)은 처음 한 판을 열 때 따로 받는다. 타이틀 첫 로딩을 가볍게 둔다.
let gameStart = null;
// 주소에 ?seed=정수가 있으면 그 시드로 판을 만든다(같은 시드·같은 선택이면 같은 판. 버그 재현과 시험용).
const seed = Number.parseInt(new URLSearchParams(location.search).get('seed'), 10);
async function startGame(options) {
  gameStart ??= (await import('./game-screen.js')).gameScreen(map, document.querySelector('#map'));
  gameStart(Number.isInteger(seed) ? { ...options, seed } : options);
}
const races = document.querySelector('#races');
// 종족 단추의 얼굴(구운 그림)
for (const button of races.querySelectorAll('[data-race]')) button.prepend(Object.assign(new Image(), { src: image(`ui/avatar-${button.dataset.race}`, 'ui'), alt: '', loading: 'lazy' }));
let chosenMode = 'duel';
const cardsRoot = document.querySelector('#cards');
const openCards = cardsScreen(cardsRoot, () => { cardsRoot.hidden = true; showModes(false); });
const assetRoot = `${import.meta.env.BASE_URL}title/`;
let animations = [];
let idle = [];
let loading = false;

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
  motionNote.textContent = motionChoice() === 'reduced' ? '선택한 설정: 움직임 줄임' : '기기 설정: 동작 줄이기';
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
  // CSS 대기 연출을 잡아 둔다. 끝난 연출은 목록에서 빠지므로, 다시 보일 때 처음부터 하려면 미리 쥐고 있어야 한다.
  idle = art.getAnimations({ subtree: true });
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

// 핵심 영역 좌표(layout.json)의 상자를 %로 놓는다. 첫 클래스 이름이 층 이름이다.
function place(classes, { x, y, w, h }) {
  const element = document.createElement('div');
  element.className = `layer ${classes}`;
  element.dataset.layer = classes.split(' ')[0];
  Object.assign(element.style, {
    left: `${x / layout.canvas.width * 100}%`,
    top: `${y / layout.canvas.height * 100}%`,
    width: `${w / layout.canvas.width * 100}%`,
    height: `${h / layout.canvas.height * 100}%`,
  });
  return element;
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
      // 코드로 그린 접지 그림자는 그 층 바로 뒤에 깐다.
      if (layer.shadow) art.append(place(`${layer.name}-shadow shadow`, layer.shadow));
      const element = place(layer.name, layer);
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
  modes.querySelector('.mode-cards').hidden = four;
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
  else if (button?.hasAttribute('data-cards')) { modes.hidden = true; openCards(); }
  else if (button?.dataset.mode) {
    // 대전 방식 → 종족 고르기 → 판
    chosenMode = button.dataset.mode;
    modes.hidden = true;
    races.hidden = false;
    races.querySelector('h2').focus({ preventScroll: true });
  }
});
races.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  races.hidden = true;
  if (button.dataset.race) startGame({ mode: chosenMode, race: button.dataset.race });
  else showModes(chosenMode !== 'duel');
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
  if (stage.dataset.state === 'ready') syncIdleVisibility(idle, document.hidden);
});
retry.addEventListener('click', load);
document.addEventListener('keydown', event => {
  // Esc는 대전 방식 선택에서 한 단계 뒤로. 지도에서는 큰 미니맵만 닫고(dialog 기본 동작) 판을 떠나지 않는다.
  if (event.key === 'Escape' && !modes.hidden) return modesBack();
  if (event.key === 'Escape' && !races.hidden) { races.hidden = true; return showModes(chosenMode !== 'duel'); }
  if (event.repeat || !['Enter', ' '].includes(event.key)) return;
  if (stage.hidden || event.target instanceof HTMLButtonElement) return;
  event.preventDefault();
  if (stage.dataset.state === 'intro') ready();
  else if (stage.dataset.state === 'ready') start.click();
});
systemReducedMotion.addEventListener('change', () => {
  if (stage.dataset.state === 'ready' || (useReducedMotion() && stage.dataset.state === 'intro')) ready();
});
addEventListener('resize', fillScreen);
fillScreen();
// 개발·시험용: #map(1대1), #map-ffa(4인 개인전), #map-team(2대2 팀전)으로 열면 타이틀을 건너뛰고 판을 바로 본다. #cards는 카드·말 보기, #map-demo는 보기용 말을 놓은 판.
// #play, #play-ffa, #play-team은 냥전사로 바로 한 판을 시작한다(#play-mage처럼 종족을 붙여도 됨). 끝에 -auto를 붙이면 내 자리도 봇이 두는 자동 대전.
const shortcut = { '#map': 'duel', '#map-ffa': 'ffa', '#map-team': 'team', '#map-demo': 'duel' }[location.hash];
const play = location.hash.match(/^#play(?:-(ffa|team))?(?:-(warrior|mage|assassin))?(-auto)?$/);
if (play) {
  stage.hidden = true;
  startGame({ mode: play[1] ?? 'duel', race: play[2] ?? 'warrior', auto: Boolean(play[3]) });
} else if (location.hash === '#cards') {
  stage.hidden = true;
  openCards();
} else if (shortcut) {
  stage.hidden = true;
  openMap(shortcut, { demo: location.hash === '#map-demo' });
} else load();
