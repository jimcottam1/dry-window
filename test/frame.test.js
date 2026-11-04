'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const W = require('../site/windows.js');
const { series, LIMERICK } = require('./helpers.js');

const T = true, F = false;
const DASH = '–';

// ---- grouping hours into frames ----
test('a frame starts and ends at the right columns', () => {
  assert.deepStrictEqual(W.frameRuns([F, T, T, T, F]), [[1, 4]]);
});

test('no window, no frame; an empty strip does not throw', () => {
  assert.deepStrictEqual(W.frameRuns([F, F, F]), []);
  assert.deepStrictEqual(W.frameRuns([]), []);
  assert.deepStrictEqual(W.frameRuns(undefined), []);
});

test('a window that runs to the last daylight hour closes at the end of the strip', () => {
  assert.deepStrictEqual(W.frameRuns([F, F, T, T]), [[2, 4]]);
});

test('a window that starts at the first column opens at 0', () => {
  assert.deepStrictEqual(W.frameRuns([T, T, F]), [[0, 2]]);
});

test('a one-hour window and an all-day window each make one frame', () => {
  assert.deepStrictEqual(W.frameRuns([T]), [[0, 1]]);
  assert.deepStrictEqual(W.frameRuns([T, T, T, T]), [[0, 4]]);
});

test('two windows on one day make two separate frames, never one long one', () => {
  assert.deepStrictEqual(W.frameRuns([T, T, F, T, T, T, F]), [[0, 2], [3, 6]]);
  assert.deepStrictEqual(W.frameRuns([T, F, T]), [[0, 1], [2, 3]]);
});

// ---- the times written beside a frame ----
test('the label is the clock times with an en dash, padded, and the end is the close of the last cell', () => {
  assert.strictEqual(W.frameLabel(7, [1, 10]), '08:00' + DASH + '17:00');
  assert.strictEqual(W.frameLabel(6, [1, 4]), '07:00' + DASH + '10:00');
  assert.strictEqual(W.frameLabel(0, [0, 1]), '00:00' + DASH + '01:00');
});

// ---- where the label goes ----
test('the label goes to the right when there is room, else to the left, else below', () => {
  assert.strictEqual(W.frameLayout([T, T, T, F, F, F, F, F, F, F, F, F], 4)[0].side, 'right');
  assert.strictEqual(W.frameLayout([F, F, F, F, F, F, F, F, F, T, T, T], 4)[0].side, 'left');
  assert.strictEqual(W.frameLayout([F, T, T, T, T, T, T, T, T, T, T, F], 4)[0].side, 'below');
});

test('with room on both sides the label goes to the right', () => {
  const l = W.frameLayout([F, F, F, F, F, T, T, F, F, F, F, F], 4);
  assert.strictEqual(l[0].side, 'right');
});

test('with two windows each label only counts the free space up to its neighbour', () => {
  const l = W.frameLayout([T, T, F, T, T, T, F, F, F, F, F, F], 4);
  assert.strictEqual(l.length, 2);
  assert.strictEqual(l[0].side, 'below', 'first frame has one free column to its right and none to its left');
  assert.strictEqual(l[1].side, 'right');
});

test('the layout keeps each frame start and end', () => {
  const l = W.frameLayout([F, T, T, F, T, F], 2);
  assert.deepStrictEqual(l.map((f) => [f.start, f.end]), [[1, 3], [4, 5]]);
});

// ---- from real windows to flags ----
const NOW = Date.parse('2026-11-03T20:00:00Z');
const opts = Object.assign({ now: NOW }, LIMERICK);

test('dayFlags marks exactly the hours of the window on that date and no others', () => {
  const s = series('2026-11-04T00:00:00Z', 72);
  const r = W.findWindows(s, 'washing', opts);
  const w = r.windows[0];
  const lo = 6, hi = 19;
  const flags = W.dayFlags(r.windows, w.date, lo, hi);
  assert.strictEqual(flags.length, hi - lo);
  const runs = W.frameRuns(flags);
  assert.strictEqual(runs.length, 1);
  assert.strictEqual(W.frameLabel(lo, runs[0]), w.start + DASH + w.end, 'frame label must match the window times');
});

test('a window on another date does not leak into this day', () => {
  const s = series('2026-11-04T00:00:00Z', 72, (i) => (i < 24 ? { rain: 2 } : {}));
  const r = W.findWindows(s, 'washing', opts);
  const day1 = W.dayFlags(r.windows, '2026-11-04', 6, 19);
  assert.ok(day1.every((x) => x === false), 'a wet first day must have no frame');
  assert.ok(W.dayFlags(r.windows, '2026-11-05', 6, 19).some(Boolean));
});

