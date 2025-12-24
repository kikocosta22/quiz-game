// public/js/team.js
const socket = io();

const params = new URLSearchParams(window.location.search);
const codeFromUrl = params.get("code");
const roleFromUrl = params.get("role") || "team";

const LS_LAST_CODE_KEY = "quiz:lastCode";
const LS_TEAM_ID_PREFIX = "quiz:teamId:"; // + CODE

let gameCode = (codeFromUrl || localStorage.getItem(LS_LAST_CODE_KEY) || "").toUpperCase();
let teamId = gameCode ? (localStorage.getItem(LS_TEAM_ID_PREFIX + gameCode) || null) : null;

let didAutoJoin = false;


// DOM
const joinFormDiv = document.getElementById("joinForm");
const gameCodeInput = document.getElementById("gameCodeInput");
const teamNameInput = document.getElementById("teamNameInput");
const avatarFileInput = document.getElementById("avatarFile");
const avatarPreview = document.getElementById("avatarPreview");
const joinBtn = document.getElementById("joinBtn");

const stateOverlay = document.getElementById("stateOverlay");
const stateOverlayBackdrop = document.getElementById("stateOverlayBackdrop");
const stateOverlayTitle = document.getElementById("stateOverlayTitle");
const stateOverlaySubtitle = document.getElementById("stateOverlaySubtitle");
const teamAreaDiv = document.getElementById("teamArea");
const teamAvatarSmall = document.getElementById("teamAvatarSmall");
const teamHeaderName = document.getElementById("teamHeaderName");
const teamCodeSpan = document.getElementById("teamCode");
const optionsContainer = document.getElementById("optionsContainer");
const statusText = document.getElementById("statusText");
const scoreValue = document.getElementById("scoreValue");
const powerButtons = document.querySelectorAll(".power-btn");
const powersContainer = document.getElementById("powersContainer");



if (powersContainer) {
  powersContainer.style.display = "none"; // escondido ao entrar no jogo
}



// overlay
const overlay = document.getElementById("overlay");
const overlayBackdrop = document.getElementById("overlayBackdrop");
const overlayDialog = document.getElementById("overlayDialog");
const overlayContent = document.getElementById("overlayContent");


const mazeCanvas = document.getElementById("mazeCanvas");
const mazeTip = document.getElementById("mazeTip");
const mazeControls = document.getElementById("mazeControls");

// estado dos poderes
const STEAL_MAX = 2; // nº máximo de vezes que podes roubar no jogo
let powersUsed = {
  steal: 0,      // contador (0, 1, 2)
  fifty: false,
  block: false
};

// estado da pergunta
let answersLocked = false;
let answeredThisQuestion = false;
let currentQuestionType = null;
let isBlockedThisQuestion = false;
let usedStealThisQuestion = false;
let maze = null;
let myPos = null;
let mazeCtx = null;
let isDragging = false;
// lista de equipas conhecida (para seleccionar alvo)
let knownTeams = [];
let currentBlockedTeamIds = [];
let myAvatarSrc = null;

const MAZE_PLAYER_IMG_SRC = "/media/branco.png";
const MAZE_GOAL_IMG_SRC   = "/media/head.png";

const mazePlayerImg = new Image();
mazePlayerImg.src = MAZE_PLAYER_IMG_SRC;

const mazeGoalImg = new Image();
mazeGoalImg.src = MAZE_GOAL_IMG_SRC;



// helpers overlay
function closeOverlay() {
  overlay.style.display = "none";
  overlayContent.innerHTML = "";
}

overlayBackdrop.addEventListener("click", closeOverlay);

