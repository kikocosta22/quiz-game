// public/js/presentation.js
const socket = io();
const params = new URLSearchParams(window.location.search);
let code = params.get("code");

if (!code) {
  const manual = window.prompt("Introduz o código do jogo:");
  if (manual) {
    code = manual.trim().toUpperCase();
    const url = new URL(window.location.href);
    url.searchParams.set("code", code);
    history.replaceState(null, "", url.toString());
  }
}

if (!code) {
  alert("Sem código de jogo. Abre o link da apresentação gerado pelo host.");
}

// DOM
const questionContainer = document.getElementById("question-container");
const answersCountDiv = document.getElementById("answers-count");
const explanationDiv = document.getElementById("explanation");
const betweenQuestionsDiv = document.getElementById("between-questions");
const leaderboardDiv = document.getElementById("leaderboard");
const answersProgressDiv = document.getElementById("answers-progress");
const powerLogDiv = document.getElementById("power-log");




const timerBarWrapper = document.getElementById("timerBarWrapper");
const timerBarInner   = document.getElementById("timerBarInner");
const timerLabel      = document.getElementById("timerLabel");
const timerBarOuter   = document.getElementById("timerBarOuter");


// estado
let teamsById = {};
let lastKnownTeams = [];  
let lastAnsweredTeamIds = [];
let currentPhase = "idle"; // idle | question | answers | results | between
let lastResults = null;
let lastQuestionType = null;
let answerTimer = null;
let answerTimeTotal = 0;
let answerTimeLeft = 0;
let lastQuestionTimeLimit = 60; // default em segundos
let lastBlockedTeamIds = [];
let totalQuestions = 60; // default; será atualizado

function clearAnswerTimer() {
  if (answerTimer) {
    clearInterval(answerTimer);
    answerTimer = null;
  }
  if (timerBarWrapper) timerBarWrapper.style.display = "none";
  if (timerBarOuter) {
    timerBarOuter.classList.remove("panic");
    timerBarOuter.classList.remove("done");
  }
}

function updateTimerUI() {
  if (!timerBarWrapper || !timerBarInner || !timerLabel) return;

  timerBarWrapper.style.display = "block";
  const ratio = answerTimeTotal > 0 ? Math.max(answerTimeLeft / answerTimeTotal, 0) : 0;

  // encolher a barra
timerBarInner.style.transform = `scaleY(${ratio})`;

  // “pânico” nos últimos 3s
  if (answerTimeLeft <= 3 && answerTimeLeft > 0) {
    timerBarOuter?.classList.add("panic");
  } else {
    timerBarOuter?.classList.remove("panic");
  }

  timerLabel.textContent = answerTimeLeft > 0
    ? `${answerTimeLeft} seg`
    : "⏰ Tempo!";
}

function startAnswerTimer(seconds, gameCode) {
  clearAnswerTimer();
  if (!seconds || seconds <= 0) return;

  answerTimeTotal = seconds;
  answerTimeLeft = seconds;
  updateTimerUI();

  answerTimer = setInterval(() => {
    answerTimeLeft -= 1;
    if (answerTimeLeft <= 0) {
      answerTimeLeft = 0;
      updateTimerUI();
      clearInterval(answerTimer);
      answerTimer = null;

      // pequeno efeito final
      timerBarOuter?.classList.add("done");

      // fecha respostas como já fazias
      socket.emit("host:forceCloseAnswers", { code: gameCode });
    } else {
      updateTimerUI();
    }
  }, 1000);
}



if (code) {
  console.log("Presentation joining game code:", code);
  socket.emit("joinGame", { code, role: "presentation" });
}

socket.on("joinError", (msg) => {
  console.error("joinError (presentation):", msg);
  alert("Erro ao entrar na apresentação: " + msg);
});

