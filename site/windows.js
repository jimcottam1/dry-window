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
      id: 'washing', name: 'Washing out', doing: 'washing out', icon: '👕', min: 3, good: 5,
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
      id: 'mow', name: 'Mow the lawn', doing: 'mowing the lawn', icon: '🌱', min: 3, good: 4, needDryBefore: 2,
      rule: 'Dry, and dry for the 2 hours before, wind under 30 km/h, in daylight, at least 3 hours.',
      ok: function (h) { return h.rain <= 0.1 && h.wind * 3.6 < 30; },
      reason: function (s) {
        return 'Dry for ' + s.hours + ' hours, after a dry spell so the grass has had time to dry out.';
      },
      tags: { good: 'Mower weather', okay: 'Damp grass risk', none: 'Leave the mower' }
    },
    {
      id: 'cycle', name: 'Cycle', doing: 'cycling', icon: '🚲', min: 2, good: 3,
      rule: 'Little or no rain, wind under 30 km/h, 3 degrees or warmer, in daylight, at least 2 hours.',
      ok: function (h) { return h.rain <= 0.2 && h.wind * 3.6 < 30 && h.temp >= 3; },
      reason: function (s) {
        return 'Mostly dry with ' + windWord(s.windKmh) + ' (about ' + Math.round(s.windKmh) + ' km/h) and ' +
          Math.round(s.temp) + '°C.';
      },
      tags: { good: 'Bikes out', okay: 'Bring a coat', none: 'Bring a coat, or stay in' }
    },
    {
      id: 'paint', name: 'Paint the fence', doing: 'painting the fence', icon: '🎨', min: 4, good: 6,
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
      id: 'walk', name: 'Walk the dog', doing: 'walking the dog', icon: '🐕', min: 2, good: 3,
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

  // Words people might put in a link for each activity.
  var ALIASES = {
    washing: ['wash', 'washing', 'washing-out', 'laundry', 'clothes'],
    mow: ['mow', 'mowing', 'mow-the-lawn', 'lawn', 'grass'],
    cycle: ['cycle', 'cycling', 'bike', 'biking'],
    paint: ['paint', 'painting', 'paint-the-fence', 'fence'],
    walk: ['walk', 'walking', 'walk-the-dog', 'dog']
  };
  function resolveActivity(input) {
    var key = String(input == null ? '' : input).toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
    for (var id in ALIASES) if (ALIASES[id].indexOf(key) !== -1) return byId(id);
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

  // Identical windows on following days become one ("Wed 4 to Fri 6 Nov, 08:00 to 17:00").
  function mergeDays(list) {
    var chron = list.slice().sort(function (a, b) { return a.startMs - b.startMs; });
    var out = [];
    chron.forEach(function (w) {
      var last = out[out.length - 1];
      var gap = last ? Math.round((Date.parse(w.date) - Date.parse(last.lastDate)) / 86400000) : 0;
      if (last && gap === 1 && last.start === w.start && last.end === w.end && last.score === w.score) {
        last.lastDate = w.date; last.days++; last.lastLabel = w.label;
        last.windMin = Math.min(last.windMin, w.windMin); last.windMax = Math.max(last.windMax, w.windMax);
        last.spans = last.spans.concat(w.spans);
        last.endMs = w.endMs;
      } else {
        out.push(Object.assign({}, w, { lastDate: w.date, lastLabel: w.label, spans: w.spans.slice() }));
      }
    });
    out.forEach(function (w) {
      if (w.days > 1) {
        var a = w.label.split(' '), b = w.lastLabel.split(' ');
        w.label = a[0] + ' ' + a[1] + (a[2] !== b[2] ? ' ' + a[2] : '') + ' to ' + b[0] + ' ' + b[1] + ' ' + b[2];
        w.reason += ' The same each day for ' + w.days + ' days, with wind between ' + w.windMin + ' and ' + w.windMax + ' km/h.';
      }
    });
    return out;
  }

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
        var kmh = run.map(function (h) { return h.wind * 3.6; });
        var stats = {
          hours: len, windKmh: mean(kmh),
          temp: mean(run.map(function (h) { return h.temp; })), sunset: light(sp.date).set
        };
        windows.push({
          date: sp.date, dow: sp.dow, label: sp.label, startMs: run[0].t, endMs: run[run.length - 1].t + HOUR,
          start: irishClock(run[0].t), end: irishClock(run[run.length - 1].t + HOUR), hours: len,
          score: q, reason: act.reason(stats, q), windMin: Math.round(Math.min.apply(null, kmh)),
          windMax: Math.round(Math.max.apply(null, kmh)),
          spans: [{ startMs: run[0].t, endMs: run[run.length - 1].t + HOUR }], days: 1
        });
      }
      i = j + 1;
    }

    windows = mergeDays(windows);
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

  // When does rain next arrive (0.5 mm or more in an hour)? Returns a plain sentence.
  function nextRain(series, now) {
    var hrs = hourly(series);
    if (!hrs.length) return null;
    var first = Math.floor(now / HOUR) * HOUR;
    for (var i = 0; i < hrs.length; i++) {
      if (hrs[i].t >= first && hrs[i].rain >= 0.5) {
        var p = irishParts(hrs[i].t);
        return 'Rain next arrives around ' + p.label + ', ' + pad(p.hour) + ':00.';
      }
    }
    var days = Math.max(1, Math.round((hrs[hrs.length - 1].t - first) / (24 * HOUR)));
    return 'No real rain in the forecast for the next ' + days + ' days.';
  }

  function runs(list) { // [[startHour, endHourExclusive], ...] from sorted hours
    var out = [];
    list.forEach(function (h) {
      var last = out[out.length - 1];
      if (last && last[1] === h) last[1] = h + 1; else out.push([h, h + 1]);
    });
    return out;
  }

  // ---- the window frame in the week strip ----
  // flags: one boolean per column (hour). Returns [[firstColumn, endColumnExclusive], ...].
  function frameRuns(flags) {
    var cols = [];
    (flags || []).forEach(function (f, i) { if (f) cols.push(i); });
    return runs(cols);
  }

  // Hour flags for one Irish date from the window list: true where an hour lies inside a window.
  function dayFlags(windows, dateStr, lo, hi) {
    var flags = [];
    for (var h = lo; h < hi; h++) flags.push(false);
    (windows || []).forEach(function (w) {
      (w.spans || []).forEach(function (sp) {
        var p = irishParts(sp.startMs);
        if (p.date !== dateStr) return;
        var n = Math.round((sp.endMs - sp.startMs) / HOUR);
        for (var k = 0; k < n; k++) { var i = p.hour + k - lo; if (i >= 0 && i < flags.length) flags[i] = true; }
      });
    });
    return flags;
  }

  // "08:00\u201317:00" for a run, where lo is the clock hour of column 0.
  function frameLabel(lo, run) { return pad(lo + run[0]) + ':00\u2013' + pad((lo + run[1]) % 24) + ':00'; }

  // Only the best window of each day is framed: the first-ranked window with a span on that date
  // (windows come best first). Returns a list of at most one window-like object holding that one span.
  function dayBest(windows, dateStr) {
    var list = windows || [];
    for (var i = 0; i < list.length; i++) {
      var spans = (list[i] && list[i].spans) || [];
      for (var j = 0; j < spans.length; j++) {
        if (irishParts(spans[j].startMs).date === dateStr) return [{ spans: [spans[j]] }];
      }
    }
    return [];
  }

  // The time label always sits below its frame. How many strip columns does it need?
  // stripPx: width of the strip; dayColPx and gapPx: the day label column and its gap; n: hour columns.
  function labelCols(stripPx, dayColPx, gapPx, n, labelPx) {
    var cellPx = (stripPx - dayColPx - gapPx) / n;
    if (!(cellPx > 0)) cellPx = 10;
    return Math.min(n, Math.max(1, Math.ceil(labelPx / cellPx)));
  }

  // Left-align the label under the frame start, unless it would run off the right edge: then right-align it to the frame end.
  function labelAlign(run, n, cols) { return run[0] + cols <= n ? 'start' : 'end'; }

  // Call fn once, after ms of quiet, with the latest arguments. timers can be replaced in tests.
  function debounce(fn, ms, timers) {
    var t = timers || { set: function (f, m) { return setTimeout(f, m); }, clear: function (id) { clearTimeout(id); } }, id = null;
    return function () {
      var args = arguments;
      if (id !== null) t.clear(id);
      id = t.set(function () { id = null; fn.apply(null, args); }, ms);
    };
  }

  // A day in words, for screen readers and for anyone who finds the coloured strip hard to read.
  function daySummary(series, dateStr, lat, lon, now, windows) {
    var hrs = hourly(series), d = daylight(dateStr, lat, lon), first = Math.floor(now / HOUR) * HOUR;
    var day = hrs.filter(function (h) {
      return irishParts(h.t).date === dateStr && h.t >= first && h.t + HOUR / 2 >= d.rise && h.t + HOUR / 2 <= d.set;
    });
    if (!day.length) return null;
    var wet = runs(day.filter(function (h) { return h.rain > 0.1; }).map(function (h) { return irishParts(h.t).hour; }));
    var label = irishParts(day[0].t).label;
    var rain = wet.length
      ? 'rain around ' + wet.map(function (r) { return pad(r[0]) + ':00 to ' + pad(r[1]) + ':00'; }).join(', ')
      : 'dry in daylight';
    var kmh = day.map(function (h) { return h.wind * 3.6; }), temps = day.map(function (h) { return h.temp; });
    var db = dayBest(windows, dateStr), sp0 = db.length ? db[0].spans[0] : null;
    var bw = sp0 ? ' Best window ' + irishClock(sp0.startMs) + '\u2013' + irishClock(sp0.endMs) + '.' : '';
    return label + ': ' + rain + '. Wind up to ' + Math.round(Math.max.apply(null, kmh)) + ' km/h. ' +
      Math.round(Math.min.apply(null, temps)) + ' to ' + Math.round(Math.max.apply(null, temps)) + ' degrees.' + bw;
  }

  // First and last Irish clock hour to draw in the strip: the daylight hours of the days shown.
  function dayRange(dates, lat, lon) {
    var lo = 24, hi = 0;
    dates.forEach(function (ds) {
      var d = daylight(ds, lat, lon);
      lo = Math.min(lo, irishParts(d.rise).hour);
      hi = Math.max(hi, irishParts(d.set).hour + 1);
    });
    if (lo >= hi) return [0, 24];
    return [lo, Math.min(24, hi)];
  }

  return {
    ACTIVITIES: ACTIVITIES, byId: byId, resolveActivity: resolveActivity, nextRain: nextRain,
    daySummary: daySummary, dayRange: dayRange, frameRuns: frameRuns, dayFlags: dayFlags, frameLabel: frameLabel, dayBest: dayBest, labelCols: labelCols, labelAlign: labelAlign, debounce: debounce, hourly: hourly, findWindows: findWindows,
    irishParts: irishParts, irishClock: irishClock, daylight: daylight, HOUR: HOUR
  };
});
