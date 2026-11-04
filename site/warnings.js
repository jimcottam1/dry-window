// Met Eireann warnings: fetch them (live first, saved copy as the fallback), pick the ones for a
// county, drop expired ones, and turn the description into plain text blocks. The wording of a
// warning is never changed (licence condition).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DWWarnings = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // Region codes in the feed. EI02, EI06, EI10, EI14, EI20, EI22, EI24 and EI25 were confirmed against
  // a live fog warning on 2 Nov 2026 (headline listed Connacht, Cavan, Donegal, Monaghan). The rest
  // follow the same numbering (FIPS 10-4) and are guesses until other warnings appear.
  var CODES = {
    EI01: 'Carlow', EI02: 'Cavan', EI03: 'Clare', EI04: 'Cork', EI06: 'Donegal', EI07: 'Dublin',
    EI10: 'Galway', EI11: 'Kerry', EI12: 'Kildare', EI13: 'Kilkenny', EI14: 'Leitrim', EI15: 'Laois',
    EI16: 'Limerick', EI18: 'Longford', EI19: 'Louth', EI20: 'Mayo', EI21: 'Meath', EI22: 'Monaghan',
    EI23: 'Offaly', EI24: 'Roscommon', EI25: 'Sligo', EI26: 'Tipperary', EI27: 'Waterford',
    EI29: 'Westmeath', EI30: 'Wexford', EI31: 'Wicklow'
  };
  var CONFIRMED_CODES = ['EI02', 'EI06', 'EI10', 'EI14', 'EI20', 'EI22', 'EI24', 'EI25'];

  var PROVINCES = {
    Connacht: ['Galway', 'Leitrim', 'Mayo', 'Roscommon', 'Sligo'],
    Leinster: ['Carlow', 'Dublin', 'Kildare', 'Kilkenny', 'Laois', 'Longford', 'Louth', 'Meath', 'Offaly', 'Westmeath', 'Wexford', 'Wicklow'],
    Munster: ['Clare', 'Cork', 'Kerry', 'Limerick', 'Tipperary', 'Waterford'],
    Ulster: ['Cavan', 'Donegal', 'Monaghan']
  };

  // Is the code for this county one we have actually seen in a live warning?
  function isConfirmed(county) {
    return CONFIRMED_CODES.some(function (c) { return CODES[c] === county; });
  }

  function headlineNames(headline, county) {
    var h = String(headline == null ? '' : headline);
    if (new RegExp('\\b' + county + '\\b', 'i').test(h)) return true;
    for (var p in PROVINCES) {
      if (PROVINCES[p].indexOf(county) !== -1 && new RegExp('\\b' + p + '\\b', 'i').test(h)) return true;
    }
    return /\bireland\b/i.test(h.replace(/\b(northern|n)\.?\s*ireland/ig, ''));
  }

  // A warning is "here" if its headline names the county, its province or the whole country, or if
  // one of its region codes is this county's. A warning whose codes we do not know is shown rather
  // than hidden.
  function appliesTo(warning, county) {
    if (headlineNames(warning.headline, county)) return true;
    var regions = Array.isArray(warning.regions) ? warning.regions : [];
    var known = regions.filter(function (r) { return CODES[r]; });
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

  // Milliseconds until the earliest expiry among warnings that are still valid, or null.
  function nextExpiryMs(list, now) {
    var best = null;
    (Array.isArray(list) ? list : []).forEach(function (w) {
      if (!w) return;
      var e = Date.parse(w.expiry);
      if (isNaN(e) || e <= now) return;
      if (best === null || e - now < best) best = e - now;
    });
    return best;
  }

  // A stable key for a warning, used to remember which ones the person has opened.
  function keyOf(w) { return String(w.id == null ? '' : w.id) + '|' + w.headline + '|' + w.onset; }

  // A numeric entity is turned into its character only if it is a real one; anything else
  // (too big, zero, a lone surrogate) is left exactly as written.
  function fromEntity(n, raw) {
    if (!(n > 0 && n <= 0x10FFFF) || (n >= 0xD800 && n <= 0xDFFF)) return raw;
    return String.fromCodePoint(n);
  }

  // Turns HTML entities back into the characters they stand for. Nothing else about the text changes
  // (a non-breaking space stays a non-breaking space; inner spacing is left exactly as sent).
  function decode(s) {
    return s.replace(/&#(\d+);/g, function (m, n) { return fromEntity(parseInt(n, 10), m); })
      .replace(/&#x([0-9a-f]+);/gi, function (m, n) { return fromEntity(parseInt(n, 16), m); })
      .replace(/&nbsp;/g, String.fromCharCode(160)).replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }

  function clean(chunk) {
    return decode(chunk.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')).trim();
  }

  // Description HTML -> [{type:'p'|'li', text}]. Text only, so nothing from the feed is run as code.
  // Every piece of text is kept, in order: text inside a paragraph or list item, text between them,
  // and text after an unclosed tag. A <br> becomes a line break (\n).
  function blocks(html) {
    var parts = String(html == null ? '' : html).split(/(<\/?(?:p|li)(?:\s[^>]*)?>)/i);
    var out = [], current = null;
    parts.forEach(function (part) {
      var tag = /^<(\/?)(p|li)(?:\s[^>]*)?>$/i.exec(part);
      if (tag) { current = tag[1] ? null : tag[2].toLowerCase(); return; }
      var text = clean(part);
      if (text) out.push({ type: current || 'p', text: text });
    });
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
      certainty: w.certainty, type: w.type, level: w.level, regions: Array.isArray(w.regions) ? w.regions : null,
      blocks: blocks(w.description)
    };
  }

  // Live feed first; if it fails (network, timeout, or not a list), the saved snapshot, with its own
  // saved time so the page can say how old it is. A live empty list is a real answer and wins.
  // deps: { fetchLive(), fetchSnapshot(), now (ms), timeoutMs }
  function loadWarnings(deps) {
    var now = deps.now, timeoutMs = deps.timeoutMs || 8000;
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    // Both requests get the same time limit, so a request that hangs can never leave the page waiting
    // for ever. When the live request runs out of time it is told to stop.
    function withTimeout(p, onTimeout) {
      return new Promise(function (resolve, reject) {
        var t = setTimeout(function () { if (onTimeout) onTimeout(); reject(new Error('timed out')); }, timeoutMs);
        Promise.resolve(p).then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
      });
    }
    return Promise.resolve().then(function () {
      return withTimeout(deps.fetchLive(controller ? controller.signal : undefined), function () { if (controller) controller.abort(); });
    })
      .then(function (live) {
        if (!Array.isArray(live)) throw new Error('live feed is not a list');
        return { list: live, source: 'live', fetchedAt: new Date(now).toISOString(), ageHours: 0, ageMinutes: 0, liveError: null };
      })
      .catch(function (liveErr) {
        return Promise.resolve().then(function () { return withTimeout(deps.fetchSnapshot()); }).then(function (snap) {
          if (!snap || !Array.isArray(snap.warnings)) throw new Error('snapshot is not usable');
          var t = Date.parse(snap.fetchedAt);
          return {
            list: snap.warnings, source: 'snapshot', fetchedAt: snap.fetchedAt,
            ageHours: isNaN(t) ? null : Math.max(0, Math.floor((now - t) / 3600000)),
            ageMinutes: isNaN(t) ? null : Math.max(0, Math.floor((now - t) / 60000)),
            liveError: String(liveErr && liveErr.message || liveErr)
          };
        }).catch(function () {
          return { list: [], source: 'none', fetchedAt: null, ageHours: null, ageMinutes: null, liveError: String(liveErr && liveErr.message || liveErr) };
        });
      });
  }

  // Keeps the answer the page shows, so a slow or older request can never overwrite a newer one.
  //  - every refresh gets a sequence number; a result older than the one already shown is ignored
  //  - a refresh is skipped while one is in flight (unless force is set)
  //  - if the live fetch fails but we already had a live answer that is newer than the saved copy,
  //    that live answer is kept (and its age reported) instead of falling back to the old snapshot
  // deps as for loadWarnings, except now is a function returning milliseconds.
  function createStore(deps) {
    var seq = 0, applied = 0, current = null, lastLive = null, inflight = null;
    function refresh(opts) {
      if (inflight && !(opts && opts.force)) return inflight;
      var mySeq = ++seq, now = deps.now();
      var p = loadWarnings({ fetchLive: deps.fetchLive, fetchSnapshot: deps.fetchSnapshot, now: now, timeoutMs: deps.timeoutMs })
        .then(function (res) {
          if (mySeq < applied) return current;           // an older request finishing late
          if (res.source === 'live') {
            lastLive = res;
          } else if (lastLive && (res.source === 'none' ||
            (res.source === 'snapshot' && Date.parse(lastLive.fetchedAt) >= Date.parse(res.fetchedAt)))) {
            var mins = Math.max(0, Math.floor((now - Date.parse(lastLive.fetchedAt)) / 60000));
            res = {
              list: lastLive.list, source: 'last-live', fetchedAt: lastLive.fetchedAt, ageMinutes: mins,
              ageHours: Math.floor(mins / 60), liveError: res.liveError
            };
          }
          applied = mySeq; current = res;
          return res;
        })
        .then(function (r) { if (inflight === p) inflight = null; return r; });
      inflight = p;
      return p;
    }
    return { refresh: refresh, current: function () { return current; } };
  }

  return {
    CODES: CODES, forCounty: forCounty, blocks: blocks, appliesTo: appliesTo, isActive: isActive, isConfirmed: isConfirmed,
    LIVE_URL: LIVE_URL, partition: partition, view: view, keyOf: keyOf, nextExpiryMs: nextExpiryMs,
    loadWarnings: loadWarnings, createStore: createStore
  };
});
