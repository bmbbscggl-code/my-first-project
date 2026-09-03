/**
 * ニューラルクエスト コアロジック（Node でもテスト可能）
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NeuroEngine = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var STORAGE_KEY = "neuroquest-v1";
  var STAGE_SIZE = 6;
  var EXAM_SIZE = 20;
  var DAILY_SIZE = 5;
  var UNLOCK_RATE = 0.6;
  var PRACTICE_LINE = 0.7;
  var EXAM_PER_CATEGORY = 2;

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashString(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function shuffle(list, rng) {
    var copy = list.slice();
    var rand = rng || Math.random;
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function questionsByCategory(bank, category) {
    return bank.filter(function (q) {
      return q.category === category;
    });
  }

  function pickQuestions(bank, category, count, rng) {
    var pool = questionsByCategory(bank, category);
    if (pool.length < count) {
      throw new Error("カテゴリ " + category + " の問題が不足しています");
    }
    return shuffle(pool, rng).slice(0, count);
  }

  function buildStageQuiz(bank, stage, rng) {
    return pickQuestions(bank, stage.category, STAGE_SIZE, rng);
  }

  function buildExamQuiz(bank, stages, rng) {
    var picked = [];
    var used = {};
    stages.forEach(function (stage) {
      var qs = pickQuestions(bank, stage.category, EXAM_PER_CATEGORY, rng);
      qs.forEach(function (q) {
        used[q.id] = true;
        picked.push(q);
      });
    });
    if (picked.length < EXAM_SIZE) {
      var extras = bank.filter(function (q) {
        return !used[q.id];
      });
      picked = picked.concat(shuffle(extras, rng).slice(0, EXAM_SIZE - picked.length));
    }
    return shuffle(picked, rng).slice(0, EXAM_SIZE);
  }

  function todayKey(date) {
    var d = date || new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function buildDailyQuiz(bank, date, rng) {
    var key = todayKey(date);
    var seeded = rng || mulberry32(hashString("daily:" + key));
    return shuffle(bank, seeded).slice(0, DAILY_SIZE);
  }

  function scoreRate(correct, total) {
    if (!total) return 0;
    return correct / total;
  }

  function starCount(rate) {
    if (rate >= 1) return 3;
    if (rate >= 0.8) return 3;
    if (rate >= UNLOCK_RATE) return 2;
    if (rate > 0) return 1;
    return 0;
  }

  function resultComment(rate) {
    if (rate >= 0.9) return "完璧！このステージはマスターに近い";
    if (rate >= UNLOCK_RATE) return "いい感じ！苦手なとこをもう一度見てみよう";
    return "もう一回チャレンジで確実に定着！";
  }

  function examComment(rate) {
    if (rate >= 0.9) return "練習目標を大きく上回った。自信を持って次の分野へ";
    if (rate >= PRACTICE_LINE) return "練習目標ライン到達。弱点分野を地図で埋めよう";
    return "練習目標までもう少し。解説ノートで復習しよう";
  }

  function passedPractice(rate) {
    return rate >= PRACTICE_LINE;
  }

  function unlockedNext(rate) {
    return rate >= UNLOCK_RATE;
  }

  function defaultProgress(stageCount) {
    var stars = [];
    var best = [];
    for (var i = 0; i < stageCount; i++) {
      stars.push(0);
      best.push(0);
    }
    return {
      version: 1,
      stars: stars,
      best: best,
      cleared: 0,
      examBest: 0,
      examCount: 0,
      examPassed: false,
      missed: [],
      seen: {},
      mute: false,
      dailyDate: "",
      dailyBest: 0,
    };
  }

  function normalizeProgress(raw, stageCount) {
    var base = defaultProgress(stageCount);
    if (!raw || typeof raw !== "object") return base;
    base.stars = Array.isArray(raw.stars) ? raw.stars.slice(0, stageCount) : base.stars;
    base.best = Array.isArray(raw.best) ? raw.best.slice(0, stageCount) : base.best;
    while (base.stars.length < stageCount) base.stars.push(0);
    while (base.best.length < stageCount) base.best.push(0);
    base.cleared = Number(raw.cleared) || 0;
    base.examBest = Number(raw.examBest) || 0;
    base.examCount = Number(raw.examCount) || 0;
    base.examPassed = !!raw.examPassed;
    base.missed = Array.isArray(raw.missed) ? raw.missed.slice(0, 40) : [];
    base.seen = raw.seen && typeof raw.seen === "object" ? raw.seen : {};
    base.mute = !!raw.mute;
    base.dailyDate = typeof raw.dailyDate === "string" ? raw.dailyDate : "";
    base.dailyBest = Number(raw.dailyBest) || 0;
    return base;
  }

  function isStageOpen(progress, index) {
    if (index <= 0) return true;
    return progress.stars[index - 1] > 0 || progress.best[index - 1] >= UNLOCK_RATE;
  }

  function applyStageResult(progress, index, correct, total) {
    var rate = scoreRate(correct, total);
    var stars = starCount(rate);
    if (stars > (progress.stars[index] || 0)) progress.stars[index] = stars;
    if (rate > (progress.best[index] || 0)) progress.best[index] = rate;
    if (unlockedNext(rate)) {
      progress.cleared = Math.max(progress.cleared, index + 1);
    }
    return progress;
  }

  function applyExamResult(progress, correct, total) {
    var rate = scoreRate(correct, total);
    progress.examCount += 1;
    if (rate > progress.examBest) progress.examBest = rate;
    if (passedPractice(rate)) progress.examPassed = true;
    return progress;
  }

  function rememberMiss(progress, question) {
    var next = {
      id: question.id,
      category: question.category,
      question: question.question,
      answer: question.choices[question.answer],
      tip: question.tip,
    };
    progress.missed = progress.missed.filter(function (m) {
      return m.id !== question.id;
    });
    progress.missed.unshift(next);
    if (progress.missed.length > 40) progress.missed.length = 40;
    return progress;
  }

  function markSeen(progress, id) {
    progress.seen[id] = true;
    return progress;
  }

  function evolutionLevel(progress, stageCount) {
    var cleared = 0;
    for (var i = 0; i < stageCount; i++) {
      if ((progress.stars[i] || 0) > 0) cleared += 1;
    }
    if (cleared >= stageCount && progress.examPassed) return 4;
    if (cleared >= 8) return 3;
    if (cleared >= 4) return 2;
    if (cleared >= 1) return 1;
    return 0;
  }

  function validateBank(bank, stages) {
    var errors = [];
    var ids = {};
    if (!Array.isArray(bank) || bank.length < stages.length * 6) {
      errors.push("問題数が不足しています");
    }
    bank.forEach(function (q, i) {
      if (!q.id) errors.push("idなし #" + i);
      if (ids[q.id]) errors.push("id重複 " + q.id);
      ids[q.id] = true;
      if (!q.category) errors.push(q.id + ": categoryなし");
      if (!q.question) errors.push(q.id + ": 問題文なし");
      if (!Array.isArray(q.choices) || q.choices.length !== 4) {
        errors.push((q.id || i) + ": 選択肢は4つ必須");
      }
      if (typeof q.answer !== "number" || q.answer < 0 || q.answer > 3) {
        errors.push((q.id || i) + ": answer不正");
      }
      if (!q.explain) errors.push((q.id || i) + ": 解説なし");
      if (!q.tip) errors.push((q.id || i) + ": なるほどポイントなし");
      if (q.choices) {
        var uniq = {};
        q.choices.forEach(function (c) {
          if (uniq[c]) errors.push(q.id + ": 選択肢重複");
          uniq[c] = true;
        });
      }
    });
    stages.forEach(function (stage) {
      var n = questionsByCategory(bank, stage.category).length;
      if (n < 6) errors.push(stage.category + " が6問未満 (" + n + ")");
    });
    return errors;
  }

  function loadProgress(storage, stageCount) {
    try {
      var raw = storage && storage.getItem(STORAGE_KEY);
      return normalizeProgress(raw ? JSON.parse(raw) : null, stageCount);
    } catch (e) {
      return defaultProgress(stageCount);
    }
  }

  function saveProgress(storage, progress) {
    if (!storage) return;
    storage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    STAGE_SIZE: STAGE_SIZE,
    EXAM_SIZE: EXAM_SIZE,
    DAILY_SIZE: DAILY_SIZE,
    UNLOCK_RATE: UNLOCK_RATE,
    PRACTICE_LINE: PRACTICE_LINE,
    mulberry32: mulberry32,
    shuffle: shuffle,
    questionsByCategory: questionsByCategory,
    pickQuestions: pickQuestions,
    buildStageQuiz: buildStageQuiz,
    buildExamQuiz: buildExamQuiz,
    buildDailyQuiz: buildDailyQuiz,
    todayKey: todayKey,
    scoreRate: scoreRate,
    starCount: starCount,
    resultComment: resultComment,
    examComment: examComment,
    passedPractice: passedPractice,
    unlockedNext: unlockedNext,
    defaultProgress: defaultProgress,
    normalizeProgress: normalizeProgress,
    isStageOpen: isStageOpen,
    applyStageResult: applyStageResult,
    applyExamResult: applyExamResult,
    rememberMiss: rememberMiss,
    markSeen: markSeen,
    evolutionLevel: evolutionLevel,
    validateBank: validateBank,
    loadProgress: loadProgress,
    saveProgress: saveProgress,
  };
});