socket.on("presentation:connected", (game) => {
  console.log(
    "Presentation ligado ao jogo",
    game.code,
    "status:",
    game.status,
    "qIndex:",
    game.currentQuestion
  );
});
// Sempre que o servidor emitir a lista de equipas
socket.on("host:teamsUpdated", (teams) => {
  // teams é um array [{id,name,avatar,score?...}]
  lastKnownTeams = Array.isArray(teams) ? teams : [];
  teamsById = {};
  lastKnownTeams.forEach(t => { teamsById[t.id] = t; });
  renderAnswersProgress();
});

// (Opcional) quando a apresentação liga, se o servidor te enviar o estado do jogo
socket.on("presentation:connected", (game) => {
  if (game && Array.isArray(game.teams)) {
    lastKnownTeams = game.teams;
    teamsById = {};
    lastKnownTeams.forEach(t => { teamsById[t.id] = t; });
    renderAnswersProgress();
  }
});


// ---------- MOSTRAR PERGUNTA ----------
socket.on("presentation:showQuestion", ({ index, total, question }) => {
  console.log("presentation:showQuestion -> index:", index, "question:", question);
  
  totalQuestions = total ?? totalQuestions;
  currentPhase = "question";
  lastResults = null;
  lastQuestionType = question?.type || null;

  betweenQuestionsDiv.style.display = "none";
  answersCountDiv.textContent = "";
  explanationDiv.innerHTML = "";
  powerLogDiv.innerHTML = "";
  questionContainer.innerHTML = "";
  lastAnsweredTeamIds = [];

  renderAnswersProgress();

  if (!question) {
    const fallback = document.createElement("div");
    fallback.id = "question-text";
    fallback.textContent = "(sem pergunta)";
    questionContainer.appendChild(fallback);
    return;
  }

  // Texto da pergunta
  const qText = document.createElement("div");
  qText.id = "question-text";
  qText.textContent = question.questionText || "(pergunta sem texto)";
  questionContainer.appendChild(qText);

  // Media da pergunta (se existir)
  const mediaDiv = document.createElement("div");
  mediaDiv.id = "media";

  if (question.questionMedia && question.questionMedia.type !== "none") {
    if (question.questionMedia.type === "image") {
      const img = document.createElement("img");
      img.src = question.questionMedia.url;
      mediaDiv.appendChild(img);
    } else if (question.questionMedia.type === "video") {
  const vid = document.createElement("video");
  vid.src = question.questionMedia.url;
  vid.controls = true;
  vid.autoplay = true;
  vid.muted = true;       // para o autoplay funcionar em browsers
  vid.playsInline = true; // iOS
  mediaDiv.appendChild(vid);
}
  }

  questionContainer.appendChild(mediaDiv);

  // Wrapper para as opções (2 colunas)
  const optionsWrapper = document.createElement("div");
  optionsWrapper.id = "optionsWrapper";
  questionContainer.appendChild(optionsWrapper);

  lastQuestionTimeLimit = question?.answerTimeSeconds || 60;
clearAnswerTimer();


});

// ---------- MOSTRAR RESPOSTAS ----------
socket.on("presentation:showAnswers", ({ index, type, options }) => {
  console.log("presentation:showAnswers", index, type, options);
  currentPhase = "answers";
startAnswerTimer(lastQuestionTimeLimit, code);
  const optionsWrapper =
    document.getElementById("optionsWrapper") ||
    (() => {
      const ow = document.createElement("div");
      ow.id = "optionsWrapper";
      questionContainer.appendChild(ow);
      return ow;
    })();

  optionsWrapper.innerHTML = "";

  if (type === "single") {
    (options || []).forEach((opt, i) => {
      const o = document.createElement("div");
      o.className = "option option-" + i;

      if (opt.type === "text") {
        o.textContent = opt.value;
      } else if (opt.type === "image") {
        const img = document.createElement("img");
        img.src = opt.value;
        o.appendChild(img);
      } else if (opt.type === "video") {
  const vid = document.createElement("video");
  vid.src = opt.value;
  vid.controls = true;
  vid.autoplay = true;
  vid.muted = true;
  vid.playsInline = true;
  o.appendChild(vid);
}

      optionsWrapper.appendChild(o);
    });
  }

  if (type === "approximation") {
    const t = document.createElement("div");
    t.className = "option";
    t.textContent = "Escreve o teu palpite no telemóvel...";
    optionsWrapper.appendChild(t);
  }

  lastQuestionType = type;
});

