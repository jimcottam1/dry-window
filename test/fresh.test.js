'use strict';
const test = require('node:test');
const assert = require('node:assert');
const F = require('../site/fresh.js');

const NOW = Date.parse('2026-11-03T20:00:00Z');
const ago = (h) => new Date(NOW - h * 3600000).toISOString();

test('forecast freshness: ok, stale, dead, missing', () => {
  assert.strictEqual(F.forecastState(ago(3), NOW), 'ok');
  assert.strictEqual(F.forecastState(ago(20), NOW), 'stale');
  assert.strictEqual(F.forecastState(ago(40), NOW), 'dead');
  assert.strictEqual(F.forecastState(undefined, NOW), 'missing');
  assert.strictEqual(F.forecastState('garbage', NOW), 'missing');
});

test('warnings freshness is stricter than forecast freshness', () => {
  assert.strictEqual(F.warningsState(ago(3), NOW), 'ok');
  assert.strictEqual(F.warningsState(ago(10), NOW), 'stale');
  assert.strictEqual(F.warningsState(null, NOW), 'missing');
});
