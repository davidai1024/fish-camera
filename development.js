/* Local development-animation controller. No network and no image processing. */
(function (root) {
  'use strict';
  function create(options) {
    options = options || {};
    var duration = options.durationMs || 10000;
    var now = options.now || function () { return Date.now(); };
    var emit = options.onChange || function () {};
    var state = 'idle', progress = 0, previous = 0, lastShake = 0, boost = 0;
    function snapshot() { return { state: state, progress: progress }; }
    function publish() { var result = snapshot(); emit(result); return result; }
    function settle() {
      if (progress >= 1) { progress = 1; state = 'ready'; }
    }
    function advance() {
      if (state !== 'developing') return snapshot();
      var current = now(), elapsed = Math.max(0, current - previous);
      previous = current;
      var decay = Math.exp(-elapsed / 700), extra = boost * 700 * (1 - decay);
      boost *= decay;
      progress = Math.min(1, progress + (elapsed + extra) / duration);
      settle();
      return publish();
    }
    function accelerate() {
      advance();
      if (state !== 'developing') return snapshot();
      var current = now();
      if (current - lastShake < 260) return snapshot();
      lastShake = current;
      boost = Math.min(1.8, boost + 0.9);
      return snapshot();
    }
    return {
      start: function () {
        if (state === 'developing') return snapshot();
        state = 'developing'; progress = 0; boost = 0; previous = now(); lastShake = previous - 260;
        return publish();
      },
      tick: advance,
      gyro: function (frame) {
        if (!frame || !Number.isFinite(frame.x) || !Number.isFinite(frame.y) || !Number.isFinite(frame.z)) return snapshot();
        var speed = Math.sqrt(frame.x * frame.x + frame.y * frame.y + frame.z * frame.z);
        return speed >= .65 ? accelerate() : advance();
      },
      swipe: function (distance, speed) {
        if (!Number.isFinite(distance)) return snapshot();
        advance();
        if (state !== 'developing' || Math.abs(distance) < .5) return snapshot();
        var velocity = Number.isFinite(speed) ? Math.max(0, Math.min(1, speed / 1.5)) : .35;
        progress = Math.min(1, progress + Math.min(120, Math.abs(distance)) * (.7 + velocity * .6) / 3400);
        settle();
        return publish();
      },
      cancel: function () { state = 'idle'; progress = 0; boost = 0; return publish(); },
      get: snapshot
    };
  }
  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FilmDevelopment = api;
}(typeof window !== 'undefined' ? window : this));