// ---------- CONTAGEM / PROGRESSO ----------
socket.on("presentation:updateAnswers", ({ count }) => {
 // answersCountDiv.textContent = `Jogadas registadas: ${count}`;
});



socket.on("presentation:answersProgress", ({ answeredTeamIds, blockedTeamIds }) => {
  lastAnsweredTeamIds = answeredTeamIds || [];
  lastBlockedTeamIds = blockedTeamIds || [];
  renderAnswersProgress();
});

// ---------- REVELAR RESULTADOS + LOG + EXPLICAÇÃO ----------
socket.on(
  "presentation:revealResults",
  ({ type, correctIndex, correctNumber, results, explanation, powerLog }) => {
    console.log(
      "presentation:revealResults",
      type,
      correctIndex,
      correctNumber,
      results,
      powerLog
    );
    currentPhase = "results";
    lastResults = results || {};
    lastQuestionType = type;
    clearAnswerTimer();
    // marcar resposta correta
    if (type === "single" && typeof correctIndex === "number") {
      const el = document.querySelector(".option-" + correctIndex);
      if (el) el.classList.add("correct");
    }

    if (type === "approximation" && typeof correctNumber === "number") {
      const div = document.createElement("div");
      div.style.marginTop = "20px";
      div.style.fontSize = "1.5rem";
      div.textContent = `Resposta correta: ${correctNumber}`;
      questionContainer.appendChild(div);
    }

    // EXPLICAÇÃO: se for imagem/vídeo, substitui a media; se for texto, fica em #explanation
    explanationDiv.innerHTML = "";
    const mediaDiv = document.getElementById("media");

    if (explanation) {
      // formato antigo: string simples -> texto
      if (typeof explanation === "string") {
        explanationDiv.textContent = explanation;
      } else if (explanation.type === "text") {
        explanationDiv.textContent = explanation.value;
      } else if (explanation.type === "image") {
        if (mediaDiv) {
          mediaDiv.innerHTML = "";
          const img = document.createElement("img");
          img.src = explanation.value;
          mediaDiv.appendChild(img);
        }
      } else if (explanation.type === "video") {
        if (mediaDiv) {
          mediaDiv.innerHTML = "";
          const vid = document.createElement("video");
           vid.controls = true;
          vid.autoplay = true;
          vid.muted = true;
          vid.playsInline = true;
          vid.src = explanation.value;
          vid.controls = true;
          mediaDiv.appendChild(vid);
        }
      }
    }

    // LOG DE PODERES
    powerLogDiv.innerHTML = "";
    if (powerLog) {
      const { steals = [], blocks = [] } = powerLog;

      if (steals.length || blocks.length) {
        const title = document.createElement("div");
        title.style.marginTop = "10px";
        title.style.fontSize = "1.3rem";
        title.style.fontWeight = "400";
        title.textContent = "Poderes usados:";
        powerLogDiv.appendChild(title);
      }

      steals.forEach((s) => {
        const line = document.createElement("div");
        line.style.fontSize = "1.2rem";
          line.style.fontWeight = "300";
        line.textContent = `🕵️ ${s.fromTeamName} roubou a resposta de ${s.toTeamName}`;
        powerLogDiv.appendChild(line);
      });

      blocks.forEach((b) => {
        const line = document.createElement("div");
        line.style.fontSize = "1.2rem";
        line.style.fontWeight = "300";
        line.textContent = `⛔ ${b.fromTeamName} bloqueou ${b.toTeamName}`;
        powerLogDiv.appendChild(line);
      });
    }

    renderAnswersProgress();
  }
);

