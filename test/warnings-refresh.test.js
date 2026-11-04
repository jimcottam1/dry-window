'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Wn = require('../site/warnings.js');

const feed = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'warnings-sample.json'), 'utf8'));
const snapshot = { fetchedAt: '2026-11-03T05:00:00.000Z', warnings: feed };
const HOUR = 3600000;
const never = () => new Promise(() => {});

// A promise we settle by hand, to make requests finish in any order.
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}

function makeStore(over) {
  let t = Date.parse('2026-11-03T08:00:00Z');
  const calls = { live: 0, snap: 0 };
  const deps = Object.assign({
    fetchLive: () => { calls.live++; return Promise.resolve([]); },
    fetchSnapshot: () => { calls.snap++; return Promise.resolve(snapshot); },
    now: () => t, timeoutMs: 500
  }, over);
  const store = Wn.createStore(deps);
  return { store, calls, advance: (ms) => { t += ms; }, clock: () => t };
}

// ---- 1. a newer answer is never overwritten by an older one --------------------------------------------
test('two overlapping refreshes: the later one finishes first, the earlier one is ignored when it arrives', async () => {
  const slow = deferred(), fast = deferred();
  const queue = [slow, fast];
  const { store } = makeStore({ fetchLive: () => queue.shift().promise });
  const first = store.refresh({ force: true });   // sequence 1, slow
  const second = store.refresh({ force: true });  // sequence 2, fast
  fast.resolve([]);                                // newer answer: no warnings
  await second;
  assert.deepStrictEqual(store.current().list, []);
  slow.resolve(feed);                              // older answer arrives late, with warnings
  const lateResult = await first;
  assert.deepStrictEqual(store.current().list, [], 'the older answer must not replace the newer one');
  assert.deepStrictEqual(lateResult.list, [], 'the caller of the older refresh gets the current answer back');
});

test('a refresh is skipped while one is already in flight', async () => {
  const d = deferred();
  const { store, calls } = makeStore({ fetchLive: () => { calls2.n++; return d.promise; } });
  const calls2 = { n: 0 };
  const a = store.refresh();
  const b = store.refresh();
  await new Promise((r) => setTimeout(r, 5));
  assert.strictEqual(calls2.n, 1, 'the second refresh must not start another request');
  d.resolve([]);
  await Promise.all([a, b]);
  assert.strictEqual(calls2.n, 1);
  assert.strictEqual(store.current().source, 'live');
  // once finished, the next refresh goes ahead
  await store.refresh();
  assert.strictEqual(calls2.n, 2);
  void calls;
});

test('a live empty list followed by a failed live fetch keeps the live answer, not the snapshot\'s warning', async () => {
  let fail = false;
  const { store, advance } = makeStore({ fetchLive: async () => { if (fail) throw new Error('offline'); return []; } });
  await store.refresh();
  assert.deepStrictEqual(store.current().list, []);
  fail = true;
  advance(25 * 60000);
  const r = await store.refresh();
  assert.deepStrictEqual(r.list, [], 'the snapshot warning must not come back');
  assert.strictEqual(r.source, 'last-live');
  assert.strictEqual(r.ageMinutes, 25);
  assert.strictEqual(r.fetchedAt, new Date(Date.parse('2026-11-03T08:00:00Z')).toISOString());
  assert.ok(r.liveError);
});

test('a failed live fetch with no earlier live answer uses the snapshot', async () => {
  const { store } = makeStore({ fetchLive: async () => { throw new Error('offline'); } });
  const r = await store.refresh();
  assert.strictEqual(r.source, 'snapshot');
  assert.deepStrictEqual(r.list, feed);
});

test('an earlier live answer that is older than the snapshot is not preferred over it', async () => {
  let fail = false;
  const { store } = makeStore({
    fetchLive: async () => { if (fail) throw new Error('x'); return []; },
    fetchSnapshot: async () => ({ fetchedAt: '2026-11-03T09:30:00.000Z', warnings: feed }),
    now: () => Date.parse('2026-11-03T08:00:00Z')
  });
  await store.refresh();       // live at 08:00
  fail = true;
  const r = await store.refresh(); // snapshot says 09:30, which is newer than the live answer
  assert.strictEqual(r.source, 'snapshot');
});

test('after a failure, the next successful live fetch becomes the answer again', async () => {
  let fail = true;
  const { store } = makeStore({ fetchLive: async () => { if (fail) throw new Error('x'); return [feed[1]]; } });
  assert.strictEqual((await store.refresh()).source, 'snapshot');
  fail = false;
  const r = await store.refresh();
  assert.strictEqual(r.source, 'live');
  assert.deepStrictEqual(r.list, [feed[1]]);
});

test('current() is null before the first refresh finishes', () => {
  assert.strictEqual(makeStore().store.current(), null);
});

