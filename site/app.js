// Dry Window page. Reads only the saved JSON files next to it (no live calls to anyone).
(function () {
  'use strict';
  var W = window.DWWindows, Wn = window.DWWarnings, F = window.DWFresh, TOWNS = window.DWTowns.TOWNS;
  var $ = function (id) { return document.getElementById(id); };
  var forecast = null, warnings = null, now = Date.now();
  var state = { town: 'limerick', activity: 'washing', result: null };

  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode: fine */ } }
  function recall(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function townBySlug(s) { return TOWNS.filter(function (t) { return t.slug === s; })[0]; }
  function when(ms) { var p = W.irishParts(ms); return p.label + ' ' + W.irishClock(ms); }

  function init() {
    var m = (location.hash || '').replace('#', '').split('/');
    if (m[0] && townBySlug(m[0])) state.town = m[0]; else { var t = recall('dw.town'); if (t && townBySlug(t)) state.town = t; }
    if (m[1] && W.byId(m[1])) state.activity = m[1]; else { var a = recall('dw.activity'); if (a && W.byId(a)) state.activity = a; }

    $('town').innerHTML = TOWNS.map(function (t) {
      return '<option value="' + t.slug + '">' + esc(t.name) + (t.name !== t.county ? ' (Co. ' + esc(t.county) + ')' : '') + '</option>';
    }).join('');
    $('town').value = state.town;
    $('town').addEventListener('change', function () { state.town = this.value; save(); render(); });
    $('activities').addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      state.activity = b.getAttribute('data-id'); save(); render();
    });
    $('share').addEventListener('click', share);

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
    $('share').hidden = !res.best;
    $('rule').textContent = act.rule + ' Hours before sunrise, after sunset or already past are not counted.';

    renderStrip(d, town, res);
    var dl = W.daylight(W.irishParts(now).date, town.lat, town.lon);
    var prev = W.daylight(W.irishParts(now - 86400000).date, town.lat, town.lon);
    var diff = Math.round(((dl.set - dl.rise) - (prev.set - prev.rise)) / 1000);
    $('sun').textContent = 'Sunrise ' + W.irishClock(dl.rise) + ', sunset ' + W.irishClock(dl.set) + '. ' +
      Math.floor(Math.abs(diff) / 60) + 'm ' + (Math.abs(diff) % 60) + 's ' + (diff < 0 ? 'less' : 'more') + ' light than yesterday.';
  }

  function renderStrip(d, town, res) {
    var hrs = W.hourly(d), byDate = {}, order = [];
    hrs.forEach(function (h) {
      var p = W.irishParts(h.t);
      if (!byDate[p.date]) { byDate[p.date] = { label: p.label, hours: {} }; order.push(p.date); }
      byDate[p.date].hours[p.hour] = h;
    });
    var winCells = {};
    res.windows.forEach(function (w) { for (var t = w.startMs; t < w.endMs; t += 3600000) winCells[t] = true; });
    var firstHour = Math.floor(now / 3600000) * 3600000;
    var rows = order.slice(0, 5).map(function (date) {
      var day = byDate[date], dl = W.daylight(date, town.lat, town.lon), cells = '';
      for (var h = 0; h < 24; h++) {
        var x = day.hours[h], cls = 'c';
        if (!x || x.t < firstHour) { cells += '<i class="c na"></i>'; continue; }
        cls += x.rain >= 0.5 ? ' wet' : x.rain > 0.1 ? ' light' : '';
        if (x.t + 1800000 < dl.rise || x.t + 1800000 > dl.set) cls += ' night';
        if (winCells[x.t]) cls += ' inwin';
        var txt = (h < 10 ? '0' : '') + h + ':00, ' + (x.rain >= 0.5 ? 'rain' : x.rain > 0.1 ? 'light rain' : 'dry') + (winCells[x.t] ? ', in your window' : '');
        cells += '<i class="' + cls + '" title="' + esc(day.label + ' ' + txt) + '"></i>';
      }
      var parts = day.label.split(' ');
      return '<div class="row"><span class="d">' + parts[0] + '<small>' + parts.slice(1).join(' ') + '</small></span><div class="cells">' + cells + '</div></div>';
    }).join('');
    $('strip').innerHTML = rows + '<div class="hrs"><span></span><span><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></span></div>';
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
    var text = town.name + ': ' + r.best.label + ', ' + r.best.start + ' to ' + r.best.end + ' is a ' + r.best.score.toLowerCase() +
      ' window for ' + act.name.toLowerCase() + '. ' + r.best.reason;
    var url = location.href.split('#')[0] + '#' + state.town + '/' + state.activity;
    var note = $('shared');
    function done(msg) { note.textContent = msg; setTimeout(function () { note.textContent = ''; }, 4000); }
    if (navigator.share) {
      navigator.share({ title: 'Dry Window', text: text, url: url }).catch(function () { /* cancelled */ });
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text + ' ' + url).then(function () { done('Copied, ready to paste.'); }, function () { done('Could not copy.'); });
    } else { done('Sharing is not available in this browser.'); }
  }

  init();
})();
