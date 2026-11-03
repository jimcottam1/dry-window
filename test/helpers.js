'use strict';
// Builds a small hourly series for tests. fn(i, date) returns overrides for hour i.
function series(startISO, n, fn) {
  const t0 = Date.parse(startISO);
  const s = { start: startISO, rain: [], temp: [], wind: [], hum: [] };
  for (let i = 0; i < n; i++) {
    const o = Object.assign({ rain: 0, temp: 10, wind: 3, hum: 70 }, fn ? fn(i, new Date(t0 + i * 3600000)) : {});
    s.rain.push(o.rain); s.temp.push(o.temp); s.wind.push(o.wind); s.hum.push(o.hum);
  }
  return s;
}
const LIMERICK = { lat: 52.66, lon: -8.63 };
module.exports = { series, LIMERICK };
