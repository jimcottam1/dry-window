// Sunrise and sunset from the date and place, worked out on the page (NOAA general solar position
// formulae, public-domain maths). No network. Returns minutes after 00:00 UTC.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DWSolar = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var RAD = Math.PI / 180;

  function dayOfYear(y, m, d) {
    return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000) + 1;
  }

  // lat north positive, lon east positive (Limerick is about -8.63).
  function sunTimes(y, m, d, lat, lon) {
    var n = dayOfYear(y, m, d);
    var g = (2 * Math.PI / 365) * (n - 1 + (12 - 12) / 24);
    var eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    var decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) +
      0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    var cosH = Math.cos(90.833 * RAD) / (Math.cos(lat * RAD) * Math.cos(decl)) - Math.tan(lat * RAD) * Math.tan(decl);
    if (cosH > 1) return { polar: 'night' };
    if (cosH < -1) return { polar: 'day' };
    var ha = Math.acos(cosH) / RAD;
    var rise = 720 - 4 * (lon + ha) - eq;
    var set = 720 - 4 * (lon - ha) - eq;
    return { rise: rise, set: set, dayLength: set - rise };
  }

  return { sunTimes: sunTimes };
});
