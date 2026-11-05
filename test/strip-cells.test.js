'use strict';
// Runs the real site/app.js against a tiny fake page and checks the week strip's own cells,
// not just the key: each hour's cell must carry the class that the stylesheet gives a pattern.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SITE = path.join(__dirname, '..', 'site');
const FORECAST = fs.readFileSync(path.join(__dirname, 'fixtures', 'strip-forecast.json'), 'utf8');
const NOW = Date.parse('2026-11-04T06:00:00Z');

function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function runPage(forecastText, nowMs) {
  const NOWX = nowMs || NOW;
  const els = {};
  function el() {
    return {
      innerHTML: '', textContent: '', hidden: false, value: '', clientWidth: 360,
      addEventListener() {}, setAttribute() {}, getAttribute() { return null; }, querySelectorAll() { return []; }
    };
  }
  const document = {
    getElementById(id) { return els[id] || (els[id] = el()); },
    createElement() {
      let t = '';
      return { set textContent(v) { t = v; }, get innerHTML() { return escHtml(t); } };
    },
    addEventListener() {}, visibilityState: 'visible'
  };
  class FakeDate extends Date {
    constructor(...a) { super(...(a.length ? a : [NOWX])); }
    static now() { return NOWX; }
  }
  const win = {
    document, Date: FakeDate, innerWidth: 390, location: { hash: '', href: 'http://x/' },
    history: { replaceState() {} }, navigator: {}, addEventListener() {},
    setInterval() { return 0; }, setTimeout, clearTimeout, console, Intl, Promise, JSON, Math,
    fetch(url) {
      if (String(url).indexOf('forecast.json') >= 0) return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(forecastText)) });
      return Promise.reject(new Error('offline'));
    }
  };
  win.window = win; win.globalThis = win;
  const ctx = vm.createContext(win);
  for (const f of ['towns.js', 'solar.js', 'windows.js', 'warnings.js', 'warnview.js', 'fresh.js', 'share.js', 'app.js']) {
    vm.runInContext(fs.readFileSync(path.join(SITE, f), 'utf8'), ctx, { filename: f });
  }
  return new Promise((r) => setTimeout(() => r(els), 50));
}

// [{cls: 'c light', title: '...'}] for the first row of the strip
function firstRow(html) {
  const row = html.split('<div class="row">')[1];
  const cells = [];
  const re = /<i class="([^"]*)"(?: title="([^"]*)")?><\/i>/g;
  let m;
  while ((m = re.exec(row))) cells.push({ cls: m[1].split(' '), title: m[2] || '' });
  return cells;
}

test('week strip cells: dry is plain, light rain, rain and dark each carry their pattern class', async () => {
  const els = await runPage(FORECAST);
  const cells = firstRow(els.strip.innerHTML);
  assert.ok(cells.length >= 8, 'strip drew ' + cells.length + ' cells');
  const rainy = cells.filter((c) => / rain(,|$)/.test(c.title) && !/light rain/.test(c.title));
  const light = cells.filter((c) => /light rain/.test(c.title));
  const dry = cells.filter((c) => /:00, dry/.test(c.title));
  assert.strictEqual(rainy.length, 2, '12:00 and 13:00 are rain');
  assert.strictEqual(light.length, 2, '10:00 and 11:00 are light rain');
  assert.ok(dry.length >= 2);
  rainy.forEach((c) => { assert.ok(c.cls.includes('wet')); assert.ok(!c.cls.includes('light')); });
  light.forEach((c) => { assert.ok(c.cls.includes('light')); assert.ok(!c.cls.includes('wet')); });
  dry.forEach((c) => { assert.ok(!c.cls.includes('wet') && !c.cls.includes('light')); });
  const dark = cells.filter((c) => c.cls.includes('night'));
  assert.ok(dark.length >= 1, 'the sunrise/sunset edge hours are marked dark');
  assert.ok(cells.some((c) => c.cls.includes('night') && !c.cls.includes('wet')));
});

test('the stylesheet gives every one of those classes a pattern, on cells and on the key', () => {
  const css = fs.readFileSync(path.join(SITE, 'style.css'), 'utf8');
  for (const k of ['light', 'wet', 'night']) {
    const re = new RegExp('\.c\.' + k + ',\.k\.' + k + '\{background-image:');
    assert.ok(re.test(css), k + ' has no pattern for both .c and .k');
  }
  assert.ok(/class="k night"/.test(fs.readFileSync(path.join(SITE, 'index.html'), 'utf8')));
});

test('hours already past are blank cells with no pattern; the current hour is still drawn', async () => {
  const els = await runPage(FORECAST, Date.parse('2026-11-04T12:30:00Z'));
  const row = els.strip.innerHTML.split('<div class="row">')[1];
  const na = (row.match(/<i class="c na"><\/i>/g) || []).length;
  assert.strictEqual(na, 5, '07:00 to 11:00 are past');
  const cells = firstRow(els.strip.innerHTML);
  assert.ok(cells[0].cls.includes('na') && !cells[0].cls.includes('wet'));
  const first = cells.find((c) => !c.cls.includes('na'));
  assert.ok(first.title.indexOf('12:00, rain') >= 0 && first.cls.includes('wet'));
});

test('a forecast 20 hours old is drawn with a "treat with care" note; one 40 hours old is not drawn at all', async () => {
  const stale = await runPage(FORECAST, Date.parse('2026-11-05T01:30:00Z'));
  assert.ok(/few hours old/.test(stale.notice.innerHTML), 'stale note');
  assert.strictEqual(stale.app.hidden, false);
  const dead = await runPage(FORECAST, Date.parse('2026-11-05T18:30:00Z'));
  assert.ok(/more than a day and a half old/.test(dead.notice.innerHTML), 'dead note');
  assert.strictEqual(dead.app.hidden, true);
  assert.ok(!dead.strip, 'the strip was never drawn');
});

test('a town missing from the saved forecast hides the windows and says so', async () => {
  const f = JSON.parse(FORECAST); f.towns = {};
  const els = await runPage(JSON.stringify(f));
  assert.strictEqual(els.app.hidden, true);
  assert.ok(/could not load the forecast/.test(els.notice.innerHTML));
});
