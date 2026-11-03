'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run } = require('../scripts/fetch-forecast.js');

const xml = fs.readFileSync(path.join(__dirname, 'fixtures', 'forecast-limerick.xml'), 'utf8');
const warnText = fs.readFileSync(path.join(__dirname, 'fixtures', 'warnings-sample.json'), 'utf8');
const TOWNS = [
  { slug: 'limerick', name: 'Limerick', county: 'Limerick', lat: 52.66, lon: -8.63 },
  { slug: 'cork', name: 'Cork', county: 'Cork', lat: 51.9, lon: -8.47 }
];
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dw-'));
const read = (dir, f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const base = (dir, fetchText, t) => ({
  fetchText, towns: TOWNS, outDir: dir, sleep: async () => {}, log: () => {}, now: () => new Date(t || '2026-11-03T05:00:00Z')
});
const good = async (url) => (url.includes('warning') ? warnText : xml);

test('saves a forecast per town and the warnings exactly as received', async () => {
  const dir = tmp();
  const r = await run(base(dir, good));
  assert.strictEqual(r.ok, 2);
  const f = read(dir, 'forecast.json');
  assert.deepStrictEqual(Object.keys(f.towns).sort(), ['cork', 'limerick']);
  assert.strictEqual(f.towns.limerick.fetchedAt, '2026-11-03T05:00:00.000Z');
  assert.deepStrictEqual(read(dir, 'warnings.json').warnings, JSON.parse(warnText));
});

test('asks for each town by its own coordinates, one request per town', async () => {
  const urls = [];
  await run(base(tmp(), async (u) => { urls.push(u); return good(u); }));
  const fc = urls.filter((u) => u.includes('locationforecast'));
  assert.strictEqual(fc.length, 2);
  assert.ok(fc[0].includes('lat=52.66') && fc[0].includes('long=-8.63'));
  assert.ok(fc[1].includes('lat=51.9'));
});

test('a town that fails keeps its last good data and its old timestamp', async () => {
  const dir = tmp();
  await run(base(dir, good, '2026-11-03T05:00:00Z'));
  const flaky = async (u) => { if (u.includes('lat=51.9')) throw new Error('HTTP 503'); return good(u); };
  const r = await run(base(dir, flaky, '2026-11-03T11:00:00Z'));
  assert.strictEqual(r.kept, 1);
  const f = read(dir, 'forecast.json');
  assert.strictEqual(f.towns.limerick.fetchedAt, '2026-11-03T11:00:00.000Z');
  assert.strictEqual(f.towns.cork.fetchedAt, '2026-11-03T05:00:00.000Z');
});

test('if everything fails the saved files are left exactly as they were', async () => {
  const dir = tmp();
  await run(base(dir, good));
  const before = fs.readFileSync(path.join(dir, 'forecast.json'), 'utf8');
  const beforeW = fs.readFileSync(path.join(dir, 'warnings.json'), 'utf8');
  const r = await run(base(dir, async () => { throw new Error('offline'); }));
  assert.strictEqual(r.ok, 0);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'forecast.json'), 'utf8'), before);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'warnings.json'), 'utf8'), beforeW);
});

test('a garbage response is treated as a failure and nothing is saved', async () => {
  const dir = tmp();
  const r = await run(base(dir, async () => '<html>oops</html>'));
  assert.strictEqual(r.ok, 0);
  assert.ok(!fs.existsSync(path.join(dir, 'forecast.json')));
  assert.ok(!fs.existsSync(path.join(dir, 'warnings.json')));
});

test('a failed warnings fetch keeps the old warnings file', async () => {
  const dir = tmp();
  await run(base(dir, good, '2026-11-03T05:00:00Z'));
  await run(base(dir, async (u) => { if (u.includes('warning')) throw new Error('HTTP 500'); return xml; }, '2026-11-03T11:00:00Z'));
  assert.strictEqual(read(dir, 'warnings.json').fetchedAt, '2026-11-03T05:00:00.000Z');
});
