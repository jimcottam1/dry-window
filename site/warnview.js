// Builds the HTML for the warnings box. Pure (no DOM), so Node tests can run it. Everything that
// comes from the feed goes through esc(), so nothing in a warning can add markup or script.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./warnings.js'), require('./windows.js'));
  else root.DWWarnView = factory(root.DWWarnings, root.DWWindows);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Wn, W) {
  var MET_WARNINGS = 'https://www.met.ie/warnings';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function when(ms) { var p = W.irishParts(ms); return p.label + ' ' + W.irishClock(ms); }

  function fmtRange(v) {
    var a = Date.parse(v.onset), b = Date.parse(v.expiry);
    if (isNaN(a) || isNaN(b)) return '';
    return when(a) + ' to ' + when(b);
  }

  // One warning. The headline and times are always visible; the full text and the original fields
  // (as sent) are one tap away.
  function card(w, open) {
    var v = Wn.view(w), body = '', inList = false;
    v.blocks.forEach(function (b) {
      if (b.type === 'li' && !inList) { body += '<ul>'; inList = true; }
      if (b.type !== 'li' && inList) { body += '</ul>'; inList = false; }
      body += b.type === 'li' ? '<li>' + esc(b.text) + '</li>' : '<p>' + esc(b.text) + '</p>';
    });
    if (inList) body += '</ul>';
    var raw = [['Event', v.type], ['Severity', v.severity], ['Certainty', v.certainty], ['Issued', v.issued],
      ['Onset', v.onset], ['Expires', v.expiry], ['Regions', v.regions ? v.regions.join(', ') : null]]
      .filter(function (r) { return r[1] != null && r[1] !== ''; })
      .map(function (r) { return '<span>' + r[0] + ': ' + esc(r[1]) + '</span>'; }).join(' ');
    var level = v.level === 'orange' ? 'orange' : v.level === 'red' ? 'red' : 'yellow';
    var key = Wn.keyOf(w);
    return '<div class="warn ' + level + '"><b>' + esc(v.headline) + '</b>' +
      '<p class="meta">' + esc(fmtRange(v)) + ' (Irish time). Source: Met Éireann.</p>' +
      '<details data-key="' + esc(key) + '"' + (open[key] ? ' open' : '') + '><summary>Read the full warning</summary><div class="wbody">' + body +
      '<p class="raw">As sent by Met Éireann. ' + raw + '</p></div></details></div>';
  }

  // state: { warnings (result of the store, or null while the first check runs), county, now, openKeys }
  function renderBox(state) {
    var w = state.warnings, county = state.county, now = state.now;
    var open = {};
    (state.openKeys || []).forEach(function (k) { open[k] = true; });
    if (!w) return '<div class="warn none" role="status">Checking for Met Éireann weather warnings...</div>';
    if (w.source === 'none') {
      return '<div class="warn none"><b>Weather warnings could not be loaded.</b> Please check <a href="' + MET_WARNINGS + '">met.ie/warnings</a> before you go out.</div>';
    }
    var p = Wn.partition(w.list, county, now), head = '', tail = '';
    var link = '<a href="' + MET_WARNINGS + '">met.ie/warnings</a>';
    if (w.source === 'snapshot') {
      var age = w.ageHours == null ? '' : w.ageHours < 1 ? ' (less than an hour old)' : ' (' + w.ageHours + (w.ageHours === 1 ? ' hour' : ' hours') + ' old)';
      head = '<p class="note warn">Could not reach Met Éireann live just now, so these warnings come from a saved copy from ' +
        esc(when(Date.parse(w.fetchedAt))) + age + '. They may be out of date: please check ' + link + '.</p>';
    } else if (w.source === 'last-live') {
      head = '<p class="note warn">Could not reach Met Éireann just now, so these warnings are from the last live check at ' +
        esc(W.irishClock(Date.parse(w.fetchedAt))) + ' (' + w.ageMinutes + (w.ageMinutes === 1 ? ' minute' : ' minutes') +
        ' old). They may be out of date: please check ' + link + '.</p>';
    } else {
      tail = '<p class="wsource">Warnings from Met Éireann, checked live at ' + esc(W.irishClock(Date.parse(w.fetchedAt))) + ' (Irish time).</p>';
    }
    var sure = Wn.isConfirmed(county);
    var here = p.here.length
      ? p.here.map(function (x) { return card(x, open); }).join('')
      : (sure
        ? '<div class="warn none">No current Met Éireann weather warnings for Co. ' + esc(county) + '.</div>'
        : '<div class="warn none">No warnings found for Co. ' + esc(county) + '. We\'re still confirming how Met Éireann labels this county, so please also check ' + link + '.</div>');
    var elsewhere = p.elsewhere.length
      ? '<details class="else" data-key="else"' + (open['else'] ? ' open' : '') + '><summary>Warnings for other parts of Ireland (' + p.elsewhere.length + ')' +
        (sure ? '' : ' – check these too, as we may not match every county') + '</summary>' +
        p.elsewhere.map(function (x) { return card(x, open); }).join('') + '</details>'
      : '';
    return head + here + elsewhere + tail;
  }

  return { renderBox: renderBox, esc: esc };
});
