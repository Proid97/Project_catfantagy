import cards from './generated/cards.json';
import art from './generated/art.json';
import { cardHTML, image } from './card-view.js';
import { tinted as paint } from './tint.js';

// 카드·말 보기(#cards): 카드 36종, 건설 탭 건물 15종(카드 모양으로 보임), 판 위 말을 iPad에서 직접 넘겨 보며 확인하는 화면. 게임 진행과는 따로다.
const TABS = [['warrior', '냥전사'], ['mage', '냥법사'], ['assassin', '냥살자'], ['magic', '마법'], ['trap', '함정'], ['pieces', '판 위 말']];
const PLAYER = ['#e0453a', '#1f9e5a', '#3a7fe0', '#f2c230'];

// 판 위와 같은 방식으로 플레이어 색을 칠한 말
const tinted = (path, color) => { const group = path.split('/')[0]; return paint(image(path, group), image(`${path}-team`, group), color); };

export function cardsScreen(root, onBack) {
  root.innerHTML = `
    <header class="cards-bar"><button class="ui-button small back">← 나가기</button><h2 id="cards-title" tabindex="-1">카드·말 보기</h2></header>
    <nav class="cards-tabs" aria-label="종류">${TABS.map(([id, name]) => `<button data-tab="${id}" aria-pressed="false">${name}</button>`).join('')}</nav>
    <div class="cards-grid"></div>
    <dialog class="card-dialog" aria-label="카드 크게 보기"></dialog>`;
  const grid = root.querySelector('.cards-grid');
  const dialog = root.querySelector('dialog');
  async function show(tab) {
    root.querySelectorAll('[data-tab]').forEach(button => button.setAttribute('aria-pressed', button.dataset.tab === tab));
    if (tab !== 'pieces') {
      grid.className = 'cards-grid';
      grid.innerHTML = cards.filter(card => card.look === tab).map(card => `<button class="card-pick" data-id="${card.id}" aria-label="${card.name} 크게 보기">${cardHTML(card)}</button>`).join('');
      return;
    }
    grid.className = 'cards-grid pieces';
    const names = Object.keys(art.pieces).filter(name => !name.includes('@') && !name.endsWith('-team'));
    const tokens = Object.keys(art.tokens).filter(name => !name.endsWith('-team'));
    grid.innerHTML = '<h3>유닛 동전 토큰</h3><div class="piece-row tokens"></div><h3>건물 말</h3><div class="piece-row buildings"></div>';
    const [tokenRow, buildingRow] = grid.querySelectorAll('.piece-row');
    for (const [i, name] of tokens.entries()) tokenRow.append(await tinted(`tokens/${name}`, PLAYER[i % 4]));
    for (const [i, name] of names.entries()) buildingRow.append(await tinted(`pieces/${name}`, PLAYER[i % 4]));
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) {
      if (event.target === dialog) dialog.close();
      return;
    }
    if (button.classList.contains('back')) onBack();
    else if (button.dataset.tab) show(button.dataset.tab);
    else if (button.dataset.id) {
      const card = cards.find(item => item.id === button.dataset.id);
      dialog.innerHTML = cardHTML(card, { big: true }) + (card.flavor ? `<p class="card-flavor">${card.flavor}</p>` : '');
      dialog.showModal();
    }
  });
  return () => {
    root.hidden = false;
    show('warrior');
    root.querySelector('h2').focus({ preventScroll: true });
  };
}
