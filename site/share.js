// Share: builds the message and tries share sheet, then clipboard, then old-style copy. If all
// of those are blocked it says so, so the page can show the text for the person to copy by hand.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DWShare = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function shareText(townName, activityName, w) {
    return townName + ': ' + w.label + ', ' + w.start + ' to ' + w.end + ' is a ' + w.score.toLowerCase() +
      ' window for ' + activityName.toLowerCase() + '. ' + w.reason;
  }

  // env = { share(payload) -> Promise, writeText(text) -> Promise, execCopy(text) -> boolean }, each optional.
  // Returns 'shared' | 'copied' | 'cancelled' | 'manual'.
  function deliver(env, payload) {
    var full = payload.text + ' ' + payload.url;
    function viaExec() {
      try { if (env.execCopy && env.execCopy(full)) return 'copied'; } catch (e) { /* fall through */ }
      return 'manual';
    }
    function viaClipboard() {
      if (!env.writeText) return Promise.resolve(viaExec());
      return Promise.resolve().then(function () { return env.writeText(full); })
        .then(function () { return 'copied'; }, function () { return viaExec(); });
    }
    if (env.share) {
      return Promise.resolve().then(function () { return env.share(payload); })
        .then(function () { return 'shared'; }, function (e) {
          if (e && e.name === 'AbortError') return 'cancelled';
          return viaClipboard();
        });
    }
    return viaClipboard();
  }

  var MESSAGES = {
    shared: 'Shared.',
    copied: 'Copied. Paste it into your message.',
    manual: 'Copying is blocked here. Press and hold the text below to copy it.',
    cancelled: ''
  };

  return { shareText: shareText, deliver: deliver, MESSAGES: MESSAGES };
});
