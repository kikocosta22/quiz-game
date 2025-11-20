const socket = io();

const createBtn = document.getElementById("createBtn");
const infoDiv = document.getElementById("info");

const codeSpan = document.getElementById("code");
const teamUrl = document.getElementById("teamUrl");
const hostUrl = document.getElementById("hostUrl");
const presentationUrl = document.getElementById("presentationUrl");

const teamList = document.getElementById("teamList");
const startBtn = document.getElementById("startBtn");

createBtn.onclick = () => {
  socket.emit("host:createGame");
};

socket.on("host:gameCreated", ({ code }) => {
  infoDiv.style.display = "block";
  codeSpan.textContent = code;

  teamUrl.textContent = `/team.html?code=${code}&role=team`;
  hostUrl.textContent = `/host.html?code=${code}&role=host`;
  presentationUrl.textContent = `/presentation.html?code=${code}&role=presentation`;

  // Entrar automaticamente como host
  socket.emit("joinGame", { code, role: "host" });
});

// Atualizar equipas em tempo real
socket.on("host:teamsUpdated", (teams) => {
  teamList.innerHTML = "";
  teams.forEach((t) => {
    const li = document.createElement("li");
    li.textContent = `${t.avatar} ${t.name}`;
    teamList.appendChild(li);
  });
});

startBtn.onclick = () => {
  socket.emit("host:startGame", { code: codeSpan.textContent });
};