// ---------- ECRÃ ENTRE PERGUNTAS ----------
socket.on("presentation:nextScreen", ({ nextIndex, total }) => {
  clearAnswerTimer();
  currentPhase = "between";
  if (typeof total === "number") totalQuestions = total;

  questionContainer.innerHTML = "";
  answersCountDiv.textContent = "";
  explanationDiv.innerHTML = "";
  powerLogDiv.innerHTML = "";
  lastAnsweredTeamIds = [];

  const n = (nextIndex ?? 0) + 1; // transformar 0-based em 1-based
  betweenQuestionsDiv.innerHTML = `
    <div class="round-banner">
      RONDA ${n}/${totalQuestions}
      
    </div>
  `;
  betweenQuestionsDiv.style.display = "block";

  renderAnswersProgress();
});
// ---------- RANKING ----------
socket.on("game:scoreUpdate", ({ leaderboard }) => {
  if (!leaderboardDiv) return;

  leaderboardDiv.innerHTML = "";

  teamsById = {};
  leaderboard.forEach((t) => {
    teamsById[t.id] = t;
  });

  leaderboard.forEach((team, idx) => {
    const row = document.createElement("div");
    row.className = "lb-row";

    const left = document.createElement("div");
    left.className = "lb-left";

    const rank = document.createElement("div");
    rank.className = "lb-rank";
    rank.textContent = idx + 1;

    const avatar = document.createElement("img");
    avatar.className = "lb-avatar";
    if (team.avatar && team.avatar.startsWith("data:image")) {
      avatar.src = team.avatar;
    } else {
      avatar.style.opacity = 0.3;
    }

    const name = document.createElement("div");
    name.className = "lb-name";
    name.textContent = team.name;

    left.appendChild(rank);
    left.appendChild(avatar);
    left.appendChild(name);

    const score = document.createElement("div");
    score.className = "lb-score";
    score.textContent = team.score ?? 0;

    row.appendChild(left);
    row.appendChild(score);
    leaderboardDiv.appendChild(row);
  });

  renderAnswersProgress();
});

socket.on("host:forceCloseAnswers", ({ code }) => {
  const game = games[code];
  if (!game) return;

  game.phase = "locked";
  io.to(code).emit("team:lockAnswers");
});

// ---------- helpers ----------
function renderAnswersProgress() {
  if (!answersProgressDiv) return;
  answersProgressDiv.innerHTML = "";

 // tentar usar teamsById; se estiver vazio, usa o snapshot lastKnownTeams
  let teams = Object.values(teamsById || {});
  if (!teams.length && lastKnownTeams.length) {
    teams = lastKnownTeams.slice();
  }
  if (!teams.length) return;

  const answeredSet = new Set(lastAnsweredTeamIds || []);
  const blockedSet  = new Set(lastBlockedTeamIds || []);

  teams.forEach((team) => {
    const div = document.createElement("div");
    div.className = "ap-team";

    const isAnswered = answeredSet.has(team.id);
    const isBlocked  = blockedSet.has(team.id);

    if (currentPhase === "results" && lastResults) {
       const r = lastResults[team.id] || null;  // <<< ADICIONA ISTO
      if (r && r.blocked) {
  div.classList.remove("pending","answered","correct");
  div.classList.add("wrong");
} else if (r && (r.correct || r.correctViaSteal || r.winner || r.winnerViaSteal)) {
  // verde
  div.classList.remove("pending","answered","wrong");
  div.classList.add("correct");
} else if (isAnswered || isBlocked) {
  // quem respondeu ou foi bloqueado mas não ganhou → vermelho
  div.classList.remove("pending","answered");
  div.classList.add("wrong");
} else {
  div.classList.add("pending");
}
    } else {
      // Durante pergunta/respostas/locked
      if (isBlocked) {
        div.classList.add("blocked");
      } else if (isAnswered) {
        div.classList.add("answered");
      } else {
        div.classList.add("pending");
      }
    }

    const avatar = document.createElement("img");
    avatar.className = "ap-avatar";
    if (team.avatar && team.avatar.startsWith("data:image")) {
      avatar.src = team.avatar;
    } else {
      avatar.style.opacity = 0.3;
    }

    const name = document.createElement("div");
    name.textContent = team.name;

    div.appendChild(avatar);
    div.appendChild(name);
    answersProgressDiv.appendChild(div);
  });
}

