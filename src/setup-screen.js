import './setup.css';
import { CLASSES, createSetup, editPlayer, chooseClass, confirmClass, drawStartDie, rollStartDie, preparedGame } from './setup.js';
import layout from './generated/title-layout.json';

const pipPositions = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
// 타이틀과 같은 주소를 써야 이미 받은 그림을 다시 받지 않는다.
const revisions = Object.fromEntries(layout.layers.map(layer => [layer.name, layer.revision]));

export function setupScreen(root, onBack) {
  let state = createSetup();
  const image = classId => `${import.meta.env.BASE_URL}title/${classId}.webp?v=${revisions[classId]}`;
  const playerName = player => `플레이어 ${player + 1}`;

  function render(focusHeading = false) {
    const focused = root.contains(document.activeElement) ? document.activeElement.dataset.focus : null;
    const selecting = state.phase === 'selection';
    const game = preparedGame(state);
    const activeClass = CLASSES[state.classes[state.active]];
    root.innerHTML = `
      <div class="setup-wrap">
        <header class="setup-header">
          <button class="quiet-button" data-action="back" data-focus="back">← 타이틀로</button>
          <span class="mode-label">한 기기에서 함께 · 1대1</span>
          <button class="quiet-button" data-action="reset" data-focus="reset">처음부터</button>
        </header>
        <ol class="setup-steps" aria-label="게임 준비 단계">
          <li ${selecting ? 'aria-current="step"' : ''}>01 <span>냥국 선택</span></li>
          <li ${!selecting ? 'aria-current="step"' : ''}>02 <span>시작 순서</span></li>
        </ol>
        <div class="setup-heading">
          <p class="eyebrow">${selecting ? '서로 다른 앞발, 같은 주사위 운' : game ? '모험을 떠날 준비 완료' : '첫 자리는 주사위가 정해요'}</p>
          <h2 id="setup-title" tabindex="-1">${selecting ? `${playerName(state.active)}의 냥국을 골라요` : game ? `${playerName(game.order[0] - 1)}부터 시작해요!` : '누가 먼저 성을 놓을까요?'}</h2>
          <p>${selecting ? '마음에 드는 고양이를 골라주세요. 같은 냥국을 골라도 괜찮아요.' : game ? '다음은 안개 속 왕성과 마을의 자리를 고를 차례예요.' : '각자 한 번씩 굴려요. 높은 숫자부터 첫 자리를 골라요.'}</p>
        </div>
        ${selecting ? `
          <div class="player-tabs" role="group" aria-label="냥국을 고를 플레이어">
            ${state.classes.map((classId, index) => `<button class="player-tab" data-action="player" data-player="${index}" data-focus="player-${index}" aria-pressed="${state.active === index}">
              <span>${playerName(index)}</span><strong>${classId ? CLASSES[classId].name : '선택 대기'}</strong><small>${state.confirmed[index] ? '선택 완료 ✓' : state.active === index ? '고르는 중' : '선택 대기'}</small>
            </button>`).join('')}
          </div>
          <fieldset class="class-grid"><legend class="sr-only">${playerName(state.active)}의 클래스</legend>
            ${Object.entries(CLASSES).map(([id, item]) => `<label class="class-card ${id}">
              <input type="radio" name="cat-class" aria-label="${item.name}" value="${id}" data-focus="class-${id}" ${state.classes[state.active] === id ? 'checked' : ''} />
              <span class="card-top"><span class="class-feature">${item.feature}</span><span class="selection-mark" aria-hidden="true">✓</span></span>
              <img src="${image(id)}" alt="" decoding="async" width="440" height="250" />
              <span class="class-copy"><strong>${item.name}</strong><span>${item.tag}</span></span>
              <span class="counter-note">${CLASSES[item.strong].name}에게 강해요</span>
            </label>`).join('')}
          </fieldset>
          <div class="selection-detail" aria-live="polite">
            <span class="detail-icon" aria-hidden="true">✦</span>
            <p>${activeClass ? `<strong>${activeClass.name}</strong> ${activeClass.description} <span>${CLASSES[activeClass.weak].name}를 조심하세요.</span>` : '체력, 마법, 은신. 어떤 방식으로 싸우고 싶나요?'}</p>
          </div>
          <footer class="setup-footer"><p>냥전사 → 냥살자 → 냥법사 → 냥전사<br><small>실제 전투 수치는 첫 전투 시험에서 다듬어요.</small></p>
            <button class="primary-button" data-action="confirm" data-focus="confirm" ${!activeClass ? 'disabled' : ''}>${!activeClass ? '냥국을 골라주세요' : state.confirmed.every(Boolean) ? '시작 순서 확인 →' : `${playerName(state.active)} 선택 완료 →`}</button>
          </footer>` : `
          <div class="order-grid">
            ${state.classes.map((classId, index) => `<article class="order-card ${classId}" ${game?.order[0] === index + 1 ? 'data-first="true"' : ''}>
              <div class="order-card-heading"><span>${playerName(index)}</span><strong>${game ? game.order[0] === index + 1 ? '첫 번째 배치' : '두 번째 배치' : index === state.dice.indexOf(null) ? '지금 굴릴 차례' : state.dice[index] ? '굴리기 완료' : '잠시 기다려요'}</strong></div>
              <img src="${image(classId)}" alt="" width="440" height="250" />
              <h3>${CLASSES[classId].name}</h3>
              <div class="start-die" aria-label="${playerName(index)} 주사위 ${state.dice[index] ?? '대기'}">${state.dice[index] ? [1, 2, 3, 4, 5, 6, 7, 8, 9].map(position => `<span class="pip ${pipPositions[state.dice[index]].includes(position) ? 'shown' : ''}"></span>`).join('') : '<span class="die-question" aria-hidden="true">?</span>'}</div>
              ${game ? '' : `<button class="primary-button" data-action="roll" data-player="${index}" data-focus="roll-${index}" ${state.dice.indexOf(null) !== index ? 'disabled' : ''}>${playerName(index)} 주사위 굴리기</button>`}
            </article>`).join('')}
          </div>
          <p class="order-message" role="status">${game ? '두 냥국과 시작 순서가 정해졌어요. 첫 배치 화면은 다음 단계에서 이어집니다.' : state.dice[0] ? `${playerName(1)} 차례예요. 시작 순서에서는 같은 숫자가 나오지 않아요.` : '어느 숫자가 나올까요? 준비됐다면 플레이어 1부터 굴려주세요.'}</p>
          <footer class="setup-footer"><button class="quiet-button" data-action="edit" data-focus="edit">← 냥국 선택 바꾸기</button>${game ? '<span class="next-step-note">다음: 안개 속 첫 배치</span>' : '<span class="next-step-note">높은 숫자가 먼저!</span>'}</footer>
        `}
      </div>`;
    if (focusHeading) { root.scrollTop = 0; root.querySelector('h2').focus({ preventScroll: true }); }
    else if (focused) (root.querySelector(`[data-focus="${focused}"]:not(:disabled)`) ?? root.querySelector('h2')).focus({ preventScroll: true });
  }

  root.addEventListener('change', event => {
    if (event.target.name !== 'cat-class') return;
    state = chooseClass(state, event.target.value);
    render();
  });
  root.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled) return;
    const player = Number(button.dataset.player);
    switch (button.dataset.action) {
      case 'back': root.hidden = true; onBack(); return;
      case 'reset': state = createSetup(); break;
      case 'player': state = editPlayer(state, player); break;
      case 'edit': state = editPlayer(state, state.active); break;
      case 'confirm': state = confirmClass(state); break;
      case 'roll':
        state = rollStartDie(state, player, drawStartDie(state.dice));
        if (preparedGame(state)) window.dispatchEvent(new CustomEvent('setup:ready', { detail: preparedGame(state) }));
        break;
    }
    render(button.dataset.action === 'confirm' || button.dataset.action === 'roll');
  });
  return () => { root.hidden = false; render(true); root.scrollTop = 0; };
}