function showConfirm(message, onYes, onNo) {
  overlayContent.innerHTML = "";

  const title = document.createElement("h2");
  title.textContent = "Confirmar";

  const p = document.createElement("p");
  p.textContent = message;

  const buttons = document.createElement("div");
  buttons.id = "overlayButtons";

  const yesBtn = document.createElement("button");
  yesBtn.textContent = "Sim";
  yesBtn.addEventListener("click", () => {
    closeOverlay();
    if (onYes) onYes();
  });

  const noBtn = document.createElement("button");
  noBtn.textContent = "Cancelar";
  noBtn.addEventListener("click", () => {
    closeOverlay();
    if (onNo) onNo();
  });

  buttons.appendChild(noBtn);
  buttons.appendChild(yesBtn);

  overlayContent.appendChild(title);
  overlayContent.appendChild(p);
  overlayContent.appendChild(buttons);

  overlay.style.display = "flex";
}
function showStateOverlay(title, subtitle) {
  if (!stateOverlay) return;
  stateOverlayTitle.textContent = title || "";
  stateOverlaySubtitle.textContent = subtitle || "";
  stateOverlay.style.display = "flex";
}
function step(dx, dy) {
  if (!maze || !myPos) return;
  const nx = myPos.x + dx;
  const ny = myPos.y + dy;

  if (canMove(nx, ny)) {
    myPos = { x: nx, y: ny };
    drawMazeTeam();
    sendPos();
    tryFinish();
  }
}

function bindMazeArrows() {
  if (!mazeControls) return;

  const btns = mazeControls.querySelectorAll("[data-dir]");

  const move = (dir) => {
    if (dir === "up") step(0, -1);
    if (dir === "down") step(0, 1);
    if (dir === "left") step(-1, 0);
    if (dir === "right") step(1, 0);
  };

  btns.forEach((btn) => {
    // Mobile (iOS/Android): usar touchstart e bloquear comportamento default (zoom)
    btn.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault(); // <- isto é o que evita o double-tap zoom
        move(btn.dataset.dir);
      },
      { passive: false } // obrigatório para o preventDefault funcionar em mobile
    );

    // Desktop / fallback
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      move(btn.dataset.dir);
    });
  });
}


function hideStateOverlay() {
  if (!stateOverlay) return;
  stateOverlay.style.display = "none";
  stateOverlayTitle.textContent = "";
  stateOverlaySubtitle.textContent = "";
}


function showTeamChooser(titleText, descriptionText, onChoose) {
  overlayContent.innerHTML = "";

  const title = document.createElement("h2");
  title.textContent = titleText;

  const p = document.createElement("p");
  p.textContent = descriptionText;

    const listDiv = document.createElement("div");
  listDiv.id = "overlayList";

  const others = knownTeams.filter((t) => t.id !== teamId);
  if (!others.length) {
    const empty = document.createElement("p");
    empty.textContent = "Não há outras equipas disponíveis.";
    listDiv.appendChild(empty);
  } else {
    others.forEach((t) => {
      const btn = document.createElement("button");
      btn.className = "overlay-team-btn";
      btn.addEventListener("click", () => {
        closeOverlay();
        onChoose(t);
      });

      if (t.avatar && t.avatar.startsWith("data:image")) {
        const img = document.createElement("img");
        img.src = t.avatar;
        btn.appendChild(img);
      }

      // nome da equipa
      const nameSpan = document.createElement("span");
      nameSpan.className = "overlay-team-name";
      nameSpan.textContent = t.name;
      btn.appendChild(nameSpan);

      // se estiver bloqueada nesta pergunta, mostra badge
      if (currentBlockedTeamIds.includes(t.id)) {
        const statusSpan = document.createElement("span");
        statusSpan.className = "overlay-team-status";
        statusSpan.textContent = "BLOQUEADO";
        btn.appendChild(statusSpan);
      }

      listDiv.appendChild(btn);
    });
  }

  const buttons = document.createElement("div");
  buttons.id = "overlayButtons";

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "Cancelar";
  cancelBtn.addEventListener("click", closeOverlay);
  buttons.appendChild(cancelBtn);

  overlayContent.appendChild(title);
  overlayContent.appendChild(p);
  overlayContent.appendChild(listDiv);
  overlayContent.appendChild(buttons);

  overlay.style.display = "flex";
}

