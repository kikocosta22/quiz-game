// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { randomUUID } = require("crypto");
const fs = require("fs");

// Carregar perguntas
const QUESTIONS = JSON.parse(fs.readFileSync("./questions.json", "utf8"));

const POINTS_SINGLE_CORRECT = 10;
const POINTS_APPROX_WINNER = 10;



const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  maxHttpBufferSize: 10 * 1024 * 1024 // 10MB para fotos base64
});

app.use(express.static("public"));

const games = {};

// ----------- FUNÇÕES ÚTEIS -----------

function createMazeVariant1() {
  // Harder maze: taller + wider
   const grid = [
    "11111111111111111111111",
    "10100000000010000010001",
    "10101111111110111010101",
    "10100000000000001000101",
    "10111111111111101111101",
    "10100010000010000000101",
    "10101010111011111110101",
    "10001010101000001000101",
    "11111010101111101110101",
    "10001000100000100010101",
    "10111111101111111011101",
    "10000000000000001000101",
    "10111111111111101110101",
    "10100000100010000010101",
    "10111010101010111110101",
    "10000010101010000010101",
    "11111110101011111010101",
    "00000000001000001000001",
    "11111111111111111111111",
  ].map(r => r.split("").map(Number));

  return {
    grid,
    cellSize: 23,
    start: { x: 1, y: 1 },
    goal:  { x: 0, y: 17 },
  };
}

function createMazeVariant2() {
  // Your original 13 x 25 maze
  const grid = [
  "11111111111111111111111",
  "10100000000000000000001",
  "10101111101111111011111",
  "10101000001000000010001",
  "10111011111011111010101",
  "10001000001010001000101",
  "11101101101010111111101",
  "10001000101010100000101",
  "10111010101010101110101",
  "10100010101010001000101",
  "10111010101011101011101",
  "10001010100000101010101",
  "11101010111110111010101",
  "10101010000010000010101",
  "10101011111011111110101",
  "10100010001010000010101",
  "10111110111010111010101",
  "10000000000000100000100",
  "11111111111111111111111",
].map(r => r.split("").map(Number));

return {
  grid,
  cellSize: 23,
  start: { x: 1, y: 1 },
  goal:  { x: 22, y: 17 },  // exit on the right side now
};
}

// // Decide which maze to use based on the question index that comes AFTER the bonus
// function createMazeForIndex(index) {
//   // index = pergunta 0-based que vem a seguir ao bónus
//   if (index === 1) return createMazeVariant1(); // entre ronda 1 e 2
//   if (index === 2) return createMazeVariant2(); // entre ronda 2 e 3
//   // fallback
//   return createMazeVariant1();
// }


function createMazeForIndex(index) {
  if (index === 9)  return createMazeVariant1(); // bónus da ronda 10
  if (index === 19) return createMazeVariant2(); // bónus da ronda 20
  return createMazeVariant1();
}

function isBonusRound(game, index) {
  return !!game?.mazeRounds?.has(index);
}


function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function emitTeamsUpdated(game) {
  io.to(game.code).emit("game:teamsUpdated", game.teams);
}

function emitScoreUpdate(game) {
  const leaderboard = [...game.teams].sort((a,b) => b.score - a.score);
  io.to(game.code).emit("game:scoreUpdate", { leaderboard });
}
function getLeaderboard(game) {
  return [...game.teams].sort((a, b) => b.score - a.score);
}

function finishGame(game) {
  if (!game || game.status === "finished") return;

  game.status = "finished";
  game.phase = "finished";

  const leaderboard = getLeaderboard(game);

  // ranking final para todos
  io.to(game.code).emit("game:finished", {
    leaderboard,
    total: game.questions.length
  });

  // ecrã de pódio na apresentação
  io.to(game.code).emit("presentation:showPodium", {
    leaderboard,
    total: game.questions.length
  });

  // telemóveis: mostrar fim
  io.to(game.code).emit("team:showHold", {
    title: "FIM",
    subtitle: "Obrigado por jogarem!"
  });

  emitPhase(game);
  emitScoreUpdate(game);
}



function emitAnswersProgress(game, qIndex) {


  const answers = game.answers[qIndex] || {};
  const steals = game.steals[qIndex] || {};
  const blockedSet = game.blockedTeams[qIndex] || new Set();

  const answeredIds = Object.keys(answers);
  const stealers = Object.keys(steals);
  const blockedIds = Array.from(blockedSet);

  const union = [...new Set([
  ...answeredIds,
  ...stealers,
  ...blockedIds
])];

  io.to(game.code).emit("presentation:answersProgress", {
    answeredTeamIds: union,
    blockedTeamIds: blockedIds 
  });

  io.to(game.code).emit("presentation:updateAnswers", {
    count: union.length
  });

  // informar também as equipas sobre quem está bloqueado nesta pergunta
  io.to(game.code).emit("team:blockedTeams", {
    blockedTeamIds: blockedIds
  });
}

