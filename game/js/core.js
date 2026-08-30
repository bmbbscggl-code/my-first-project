/**
 * 星詠みの弾幕 — 純ロジック（ブラウザ / Node 両対応）
 * 描画や DOM に依存しない。テストとゲーム本体の両方から使う。
 */
(function (root) {
  "use strict";

  var HIGH_SCORE_KEY = "hoshiyomi_highscore";
  var MUTE_KEY = "hoshiyomi_mute";
  var START_LIVES = 3;
  var INVINCIBLE_SEC = 2;
  var TOUCH_OFFSET = 96;
  var MOUSE_OFFSET = 28;
  var HITBOX_RADIUS = 3.6;

  var ENEMY_SCORE = {
    wisp: 120,
    mage: 220,
    moth: 180,
    crystal: 300,
    orbiter: 260,
    boss: 12000,
  };

  var ENEMY_HP = {
    wisp: 5,
    mage: 10,
    moth: 8,
    crystal: 16,
    orbiter: 12,
    boss: 560,
  };

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function circleHit(ax, ay, ar, bx, by, br) {
    var dx = ax - bx;
    var dy = ay - by;
    var r = ar + br;
    return dx * dx + dy * dy < r * r;
  }

  function bulletVelocity(angle, speed) {
    return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
  }

  function fanAngles(aim, count, spread) {
    if (count <= 1) return [aim];
    var start = aim - spread / 2;
    var step = spread / (count - 1);
    var out = [];
    for (var i = 0; i < count; i++) out.push(start + i * step);
    return out;
  }

  function ringAngles(count, offset) {
    var out = [];
    var step = (Math.PI * 2) / count;
    for (var i = 0; i < count; i++) out.push(offset + step * i);
    return out;
  }

  function followTarget(pointerX, pointerY, isTouch, w, h, margin) {
    var offset = isTouch ? TOUCH_OFFSET : MOUSE_OFFSET;
    return {
      x: clamp(pointerX, margin, w - margin),
      y: clamp(pointerY - offset, margin + 40, h - margin),
    };
  }

  function createSession(highScore) {
    return {
      score: 0,
      lives: START_LIVES,
      invincibleUntil: 0,
      highScore: highScore || 0,
      screen: "title",
      stageTime: 0,
      cleared: false,
    };
  }

  function hitPlayer(session, now) {
    if (session.screen !== "playing") return { hit: false };
    if (now < session.invincibleUntil) return { hit: false };
    session.lives -= 1;
    session.invincibleUntil = now + INVINCIBLE_SEC;
    if (session.lives <= 0) {
      session.lives = 0;
      session.screen = "gameover";
    }
    return {
      hit: true,
      lives: session.lives,
      gameover: session.screen === "gameover",
    };
  }

  function addScore(session, n) {
    session.score += n;
    if (session.score > session.highScore) session.highScore = session.score;
    return session.score;
  }

  function scoreEnemy(kind) {
    return ENEMY_SCORE[kind] || 100;
  }

  function loadHighScore(storage) {
    if (!storage) return 0;
    var n = Number(storage.getItem(HIGH_SCORE_KEY) || 0);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }

  function persistHighScore(storage, score) {
    var prev = loadHighScore(storage);
    if (score > prev) {
      storage.setItem(HIGH_SCORE_KEY, String(score));
      return score;
    }
    return prev;
  }

  function loadMute(storage) {
    return !!(storage && storage.getItem(MUTE_KEY) === "1");
  }

  function persistMute(storage, muted) {
    if (!storage) return;
    storage.setItem(MUTE_KEY, muted ? "1" : "0");
  }

  function clearBonus(session) {
    return session.lives * 2500 + 5000;
  }

  function finishClear(session, storage) {
    addScore(session, clearBonus(session));
    session.cleared = true;
    session.screen = "clear";
    persistHighScore(storage, session.score);
    return session;
  }

  function finishGameOver(session, storage) {
    session.screen = "gameover";
    persistHighScore(storage, session.score);
    return session;
  }

  /**
   * ステージ進行（秒）。quick なら時間を圧縮して検証しやすくする。
   */
  function waveSchedule(quick) {
    var s = quick ? 0.28 : 1;
    return [
      { id: 1, title: "第1詠 — 灯火", start: 0 * s, end: 22 * s },
      { id: 2, title: "第2詠 — 星図", start: 22 * s, end: 44 * s },
      { id: 3, title: "第3詠 — 蝶夢", start: 44 * s, end: 68 * s },
      { id: 4, title: "第4詠 — 結晶", start: 68 * s, end: 94 * s },
      { id: 5, title: "第5詠 — 乱舞", start: 94 * s, end: 122 * s },
      { id: 6, title: "夜天の詠唱者", start: 122 * s, end: 128 * s, bossWarning: true },
    ];
  }

  function currentWave(schedule, t) {
    var last = schedule[0];
    for (var i = 0; i < schedule.length; i++) {
      if (t >= schedule[i].start) last = schedule[i];
    }
    return last;
  }

  function bossAppearTime(schedule) {
    for (var i = 0; i < schedule.length; i++) {
      if (schedule[i].bossWarning) return schedule[i].end;
    }
    return 128;
  }

  var Core = {
    HIGH_SCORE_KEY: HIGH_SCORE_KEY,
    MUTE_KEY: MUTE_KEY,
    START_LIVES: START_LIVES,
    INVINCIBLE_SEC: INVINCIBLE_SEC,
    TOUCH_OFFSET: TOUCH_OFFSET,
    MOUSE_OFFSET: MOUSE_OFFSET,
    HITBOX_RADIUS: HITBOX_RADIUS,
    ENEMY_SCORE: ENEMY_SCORE,
    ENEMY_HP: ENEMY_HP,
    clamp: clamp,
    lerp: lerp,
    circleHit: circleHit,
    bulletVelocity: bulletVelocity,
    fanAngles: fanAngles,
    ringAngles: ringAngles,
    followTarget: followTarget,
    createSession: createSession,
    hitPlayer: hitPlayer,
    addScore: addScore,
    scoreEnemy: scoreEnemy,
    loadHighScore: loadHighScore,
    persistHighScore: persistHighScore,
    loadMute: loadMute,
    persistMute: persistMute,
    clearBonus: clearBonus,
    finishClear: finishClear,
    finishGameOver: finishGameOver,
    waveSchedule: waveSchedule,
    currentWave: currentWave,
    bossAppearTime: bossAppearTime,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Core;
  }
  root.HoshiyomiCore = Core;
})(typeof globalThis !== "undefined" ? globalThis : this);