function drawMazeTeam() {
  if (!maze || !mazeCtx) return;
  const { grid, cellSize, goal } = maze;

  mazeCtx.clearRect(0, 0, mazeCanvas.width, mazeCanvas.height);

  // background
  mazeCtx.fillStyle = "#0b1020";
  mazeCtx.fillRect(0, 0, mazeCanvas.width, mazeCanvas.height);

  // walls
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[0].length; x++) {
      if (grid[y][x] === 1) {
        mazeCtx.fillStyle = "#334155";
        mazeCtx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
    }
  }

  // goal
  mazeCtx.fillStyle = "#22c55e";
  mazeCtx.fillRect(goal.x*cellSize, goal.y*cellSize, cellSize, cellSize);

  // player dot (you can replace with image later)
  const cx = myPos.x*cellSize + cellSize/2;
  const cy = myPos.y*cellSize + cellSize/2;
  mazeCtx.beginPath();
  mazeCtx.arc(cx, cy, Math.min(12, cellSize*0.4), 0, Math.PI*2);
  mazeCtx.fillStyle = "#facc15";
  mazeCtx.fill();
}



function cellFromTouch(clientX, clientY) {
  const rect = mazeCanvas.getBoundingClientRect();
  const x = Math.floor((clientX - rect.left) / maze.cellSize);
  const y = Math.floor((clientY - rect.top) / maze.cellSize);
  return { x, y };
}

function canMove(x, y) {
  if (!maze) return false;
  if (y < 0 || x < 0 || y >= maze.grid.length || x >= maze.grid[0].length) return false;
  return maze.grid[y][x] === 0;
}

let lastSent = 0;
function sendPos() {
  const now = Date.now();
  if (now - lastSent > 80) {
    socket.emit("team:mazePos", { code: gameCode, teamId, x: myPos.x, y: myPos.y });
    lastSent = now;
  }
}

function tryFinish() {
  if (myPos.x === maze.goal.x && myPos.y === maze.goal.y) {
    socket.emit("team:mazeFinished", { code: gameCode, teamId });
  }
}

function moveTo(clientX, clientY) {
  const { x, y } = cellFromTouch(clientX, clientY);
  if (canMove(x, y)) {
    myPos = { x, y };
    drawMazeTeam();
    sendPos();
    tryFinish();
  }
}

function bindMazeInput() {
  mazeCanvas.ontouchstart = (e) => { isDragging = true; const t=e.touches[0]; moveTo(t.clientX, t.clientY); };
  mazeCanvas.ontouchmove  = (e) => { if (!isDragging) return; const t=e.touches[0]; moveTo(t.clientX, t.clientY); };
  mazeCanvas.ontouchend   = () => { isDragging = false; };

  mazeCanvas.onmousedown  = (e) => { isDragging = true; moveTo(e.clientX, e.clientY); };
  mazeCanvas.onmousemove  = (e) => { if (isDragging) moveTo(e.clientX, e.clientY); };
  window.onmouseup        = () => { isDragging = false; };
}

const bonusMazeArea = document.getElementById("bonusMazeArea");

socket.on("maze:start", ({ grid, cellSize, start, goal }) => {
  if (powersContainer) powersContainer.style.display = "none";
  if (optionsContainer) {
    optionsContainer.innerHTML = "";
    optionsContainer.style.display = "none";
  }

  maze = { grid, cellSize, start, goal };
  myPos = { x: start.x, y: start.y }; // FIX

  mazeCanvas.width = grid[0].length * cellSize;
  mazeCanvas.height = grid.length * cellSize;
  mazeCtx = mazeCanvas.getContext("2d");

  if (bonusMazeArea) bonusMazeArea.style.display = "block";
  mazeCanvas.style.display = "block";
  if (mazeControls) mazeControls.style.display = "block";
  if (mazeTip) mazeTip.style.display = "block";

  bindMazeArrows();
  drawMazeTeam();
  sendPos();
});


socket.on("maze:results", ({ winnerId, ranking }) => {
  // feedback imediato à equipa
  if (teamId && winnerId) {
    if (teamId === winnerId) {
      showStateOverlay("GANHASTE O BÓNUS!", "+20 pontos");
      if (statusText) statusText.textContent = "🏁 Foste o mais rápido no labirinto!";
    } else {
      showStateOverlay("BÓNUS CONCLUÍDO", "Outra equipa chegou primeiro.");
      if (statusText) statusText.textContent = "🏁 Desta vez não foi a tua equipa.";
    }
  }

  maze = null;

  if (mazeCanvas) mazeCanvas.style.display = "none";
  if (mazeControls) mazeControls.style.display = "none";
  if (mazeTip) mazeTip.style.display = "none";
  if (bonusMazeArea) bonusMazeArea.style.display = "none";

  if (optionsContainer) optionsContainer.style.display = "block";
  if (powersContainer) powersContainer.style.display = "flex";

  // opcional: esconder automaticamente o overlay após 2s
  setTimeout(() => hideStateOverlay(), 2000);
});





