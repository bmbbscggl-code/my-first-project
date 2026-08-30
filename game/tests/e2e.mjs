#!/usr/bin/env node
/**
 * 星詠みの弾幕 — Chrome / puppeteer-core による画面遷移テスト
 */
import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const BASE = process.env.GAME_URL || "http://127.0.0.1:8765/game/index.html";
const ART = process.env.ARTIFACT_DIR || "/opt/cursor/artifacts";
const CHROME = process.env.CHROME_PATH || "/usr/local/bin/google-chrome";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function shot(page, name) {
  fs.mkdirSync(ART, { recursive: true });
  const dest = path.join(ART, name);
  await page.screenshot({ path: dest, fullPage: true });
  console.log("screenshot", dest);
}

async function waitForState(page, pred, label, timeout = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const st = await page.evaluate(() => window.__HOSHIYOMI__.getState());
    if (pred(st)) return st;
    await sleep(50);
  }
  throw new Error("timeout: " + label);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: process.env.HEADED === "1" ? false : "new",
  args: [
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--window-size=390,844",
  ],
  defaultViewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
});

let failed = 0;
function ok(name) {
  console.log("  PASS  " + name);
}
function fail(name, err) {
  failed += 1;
  console.log("  FAIL  " + name + "  " + (err && err.message ? err.message : err));
}

try {
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: "networkidle0", timeout: 30000 });

  const title = await page.title();
  if (title !== "星詠みの弾幕") throw new Error("title=" + title);
  ok("タイトル文書");

  const h1 = await page.$eval("h1", (el) => el.textContent);
  if (h1 !== "星詠みの弾幕") throw new Error("h1=" + h1);
  const howto = await page.$eval(".howto", (el) => el.textContent);
  if (!howto.includes("ドラッグ") || !howto.includes("自動") || !howto.includes("ボムなし")) {
    throw new Error("howto=" + howto);
  }
  ok("操作説明がタイトルにある");
  await shot(page, "title_screen_mobile.png");

  const meta = await page.$eval("meta[name=viewport]", (el) => el.getAttribute("content"));
  if (!meta.includes("user-scalable=no")) throw new Error("viewport=" + meta);
  ok("user-scalable=no");

  await page.click("#start");
  const playing = await waitForState(page, (s) => s.screen === "playing", "playing");
  if (playing.lives !== 3) throw new Error("lives=" + playing.lives);
  ok("スタートでプレイ開始・残機3");
  await sleep(400);
  await shot(page, "playing_early_wave.png");

  const before = await page.evaluate(() => window.__HOSHIYOMI__.getState());
  await page.mouse.move(80, 600);
  await page.mouse.down();
  await page.mouse.move(300, 500, { steps: 12 });
  await page.mouse.up();
  await sleep(250);
  const afterMove = await page.evaluate(() => window.__HOSHIYOMI__.getState());
  if (Math.abs(afterMove.player.x - before.player.x) < 8) {
    throw new Error("player did not move");
  }
  ok("マウス移動で自機が追従");

  const muted0 = await page.evaluate(() => window.__HOSHIYOMI__.getState().muted);
  await page.click("#mute");
  const muted1 = await page.evaluate(() => window.__HOSHIYOMI__.getState().muted);
  if (muted0 === muted1) throw new Error("mute did not toggle");
  ok("ミュート切替");

  await page.evaluate(() => {
    window.__HOSHIYOMI__.setLives(1);
    window.__HOSHIYOMI__.forceHit();
  });
  const over = await waitForState(page, (s) => s.screen === "gameover", "gameover");
  if (over.lives !== 0) throw new Error("lives after over=" + over.lives);
  const overText = await page.$eval("h1", (el) => el.textContent);
  if (overText !== "ゲームオーバー") throw new Error("h1=" + overText);
  ok("被弾で残機ゼロ→ゲームオーバー");
  await shot(page, "game_over_screen.png");

  await page.click("#retry");
  await waitForState(page, (s) => s.screen === "playing" && s.lives === 3, "retry");
  ok("リトライで再開");

  await page.evaluate(() => window.__HOSHIYOMI__.killBoss());
  const cleared = await waitForState(page, (s) => s.screen === "clear", "clear");
  if (cleared.score < 12000) throw new Error("clear score=" + cleared.score);
  const clearText = await page.$eval("h1", (el) => el.textContent);
  if (clearText !== "クリア") throw new Error("h1=" + clearText);
  ok("ボス撃破でクリア・スコア表示");
  await shot(page, "clear_screen.png");

  await page.click("#retry");
  await waitForState(page, (s) => s.screen === "playing", "retry2");
  await page.evaluate(() => window.__HOSHIYOMI__.skipToBoss());
  const boss = await waitForState(page, (s) => s.boss && s.boss.hp > 0, "boss", 4000);
  if (boss.boss.phase < 1) throw new Error("no boss phase");
  ok("ボス出現");
  await sleep(700);
  await shot(page, "boss_fight.png");

  // デスクトップ相当の広いビューポートでも描画される
  await page.setViewport({ width: 900, height: 700, deviceScaleFactor: 1 });
  await sleep(200);
  const desk = await page.evaluate(() => window.__HOSHIYOMI__.getState());
  if (desk.W < 800) throw new Error("desktop width=" + desk.W);
  ok("デスクトップ幅でもキャンバスが追従");
  await shot(page, "playing_desktop.png");

  console.log("\nE2E done");
} catch (err) {
  fail("e2e", err);
  try {
    const pages = await browser.pages();
    if (pages[0]) await shot(pages[0], "e2e_failure.png");
  } catch (e) {}
} finally {
  await browser.close();
}

if (failed) {
  console.log("FAILED");
  process.exit(1);
}
console.log("ALL E2E PASSED");
