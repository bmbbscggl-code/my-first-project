/**
 * STAR VIPER — テスト可能なコア論理
 * ファミコン版グラディウスのパワーメーター／当たり判定／残機加点を再現する。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.StarViperLogic = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var POWER_NAMES = ["SPEED", "MISSILE", "DOUBLE", "LASER", "OPTION", "?"];
  var POWER_JA = {
    SPEED: "スピードアップ",
    MISSILE: "ミサイル装備",
    DOUBLE: "ダブルショット",
    LASER: "レーザー装備",
    OPTION: "オプション",
    "?": "シールド展開",
  };
  var EXTRA_LIFE_AT = [20000, 50000, 100000, 200000];
  var MAX_SPEED = 5;
  var MAX_OPTIONS = 2;
  var MAX_SHIELD = 3;
  var FRAME_MS = 1000 / 60;
  var MAX_STEPS = 5;
  var MAX_ONSCREEN_CAPSULES = 1;
  var WAVE_PERIOD = 8;
  var RED_PHASE = 3;
  var WIPE_PHASE = 6;
  var FAN_COUNT = 5;
  var RED_SLOT = 2;
  var TOUCH_LIFT_Y = 52;

  function createMeter() {
    return {
      cursor: -1,
      speed: 1,
      missile: false,
      double: false,
      laser: false,
      options: 0,
      shield: 0,
    };
  }

  function collectMessage(cursor) {
    var name = POWER_NAMES[cursor];
    if (!name) return "POWERで装備";
    return name + "点灯! POWERで装備";
  }

  function activationMessage(name, wasted) {
    if (wasted) return "これ以上つけられない";
    return POWER_JA[name] || name || "";
  }

  function isSlotOwned(meter, slot) {
    if (!meter) return false;
    if (slot === 0) return meter.speed > 1;
    if (slot === 1) return !!meter.missile;
    if (slot === 2) return !!meter.double;
    if (slot === 3) return !!meter.laser;
    if (slot === 4) return meter.options > 0;
    if (slot === 5) return meter.shield > 0;
    return false;
  }

  function hitPowerBar(px, py) {
    return py >= 186 && py <= 223 && px >= 0 && px <= 256;
  }

  function collectCapsule(meter) {
    var next = cloneMeter(meter);
    next.cursor = (next.cursor + 1) % POWER_NAMES.length;
    return next;
  }

  function canActivate(meter) {
    if (!meter || meter.cursor < 0) return false;
    var slot = meter.cursor;
    if (slot === 0) return meter.speed < MAX_SPEED;
    if (slot === 4) return meter.options < MAX_OPTIONS;
    return true;
  }

  function activatePower(meter) {
    var next = cloneMeter(meter);
    if (next.cursor < 0) {
      return { ok: false, wasted: false, name: null, meter: next };
    }
    var slot = next.cursor;
    var name = POWER_NAMES[slot];
    var wasted = false;

    if (slot === 0) {
      if (next.speed >= MAX_SPEED) wasted = true;
      else next.speed += 1;
    } else if (slot === 1) {
      if (next.missile) wasted = true;
      next.missile = true;
    } else if (slot === 2) {
      next.double = true;
      next.laser = false;
    } else if (slot === 3) {
      next.laser = true;
      next.double = false;
    } else if (slot === 4) {
      if (next.options >= MAX_OPTIONS) wasted = true;
      else next.options += 1;
    } else if (slot === 5) {
      next.shield = MAX_SHIELD;
    }

    next.cursor = -1;
    return { ok: !wasted, wasted: wasted, name: name, meter: next };
  }

  function loseLife(meter) {
    return createMeter();
  }

  function applyKonami(meter) {
    var next = cloneMeter(meter);
    next.speed = Math.max(next.speed, 3);
    next.missile = true;
    next.laser = true;
    next.double = false;
    next.options = MAX_OPTIONS;
    next.shield = MAX_SHIELD;
    next.cursor = -1;
    return next;
  }

  function aabb(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  function extraLivesGained(oldScore, newScore) {
    var gained = 0;
    for (var i = 0; i < EXTRA_LIFE_AT.length; i++) {
      if (oldScore < EXTRA_LIFE_AT[i] && newScore >= EXTRA_LIFE_AT[i]) gained += 1;
    }
    return gained;
  }

  function playerSpeed(speedLevel) {
    var level = Math.max(1, Math.min(MAX_SPEED, speedLevel || 1));
    return 1.15 + (level - 1) * 0.65;
  }

  function optionTrailIndex(optionSlot, trailLength) {
    var delays = [12, 24];
    var delay = delays[Math.max(0, Math.min(delays.length - 1, optionSlot))] || 12;
    return Math.max(0, trailLength - 1 - delay);
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function beginTouchSteer(pointerX, pointerY, playerX, playerY, liftY) {
    var lift = liftY == null ? TOUCH_LIFT_Y : liftY;
    var dx = playerX - pointerX;
    var dy = playerY - pointerY;
    if (dy > -lift) dy = -lift;
    return { dx: dx, dy: dy };
  }

  function aimFromTouch(pointerX, pointerY, grab) {
    var g = grab || { dx: 0, dy: -TOUCH_LIFT_Y };
    return { x: pointerX + g.dx, y: pointerY + g.dy };
  }

  function wrapKonami(buffer, max) {
    var next = buffer.slice();
    if (next.length > max) next = next.slice(next.length - max);
    return next;
  }

  function matchesKonami(buffer) {
    var code = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "KeyB", "KeyA"];
    if (buffer.length < code.length) return false;
    var tail = buffer.slice(buffer.length - code.length);
    for (var i = 0; i < code.length; i++) {
      if (tail[i] !== code[i]) return false;
    }
    return true;
  }

  function stageTheme(stageIndex) {
    var themes = ["volcano", "moai", "fortress"];
    return themes[((stageIndex % themes.length) + themes.length) % themes.length];
  }

  function waveInterval(stageIndex, scroll) {
    var base = 92 - Math.min(28, stageIndex * 8);
    if (scroll < 700) return base + 10;
    return base;
  }

  function cloneMeter(meter) {
    return {
      cursor: meter.cursor,
      speed: meter.speed,
      missile: meter.missile,
      double: meter.double,
      laser: meter.laser,
      options: meter.options,
      shield: meter.shield,
    };
  }

  function isFanType(type) {
    return type === "fan" || type === "fanRed";
  }

  function isRedWave(waveIndex) {
    return waveIndex >= 1 && waveIndex % WAVE_PERIOD === RED_PHASE;
  }

  function isWipeBonusWave(waveIndex) {
    return waveIndex >= 1 && waveIndex % WAVE_PERIOD === WIPE_PHASE;
  }

  function planWave(waveIndex) {
    var red = isRedWave(waveIndex);
    return {
      fanCount: FAN_COUNT,
      isRed: red,
      redSlot: RED_SLOT,
      wipeBonus: isWipeBonusWave(waveIndex),
    };
  }

  function resetSimulationClock(now) {
    return { last: now, acc: 0, steps: 0 };
  }

  function stepSimulationClock(now, last, acc, frameMs, maxSteps, paused) {
    if (!(frameMs > 0)) return { last: now, acc: 0, steps: 0 };
    var cap = maxSteps < 1 ? 1 : maxSteps;
    if (paused) return { last: now, acc: 0, steps: 0 };
    if (last === null || last === undefined) {
      return { last: now, acc: 0, steps: 1 };
    }
    var dt = now < last ? 0 : now - last;
    var nextAcc = acc + dt;
    var steps = 0;
    while (nextAcc >= frameMs && steps < cap) {
      nextAcc -= frameMs;
      steps += 1;
    }
    if (steps === cap && nextAcc >= frameMs) nextAcc = 0;
    return { last: now, acc: nextAcc, steps: steps };
  }

  function shouldDropCapsule(event) {
    if (!event || event.kind !== "kill") return false;
    if (!isFanType(event.enemyType)) return false;
    if (event.red) return true;
    if ((event.onScreenCapsules || 0) >= MAX_ONSCREEN_CAPSULES) return false;
    if (event.waveDropped) return false;
    if (!(event.waveIndex >= 1)) return false;
    if (event.waveHasRed) return false;
    if (!isWipeBonusWave(event.waveIndex)) return false;
    if ((event.fansEscaped || 0) > 0) return false;
    if (event.fansAliveAfter !== 0) return false;
    if (!(event.fansSpawned >= 1)) return false;
    return true;
  }

  return {
    POWER_NAMES: POWER_NAMES,
    POWER_JA: POWER_JA,
    EXTRA_LIFE_AT: EXTRA_LIFE_AT,
    MAX_SPEED: MAX_SPEED,
    MAX_OPTIONS: MAX_OPTIONS,
    MAX_SHIELD: MAX_SHIELD,
    FRAME_MS: FRAME_MS,
    MAX_STEPS: MAX_STEPS,
    MAX_ONSCREEN_CAPSULES: MAX_ONSCREEN_CAPSULES,
    WAVE_PERIOD: WAVE_PERIOD,
    RED_PHASE: RED_PHASE,
    WIPE_PHASE: WIPE_PHASE,
    FAN_COUNT: FAN_COUNT,
    RED_SLOT: RED_SLOT,
    TOUCH_LIFT_Y: TOUCH_LIFT_Y,
    createMeter: createMeter,
    collectCapsule: collectCapsule,
    canActivate: canActivate,
    activatePower: activatePower,
    loseLife: loseLife,
    applyKonami: applyKonami,
    aabb: aabb,
    extraLivesGained: extraLivesGained,
    playerSpeed: playerSpeed,
    optionTrailIndex: optionTrailIndex,
    clamp: clamp,
    wrapKonami: wrapKonami,
    matchesKonami: matchesKonami,
    stageTheme: stageTheme,
    waveInterval: waveInterval,
    cloneMeter: cloneMeter,
    isFanType: isFanType,
    isRedWave: isRedWave,
    isWipeBonusWave: isWipeBonusWave,
    planWave: planWave,
    resetSimulationClock: resetSimulationClock,
    stepSimulationClock: stepSimulationClock,
    shouldDropCapsule: shouldDropCapsule,
    collectMessage: collectMessage,
    activationMessage: activationMessage,
    isSlotOwned: isSlotOwned,
    hitPowerBar: hitPowerBar,
    beginTouchSteer: beginTouchSteer,
    aimFromTouch: aimFromTouch,
  };
});
