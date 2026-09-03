const assert = require("assert");
const E = require("../js/engine.js");
const bankMod = require("../js/questions.js");

const BANK = bankMod.QUESTIONS;
const STAGES = bankMod.STAGES;
const rng = E.mulberry32(12345);

function test(name, fn) {
  fn();
  console.log("ok  " + name);
}

test("問題バンクが検査を通る", () => {
  const errors = E.validateBank(BANK, STAGES);
  assert.deepStrictEqual(errors, []);
  assert.strictEqual(STAGES.length, 10);
  assert.ok(BANK.length >= 80);
});

test("各カテゴリ8問・選択肢4・正解インデックス妥当", () => {
  STAGES.forEach((s) => {
    const qs = E.questionsByCategory(BANK, s.category);
    assert.strictEqual(qs.length, 8, s.category);
  });
  BANK.forEach((q) => {
    assert.strictEqual(q.choices.length, 4, q.id);
    assert.ok(q.answer >= 0 && q.answer <= 3, q.id);
    assert.ok(q.question.length >= 8, q.id);
    assert.ok(q.explain.length >= 20, q.id);
    assert.ok(q.tip.length >= 4, q.id);
  });
});

test("idがすべてユニーク", () => {
  const ids = BANK.map((q) => q.id);
  assert.strictEqual(new Set(ids).size, ids.length);
});

test("shuffleは元配列を壊さない", () => {
  const src = [1, 2, 3, 4, 5];
  const out = E.shuffle(src, rng);
  assert.deepStrictEqual(src, [1, 2, 3, 4, 5]);
  assert.strictEqual(out.length, 5);
  assert.deepStrictEqual(out.slice().sort(), src.slice().sort());
});

test("ステージクイズは6問で同一カテゴリ", () => {
  const quiz = E.buildStageQuiz(BANK, STAGES[0], rng);
  assert.strictEqual(quiz.length, E.STAGE_SIZE);
  quiz.forEach((q) => assert.strictEqual(q.category, "ai"));
});

test("模擬は20問・10分野を含む", () => {
  const quiz = E.buildExamQuiz(BANK, STAGES, rng);
  assert.strictEqual(quiz.length, E.EXAM_SIZE);
  const cats = new Set(quiz.map((q) => q.category));
  assert.strictEqual(cats.size, 10);
  const ids = quiz.map((q) => q.id);
  assert.strictEqual(new Set(ids).size, ids.length);
});

test("今日の5問は日付シードで再現する", () => {
  const d = new Date("2026-09-03T00:00:00Z");
  const a = E.buildDailyQuiz(BANK, d);
  const b = E.buildDailyQuiz(BANK, d);
  assert.deepStrictEqual(
    a.map((q) => q.id),
    b.map((q) => q.id)
  );
  assert.strictEqual(a.length, 5);
});

test("星とコメント、解放判定", () => {
  assert.strictEqual(E.starCount(1), 3);
  assert.strictEqual(E.starCount(0.8), 3);
  assert.strictEqual(E.starCount(0.6), 2);
  assert.strictEqual(E.starCount(0.3), 1);
  assert.strictEqual(E.starCount(0), 0);
  assert.ok(E.unlockedNext(0.6));
  assert.ok(!E.unlockedNext(0.59));
  assert.ok(E.passedPractice(0.7));
  assert.ok(!E.passedPractice(0.69));
  assert.match(E.resultComment(0.95), /完璧/);
  assert.match(E.examComment(0.5), /もう少し/);
});

test("進捗の適用と解放", () => {
  const p = E.defaultProgress(10);
  assert.ok(E.isStageOpen(p, 0));
  assert.ok(!E.isStageOpen(p, 1));
  E.applyStageResult(p, 0, 4, 6);
  assert.ok(E.isStageOpen(p, 1));
  assert.strictEqual(p.stars[0], 2);
  E.applyExamResult(p, 14, 20);
  assert.ok(p.examPassed);
  assert.strictEqual(p.examCount, 1);
});

test("まちがいノートは先頭追加・重複除去", () => {
  const p = E.defaultProgress(10);
  const q = BANK[0];
  E.rememberMiss(p, q);
  E.rememberMiss(p, q);
  assert.strictEqual(p.missed.length, 1);
  assert.strictEqual(p.missed[0].id, q.id);
});

test("進化段階", () => {
  const p = E.defaultProgress(10);
  assert.strictEqual(E.evolutionLevel(p, 10), 0);
  p.stars[0] = 1;
  assert.strictEqual(E.evolutionLevel(p, 10), 1);
  for (let i = 0; i < 8; i++) p.stars[i] = 1;
  assert.strictEqual(E.evolutionLevel(p, 10), 3);
  for (let i = 0; i < 10; i++) p.stars[i] = 1;
  p.examPassed = true;
  assert.strictEqual(E.evolutionLevel(p, 10), 4);
});

test("localStorage風の保存", () => {
  const mem = {
    data: {},
    getItem(k) {
      return this.data[k] || null;
    },
    setItem(k, v) {
      this.data[k] = v;
    },
  };
  const p = E.defaultProgress(10);
  p.stars[0] = 3;
  E.saveProgress(mem, p);
  const loaded = E.loadProgress(mem, 10);
  assert.strictEqual(loaded.stars[0], 3);
});

console.log("\n全テスト成功");
