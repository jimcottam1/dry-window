// Sketch: renders sample data only. No live fetching yet.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var data, current = 'washing';

  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function renderWarnings() {
    var box = $('warnings');
    if (!data.warnings.length) {
      box.innerHTML = '<div class="warn none">No Met Éireann weather warnings for this area right now.</div>';
      return;
    }
    box.innerHTML = data.warnings.map(function (w) {
      return '<div class="warn ' + esc(w.level) + '"><b>' + esc(w.headline) + '</b><p>' + esc(w.description) +
        '</p><p class="meta">From ' + esc(w.onset) + ' to ' + esc(w.expiry) + '. Issued ' + esc(w.issued) +
        '. Source: Met Éireann. ' + esc(w.note || '') + '</p></div>';
    }).join('');
  }

  function renderChips() {
    $('activities').innerHTML = data.activities.map(function (a) {
      return '<button class="chip" role="tab" data-id="' + a.id + '" aria-selected="' + (a.id === current) + '">' +
        a.icon + ' ' + esc(a.name) + '</button>';
    }).join('');
  }

  function activity() { return data.activities.filter(function (a) { return a.id === current; })[0]; }

  function renderBest() {
    var a = activity();
    $('best-h').textContent = 'Best for ' + a.name.toLowerCase() + ' in ' + data.town.name;
    $('tag').textContent = a.tag;
    $('windows').innerHTML = a.windows.map(function (w) {
      return '<li class="win"><div class="when">' + esc(w.day) + ' ' + esc(w.time) + '<small>' + w.hours +
        ' dry hours</small></div><span class="badge ' + w.score + '">' + (w.score === 'good' ? 'Good' : 'Okay') +
        '</span><p class="why">' + esc(w.reason) + '</p></li>';
    }).join('');
    var wait = $('wait');
    wait.hidden = !a.wait;
    wait.textContent = a.wait || '';
  }

  function inWindow(label, h) {
    return activity().windows.some(function (w) {
      if (w.day !== label) return false;
      var m = w.time.match(/(\d+):\d+ to (\d+):\d+/);
      return h >= +m[1] && h < +m[2];
    });
  }

  function renderStrip() {
    var rows = data.days.map(function (d) {
      var cells = d.hours.map(function (x) {
        var cls = x.rain >= 0.5 ? 'wet' : x.rain > 0.05 ? 'light' : '';
        var t = (x.h < 10 ? '0' : '') + x.h + ':00, ' + (cls === 'wet' ? 'rain' : cls ? 'light rain' : 'dry');
        return '<i class="c ' + cls + (inWindow(d.label, x.h) ? ' win' : '') + '" title="' + d.label + ' ' + t + '"></i>';
      }).join('');
      return '<div class="row"><span class="d">' + d.label + '</span><div class="cells">' + cells + '</div></div>';
    }).join('');
    $('strip').innerHTML = rows +
      '<div class="hrs"><span></span><span><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></span></div>';
  }

  function renderAll() { renderBest(); renderStrip(); }

  function init(d) {
    data = d;
    $('town').innerHTML = '<option>' + esc(d.town.name) + '</option>';
    $('draft').hidden = !d.sample;
    $('sun').textContent = 'Sunrise ' + d.sun.rise + ', sunset ' + d.sun.set + '. ' + d.sun.change + '.';
    $('stamp').textContent = 'Forecast saved ' + d.fetchedAt.replace('T', ' ').slice(0, 16) + ' UTC. ' + d.forecastSource + '.';
    renderWarnings(); renderChips(); renderAll();
    $('activities').addEventListener('click', function (e) {
      var b = e.target.closest('.chip');
      if (!b) return;
      current = b.getAttribute('data-id');
      renderChips(); renderAll();
    });
  }

  fetch('data/sample.json').then(function (r) { return r.json(); }).then(init).catch(function () {
    $('main').insertAdjacentHTML('afterbegin', '<p class="warn">Could not load the forecast file. Please try again later.</p>');
  });
})();