test('two windows on one day give two labelled frames that match the window list', () => {
  const s = series('2026-11-04T00:00:00Z', 72, (i) => (i === 11 || i === 12 ? { rain: 2 } : {}));
  const r = W.findWindows(s, 'washing', opts);
  const day = r.windows.filter((w) => w.date === '2026-11-04');
  assert.strictEqual(day.length, 2, 'expected two windows on the day: ' + JSON.stringify(day.map((w) => [w.start, w.end])));
  const lo = 6, hi = 19;
  const runs = W.frameRuns(W.dayFlags(r.windows, '2026-11-04', lo, hi));
  assert.strictEqual(runs.length, 2);
  const labels = runs.map((x) => W.frameLabel(lo, x)).sort();
  assert.deepStrictEqual(labels, day.map((w) => w.start + DASH + w.end).sort());
});

function summerDay(date, prev) {
  const s = series(date + 'T00:00:00Z', 48);
  const r = W.findWindows(s, 'washing', Object.assign({ now: Date.parse(prev + 'T20:00:00Z') }, LIMERICK));
  const range = W.dayRange([date], LIMERICK.lat, LIMERICK.lon);
  const lo = range[0], hi = range[1];
  const runs = W.frameRuns(W.dayFlags(r.windows, date, lo, hi));
  return { r, lo, hi, runs, w: r.windows.find((x) => x.date === date) };
}

test('a window that runs to the last daylight hour reaches the last column of the strip', () => {
  // 10 June: sunset 21:55, so the 21:00 hour is daylight and is the strip's last column. (Irish time is UTC+1 in summer.)
  const d = summerDay('2026-06-10', '2026-06-09');
  assert.strictEqual(d.runs.length, 1);
  assert.strictEqual(d.runs[0][1], d.hi - d.lo, 'frame should close at the last column');
  assert.strictEqual(W.frameLabel(d.lo, d.runs[0]).slice(-5), d.w.end);
});

test('when the last column is dark the frame closes one column early and still matches the window end', () => {
  // 21 June: sunset 22:01, so the 22:00 column is dark and is not in the window.
  const d = summerDay('2026-06-21', '2026-06-20');
  assert.strictEqual(d.runs.length, 1);
  assert.strictEqual(d.runs[0][1], d.hi - d.lo - 1);
  assert.strictEqual(W.frameLabel(d.lo, d.runs[0]).slice(-5), d.w.end);
});

// ---- the words version stays in step ----
test('the day in words names the best window with the same times as the frame', () => {
  const s = series('2026-11-04T00:00:00Z', 72);
  const r = W.findWindows(s, 'washing', opts);
  const w = r.windows.find((x) => x.date === '2026-11-04');
  const text = W.daySummary(s, '2026-11-04', LIMERICK.lat, LIMERICK.lon, NOW, r.windows);
  assert.ok(text.includes('Best window ' + w.start + DASH + w.end + '.'), text);
});

test('the words list two windows with "and", and say nothing about a window when there is none', () => {
  const s = series('2026-11-04T00:00:00Z', 72, (i) => (i === 11 || i === 12 ? { rain: 2 } : {}));
  const r = W.findWindows(s, 'washing', opts);
  const day = r.windows.filter((w) => w.date === '2026-11-04').sort((a, b) => a.startMs - b.startMs);
  const text = W.daySummary(s, '2026-11-04', LIMERICK.lat, LIMERICK.lon, NOW, r.windows);
  assert.ok(text.includes('Best windows ' + day[0].start + DASH + day[0].end + ' and ' + day[1].start + DASH + day[1].end), text);
  const none = W.daySummary(s, '2026-11-04', LIMERICK.lat, LIMERICK.lon, NOW, []);
  assert.ok(!/Best window/.test(none));
  const old = W.daySummary(s, '2026-11-04', LIMERICK.lat, LIMERICK.lon, NOW);
  assert.ok(!/Best window/.test(old), 'the old three-argument call must still work');
});

// ---- the page: stripe gone, frame drawn, key matches, wording changed ----
const site = (f) => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

test('the old stripe is gone and the wording says Best window, not Your window', () => {
  const css = site('style.css'), html = site('index.html'), app = site('app.js');
  assert.ok(!/inwin::after/.test(css), 'stripe rule still there');
  assert.ok(!/inwin/.test(css + app), 'old per-cell class still there');
  assert.ok(!/Your window|your window/.test(html + app), 'old wording left');
  assert.ok(/Best window/.test(html), 'key label missing');
});

test('the key sample uses the same rule as the frame in the strip, so it looks identical', () => {
  const css = site('style.css'), html = site('index.html');
  assert.ok(/class="k kframe"/.test(html));
  assert.ok(/\.frame,\s*\.kframe|\.kframe,\s*\.frame/.test(css), 'frame and key sample must share one rule');
  assert.ok(/border:\s*3px solid var\(--ink\)/.test(css), 'frame should be about 3 px');
});
