import test from 'node:test';
import assert from 'node:assert/strict';
import { animateTitle, syncIntroVisibility } from '../src/title-intro.js';

const names = ['sky', 'mountains', 'hills', 'trees-left', 'trees-right', 'mine', 'crystals', 'castle', 'foreground', 'mage', 'warrior', 'assassin', 'logo'];
const element = layer => ({
  dataset: { layer }, style: {},
  animate(frames, timing) { return { frames, timing, playState: 'running', pause() { this.playState = 'paused'; }, play() { this.playState = 'running'; } }; },
});
const byName = animations => Object.fromEntries(animations.map((item, index) => [names[index], item]));

test('전체 연출: 지형 → 캐릭터 → 로고 순서와 끝나는 시간', () => {
  const animations = byName(animateTitle(names.map(element)));
  const start = name => animations[name].timing.delay;
  assert.deepEqual(['sky', 'hills', 'foreground', 'mountains', 'mine', 'trees-left', 'crystals', 'trees-right', 'castle', 'warrior', 'assassin', 'mage', 'logo'].map(start),
    [0, 0, 120, 320, 560, 600, 640, 660, 760, 1300, 1420, 1720, 2120]);
  assert.equal(Math.max(...Object.values(animations).map(item => item.timing.delay + item.timing.duration)), 2680);
  assert.match(animations.warrior.frames[0].transform, /translate\(-120%/);
  assert.equal(animations['trees-left'].frames[0].transform, 'scale(.5, 0)');
});

test('숨어 있다가 움직이는 순간 완전히 보이고, 하늘은 처음부터 보임', () => {
  const animations = byName(animateTitle(names.map(element)));
  assert.deepEqual(animations.castle.frames.map(frame => [frame.offset, frame.opacity]), [[0, 0], [.001, 1], [1, 1]]);
  assert.equal(animations.castle.frames.at(-1).transform, 'none');
  assert.equal(animations.mage.frames[1].offset, .2);
  assert.equal(animations.logo.frames[1].offset, .15);
  assert.ok(animations.sky.frames.every(frame => frame.opacity === 1));
  assert.ok(Object.values(animations).every(item => item.timing.fill === 'both'));
});

test('동작 줄이기: 같은 순서로 0.3초씩 나타나고 이동은 없음', () => {
  const animations = animateTitle(names.map(element), { reducedMotion: true });
  assert.equal(animations.length, 13);
  assert.ok(animations.every(item => item.timing.duration === 300 && item.frames.every(frame => frame.transform === 'none')));
  assert.ok(animations.every(item => item.frames[0].opacity === 0 && item.frames[1].opacity === 1));
  assert.equal(byName(animations).logo.timing.delay, 2120);
});

test('직접 누른 다시 보기는 동작 줄이기 상태에서도 전체 재생', () => {
  const animations = byName(animateTitle(names.map(element), { reducedMotion: true, fullMotion: true }));
  assert.match(animations.assassin.frames[0].transform, /rotate\(9deg\)/);
});

test('백그라운드에서 멈추고 복귀하면 재개, 끝난 연출은 다시 시작하지 않음', () => {
  const animations = animateTitle(names.map(element));
  animations[0].playState = 'finished';
  animations[1].playState = 'idle';
  syncIntroVisibility(animations, true);
  assert.ok(animations.slice(2).every(item => item.playState === 'paused'));
  syncIntroVisibility(animations, false);
  assert.ok(animations.slice(2).every(item => item.playState === 'running'));
  assert.deepEqual(animations.slice(0, 2).map(item => item.playState), ['finished', 'idle']);
});
