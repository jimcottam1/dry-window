'use strict';
const test = require('node:test');
const assert = require('node:assert');
const W = require('../site/windows.js');
const T = require('../site/towns.js');
const S = require('../site/share.js');
const { series, LIMERICK } = require('./helpers.js');

const NOW = Date.parse('2026-11-03T20:00:00Z');
const opts = Object.assign({ now: NOW }, LIMERICK);
const DAY = '2026-11-04T00:00:00Z';

// ---- identical windows on following days are merged --------------------------------------------
test('three identical dry days become one window naming the range and the wind spread', () => {
  const s = series(DAY, 72, (i) => ({ wind: 3 + (Math.floor(i / 24) * 2) })); // 11, 18, 25 km/h
  const r = W.findWindows(s, 'washing', opts);
  assert.strictEqual(r.windows.length, 1);
  const w = r.windows[0];
  assert.strictEqual(w.days, 3);
  assert.strictEqual(w.label, 'Wed 4 to Fri 6 Nov');
  assert.match(w.reason, /same each day for 3 days/);
  assert.match(w.reason, /wind between 11 and 25 km\/h/);
  assert.strictEqual(w.spans.length, 3);
});

test('days that differ are not merged', () => {
  const s = series(DAY, 72, (i) => (Math.floor(i / 24) === 1 && i % 24 >= 13 ? { rain: 1 } : {}));
  const r = W.findWindows(s, 'washing', opts);
  assert.ok(r.windows.length >= 2);
  assert.ok(r.windows.every((w) => w.days === 1));
});

test('a gap day stops the merge', () => {
  const s = series(DAY, 72, (i) => (Math.floor(i / 24) === 1 ? { rain: 1 } : {}));
  const r = W.findWindows(s, 'washing', opts);
  assert.strictEqual(r.windows.length, 2);
  assert.ok(r.windows.every((w) => w.days === 1));
});

test('a merged range across a month end names both months', () => {
  const s = series('2026-10-31T00:00:00Z', 48);
  const r = W.findWindows(s, 'washing', Object.assign({}, opts, { now: Date.parse('2026-10-30T20:00:00Z') }));
  assert.strictEqual(r.windows[0].label, 'Sat 31 Oct to Sun 1 Nov');
});

// ---- links -----------------------------------------------------------------------------------------
test('activity words in a link resolve, including the short ones people guess', () => {
  assert.strictEqual(W.resolveActivity('wash').id, 'washing');
  assert.strictEqual(W.resolveActivity('Washing-Out').id, 'washing');
  assert.strictEqual(W.resolveActivity('mowing').id, 'mow');
  assert.strictEqual(W.resolveActivity('bike').id, 'cycle');
  assert.strictEqual(W.resolveActivity('dog').id, 'walk');
  assert.strictEqual(W.resolveActivity('juggling'), null);
  assert.strictEqual(W.resolveActivity(''), null);
  assert.strictEqual(W.resolveActivity(undefined), null);
});

test('towns resolve by slug, name, accents and case; counties map to a town and say so', () => {
  assert.strictEqual(T.resolveTown('limerick').how, 'exact');
  assert.strictEqual(T.resolveTown('Carrick-on-Shannon').town.slug, 'carrick-on-shannon');
  assert.strictEqual(T.resolveTown('CORK').town.slug, 'cork');
  assert.strictEqual(T.resolveTown('Co. Kerry').how, 'county');
  const d = T.resolveTown('donegal');
  assert.strictEqual(d.how, 'county');
  assert.strictEqual(d.town.name, 'Letterkenny');
});

test('an unknown or empty town gives null, not a quiet default', () => {
  assert.strictEqual(T.resolveTown('atlantis'), null);
  assert.strictEqual(T.resolveTown(''), null);
  assert.strictEqual(T.resolveTown(null), null);
  assert.strictEqual(T.resolveTown('%E0%A4%A'), null); // broken percent-encoding does not throw
});

// ---- share --------------------------------------------------------------------------------------------
const payload = { title: 'Dry Window', text: 'Limerick: Wed 4 Nov, 08:00 to 17:00', url: 'https://x.example/#limerick/washing' };