// ---- expiry timer -----------------------------------------------------------------------------------------------
test('time until the earliest expiry among the warnings that are still valid', () => {
  const now = Date.parse('2026-11-03T08:00:00Z');
  // the fog warning expires 10:00, the wind warning on 4 Nov, so the fog warning is next: 2 hours
  assert.strictEqual(Wn.nextExpiryMs(feed, now), 2 * HOUR);
});

test('already-expired warnings are not counted, and no valid warnings means no timer', () => {
  assert.strictEqual(Wn.nextExpiryMs(feed, Date.parse('2026-11-03T10:30:00Z')), Date.parse('2026-11-04T21:00:00Z') - Date.parse('2026-11-03T10:30:00Z'));
  assert.strictEqual(Wn.nextExpiryMs(feed, Date.parse('2026-11-05T00:00:00Z')), null);
  assert.strictEqual(Wn.nextExpiryMs([], 0), null);
  assert.strictEqual(Wn.nextExpiryMs(null, 0), null);
});

// ---- a hung request can never leave the page on "Checking..." for ever --------------------------------------
test('live failing and the snapshot hanging: the store gives up after the timeout and answers "none"', async () => {
  const { store } = makeStore({
    fetchLive: async () => { throw new Error('offline'); },
    fetchSnapshot: never, timeoutMs: 30
  });
  const r = await store.refresh();
  assert.strictEqual(r.source, 'none');
  assert.deepStrictEqual(r.list, []);
});

test('the "none" answer leads to the met.ie/warnings message, not to "Checking..."', async () => {
  const V = require('../site/warnview.js');
  const { store } = makeStore({ fetchLive: never, fetchSnapshot: never, timeoutMs: 30 });
  const r = await store.refresh();
  const html = V.renderBox({ warnings: r, county: 'Sligo', now: Date.parse('2026-11-03T08:00:00Z'), openKeys: [] });
  assert.ok(!/Checking/.test(html));
  assert.ok(/could not be loaded/.test(html) && html.includes('https://www.met.ie/warnings'));
});

test('live and snapshot both hanging: still answers, within the timeouts', async () => {
  const { store } = makeStore({ fetchLive: never, fetchSnapshot: never, timeoutMs: 30 });
  const started = Date.now();
  const r = await store.refresh();
  assert.strictEqual(r.source, 'none');
  assert.ok(Date.now() - started < 1000, 'took ' + (Date.now() - started) + ' ms');
});

test('when the live request times out it is told to stop (its signal is aborted)', async () => {
  let seen = null;
  const { store } = makeStore({ fetchLive: (signal) => { seen = signal; return never(); }, timeoutMs: 20 });
  await store.refresh();
  assert.ok(seen, 'the live fetch should be given an abort signal');
  assert.strictEqual(seen.aborted, true);
});

test('a live request that answers in time is not aborted', async () => {
  let seen = null;
  const { store } = makeStore({ fetchLive: async (signal) => { seen = signal; return []; }, timeoutMs: 200 });
  await store.refresh();
  await new Promise((r) => setTimeout(r, 250));
  assert.strictEqual(seen.aborted, false);
});

test('a snapshot that hangs does not delay a live answer', async () => {
  const { store } = makeStore({ fetchLive: async () => [], fetchSnapshot: never, timeoutMs: 5000 });
  const r = await store.refresh();
  assert.strictEqual(r.source, 'live');
});

// ---- both fail after a good live answer ------------------------------------------------------------------------------
test('live [] then both live and snapshot failing: the last live answer is kept, not "none"', async () => {
  let down = false;
  const { store, advance } = makeStore({
    fetchLive: async () => { if (down) throw new Error('live down'); return []; },
    fetchSnapshot: async () => { if (down) throw new Error('snapshot down'); return snapshot; }
  });
  await store.refresh();
  down = true;
  advance(40 * 60000);
  const r = await store.refresh();
  assert.strictEqual(r.source, 'last-live');
  assert.deepStrictEqual(r.list, []);
  assert.strictEqual(r.ageMinutes, 40);
});

test('live [] then the live fetch failing and the snapshot hanging: still the last live answer', async () => {
  let down = false;
  const { store } = makeStore({
    fetchLive: async () => { if (down) throw new Error('live down'); return []; },
    fetchSnapshot: () => (down ? never() : Promise.resolve(snapshot)), timeoutMs: 30
  });
  await store.refresh();
  down = true;
  const r = await store.refresh();
  assert.strictEqual(r.source, 'last-live');
});

test('both failing with no earlier live answer is still "none"', async () => {
  const { store } = makeStore({ fetchLive: async () => { throw new Error('a'); }, fetchSnapshot: async () => { throw new Error('b'); } });
  assert.strictEqual((await store.refresh()).source, 'none');
});
