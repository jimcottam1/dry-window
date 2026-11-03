'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { parseForecast } = require('../scripts/parse-forecast.js');

const xml = fs.readFileSync(path.join(__dirname, 'fixtures', 'forecast-limerick.xml'), 'utf8');

test('real Met Eireann forecast fixture parses to equal-length hourly arrays', () => {
  const f = parseForecast(xml);
  assert.strictEqual(f.start, '2026-11-03T21:00:00.000Z');
  const n = f.rain.length;
  assert.ok(n >= 30);
  for (const k of ['temp', 'wind', 'hum']) assert.strictEqual(f[k].length, n);
  assert.ok(f.temp.every((v) => v > -20 && v < 40));
  assert.ok(f.wind.every((v) => v >= 0 && v < 60));
  assert.ok(f.rain.every((v) => v >= 0));
});

function doc(body) {
  return '<weatherdata><product>' + body + '</product></weatherdata>';
}
function inst(iso, t, w) {
  return '<time datatype="forecast" from="' + iso + '" to="' + iso + '"><location><temperature id="TTT" unit="celsius" value="' + t +
    '"/><windSpeed id="ff" mps="' + w + '"/><humidity value="80"/></location></time>';
}
function prec(from, to, mm) {
  return '<time datatype="forecast" from="' + from + '" to="' + to + '"><location><precipitation unit="mm" value="' + mm + '"/></location></time>';
}
function eightHours() {
  let body = '';
  for (let h = 0; h < 8; h++) body += inst('2026-11-03T0' + h + ':00:00Z', 8, 3);
  return body;
}

test('a 3 hour rain total is spread evenly over its hours', () => {
  const f = parseForecast(doc(eightHours() + prec('2026-11-03T00:00:00Z', '2026-11-03T03:00:00Z', 0.6)));
  assert.deepStrictEqual(f.rain.slice(0, 4), [0.2, 0.2, 0.2, 0]);
});

test('where intervals overlap, the shorter one wins', () => {
  const f = parseForecast(doc(eightHours() +
    prec('2026-11-03T00:00:00Z', '2026-11-03T06:00:00Z', 6) +
    prec('2026-11-03T02:00:00Z', '2026-11-03T03:00:00Z', 0)));
  assert.deepStrictEqual(f.rain.slice(0, 4), [1, 1, 0, 1]);
});

test('rejects things that are not a forecast', () => {
  assert.throws(() => parseForecast('<html>Service unavailable</html>'));
  assert.throws(() => parseForecast(doc(inst('2026-11-03T00:00:00Z', 8, 3))));
  assert.throws(() => parseForecast(null));
});
