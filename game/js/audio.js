/**
 * 星詠みの弾幕 — Web Audio で簡易効果音を生成
 */
(function (root) {
  "use strict";

  function createAudio(getMuted) {
    var ctx = null;

    function ac() {
      if (!ctx) {
        var AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
      }
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    }

    function beep(freq, dur, type, vol, slide) {
      if (getMuted()) return;
      var c = ac();
      if (!c) return;
      var t0 = c.currentTime;
      var osc = c.createOscillator();
      var g = c.createGain();
      osc.type = type || "sine";
      osc.frequency.setValueAtTime(freq, t0);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.08, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    function noise(dur, vol) {
      if (getMuted()) return;
      var c = ac();
      if (!c) return;
      var n = Math.floor(c.sampleRate * dur);
      var buf = c.createBuffer(1, n, c.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
      var src = c.createBufferSource();
      var g = c.createGain();
      src.buffer = buf;
      g.gain.value = vol || 0.05;
      src.connect(g);
      g.connect(c.destination);
      src.start();
    }

    return {
      unlock: function () {
        ac();
      },
      shoot: function () {
        beep(880, 0.05, "triangle", 0.03, 520);
      },
      enemyHit: function () {
        beep(420, 0.04, "square", 0.03, 180);
      },
      enemyDown: function () {
        beep(320, 0.12, "sawtooth", 0.05, 90);
        noise(0.06, 0.03);
      },
      playerHit: function () {
        noise(0.18, 0.08);
        beep(180, 0.25, "sawtooth", 0.07, 60);
      },
      boss: function () {
        beep(140, 0.4, "sine", 0.08, 70);
        beep(220, 0.35, "triangle", 0.05, 110);
      },
      clear: function () {
        beep(523, 0.18, "sine", 0.07);
        setTimeout(function () {
          beep(659, 0.18, "sine", 0.07);
        }, 120);
        setTimeout(function () {
          beep(784, 0.28, "sine", 0.08);
        }, 240);
      },
      over: function () {
        beep(196, 0.35, "triangle", 0.07, 80);
      },
      ui: function () {
        beep(660, 0.08, "sine", 0.05, 880);
      },
    };
  }

  root.HoshiyomiAudio = { create: createAudio };
})(typeof globalThis !== "undefined" ? globalThis : this);
