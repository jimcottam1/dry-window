'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const W = require('../site/windows.js');
const { series, LIMERICK } = require('./helpers.js');

const T = true, F = false;
const DASH = '–';
const NOW = Date.parse('2026-11-03T20:00:00Z');
const opts = Object.assign({ now: NOW }, LIMERICK);

// ---- grouping hours into frames ----
test('a frame starts and ends at the right columns', () => {
  assert.deepStrictEqual(W.frameRuns([F, T, T, T, F]), [[1, 4]]);
});

test('no window, no frame; an empty strip does not throw', () => {
  assert.deepStrictEqual(W.frameRuns([F, F, F]), []);
  assert.deepStrictEqual(W.frameRuns([]), []);
  assert.deepStrictEqual(W.frameRuns(undefined), []);
});

test('a window that runs to the last column closes at the end of the strip, and one at the first column opens at 0', () => {
  assert.deepStrictEqual(W.frameRuns([F, F, T, T]), [[2, 4]]);
  assert.deepStrictEqual(W.frameRuns([T, T, F]), [[0, 2]]);
});

test('a one-hour window and an all-day window each make one frame', () => {
  assert.deepStrictEqual(W.frameRuns([T]), [[0, 1]]);
  assert.deepStrictEqual(W.frameRuns([T, T, T, T]), [[0, 4]]);
});

test('separate runs stay separate (the page only ever draws one per day, but the grouping must not merge them)', () => {
  assert.deepStrictEqual(W.frameRuns([T, T, F, T, T, T, F]), [[0, 2], [3, 6]]);
});

// ---- the times written below a frame ----
test('the label is the clock times with an en dash, padded, and the end is the close of the last cell', () => {
  assert.strictEqual(W.frameLabel(7, [1, 10]), '08:00' + DASH + '17:00');
  assert.strictEqual(W.frameLabel(6, [1, 4]), '07:00' + DASH + '10:00');
  assert.strictEqual(W.frameLabel(0, [0, 1]), '00:00' + DASH + '01:00');
});

// ---- only the best window of each day is framed ----
function win(startISO, hours) {
  const s = Date.parse(startISO);
  return { spans: [{ startMs: s, endMs: s + hours * 3600000 }], hours: hours };
}

test('dayBest gives the first-ranked window on that date and only one, even with two windows on the day', () => {
  const long = win('2026-11-04T09:00:00Z', 6), short = win('2026-11-04T16:00:00Z', 2);
  const r = W.dayBest([long, short], '2026-11-04');
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].spans[0].startMs, long.spans[0].startMs);
  // the ranking is the list order: put the short one first and it wins
  assert.strictEqual(W.dayBest([short, long], '2026-11-04')[0].spans[0].startMs, short.spans[0].startMs);
});

test('dayBest ignores other dates, tolerates junk, and gives nothing for a day with no window', () => {
  const w = win('2026-11-05T09:00:00Z', 5);
  assert.deepStrictEqual(W.dayBest([w], '2026-11-04'), []);
  assert.deepStrictEqual(W.dayBest([], '2026-11-04'), []);
  assert.deepStrictEqual(W.dayBest(undefined, '2026-11-04'), []);
  assert.deepStrictEqual(W.dayBest([{}], '2026-11-04'), []);
});

test('a window that spans several days is the best window on each of those days', () => {
  const multi = { spans: [
    { startMs: Date.parse('2026-11-04T08:00:00Z'), endMs: Date.parse('2026-11-04T17:00:00Z') },
    { startMs: Date.parse('2026-11-05T08:00:00Z'), endMs: Date.parse('2026-11-05T17:00:00Z') }
  ] };
  assert.strictEqual(W.dayBest([multi], '2026-11-04').length, 1);
  assert.strictEqual(W.dayBest([multi], '2026-11-05').length, 1);
  assert.strictEqual(W.dayBest([multi], '2026-11-06').length, 0);
});

test('with two real windows on one day only one frame is flagged, and it is the better one', () => {
  const s = series('2026-11-04T00:00:00Z', 72, (i) => (i === 11 || i === 12 ? { rain: 2 } : {}));
  const r = W.findWindows(s, 'washing', opts);
  const day = r.windows.filter((w) => w.date === '2026-11-04');
  assert.strictEqual(day.length, 2, 'expected two windows on the day');
  const lo = 6, hi = 19;
  const runs = W.frameRuns(W.dayFlags(W.dayBest(r.windows, '2026-11-04'), '2026-11-04', lo, hi));
  assert.strictEqual(runs.length, 1, 'exactly one frame on that day');
  const first = r.windows.find((w) => w.date === '2026-11-04');
  assert.strictEqual(W.frameLabel(lo, runs[0]), first.start + DASH + first.end);
});

test('a day with no window has no frame at all', () => {
  const s = series('2026-11-04T00:00:00Z', 72, (i) => (i < 24 ? { rain: 2 } : {}));
  const r = W.findWindows(s, 'washing', opts);
  const flags = W.dayFlags(W.dayBest(r.windows, '2026-11-04'), '2026-11-04', 6, 19);
  assert.ok(flags.every((x) => x === false));
  assert.deepStrictEqual(W.frameRuns(flags), []);
  assert.ok(W.frameRuns(W.dayFlags(W.dayBest(r.windows, '2026-11-05'), '2026-11-05', 6, 19)).length === 1);
});

