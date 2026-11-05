'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const V = require('../site/warnview.js');

const feed = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'warnings-sample.json'), 'utf8'));
const NOW = Date.parse('2026-11-03T08:00:00Z');
const live = (list, extra) => Object.assign({ list, source: 'live', fetchedAt: '2026-11-03T08:00:00.000Z', ageHours: 0, ageMinutes: 0 }, extra);
const box = (warnings, county, extra) => V.renderBox(Object.assign({ warnings, county: county || 'Limerick', now: NOW, openKeys: [] }, extra));

// ---- 6. the warnings box escapes everything it shows ------------------------------------------------------------
const evil = {
  id: '"><b>x</b>', type: '<script>alert(1)</script>', severity: '<i>s</i>', certainty: '"onmouseover="alert(1)',
  level: '"><svg onload=alert(1)>', issued: '<b>i</b>', onset: '2026-11-03T06:00:00+00:00', expiry: '2026-11-04T06:00:00+00:00',
  headline: '<img src=x onerror=alert(1)> Wind warning for Limerick',
  description: '<p><script>alert(2)</script>Hello &lt;b&gt; there</p><ul><li><a href="javascript:alert(3)">link</a></li></ul>',
  regions: ['EI16', '<u>EI</u>']
};

test('a hostile warning cannot put markup or script into the page', () => {
  const html = box(live([evil]));
  assert.ok(!/<img/i.test(html), 'img tag leaked');
  assert.ok(!/<script/i.test(html), 'script tag leaked');
  assert.ok(!/<svg/i.test(html), 'svg tag leaked');
  assert.ok(!/<a href="javascript/i.test(html), 'link leaked');
  assert.ok(!/<u>/i.test(html), 'tag in regions leaked');
  assert.ok(!/ onerror=/.test(html.replace(/&lt;[^>]*/g, '')), 'attribute leaked');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt; Wind warning for Limerick'), 'headline should be shown as text');
});

test('markup that arrives entity-encoded in a description is shown as text, in paragraphs and list items', () => {
  const w = Object.assign({}, evil, { description: '<p>Hello &lt;b&gt;bold&lt;/b&gt; there</p><ul><li>&lt;i&gt;item&lt;/i&gt;</li></ul>' });
  const html = box(live([w]));
  assert.ok(html.includes('<p>Hello &lt;b&gt;bold&lt;/b&gt; there</p>'), 'paragraph text should be escaped');
  assert.ok(html.includes('<li>&lt;i&gt;item&lt;/i&gt;</li>'), 'list text should be escaped');
  assert.ok(!html.includes('<b>bold'), 'decoded markup leaked from a paragraph');
  assert.ok(!html.includes('<i>item'), 'decoded markup leaked from a list item');
});

test('hostile values in the open-state key cannot break out of the attribute', () => {
  const html = box(live([evil]), 'Limerick', { openKeys: [] });
  assert.ok(!/data-key="[^"]*"[^>]*>\s*<b>x/.test(html));
  assert.ok(!/data-key="[^"]*"><b>/.test(html));
});

test('the level class is a fixed word, never copied from the feed', () => {
  assert.ok(/class="warn yellow"/.test(box(live([evil]))));
});

test('escaping covers quotes and ampersands', () => {
  assert.strictEqual(V.esc('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.strictEqual(V.esc(null), '');
});

// ---- what the box says -------------------------------------------------------------------------------------------------
test('headline is always visible and the full text sits inside a folded section', () => {
  const html = box(live([feed[1]]));
  assert.ok(html.includes('Status Yellow - Wind warning for Clare, Limerick'));
  assert.ok(/<details[^>]*>\s*<summary>Read the full warning<\/summary>/.test(html));
  assert.ok(!/<details[^>]* open/.test(html));
});

test('regions as sent are in the raw detail line', () => {
  assert.ok(box(live([feed[1]])).includes('Regions: EI03, EI16'));
});

test('a card the person had open stays open after a refresh', () => {
  const key = require('../site/warnings.js').keyOf(feed[1]);
  assert.ok(/<details data-key="[^"]*" open>/.test(box(live([feed[1]]), 'Limerick', { openKeys: [key] })));
  assert.ok(!/<details data-key="[^"]*" open>/.test(box(live([feed[1]]), 'Limerick', { openKeys: [] })));
});

test('warnings for other counties are listed under "other parts of Ireland", never dropped', () => {
  const html = box(live(feed), 'Limerick');
  assert.ok(html.includes('Warnings for other parts of Ireland (1)'));
  assert.ok(html.includes('Fog warning for Connacht'));
});

test('expired warnings do not appear', () => {
  const html = V.renderBox({ warnings: live(feed), county: 'Sligo', now: Date.parse('2026-11-03T10:00:01Z'), openKeys: [] });
  assert.ok(!html.includes('Fog warning'));
});

test('while the first check is still running the box says so, not "could not be loaded"', () => {
  const html = box(null);
  assert.ok(/Checking/.test(html));
  assert.ok(!/could not be loaded/.test(html));
});

test('both sources failing gives the "could not be loaded" message with the official link', () => {
  const html = box({ list: [], source: 'none', fetchedAt: null });
  assert.ok(/could not be loaded/.test(html) && html.includes('https://www.met.ie/warnings'));
});

test('a snapshot answer says it is a saved copy and how old it is', () => {
  const html = box({ list: feed, source: 'snapshot', fetchedAt: '2026-11-03T05:00:00.000Z', ageHours: 3 });
  assert.ok(/saved copy/.test(html) && /3 hours old/.test(html));
});

test('a kept live answer says when it was checked and how old it is', () => {
  const html = box({ list: [], source: 'last-live', fetchedAt: '2026-11-03T07:35:00.000Z', ageMinutes: 25 });
  assert.ok(/last live check/.test(html) && /25 minutes old/.test(html) && /07:35/.test(html));
});

// ---- 4. wording: how sure are we that nothing applies? ----------------------------------------------------------
test('a county whose code is confirmed gets the plain "no current warnings" wording', () => {
  const html = box(live([]), 'Sligo');
  assert.ok(/No current Met Éireann weather warnings for Co\. Sligo\./.test(html));
  assert.ok(!/not yet been able to confirm/.test(html));
});

test('a county whose code is a guess gets the short sentence and a pointer to met.ie', () => {
  const html = box(live([]), 'Limerick');
  assert.ok(html.includes('<div class="warn none">No warnings found for Co. Limerick. We\'re still confirming how Met Éireann labels this county, so please also check <a href="https://www.met.ie/warnings">met.ie/warnings</a>.</div>'), html);
  assert.ok(!/not yet been able to confirm/.test(html));
  assert.ok(!/No current Met Éireann weather warnings for Co\. Limerick\./.test(html));
});

test('for an unconfirmed county the "other parts" list tells people to check it too', () => {
  const html = box(live(feed), 'Dublin');
  assert.ok(/check these too/.test(html));
  assert.ok(!/check these too/.test(box(live(feed), 'Sligo')));
});
