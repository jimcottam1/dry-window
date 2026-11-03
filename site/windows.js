// Window finding: turns an hourly forecast into the best dry windows for each activity.
// Pure functions, no network, no DOM. Times are shown in Irish time (Europe/Dublin).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./solar.js'));
  else root.DWWindows = factory(root.DWSolar);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Solar) {
  var HOUR = 3600000;
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var fmt = null;
  function irishParts(ms) {
    if (!fmt) {
      fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Dublin', hourCycle: 'h23', year: 'numeric', month: '2-digit',
        day: '2-digit', hour: '2-digit', minute: '2-digit'
      });
    }
    var p = {};
    fmt.formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
    var date = p.year + '-' + p.month + '-' + p.day;
    var dow = DOW[new Date(Date.UTC(+p.year, +p.month - 1, +p.day)).getUTCDay()];
    return {
      date: date, hour: +p.hour, minute: +p.minute, dow: dow,
      day: +p.day, month: MONTHS[+p.month - 1], label: dow + ' ' + (+p.day) + ' ' + MONTHS[+p.month - 1]
    };
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function irishClock(ms) { var p = irishParts(ms); return pad(p.hour) + ':' + pad(p.minute); }

  // Sunrise and sunset for an Irish calendar date, as UTC milliseconds.
  function daylight(dateStr, lat, lon) {
    var y = +dateStr.slice(0, 4), m = +dateStr.slice(5, 7), d = +dateStr.slice(8, 10);
    var s = Solar.sunTimes(y, m, d, lat, lon);
    if (s.polar) return { rise: 0, set: 0 };
    var base = Date.UTC(y, m - 1, d);
    return { rise: base + s.rise * 60000, set: base + s.set * 60000 };
  }

  function windWord(kmh) {
    if (kmh < 12) return 'very little wind';
    if (kmh < 22) return 'a light breeze';
    if (kmh < 32) return 'a moderate breeze';
    return 'a fresh wind';
  }

  // Each rule: ok(hour) decides if an hour is usable. min = shortest window worth showing,
  // good = length that earns "Good". These are the visible rules shown on the page.
  var ACTIVITIES = [
    {
      id: 'washing', name: 'Washing out', icon: '👕', min: 3, good: 5,
      rule: 'Dry, wind under 36 km/h, in daylight, at least 3 hours.',
      ok: function (h) { return h.rain <= 0.1 && h.wind * 3.6 < 36; },
      reason: function (s, q) {
        return q === 'good'
          ? 'Dry for ' + s.hours + ' hours with ' + windWord(s.windKmh) + ', good drying weather.'
          : 'Dry for ' + s.hours + ' hours, just about enough to get a load dry.';
      },
      tags: { good: 'A grand drying day', okay: 'A bit of a gamble', none: 'Not a drying day' }
    },
    {
      id: 'mow', name: 'Mow the lawn', icon: '🌱', min: 3, good: 4, needDryBefore: 2,
      rule: 'Dry, and dry for the 2 hours before, wind under 30 km/h, in daylight, at least 3 hours.',
      ok: function (h) { return h.rain <= 0.1 && h.wind * 3.6 < 30; },
      reason: function (s) {
        return 'Dry for ' + s.hours + ' hours, after a dry spell so the grass has had time to dry out.';
      },
      tags: { good: 'Mower weather', okay: 'Damp grass risk', none: 'Leave the mower' }
    },
    {
      id: 'cycle', name: 'Cycle', icon: '🚲', min: 2, good: 3,
      rule: 'Little or no rain, wind under 30 km/h, 3 degrees or warmer, in daylight, at least 2 hours.',
      ok: function (h) { return h.rain <= 0.2 && h.wind * 3.6 < 30 && h.temp >= 3; },
      reason: function (s) {
        return 'Mostly dry with ' + windWord(s.windKmh) + ' (about ' + Math.round(s.windKmh) + ' km/h) and ' +
          Math.round(s.temp) + '°C.';
      },
      tags: { good: 'Bikes out', okay: 'Bring a coat', none: 'Bring a coat, or stay in' }
    },
    {
      id: 'paint', name: 'Paint the fence', icon: '🎨', min: 4, good: 6,
      rule: 'Dry, 8 to 25 degrees, humidity under 85%, wind under 30 km/h, in daylight, at least 4 hours.',
      ok: function (h) {
        return h.rain <= 0.1 && h.temp >= 8 && h.temp <= 25 && (h.hum == null || h.hum < 85) && h.wind * 3.6 < 30;
      },
      reason: function (s) {
        return 'Dry for ' + s.hours + ' hours at about ' + Math.round(s.temp) + '°C, so the paint can cure.';
      },
      tags: { good: 'Paint while it lasts', okay: 'Tight for painting', none: 'Too damp to paint' }
    },
    {
      id: 'walk', name: 'Walk the dog', icon: '🐕', min: 2, good: 3,
      rule: 'Little or no rain, wind under 40 km/h, in daylight, at least 2 hours.',
      ok: function (h) { return h.rain <= 0.2 && h.wind * 3.6 < 40; },
      reason: function (s) {
        return 'Mostly dry with ' + windWord(s.windKmh) + ', and light until ' + irishClock(s.sunset) + '.';
      },
      tags: { good: 'A fine walking spell', okay: 'A quick one', none: 'The dog will cope' }
    }
  ];

  function byId(id) {
    for (var i = 0; i < ACTIVITIES.length; i++) if (ACTIVITIES[i].id === id) return ACTIVITIES[i];
    return null;
  }

  // Turns the saved arrays into one object per hour. Returns [] for unusable input.
  function hourly(series) {
    if (!series || !series.start || !Array.isArray(series.rain)) return [];
    var t0 = Date.parse(series.start);
    if (isNaN(t0)) return [];
    var out = [];
    for (var i = 0; i < series.rain.length; i++) {
      out.push({
        t: t0 + i * HOUR, rain: +series.rain[i] || 0,
        temp: series.temp ? +series.temp[i] : 10,
        wind: series.wind ? +series.wind[i] : 0,
        hum: series.hum && series.hum[i] != null ? +series.hum[i] : null
      });
    }
    return out;
  }

  function mean(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; }

  // Returns { windows: [...ranked best first], best, wait, tagKey } for one activity.
  function findWindows(series, activityId, opts) {
    opts = opts || {};
    var act = byId(activityId);
    var now = opts.now != null ? opts.now : Date.now();
    var lat = opts.lat, lon = opts.lon;
    var hrs = hourly(series);
    var firstUsable = Math.floor(now / HOUR) * HOUR;
    var dl = {};
    function light(dateStr) { return dl[dateStr] || (dl[dateStr] = daylight(dateStr, lat, lon)); }

    var marks = hrs.map(function (h, i) {
      var parts = irishParts(h.t);
      var d = light(parts.date);
      var mid = h.t + HOUR / 2;
      var ok = h.t >= firstUsable && mid >= d.rise && mid <= d.set && act.ok(h);
      if (ok && act.needDryBefore) {
        for (var k = 1; k <= act.needDryBefore; k++) {
          var p = hrs[i - k];
          if (!p || p.rain > 0.1) { ok = false; break; }
        }
      }
      return { ok: ok, date: parts.date };
    });

    var windows = [];
    var i = 0;
    while (i < hrs.length) {
      if (!marks[i].ok) { i++; continue; }
      var j = i;
      while (j + 1 < hrs.length && marks[j + 1].ok && marks[j + 1].date === marks[i].date &&
        hrs[j + 1].t - hrs[j].t === HOUR) j++;
      var len = j - i + 1;
      if (len >= act.min) {
        var run = hrs.slice(i, j + 1);
        var q = len >= act.good ? 'good' : 'okay';
        var sp = irishParts(run[0].t);
        var stats = {
          hours: len, windKmh: mean(run.map(function (h) { return h.wind * 3.6; })),
          temp: mean(run.map(function (h) { return h.temp; })), sunset: light(sp.date).set
        };
        windows.push({
          date: sp.date, dow: sp.dow, label: sp.label, startMs: run[0].t, endMs: run[run.length - 1].t + HOUR,
          start: irishClock(run[0].t), end: irishClock(run[run.length - 1].t + HOUR), hours: len,
          score: q, reason: act.reason(stats, q)
        });
      }
      i = j + 1;
    }

    windows.sort(function (a, b) {
      // Longer windows rank first; 'good' simply means long enough, so this also puts Good above Okay.
      if (a.hours !== b.hours) return b.hours - a.hours;
      return a.startMs - b.startMs;
    });
    windows = windows.slice(0, 3);
    var best = windows[0] || null;
    var tagKey = best ? best.score : 'none';
    var wait = null;
    if (!best) {
      wait = 'No good window in the next few days. Check again tomorrow, or do it indoors.';
    } else {
      var earliest = windows.reduce(function (m, w) { return Math.min(m, w.startMs); }, Infinity);
      if (earliest - now > 36 * HOUR) {
        wait = 'Nothing good before ' + irishParts(earliest).dow + '. Worth waiting, or do the prep indoors now.';
      }
    }
    return { windows: windows, best: best, wait: wait, tag: act.tags[tagKey], tagKey: tagKey };
  }

  return {
    ACTIVITIES: ACTIVITIES, byId: byId, hourly: hourly, findWindows: findWindows,
    irishParts: irishParts, irishClock: irishClock, daylight: daylight, HOUR: HOUR
  };
});
