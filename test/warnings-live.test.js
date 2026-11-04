'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Wn = require('../site/warnings.js');
const { TOWNS } = require('../site/towns.js');

const feed = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'warnings-sample.json'), 'utf8'));
const NOW = Date.parse('2026-11-03T08:00:00Z');
const snapshot = { fetchedAt: '2026-11-03T05:00:00.000Z', source: 'Met Éireann warnings', warnings: feed };
const never = () => new Promise(() => {});

function deps(over) {
  const calls = { live: 0, snap: 0 };
  const d = Object.assign({
    fetchLive: async () => { calls.live++; return feed; },
    fetchSnapshot: async () => { calls.snap++; return snapshot; },
    now: NOW, timeoutMs: 500
  }, over);
  return { d, calls };
}

// ---- live success -------------------------------------------------------------------------------------
test('live success: warnings come from the live feed, stamped with the time of the fetch, snapshot not needed', async () => {
  const { d, calls } = deps();
  const r = await Wn.loadWarnings(d);
  assert.strictEqual(r.source, 'live');
  assert.strictEqual(r.fetchedAt, new Date(NOW).toISOString());
  assert.deepStrictEqual(r.list, feed);
  assert.strictEqual(calls.snap, 0);
});

test('live success with an empty list beats a snapshot that still has warnings (a cleared warning stays cleared)', async () => {
  const { d } = deps({ fetchLive: async () => [] });
  const r = await Wn.loadWarnings(d);
  assert.strictEqual(r.source, 'live');
  assert.deepStrictEqual(r.list, []);
});

// ---- live failure falls back -----------------------------------------------------------------------------
test('live fetch throws: falls back to the snapshot and keeps the snapshot\'s own saved time', async () => {
  const { d } = deps({ fetchLive: async () => { throw new Error('network'); } });
  const r = await Wn.loadWarnings(d);
  assert.strictEqual(r.source, 'snapshot');
  assert.strictEqual(r.fetchedAt, snapshot.fetchedAt);
  assert.deepStrictEqual(r.list, feed);
  assert.ok(r.liveError);
});

test('live answers with something that is not a list (an error page): falls back to the snapshot', async () => {
  for (const bad of [{ error: 'x' }, '<html>oops</html>', null, 42]) {
    const { d } = deps({ fetchLive: async () => bad });
    const r = await Wn.loadWarnings(d);
    assert.strictEqual(r.source, 'snapshot', 'for ' + JSON.stringify(bad));
  }
});

test('live fetch that never answers is given up on after the timeout', async () => {
  const { d } = deps({ fetchLive: never, timeoutMs: 20 });
  const r = await Wn.loadWarnings(d);
  assert.strictEqual(r.source, 'snapshot');
});

test('live and snapshot both unavailable: source is none, list empty, no throw', async () => {
  const r = await Wn.loadWarnings(deps({
    fetchLive: async () => { throw new Error('a'); }, fetchSnapshot: async () => { throw new Error('b'); }
  }).d);
  assert.strictEqual(r.source, 'none');
  assert.deepStrictEqual(r.list, []);
});

test('a broken snapshot file counts as unavailable', async () => {
  const r = await Wn.loadWarnings(deps({
    fetchLive: async () => { throw new Error('a'); }, fetchSnapshot: async () => ({ fetchedAt: 'x' })
  }).d);
  assert.strictEqual(r.source, 'none');
});

test('how old a snapshot is gets reported, so the page can say so', async () => {
  const r = await Wn.loadWarnings(deps({ fetchLive: async () => { throw new Error('a'); } }).d);
  assert.strictEqual(r.ageHours, 3);
});

// ---- expired warnings dropped ---------------------------------------------------------------------------
test('partition drops expired warnings, from the live list as well as the snapshot', () => {
  const later = Date.parse('2026-11-03T10:00:01Z'); // the fog warning has expired, the wind one has not
  const p = Wn.partition(feed, 'Sligo', later);
  assert.strictEqual(p.here.length + p.elsewhere.length, 1);
  assert.strictEqual(p.elsewhere[0].type, 'Wind');
});

test('a warning that expires while the page is open is dropped on the next check', () => {
  assert.strictEqual(Wn.partition(feed, 'Sligo', NOW).here.length, 1);
  assert.strictEqual(Wn.partition(feed, 'Sligo', Date.parse('2026-11-03T12:00:00Z')).here.length, 0);
});

