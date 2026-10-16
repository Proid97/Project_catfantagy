export const CLASSES = {
  warrior: { name: '냥전사', tag: '단단하게 버티는 앞발', feature: '높은 체력 · 도발', description: '도발한 적을 다음 턴에 자기 쪽으로 한 칸 끌어와요.', strong: 'assassin', weak: 'mage' },
  mage: { name: '냥법사', tag: '멀리 뻗는 마법 한 방', feature: '범위 공격 · 예측공격', description: '넓은 칸을 공격해요. 숨은 적이 올 자리도 노릴 수 있어요.', strong: 'warrior', weak: 'assassin' },
  assassin: { name: '냥살자', tag: '숨어들어 재빠른 기습', feature: '은신 · 도약공격', description: '탐지 범위 밖에 숨어 있다가, 도약해 적의 뒤를 노려요.', strong: 'mage', weak: 'warrior' },
};

export function createSetup() {
  return { classes: [null, null], confirmed: [false, false], active: 0, phase: 'selection', dice: [null, null] };
}

function checkPlayer(player) {
  if (player !== 0 && player !== 1) throw new RangeError('잘못된 플레이어');
}

export function editPlayer(state, player) {
  checkPlayer(player);
  return { ...state, phase: 'selection', active: player };
}

export function chooseClass(state, classId) {
  if (state.phase !== 'selection' || !Object.hasOwn(CLASSES, classId)) throw new Error('고를 수 없는 냥국');
  if (state.classes[state.active] === classId) return state;
  const classes = [...state.classes];
  const confirmed = [...state.confirmed];
  classes[state.active] = classId;
  confirmed[state.active] = false;
  return { ...state, classes, confirmed, dice: [null, null] };
}

export function confirmClass(state) {
  if (state.phase !== 'selection' || !state.classes[state.active]) throw new Error('먼저 냥국을 골라주세요');
  const confirmed = [...state.confirmed];
  confirmed[state.active] = true;
  return { ...state, confirmed, active: confirmed.every(Boolean) ? state.active : 1 - state.active, phase: confirmed.every(Boolean) ? 'order' : 'selection' };
}

export function drawStartDie(taken, random = Math.random) {
  // 동점만 다시 굴리는 것과 같은 확률로, 남은 눈 중 하나를 고른다.
  const available = [1, 2, 3, 4, 5, 6].filter(face => !taken.includes(face));
  const value = random();
  if (!available.length || !Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('주사위 추첨 범위 오류');
  return available[Math.floor(value * available.length)];
}

export function rollStartDie(state, player, face) {
  checkPlayer(player);
  if (state.phase !== 'order' || !state.confirmed.every(Boolean) || player !== state.dice.indexOf(null)) throw new Error('지금은 굴릴 차례가 아니에요');
  if (!Number.isInteger(face) || face < 1 || face > 6 || state.dice.includes(face)) throw new RangeError('시작 주사위 눈 오류');
  const dice = [...state.dice];
  dice[player] = face;
  return { ...state, dice };
}

export function preparedGame(state) {
  if (state.classes.some(classId => !Object.hasOwn(CLASSES, classId)) || !state.confirmed.every(Boolean) || state.dice.some(face => face === null)) return null;
  return {
    players: state.classes.map((classId, index) => ({ id: index + 1, classId, startDie: state.dice[index] })),
    order: state.dice[0] > state.dice[1] ? [1, 2] : [2, 1],
  };
}
