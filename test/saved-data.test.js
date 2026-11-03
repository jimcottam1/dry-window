'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { TOWNS } = require('../site/towns.js');

const file = path.join(__dirname, '..', 'site', 'data', 'forecast.json');

test('the saved forecast covers every town with matching arrays', { skip: !fs.existsSync(file) }, () => {
  const f = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const t of TOWNS) {
    const d = f.towns[t.slug];
    assert.ok(d, 'missing ' + t.slug);
    assert.strictEqual(d.county, t.county);
    const n = d.rain.length;
    assert.ok(n >= 48, t.slug + ' has only ' + n + ' hours');
    for (const k of ['temp', 'wind', 'hum']) assert.strictEqual(d[k].length, n, t.slug + ' ' + k);
  }
});

test('town slugs are unique', () => {
  assert.strictEqual(new Set(TOWNS.map((t) => t.slug)).size, TOWNS.length);
});
