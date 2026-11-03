'use strict';
const test = require('node:test');
const assert = require('node:assert');
const W = require('../site/windows.js');
const { series, LIMERICK } = require('./helpers.js');

// Winter: Irish time equals UTC. Limerick daylight on 4 Nov is roughly 07:30 to 17:00.
const NOW = Date.parse('2026-11-03T20:00:00Z');
const opts = Object.assign({ now: NOW }, LIMERICK);
const DAY = '2026-11-04T00:00:00Z';

test('a dry calm day gives a Good washing window inside daylight', () => {
  const r = W.findWindows(series(DAY, 24), 'washing', opts);
  assert.ok(r.best);
  assert.strictEqual(r.best.score, 'good');
  assert.ok(r.best.hours >= 8 && r.best.hours <= 10);
  assert.ok(+r.best.start.slice(0, 2) >= 7 && +r.best.end.slice(0, 2) <= 17);
  assert.match(r.best.reason, /Dry for \d+ hours/);
});

test('rain in the middle splits the day, so no window is longer than the dry pieces', () => {
  const s = series(DAY, 24, (i) => (i === 11 || i === 12 ? { rain: 1 } : {}));
  const r = W.findWindows(s, 'washing', opts);
  assert.ok(r.windows.length >= 1);
  assert.ok(r.windows.every((w) => w.score === 'okay' && w.hours <= 4));
});

test('strong wind rules out washing but not a walk', () => {
  const windy = series(DAY, 24, () => ({ wind: 12 }));
  assert.strictEqual(W.findWindows(windy, 'washing', opts).best, null);
  const breezy = series(DAY, 24, () => ({ wind: 11 }));
  assert.strictEqual(W.findWindows(breezy, 'washing', opts).best, null);
  assert.ok(W.findWindows(breezy, 'walk', opts).best);
});

test('two dry hours is not enough for washing', () => {
  const s = series(DAY, 24, (i) => (i >= 10 && i <= 11 ? {} : { rain: 1 }));
  assert.strictEqual(W.findWindows(s, 'washing', opts).best, null);
});

test('mowing waits until the grass has had two dry hours', () => {
  const s = series(DAY, 24, (i) => (i < 12 ? { rain: 0.5 } : {}));
  const r = W.findWindows(s, 'mow', opts);
  assert.ok(r.best);
  assert.ok(+r.best.start.slice(0, 2) >= 14, 'started at ' + r.best.start);
});

test('painting needs warmth: a cold dry day has no painting window and says so', () => {
  const r = W.findWindows(series(DAY, 24, () => ({ temp: 5 })), 'paint', opts);
  assert.strictEqual(r.best, null);
  assert.match(r.wait, /No good window/);
  assert.strictEqual(r.tagKey, 'none');
});

test('painting rejects damp air', () => {
  assert.strictEqual(W.findWindows(series(DAY, 24, () => ({ temp: 12, hum: 95 })), 'paint', opts).best, null);
  assert.ok(W.findWindows(series(DAY, 24, () => ({ temp: 12, hum: 60 })), 'paint', opts).best);
});

test('hours already past are never offered', () => {
  const r = W.findWindows(series(DAY, 24), 'washing', Object.assign({}, opts, { now: Date.parse('2026-11-04T12:30:00Z') }));
  assert.ok(r.best);
  assert.ok(r.best.startMs >= Date.parse('2026-11-04T12:00:00Z'));
});

test('a best window more than a day and a half away carries a wait note naming the day', () => {
  const s = series(DAY, 72, (i) => (i < 48 ? { rain: 1 } : {}));
  const r = W.findWindows(s, 'washing', opts);
  assert.ok(r.best);
  assert.strictEqual(r.best.dow, 'Fri');
  assert.match(r.wait, /Nothing good before Fri/);
});

test('good windows rank above okay ones even when the okay one is earlier', () => {
  const s = series(DAY, 48, (i) => (i < 24 ? (i >= 9 && i <= 11 ? {} : { rain: 1 }) : {}));
  const r = W.findWindows(s, 'washing', opts);
  assert.strictEqual(r.windows[0].score, 'good');
  assert.strictEqual(r.windows[0].dow, 'Thu');
  assert.ok(r.windows.length >= 2 && r.windows[1].score === 'okay');
});

test('empty or broken data gives no windows and does not throw', () => {
  assert.strictEqual(W.findWindows(null, 'washing', opts).best, null);
  assert.strictEqual(W.findWindows({ start: 'nonsense', rain: [0] }, 'washing', opts).best, null);
  assert.strictEqual(W.findWindows({}, 'cycle', opts).best, null);
});

// ---- Irish time ----
test('in summer Irish time is an hour ahead of UTC: windows show Irish clock times', () => {
  const s = series('2026-07-15T00:00:00Z', 24);
  const r = W.findWindows(s, 'washing', Object.assign({}, opts, { now: Date.parse('2026-07-14T20:00:00Z') }));
  assert.ok(r.best);
  assert.ok(+r.best.start.slice(0, 2) <= 6, 'started ' + r.best.start);
  assert.strictEqual(W.irishClock(Date.parse('2026-07-15T09:00:00Z')), '10:00');
  assert.strictEqual(W.irishClock(Date.parse('2026-11-04T09:00:00Z')), '09:00');
});

test('late evening UTC in summer belongs to the next Irish day', () => {
  const p = W.irishParts(Date.parse('2026-07-14T23:30:00Z'));
  assert.strictEqual(p.date, '2026-07-15');
  assert.strictEqual(p.hour, 0);
  assert.strictEqual(p.dow, 'Wed');
});

test('clocks go back on 25 Oct 2026: the same clock time appears twice, an hour apart', () => {
  assert.strictEqual(W.irishClock(Date.parse('2026-10-25T00:30:00Z')), '01:30');
  assert.strictEqual(W.irishClock(Date.parse('2026-10-25T01:30:00Z')), '01:30');
  assert.strictEqual(W.irishClock(Date.parse('2026-10-25T02:30:00Z')), '02:30');
});

test('windows never cross midnight Irish time', () => {
  const s = series('2026-06-20T00:00:00Z', 48);
  const r = W.findWindows(s, 'cycle', Object.assign({}, opts, { now: Date.parse('2026-06-19T22:00:00Z') }));
  assert.ok(r.windows.length > 0);
  r.windows.forEach((w) => assert.strictEqual(W.irishParts(w.startMs).date, W.irishParts(w.endMs - 1).date));
});
