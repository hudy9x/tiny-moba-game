import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { Match } from "./match.js";
import { maps } from "../src/maps/registry.js";
import { gameConfig } from "../src/gameConfig.js";

const port = Number(process.env.PORT || gameConfig.network.port);
const rooms = new Map();
const http = createServer((req, res) => {
  res.writeHead(req.url === "/health" ? 200 : 404, {
    "Content-Type": "application/json",
  });
  res.end(
    JSON.stringify(
      req.url === "/health"
        ? { ok: true, rooms: rooms.size }
        : { error: "Not found" },
    ),
  );
});
const wss = new WebSocketServer({
  server: http,
  path: "/ws",
  maxPayload: 2048,
});
wss.on("connection", (socket, request) => {
  const params = new URL(request.url, "http://localhost").searchParams;
  const name = params.get("room") || "greenwood";
  const mapId = params.get("map") || gameConfig.maps.defaultId;
  if (!maps.some((map) => map.id === mapId)) {
    socket.close(1008, "Unknown map");
    return;
  }
  const roomKey = `${mapId}:${name}`;
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(name)) {
    socket.close(1008, "Invalid room name");
    return;
  }
  // Bound memory for this small prototype server.
  if (!rooms.has(roomKey) && rooms.size >= 100) {
    socket.close(1013, "Server full");
    return;
  }
  if (!rooms.has(roomKey))
    rooms.set(roomKey, {
      match: new Match(gameConfig, mapId),
      clients: new Map(),
    });
  const room = rooms.get(roomKey);
  const id = randomUUID();
  if (!room.match.addPlayer(id)) {
    socket.close(1008, "Room full (6 players)");
    return;
  }
  room.clients.set(id, socket);
  socket.send(JSON.stringify({ type: "welcome", id, room: name, mapId }));
  let messages = 0;
  let windowStart = Date.now();
  socket.alive = true;
  socket.on("pong", () => {
    socket.alive = true;
  });
  socket.on("message", (data, binary) => {
    if (Date.now() - windowStart >= 1000) {
      messages = 0;
      windowStart = Date.now();
    }
    if (++messages > 100 || binary) {
      socket.close(1008, "Invalid message rate or format");
      return;
    }
    try {
      room.match.command(id, JSON.parse(data.toString()));
    } catch {
      /* Ignore malformed client input. */
    }
  });
  socket.on("error", () => socket.terminate());
  socket.on("close", () => {
    room.clients.delete(id);
    room.match.removePlayer(id);
    if (!room.clients.size) rooms.delete(roomKey);
  });
});
const tick = setInterval(() => {
  for (const room of rooms.values()) {
    room.match.step(1 / gameConfig.network.tickRate);
    const data = JSON.stringify({ type: "state", ...room.match.snapshot() });
    for (const socket of room.clients.values()) {
      if (socket.readyState === WebSocket.OPEN && socket.bufferedAmount < 65536)
        socket.send(data);
    }
  }
}, 1000 / gameConfig.network.tickRate);
const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (!socket.alive) {
      socket.terminate();
      continue;
    }
    socket.alive = false;
    socket.ping();
  }
}, 10000);
http.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log(`Gem Grab server: http://127.0.0.1:${port}`),
);
function shutdown() {
  clearInterval(tick);
  clearInterval(heartbeat);
  for (const socket of wss.clients) socket.terminate();
  wss.close();
  http.close();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
