// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { randomUUID } = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

// Servir ficheiros estáticos
app.use(express.static("public"));

// Jogos guardados em memória
const games = {};

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// Rotas simples
app.get("/", (req, res) => {
  res.send("Quiz Game Server is running!");
});

// WebSocket
io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  // Host cria jogo
  socket.on("host:createGame", () => {
    const code = generateCode();

    games[code] = {
      code,
      hostId: socket.id,
      teams: [],
      status: "lobby",
      currentQuestion: -1,
    };

    socket.join(code);
    socket.emit("host:gameCreated", { code });
  });

  // Equipa ou Host entra num jogo
  socket.on("joinGame", ({ code, role, name, avatar }) => {
    const game = games[code];
    if (!game) {
      socket.emit("joinError", "Jogo não existe.");
      return;
    }

    socket.join(code);

    if (role === "team") {
      const team = {
        id: randomUUID(),
        name,
        avatar: avatar || "😎",
        socketId: socket.id,
        score: 0,
        powers: {
          steal: false,
          fifty: false,
          block: false,
        },
      };
      game.teams.push(team);

      socket.emit("team:joined", team);
      io.to(game.code).emit("host:teamsUpdated", game.teams);
    }

    if (role === "host") {
      game.hostId = socket.id;
      socket.emit("host:joinedAsHost", game);
    }

    if (role === "presentation") {
      socket.emit("presentation:connected", game);
    }
  });

  // Host começa o jogo
  socket.on("host:startGame", ({ code }) => {
    const game = games[code];
    if (!game) return;

    game.status = "started";
    game.currentQuestion = 0;

    io.to(code).emit("game:started", { questionIndex: 0 });
  });

  // Desligar
  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