function syncTeamState(game, team, socket) {
  if (!game || !team) return;

  if (game.status === "finished") {
    socket.emit("team:showHold", { title: "FIM", subtitle: "Obrigado por jogar!" });
    return;
  }

  if (game.status !== "started") return;

  const qIndex = game.currentQuestion;
  if (qIndex == null || qIndex < 0) return;

  const q = game.questions[qIndex];
  if (!q) return;

  const phase = game.phase || "question";

  // limpamos o UI desta pergunta para esse socket
socket.emit("team:prepareNextQuestion");

if (game.phase === "maze" && game.mazeState) {
  const bonusIndex = game.mazeIndex ?? game.currentQuestion;

  socket.emit("maze:start", {
    index: bonusIndex,
    bonusIndex,
    total: game.questions.length,
    grid: game.mazeState.grid,
    cellSize: game.mazeState.cellSize,
    start: game.mazeState.start,
    goal: game.mazeState.goal
  });
  socket.emit("maze:updatePositions", { positions: game.mazeState.positions });
  return;
}


if (phase === "between" || phase === "question") {
  socket.emit("team:showHold", {
    title: phase === "between" ? "RONDA" : "AGUARDA",
    subtitle: phase === "between"
      ? "A próxima pergunta vai começar…"
      : "O host vai abrir as respostas…"
  });
  return;
}

  // Mostrar opções (answers / locked / results)
  if (q.type === "single" && Array.isArray(q.options)) {
    const optionsForTeams = q.options.map(o => ({ type: o.type, value: o.value }));
    socket.emit("team:showOptions", {
      index: qIndex,
      type: q.type,
      options: optionsForTeams
    });
  } else if (q.type === "approximation") {
    socket.emit("team:showOptions", {
      index: qIndex,
      type: q.type,
      options: []
    });
  }

   const answersForQ = game.answers[qIndex] || {};
  const stealsForQ = game.steals[qIndex] || {};
  const blockedSet = game.blockedTeams[qIndex] || new Set();

  // enviar lista de bloqueados também para este client (para o overlay)
  socket.emit("team:blockedTeams", {
    blockedTeamIds: Array.from(blockedSet)
  });

  // Se foi bloqueado nesta pergunta
  if (blockedSet.has(team.id)) {
    let byName = null;
    const logs = game.blockLogs[qIndex] || [];
    const ev = logs.find(e => e.targetId === team.id);
    if (ev) {
      const blocker = game.teams.find(t => t.id === ev.blockerId);
      if (blocker) byName = blocker.name;
    }
    socket.emit("team:blockedForQuestion", { byTeamName: byName });
  }


  // Se usou steal nesta pergunta
  if (stealsForQ[team.id]) {
    const victim = game.teams.find(t => t.id === stealsForQ[team.id]);
    socket.emit("team:powerUsed", {
      power: "steal",
      targetTeamName: victim ? victim.name : ""
    });
  }

  // Se já tinha respondido
  if (answersForQ[team.id]) {
    socket.emit("team:answerReceived");
  }

  // Se as respostas estão fechadas
  if (phase === "locked" || phase === "results") {
    socket.emit("team:lockAnswers");
  }

  // Se já há resultados desta pergunta, manda-os também
  if (phase === "results" && game.resultCache && game.resultCache[qIndex]) {
    const cache = game.resultCache[qIndex];
    socket.emit("team:showResults", {
      type: cache.type,
      correctIndex: cache.correctIndex,
      correctNumber: cache.correctNumber,
      results: cache.results
    });
  }
}