// pré-preencher código
if (gameCodeInput && gameCode) {
  gameCodeInput.value = gameCode;
}

// preview avatar
if (avatarFileInput) {
  avatarFileInput.addEventListener("change", () => {
    const file = avatarFileInput.files[0];
    if (!file) {
      avatarPreview.style.display = "none";
      avatarPreview.src = "";
      return;
    }
    const MAX_SIZE_BYTES = 6 * 1024 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      alert("A foto é demasiado grande. Escolhe uma imagem até 1MB.");
      avatarFileInput.value = "";
      avatarPreview.style.display = "none";
      avatarPreview.src = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      avatarPreview.src = e.target.result;
      avatarPreview.style.display = "block";
    };
    reader.readAsDataURL(file);
  });
}

// Entrar
if (joinBtn) {
  joinBtn.addEventListener("click", () => {
    const code = (gameCodeInput ? gameCodeInput.value : gameCode).trim().toUpperCase();
    const name = (teamNameInput ? teamNameInput.value.trim() : "") || "Equipa";

    if (!code) {
      alert("Código do jogo em falta.");
      return;
    }

    gameCode = code;
    localStorage.setItem(LS_LAST_CODE_KEY, gameCode);

    const file = avatarFileInput?.files?.[0];
    if (file) {
      const MAX_SIZE_BYTES = 6 * 1024 * 1024;
      if (file.size > MAX_SIZE_BYTES) {
        alert("A foto é demasiado grande. Escolhe uma imagem até 1MB.");
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const avatarDataUrl = e.target.result;
        socket.emit("joinGame", {
          code,
          role: "team",
          name,
          avatar: avatarDataUrl,
          teamId
        });
      };
      reader.readAsDataURL(file);
    } else {
      socket.emit("joinGame", {
        code,
        role: "team",
        name,
        avatar: null,
        teamId
      });
    }
  });
}

socket.on("connect", () => {
  // Recalcular caso o code venha do URL ou do localStorage
  gameCode = (codeFromUrl || localStorage.getItem(LS_LAST_CODE_KEY) || "").toUpperCase();
  if (gameCodeInput && gameCode) gameCodeInput.value = gameCode;

  teamId = gameCode ? (localStorage.getItem(LS_TEAM_ID_PREFIX + gameCode) || sessionStorage.getItem("teamId") || null) : null;

  if (!didAutoJoin && roleFromUrl === "team" && gameCode && teamId) {
    didAutoJoin = true;
    console.log("Auto-join no connect:", teamId, "game:", gameCode);
    socket.emit("joinGame", { code: gameCode, role: "team", teamId });
  }
});


// receber lista de equipas (vindo do server via host:teamsUpdated)
socket.on("game:teamsUpdated", (teams) => {
  console.log("game:teamsUpdated", teams);
  knownTeams = teams || [];
});

// receber lista de equipas bloqueadas na pergunta atual
socket.on("team:blockedTeams", ({ blockedTeamIds }) => {
  currentBlockedTeamIds = blockedTeamIds || [];
});    

socket.on("joinError", (msg) => {
  alert("Erro: " + msg);

  // se a tua sessão guardada ficou inválida (ex: server reiniciou), limpa
  if (msg.includes("não existe") || msg.includes("já começou")) {
    if (gameCode) localStorage.removeItem(LS_TEAM_ID_PREFIX + gameCode);
    sessionStorage.removeItem("teamId");
    teamId = null;
  }
});


