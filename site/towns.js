// Fixed list of towns (one per county, plus a few big ones). Used by the fetcher and the page.
// Coordinates are approximate town centres, my own list.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DWTowns = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var TOWNS = [
    ['carlow', 'Carlow', 'Carlow', 52.84, -6.93],
    ['carrick-on-shannon', 'Carrick-on-Shannon', 'Leitrim', 53.95, -8.09],
    ['castlebar', 'Castlebar', 'Mayo', 53.85, -9.30],
    ['cavan', 'Cavan', 'Cavan', 53.99, -7.36],
    ['clonmel', 'Clonmel', 'Tipperary', 52.36, -7.70],
    ['cork', 'Cork', 'Cork', 51.90, -8.47],
    ['drogheda', 'Drogheda', 'Louth', 53.72, -6.35],
    ['dublin', 'Dublin', 'Dublin', 53.35, -6.26],
    ['dundalk', 'Dundalk', 'Louth', 54.00, -6.40],
    ['ennis', 'Ennis', 'Clare', 52.84, -8.98],
    ['galway', 'Galway', 'Galway', 53.27, -9.05],
    ['kilkenny', 'Kilkenny', 'Kilkenny', 52.65, -7.25],
    ['killarney', 'Killarney', 'Kerry', 52.06, -9.51],
    ['letterkenny', 'Letterkenny', 'Donegal', 54.95, -7.73],
    ['limerick', 'Limerick', 'Limerick', 52.66, -8.63],
    ['longford', 'Longford', 'Longford', 53.73, -7.80],
    ['monaghan', 'Monaghan', 'Monaghan', 54.25, -6.97],
    ['mullingar', 'Mullingar', 'Westmeath', 53.52, -7.34],
    ['naas', 'Naas', 'Kildare', 53.22, -6.66],
    ['navan', 'Navan', 'Meath', 53.65, -6.68],
    ['nenagh', 'Nenagh', 'Tipperary', 52.86, -8.20],
    ['portlaoise', 'Portlaoise', 'Laois', 53.03, -7.30],
    ['roscommon', 'Roscommon', 'Roscommon', 53.63, -8.19],
    ['sligo', 'Sligo', 'Sligo', 54.27, -8.47],
    ['tralee', 'Tralee', 'Kerry', 52.27, -9.70],
    ['tullamore', 'Tullamore', 'Offaly', 53.27, -7.49],
    ['waterford', 'Waterford', 'Waterford', 52.26, -7.11],
    ['wexford', 'Wexford', 'Wexford', 52.34, -6.46],
    ['wicklow', 'Wicklow', 'Wicklow', 52.98, -6.04],
    ['athlone', 'Athlone', 'Westmeath', 53.42, -7.94]
  ].map(function (t) { return { slug: t[0], name: t[1], county: t[2], lat: t[3], lon: t[4] }; });
  function norm(s) {
    var t = String(s == null ? '' : s);
    try { t = decodeURIComponent(t); } catch (e) { /* keep as is */ }
    return t.toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/^co\.?\s+/, '').replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
  }

  // Finds a town from whatever was typed in a link: its slug or name, or a county (which gets the
  // county's first listed town). Returns { town, how: 'exact' | 'county' } or null when unknown.
  function resolveTown(input) {
    var key = norm(input);
    if (!key) return null;
    for (var i = 0; i < TOWNS.length; i++) if (TOWNS[i].slug === key || norm(TOWNS[i].name) === key) return { town: TOWNS[i], how: 'exact' };
    for (var j = 0; j < TOWNS.length; j++) if (norm(TOWNS[j].county) === key) return { town: TOWNS[j], how: 'county' };
    return null;
  }

  return { TOWNS: TOWNS, resolveTown: resolveTown };
});