function syncPresentationState(game, socket) {
  if (!game) return;

// jogo terminado
if (game.status === "finished") {
  socket.emit("presentation:showPodium", {
    leaderboard: getLeaderboard(game),
    total: game.questions.length
  });
  return;
}

// antes do jogo começar
if (game.status !== "started") {
  socket.emit("presentation:showLobby", {});
  return;
}

  const qIndex = game.currentQuestion;
  const q = game.questions[qIndex];
  const phase = game.phase || "question";
  
if (game.phase === "maze" && game.mazeState) {
  socket.emit("maze:start", {
    index: game.currentQuestion,
    total: game.questions.length,
    grid: game.mazeState.grid,
    cellSize: game.mazeState.cellSize,
    start: game.mazeState.start,
    goal: game.mazeState.goal
  });
  socket.emit("maze:updatePositions", { positions: game.mazeState.positions });
  return;
}

  // ENTRE PERGUNTAS → mostra banner de ronda, não a pergunta
  if (phase === "between" || qIndex == null || qIndex < 0 || !q) {
    const ni = (qIndex ?? -1) + 1;
socket.emit("presentation:nextScreen", {
  nextIndex: ni,
  total: game.questions.length,
  isBonus: isBonusRound(game, ni)
});

    return;
  }

  // Mostrar SEMPRE a pergunta primeiro
  socket.emit("presentation:showQuestion", {
    index: qIndex,
    total: game.questions.length,
    question: q
  });

  // Progresso de respostas (respondeu / roubou / bloqueado)
  const answeredIds = Object.keys(game.answers[qIndex] || {});
  const stealers = Object.keys(game.steals[qIndex] || {});
  const blockedIds = Array.from(game.blockedTeams[qIndex] || new Set());
  const union = [...new Set([...answeredIds, ...stealers, ...blockedIds])];

  socket.emit("presentation:answersProgress", {
    answeredTeamIds: union,
    blockedTeamIds: blockedIds
  });
  socket.emit("presentation:updateAnswers", { count: union.length });

  // Se já estamos nas respostas/locked/resultados, mostra também as opções
  if (phase === "answers" || phase === "locked" || phase === "results") {
    socket.emit("presentation:showAnswers", {
      index: qIndex,
      type: q.type,
      options: q.options || []
    });
  }

  // Se já há resultados cacheados, envia-os
  if (phase === "results" && game.resultCache && game.resultCache[qIndex]) {
    socket.emit("presentation:revealResults", game.resultCache[qIndex]);
  }
}


function emitPhase(game) {
  const payload = {
    phase: game.phase,
    index: game.currentQuestion,
    total: game.questions.length
  };
  if (game.hostId) io.to(game.hostId).emit("host:phaseState", payload);
}


// ----------- ROTAS -----------
app.get("/", (req, res) => {
  res.send("Quiz Game Server is running!");
});

