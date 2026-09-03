(function (root) {
  "use strict";

  var ctx = null;

  function ac() {
    if (!ctx) {
      var C = root.AudioContext || root.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    return ctx;
  }

  function beep(freq, dur, type, gain) {
    var c = ac();
    if (!c) return;
    var o = c.createOscillator();
    var g = c.createGain();
    o.type = type || "sine";
    o.frequency.value = freq;
    g.gain.value = gain || 0.06;
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + dur);
  }

  root.NeuroAudio = {
    resume: function () {
      var c = ac();
      if (c && c.state === "suspended") c.resume();
    },
    ok: function (mute) {
      if (mute) return;
      beep(523, 0.09, "triangle", 0.05);
      setTimeout(function () {
        beep(784, 0.14, "triangle", 0.05);
      }, 70);
    },
    ng: function (mute) {
      if (mute) return;
      beep(196, 0.18, "sawtooth", 0.04);
    },
    tap: function (mute) {
      if (mute) return;
      beep(440, 0.05, "square", 0.03);
    },
    clear: function (mute) {
      if (mute) return;
      [523, 659, 784, 1046].forEach(function (f, i) {
        setTimeout(function () {
          beep(f, 0.16, "triangle", 0.05);
        }, i * 90);
      });
    },
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
