// How old is a saved file? The page says so plainly instead of pretending the data is live.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DWFresh = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var HOUR = 3600000;
  var FORECAST_STALE_H = 14;   // snapshots run every 6 hours, so this means two were missed
  var FORECAST_DEAD_H = 36;    // older than this: do not show windows at all
  var WARNINGS_STALE_H = 8;

  // Returns 'ok' | 'stale' | 'dead' | 'missing'.
  function forecastState(fetchedAt, now) {
    var t = Date.parse(fetchedAt);
    if (!fetchedAt || isNaN(t)) return 'missing';
    var age = (now - t) / HOUR;
    if (age > FORECAST_DEAD_H) return 'dead';
    if (age > FORECAST_STALE_H) return 'stale';
    return 'ok';
  }

  function warningsState(fetchedAt, now) {
    var t = Date.parse(fetchedAt);
    if (!fetchedAt || isNaN(t)) return 'missing';
    return (now - t) / HOUR > WARNINGS_STALE_H ? 'stale' : 'ok';
  }

  return { forecastState: forecastState, warningsState: warningsState };
});