// ----------- SOCKET.IO -----------
io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  // --- HOST CRIA JOGO ---
  socket.on("host:createGame", () => {
    const code = generateCode();

    games[code] = {
      // mazeRounds: new Set([1, 2]), // bónus antes da pergunta 2 e 3 (1-based)
       mazeRounds: new Set([9, 19]), 
  mazeState: null,
  mazeIndex: null,             // qual índice de pergunta está associado a ESTE labirinto
       pendingQuestion: null,    // NOVO
      code,
      hostId: socket.id,
      teams: [],
      status: "lobby",
      currentQuestion: -1,
        phase: "lobby",   
      questions: QUESTIONS,

      answers: {},
      blockedTeams: {},
      steals: {},

      blockLogs: {},
      stealLogs: {},

      resultCache: {}   
    };

    socket.join(code);
    socket.emit("host:gameCreated", { code });
    socket.emit("host:joinedAsHost", {
      code,
      teams: games[code].teams,
      status: "lobby",
      currentQuestion: -1
    });
  });

  // --- JOIN GAME ---
  socket.on("joinGame", ({ code, role, name, avatar, teamId }) => {
    const game = games[code];
    if (!game) {
      socket.emit("joinError", "Jogo não existe.");
      return;
    }

    socket.join(code);

        // --- EQUIPA ---
    if (role === "team") {
      let team = teamId ? game.teams.find(t => t.id === teamId) : null;

      // Jogo já começou → não pode entrar como novo
      if (game.status !== "lobby" && !team) {
        socket.emit("joinError", "O jogo já começou!");
        return;
      }

      // Reentrada da equipa
      if (team) {
        team.socketId = socket.id;
        if (name) team.name = name;
        if (avatar) team.avatar = avatar;

        emitTeamsUpdated(game);
        emitScoreUpdate(game);          // <- NOVO: atualizar ranking também
        socket.emit("team:joined", team);

        syncTeamState(game, team, socket);

        return;
      }


      // Nova equipa
      team = {
        id: randomUUID(),
        name: name || "Equipa",
        avatar: avatar || null,
        socketId: socket.id,
        score: 0,
          powers: { steal: 0, fifty: false, block: false } // steal = nº de vezes usado
      };

      game.teams.push(team);

      socket.emit("team:storeId", team.id);
      socket.emit("team:joined", team);
      emitTeamsUpdated(game);
 emitScoreUpdate(game);       
      syncTeamState(game, team, socket);

    }

    // --- HOST ---
        if (role === "host") {
      game.hostId = socket.id;

      socket.emit("host:joinedAsHost", {
        code: game.code,
        teams: game.teams,
        status: game.status,
        currentQuestion: game.currentQuestion,
        phase: game.phase || "lobby"
      });

      emitTeamsUpdated(game);
      emitScoreUpdate(game);
    }


    // --- APRESENTAÇÃO ---
    if (role === "presentation") {
  socket.emit("presentation:connected", {
    code: game.code,
    status: game.status,
    currentQuestion: game.currentQuestion
  });

  // leaderboard e equipas atuais (se já tiveres helpers, usa-os)
  emitTeamsUpdated(game);
  emitScoreUpdate(game);

  // MUITO IMPORTANTE: sincronizar o estado atual corretamente
  syncPresentationState(game, socket);
}
  });

  // --- HOST COMEÇA JOGO ---
  socket.on("host:startGame", ({ code }) => {
    const game = games[code];
    if (!game) return;

    game.status = "started";
    game.currentQuestion = -1;
    game.phase = "between"; // NOVO
io.to(code).emit("presentation:nextScreen", {
  nextIndex: 0,
  total: game.questions.length,
  isBonus: isBonusRound(game, 0)
});

    io.to(code).emit("game:started", { code });
  });

  // --- HOST MOSTRA PERGUNTA ---
  socket.on("host:startQuestion", ({ code }) => {
    const game = games[code];
    if (!game || game.status !== "started") return;

    const next = game.currentQuestion + 1;

if (next >= game.questions.length) {
  finishGame(game);
  return;
}


 if (isBonusRound(game, next)) {
    game.phase = "maze";
    emitPhase(game);

    game.pendingQuestion = next;   // pergunta real que vem a seguir ao labirinto
    game.mazeRounds.delete(next);  // consome este bónus para não repetir

    const bonusIndex = next;       // 0-based: 1 => entre 1 e 2, 2 => entre 2 e 3
    const maze = createMazeForIndex(bonusIndex);
    game.mazeIndex = bonusIndex;

    game.mazeState = {
      ...maze,
      startAt: Date.now(),
      positions: Object.fromEntries(
        game.teams.map(t => [t.id, { ...maze.start }])
      ),
      finished: {}
    };

    io.to(code).emit("maze:start", {
      index: next,                 // mantemos para compatibilidade
      bonusIndex,                  // novo: usado pelo presentation para escolher imagens
      total: game.questions.length,
      grid: maze.grid,
      cellSize: maze.cellSize,
      start: maze.start,
      goal: maze.goal
    });

    io.to(code).emit("team:prepareNextQuestion");
    return;
  }

    game.currentQuestion = next;
    game.phase = "question"; // NOVO
    emitPhase(game);
    const qIndex = next;
    const q = game.questions[qIndex];

    game.answers[qIndex] = {};
    game.blockedTeams[qIndex] = new Set();
    game.steals[qIndex] = {};

    game.blockLogs[qIndex] = [];
    game.stealLogs[qIndex] = [];

   io.to(code).emit("presentation:showQuestion", {
  index: next,
  total: game.questions.length,
  question: q
});

io.to(code).emit("team:showHold", {
  title: "AGUARDA",
  subtitle: "O host vai abrir as respostas…"
});

    io.to(code).emit("team:prepareNextQuestion");

    emitAnswersProgress(game, qIndex);
  });

  // --- HOST MOSTRA RESPOSTAS ---
  socket.on("host:showAnswers", ({ code }) => {
    const game = games[code];
    if (!game) return;

    game.phase = "answers"; // NOVO
    emitPhase(game);
    const qIndex = game.currentQuestion;
    const q = game.questions[qIndex];

    io.to(code).emit("presentation:showAnswers", {
      index: qIndex,
      type: q.type,
      options: q.options || []
    });

    let optionsForTeams = [];
    if (q.type === "single" && Array.isArray(q.options)) {
      optionsForTeams = q.options.map(o => ({ type: o.type, value: o.value }));
    }

    io.to(code).emit("team:showOptions", {
      index: qIndex,
      type: q.type,
      options: optionsForTeams
    });

    io.to(code).emit("team:openAnswerWindow");
  });

  // --- PODERES ---
  socket.on("team:usePower", ({ code, teamId, power, targetName }) => {
    const game = games[code];
    if (!game) return;

    const qIndex = game.currentQuestion;
    const q = game.questions[qIndex];

    const team = game.teams.find(t => t.id === teamId);
 if (game.phase === "maze") {
    socket.emit("team:powerError", "Poderes desativados na Bonus Round.");
    return;
  }
  // limite de utilizações dos poderes
  if (power === "steal") {
    // steal pode ser usado até 2x no jogo
    const usedTimes =
      typeof team.powers.steal === "number"
        ? team.powers.steal
        : (team.powers.steal ? 1 : 0);

    if (usedTimes >= 2) {
      socket.emit("team:powerError", {
        power,
        message: "Já usaste o poder de roubar duas vezes nesta partida."
      });
      return;
    }
  } else {
    // fifty e block continuam a ser 1x por jogo
    if (team.powers[power]) {
      socket.emit("team:powerError", {
        power,
        message: "Já usaste este poder."
      });
      return;
    }
  }


    // --- 50:50 ---
    if (power === "fifty") {
      if (q.type !== "single") {
        socket.emit("team:powerError", { power, message: "Não aplicável aqui." });
        return;
      }

      const total = q.options.length;
      const correct = q.correctIndex;

      const allIdx = [...Array(total).keys()];
      const wrongIdx = allIdx.filter(i => i !== correct);

      let removeCount = total >= 4 ? 2 : 1;
      if (removeCount > wrongIdx.length) removeCount = wrongIdx.length;

      const removed = [];
      while (removed.length < removeCount) {
        const candidate = wrongIdx[Math.floor(Math.random() * wrongIdx.length)];
        if (!removed.includes(candidate)) removed.push(candidate);
      }

      const remaining = allIdx.filter(i => !removed.includes(i));

      team.powers.fifty = true;

      socket.emit("team:applyFifty", { remainingIndices: remaining });
      socket.emit("team:powerUsed", { power });
      return;
    }

    // --- PODERES COM ALVO (block, steal) ---
    const targetTeam = game.teams.find(
      t => t.name.toLowerCase() === targetName.toLowerCase()
    );

    if (!targetTeam) {
      socket.emit("team:powerError", { power, message: "Equipa inválida." });
      return;
    }

    // BLOCK
    if (power === "block") {
      team.powers.block = true;
      game.blockedTeams[qIndex].add(targetTeam.id);

      if (!game.blockLogs[qIndex]) game.blockLogs[qIndex] = [];
      game.blockLogs[qIndex].push({
        blockerId: team.id,
        targetId: targetTeam.id
      });

      if (targetTeam.socketId) {
        io.to(targetTeam.socketId).emit("team:blockedForQuestion", {
          byTeamName: team.name
        });
      }

      emitAnswersProgress(game, qIndex);
      socket.emit("team:powerUsed", { power, targetTeamName: targetTeam.name });
      return;
    }

    // STEAL
    // STEAL
if (power === "steal") {
  const currentUses =
    typeof team.powers.steal === "number"
      ? team.powers.steal
      : (team.powers.steal ? 1 : 0);

  team.powers.steal = currentUses + 1; // incrementa contador

  game.steals[qIndex][team.id] = targetTeam.id;

  if (!game.stealLogs[qIndex]) game.stealLogs[qIndex] = [];
  game.stealLogs[qIndex].push({
    thiefId: team.id,
    victimId: targetTeam.id
  });

  emitAnswersProgress(game, qIndex);
  socket.emit("team:powerUsed", { power, targetTeamName: targetTeam.name });
  return;
}

  });

  // --- EQUIPA RESPONDE ---
  socket.on("team:answer", ({ code, teamId, answer }) => {
    const game = games[code];
    if (!game) return;

    const qIndex = game.currentQuestion;
    const q = game.questions[qIndex];

    // não pode responder se foi bloqueado
    if (game.blockedTeams[qIndex].has(teamId)) {
      socket.emit("team:blockedForQuestion", { byTeamName: null });
      return;
    }

    // quem usou steal não pode responder
    if (game.steals[qIndex][teamId]) {
      socket.emit("team:answerRejected", { reason: "stealUsed" });
      return;
    }

    game.answers[qIndex][teamId] = { answer, socketId: socket.id, timestamp: Date.now()};

    socket.emit("team:answerReceived");
    emitAnswersProgress(game, qIndex);
  });

  // --- FECHAR RESPOSTAS ---