socket.on("team:joined", (team) => {
  console.log("team:joined", team);
  teamId = team.id;
  if (gameCode) {
  localStorage.setItem(LS_TEAM_ID_PREFIX + gameCode, teamId);
  localStorage.setItem(LS_LAST_CODE_KEY, gameCode);
}
sessionStorage.setItem("teamId", teamId);

  myAvatarSrc = team.avatar || null;
  myMazeAvatarImg = null;
  if (joinFormDiv) joinFormDiv.style.display = "none";
  if (teamAreaDiv) teamAreaDiv.style.display = "block";

  if (teamHeaderName) teamHeaderName.textContent = team.name;
  if (teamCodeSpan) teamCodeSpan.textContent = `Código: ${gameCode}`;

  if (teamAvatarSmall) {
    if (team.avatar && team.avatar.startsWith("data:image")) {
      teamAvatarSmall.src = team.avatar;
      teamAvatarSmall.style.display = "block";
    } else {
      teamAvatarSmall.style.display = "none";
    }
  }

  if (scoreValue && typeof team.score === "number") {
    scoreValue.textContent = team.score;
  }

  if (team.powers) {
  let stealCount = 0;
  if (typeof team.powers.steal === "number") {
    stealCount = team.powers.steal;
  } else if (team.powers.steal) {
    // jogos antigos em que era boolean → conta como 1 uso
    stealCount = 1;
  }

  powersUsed = {
    steal: stealCount,
    fifty: !!team.powers.fifty,
    block: !!team.powers.block
  };
}

  renderPowers();

  if (statusText) {
    statusText.textContent = "Atento à pergunta na apresentação!";
  }
});

socket.on("team:storeId", (id) => {
  teamId = id;

  // persistente (melhor em mobile)
  if (gameCode) {
    localStorage.setItem(LS_TEAM_ID_PREFIX + gameCode, id);
    localStorage.setItem(LS_LAST_CODE_KEY, gameCode);
  }

  // opcional: manter também sessionStorage
  sessionStorage.setItem("teamId", id);

  console.log("Stored teamId:", id, "for game:", gameCode);
});


function renderPowers() {
  powerButtons.forEach((btn) => {
    const power = btn.dataset.power;
    const stateSpan = btn.querySelector(".state");

    // reset estado base
    btn.classList.remove("used", "disabled-for-type");
    btn.disabled = false;

    if (power === "steal") {
      const usedCount = powersUsed.steal || 0;
      const remaining = STEAL_MAX - usedCount;

      if (usedCount >= STEAL_MAX) {
        btn.classList.add("used");
        btn.disabled = true;
        if (stateSpan) stateSpan.textContent = `Usado (${STEAL_MAX-usedCount}/${STEAL_MAX})`;
      } else {
        if (stateSpan) stateSpan.textContent = `Disponível (${STEAL_MAX-usedCount}/${STEAL_MAX})`;
      }
    } else {
      const used = powersUsed[power];

      if (used) {
        btn.classList.add("used");
        btn.disabled = true;
        if (stateSpan) stateSpan.textContent = "Usado";
      } else {
        if (stateSpan) stateSpan.textContent = "Disponível";
      }

      // em perguntas de aproximação o 50:50 fica bloqueado
      if (currentQuestionType === "approximation" && power === "fifty" && !used) {
        btn.classList.add("disabled-for-type");
        btn.disabled = true;
        if (stateSpan) stateSpan.textContent = "Indisp. nesta pergunta";
      }
    }
  });
}



powerButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!gameCode || !teamId) return;

    const power = btn.dataset.power;

    // 50:50 indisponível em perguntas de aproximação
    if (currentQuestionType === "approximation" && power === "fifty") {
      return;
    }

    if (power === "steal") {
  const usedCount = powersUsed.steal || 0;
  if (usedCount >= STEAL_MAX) {
    if (statusText) {
      statusText.textContent = "Já usaste o poder de roubar duas vezes nesta partida.";
    }
    return;
  }
} else {
  if (powersUsed[power]) {
    if (statusText) statusText.textContent = "Já usaste esse poder nesta partida.";
    return;
  }
}

    if (answersLocked) {
      showStateOverlay("AGUARDA", "Ainda não podes responder.");
      return;
    }


    if (answersLocked && power === "steal") {
      if (statusText) statusText.textContent = "Já jogaste nesta pergunta.";
      return;
    }

    if (power === "fifty") {
      showConfirm(
        "Usar 50:50 nesta pergunta? Só podes usar este poder uma vez!",
        () => {
          socket.emit("team:usePower", {
            code: gameCode,
            teamId,
            power: "fifty"
          });
        }
      );
      return;
    }

    if (power === "block") {
      showTeamChooser(
        "Bloquear equipa",
        "Escolhe a equipa que queres bloquear nesta pergunta.",
        (target) => {
          showConfirm(
            `Tens a certeza que queres bloquear "${target.name}" nesta pergunta?`,
            () => {
              socket.emit("team:usePower", {
                code: gameCode,
                teamId,
                power: "block",
                targetName: target.name
              });
            }
          );
        }
      );
      return;
    }

    if (power === "steal") {
      showTeamChooser(
        "Roubar resposta",
        "Escolhe a equipa de quem queres roubar a resposta (se ela estiver correta).",
        (target) => {
          showConfirm(
            `Tens a certeza que queres roubar a resposta de "${target.name}"?`,
            () => {
              usedStealThisQuestion = true;
              answersLocked = true;
              answeredThisQuestion = true;
              socket.emit("team:usePower", {
                code: gameCode,
                teamId,
                power: "steal",
                targetName: target.name
              });
              if (statusText) {
                statusText.textContent = `🕵️ Vais roubar a resposta de "${target.name}" nesta pergunta.`;
              }
            }
          );
        }
      );
      return;
    }
  });
});

socket.on("team:powerUsed", ({ power, targetTeamName }) => {
  if (power === "steal") {
    powersUsed.steal = (powersUsed.steal || 0) + 1;
  } else {
    powersUsed[power] = true;
  }
  renderPowers();

  if (!statusText) return;

  if (power === "fifty") {
    statusText.textContent = "🎯 50:50 ativo nesta pergunta!";
  } else if (power === "block") {
    statusText.textContent = `⛔ Bloqueaste a equipa "${targetTeamName}" nesta pergunta!`;
  } else if (power === "steal") {
    // quem rouba não pode fazer mais nada nesta pergunta
    usedStealThisQuestion = true;
    answersLocked = true;
    answeredThisQuestion = true;
    const msg = `🕵️ Usaste o poder de roubar. Aguarda o resultado.`;
    statusText.textContent = msg;
    showStateOverlay("JOGADA REGISTADA", msg);
  }
});



socket.on("team:powerError", ({ power, message }) => {
  if (statusText) statusText.textContent = message || "Não foi possível usar este poder.";
});

socket.on("team:applyFifty", ({ remainingIndices }) => {
  powersUsed.fifty = true;
  renderPowers();
  if (!optionsContainer) return;

  const keep = new Set(remainingIndices);
  const btns = optionsContainer.querySelectorAll("button");
  btns.forEach((btn) => {
    const idx = parseInt(btn.dataset.index, 10);
    if (!keep.has(idx)) {
      btn.disabled = true;
      btn.style.opacity = "0.4";
    }
  });
});

// se fores bloqueado
socket.on("team:blockedForQuestion", ({ byTeamName }) => {
  isBlockedThisQuestion = true;
  answersLocked = true;
  answeredThisQuestion = true;

  const msg = byTeamName
    ? `Foste bloqueado nesta pergunta.`
    : "Foste bloqueado nesta pergunta.";

  if (statusText) statusText.textContent = msg;

  showStateOverlay("BLOQUEADO", msg);
});

// se o servidor rejeitar resposta por já ter usado roubar
socket.on("team:answerRejected", ({ reason }) => {
  if (reason === "stealUsed" && statusText) {
    statusText.textContent = "Já usaste o poder de roubar nesta pergunta.";
  }
});

// ===== FLOW =====
socket.on("team:prepareNextQuestion", () => {
  if (powersContainer) powersContainer.style.display = "none"; // ainda não há respostas
  console.log("team:prepareNextQuestion");
  hideStateOverlay();
  answersLocked = false;
  answeredThisQuestion = false;
  currentQuestionType = null;
  isBlockedThisQuestion = false;
  usedStealThisQuestion = false;
  
  if (optionsContainer) optionsContainer.innerHTML = "";
  if (statusText) statusText.textContent = "A aguardar nova pergunta…";
});

