import test from 'node:test';
import assert from 'node:assert/strict';
import { animateTitle, syncIntroVisibility } from '../src/title-intro.js';

function layers() {
  return ['sky', 'hills', 'mountains', 'mine', 'crystals', 'castle', 'warrior', 'assassin', 'mage', 'logo'].map(name => ({
    dataset: { layer: name }, style: {},
    animate(frames, timing) { return { frames, timing, playState: 'running', pause() { this.playState = 'paused'; }, play() { this.playState = 'running'; } }; },
  }));
}

test('전체 연출에서 이동·회전을 포함한 순서와 마지막 로고 유지', () => {
  const animations = animateTitle(layers());
  assert.deepEqual(animations.map(item => item.timing.delay), [0, 100, 330, 620, 620, 620, 1050, 1090, 1170, 1740]);
  assert.equal(animations.at(-1).timing.delay + animations.at(-1).timing.duration, 2200);
  assert.match(animations[6].frames[0].transform, /translate/);
});

test('동작 줄이기에서도 10개 레이어가 차례로 등장, 큰 이동은 생략', () => {
  const animations = animateTitle(layers(), { reducedMotion: true });
  assert.equal(animations.length, 10);
  assert.ok(animations.every(item => item.frames.every(frame => frame.transform === 'none')));
  assert.deepEqual(animations.map(item => item.timing.delay), [0, 100, 330, 620, 620, 620, 1050, 1090, 1170, 1740]);
  assert.ok(animations.every(item => item.frames[0].opacity === 0 && item.frames[1].opacity === 1));
});

test('직접 누른 다시 보기는 동작 줄이기 상태에서도 전체 재생', () => {
  const animations = animateTitle(layers(), { reducedMotion: true, fullMotion: true });
  assert.match(animations[6].frames[0].transform, /translate\(-125%/);
  assert.match(animations[7].frames[0].transform, /rotate/);
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

 test('자원과 성은 함께 등장하며 법사는 아래에서 상승', () => {
  const animations = animateTitle(layers());
  assert.equal(animations[3].timing.delay, animations[4].timing.delay);
  assert.equal(animations[4].timing.delay, animations[5].timing.delay);
  assert.match(animations[8].frames[0].transform, /translateY\(210%\)/);
  assert.equal(animations[6].frames[1].offset, .78);
  assert.equal(animations[6].frames.at(-1).transform, 'none');
});
