'use strict';
const test = require('node:test');
const assert = require('node:assert');
const W = require('../site/windows.js');
const Wn = require('../site/warnings.js');
const { series, LIMERICK } = require('./helpers.js');

const HOUR = 3600000;
const at = (s) => Date.parse(s);

test('clocks go forward on 29 Mar 2026: 01:00 UTC is 02:00 Irish time, there is no 01:xx, and day rows use Irish hours', () => {
  assert.strictEqual(W.irishClock(at('2026-03-29T00:59:00Z')), '00:59');
  assert.strictEqual(W.irishClock(at('2026-03-29T01:00:00Z')), '02:00');
  assert.strictEqual(W.irishParts(at('2026-03-28T23:59:00Z')).date, '2026-03-28');
  assert.strictEqual(W.irishParts(at('2026-03-29T00:00:00Z')).date, '2026-03-29');
  // rain in the 10:00 UTC hour is 11:00 to 12:00 on the clock
  const s = series('2026-03-28T00:00:00Z', 72, (i) => ({ rain: i === 34 ? 2 : 0 }));
  const text = W.daySummary(s, '2026-03-29', LIMERICK.lat, LIMERICK.lon, at('2026-03-29T00:00:00Z'), []);
  assert.ok(text.indexOf('rain around 11:00 to 12:00') >= 0, text);
  // the same hour of the same forecast shape on 25 Oct (clocks back) is 10:00 to 11:00
  const o = series('2026-10-24T00:00:00Z', 72, (i) => ({ rain: i === 34 ? 2 : 0 }));
  assert.ok(W.daySummary(o, '2026-10-25', LIMERICK.lat, LIMERICK.lon, at('2026-10-25T00:00:00Z'), []).indexOf('rain around 10:00 to 11:00') >= 0);
});

test('windows over the March and October clock changes are whole hours, inside one Irish day, with Irish start and end times', () => {
  for (const [start, now] of [['2026-03-28T00:00:00Z', '2026-03-28T00:00:00Z'], ['2026-10-24T00:00:00Z', '2026-10-24T00:00:00Z']]) {
    const r = W.findWindows(series(start, 72), 'washing', Object.assign({ now: at(now) }, LIMERICK));
    const spans = r.windows.reduce((l, w) => l.concat(w.spans), []);
    assert.strictEqual(spans.length, 3, 'one span per Irish day');
    for (const sp of spans) {
      assert.strictEqual((sp.endMs - sp.startMs) % HOUR, 0);
      assert.strictEqual(W.irishParts(sp.startMs).date, W.irishParts(sp.endMs - 1).date, 'a span never crosses Irish midnight');
    }
    for (const w of r.windows) {
      assert.strictEqual(w.start, W.irishClock(w.spans[0].startMs));
      assert.strictEqual(w.end, W.irishClock(w.spans[w.spans.length - 1].endMs));
    }
  }
  // the strip's hour range follows Irish clock hours: sunrise 06:xx and sunset 20:xx around 29 Mar, 07:xx to 18:xx around 25 Oct
  assert.deepStrictEqual(W.dayRange(['2026-03-28', '2026-03-29', '2026-03-30'], LIMERICK.lat, LIMERICK.lon), [6, 21]);
  assert.deepStrictEqual(W.dayRange(['2026-10-24', '2026-10-25', '2026-10-26'], LIMERICK.lat, LIMERICK.lon), [7, 19]);
});

test('the very last forecast hour can end a window, and a final day with one hour still summarises', () => {
  const s = series('2026-11-04T08:00:00Z', 9); // last hour is 16:00 to 17:00
  const r = W.findWindows(s, 'washing', Object.assign({ now: at('2026-11-04T08:00:00Z') }, LIMERICK));
  assert.strictEqual(r.best.end, '17:00');
  assert.strictEqual(r.best.endMs, at('2026-11-04T17:00:00Z'));
  assert.strictEqual(r.best.hours, 9);
  const one = series('2026-11-05T12:00:00Z', 1);
  assert.ok(/^Thu 5 Nov: dry in daylight/.test(W.daySummary(one, '2026-11-05', LIMERICK.lat, LIMERICK.lon, at('2026-11-05T10:00:00Z'), [])));
});

test('temperature and wind arrays shorter than the rain array never turn the unknown hours into a window', () => {
  const s = series('2026-11-04T08:00:00Z', 9);
  s.temp = s.temp.slice(0, 4); s.wind = s.wind.slice(0, 4);
  const o = Object.assign({ now: at('2026-11-04T08:00:00Z') }, LIMERICK);
  for (const id of ['washing', 'paint', 'cycle', 'walk']) {
    const r = W.findWindows(s, id, o);
    assert.ok(!r.best || r.best.endMs <= at('2026-11-04T12:00:00Z'), id + ' ran into hours with no wind or temperature');
    assert.ok(JSON.stringify(r).indexOf('NaN') < 0, id + ' wrote NaN');
  }
});

test('a warning expires at the very moment of its expiry, and one more millisecond keeps it', () => {
  const w = { id: 1, headline: 'Yellow Wind Warning for Limerick', regions: ['EI07'], expiry: '2026-11-03T10:00:00Z' };
  assert.strictEqual(Wn.forCounty([w], 'Limerick', at('2026-11-03T09:59:59.999Z')).length, 1);
  assert.strictEqual(Wn.forCounty([w], 'Limerick', at('2026-11-03T10:00:00Z')).length, 0);
  assert.strictEqual(Wn.nextExpiryMs([w], at('2026-11-03T10:00:00Z')), null);
});
