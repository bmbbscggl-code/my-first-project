#!/usr/bin/env node
/**
 * 星詠みの弾幕 — コアロジックのユニットテスト（依存なし）
 */
"use strict";

var path = require("path");
var assert = require("assert");
var C = require(path.join(__dirname, "../js/core.js"));

var failed = 0;
var passed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log("  PASS  " + name);
  } catch (err) {
    failed += 1;
    console.log("  FAIL  " + name);
    console.log("        " + err.message);
  }
}

console.log("星詠みの弾幕 コアテスト");

test("circleHit: 重なる円はヒット", function () {
  assert.strictEqual(C.circleHit(0, 0, 3, 4, 0, 2), true);
});

test("circleHit: 離れた円はミス", function () {
  assert.strictEqual(C.circleHit(0, 0, 3, 10, 0, 2), false);
});

test("circleHit: 自機の小さい判定は弾をすり抜けられる", function () {
  var playerR = C.HITBOX_RADIUS;
  var bulletR = 5 * 0.72;
  assert.ok(playerR < 5, "判定は見た目より小さい");
  assert.strictEqual(C.circleHit(0, 0, playerR, 10, 0, bulletR), false);
  assert.strictEqual(C.circleHit(0, 0, playerR, 4, 0, bulletR), true);
});

test("clamp / lerp", function () {
  assert.strictEqual(C.clamp(5, 0, 3), 3);
  assert.strictEqual(C.clamp(-1, 0, 3), 0);
  assert.strictEqual(C.lerp(0, 10, 0.5), 5);
});

test("fanAngles: 3発は左右対称", function () {
  var a = C.fanAngles(Math.PI / 2, 3, 0.6);
  assert.strictEqual(a.length, 3);
  assert.ok(Math.abs(a[1] - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(a[2] - a[0] - 0.6) < 1e-9);
});

test("ringAngles: 円形拡散は一周する", function () {
  var a = C.ringAngles(8, 0);
  assert.strictEqual(a.length, 8);
  assert.ok(Math.abs(a[4] - Math.PI) < 1e-9);
});

test("bulletVelocity は指定速度", function () {
  var v = C.bulletVelocity(0, 100);
  assert.ok(Math.abs(v.vx - 100) < 1e-9);
  assert.ok(Math.abs(v.vy) < 1e-9);
});

test("followTarget: タッチはオフセットして指の下に隠れない", function () {
  var t = C.followTarget(100, 400, true, 390, 780, 16);
  assert.strictEqual(t.x, 100);
  assert.ok(t.y < 400 - 80, "タッチ位置より上に追従");
});

test("followTarget: マウスはオフセットが小さい", function () {
  var m = C.followTarget(100, 400, false, 390, 780, 16);
  var t = C.followTarget(100, 400, true, 390, 780, 16);
  assert.ok(m.y > t.y);
});

test("被弾で残機が減り、無敵中は無効", function () {
  var s = C.createSession(0);
  s.screen = "playing";
  var r1 = C.hitPlayer(s, 1);
  assert.strictEqual(r1.hit, true);
  assert.strictEqual(s.lives, 2);
  var r2 = C.hitPlayer(s, 1.5);
  assert.strictEqual(r2.hit, false);
  assert.strictEqual(s.lives, 2);
  var r3 = C.hitPlayer(s, 1 + C.INVINCIBLE_SEC + 0.01);
  assert.strictEqual(r3.hit, true);
  assert.strictEqual(s.lives, 1);
});

test("残機ゼロでゲームオーバー", function () {
  var s = C.createSession(0);
  s.screen = "playing";
  C.hitPlayer(s, 0);
  C.hitPlayer(s, 3);
  var r = C.hitPlayer(s, 6);
  assert.strictEqual(r.gameover, true);
  assert.strictEqual(s.screen, "gameover");
  assert.strictEqual(s.lives, 0);
});

test("スコアと敵種別", function () {
  var s = C.createSession(0);
  C.addScore(s, C.scoreEnemy("wisp"));
  C.addScore(s, C.scoreEnemy("boss"));
  assert.strictEqual(s.score, 120 + 12000);
  assert.strictEqual(s.highScore, s.score);
});

test("localStorage ハイスコア", function () {
  var store = {
    data: {},
    getItem: function (k) {
      return this.data[k] == null ? null : this.data[k];
    },
    setItem: function (k, v) {
      this.data[k] = String(v);
    },
  };
  assert.strictEqual(C.loadHighScore(store), 0);
  assert.strictEqual(C.persistHighScore(store, 500), 500);
  assert.strictEqual(C.persistHighScore(store, 200), 500);
  assert.strictEqual(C.loadHighScore(store), 500);
});

test("クリア時に残機ボーナスが入る", function () {
  var store = {
    data: {},
    getItem: function () {
      return null;
    },
    setItem: function () {},
  };
  var s = C.createSession(0);
  s.screen = "playing";
  s.lives = 2;
  s.score = 1000;
  C.finishClear(s, store);
  assert.strictEqual(s.screen, "clear");
  assert.strictEqual(s.score, 1000 + C.clearBonus({ lives: 2 }));
  assert.strictEqual(s.cleared, true);
});

test("ウェーブは序盤→中盤→ボスの段階式", function () {
  var sch = C.waveSchedule(false);
  assert.ok(sch.length >= 6);
  assert.ok(sch[0].title.indexOf("灯火") >= 0);
  assert.ok(sch[sch.length - 1].bossWarning);
  var tBoss = C.bossAppearTime(sch);
  assert.ok(tBoss > 100, "通常プレイはボスまで2分前後");
  assert.ok(tBoss < 200);
  var w = C.currentWave(sch, 10);
  assert.strictEqual(w.id, 1);
});

test("quick モードは時間圧縮", function () {
  var q = C.waveSchedule(true);
  assert.ok(C.bossAppearTime(q) < 50);
});

test("ミュート永続化", function () {
  var store = {
    data: {},
    getItem: function (k) {
      return this.data[k] == null ? null : this.data[k];
    },
    setItem: function (k, v) {
      this.data[k] = String(v);
    },
  };
  assert.strictEqual(C.loadMute(store), false);
  C.persistMute(store, true);
  assert.strictEqual(C.loadMute(store), true);
});

console.log("");
console.log(passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