test('dayFlags marks exactly the hours of the window on that date and no others', () => {
  const s = series('2026-11-04T00:00:00Z', 72);
  const r = W.findWindows(s, 'washing', opts);
  const w = r.windows[0];
  const lo = 6, hi = 19;
  const flags = W.dayFlags(W.dayBest(r.windows, w.date), w.date, lo, hi);
  assert.strictEqual(flags.length, hi - lo);
  const runs = W.frameRuns(flags);
  assert.strictEqual(runs.length, 1);
  assert.strictEqual(W.frameLabel(lo, runs[0]), w.start + DASH + w.end, 'frame label must match the window times');
});

// ---- the label sits below the frame and must stay on the strip ----
test('labelCols: the label width in columns grows as the cells shrink, is at least 1 and never more than the strip', () => {
  assert.strictEqual(W.labelCols(600, 44, 8, 10, 70), 2);            // wide cells
  assert.ok(W.labelCols(300, 36, 8, 12, 70) >= 3);                     // phone cells
  assert.strictEqual(W.labelCols(1000, 44, 8, 1, 70), 1);              // one column: clamp
  assert.ok(W.labelCols(40, 36, 8, 5, 70) <= 5, 'cannot be wider than the strip');
  assert.ok(W.labelCols(0, 36, 8, 12, 70) >= 1, 'a not yet laid out strip still gives a sane number');
});

test('labelAlign: left-align under the frame start unless that would run off the right edge', () => {
  assert.strictEqual(W.labelAlign([2, 9], 12, 4), 'start');
  assert.strictEqual(W.labelAlign([8, 12], 12, 4), 'start', 'fits exactly');
  assert.strictEqual(W.labelAlign([9, 12], 12, 4), 'end', 'would overflow, so right-align to the frame end');
  assert.strictEqual(W.labelAlign([11, 12], 12, 4), 'end');
});

test('a frame at the right edge never pushes its label off the strip, at any width we support', () => {
  for (const stripPx of [280, 320, 360, 390, 430, 600, 860]) {
    for (const n of [8, 11, 14, 17]) {
      const L = W.labelCols(stripPx, stripPx <= 420 ? 36 : 44, 8, n, 70);
      for (let start = 0; start < n; start++) {
        for (let end = start + 1; end <= n; end++) {
          const side = W.labelAlign([start, end], n, L);
          if (side === 'start') assert.ok(start + L <= n, 'overflow right: ' + [stripPx, n, start, end]);
          else assert.ok(end - L >= 0 || L >= n, 'overflow left: ' + [stripPx, n, start, end]);
        }
      }
    }
  }
});

test('one frame per day means two labels can never collide', () => {
  const wins = [win('2026-11-04T08:00:00Z', 3), win('2026-11-04T12:00:00Z', 3), win('2026-11-04T16:00:00Z', 1)];
  for (const d of ['2026-11-04', '2026-11-05']) {
    assert.ok(W.frameRuns(W.dayFlags(W.dayBest(wins, d), d, 5, 20)).length <= 1);
  }
});

// ---- best window at the first or the last daylight hour ----
function summerDay(date, prev) {
  const s = series(date + 'T00:00:00Z', 48);
  const r = W.findWindows(s, 'washing', Object.assign({ now: Date.parse(prev + 'T20:00:00Z') }, LIMERICK));
  const range = W.dayRange([date], LIMERICK.lat, LIMERICK.lon);
  const lo = range[0], hi = range[1];
  const runs = W.frameRuns(W.dayFlags(W.dayBest(r.windows, date), date, lo, hi));
  return { r, lo, hi, runs, w: r.windows.find((x) => x.date === date) };
}

test('a best window that starts at the first daylight hour opens at column 0 and its label stays left-aligned', () => {
  const d = summerDay('2026-06-21', '2026-06-20');
  assert.strictEqual(d.runs.length, 1);
  assert.strictEqual(d.runs[0][0], 0);
  assert.strictEqual(W.frameLabel(d.lo, d.runs[0]).slice(0, 5), d.w.start);
  assert.strictEqual(W.labelAlign(d.runs[0], d.hi - d.lo, 4), 'start');
});

test('a best window that runs to the last daylight hour reaches the last column and its label right-aligns', () => {
  // 10 June: sunset 21:55, so the 21:00 hour is daylight and is the last column. (Irish time is UTC+1 in summer.)
  const d = summerDay('2026-06-10', '2026-06-09');
  assert.strictEqual(d.runs.length, 1);
  assert.strictEqual(d.runs[0][1], d.hi - d.lo, 'frame should close at the last column');
  assert.strictEqual(W.frameLabel(d.lo, d.runs[0]).slice(-5), d.w.end);
  assert.strictEqual(W.labelAlign(d.runs[0], d.hi - d.lo, 4), 'start', 'a long window starting at 0 still fits');
  assert.strictEqual(W.labelAlign([d.hi - d.lo - 1, d.hi - d.lo], d.hi - d.lo, 4), 'end');
});

