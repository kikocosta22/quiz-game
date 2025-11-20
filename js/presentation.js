const socket = io();
const params = new URLSearchParams(window.location.search);
const code = params.get("code");

const status = document.getElementById("status");

socket.emit("joinGame", { code, role: "presentation" });

socket.on("game:started", ({ questionIndex }) => {
  status.textContent = "Pergunta " + (questionIndex + 1);
});