test('share text names the town, day, times and activity', () => {
  const t = S.shareText('Limerick', 'Washing out', { label: 'Wed 4 Nov', start: '08:00', end: '17:00', score: 'good', reason: 'Dry for 9 hours.' });
  assert.match(t, /^Limerick: Wed 4 Nov, 08:00 to 17:00 is a good window for washing out\. Dry for 9 hours\.$/);
});

test('share sheet is used when it exists', async () => {
  let got = null;
  const how = await S.deliver({ share: async (p) => { got = p; } }, payload);
  assert.strictEqual(how, 'shared');
  assert.strictEqual(got, payload);
});

test('a cancelled share sheet is not an error and does not copy anything', async () => {
  let copied = false;
  const how = await S.deliver({
    share: async () => { const e = new Error('x'); e.name = 'AbortError'; throw e; },
    writeText: async () => { copied = true; }
  }, payload);
  assert.strictEqual(how, 'cancelled');
  assert.strictEqual(copied, false);
});

test('with no share sheet, the clipboard gets the text and the link', async () => {
  let text = '';
  const how = await S.deliver({ writeText: async (t) => { text = t; } }, payload);
  assert.strictEqual(how, 'copied');
  assert.ok(text.includes(payload.text) && text.includes(payload.url));
});

test('if the share sheet fails, it falls back to the clipboard', async () => {
  const how = await S.deliver({ share: async () => { throw new Error('nope'); }, writeText: async () => {} }, payload);
  assert.strictEqual(how, 'copied');
});

test('if the clipboard is blocked, the old copy command is tried', async () => {
  const how = await S.deliver({ writeText: async () => { throw new Error('denied'); }, execCopy: () => true }, payload);
  assert.strictEqual(how, 'copied');
});

test('if everything is blocked it says manual, so the page can show the text', async () => {
  const how = await S.deliver({ writeText: async () => { throw new Error('denied'); }, execCopy: () => false }, payload);
  assert.strictEqual(how, 'manual');
  assert.strictEqual(await S.deliver({}, payload), 'manual');
  assert.match(S.MESSAGES.manual, /Press and hold/);
});

// ---- the strip in words, the strip range, the next rain ----------------------------------------------
test('day in words: a dry day, then a day with a rain spell', () => {
  const s = series(DAY, 48, (i) => (i >= 24 + 12 && i <= 24 + 14 ? { rain: 1, wind: 8 } : {}));
  assert.match(W.daySummary(s, '2026-11-04', LIMERICK.lat, LIMERICK.lon, NOW), /^Wed 4 Nov: dry in daylight\. Wind up to 11 km\/h\. 10 to 10 degrees\.$/);
  assert.match(W.daySummary(s, '2026-11-05', LIMERICK.lat, LIMERICK.lon, NOW), /rain around 12:00 to 15:00\. Wind up to 29 km\/h/);
});

test('day in words: nothing for a day with no daylight left or no data', () => {
  const s = series(DAY, 24);
  assert.strictEqual(W.daySummary(s, '2026-11-04', LIMERICK.lat, LIMERICK.lon, Date.parse('2026-11-04T18:00:00Z')), null);
  assert.strictEqual(W.daySummary(s, '2026-12-25', LIMERICK.lat, LIMERICK.lon, NOW), null);
});

test('strip range follows daylight: short in winter, long in summer', () => {
  assert.deepStrictEqual(W.dayRange(['2026-11-04'], LIMERICK.lat, LIMERICK.lon), [7, 18]);
  const sum = W.dayRange(['2026-06-21'], LIMERICK.lat, LIMERICK.lon);
  assert.ok(sum[0] <= 5 && sum[1] >= 22, 'summer range was ' + sum);
});

test('next rain names the day and hour, or says there is none', () => {
  const rainy = series(DAY, 48, (i) => (i === 30 ? { rain: 0.8 } : {}));
  assert.strictEqual(W.nextRain(rainy, NOW), 'Rain next arrives around Thu 5 Nov, 06:00.');
  assert.match(W.nextRain(series(DAY, 48), NOW), /^No real rain in the forecast for the next \d+ days\.$/);
  assert.strictEqual(W.nextRain(null, NOW), null);
});

test('rain that has already fallen is not reported as next', () => {
  const s = series(DAY, 48, (i) => (i === 2 ? { rain: 2 } : {}));
  assert.match(W.nextRain(s, Date.parse('2026-11-04T10:00:00Z')), /^No real rain/);
});