test('when the last column is dark the frame closes one column early and still matches the window end', () => {
  const d = summerDay('2026-06-21', '2026-06-20');
  assert.strictEqual(d.runs[0][1], d.hi - d.lo - 1);
  assert.strictEqual(W.frameLabel(d.lo, d.runs[0]).slice(-5), d.w.end);
});

// ---- the words list the same single window ----
test('the day in words names the best window with the same times as the frame', () => {
  const s = series('2026-11-04T00:00:00Z', 72);
  const r = W.findWindows(s, 'washing', opts);
  const w = r.windows.find((x) => x.date === '2026-11-04');
  const text = W.daySummary(s, '2026-11-04', LIMERICK.lat, LIMERICK.lon, NOW, r.windows);
  assert.ok(text.includes('Best window ' + w.start + DASH + w.end + '.'), text);
});

test('the words name one window even when the day has two, and nothing when it has none', () => {
  const s = series('2026-11-04T00:00:00Z', 72, (i) => (i === 11 || i === 12 ? { rain: 2 } : {}));
  const r = W.findWindows(s, 'washing', opts);
  const first = r.windows.find((w) => w.date === '2026-11-04');
  const text = W.daySummary(s, '2026-11-04', LIMERICK.lat, LIMERICK.lon, NOW, r.windows);
  assert.ok(text.includes('Best window ' + first.start + DASH + first.end + '.'), text);
  assert.ok(!/Best windows| and /.test(text.split('degrees.')[1] || ''), 'no plural, no second window: ' + text);
  assert.ok(!/Best window/.test(W.daySummary(s, '2026-11-04', LIMERICK.lat, LIMERICK.lon, NOW, [])));
  assert.ok(!/Best window/.test(W.daySummary(s, '2026-11-04', LIMERICK.lat, LIMERICK.lon, NOW)), 'the old three-argument call must still work');
});

// ---- resize and orientation: a debounced re-render ----
test('debounce runs once, after the quiet period, with the latest arguments', () => {
  const calls = [], timers = [], fake = {
    set: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clear: (id) => { timers[id - 1] = null; }
  };
  const d = W.debounce((x) => calls.push(x), 150, fake);
  d(1); d(2); d(3);
  assert.strictEqual(calls.length, 0);
  timers.filter(Boolean).forEach((t) => { assert.strictEqual(t.ms, 150); t.fn(); });
  assert.deepStrictEqual(calls, [3], 'only the last call fires');
});

test('the page re-renders the strip on resize and on orientation change, debounced', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'site', 'app.js'), 'utf8');
  assert.ok(/addEventListener\('resize'/.test(app));
  assert.ok(/addEventListener\('orientationchange'/.test(app));
  assert.ok(/W\.debounce\(/.test(app));
});

// ---- the page: stripe gone, frame drawn, key matches, wording changed, no side labels ----
const site = (f) => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

test('the old stripe is gone and the wording says Best window, not Your window', () => {
  const css = site('style.css'), html = site('index.html'), app = site('app.js');
  assert.ok(!/inwin::after/.test(css), 'stripe rule still there');
  assert.ok(!/inwin/.test(css + app), 'old per-cell class still there');
  assert.ok(!/Your window|your window/.test(html + app), 'old wording left');
  assert.ok(/Best window/.test(html), 'key label missing');
});

test('times always go below the frame: no left or right label code is left', () => {
  const css = site('style.css'), app = site('app.js'), win = site('windows.js');
  assert.ok(!/frameLayout/.test(app + win), 'frameLayout is gone');
  assert.ok(!/ft r|ft l|\.ft\.r|\.ft\.l/.test(css + app), 'side labels are gone');
  assert.ok(/ft b/.test(app), 'below label missing');
});

test('the page keeps each label on the strip: it asks labelCols and labelAlign and has a right-aligned variant', () => {
  const app = site('app.js'), css = site('style.css');
  assert.ok(/W\.labelCols\(/.test(app), 'label width is not measured');
  assert.ok(/W\.labelAlign\(r, n, labelN\) === 'start'/.test(app), 'label alignment is not used');
  assert.ok(/ft b e/.test(app) && /\.ft\.b\.e\{[^}]*justify-self:\s*end/.test(css), 'right-aligned label missing');
});

test('the page frames only the best window of each day', () => {
  const app = site('app.js');
  assert.ok(/W\.dayBest\(/.test(app), 'strip must use dayBest');
  assert.ok(!/W\.dayFlags\(res\.windows/.test(app), 'strip must not flag every window');
});

test('the key sample shares the frame rule (same border and halo) and has a radius of about 5', () => {
  const css = site('style.css'), html = site('index.html');
  assert.ok(/class="k kframe"/.test(html));
  assert.ok(/\.frame,\s*\.kframe|\.kframe,\s*\.frame/.test(css), 'frame and key sample must share one rule');
  assert.ok(/border:\s*3px solid var\(--ink\)/.test(css), 'frame should be about 3 px');
  assert.ok(/\.k\.kframe\{[^}]*border-radius:\s*5px/.test(css), 'key sample radius');
});
