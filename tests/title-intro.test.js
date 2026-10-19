import test from 'node:test';
import assert from 'node:assert/strict';
import { animateTitle, syncIntroVisibility, syncIdleVisibility } from '../src/title-intro.js';

// 겹침 순서(layout.json)와 같은 화면 속 순서. 그림자는 그 캐릭터 바로 뒤에 깐다.
const names = ['sky-tall', 'peaks', 'castle-hill', 'hills-tall', 'ground-tall', 'assassin', 'mage-shadow', 'mage', 'warrior-front-shadow', 'warrior-front', 'logo'];
const element = layer => ({
  dataset: { layer }, style: {},
  animate(frames, timing) { return { frames, timing, playState: 'running', pause() { this.playState = 'paused'; }, play() { this.playState = 'running'; } }; },
});
const byName = animations => Object.fromEntries(animations.map((item, index) => [names[index], item]));

test('전체 연출: 지형 → 전사 → 냥살자·냥법사 → 로고 순서와 끝나는 시간', () => {
  const animations = byName(animateTitle(names.map(element)));
  const start = name => animations[name].timing.delay;
  assert.deepEqual(['sky-tall', 'ground-tall', 'hills-tall', 'peaks', 'castle-hill', 'warrior-front', 'assassin', 'mage', 'logo'].map(start),
    [0, 0, 0, 420, 600, 1100, 1560, 1680, 2120]);
  assert.equal(Math.max(...Object.values(animations).map(item => item.timing.delay + item.timing.duration)), 2680);
  // 전사는 살짝 위에서 떨어져 착지하고, 냥살자는 전사 쪽(오른쪽)·냥법사는 왼쪽에서 바깥으로 튀어나온다.
  assert.match(animations['warrior-front'].frames[0].transform, /^translateY\(-/);
  assert.equal(animations['warrior-front'].frames.at(-1).transform, 'none');
  // 그림자는 제 캐릭터와 함께 나타난다.
  for (const name of ['warrior-front', 'mage']) {
    assert.deepEqual(['delay', 'duration'].map(key => animations[name + '-shadow'].timing[key]), ['delay', 'duration'].map(key => animations[name].timing[key]));
  }
  assert.match(animations.assassin.frames[0].transform, /^translate\(\d+%/);
  assert.match(animations.mage.frames[0].transform, /^translate\(-\d+%/);
});

test('숨어 있다가 움직이는 순간 완전히 보이고, 하늘과 앞 땅은 처음부터 보임', () => {
  const animations = byName(animateTitle(names.map(element)));
  for (const name of ['peaks', 'castle-hill', 'hills-tall']) {
    assert.deepEqual(animations[name].frames.map(frame => [frame.offset, frame.opacity]), [[0, 0], [.001, 1], [1, 1]]);
    assert.equal(animations[name].frames.at(-1).transform, 'none');
  }
  assert.equal(animations.mage.frames[1].offset, .2);
  assert.equal(animations.logo.frames[1].offset, .15);
  // 앞 땅이 처음부터 깔려 있어 긴 휴대폰에서도 화면 아래가 빈 판으로 보이지 않는다. 언덕은 그 뒤에서 올라온다.
  for (const name of ['sky-tall', 'ground-tall']) assert.ok(animations[name].frames.every(frame => frame.opacity === 1));
  assert.equal(animations['hills-tall'].frames[0].transform, 'translateY(100%)');
  assert.ok(Object.values(animations).every(item => item.timing.fill === 'both'));
});

test('동작 줄이기: 같은 순서로 0.3초씩 나타나고 이동은 없음', () => {
  const animations = animateTitle(names.map(element), { reducedMotion: true });
  assert.equal(animations.length, 11);
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

test('대기 연출: 숨으면 그 자세로 멈추고, 보이면 같은 자세에서 횟수를 처음부터 센다', () => {
  // 0.5초 기다렸다가 3.1초 주기를 13번 넘게 한 연출(40.9초), 24번을 다 마친 연출(74.9초), 아직 기다리는 연출(0.2초)
  const idle = [40900, 74900, 200].map(currentTime => ({
    currentTime, playState: 'running', effect: { getTiming: () => ({ delay: 500, duration: 3100 }) },
    pause() { this.playState = 'paused'; }, play() { this.playState = 'running'; },
  }));
  syncIdleVisibility(idle, true);
  assert.ok(idle.every(item => item.playState === 'paused'));
  syncIdleVisibility(idle, false);
  // 같은 자세(주기 안 0.1초)에서, 끝난 것은 쉬는 자세(첫 반복 시작)에서 다시 24번을 한다. 기다리던 것은 그대로.
  assert.deepEqual(idle.map(item => [item.playState, item.currentTime]), [['running', 600], ['running', 500], ['running', 200]]);
});
