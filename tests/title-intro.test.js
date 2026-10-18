import test from 'node:test';
import assert from 'node:assert/strict';
import { animateTitle, syncIntroVisibility } from '../src/title-intro.js';

// 겹침 순서(layout.json)와 같은 화면 속 순서
const names = ['sky-tall', 'peaks', 'castle-hill', 'hills-tall', 'ground-tall', 'assassin', 'mage', 'warrior-front', 'logo'];
const element = layer => ({
  dataset: { layer }, style: {},
  animate(frames, timing) { return { frames, timing, playState: 'running', pause() { this.playState = 'paused'; }, play() { this.playState = 'running'; } }; },
});
const byName = animations => Object.fromEntries(animations.map((item, index) => [names[index], item]));

test('전체 연출: 지형 → 전사 → 냥살자·냥법사 → 로고 순서와 끝나는 시간', () => {
  const animations = byName(animateTitle(names.map(element)));
  const start = name => animations[name].timing.delay;
  assert.deepEqual(['sky-tall', 'hills-tall', 'peaks', 'castle-hill', 'ground-tall', 'warrior-front', 'assassin', 'mage', 'logo'].map(start),
    [0, 0, 420, 600, 760, 1100, 1560, 1680, 2120]);
  assert.equal(Math.max(...Object.values(animations).map(item => item.timing.delay + item.timing.duration)), 2680);
  // 전사는 화면 아래 밖에서 올라오고, 냥살자는 전사 쪽(오른쪽)·냥법사는 왼쪽에서 바깥으로 튀어나온다.
  assert.equal(animations['warrior-front'].frames[0].transform, 'translateY(100vh)');
  assert.match(animations.assassin.frames[0].transform, /^translate\(\d+%/);
  assert.match(animations.mage.frames[0].transform, /^translate\(-\d+%/);
});

test('숨어 있다가 움직이는 순간 완전히 보이고, 하늘은 처음부터 보임', () => {
  const animations = byName(animateTitle(names.map(element)));
  for (const name of ['peaks', 'castle-hill', 'hills-tall', 'ground-tall']) {
    assert.deepEqual(animations[name].frames.map(frame => [frame.offset, frame.opacity]), [[0, 0], [.001, 1], [1, 1]]);
    assert.equal(animations[name].frames.at(-1).transform, 'none');
  }
  assert.equal(animations.mage.frames[1].offset, .2);
  assert.equal(animations.logo.frames[1].offset, .15);
  assert.ok(animations['sky-tall'].frames.every(frame => frame.opacity === 1));
  assert.ok(Object.values(animations).every(item => item.timing.fill === 'both'));
});

test('동작 줄이기: 같은 순서로 0.3초씩 나타나고 이동은 없음', () => {
  const animations = animateTitle(names.map(element), { reducedMotion: true });
  assert.equal(animations.length, 9);
  assert.ok(animations.every(item => item.timing.duration === 300 && item.frames.every(frame => frame.transform === 'none')));
  assert.ok(animations.every(item => item.frames[0].opacity === 0 && item.frames[1].opacity === 1));
  assert.equal(byName(animations).logo.timing.delay, 2120);
});

test('직접 누른 다시 보기는 동작 줄이기 상태에서도 전체 재생', () => {
  const animations = byName(animateTitle(names.map(element), { reducedMotion: true, fullMotion: true }));
  assert.match(animations.assassin.frames[0].transform, /rotate\(8deg\)/);
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
