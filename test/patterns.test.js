'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const css = fs.readFileSync(path.join(__dirname, '..', 'site', 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// Rule body for an exact selector, e.g. ".c.wet".
function body(sel) {
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m, found = null;
  while ((m = re.exec(css))) if (m[1].split(',').some((x) => x.trim() === sel)) found = (found || '') + m[2] + ';'; // later rules win in the page
  return found;
}
const image = (sel) => { const b = body(sel); const all = b && [...b.matchAll(/background-image:\s*([^;]+)/g)]; return all && all.length ? all[all.length - 1][1].trim() : null; };

test('light rain, rain and dark hours each carry a pattern, and the key shows the same ones', () => {
  const seen = new Set();
  for (const st of ['light', 'wet', 'night']) {
    const cell = image('.c.' + st);
    assert.ok(cell && /gradient/.test(cell), st + ' cell has no pattern');
    const keyName = st === 'wet' ? '.k.wet' : '.k.' + st;
    assert.strictEqual(image(keyName), cell, 'key sample for ' + st + ' differs from the cell');
    seen.add(cell);
  }
  assert.strictEqual(seen.size, 3, 'the three patterns must differ from each other');
});

test('dry stays plain, so the patterns mean something', () => {
  assert.strictEqual(image('.c'), null);
  assert.strictEqual(image('.k.dry'), null);
});
