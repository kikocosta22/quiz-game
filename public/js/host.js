// public/js/host.js
const socket = io();

const params = new URLSearchParams(window.location.search);
let code = params.get("code") || null;

const createGameBtn = document.getElementById("createGameBtn");
const startGameBtn = document.getElementById("startGameBtn");
const showQuestionBtn = document.getElementById("showQuestionBtn");
const showAnswersBtn = document.getElementById("showAnswersBtn");
const closeAnswersBtn = document.getElementById("closeAnswersBtn");
const revealAnswerBtn = document.getElementById("revealAnswerBtn");
const nextQuestionBtn = document.getElementById("nextQuestionBtn");

const gameCodeDisplay = document.getElementById("gameCodeDisplay");
const linksDiv = document.getElementById("links");
const teamsList = document.getElementById("teamsList");
const hostStatus = document.getElementById("hostStatus");

function updateLinks() {
  if (!code) {
    linksDiv.innerHTML = "";
    return;
  }
  const base = `${window.location.origin}`;
  const teamUrl = `${base}/team.html?code=${code}&role=team`;
  const hostUrl = `${base}/host.html?code=${code}&role=host`;
  const presUrl = `${base}/presentation.html?code=${code}&role=presentation`;

  linksDiv.innerHTML = `
    <p><strong>QR Equipas:</strong> <code>${teamUrl}</code></p>
    <p><strong>QR Host:</strong> <code>${hostUrl}</code></p>
    <p><strong>QR Apresentação:</strong> <code>${presUrl}</code></p>
  `;
}

createGameBtn.addEventListener("click", () => {
  socket.emit("host:createGame");
});

startGameBtn.addEventListener("click", () => {
  if (!code) return;
  socket.emit("host:startGame", { code });
});

showQuestionBtn.addEventListener("click", () => {
  if (!code) return;
  socket.emit("host:startQuestion", { code });
});

showAnswersBtn.addEventListener("click", () => {
  if (!code) return;
  socket.emit("host:showAnswers", { code });
});

closeAnswersBtn.addEventListener("click", () => {
  if (!code) return;
  socket.emit("host:forceCloseAnswers", { code });
});

revealAnswerBtn.addEventListener("click", () => {
  if (!code) return;
  socket.emit("host:revealAnswer", { code });
});

nextQuestionBtn.addEventListener("click", () => {
  if (!code) return;
  socket.emit("host:nextQuestion", { code });
});

// auto-join como host se já tiver code na query
if (code) {
  socket.emit("joinGame", { code, role: "host" });
}

socket.on("host:gameCreated", (payload) => {
  code = payload.code;
  gameCodeDisplay.textContent = `Código: ${code}`;
  updateLinks();
  hostStatus.textContent = "Jogo criado. As equipas podem entrar.";
  startGameBtn.disabled = false;
  createGameBtn.disabled = true;

  const url = new URL(window.location.href);
  url.searchParams.set("code", code);
  history.replaceState(null, "", url.toString());
});

socket.on("host:joinedAsHost", (game) => {
  code = game.code;
  gameCodeDisplay.textContent = `Código: ${code}`;
  updateLinks();
  hostStatus.textContent = "Host ligado ao jogo.";
  startGameBtn.disabled = game.status === "lobby" ? false : true;
  showQuestionBtn.disabled = game.status === "started" ? false : true;
});

socket.on("game:started", () => {
  hostStatus.textContent = "Jogo começou. Mostra a primeira pergunta.";
  startGameBtn.disabled = true;
  showQuestionBtn.disabled = false;
});

socket.on("presentation:showQuestion", ({ index }) => {
  hostStatus.textContent = `Pergunta ${index + 1} em jogo.`;
  showQuestionBtn.disabled = true;
  showAnswersBtn.disabled = false;
  closeAnswersBtn.disabled = true;
  revealAnswerBtn.disabled = true;
  nextQuestionBtn.disabled = true;
});

socket.on("presentation:showAnswers", () => {
  hostStatus.textContent = "Respostas visíveis. As equipas podem responder.";
  showAnswersBtn.disabled = true;
  closeAnswersBtn.disabled = false;
});

socket.on("team:lockAnswers", () => {
  hostStatus.textContent = "Respostas fechadas. Podes revelar a resposta.";
  closeAnswersBtn.disabled = true;
  revealAnswerBtn.disabled = false;
});

socket.on("presentation:revealResults", () => {
  hostStatus.textContent = "Resposta revelada. Podes ir para a próxima pergunta.";
  revealAnswerBtn.disabled = true;
  nextQuestionBtn.disabled = false;
});

socket.on("presentation:nextScreen", () => {
  hostStatus.textContent = "Ecrã de transição. Mostra a próxima pergunta quando quiseres.";
  showQuestionBtn.disabled = false;
  showAnswersBtn.disabled = true;
  closeAnswersBtn.disabled = true;
  revealAnswerBtn.disabled = true;
  nextQuestionBtn.disabled = true;
});

socket.on("game:teamsUpdated", (teams) => {
  teamsList.innerHTML = "";
  teams.forEach((t) => {
    const li = document.createElement("li");
    li.className = "team-row";
    const left = document.createElement("div");
    left.className = "team-left";
    const avatar = document.createElement("img");
    avatar.className = "team-avatar";
    if (t.avatar && t.avatar.startsWith("data:image")) {
      avatar.src = t.avatar;
    } else {
      avatar.style.opacity = 0.3;
    }
    const name = document.createElement("div");
    name.className = "team-name";
    name.textContent = t.name;
    left.appendChild(avatar);
    left.appendChild(name);

    const score = document.createElement("div");
    score.className = "team-score";
    score.textContent = `${t.score ?? 0} pts`;

    li.appendChild(left);
    li.appendChild(score);
    teamsList.appendChild(li);
  });
});

socket.on("host:phaseState", ({ phase, index, total }) => {
  // ativa/desativa botões consoante a fase
  // ex.: entre perguntas → só “Começar pergunta”
  // phase === "question" → tens “Mostrar respostas”
  // phase === "answers" → podes “Fechar respostas”
  // phase === "locked" → podes “Revelar resposta”
  // phase === "results" → “Próxima pergunta”
});


socket.on("joinError", (msg) => {
  alert("Erro: " + msg);
});
