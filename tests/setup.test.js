import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, createSetup, editPlayer, chooseClass, confirmClass, drawStartDie, rollStartDie, preparedGame } from '../src/setup.js';

function selectBoth(first = 'warrior', second = 'mage') {
  return confirmClass(chooseClass(confirmClass(chooseClass(createSetup(), first)), second));
}

test('각 플레이어가 직접 선택을 마쳐야 순서 정하기로 이동', () => {
  const initial = createSetup();
  assert.throws(() => confirmClass(initial));
  assert.equal(preparedGame(initial), null);
  let state = chooseClass(initial, 'warrior');
  assert.deepEqual(initial.classes, [null, null]);
  state = confirmClass(state);
  assert.equal(state.active, 1);
  assert.equal(state.phase, 'selection');
  state = confirmClass(chooseClass(state, 'mage'));
  assert.equal(state.phase, 'order');
  assert.deepEqual(state.classes, ['warrior', 'mage']);
  assert.deepEqual(state.confirmed, [true, true]);
});

test('같은 냥국을 고른 두 플레이어도 준비 가능', () => {
  const state = selectBoth('assassin', 'assassin');
  assert.deepEqual(state.classes, ['assassin', 'assassin']);
  assert.equal(state.phase, 'order');
});

test('주사위는 순서대로 한 번씩, 큰 눈이 먼저', () => {
  const initial = selectBoth();
  assert.throws(() => rollStartDie(initial, 1, 6));
  const first = rollStartDie(initial, 0, 2);
  assert.deepEqual(initial.dice, [null, null]);
  assert.equal(preparedGame(first), null);
  assert.throws(() => rollStartDie(first, 0, 6));
  assert.throws(() => rollStartDie(first, 1, 2));
  const state = rollStartDie(first, 1, 5);
  assert.deepEqual(preparedGame(state), {
    players: [{ id: 1, classId: 'warrior', startDie: 2 }, { id: 2, classId: 'mage', startDie: 5 }], order: [2, 1],
  });
  assert.throws(() => rollStartDie(state, 1, 6));
  assert.deepEqual(preparedGame(rollStartDie(rollStartDie(selectBoth(), 0, 6), 1, 1)).order, [1, 2]);
});

test('보기만 하고 돌아오면 주사위를 유지, 냥국 변경 시 다시 준비', () => {
  const ready = rollStartDie(rollStartDie(selectBoth(), 0, 6), 1, 3);
  const editing = editPlayer(ready, 0);
  assert.deepEqual(confirmClass(editing).dice, [6, 3]);
  assert.equal(chooseClass(editing, 'warrior'), editing);
  const changed = chooseClass(editing, 'assassin');
  assert.deepEqual(changed.classes, ['assassin', 'mage']);
  assert.deepEqual(changed.confirmed, [false, true]);
  assert.deepEqual(changed.dice, [null, null]);
  assert.equal(preparedGame(changed), null);
  assert.throws(() => rollStartDie(changed, 0, 5));
  assert.equal(confirmClass(changed).phase, 'order');
});

test('첫 눈 6가지와 두 번째 눈 5가지가 같은 폭으로 추첨됨', () => {
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => drawStartDie([], () => (i + .5) / 6)), [1, 2, 3, 4, 5, 6]);
  for (let first = 1; first <= 6; first++) {
    const possible = Array.from({ length: 5 }, (_, i) => drawStartDie([first], () => (i + .5) / 5));
    assert.deepEqual(possible, [1, 2, 3, 4, 5, 6].filter(face => face !== first));
  }
  assert.equal(drawStartDie([], () => 0), 1);
  assert.equal(drawStartDie([], () => .999999), 6);
});

test('잘못된 클래스·플레이어·눈·난수 입력 거절', () => {
  const initial = createSetup();
  for (const id of ['dog', '__proto__', '', null]) assert.throws(() => chooseClass(initial, id));
  for (const player of [-1, 2, '0']) assert.throws(() => editPlayer(initial, player));
  assert.throws(() => chooseClass(selectBoth(), 'assassin'));
  for (const face of [0, 7, 2.5, '3', NaN]) assert.throws(() => rollStartDie(selectBoth(), 0, face));
  for (const value of [-.1, 1, NaN, Infinity]) assert.throws(() => drawStartDie([], () => value));
  assert.throws(() => drawStartDie([1, 2, 3, 4, 5, 6]));
});

test('상성은 전사 → 냥살자 → 법사 → 전사로 한 바퀴', () => {
  let id = 'warrior';
  const order = [];
  for (let i = 0; i < 3; i++) { order.push(id); assert.equal(CLASSES[CLASSES[id].strong].weak, id); id = CLASSES[id].strong; }
  assert.deepEqual(order, ['warrior', 'assassin', 'mage']);
  assert.equal(id, 'warrior');
});
