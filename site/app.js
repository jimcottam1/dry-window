// Dry Window page. Reads only the saved JSON files next to it (no live calls to anyone).
(function () {
  'use strict';
  var W = window.DWWindows, Wn = window.DWWarnings, F = window.DWFresh, S = window.DWShare, T = window.DWTowns;
  var TOWNS = T.TOWNS;
  var $ = function (id) { return document.getElementById(id); };
  var forecast = null, warnings = null, now = Date.now();
  var state = { town: 'limerick', activity: 'washing', result: null, notes: [] };

  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode: fine */ } }
  function recall(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function townBySlug(s) { return TOWNS.filter(function (t) { return t.slug === s; })[0]; }
  function when(ms) { var p = W.irishParts(ms); return p.label + ' ' + W.irishClock(ms); }

  // Town and activity come from the link first, then from what this device remembers.
  function readLink() {
    state.notes = [];
    var parts = (location.hash || '').replace(/^#/, '').split('/');
    var rememberedTown = recall('dw.town'), rememberedAct = recall('dw.activity');
    var fallbackTown = (rememberedTown && townBySlug(rememberedTown)) ? rememberedTown : 'limerick';
    var fallbackAct = (rememberedAct && W.byId(rememberedAct)) ? rememberedAct : 'washing';
    state.town = fallbackTown; state.activity = fallbackAct;
    if (parts[0]) {
      var rt = T.resolveTown(parts[0]);
      if (rt) {
        state.town = rt.town.slug;
        if (rt.how === 'county') state.notes.push('Showing ' + rt.town.name + ' for Co. ' + rt.town.county + '.');
      } else {
        state.notes.push('We do not have “' + decodeSafe(parts[0]) + '” in our list of towns, so here is ' + townBySlug(fallbackTown).name + ' instead. Pick yours from the list at the top.');
      }
    }
    if (parts[1]) {
      var act = W.resolveActivity(parts[1]);
      if (act) state.activity = act.id;
      else state.notes.push('We do not have an activity called “' + decodeSafe(parts[1]) + '”, so here is ' + W.byId(fallbackAct).name.toLowerCase() + ' instead.');
    }
  }
  function decodeSafe(s) { try { return decodeURIComponent(s).slice(0, 40); } catch (e) { return String(s).slice(0, 40); } }

  function init() {
    readLink();
    $('town').innerHTML = TOWNS.map(function (t) {
      return '<option value="' + t.slug + '">' + esc(t.name) + (t.name !== t.county ? ' (Co. ' + esc(t.county) + ')' : '') + '</option>';
    }).join('');
    $('town').addEventListener('change', function () { state.town = this.value; state.notes = []; save(); render(); });
    $('activities').addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      state.activity = b.getAttribute('data-id'); state.notes = []; save(); render();
    });
    $('share').addEventListener('click', share);
    window.addEventListener('hashchange', function () {
      var wanted = location.hash.replace(/^#/, '');
      if (wanted === state.town + '/' + state.activity) return; // our own update
      readLink(); render();
    });

    function load(url) {
      return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).catch(function () { return null; });
    }
    Promise.all([load('data/forecast.json'), load('data/warnings.json')]).then(function (res) {
      forecast = res[0]; warnings = res[1]; now = Date.now(); render();
    });
  }

  function save() {
    store('dw.town', state.town); store('dw.activity', state.activity);
    try { history.replaceState(null, '', '#' + state.town + '/' + state.activity); } catch (e) { /* ignore */ }
  }

  function notice(msg, cls) { $('notice').innerHTML = msg ? '<p class="note ' + (cls || '') + '">' + msg + '</p>' : ''; }

  function render() {
    var town = townBySlug(state.town);
    $('town').value = state.town;
    $('linknote').innerHTML = state.notes.map(function (n) { return '<p class="note warn">' + esc(n) + '</p>'; }).join('');
    save();
    var d = forecast && forecast.towns && forecast.towns[state.town];
    var fstate = d ? F.forecastState(d.fetchedAt, now) : 'missing';
    renderWarnings(town);
    if (fstate === 'missing' || fstate === 'dead') {
      $('app').hidden = true;
      $('status').textContent = '';
      notice(fstate === 'dead'
        ? 'The saved forecast for ' + esc(town.name) + ' is more than a day and a half old, so I am not showing windows. Check <a href="https://www.met.ie/weather-forecast">met.ie</a> for the latest.'
        : 'I could not load the forecast just now. Please try again in a few minutes, or check <a href="https://www.met.ie/weather-forecast">met.ie</a>.', 'bad');
      return;
    }
    $('app').hidden = false;
    $('status').textContent = 'Forecast for ' + town.name + ' saved ' + when(Date.parse(d.fetchedAt)) + ' (Irish time).';
    notice(fstate === 'stale' ? 'This forecast is a few hours old and the next update has not arrived. Treat the windows with care.' : '', 'warn');
    $('stamp').textContent = 'Last saved: forecast ' + when(Date.parse(d.fetchedAt)) + (warnings ? ', warnings ' + when(Date.parse(warnings.fetchedAt)) : '') + '. Irish time.';

    $('activities').innerHTML = W.ACTIVITIES.map(function (a) {
      return '<button type="button" class="chip" data-id="' + a.id + '" aria-pressed="' + (a.id === state.activity) + '">' +
        '<span aria-hidden="true">' + a.icon + '</span> ' + esc(a.name) + '</button>';
    }).join('');

    var act = W.byId(state.activity);
    var res = W.findWindows(d, act.id, { now: now, lat: town.lat, lon: town.lon });
    state.result = res;
    $('best-h').textContent = act.name + ' in ' + town.name;
    $('tag').textContent = res.tag;
    $('topline').textContent = res.best ? 'Best time: ' + res.best.label + ', ' + res.best.start + ' to ' + res.best.end : 'No good time in the next five days';
    $('windows').innerHTML = res.windows.map(function (w) {
      return '<li class="win"><div class="when">' + esc(w.label) + ', ' + w.start + ' to ' + w.end + '</div>' +
        '<span class="badge ' + w.score + '">' + (w.score === 'good' ? 'Good' : 'Okay') + '</span>' +
        '<p class="why">' + esc(w.reason) + '</p></li>';
    }).join('');
    var wait = $('wait'); wait.hidden = !res.wait; wait.textContent = res.wait || '';
    $('rainline').textContent = W.nextRain(d, now) || '';
    $('share').hidden = !res.best;
    $('sharebox-wrap').hidden = true; $('shared').textContent = '';
    $('rule').textContent = act.rule + ' Only whole daylight hours count (so a window can start a little after sunrise), and hours already past are left out.';

    renderStrip(d, town, res);
    var dl = W.daylight(W.irishParts(now).date, town.lat, town.lon);
    var prev = W.daylight(W.irishParts(now - 86400000).date, town.lat, town.lon);
    var diff = Math.round(((dl.set - dl.rise) - (prev.set - prev.rise)) / 1000);
    $('sun').textContent = 'Sunrise ' + W.irishClock(dl.rise) + ', sunset ' + W.irishClock(dl.set) + '. ' +
      Math.floor(Math.abs(diff) / 60) + 'm ' + (Math.abs(diff) % 60) + 's ' + (diff < 0 ? 'less' : 'more') + ' light than yesterday.';
  }

  // The strip draws daylight hours only, so each cell is wide enough to read on a phone.
  function renderStrip(d, town, res) {
    state.stripArgs = [d, town, res]; // so a resize can draw it again
    var hrs = W.hourly(d), byDate = {}, order = [];
    hrs.forEach(function (h) {
      var p = W.irishParts(h.t);
      if (!byDate[p.date]) { byDate[p.date] = { label: p.label, hours: {} }; order.push(p.date); }
      byDate[p.date].hours[p.hour] = h;
    });
    var firstHour = Math.floor(now / 3600000) * 3600000;
    var words = [], dates = [];
    order.forEach(function (date) {
      var s = W.daySummary(d, date, town.lat, town.lon, now, res.windows);
      if (s && dates.length < 5) { dates.push(date); words.push(s); }
    });
    $('strip-note').textContent = order.length && dates[0] !== order[0] ? 'Today is nearly over, so the strip starts tomorrow.' : '';
    var range = W.dayRange(dates, town.lat, town.lon), lo = range[0], hi = range[1], n = hi - lo;
    var cols = 'grid-template-columns:repeat(' + n + ',1fr)';
    // Room for a time label such as 08:00–17:00 (about 70 px), counted in columns.
    var labelN = W.labelCols($('strip').clientWidth || 360, window.innerWidth <= 420 ? 36 : 44, 8, n, 70);
    var best = {}, anyFrame = false;
    dates.forEach(function (date) { best[date] = W.dayBest(res.windows, date); if (best[date].length) anyFrame = true; });
    var rows = dates.map(function (date) {
      var day = byDate[date], dl = W.daylight(date, town.lat, town.lon), cells = '';
      var flags = W.dayFlags(best[date], date, lo, hi);
      for (var h = lo; h < hi; h++) {
        var x = day.hours[h], cls = 'c';
        if (!x || x.t < firstHour) { cells += '<i class="c na"></i>'; continue; }
        cls += x.rain >= 0.5 ? ' wet' : x.rain > 0.1 ? ' light' : '';
        if (x.t + 1800000 < dl.rise || x.t + 1800000 > dl.set) cls += ' night';
        var txt = (h < 10 ? '0' : '') + h + ':00, ' + (x.rain >= 0.5 ? 'rain' : x.rain > 0.1 ? 'light rain' : 'dry') + (flags[h - lo] ? ', in the best window' : '');
        cells += '<i class="' + cls + '" title="' + esc(day.label + ' ' + txt) + '"></i>';
      }
      var parts = day.label.split(' '), frames = '';
      // One continuous frame around the day's best window, with its times always written below it.
      W.frameRuns(flags).forEach(function (r) {
        var a = r[0] + 1, b = r[1] + 1, label = W.frameLabel(lo, r);
        frames += '<b class="frame" style="grid-column:' + a + '/' + b + '"></b>';
        if (W.labelAlign(r, n, labelN) === 'start') frames += '<span class="ft b" style="grid-column:' + a + '/-1">' + label + '</span>';
        else frames += '<span class="ft b e" style="grid-column:1/' + b + '">' + label + '</span>';
      });
      return '<div class="row"><span class="d">' + parts[0] + '<small>' + parts.slice(1).join(' ') + '</small></span><div class="cells' + (anyFrame ? ' hasbelow' : '') + '" style="' + cols + '">' + cells +
        (frames ? '<div class="fr" style="' + cols + '">' + frames + '</div>' : '') + '</div></div>';
    }).join('');
    var labels = '';
    for (var h = lo; h < hi; h++) labels += '<span>' + ((h - lo) % 3 === 0 ? (h < 10 ? '0' : '') + h : '') + '</span>';
    $('strip').innerHTML = rows + '<div class="row hrs"><span></span><div class="cells" style="' + cols + '">' + labels + '</div></div>';
    $('daywords').innerHTML = words.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('');
  }

  function fmtRange(w) {
    var a = Date.parse(w.onset), b = Date.parse(w.expiry);
    if (isNaN(a) || isNaN(b)) return '';
    return when(a) + ' to ' + when(b);
  }

  // Warnings are shown with the official headline and description word for word.
  function renderWarnings(town) {
    var box = $('warnings');
    if (!warnings || !Array.isArray(warnings.warnings)) {
      box.innerHTML = '<div class="warn none"><b>Weather warnings could not be loaded.</b> Please check <a href="https://www.met.ie/warnings">met.ie/warnings</a> before you go out.</div>';
      return;
    }
    var list = Wn.forCounty(warnings.warnings, town.county, now);
    var stale = F.warningsState(warnings.fetchedAt, now) === 'stale';
    var head = stale ? '<p class="note warn">Warnings were last saved ' + esc(when(Date.parse(warnings.fetchedAt))) + ' and may be out of date. Check <a href="https://www.met.ie/warnings">met.ie/warnings</a>.</p>' : '';
    if (!list.length) {
      box.innerHTML = head + '<div class="warn none">No Met Éireann weather warnings for Co. ' + esc(town.county) + ' in the last saved update.</div>';
      return;
    }
    box.innerHTML = head + list.map(function (w) {
      var body = '', inList = false;
      Wn.blocks(w.description).forEach(function (b) {
        if (b.type === 'li' && !inList) { body += '<ul>'; inList = true; }
        if (b.type !== 'li' && inList) { body += '</ul>'; inList = false; }
        body += b.type === 'li' ? '<li>' + esc(b.text) + '</li>' : '<p>' + esc(b.text) + '</p>';
      });
      if (inList) body += '</ul>';
      var lv = /^(yellow|orange|red)$/.test(w.level) ? w.level : 'yellow';
      return '<div class="warn ' + lv + '"><b>' + esc(w.headline) + '</b>' +
        '<p class="meta">' + esc(fmtRange(w)) + ' (Irish time). Source: Met Éireann.</p>' +
        '<details><summary>Read the full warning</summary><div class="wbody">' + body + '</div></details></div>';
    }).join('');
  }

  function share() {
    var r = state.result, town = townBySlug(state.town), act = W.byId(state.activity);
    if (!r || !r.best) return;
    var payload = {
      title: 'Dry Window', text: S.shareText(town.name, act.doing, r.best),
      url: location.href.split('#')[0] + '#' + state.town + '/' + state.activity
    };
    var env = {
      share: navigator.share ? function (p) { return navigator.share(p); } : null,
      writeText: navigator.clipboard && navigator.clipboard.writeText ? function (t) { return navigator.clipboard.writeText(t); } : null,
      execCopy: function (t) {
        var ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select();
        var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        document.body.removeChild(ta); return ok;
      }
    };
    S.deliver(env, payload).then(function (how) {
      var note = $('shared'), box = $('sharebox');
      note.textContent = S.MESSAGES[how];
      if (how === 'manual') {
        box.value = payload.text + ' ' + payload.url;
        $('sharebox-wrap').hidden = false; box.focus(); box.select();
      } else { $('sharebox-wrap').hidden = true; }
      if (how !== 'manual') setTimeout(function () { if (note.textContent === S.MESSAGES[how]) note.textContent = ''; }, 6000);
    });
  }

  // Draw the strip again when the screen changes shape (turning a phone, resizing a window).
  var redraw = W.debounce(function () { if (state.stripArgs) renderStrip.apply(null, state.stripArgs); }, 150);
  window.addEventListener('resize', redraw);
  window.addEventListener('orientationchange', redraw);

  init();
})();