socket.on("host:forceCloseAnswers", ({ code }) => {
  const game = games[code];
  emitPhase(game);
  if (!game) return;

  game.phase = "locked"; // NOVO
  io.to(code).emit("team:lockAnswers");
});

  // --- REVELAR RESPOSTA ---
  socket.on("host:revealAnswer", ({ code }) => {
    const game = games[code];
    if (!game) return;

       game.phase = "results";
       emitPhase(game);
    const qIndex = game.currentQuestion;
    const blockedSet = game.blockedTeams[qIndex] || new Set();
    const q = game.questions[qIndex];

    let results = {};

    // ---- RESPOSTAS DE ESCOLHA ----
   if (q.type === "single") {
  const correct = q.correctIndex;
  const answers = game.answers[qIndex] || {};
  const stealsThisQ = game.steals[qIndex] || {};

  // 1) marcar quem respondeu correto (ignorando bloqueados)
  const correctTeams = [];
  for (const t of game.teams) {
    const a = answers[t.id];
    if (!a) continue;

    if (blockedSet.has(t.id)) {
      results[t.id] = { blocked: true };
      continue;
    }

    const isCorrect = (parseInt(a.answer, 10) === correct);
    if (isCorrect) {
      results[t.id] = { correct: true };
      t.score += POINTS_SINGLE_CORRECT;
      correctTeams.push(t.id);
    }
  }

  // 2) mapa vítima -> [ladrões] para permitir cadeias de roubo
  const victimToThieves = {};
  for (const thiefId in stealsThisQ) {
    const victimId = stealsThisQ[thiefId];
    if (!victimToThieves[victimId]) {
      victimToThieves[victimId] = [];
    }
    victimToThieves[victimId].push(thiefId);
  }

  // 3) propagar "correto via roubo" ao longo da cadeia
  const awardedStealIds = new Set();

  function awardStealChainFrom(baseId) {
    const queue = [baseId];
    const visited = new Set([baseId]);

    while (queue.length > 0) {
      const victimId = queue.shift();
      const thieves = victimToThieves[victimId] || [];

      for (const thiefId of thieves) {
        if (visited.has(thiefId)) continue;
        visited.add(thiefId);

        // ladrão bloqueado não ganha e não continua cadeia
        if (blockedSet.has(thiefId)) {
          continue;
        }

        if (!awardedStealIds.has(thiefId)) {
          const thief = game.teams.find(x => x.id === thiefId);
          if (thief) {
            thief.score += POINTS_SINGLE_CORRECT;
            results[thiefId] = {
              ...(results[thiefId] || {}),
              correctViaSteal: true
            };
            awardedStealIds.add(thiefId);
          }
        }

        // continuar a subir na cadeia (se alguém roubou este ladrão)
        queue.push(thiefId);
      }
    }
  }

  // 4) arrancar cadeia a partir de TODAS as equipas que acertaram
  correctTeams.forEach((teamId) => awardStealChainFrom(teamId));

  // 5) quem usou roubo e não ganhou nada → roubo falhou
  for (const thiefId in stealsThisQ) {
    if (blockedSet.has(thiefId)) continue;
    if (!awardedStealIds.has(thiefId)) {
      results[thiefId] = {
        ...(results[thiefId] || {}),
        stealFail: true
      };
    }
  }
}



    // ---- APROXIMAÇÃO ----
   // ---- APROXIMAÇÃO ----
// regra:
// 1) encontra a equipa com menor distância (tie-break = quem respondeu primeiro)
// 2) essa equipa ganha 10 pontos (POINTS_APPROX_WINNER)
// 3) se alguém roubou a resposta *dessa* equipa vencedora,
//    o(s) ladrão(ões) também ganham 10 pontos
if (q.type === "approximation") {
  const answers = game.answers[qIndex] || {};
  let minDist = null;

  // avaliar respostas (guardar tudo no results) - bloqueados não contam para a vitória
  for (const t of game.teams) {
    const a = answers[t.id];
    if (!a) continue;

    const val = parseFloat(a.answer);
    const dist = Math.abs(val - q.correctNumber);
    const ts = a.timestamp || 0;

    // guardar no results (para mostrar números), mas marcando bloqueados
    if (blockedSet.has(t.id)) {
      results[t.id] = { blocked: true, answer: val, distance: dist, ts };
      continue;
    }

    results[t.id] = { ...(results[t.id] || {}), answer: val, distance: dist, ts };

    if (minDist === null || dist < minDist) {
      minDist = dist;
    }
  }

  if (minDist !== null) {
    // 1) apurar vencedores
    // - se houver várias equipas com a MESMA resposta e mesma distância mínima, todas ganham
    // - se houver empate de distância com respostas diferentes, mantém-se o desempate por quem respondeu primeiro (timestamp)
    const groups = new Map(); // answerValue -> { teamIds: [], minTs: number }

    for (const t of game.teams) {
      const r = results[t.id];
      if (!r || r.blocked) continue;
      if (typeof r.distance !== "number") continue;
      if (r.distance !== minDist) continue;

      const key = r.answer; // número
      const g = groups.get(key) || { teamIds: [], minTs: Infinity };
      g.teamIds.push(t.id);
      g.minTs = Math.min(g.minTs, r.ts || 0);
      groups.set(key, g);
    }

    // escolher o grupo vencedor (por timestamp mais antigo) e premiar TODAS as equipas desse grupo
    let winnerGroup = null;
    for (const g of groups.values()) {
      if (!winnerGroup || g.minTs < winnerGroup.minTs) {
        winnerGroup = g;
      }
    }

    const winnerIds = winnerGroup ? winnerGroup.teamIds : [];

    // atribuir pontos aos vencedores
    for (const id of winnerIds) {
      const winner = game.teams.find(t => t.id === id);
      if (winner) winner.score += POINTS_APPROX_WINNER;
      results[id] = {
        ...(results[id] || {}),
        winner: true
      };
    }

    // 2) CADEIA DE ROUBOS A PARTIR DO(S) VENCEDOR(ES)
    const stealsThisQ = game.steals[qIndex] || {};

    // mapa vítima -> [ladrões]
    const victimToThieves = {};
    for (const thiefId in stealsThisQ) {
      const victimId = stealsThisQ[thiefId];
      if (!victimToThieves[victimId]) victimToThieves[victimId] = [];
      victimToThieves[victimId].push(thiefId);
    }

    const awardedStealIdsApprox = new Set();
    const queue = [...winnerIds];
    const visited = new Set(winnerIds);

    while (queue.length > 0) {
      const victimId = queue.shift();
      const thieves = victimToThieves[victimId] || [];

      for (const thiefId of thieves) {
        if (visited.has(thiefId)) continue;
        visited.add(thiefId);

        // ladrão bloqueado não ganha nem continua cadeia
        if (blockedSet.has(thiefId)) {
          continue;
        }

        if (!awardedStealIdsApprox.has(thiefId)) {
          const thief = game.teams.find(t => t.id === thiefId);
          if (thief) {
            thief.score += POINTS_APPROX_WINNER;
            results[thiefId] = {
              ...(results[thiefId] || {}),
              winnerViaSteal: true
            };
            awardedStealIdsApprox.add(thiefId);
          }
        }

        // continuar a subir na cadeia de roubo
        queue.push(thiefId);
      }
    }

    // quem usou roubo e não está na cadeia do(s) vencedor(es) → roubo falhou
    for (const thiefId in stealsThisQ) {
      if (blockedSet.has(thiefId)) continue;
      if (!awardedStealIdsApprox.has(thiefId)) {
        results[thiefId] = {
          ...(results[thiefId] || {}),
          stealFail: true
        };
      }
    }
  } else {
    // ninguém elegível → nada a pontuar
  }
}





    emitScoreUpdate(game);

    // ----- LOGS DE PODERES -----
    const stealsForQ = game.steals[qIndex] || {};
const stealsLog = Object.keys(stealsForQ).map((thiefId) => {
  const victimId = stealsForQ[thiefId];
  return {
    fromTeamName: game.teams.find(t => t.id === thiefId)?.name,
    toTeamName: game.teams.find(t => t.id === victimId)?.name
  };
});

const blocksLog = (game.blockLogs[qIndex] || []).map(ev => {
  return {
    fromTeamName: game.teams.find(t => t.id === ev.blockerId)?.name,
    toTeamName: game.teams.find(t => t.id === ev.targetId)?.name
  };
});
    // guardar em cache para re-sincronizar quem faz refresh
game.resultCache[qIndex] = {
  type: q.type,
  correctIndex: q.correctIndex,
  correctNumber: q.correctNumber,
  results,
  explanation: q.explanation,
  powerLog: {
    steals: stealsLog,
    blocks: blocksLog
  }
};
    
for (const t of game.teams) {
  const r = results[t.id] || {};
  const blockedSet = game.blockedTeams[qIndex] || new Set();
  const wasBlocked = blockedSet.has(t.id);
  const answered = !!(game.answers[qIndex] && game.answers[qIndex][t.id]);
  const usedSteal = !!(game.steals[qIndex] && game.steals[qIndex][t.id]);

  let status = "wrong";
  let title = "RESPOSTA ERRADA";
  let subtitle = "Mais sorte na próxima!";

  if (q.type === "single") {
    if (r.correct) {
      status = "correct";
      title = "CERTO!";
      subtitle = "+10 pontos";
    } else if (r.correctViaSteal) {
      status = "steal_success";
      title = "ROUBO CERTO!";
      subtitle = "+10 pontos";
    } else if (usedSteal) {
      status = "steal_fail";
      title = "ROUBO FALHOU";
      subtitle = "Não acertou, sem pontos.";
    }
  } else if (q.type === "approximation") {
    if (r.winner || r.winnerViaSteal) {
      status = "approx_win";
      title = r.winnerViaSteal ? "ROUBO CERTO!" : "MAIS PRÓXIMO!";
      subtitle = "+10 pontos";
    } else if (usedSteal) {
      status = "steal_fail";
      title = "ROUBO FALHOU";
      subtitle = "Não acertou, sem pontos.";
    }
  }

  if (wasBlocked) {
    status = "blocked";
    title = "BLOQUEADO";
    subtitle = "Sem jogada nesta pergunta.";
  } else if (!answered && !usedSteal && q.type === "single") {
    status = "no_answer";
    title = "SEM RESPOSTA";
    subtitle = "Faltou o tempo.";
  }

  io.to(t.socketId).emit("team:resultOverlay", { status, title, subtitle });
}


   io.to(code).emit("presentation:revealResults", game.resultCache[qIndex]);

    io.to(code).emit("team:showResults", {
      type: q.type,
      correctIndex: q.correctIndex,
      correctNumber: q.correctNumber,
      results
    });
  });

  // --- PRÓXIMA PERGUNTA ---
  socket.on("host:nextQuestion", ({ code }) => {
  const game = games[code];
  if (!game) return;

game.phase = "between";
io.to(code).emit("team:showHold", {
  title: "RONDA",
  subtitle: "A próxima pergunta vai começar…"
});
emitPhase(game);

const ni = game.currentQuestion + 1;

if (ni >= game.questions.length) {
  finishGame(game);
  return;
}

io.to(code).emit("presentation:nextScreen", {
  nextIndex: ni,
  total: game.questions.length,
  isBonus: isBonusRound(game, ni)
});

io.to(code).emit("team:prepareNextQuestion");
});