// mostrar opções
socket.on("team:showOptions", ({ index, type, options }) => {
   if (powersContainer) powersContainer.style.display = "flex"; // agora aparecem
  console.log("team:showOptions", index, type, options);
  if (!teamAreaDiv) return;

  if (optionsContainer) optionsContainer.innerHTML = "";
  if (!isBlockedThisQuestion) {
    statusText.textContent = " Responde agora!";
  }
  currentQuestionType = type;
  renderPowers();

  if (type === "single") {
    options.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.dataset.index = i;
      if (opt.type === "text") {
        btn.textContent = opt.value;
      } else if (opt.type === "image") {
        const img = document.createElement("img");
        img.src = opt.value;
        btn.appendChild(img);
     } else if (opt.type === "video") {
  const vid = document.createElement("video");
  vid.src = opt.value;
  vid.controls = true;
  vid.autoplay = true;
  vid.muted = !soundEnabled;
vid.volume = 1;;
  vid.playsInline = true;
  btn.appendChild(vid);
}

      btn.addEventListener("click", () => {

    // 🚫 BLOQUEAR CLICAR FORA DA JANELA DE RESPOSTAS
    if (answersLocked) {
        showStateOverlay("AGUARDA", "Ainda não podes responder.");
        return;
    }

    if (answeredThisQuestion || isBlockedThisQuestion || usedStealThisQuestion) {
        return;
    }

    const idx = i;

    showConfirm(
      "Tens a certeza que queres bloquear esta resposta? Não vais poder mudar depois.",
      () => {
        markSelectedOption(idx);
        sendAnswer(idx);
        answersLocked = true;
        answeredThisQuestion = true;
      }
    );
});


      optionsContainer.appendChild(btn);
    });
  }

  if (type === "approximation") {
    const input = document.createElement("input");
    input.type = "number";
    input.placeholder = "Escreve o teu palpite";
    input.style.width = "100%";
    input.style.marginBottom = "8px";

    const submitBtn = document.createElement("button");
    submitBtn.textContent = "Enviar resposta";

    submitBtn.addEventListener("click", () => {
      if (answersLocked || answeredThisQuestion || isBlockedThisQuestion || usedStealThisQuestion) return;
      const val = parseFloat(input.value);
      if (isNaN(val)) {
        if (statusText) statusText.textContent = "Introduz um número válido.";
        return;
      }

      showConfirm(
        "Tens a certeza que queres bloquear esta resposta? Não vais poder mudar depois.",
        () => {
          sendAnswer(val);
          answersLocked = true;
          answeredThisQuestion = true;
          input.disabled = true;
          submitBtn.disabled = true;
        }
      );
    });

    optionsContainer.appendChild(input);
    optionsContainer.appendChild(submitBtn);
  }
});

function markSelectedOption(index) {
  if (!optionsContainer) return;
  const btns = optionsContainer.querySelectorAll("button");
  btns.forEach((btn) => {
    btn.classList.remove("selected");
    btn.disabled = true;
  });
  const selected = Array.from(btns).find(
    (btn) => parseInt(btn.dataset.index, 10) === index
  );
  if (selected) selected.classList.add("selected");
}

function sendAnswer(answerValue) {
  if (!gameCode || !teamId) return;
  console.log("Sending answer", answerValue);
  socket.emit("team:answer", {
    code: gameCode,
    teamId,
    answer: answerValue
  });
}

socket.on("team:answerReceived", () => {
  console.log("team:answerReceived");
  // bloqueia tudo até ao resultado / próxima pergunta
  answersLocked = true;
  answeredThisQuestion = true;
  const msg = "Resposta registada! Aguarda o resultado.";
  if (statusText) statusText.textContent = msg;
  showStateOverlay("RESPOSTA REGISTADA", msg);
});


socket.on("team:lockAnswers", () => {
  answersLocked = true;
  showStateOverlay("RESPOSTAS FECHADAS", "Aguarda a revelação…");
});

