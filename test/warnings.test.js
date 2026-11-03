'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Wn = require('../site/warnings.js');

const feed = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'warnings-sample.json'), 'utf8'));
const NOW = Date.parse('2026-11-03T08:00:00Z');

test('a warning for Connacht counties and Cavan is shown for Sligo and not for Cork', () => {
  assert.strictEqual(Wn.forCounty(feed, 'Sligo', NOW).length, 1);
  assert.strictEqual(Wn.forCounty(feed, 'Cork', NOW).length, 0);
});

test('a wind warning for Clare and Limerick is shown for Limerick', () => {
  const got = Wn.forCounty(feed, 'Limerick', NOW);
  assert.strictEqual(got.length, 1);
  assert.strictEqual(got[0].type, 'Wind');
});

test('expired warnings are dropped', () => {
  assert.strictEqual(Wn.forCounty(feed, 'Sligo', Date.parse('2026-11-03T10:00:01Z')).length, 0);
});

test('warnings come back as the very same objects, headline and times untouched', () => {
  const got = Wn.forCounty(feed, 'Sligo', NOW)[0];
  assert.strictEqual(got, feed[0]);
  assert.strictEqual(got.headline, 'Status Yellow - Fog warning for Connacht, Cavan, Donegal, Monaghan');
  assert.strictEqual(got.onset, '2026-11-02T22:00:00+00:00');
  assert.strictEqual(got.expiry, '2026-11-03T10:00:00+00:00');
});

test('a warning whose region codes we do not know is shown everywhere rather than hidden', () => {
  const odd = [{ regions: ['EI99'], expiry: '2026-11-05T00:00:00+00:00' }];
  assert.strictEqual(Wn.forCounty(odd, 'Kerry', NOW).length, 1);
});

test('a feed that is not a list gives no warnings and does not throw', () => {
  assert.deepStrictEqual(Wn.forCounty(null, 'Cork', NOW), []);
  assert.deepStrictEqual(Wn.forCounty({}, 'Cork', NOW), []);
});

test('description keeps every sentence and bullet exactly, as plain text', () => {
  assert.deepStrictEqual(Wn.blocks(feed[0].description), [
    { type: 'p', text: 'Areas of dense fog developing.' },
    { type: 'p', text: 'Potential impacts:' },
    { type: 'li', text: 'Poor visibility' },
    { type: 'li', text: 'Difficult travelling conditions' }
  ]);
});

test('markup in a description is never kept as markup', () => {
  const b = Wn.blocks(feed[1].description);
  assert.ok(b.length > 0 && b.every((x) => !/[<>]/.test(x.text)));
});
