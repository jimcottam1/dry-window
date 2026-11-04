// Met Eireann warnings: pick the ones for a county, drop expired ones, and turn the description
// into plain text blocks. The wording itself is never changed (licence condition).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DWWarnings = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // Region codes in the feed. EI02, EI06, EI10, EI14, EI20, EI22, EI24, EI25 were confirmed against
  // a live fog warning on 2 Nov 2026 (headline listed Connacht, Cavan, Donegal, Monaghan). The rest
  // follow the same numbering (FIPS 10-4) and are unconfirmed until other warnings appear.
  var CODES = {
    EI01: 'Carlow', EI02: 'Cavan', EI03: 'Clare', EI04: 'Cork', EI06: 'Donegal', EI07: 'Dublin',
    EI10: 'Galway', EI11: 'Kerry', EI12: 'Kildare', EI13: 'Kilkenny', EI14: 'Leitrim', EI15: 'Laois',
    EI16: 'Limerick', EI18: 'Longford', EI19: 'Louth', EI20: 'Mayo', EI21: 'Meath', EI22: 'Monaghan',
    EI23: 'Offaly', EI24: 'Roscommon', EI25: 'Sligo', EI26: 'Tipperary', EI27: 'Waterford',
    EI29: 'Westmeath', EI30: 'Wexford', EI31: 'Wicklow'
  };

  function appliesTo(warning, county) {
    var regions = Array.isArray(warning.regions) ? warning.regions : [];
    var known = regions.filter(function (r) { return CODES[r]; });
    // If none of the codes are ones we know, show the warning rather than hide it.
    if (!known.length) return true;
    return known.some(function (r) { return CODES[r] === county; });
  }

  function isActive(warning, now) {
    var expiry = Date.parse(warning.expiry);
    if (isNaN(expiry)) return true;
    return expiry > now;
  }

  // Returns the warnings for this county that have not expired. Objects are passed through untouched.
  function forCounty(list, county, now) {
    if (!Array.isArray(list)) return [];
    return list.filter(function (w) { return w && isActive(w, now) && appliesTo(w, county); });
  }

  // Turns HTML entities back into the characters they stand for. Nothing else about the text changes
  // (a non-breaking space stays a non-breaking space; inner spacing is left exactly as sent).
  function decode(s) {
    return s.replace(/&#(\d+);/g, function (m, n) { return String.fromCodePoint(+n); })
      .replace(/&#x([0-9a-f]+);/gi, function (m, n) { return String.fromCodePoint(parseInt(n, 16)); })
      .replace(/&nbsp;/g, String.fromCharCode(160)).replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }

  // Description HTML -> [{type:'p'|'li', text}]. Text only, so nothing from the feed is run as code.
  function blocks(html) {
    var out = [];
    var re = /<(p|li)[^>]*>([\s\S]*?)<\/\1>/gi, m, any = false;
    while ((m = re.exec(html || ''))) {
      any = true;
      var text = decode(m[2].replace(/<[^>]*>/g, '')).trim();
      if (text) out.push({ type: m[1].toLowerCase(), text: text });
    }
    if (!any) {
      var plain = decode(String(html || '').replace(/<[^>]*>/g, '')).trim();
      if (plain) out.push({ type: 'p', text: plain });
    }
    return out;
  }

  var LIVE_URL = 'https://www.met.ie/Open_Data/json/warning_IRELAND.json';

  // Every valid warning is kept (the licence says to publish the latest valid warnings): those for
  // this county first, the rest as "elsewhere". Expired ones are dropped from both. Objects untouched.
  function partition(list, county, now) {
    var here = [], elsewhere = [];
    (Array.isArray(list) ? list : []).forEach(function (w) {
      if (!w || !isActive(w, now)) return;
      (appliesTo(w, county) ? here : elsewhere).push(w);
    });
    return { here: here, elsewhere: elsewhere };
  }

  // The fields shown on the page, exactly as sent.
  function view(w) {
    return {
      headline: w.headline, onset: w.onset, expiry: w.expiry, issued: w.issued, severity: w.severity,
      certainty: w.certainty, type: w.type, level: w.level, blocks: blocks(w.description)
    };
  }

  // Live feed first; if it fails (network, timeout, or not a list), the saved snapshot, with its own
  // saved time so the page can say how old it is. A live empty list is a real answer and wins.
  // deps: { fetchLive(), fetchSnapshot(), now (ms), timeoutMs }
  function loadWarnings(deps) {
    var now = deps.now, timeoutMs = deps.timeoutMs || 8000;
    function withTimeout(p) {
      return new Promise(function (resolve, reject) {
        var t = setTimeout(function () { reject(new Error('timed out')); }, timeoutMs);
        Promise.resolve(p).then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
      });
    }
    return Promise.resolve().then(function () { return withTimeout(deps.fetchLive()); })
      .then(function (live) {
        if (!Array.isArray(live)) throw new Error('live feed is not a list');
        return { list: live, source: 'live', fetchedAt: new Date(now).toISOString(), ageHours: 0, liveError: null };
      })
      .catch(function (liveErr) {
        return Promise.resolve().then(function () { return deps.fetchSnapshot(); }).then(function (snap) {
          if (!snap || !Array.isArray(snap.warnings)) throw new Error('snapshot is not usable');
          var t = Date.parse(snap.fetchedAt);
          return {
            list: snap.warnings, source: 'snapshot', fetchedAt: snap.fetchedAt,
            ageHours: isNaN(t) ? null : Math.max(0, Math.floor((now - t) / 3600000)),
            liveError: String(liveErr && liveErr.message || liveErr)
          };
        }).catch(function () {
          return { list: [], source: 'none', fetchedAt: null, ageHours: null, liveError: String(liveErr && liveErr.message || liveErr) };
        });
      });
  }

  return {
    CODES: CODES, forCounty: forCounty, blocks: blocks, appliesTo: appliesTo, isActive: isActive,
    LIVE_URL: LIVE_URL, partition: partition, view: view, loadWarnings: loadWarnings
  };
});
