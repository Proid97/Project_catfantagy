// 움직임 설정. 타이틀의 "움직임: 전체/줄임"으로 고른 값이 있으면 그것을, 없으면 기기의 동작 줄이기 설정을 따른다.
// 타이틀·지도·주사위 등 모든 화면이 이 값을 함께 쓴다.
export const systemReducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const KEY = 'title-motion'; // 예전에 저장한 선택도 그대로 읽는다

let choice = null; // 'full' | 'reduced' | null(고른 적 없음)
try { choice = localStorage.getItem(KEY); } catch { /* 저장이 막혀도 기기 설정을 따른다. */ }

export const motionChoice = () => choice;

export function useReducedMotion() {
  return choice === 'reduced' || (choice !== 'full' && systemReducedMotion.matches);
}

export function rememberMotion(value) {
  choice = value;
  try { localStorage.setItem(KEY, value); } catch { /* 현재 화면에만 적용한다. */ }
}
