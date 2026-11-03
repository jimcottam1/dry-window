'use strict';
// Met Eireann open forecast XML (met.no "locationforecast" style) -> compact hourly arrays.
// Instant values (temperature, wind, humidity) come at points in time; precipitation comes for
// intervals (1, 3 or 6 hours). Everything is spread onto an hourly grid.

const HOUR = 3600000;
const MAX_HOURS = 120; // five days is enough for planning, and keeps the saved file small

function attr(s, name) {
  const m = s.match(new RegExp('\\b' + name + '="([^"]*)"'));
  return m ? m[1] : null;
}

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function parseForecast(xml) {
  if (typeof xml !== 'string' || xml.indexOf('<weatherdata') === -1) throw new Error('not a forecast document');
  const instants = [];
  const intervals = [];
  const re = /<time\s+datatype="forecast"\s+from="([^"]+)"\s+to="([^"]+)">([\s\S]*?)<\/time>/g;
  let m;
  while ((m = re.exec(xml))) {
    const from = Date.parse(m[1]);
    const to = Date.parse(m[2]);
    const body = m[3];
    if (isNaN(from) || isNaN(to)) continue;
    if (from === to) {
      const t = body.match(/<temperature[^>]*>/);
      const w = body.match(/<windSpeed[^>]*>/);
      const h = body.match(/<humidity[^>]*>/);
      if (t && w) {
        instants.push({ t: from, temp: num(attr(t[0], 'value')), wind: num(attr(w[0], 'mps')), hum: h ? num(attr(h[0], 'value')) : null });
      }
    } else {
      const p = body.match(/<precipitation[^>]*>/);
      if (p && num(attr(p[0], 'value')) !== null) intervals.push({ from, to, mm: num(attr(p[0], 'value')) });
    }
  }
  if (instants.length < 6 || !intervals.length) throw new Error('forecast has too little data');
  instants.sort((a, b) => a.t - b.t);
  // Shortest interval wins where intervals overlap.
  intervals.sort((a, b) => (b.to - b.from) - (a.to - a.from));

  const start = Math.ceil(instants[0].t / HOUR) * HOUR;
  const last = instants[instants.length - 1].t;
  const out = { start: new Date(start).toISOString(), rain: [], temp: [], wind: [], hum: [] };
  let k = 0;
  for (let t = start; t <= last && out.rain.length < MAX_HOURS; t += HOUR) {
    while (k + 1 < instants.length && instants[k + 1].t <= t) k++;
    const inst = instants[k];
    let rain = 0;
    for (const iv of intervals) {
      if (t >= iv.from && t < iv.to) rain = iv.mm / ((iv.to - iv.from) / HOUR);
    }
    out.rain.push(Math.round(rain * 100) / 100);
    out.temp.push(inst.temp);
    out.wind.push(inst.wind);
    out.hum.push(inst.hum === null ? null : Math.round(inst.hum));
  }
  return out;
}

module.exports = { parseForecast, MAX_HOURS };