socket.on("host:setMazeRound", ({ code, index }) => {
  const game = games[code];
  if (!game) return;
  if (index < 0 || index >= game.questions.length) return;

  game.mazeRounds.add(index);
  io.to(game.hostId).emit("host:mazeRoundsUpdated", Array.from(game.mazeRounds));
  io.to(code).emit("presentation:mazeRoundsUpdated", Array.from(game.mazeRounds));
});

socket.on("host:clearMazeRound", ({ code, index }) => {
  const game = games[code];
  if (!game) return;

  game.mazeRounds.delete(index);
  io.to(game.hostId).emit("host:mazeRoundsUpdated", Array.from(game.mazeRounds));
  io.to(code).emit("presentation:mazeRoundsUpdated", Array.from(game.mazeRounds));
});

socket.on("team:mazePos", ({ code, teamId, x, y }) => {
  const game = games[code];
  if (!game || game.phase !== "maze" || !game.mazeState) return;
  if (!game.mazeState.positions[teamId]) return;

  game.mazeState.positions[teamId] = { x, y };
  io.to(code).emit("maze:updatePositions", { positions: game.mazeState.positions });
});

socket.on("team:mazeFinished", ({ code, teamId }) => {
  const game = games[code];
  if (!game || game.phase !== "maze" || !game.mazeState) return;
  if (game.mazeState.finished[teamId] != null) return;

  const elapsed = Date.now() - game.mazeState.startAt;
  game.mazeState.finished[teamId] = elapsed;

  io.to(code).emit("maze:finished", { teamId, elapsed });

  // decide winner when first finishes (fast + exciting)
  const ranking = Object.entries(game.mazeState.finished).sort((a,b)=>a[1]-b[1]);
  const winnerId = ranking[0]?.[0];

  if (winnerId) {
    const winner = game.teams.find(t => t.id === winnerId);
    if (winner) winner.score += 20;

     io.to(code).emit("maze:results", { winnerId, ranking });
    emitScoreUpdate(game);

    const ni = game.pendingQuestion ?? (game.currentQuestion + 1);
    game.pendingQuestion = null;

    // fecha o labirinto no estado do jogo
    game.phase = "between";
    game.mazeState = null;
    game.mazeIndex = null;
    emitPhase(game);

    // dá 2.5s para o banner de vencedor respirar na apresentação
    setTimeout(() => {
      io.to(code).emit("presentation:nextScreen", {
        nextIndex: ni,
        total: game.questions.length,
        isBonus: isBonusRound(game, ni)
      });

      io.to(code).emit("team:showHold", {
        title: "RONDA",
        subtitle: "A próxima pergunta vai começar…"
      });
    }, 5000);
  }
});


  // --- DESLIGAR ---
  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
  });
});

// ----------- RUN -----------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
