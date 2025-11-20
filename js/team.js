const socket = io();

const params = new URLSearchParams(window.location.search);
const code = params.get("code");

const nameInput = document.getElementById("nameInput");
const avatarInput = document.getElementById("avatarInput");
const joinBtn = document.getElementById("joinBtn");

const content = document.getElementById("content");
const teamHeader = document.getElementById("teamHeader");

joinBtn.onclick = () => {
  socket.emit("joinGame", {
    code,
    role: "team",
    name: nameInput.value,
    avatar: avatarInput.value
  });
};

socket.on("team:joined", (team) => {
  content.style.display = "block";
  teamHeader.textContent = `${team.avatar} ${team.name}`;
});
