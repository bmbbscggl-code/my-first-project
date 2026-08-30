/**
 * 星詠みの弾幕 — 本体（キャンバス描画・入力・ウェーブ・ボス）
 */
(function () {
  "use strict";

  var C = window.HoshiyomiCore;
  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d", { alpha: false });
  var overlay = document.getElementById("overlay");
  var hud = document.getElementById("hud");
  var scoreEl = document.getElementById("score");
  var livesEl = document.getElementById("lives");
  var hiscoreEl = document.getElementById("hiscore");
  var titleHi = document.getElementById("title-hi");
  var waveTitle = document.getElementById("wave-title");
  var bossBar = document.getElementById("boss-bar");
  var bossFill = document.getElementById("boss-fill");
  var muteBtn = document.getElementById("mute");
  var startBtn = document.getElementById("start");

  var W = 390;
  var H = 780;
  var muted = C.loadMute(localStorage);
  var audio = window.HoshiyomiAudio.create(function () {
    return muted;
  });
  var shootAcc = 0;
  var lastShotSound = 0;

  var quick =
    typeof location !== "undefined" &&
    /(?:^|[?&])quick=1(?:&|$)/.test(location.search);
  var schedule = C.waveSchedule(quick);
  var bossAt = C.bossAppearTime(schedule);

  var session = C.createSession(C.loadHighScore(localStorage));
  var player = {
    x: 195,
    y: 640,
    tx: 195,
    ty: 640,
    r: C.HITBOX_RADIUS,
    blink: 0,
  };

  function Pool(factory) {
    this.live = [];
    this.dead = [];
    this.factory = factory;
  }
  Pool.prototype.spawn = function (init) {
    var o = this.dead.pop() || this.factory();
    for (var k in init) o[k] = init[k];
    o.alive = true;
    this.live.push(o);
    return o;
  };
  Pool.prototype.each = function (fn) {
    var w = 0;
    for (var i = 0; i < this.live.length; i++) {
      var o = this.live[i];
      fn(o);
      if (o.alive) this.live[w++] = o;
      else this.dead.push(o);
    }
    this.live.length = w;
  };
  Pool.prototype.clear = function () {
    for (var i = 0; i < this.live.length; i++) {
      this.live[i].alive = false;
      this.dead.push(this.live[i]);
    }
    this.live.length = 0;
  };

  var bullets = new Pool(function () {
    return {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      r: 5,
      friendly: false,
      color: "#fff",
      kind: "dot",
      spin: 0,
      age: 0,
      alive: false,
    };
  });
  var enemies = new Pool(function () {
    return {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      r: 14,
      hp: 1,
      maxHp: 1,
      kind: "wisp",
      age: 0,
      fire: 0,
      phase: 0,
      lane: 0.5,
      angle: 0,
      alive: false,
    };
  });
  var particles = new Pool(function () {
    return {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 1,
      max: 1,
      r: 2,
      color: "#fff",
      alive: false,
    };
  });

  var stars = [];
  var boss = null;
  var magicT = 0;
  var shownWave = -1;
  var hudDirty = true;
  var last = 0;
  var pointerId = null;
  var isTouchPtr = false;
  var lastHudScore = -1;
  var lastHudLives = -1;

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (stars.length === 0) seedStars();
  }

  function seedStars() {
    stars = [];
    var n = 90;
    for (var i = 0; i < n; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random(),
        z: 0.4 + Math.random() * 0.8,
        tw: Math.random() * Math.PI * 2,
      });
    }
  }

  function burst(x, y, color, n, spd) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = (0.4 + Math.random()) * (spd || 80);
      particles.spawn({
        x: x,
        y: y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.35 + Math.random() * 0.35,
        max: 0.7,
        r: 1.2 + Math.random() * 2,
        color: color,
      });
    }
  }

  function emitEnemy(kind, lane, y) {
    var hp = C.ENEMY_HP[kind] || 6;
    enemies.spawn({
      x: lane * W,
      y: y == null ? -24 : y,
      vx: 0,
      vy: kind === "crystal" ? 38 : 56,
      r: kind === "crystal" ? 18 : kind === "mage" ? 15 : 13,
      hp: hp,
      maxHp: hp,
      kind: kind,
      age: 0,
      fire: kind === "wisp" ? 0.6 : 0.3,
      phase: 0,
      lane: lane,
      angle: 0,
    });
  }

  function fireEnemy(e, angle, speed, r, color, kind) {
    var v = C.bulletVelocity(angle, speed);
    bullets.spawn({
      x: e.x,
      y: e.y,
      vx: v.vx,
      vy: v.vy,
      r: r,
      friendly: false,
      color: color,
      kind: kind || "dot",
      spin: 0,
      age: 0,
    });
  }

  function fireFan(e, aim, count, spread, speed, r, color) {
    var angs = C.fanAngles(aim, count, spread);
    for (var i = 0; i < angs.length; i++) fireEnemy(e, angs[i], speed, r, color, "fan");
  }

  function fireRing(e, count, offset, speed, r, color) {
    var angs = C.ringAngles(count, offset);
    for (var i = 0; i < angs.length; i++) fireEnemy(e, angs[i], speed, r, color, "ring");
  }

  function aimAtPlayer(e) {
    return Math.atan2(player.y - e.y, player.x - e.x);
  }

  function playerShoot(dt) {
    shootAcc += dt;
    var gap = 0.085;
    while (shootAcc >= gap) {
      shootAcc -= gap;
      var ox = [-8, 8];
      for (var i = 0; i < 2; i++) {
        bullets.spawn({
          x: player.x + ox[i],
          y: player.y - 16,
          vx: 0,
          vy: -620,
          r: 3.2,
          friendly: true,
          color: "#fff4b0",
          kind: "player",
          spin: 0,
          age: 0,
        });
      }
      if (performance.now() - lastShotSound > 70) {
        audio.shoot();
        lastShotSound = performance.now();
      }
    }
  }

  function enemyThink(e, dt) {
    e.age += dt;
    e.fire -= dt;
    if (e.kind === "wisp") {
      e.x = e.lane * W + Math.sin(e.age * 1.6) * 28;
      e.y += e.vy * dt;
      if (e.fire <= 0) {
        e.fire = 1.35;
        fireEnemy(e, Math.PI / 2, 110, 5.5, "#ff8aa8", "line");
      }
    } else if (e.kind === "mage") {
      var ty = H * 0.18;
      if (e.y < ty) e.y += 70 * dt;
      else e.y += Math.sin(e.age * 2) * 8 * dt;
      e.x = e.lane * W + Math.sin(e.age * 0.8) * 16;
      if (e.fire <= 0) {
        e.fire = 1.15;
        fireEnemy(e, aimAtPlayer(e), 145, 5, "#ffb36b", "aimed");
      }
      if (e.age > 9) e.y += 40 * dt;
    } else if (e.kind === "moth") {
      e.x = e.lane * W + Math.sin(e.age * 2.4) * Math.min(90, W * 0.22);
      e.y += 48 * dt;
      if (e.fire <= 0) {
        e.fire = 1.55;
        fireFan(e, Math.PI / 2, 3, 0.55, 125, 5.2, "#c79bff");
      }
    } else if (e.kind === "crystal") {
      if (e.y < H * 0.2) e.y += 42 * dt;
      else {
        e.y += 10 * dt;
        if (e.fire <= 0) {
          e.fire = 2.05;
          fireRing(e, 8, e.age, 95, 6, "#7ee8ff");
        }
      }
    } else if (e.kind === "orbiter") {
      e.angle += dt * 1.8;
      e.x = e.lane * W + Math.cos(e.angle) * 40;
      e.y += 40 * dt;
      if (e.fire <= 0) {
        e.fire = 1.7;
        var base = e.angle;
        for (var i = 0; i < 4; i++) {
          fireEnemy(e, base + (Math.PI / 2) * i, 100, 5.4, "#e8c56b", "spin");
        }
      }
    }

    if (e.y > H + 40 || e.x < -50 || e.x > W + 50) e.alive = false;
  }

  function spawnBoss() {
    var hp = C.ENEMY_HP.boss;
    boss = {
      x: W * 0.5,
      y: -80,
      r: 28,
      hp: hp,
      maxHp: hp,
      phase: 1,
      age: 0,
      fire: 0.8,
      entered: false,
      name: "星蝕の巫女",
    };
    magicT = 2.4;
    audio.boss();
    showBanner("—— 星蝕の巫女 ——");
    bossBar.style.display = "block";
  }

  function bossThink(dt) {
    if (!boss) return;
    boss.age += dt;
    if (!boss.entered) {
      boss.y = C.lerp(boss.y, H * 0.2, 1 - Math.pow(0.08, dt));
      if (Math.abs(boss.y - H * 0.2) < 4) boss.entered = true;
    } else {
      boss.x = W * 0.5 + Math.sin(boss.age * 0.7) * Math.min(70, W * 0.18);
      boss.y = H * 0.2 + Math.sin(boss.age * 0.45) * 10;
    }
    if (magicT > 0) {
      magicT -= dt;
      return;
    }
    var ratio = boss.hp / boss.maxHp;
    if (ratio < 0.35) boss.phase = 3;
    else if (ratio < 0.65) boss.phase = 2;
    else boss.phase = 1;

    boss.fire -= dt;
    var dummy = { x: boss.x, y: boss.y };
    if (boss.phase === 1 && boss.fire <= 0) {
      boss.fire = 0.72;
      fireFan(dummy, aimAtPlayer(boss), 5, 0.7, 130, 6, "#ff8aa8");
      fireEnemy(dummy, aimAtPlayer(boss), 170, 5, "#ffb36b", "aimed");
    } else if (boss.phase === 2 && boss.fire <= 0) {
      boss.fire = 0.22;
      var a = boss.age * 2.1;
      fireEnemy(dummy, a, 115, 5.5, "#e8c56b", "spin");
      fireEnemy(dummy, a + Math.PI, 115, 5.5, "#e8c56b", "spin");
      if (Math.floor(boss.age * 2) % 5 === 0) {
        fireRing(dummy, 12, boss.age, 90, 5.2, "#7ee8ff");
      }
    } else if (boss.phase === 3 && boss.fire <= 0) {
      boss.fire = 0.38;
      fireRing(dummy, 16, boss.age * 0.7, 105, 5.4, "#c79bff");
      fireFan(dummy, aimAtPlayer(boss), 3, 0.28, 190, 5, "#ffb36b");
      var spiral = boss.age * 3.2;
      fireEnemy(dummy, spiral, 140, 6.2, "#ff8aa8", "spin");
      fireEnemy(dummy, spiral + 2.1, 140, 6.2, "#ff8aa8", "spin");
    }
    bossFill.style.transform = "scaleX(" + C.clamp(ratio, 0, 1) + ")";
  }

  function damageEnemy(e, dmg) {
    e.hp -= dmg;
    burst(e.x, e.y, "#fff4b0", 3, 40);
    audio.enemyHit();
    if (e.hp <= 0) {
      e.alive = false;
      C.addScore(session, C.scoreEnemy(e.kind));
      burst(e.x, e.y, "#ffd98a", 16, 120);
      audio.enemyDown();
      hudDirty = true;
    }
  }

  function damageBoss(dmg) {
    if (!boss) return;
    boss.hp -= dmg;
    burst(boss.x, boss.y, "#fff4b0", 4, 50);
    audio.enemyHit();
    if (boss.hp <= 0) {
      burst(boss.x, boss.y, "#e8c56b", 36, 160);
      audio.enemyDown();
      C.addScore(session, C.scoreEnemy("boss"));
      C.finishClear(session, localStorage);
      audio.clear();
      boss = null;
      bossBar.style.display = "none";
      bullets.clear();
      enemies.clear();
      showEnd(true);
      hudDirty = true;
    }
  }

  var spawnCursor = 0;
  var spawnPlan = [];

  function buildSpawnPlan() {
    spawnPlan = [];
    function add(t, kind, lane) {
      spawnPlan.push({ t: t, kind: kind, lane: lane });
    }
    var q = quick ? 0.28 : 1;
    // 第1詠 — 少なく読んで慣れる
    add(1.2 * q, "wisp", 0.28);
    add(2.0 * q, "wisp", 0.72);
    add(6.0 * q, "wisp", 0.5);
    add(9.5 * q, "wisp", 0.22);
    add(10.2 * q, "wisp", 0.78);
    add(15.0 * q, "wisp", 0.38);
    add(16.0 * q, "wisp", 0.62);
    // 第2詠 — 狙い撃ち
    add(23.0 * q, "mage", 0.3);
    add(25.0 * q, "wisp", 0.7);
    add(28.5 * q, "mage", 0.68);
    add(31.0 * q, "wisp", 0.22);
    add(34.0 * q, "wisp", 0.5);
    add(37.0 * q, "mage", 0.5);
    add(40.0 * q, "wisp", 0.32);
    add(41.0 * q, "wisp", 0.68);
    // 第3詠 — 扇
    add(45.0 * q, "moth", 0.5);
    add(48.0 * q, "moth", 0.28);
    add(51.0 * q, "wisp", 0.75);
    add(54.0 * q, "moth", 0.7);
    add(57.0 * q, "mage", 0.4);
    add(60.0 * q, "moth", 0.35);
    add(63.0 * q, "moth", 0.65);
    // 第4詠 — 円形
    add(69.0 * q, "crystal", 0.5);
    add(73.0 * q, "wisp", 0.2);
    add(74.0 * q, "wisp", 0.8);
    add(78.0 * q, "crystal", 0.32);
    add(82.0 * q, "orbiter", 0.68);
    add(86.0 * q, "crystal", 0.55);
    add(89.0 * q, "moth", 0.25);
    // 第5詠 — 密度アップ
    add(95.0 * q, "orbiter", 0.3);
    add(96.5 * q, "orbiter", 0.7);
    add(99.0 * q, "mage", 0.5);
    add(102.0 * q, "crystal", 0.22);
    add(104.0 * q, "moth", 0.78);
    add(107.0 * q, "wisp", 0.4);
    add(108.0 * q, "wisp", 0.6);
    add(111.0 * q, "crystal", 0.5);
    add(114.0 * q, "orbiter", 0.35);
    add(116.0 * q, "moth", 0.65);
    add(118.0 * q, "mage", 0.28);
    add(119.0 * q, "mage", 0.72);
    spawnPlan.sort(function (a, b) {
      return a.t - b.t;
    });
  }

  function showBanner(text) {
    waveTitle.textContent = text;
    waveTitle.classList.add("show");
    setTimeout(function () {
      waveTitle.classList.remove("show");
    }, 2200);
  }

  function resetPlay() {
    session = C.createSession(C.loadHighScore(localStorage));
    session.screen = "playing";
    player.x = W * 0.5;
    player.y = H * 0.78;
    player.tx = player.x;
    player.ty = player.y;
    bullets.clear();
    enemies.clear();
    particles.clear();
    boss = null;
    magicT = 0;
    spawnCursor = 0;
    shownWave = -1;
    shootAcc = 0;
    session.stageTime = 0;
    schedule = C.waveSchedule(quick);
    bossAt = C.bossAppearTime(schedule);
    buildSpawnPlan();
    bossBar.style.display = "none";
    hud.classList.remove("hidden");
    hudDirty = true;
    overlay.classList.add("hidden");
    updateHud(true);
  }

  function showEnd(cleared) {
    var hi = C.loadHighScore(localStorage);
    overlay.classList.remove("hidden");
    overlay.innerHTML =
      "<h1>" +
      (cleared ? "クリア" : "ゲームオーバー") +
      "</h1>" +
      '<p class="sub">' +
      (cleared ? "夜天を詠み切った" : "光はここで途切れた") +
      "</p>" +
      '<p class="scoreline">スコア ' +
      session.score +
      "</p>" +
      '<p class="scoreline hi">ハイスコア ' +
      hi +
      "</p>" +
      '<button type="button" id="retry">もう一度</button>';
    document.getElementById("retry").addEventListener("click", function () {
      audio.ui();
      audio.unlock();
      resetPlay();
    });
  }

  function updateHud(force) {
    if (!force && session.score === lastHudScore && session.lives === lastHudLives) return;
    lastHudScore = session.score;
    lastHudLives = session.lives;
    scoreEl.textContent = String(session.score);
    var marks = [];
    for (var i = 0; i < C.START_LIVES; i++) marks.push(i < session.lives ? "●" : "○");
    livesEl.textContent = marks.join(" ");
    hiscoreEl.textContent = String(session.highScore);
  }

  function refreshTitleHi() {
    var hi = C.loadHighScore(localStorage);
    if (titleHi) titleHi.textContent = "ハイスコア " + hi;
    hiscoreEl.textContent = String(hi);
  }

  function setMuteUi() {
    muteBtn.textContent = muted ? "🔇" : "♪";
    muteBtn.setAttribute("aria-label", muted ? "ミュート解除" : "ミュート");
  }

  function hurtPlayer() {
    var now = session.stageTime;
    var res = C.hitPlayer(session, now);
    if (!res.hit) return;
    audio.playerHit();
    burst(player.x, player.y, "#ff8aa8", 18, 140);
    hudDirty = true;
    if (res.gameover) {
      C.finishGameOver(session, localStorage);
      bullets.clear();
      showEnd(false);
      audio.over();
    }
  }

  function update(dt) {
    if (session.screen !== "playing") {
      updateBg(dt);
      return;
    }
    session.stageTime += dt;
    var wave = C.currentWave(schedule, session.stageTime);
    if (wave.id !== shownWave && !boss) {
      shownWave = wave.id;
      showBanner(wave.title);
    }

    while (spawnCursor < spawnPlan.length && spawnPlan[spawnCursor].t <= session.stageTime) {
      var s = spawnPlan[spawnCursor++];
      emitEnemy(s.kind, s.lane);
    }
    if (!boss && session.stageTime >= bossAt) spawnBoss();

    player.x = C.lerp(player.x, player.tx, 1 - Math.pow(0.0008, dt));
    player.y = C.lerp(player.y, player.ty, 1 - Math.pow(0.0008, dt));
    playerShoot(dt);

    enemies.each(function (e) {
      enemyThink(e, dt);
    });
    if (boss) bossThink(dt);

    bullets.each(function (b) {
      b.age += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < -30 || b.x > W + 30 || b.y < -40 || b.y > H + 40) b.alive = false;
    });

    particles.each(function (p) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.98;
      p.vy *= 0.98;
      if (p.life <= 0) p.alive = false;
    });

    // 衝突
    var inv = session.stageTime < session.invincibleUntil;
    for (var i = 0; i < bullets.live.length; i++) {
      var b = bullets.live[i];
      if (!b.alive) continue;
      if (b.friendly) {
        for (var j = 0; j < enemies.live.length; j++) {
          var e = enemies.live[j];
          if (!e.alive) continue;
          if (C.circleHit(b.x, b.y, b.r, e.x, e.y, e.r)) {
            b.alive = false;
            damageEnemy(e, 1);
            break;
          }
        }
        if (b.alive && boss && C.circleHit(b.x, b.y, b.r, boss.x, boss.y, boss.r)) {
          b.alive = false;
          damageBoss(1);
        }
      } else if (!inv && C.circleHit(b.x, b.y, b.r * 0.72, player.x, player.y, player.r)) {
        b.alive = false;
        hurtPlayer();
      }
    }
    if (!inv) {
      for (var k = 0; k < enemies.live.length; k++) {
        var en = enemies.live[k];
        if (en.alive && C.circleHit(en.x, en.y, en.r * 0.7, player.x, player.y, player.r)) {
          hurtPlayer();
          break;
        }
      }
      if (boss && C.circleHit(boss.x, boss.y, boss.r * 0.7, player.x, player.y, player.r)) {
        hurtPlayer();
      }
    }

    updateHud(hudDirty);
    hudDirty = false;
  }

  function updateBg() {}

  function drawBg(t) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0a0c1c");
    g.addColorStop(0.55, "#120c22");
    g.addColorStop(1, "#1a1020");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var tw = 0.45 + 0.55 * Math.abs(Math.sin(t * 1.3 + s.tw));
      ctx.globalAlpha = tw * s.z;
      ctx.fillStyle = "#e8e4ff";
      ctx.beginPath();
      ctx.arc(s.x * W, ((s.y + t * 0.012 * s.z) % 1) * H, 0.7 + s.z, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 漂う粒子
    ctx.fillStyle = "rgba(180,140,255,0.15)";
    for (var p = 0; p < 12; p++) {
      var px = ((Math.sin(t * 0.13 + p) * 0.5 + 0.5) * W + p * 37) % W;
      var py = ((t * 8 + p * 70) % (H + 40)) - 20;
      ctx.beginPath();
      ctx.arc(px, py, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPlayer(t) {
    var inv = session.screen === "playing" && session.stageTime < session.invincibleUntil;
    if (inv && Math.floor(t * 16) % 2 === 0) return;
    ctx.save();
    ctx.translate(player.x, player.y);
    // 翼
    ctx.fillStyle = "rgba(160,210,255,0.35)";
    ctx.beginPath();
    ctx.ellipse(-12, 4, 11, 5, -0.5, 0, Math.PI * 2);
    ctx.ellipse(12, 4, 11, 5, 0.5, 0, Math.PI * 2);
    ctx.fill();
    // 本体
    var rg = ctx.createRadialGradient(0, -2, 1, 0, 0, 14);
    rg.addColorStop(0, "#fffef6");
    rg.addColorStop(0.4, "#9be7ff");
    rg.addColorStop(1, "rgba(80,140,255,0)");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e8f7ff";
    ctx.beginPath();
    ctx.arc(0, -1, 5.5, 0, Math.PI * 2);
    ctx.fill();
    // 判定点
    ctx.fillStyle = "#ff4d6a";
    ctx.beginPath();
    ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawEnemy(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.kind === "wisp") {
      ctx.fillStyle = "rgba(255,140,180,0.25)";
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ff9ab4";
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(-2, -2, 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.kind === "mage") {
      ctx.strokeStyle = "#ffb36b";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#2a1830";
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffd18a";
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(6, 5);
      ctx.lineTo(-6, 5);
      ctx.closePath();
      ctx.fill();
    } else if (e.kind === "moth") {
      ctx.fillStyle = "rgba(180,140,255,0.85)";
      ctx.beginPath();
      ctx.ellipse(-8, 0, 9, 6, -0.4, 0, Math.PI * 2);
      ctx.ellipse(8, 0, 9, 6, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f4e8ff";
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.kind === "crystal") {
      ctx.fillStyle = "#7ee8ff";
      ctx.beginPath();
      for (var i = 0; i < 6; i++) {
        var a = (Math.PI / 3) * i - Math.PI / 6;
        var px = Math.cos(a) * 14;
        var py = Math.sin(a) * 14;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#e8ffff";
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.kind === "orbiter") {
      ctx.strokeStyle = "#e8c56b";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#ffe9a0";
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBoss(t) {
    if (!boss) return;
    ctx.save();
    ctx.translate(boss.x, boss.y);
    if (magicT > 0 || boss.age < 3) {
      var r1 = 46 + Math.sin(t * 3) * 4;
      ctx.strokeStyle = "rgba(232,197,107,0.75)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 8, r1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 8, r1 * 0.62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.save();
      ctx.rotate(t * 0.8);
      ctx.strokeStyle = "rgba(255,180,210,0.6)";
      for (var i = 0; i < 6; i++) {
        ctx.rotate(Math.PI / 3);
        ctx.beginPath();
        ctx.moveTo(0, 18);
        ctx.lineTo(0, r1);
        ctx.stroke();
      }
      ctx.restore();
    }
    var glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 36);
    glow.addColorStop(0, "#fff6d8");
    glow.addColorStop(0.4, "#d080ff");
    glow.addColorStop(1, "rgba(80,20,80,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2a1030";
    ctx.beginPath();
    ctx.ellipse(0, 4, 12, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff0c8";
    ctx.beginPath();
    ctx.arc(0, -8, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBullet(b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    if (b.friendly) {
      ctx.fillStyle = "#fff8c8";
      ctx.shadowColor = "#ffe080";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.ellipse(0, 0, 2.2, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = b.color;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(0, 0, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(-b.r * 0.2, -b.r * 0.2, b.r * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function draw(t) {
    ctx.setTransform(
      Math.min(window.devicePixelRatio || 1, 2),
      0,
      0,
      Math.min(window.devicePixelRatio || 1, 2),
      0,
      0
    );
    drawBg(t);
    particles.each(function (p) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    enemies.each(drawEnemy);
    drawBoss(t);
    bullets.each(drawBullet);
    if (session.screen === "playing") drawPlayer(t);
  }

  function loop(ts) {
    if (!last) last = ts;
    var dt = Math.min(0.033, (ts - last) / 1000);
    last = ts;
    update(dt);
    draw(ts / 1000);
    requestAnimationFrame(loop);
  }

  function pointerPos(ev) {
    var rect = canvas.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }

  function onPointerDown(ev) {
    if (session.screen !== "playing") return;
    pointerId = ev.pointerId;
    isTouchPtr = ev.pointerType === "touch";
    var p = pointerPos(ev);
    var tgt = C.followTarget(p.x, p.y, isTouchPtr, W, H, 16);
    player.tx = tgt.x;
    player.ty = tgt.y;
    try {
      canvas.setPointerCapture(ev.pointerId);
    } catch (err) {}
    ev.preventDefault();
  }
  function onPointerMove(ev) {
    if (session.screen !== "playing") return;
    if (pointerId != null && ev.pointerId !== pointerId) return;
    isTouchPtr = ev.pointerType === "touch";
    var p = pointerPos(ev);
    var tgt = C.followTarget(p.x, p.y, isTouchPtr, W, H, 16);
    player.tx = tgt.x;
    player.ty = tgt.y;
    ev.preventDefault();
  }
  function onPointerUp(ev) {
    if (pointerId === ev.pointerId) pointerId = null;
  }

  function preventScroll(e) {
    e.preventDefault();
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  document.addEventListener("touchmove", preventScroll, { passive: false });
  document.addEventListener("gesturestart", preventScroll);
  document.addEventListener(
    "wheel",
    function (e) {
      e.preventDefault();
    },
    { passive: false }
  );

  startBtn.addEventListener("click", function () {
    audio.unlock();
    audio.ui();
    resetPlay();
  });

  muteBtn.addEventListener("click", function () {
    muted = !muted;
    C.persistMute(localStorage, muted);
    setMuteUi();
    audio.unlock();
    if (!muted) audio.ui();
  });

  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", resize);

  resize();
  setMuteUi();
  refreshTitleHi();
  buildSpawnPlan();
  requestAnimationFrame(loop);

  // 自動テスト / 検証用フック
  window.__HOSHIYOMI__ = {
    getState: function () {
      return {
        screen: session.screen,
        score: session.score,
        lives: session.lives,
        highScore: session.highScore,
        stageTime: session.stageTime,
        player: { x: player.x, y: player.y, r: player.r },
        bullets: bullets.live.length,
        enemies: enemies.live.length,
        boss: boss
          ? { hp: boss.hp, maxHp: boss.maxHp, phase: boss.phase, x: boss.x, y: boss.y }
          : null,
        muted: muted,
        quick: quick,
        W: W,
        H: H,
      };
    },
    start: function () {
      resetPlay();
    },
    retry: function () {
      resetPlay();
    },
    skipToBoss: function () {
      if (session.screen !== "playing") resetPlay();
      session.stageTime = bossAt;
      spawnCursor = spawnPlan.length;
    },
    forceHit: function () {
      session.invincibleUntil = 0;
      hurtPlayer();
    },
    killBoss: function () {
      if (session.screen !== "playing") resetPlay();
      if (!boss) spawnBoss();
      magicT = 0;
      damageBoss(boss.hp + 1);
    },
    setLives: function (n) {
      session.lives = n;
      hudDirty = true;
      updateHud(true);
    },
  };
})();
