'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Wn = require('../site/warnings.js');

const texts = (html) => Wn.blocks(html).map((b) => b.text);
const NOW = Date.parse('2026-11-03T08:00:00Z');
const soon = '2026-11-05T00:00:00+00:00';

// ---- 2. nothing is dropped from a description ---------------------------------------------------------------
test('a line break becomes a real line break, not nothing', () => {
  assert.deepStrictEqual(texts('<p>Gusts of 90 km/h<br>Danger to life<br/>Stay indoors</p>'), ['Gusts of 90 km/h\nDanger to life\nStay indoors']);
  assert.deepStrictEqual(texts('<p>One<BR />Two</p>'), ['One\nTwo']);
});

test('text outside any paragraph or list item is kept as its own paragraph', () => {
  const b = Wn.blocks('Before<p>Inside</p>Between<ul><li>Item</li></ul>After');
  assert.deepStrictEqual(b, [
    { type: 'p', text: 'Before' }, { type: 'p', text: 'Inside' }, { type: 'p', text: 'Between' },
    { type: 'li', text: 'Item' }, { type: 'p', text: 'After' }
  ]);
});

test('an unclosed paragraph tag does not lose its text', () => {
  assert.deepStrictEqual(texts('<p>Never closed'), ['Never closed']);
  assert.deepStrictEqual(texts('<p>One<p>Two</p>'), ['One', 'Two']);
});

test('other tags around text are removed but the words stay, in order', () => {
  assert.deepStrictEqual(texts('<div>Alpha <strong>bold</strong> omega</div><p>Next</p>'), ['Alpha bold omega', 'Next']);
});

test('whitespace-only gaps between blocks produce nothing extra', () => {
  assert.strictEqual(Wn.blocks('<p>A</p>\n  \n<p>B</p>').length, 2);
});

// ---- 3. bad entities never crash ----------------------------------------------------------------------------
test('a numeric entity beyond the Unicode range is left exactly as written', () => {
  assert.doesNotThrow(() => Wn.blocks('<p>x &#9999999; y</p>'));
  assert.deepStrictEqual(texts('<p>x &#9999999; y</p>'), ['x &#9999999; y']);
  assert.deepStrictEqual(texts('<p>x &#x110000; y</p>'), ['x &#x110000; y']);
  assert.deepStrictEqual(texts('<p>x &#xFFFFFFFFFF; y</p>'), ['x &#xFFFFFFFFFF; y']);
});

test('a lone surrogate or null entity is left as written; valid ones still decode', () => {
  assert.deepStrictEqual(texts('<p>&#xD800;</p>'), ['&#xD800;']);
  assert.deepStrictEqual(texts('<p>&#0;</p>'), ['&#0;']);
  assert.deepStrictEqual(texts('<p>&#128512; &#x10FFFF;</p>')[0].codePointAt(0), 128512);
  assert.deepStrictEqual(texts('<p>caf&#233;</p>'), ['café']);
});

// ---- 4. which warnings count as local, and how sure we are -------------------------------------------------------
test('a warning whose headline names the county counts as local even if its region codes do not', () => {
  const w = { headline: 'Status Yellow - Rain warning for Limerick', regions: ['EI99', 'EI04'], expiry: soon };
  assert.strictEqual(Wn.appliesTo(w, 'Limerick'), true);
  assert.strictEqual(Wn.appliesTo(w, 'Cork'), true);   // by its code
  assert.strictEqual(Wn.appliesTo(w, 'Kerry'), false);
});

test('a warning that names the province counts as local for each county in it', () => {
  const w = { headline: 'Status Orange - Wind warning for Munster', regions: ['EI03'], expiry: soon };
  ['Limerick', 'Kerry', 'Cork', 'Tipperary', 'Waterford', 'Clare'].forEach((c) => assert.strictEqual(Wn.appliesTo(w, c), true, c));
  assert.strictEqual(Wn.appliesTo(w, 'Dublin'), false);
  const c = { headline: 'Fog warning for Connacht, Cavan, Donegal, Monaghan', regions: ['EI10'], expiry: soon };
  ['Galway', 'Mayo', 'Sligo', 'Cavan', 'Donegal'].forEach((x) => assert.strictEqual(Wn.appliesTo(c, x), true, x));
});

test('province matching does not leak across provinces', () => {
  const w = { headline: 'Wind warning for Munster', regions: ['EI99'], expiry: soon };
  assert.strictEqual(Wn.appliesTo(w, 'Dublin'), true); // unknown codes are shown to everyone, never hidden
  const known = { headline: 'Wind warning for Munster', regions: ['EI03'], expiry: soon };
  assert.strictEqual(Wn.appliesTo(known, 'Dublin'), false);
  assert.strictEqual(Wn.appliesTo(known, 'Galway'), false);
});

test('a whole-country headline applies everywhere, but "Northern Ireland" does not count as "Ireland"', () => {
  const all = { headline: 'Status Yellow - Wind warning for Ireland', regions: ['EI03'], expiry: soon };
  assert.strictEqual(Wn.appliesTo(all, 'Dublin'), true);
  const ni = { headline: 'Warning for Northern Ireland', regions: ['EI03'], expiry: soon };
  assert.strictEqual(Wn.appliesTo(ni, 'Dublin'), false);
});

test('a county name inside another word is not a match', () => {
  const w = { headline: 'Corkery road warning', regions: ['EI03'], expiry: soon };
  assert.strictEqual(Wn.appliesTo(w, 'Cork'), false);
});

test('only the eight region codes seen in a live warning are confirmed', () => {
  ['Cavan', 'Donegal', 'Galway', 'Leitrim', 'Mayo', 'Monaghan', 'Roscommon', 'Sligo'].forEach((c) => assert.strictEqual(Wn.isConfirmed(c), true, c));
  ['Limerick', 'Cork', 'Dublin', 'Kerry', 'Clare'].forEach((c) => assert.strictEqual(Wn.isConfirmed(c), false, c));
});

test('the geographical area (regions) is part of what is shown, exactly as sent', () => {
  const v = Wn.view({ headline: 'h', regions: ['EI03', 'EI16'], description: '' });
  assert.deepStrictEqual(v.regions, ['EI03', 'EI16']);
  assert.strictEqual(Wn.view({ headline: 'h', description: '' }).regions, null);
});

test('partition counts a headline match as local', () => {
  const w = { headline: 'Rain warning for Limerick', regions: ['EI99'], expiry: soon };
  assert.strictEqual(Wn.partition([w], 'Limerick', NOW).here.length, 1);
});

// ---- "N. Ireland" and "N Ireland" are Northern Ireland too ------------------------------------------------------------
test('"N. Ireland" and "N Ireland" are not read as the whole of Ireland', () => {
  ['Warning for N. Ireland', 'Warning for N Ireland', 'Warning for NI and N.Ireland', 'Warning for northern ireland'].forEach((h) => {
    assert.strictEqual(Wn.appliesTo({ headline: h, regions: ['EI03'], expiry: soon }, 'Dublin'), false, h);
  });
});

test('"in Ireland" and "Ireland" still mean the whole country', () => {
  ['Wind warning in Ireland', 'Wind warning for Ireland', 'Status Yellow - Rain warning for all of Ireland'].forEach((h) => {
    assert.strictEqual(Wn.appliesTo({ headline: h, regions: ['EI03'], expiry: soon }, 'Dublin'), true, h);
  });
});
