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
