'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { sunTimes } = require('../site/solar.js');

const hm = (min) => Math.floor(min / 60) + ':' + String(Math.round(min % 60)).padStart(2, '0');

test('Limerick on 3 Nov: sunrise about 07:33 and sunset about 17:02 (UTC, same as Irish time in winter)', () => {
  const s = sunTimes(2026, 11, 3, 52.66, -8.63);
  assert.ok(Math.abs(s.rise - (7 * 60 + 33)) <= 3, 'sunrise was ' + hm(s.rise));
  assert.ok(Math.abs(s.set - (17 * 60 + 2)) <= 3, 'sunset was ' + hm(s.set));
});

test('midsummer day is much longer than midwinter day', () => {
  const summer = sunTimes(2026, 6, 21, 52.66, -8.63).dayLength;
  const winter = sunTimes(2026, 12, 21, 52.66, -8.63).dayLength;
  assert.ok(summer > 16.5 * 60 && winter < 8.5 * 60);
});
