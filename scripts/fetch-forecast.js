'use strict';
// Saves the Met Eireann forecast for a fixed list of towns, plus the warnings feed, as JSON files
// the page reads. Run by the scheduled workflow (and by hand). One polite request per town, spaced
// out. On any failure the last good data is kept, so the site never goes blank.
//
// Sources and terms (checked 2 and 3 Nov 2026):
//   Forecast: http://openaccess.pf.api.met.ie/metno-wdb2ts/locationforecast  (no robots.txt rules)
//   Warnings: https://www.met.ie/Open_Data/json/warning_IRELAND.json
//   Licence: CC BY 4.0 plus the condition that warnings shown with the forecast stay unaltered.

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { parseForecast } = require('./parse-forecast.js');
const { TOWNS } = require('../site/towns.js');

const USER_AGENT = 'DryWindow/0.1 (+https://github.com/jimcottam1)';
const FORECAST_URL = 'http://openaccess.pf.api.met.ie/metno-wdb2ts/locationforecast';
const WARNINGS_URL = 'https://www.met.ie/Open_Data/json/warning_IRELAND.json';
const GAP_MS = 1500;

function getText(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': USER_AGENT, Accept: '*/*' }, timeout: 20000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error('HTTP ' + res.statusCode)); return; }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
}

function writeJsonAtomic(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}

const sleepReal = (ms) => new Promise((r) => setTimeout(r, ms));

// Everything that touches the network or the clock is passed in, so tests run offline.
async function run(opts) {
  const o = Object.assign({
    fetchText: getText, towns: TOWNS, outDir: path.join(__dirname, '..', 'site', 'data'),
    now: () => new Date(), sleep: sleepReal, log: console.log
  }, opts || {});
  fs.mkdirSync(o.outDir, { recursive: true });
  const fcFile = path.join(o.outDir, 'forecast.json');
  const wFile = path.join(o.outDir, 'warnings.json');
  const prev = readJson(fcFile);
  const prevTowns = (prev && prev.towns) || {};
  const result = { ok: 0, kept: 0, failed: [], warnings: 'kept' };
  const towns = {};

  for (let i = 0; i < o.towns.length; i++) {
    const t = o.towns[i];
    if (i > 0) await o.sleep(GAP_MS);
    try {
      const xml = await o.fetchText(FORECAST_URL + '?lat=' + t.lat + ';long=' + t.lon);
      const data = parseForecast(xml);
      towns[t.slug] = Object.assign({ name: t.name, county: t.county, lat: t.lat, lon: t.lon, fetchedAt: o.now().toISOString() }, data);
      result.ok++;
    } catch (e) {
      result.failed.push(t.slug + ': ' + e.message);
      if (prevTowns[t.slug]) { towns[t.slug] = prevTowns[t.slug]; result.kept++; }
    }
  }
  // Only replace the forecast file if at least one town worked; otherwise leave it exactly as it was.
  if (result.ok > 0) {
    writeJsonAtomic(fcFile, {
      generatedAt: o.now().toISOString(),
      source: 'Met Éireann open forecast data, CC BY 4.0',
      towns
    });
  }

  try {
    const text = await o.fetchText(WARNINGS_URL);
    const list = JSON.parse(text);
    if (!Array.isArray(list)) throw new Error('warnings feed is not a list');
    // Saved exactly as received.
    writeJsonAtomic(wFile, { fetchedAt: o.now().toISOString(), source: 'Met Éireann warnings', warnings: list });
    result.warnings = 'saved';
  } catch (e) {
    result.failed.push('warnings: ' + e.message);
  }
  o.log('forecast ok ' + result.ok + ', kept old ' + result.kept + ', failures ' + result.failed.length + '; warnings ' + result.warnings);
  result.failed.forEach((f) => o.log('  failed ' + f));
  return result;
}

if (require.main === module) {
  run().then((r) => { process.exitCode = r.ok === 0 ? 1 : 0; }).catch((e) => { console.error(e); process.exitCode = 1; });
}

module.exports = { run };
