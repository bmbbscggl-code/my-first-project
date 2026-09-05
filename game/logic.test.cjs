const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("./js/logic.js");

test("カプセル取得でパワーメーターが進む", () => {
  let m = L.createMeter();
  assert.equal(m.cursor, -1);
  m = L.collectCapsule(m);
  assert.equal(m.cursor, 0);
  m = L.collectCapsule(m);
  assert.equal(m.cursor, 1);
  for (let i = 0; i < 4; i++) m = L.collectCapsule(m);
  assert.equal(m.cursor, 5);
  m = L.collectCapsule(m);
  assert.equal(m.cursor, 0);
});

test("SPEED / OPTION は上限まで積める", () => {
  let m = L.createMeter();
  m.cursor = 0;
  for (let i = 0; i < 4; i++) {
    const r = L.activatePower(m);
    assert.equal(r.ok, true);
    m = r.meter;
    m.cursor = 0;
  }
  assert.equal(m.speed, 5);
  const wasted = L.activatePower(m);
  assert.equal(wasted.wasted, true);
  assert.equal(wasted.meter.speed, 5);

  m = L.createMeter();
  m.cursor = 4;
  m = L.activatePower(m).meter;
  m.cursor = 4;
  m = L.activatePower(m).meter;
  assert.equal(m.options, 2);
  m.cursor = 4;
  assert.equal(L.activatePower(m).wasted, true);
});

test("DOUBLE と LASER は排他", () => {
  let m = L.createMeter();
  m.cursor = 2;
  m = L.activatePower(m).meter;
  assert.equal(m.double, true);
  assert.equal(m.laser, false);
  m.cursor = 3;
  m = L.activatePower(m).meter;
  assert.equal(m.laser, true);
  assert.equal(m.double, false);
});

test("被弾でパワーは全リセット", () => {
  let m = L.applyKonami(L.createMeter());
  assert.equal(m.options, 2);
  assert.equal(m.shield, 3);
  m = L.loseLife(m);
  assert.deepEqual(m, L.createMeter());
});

test("当たり判定と残機加点", () => {
  assert.equal(L.aabb({ x: 0, y: 0, w: 8, h: 8 }, { x: 7, y: 7, w: 4, h: 4 }), true);
  assert.equal(L.aabb({ x: 0, y: 0, w: 8, h: 8 }, { x: 9, y: 0, w: 4, h: 4 }), false);
  assert.equal(L.extraLivesGained(19999, 20000), 1);
  assert.equal(L.extraLivesGained(20000, 20001), 0);
  assert.equal(L.extraLivesGained(19999, 50000), 2);
});

test("固定タイムステップは入力頻度に依存しない", () => {
  const frame = L.FRAME_MS;
  function countSteps(hz, seconds) {
    let last = null;
    let acc = 0;
    let steps = 0;
    const dt = 1000 / hz;
    for (let t = 0; t <= seconds * 1000 + 0.0001; t += dt) {
      const r = L.stepSimulationClock(t, last, acc, frame, L.MAX_STEPS, false);
      last = r.last;
      acc = r.acc;
      steps += r.steps;
    }
    return steps;
  }
  const s60 = countSteps(60, 1);
  const s120 = countSteps(120, 1);
  assert.ok(Math.abs(s60 - 61) <= 2, "60Hz 1秒が約60ステップ: " + s60);
  assert.ok(Math.abs(s120 - 61) <= 2, "120Hz 1秒も約60ステップ: " + s120);
  assert.ok(Math.abs(s60 - s120) <= 2, "リフレッシュが違ってもステップ数が近い");

  const paused = L.stepSimulationClock(500, 400, 30, frame, 5, true);
  assert.equal(paused.steps, 0);
  assert.equal(paused.acc, 0);

  let c = L.stepSimulationClock(16.667, null, 0, frame, 5, false);
  assert.equal(c.steps, 1);
  c = L.stepSimulationClock(c.last + 200, c.last, c.acc, frame, 5, false);
  assert.equal(c.steps, 5);
  assert.equal(c.acc, 0);
});

test("カプセルは赤1機か全滅ボーナスだけ", () => {
  assert.equal(L.isRedWave(3), true);
  assert.equal(L.isRedWave(1), false);
  assert.equal(L.isWipeBonusWave(6), true);
  assert.equal(L.isWipeBonusWave(3), false);
  const red = L.planWave(3);
  assert.equal(red.fanCount, 5);
  assert.equal(red.isRed, true);
  assert.equal(red.redSlot, 2);
  assert.equal(red.wipeBonus, false);

  const base = {
    kind: "kill",
    enemyType: "fanRed",
    red: true,
    waveIndex: 3,
    waveHasRed: true,
    waveDropped: false,
    fansAliveAfter: 4,
    fansEscaped: 0,
    fansSpawned: 5,
    onScreenCapsules: 0,
  };
  assert.equal(L.shouldDropCapsule(base), true);
  assert.equal(L.shouldDropCapsule(Object.assign({}, base, { enemyType: "fan", red: false })), false);
  assert.equal(L.shouldDropCapsule(Object.assign({}, base, { onScreenCapsules: 1 })), false);
  assert.equal(L.shouldDropCapsule(Object.assign({}, base, { waveDropped: true })), false);

  const wipe = {
    kind: "kill",
    enemyType: "fan",
    red: false,
    waveIndex: 6,
    waveHasRed: false,
    waveDropped: false,
    fansAliveAfter: 0,
    fansEscaped: 0,
    fansSpawned: 5,
    onScreenCapsules: 0,
  };
  assert.equal(L.shouldDropCapsule(wipe), true);
  assert.equal(L.shouldDropCapsule(Object.assign({}, wipe, { fansEscaped: 1 })), false);
  assert.equal(L.shouldDropCapsule(Object.assign({}, wipe, { waveIndex: 1 })), false);
  assert.equal(L.shouldDropCapsule(Object.assign({}, wipe, { kind: "escape" })), false);
  assert.equal(L.shouldDropCapsule(Object.assign({}, wipe, { enemyType: "ducker" })), false);
});

test("コナミコマンドと移動速度", () => {
  const code = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "KeyB", "KeyA"];
  assert.equal(L.matchesKonami(code), true);
  assert.equal(L.matchesKonami(code.slice(0, 8)), false);
  assert.ok(L.playerSpeed(5) > L.playerSpeed(1));
  assert.equal(L.stageTheme(0), "volcano");
  assert.equal(L.stageTheme(1), "moai");
  assert.equal(L.stageTheme(2), "fortress");
  assert.ok(L.optionTrailIndex(1, 40) < L.optionTrailIndex(0, 40) || L.optionTrailIndex(1, 40) <= 39);
});