// resultado + saber se a equipa acertou
socket.on("team:showResults", ({ type, correctIndex, correctNumber, results }) => {
  console.log("team:showResults", type, correctIndex, correctNumber, results);
  if (!statusText) return;

  hideStateOverlay(); // libertar o ecrã para ver o resultado

  const myResult = results ? results[teamId] : null;

  if (type === "single") {
    // marcar resposta correta
    if (optionsContainer && typeof correctIndex === "number") {
      const btns = optionsContainer.querySelectorAll("button");
      btns.forEach((btn) => {
        const idx = parseInt(btn.dataset.index, 10);
        if (idx === correctIndex) {
          btn.classList.add("correct");
        }
      });

      // se escolhi uma opção errada, marcar a minha a vermelho com moldura amarela
      const selectedBtn = Array.from(btns).find((b) =>
        b.classList.contains("selected")
      );
      if (selectedBtn && typeof correctIndex === "number") {
        const idxSel = parseInt(selectedBtn.dataset.index, 10);
        if (!Number.isNaN(idxSel) && idxSel !== correctIndex) {
          selectedBtn.classList.add("wrong");
        }
      }
    }

    // mensagem quando foi bloqueado → ignora se acertava ou falhava
    if (isBlockedThisQuestion) {
      statusText.textContent = "Foste bloqueado nesta pergunta.";
      return;
    }

    // acertou (normal ou via steal)
    if (myResult && (myResult.correct || myResult.correctViaSteal)) {
      if (myResult.correctViaSteal) {
        statusText.textContent = "🕵️ Acertaste ao usar o poder de roubar!";
      } else {
        statusText.textContent = "Acertaste! 🎉";
      }
      return;
    }

    // não respondeu (nem usou steal) → texto diferente
    if (!answeredThisQuestion && !usedStealThisQuestion) {
      statusText.textContent = "Sem resposta (acabou o tempo).";
      return;
    }

    // respondeu mas errou
    statusText.textContent = "Falhaste!";
  }

 if (type === "approximation") {
  const parts = [];

  // mostrar sempre o valor correto
  if (typeof correctNumber === "number") {
    parts.push(`✅ Resposta correta: ${correctNumber}`);
  }

  // o teu resultado (se respondeste)
  if (myResult) {
    if (typeof myResult.answer !== "undefined") {
      parts.push(`A tua resposta: ${myResult.answer}`);
    }
    if (typeof myResult.distance !== "undefined") {
      parts.push(`Distância: ${myResult.distance}`);
    }

    // estados de vitória/roubo
    if (myResult.winner) {
      parts.push(`🏆 Foste a equipa mais próxima! (+10)`);
    } else if (myResult.winnerViaSteal) {
      parts.push(`🕵️ Roubo CERTO! Ganhaste os pontos do vencedor (+10)`);
    } else if (myResult.stealFail) {
      parts.push(`🕵️ Roubo FALHOU. Sem pontos nesta pergunta.`);
    }
  } else {
    // não enviou palpite nem usou roubo
    parts.push(`Sem resposta (acabou o tempo).`);
  }

  statusText.textContent = parts.join(" | ");
}

});


socket.on("team:openAnswerWindow", () => {
  hideStateOverlay();
  answersLocked = false;
  if (powersContainer) powersContainer.style.display = "flex";
  statusText && (statusText.textContent = "Responde agora!");
});

socket.on("team:showHold", ({ title, subtitle }) => {
  if (powersContainer) powersContainer.style.display = "none";
  if (optionsContainer) optionsContainer.innerHTML = "";
  answersLocked = true;
  answeredThisQuestion = false;
  usedStealThisQuestion = false;
  isBlockedThisQuestion = false;
  showStateOverlay(title || "AGUARDA", subtitle || "O host controla o ritmo…");
});

socket.on("team:resultOverlay", ({ status, title, subtitle }) => {
  answersLocked = true;
  showStateOverlay(title, subtitle);
});

// atualização de ranking (para mostrar o teu score)
socket.on("game:scoreUpdate", ({ leaderboard }) => {
  const me = leaderboard.find((t) => t.id === teamId);
  if (me && scoreValue) {
    scoreValue.textContent = me.score;
  }
});