test('every valid warning is kept: those for the county first, the rest as "elsewhere"', () => {
  const p = Wn.partition(feed, 'Limerick', NOW);
  assert.deepStrictEqual(p.here.map((w) => w.type), ['Wind']);
  assert.deepStrictEqual(p.elsewhere.map((w) => w.type), ['Fog']);
});

// ---- unaltered, byte for byte -----------------------------------------------------------------------------
test('warnings pass through loading and partitioning as the very same objects', async () => {
  const r = await Wn.loadWarnings(deps().d);
  const p = Wn.partition(r.list, 'Limerick', NOW);
  assert.strictEqual(p.here[0], feed[1]);
  assert.strictEqual(p.elsewhere[0], feed[0]);
  assert.strictEqual(JSON.stringify(r.list), JSON.stringify(feed));
});

test('headline, times, severity, certainty, event and description reach the page exactly as sent', () => {
  const w = feed[0];
  const v = Wn.view(w);
  assert.strictEqual(v.headline, w.headline);
  assert.strictEqual(v.onset, w.onset);
  assert.strictEqual(v.expiry, w.expiry);
  assert.strictEqual(v.severity, w.severity);
  assert.strictEqual(v.certainty, w.certainty);
  assert.strictEqual(v.type, w.type);
});

test('description text survives byte for byte: accents, dashes, quotes, non-breaking spaces, entities', () => {
  const html = '<p>Éire: gusts of 90–110 km/h “severe” &amp; 50% worse.</p>' +
    '<ul><li>Danger to life</li><li>Má&#233;</li></ul>';
  const b = Wn.blocks(html);
  assert.deepStrictEqual(b.map((x) => x.text), [
    'Éire: gusts of 90–110 km/h “severe” & 50% worse.',
    'Danger to life',
    'Máé'
  ]);
  assert.strictEqual(Buffer.from(b[0].text, 'utf8').toString('hex'), Buffer.from('Éire: gusts of 90–110 km/h “severe” & 50% worse.', 'utf8').toString('hex'));
});

test('a non-breaking space written as an entity stays a non-breaking space', () => {
  assert.strictEqual(Wn.blocks('<p>20&nbsp;mm in 3&nbsp;hours</p>')[0].text, '20 mm in 3 hours');
});

test('internal spacing in a description is not rewritten', () => {
  assert.strictEqual(Wn.blocks('<p>Wind  gusting   90</p>')[0].text, 'Wind  gusting   90');
});

test('markup in a description is shown as text, never run', () => {
  const b = Wn.blocks(feed[1].description);
  assert.ok(b.every((x) => !/[<>]/.test(x.text)));
});

// ---- region matching ----------------------------------------------------------------------------------------
test('every county we have a town for has a warning region code', () => {
  const codes = new Set(Object.values(Wn.CODES));
  TOWNS.forEach((t) => assert.ok(codes.has(t.county), t.county + ' has no region code'));
});

test('Limerick code matches Limerick and not Clare; Clare code matches Clare and not Limerick', () => {
  const w = { regions: ['EI16'], expiry: '2026-11-05T00:00:00+00:00' };
  assert.strictEqual(Wn.appliesTo(w, 'Limerick'), true);
  assert.strictEqual(Wn.appliesTo(w, 'Clare'), false);
  const c = { regions: ['EI03'], expiry: '2026-11-05T00:00:00+00:00' };
  assert.strictEqual(Wn.appliesTo(c, 'Clare'), true);
  assert.strictEqual(Wn.appliesTo(c, 'Limerick'), false);
});

test('a warning for several regions applies to each of them', () => {
  const w = { regions: ['EI03', 'EI16', 'EI11'] };
  ['Clare', 'Limerick', 'Kerry'].forEach((c) => assert.strictEqual(Wn.appliesTo(w, c), true, c));
  assert.strictEqual(Wn.appliesTo(w, 'Cork'), false);
});

test('a warning with unknown region codes is treated as applying here, never hidden', () => {
  const w = { regions: ['EI99'], expiry: '2026-11-05T00:00:00+00:00' };
  assert.strictEqual(Wn.partition([w], 'Kerry', NOW).here.length, 1);
});

test('the live address is the official Met Eireann warnings feed over https', () => {
  assert.strictEqual(Wn.LIVE_URL, 'https://www.met.ie/Open_Data/json/warning_IRELAND.json');
});
