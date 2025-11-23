// public/js/team.js
const socket = io();

const params = new URLSearchParams(window.location.search);
const codeFromUrl = params.get("code");
const roleFromUrl = params.get("role") || "team";

let gameCode = codeFromUrl || "";
let teamId = sessionStorage.getItem("teamId") || null;

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

// estado dos poderes
let powersUsed = {
  steal: false,
  fifty: false,
  block: false
};

// estado da pergunta
let answersLocked = false;
let answeredThisQuestion = false;
let currentQuestionType = null;
let isBlockedThisQuestion = false;
let usedStealThisQuestion = false;

// lista de equipas conhecida (para seleccionar alvo)
let knownTeams = [];

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

      const span = document.createElement("span");
      span.textContent = t.name;
      btn.appendChild(span);

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
    const MAX_SIZE_BYTES = 1 * 1024 * 1024;
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

    const file = avatarFileInput?.files?.[0];
    if (file) {
      const MAX_SIZE_BYTES = 1 * 1024 * 1024;
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

// auto-join em refresh
if (gameCode && roleFromUrl === "team" && teamId) {
  console.log("Auto-join como equipa existente", teamId, "no jogo", gameCode);
  socket.emit("joinGame", {
    code: gameCode,
    role: "team",
    teamId
  });
}

// receber lista de equipas (vindo do server via host:teamsUpdated)
socket.on("game:teamsUpdated", (teams) => {
  console.log("game:teamsUpdated", teams);
  knownTeams = teams || [];
});

socket.on("joinError", (msg) => {
  alert("Erro: " + msg);
});

socket.on("team:joined", (team) => {
  console.log("team:joined", team);
  teamId = team.id;

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
    powersUsed = {
      steal: !!team.powers.steal,
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
  sessionStorage.setItem("teamId", id);
  console.log("Stored teamId in sessionStorage:", id);
});

// ===== GESTÃO DE PODERES =====
function renderPowers() {
  powerButtons.forEach((btn) => {
    const power = btn.dataset.power;
    const used = powersUsed[power];
    const stateSpan = btn.querySelector(".state");
    if (used) {
      btn.classList.add("used");
      if (stateSpan) stateSpan.textContent = "Usado";
    } else {
      btn.classList.remove("used");
      if (stateSpan) stateSpan.textContent = "Disponível";
    }
  });
}

powerButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!gameCode || !teamId) return;
    const power = btn.dataset.power;
    if (powersUsed[power]) {
      if (statusText) statusText.textContent = "Já usaste esse poder nesta partida.";
      return;
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
  powersUsed[power] = true;
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
  vid.muted = true;
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
    if (optionsContainer && typeof correctIndex === "number") {
      const btns = optionsContainer.querySelectorAll("button");
      btns.forEach((btn) => {
        const idx = parseInt(btn.dataset.index, 10);
        if (idx === correctIndex) {
          btn.classList.add("correct");
        }
      });
    }

    if (myResult && (myResult.correct || myResult.correctViaSteal)) {
      if (myResult.correctViaSteal) {
        statusText.textContent = "🕵️ Acertaste usando o poder de roubar!";
      } else {
        statusText.textContent = "Acertaste! 🎉";
      }
    } else {
      statusText.textContent = "Falhaste!";
    }
  }

  if (type === "approximation") {
    if (myResult) {
      statusText.textContent = `A tua resposta: ${myResult.answer} | Distância: ${myResult.distance}`;
    } else {
      statusText.textContent = "Não respondeste a esta pergunta.";
    }
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

