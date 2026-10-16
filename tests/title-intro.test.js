import test from 'node:test';
import assert from 'node:assert/strict';
import { animateTitle, syncIntroVisibility } from '../src/title-intro.js';

function layers() {
  return ['sky', 'ground', 'regions', 'castle', 'warrior', 'assassin', 'mage', 'logo'].map(name => ({
    dataset: { layer: name }, style: {},
    animate(frames, timing) { return { frames, timing, playState: 'running', pause() { this.playState = 'paused'; }, play() { this.playState = 'running'; } }; },
  }));
}

test('전체 연출에서 이동·회전을 포함한 순서와 마지막 로고 유지', () => {
  const animations = animateTitle(layers());
  assert.deepEqual(animations.map(item => item.timing.delay), [0, 350, 900, 1650, 2400, 2530, 2660, 3450]);
  assert.equal(animations.at(-1).timing.delay + animations.at(-1).timing.duration, 4100);
  assert.match(animations[4].frames[0].transform, /translate/);
});

test('동작 줄이기에서도 8개 레이어가 차례로 등장, 큰 이동은 생략', () => {
  const animations = animateTitle(layers(), { reducedMotion: true });
  assert.equal(animations.length, 8);
  assert.ok(animations.every(item => item.frames.every(frame => frame.transform === 'none')));
  assert.deepEqual(animations.map(item => item.timing.delay), [0, 350, 900, 1650, 2400, 2530, 2660, 3450]);
  assert.ok(animations.every(item => item.frames[0].opacity === 0 && item.frames[1].opacity === 1));
});

test('직접 누른 다시 보기는 동작 줄이기 상태에서도 전체 재생', () => {
  const animations = animateTitle(layers(), { reducedMotion: true, fullMotion: true });
  assert.match(animations[4].frames[0].transform, /translate\(-110%/);
  assert.match(animations[5].frames[0].transform, /rotate/);
});

test('백그라운드에서 멈추고 복귀하면 재개', () => {
  const animations = animateTitle(layers());
  syncIntroVisibility(animations, true);
  assert.ok(animations.every(item => item.playState === 'paused'));
  syncIntroVisibility(animations, false);
  assert.ok(animations.every(item => item.playState === 'running'));
});

test('끝나거나 취소된 연출을 화면 복귀 시 다시 시작하지 않음', () => {
  const animations = animateTitle(layers());
  animations[0].playState = 'finished';
  animations[1].playState = 'idle';
  syncIntroVisibility(animations, true);
  syncIntroVisibility(animations, false);
  assert.equal(animations[0].playState, 'finished');
  assert.equal(animations[1].playState, 'idle');
});
