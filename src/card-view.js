import './card.css';
import art from './generated/art.json';

// 카드 한 장. 틀·그림 창은 빌드가 구운 그림이고(scripts/bake-art.mjs), 글자·숫자·아이콘 자리는 같은 CARD 좌표(750×1050)를 %로 바꿔 놓는다.
// 크기는 감싼 요소의 --card-width로 정하고, 글자는 카드 폭 기준(cqw)이라 어느 크기에서도 비율이 같다.
const L = art.card;
const base = import.meta.env.BASE_URL;
export const image = (path, group) => `${base}${path}.webp?v=${art[group][path.split('/').pop()]}`;
const box = ({ left, top, width, height }) => `left:${left / L.width * 100}%;top:${top / L.height * 100}%;width:${width / L.width * 100}%;height:${height / L.height * 100}%`;
const RES_NAME = { gold: '금', crystal: '수정', wood: '나무', fish: '생선' };
const TYPE = { unit: '유닛', building: '건물', magic: '마법', trap: '함정' };
const icon = name => `<img src="${image(`ui/icon-${name}`, 'ui')}" alt="">`;

export function kindText(card) {
  if (card.type === 'unit') return `유닛 · ${card.tier}`;
  if (card.type === 'building') return card.dice ? `건물 · 효과 ${card.dice}` : card.kind === '공격타워' ? '건물 · 공격타워' : '건물';
  if (card.type === 'trap') return `함정 · ${card.target}`;
  return TYPE[card.type];
}

// big: 크게 볼 때. 이야기 글(설명)도 보인다.
export function cardHTML(card, { big = false } = {}) {
  const frame = ['magic', 'trap'].includes(card.look) || card.type === 'unit' ? card.look : `${card.look}-plain`;
  const hasArt = art.cards[card.id];
  const s = card.stats;
  const stars = card.type === 'unit' ? `<p class="card-stars" style="${box(L.stars)}" aria-label="${card.tier}">${[1, 2, 3].map(n => `<img src="${image('ui/icon-star', 'ui')}" alt=""${n > { 기본: 1, 정예: 2, 전설: 3 }[card.tier] ? ' class="off"' : ''}>`).join('')}</p>` : '';
  const cost = card.cost?.length ? `<ul class="card-cost" style="left:${(L.cost.cx - L.cost.r) / L.width * 100}%;top:${L.cost.top / L.height * 100}%" aria-label="비용">${card.cost.map(([type, n]) => `<li>${icon(type)}<b>${n}</b><span class="sr-only">${RES_NAME[type]} ${n}</span></li>`).join('')}</ul>` : '';
  const stats = s ? `<ul class="card-stats" style="${box(L.stats)}" aria-label="수치">
      ${s.hp ? `<li title="체력">${icon('heart')}<b>${s.hp}</b></li>` : ''}${s.mana ? `<li title="마나">${icon('mana')}<b>${s.mana}</b></li>` : ''}
      ${s.atk ? `<li title="공격 피해와 범위">${icon('attack')}<b>${s.atk}</b><i class="range" title="공격 범위">${s.rng}</i></li>` : ''}${s.move ? `<li title="이동">${icon('move')}<b>${s.move}</b></li>` : ''}</ul>` : '';
  return `<article class="card ${card.look}${s ? '' : ' no-stats'}${big ? ' big' : ''}" aria-label="${card.name}">
    ${hasArt ? `<img class="card-art" style="${box(L.art)}" src="${image(`cards/art/${card.id}`, 'cards')}" alt="">` : `<div class="card-art empty" style="${box(L.art)}"></div>`}
    <img class="card-frame" src="${image(`cards/frame-${frame}`, 'cards')}" alt="">
    <h3 class="card-name" style="${box(L.ribbon)}">${card.name}</h3>${stars}${cost}
    ${card.dice ? `<p class="card-dice" aria-label="주사위 ${card.dice}">${icon('dice')}<b>${card.dice}</b></p>` : ''}${stats}
    <div class="card-panel" style="${box(L.panel)}">${card.text.map(t => `<p>${t}</p>`).join('')}${big && card.flavor ? `<p class="card-flavor">${card.flavor}</p>` : ''}</div>
    <p class="card-kind" style="top:${L.panel.top / L.height * 100}%">${kindText(card)}</p>
  </article>`;
}
