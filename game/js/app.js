(function () {
  "use strict";

  var E = window.NeuroEngine;
  var BANK = window.NeuroBank.QUESTIONS;
  var STAGES = window.NeuroBank.STAGES;
  var AudioFx = window.NeuroAudio;

  var state = {
    mode: "stage",
    stageIndex: 0,
    quiz: [],
    index: 0,
    correct: 0,
    combo: 0,
    lastOk: false,
    locked: false,
    picks: [],
    progress: E.loadProgress(localStorage, STAGES.length),
  };

  function $(id) {
    return document.getElementById(id);
  }

  function show(name) {
    document.querySelectorAll(".screen").forEach(function (el) {
      el.classList.toggle("active", el.id === "screen-" + name);
    });
    window.scrollTo(0, 0);
  }

  function vibrate(ms) {
    if (navigator.vibrate) navigator.vibrate(ms);
  }

  function starsText(n) {
    return "★★★".slice(0, n) + "☆☆☆".slice(n, 3);
  }

  function evoClass() {
    return "evo-" + E.evolutionLevel(state.progress, STAGES.length);
  }

  function evoName() {
    var lv = E.evolutionLevel(state.progress, STAGES.length);
    return ["たまごニューロ", "ひよこニューロ", "シナプスニューロ", "ネットニューロ", "ジェネラリスト"][lv];
  }

  function persist() {
    E.saveProgress(localStorage, state.progress);
  }

  function burst(ok) {
    var c = $("confetti");
    var ctx = c.getContext("2d");
    c.width = c.clientWidth;
    c.height = c.clientHeight;
    var bits = [];
    for (var i = 0; i < 28; i++) {
      bits.push({
        x: c.width / 2,
        y: c.height * 0.28,
        vx: (Math.random() - 0.5) * 8,
        vy: Math.random() * -7 - 2,
        r: Math.random() * 4 + 2,
        color: ok ? ["#7ee8c4", "#ffb86b", "#8ab4ff"][i % 3] : "#fb7185",
      });
    }
    var t = 0;
    (function frame() {
      ctx.clearRect(0, 0, c.width, c.height);
      bits.forEach(function (b) {
        b.x += b.vx;
        b.y += b.vy;
        b.vy += 0.22;
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
      });
      t += 1;
      if (t < 36) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, c.width, c.height);
    })();
  }

  function renderHome() {
    $("home-evo").className = "blob " + evoClass();
    $("home-name").textContent = evoName();
    var cleared = 0;
    STAGES.forEach(function (_, i) {
      if ((state.progress.stars[i] || 0) > 0) cleared += 1;
    });
    $("home-stats").innerHTML =
      '<div class="stat"><b>' +
      cleared +
      "/" +
      STAGES.length +
      "</b>ステージ</div>" +
      '<div class="stat"><b>' +
      Math.round((state.progress.examBest || 0) * 100) +
      "%</b>模擬ベスト</div>";

    var list = $("stage-list");
    list.innerHTML = "";
    STAGES.forEach(function (stage, i) {
      var open = E.isStageOpen(state.progress, i);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "stage" + (open ? "" : " locked");
      btn.disabled = !open;
      var best = Math.round((state.progress.best[i] || 0) * 100);
      btn.innerHTML =
        '<div class="ico">' +
        stage.icon +
        '</div><div><div class="ttl">' +
        (i + 1) +
        ". " +
        stage.title +
        '</div><div class="meta">' +
        stage.field +
        (best ? " ・最高" + best + "%" : "") +
        '</div></div><div class="stars">' +
        (open ? starsText(state.progress.stars[i] || 0) : "🔒") +
        "</div>";
      btn.addEventListener("click", function () {
        startStage(i);
      });
      list.appendChild(btn);
    });
  }

  function resetRun(quiz) {
    state.quiz = quiz;
    state.index = 0;
    state.correct = 0;
    state.combo = 0;
    state.locked = false;
    state.picks = [];
  }

  function startStage(i) {
    AudioFx.tap(state.progress.mute);
    state.mode = "stage";
    state.stageIndex = i;
    resetRun(E.buildStageQuiz(BANK, STAGES[i]));
    var s = STAGES[i];
    $("intro-icon").textContent = s.icon;
    $("intro-title").textContent = s.title;
    $("intro-field").textContent = s.field;
    $("intro-blurb").textContent = s.blurb + " ボスは「" + s.boss + "」。";
    $("intro-count").textContent = state.quiz.length + "問 / 制限時間なし";
    show("intro");
  }

  function startDaily() {
    AudioFx.tap(state.progress.mute);
    state.mode = "daily";
    resetRun(E.buildDailyQuiz(BANK));
    $("intro-icon").textContent = "☀️";
    $("intro-title").textContent = "今日の5問";
    $("intro-field").textContent = "全分野からランダム";
    $("intro-blurb").textContent = "スキマ時間用のミニ冒険。日付で問題が変わるよ。";
    $("intro-count").textContent = state.quiz.length + "問 / 制限時間なし";
    show("intro");
  }

  function beginExam() {
    state.mode = "exam";
    resetRun(E.buildExamQuiz(BANK, STAGES));
    renderQuiz();
    show("quiz");
  }

  function currentQ() {
    return state.quiz[state.index];
  }

  function renderQuiz() {
    var q = currentQ();
    var total = state.quiz.length;
    var label =
      state.mode === "exam" ? "短縮模擬" : state.mode === "daily" ? "今日の5問" : STAGES[state.stageIndex].title;
    $("q-label").textContent = label + "  " + (state.index + 1) + " / " + total;
    $("q-combo").textContent = state.combo >= 2 ? "連鎖 ×" + state.combo : "";
    $("q-text").textContent = q.question;
    $("q-gauge").style.width = ((state.index / total) * 100).toFixed(1) + "%";
    var box = $("choices");
    box.innerHTML = "";
    q.choices.forEach(function (text, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "choice";
      b.textContent = text;
      b.addEventListener("click", function () {
        answer(i);
      });
      box.appendChild(b);
    });
  }

  function answer(i) {
    if (state.locked) return;
    state.locked = true;
    var q = currentQ();
    var ok = i === q.answer;
    state.picks[state.index] = i;
    state.lastOk = ok;
    E.markSeen(state.progress, q.id);
    if (ok) {
      state.correct += 1;
      state.combo += 1;
      AudioFx.ok(state.progress.mute);
      vibrate(12);
      burst(true);
    } else {
      state.combo = 0;
      E.rememberMiss(state.progress, q);
      AudioFx.ng(state.progress.mute);
      vibrate([20, 40, 20]);
      $("screen-quiz").classList.add("shake");
      setTimeout(function () {
        $("screen-quiz").classList.remove("shake");
      }, 280);
    }
    persist();
    Array.prototype.forEach.call($("choices").children, function (el, idx) {
      if (idx === q.answer) el.classList.add("ok");
      if (idx === i && !ok) el.classList.add("ng");
    });
    setTimeout(function () {
      state.locked = false;
      renderExplain();
      show("explain");
    }, 420);
  }

  function renderExplain() {
    var q = currentQ();
    $("ex-banner").className = "banner " + (state.lastOk ? "ok" : "ng");
    $("ex-banner").textContent = state.lastOk
      ? "正解！ ニューロが輝いた"
      : "惜しい！ 正解は「" + q.choices[q.answer] + "」";
    $("ex-body").textContent = q.explain;
    $("ex-tip").innerHTML = "<b>なるほどポイント</b><br />" + q.tip;
    var stage = STAGES.find(function (s) {
      return s.category === q.category;
    });
    $("ex-tag").textContent = stage ? stage.field : q.category;
    $("ex-next").textContent = state.index + 1 >= state.quiz.length ? "結果を見る" : "次の問題";
  }

  function nextAfterExplain() {
    state.index += 1;
    if (state.index >= state.quiz.length) {
      finishRun();
      return;
    }
    renderQuiz();
    show("quiz");
  }

  function missHtml() {
    var html = "";
    state.quiz.forEach(function (q, idx) {
      if (state.picks[idx] !== q.answer) {
        html +=
          '<div class="miss-item">・' +
          q.question +
          '<br /><span class="tag">正解: ' +
          q.choices[q.answer] +
          "</span></div>";
      }
    });
    return html || '<div class="miss-item">今回のミスなし。すごい。</div>';
  }

  function finishRun() {
    var total = state.quiz.length;
    var rate = E.scoreRate(state.correct, total);
    if (state.mode === "stage") {
      E.applyStageResult(state.progress, state.stageIndex, state.correct, total);
    } else if (state.mode === "exam") {
      E.applyExamResult(state.progress, state.correct, total);
    } else if (state.mode === "daily") {
      var today = E.todayKey();
      if (state.progress.dailyDate !== today || rate > (state.progress.dailyBest || 0)) {
        state.progress.dailyDate = today;
        state.progress.dailyBest = Math.max(state.progress.dailyBest || 0, rate);
      }
    }
    persist();
    AudioFx.clear(state.progress.mute);
    burst(rate >= E.UNLOCK_RATE);

    $("res-score").textContent = state.correct + " / " + total;
    $("res-rate").textContent = Math.round(rate * 100) + "%";
    if (state.mode === "exam") {
      $("res-title").textContent = E.passedPractice(rate) ? "練習目標達成！" : "練習はこれから";
      $("res-comment").textContent = E.examComment(rate);
      $("res-note").textContent =
        "ゲーム内の練習目標は正答率70%。これは本試験の合格基準（非公表）ではありません。本番は約145問・100分です。";
    } else {
      $("res-title").textContent = "冒険の結果";
      $("res-comment").textContent = E.resultComment(rate);
      $("res-note").textContent =
        rate >= E.UNLOCK_RATE
          ? "60%以上で次のステージが開きます。"
          : "60%以上で次が開くよ。もう一度挑戦しよう。";
    }
    $("res-miss").innerHTML = missHtml();
    show("result");
  }

  function renderNotebook() {
    var box = $("note-list");
    if (!state.progress.missed.length) {
      box.innerHTML = '<p class="note">まだノートは空。間違えた問題がここに溜まるよ。</p>';
      return;
    }
    box.innerHTML = state.progress.missed
      .map(function (m) {
        return (
          '<div class="card"><div class="ttl">' +
          m.question +
          '</div><div class="note">正解: ' +
          m.answer +
          "<br />" +
          m.tip +
          "</div></div>"
        );
      })
      .join("");
  }

  function goHome() {
    renderHome();
    show("home");
  }

  $("btn-start").addEventListener("click", function () {
    AudioFx.resume();
    AudioFx.tap(state.progress.mute);
    goHome();
  });
  $("btn-about").addEventListener("click", function () {
    show("about");
  });
  $("btn-about-back").addEventListener("click", function () {
    show("title");
  });
  $("btn-mute").addEventListener("click", function () {
    state.progress.mute = !state.progress.mute;
    persist();
    this.textContent = state.progress.mute ? "🔇" : "♪";
  });
  $("btn-home-back").addEventListener("click", function () {
    show("title");
  });
  $("btn-daily").addEventListener("click", startDaily);
  $("btn-exam").addEventListener("click", function () {
    AudioFx.tap(state.progress.mute);
    show("exam-gate");
  });
  $("btn-note").addEventListener("click", function () {
    renderNotebook();
    show("note");
  });
  $("btn-note-back").addEventListener("click", goHome);
  $("btn-intro-back").addEventListener("click", goHome);
  $("btn-intro-go").addEventListener("click", function () {
    renderQuiz();
    show("quiz");
  });
  $("ex-next").addEventListener("click", nextAfterExplain);
  $("btn-res-home").addEventListener("click", goHome);
  $("btn-res-retry").addEventListener("click", function () {
    if (state.mode === "stage") startStage(state.stageIndex);
    else if (state.mode === "daily") startDaily();
    else {
      show("exam-gate");
    }
  });
  $("btn-exam-cancel").addEventListener("click", goHome);
  $("btn-exam-go").addEventListener("click", beginExam);
  $("btn-mute").textContent = state.progress.mute ? "🔇" : "♪";

  var errors = E.validateBank(BANK, STAGES);
  if (errors.length) console.warn("問題バンク検査", errors);
})();
