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

  function decode(s) {
    return s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }

  // Description HTML -> [{type:'p'|'li', text}]. Text only, so nothing from the feed is run as code.
  function blocks(html) {
    var out = [];
    var re = /<(p|li)[^>]*>([\s\S]*?)<\/\1>/gi, m, any = false;
    while ((m = re.exec(html || ''))) {
      any = true;
      var text = decode(m[2].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
      if (text) out.push({ type: m[1].toLowerCase(), text: text });
    }
    if (!any) {
      var plain = decode(String(html || '').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
      if (plain) out.push({ type: 'p', text: plain });
    }
    return out;
  }

  return { CODES: CODES, forCounty: forCounty, blocks: blocks, appliesTo: appliesTo, isActive: isActive };
});
