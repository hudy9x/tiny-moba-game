import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { WebSocket } from "ws";

function waitFor(socket, predicate, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("message", message);
      reject(new Error("Snapshot timed out"));
    }, timeout);
    function message(data) {
      const state = JSON.parse(data);
      if (predicate(state)) {
        clearTimeout(timer);
        socket.off("message", message);
        resolve(state);
      }
    }
    socket.on("message", message);
  });
}

test(
  "real WebSocket clients share combat, rooms isolate state, and capacity rejects a seventh",
  { timeout: 15000 },
  async (t) => {
    const port = 31000 + Math.floor(Math.random() * 10000);
    const server = spawn(process.execPath, ["socket-server/index.js"], {
      env: { ...process.env, PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const clients = [];
    t.after(() => {
      clients.forEach((s) => s.terminate());
      server.kill();
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Server startup timed out")),
        4000,
      );
      server.stdout.once("data", () => {
        clearTimeout(timer);
        resolve();
      });
      server.once("error", reject);
      server.once("exit", (code) => {
        clearTimeout(timer);
        if (code) reject(new Error(`Server exited ${code}`));
      });
    });
    const connect = async (room) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/ws?room=${room}`);
      clients.push(socket);
      const welcome = await waitFor(socket, (s) => s.type === "welcome");
      return { socket, id: welcome.id };
    };
    const a = await connect("arena");
    let state = await waitFor(a.socket, (s) => s.type === "state");
    assert.ok(state.players.some((p) => p.bot));
    const b = await connect("arena");
    state = await waitFor(
      a.socket,
      (s) =>
        s.type === "state" &&
        s.players.length === 2 &&
        !s.players.some((p) => p.bot),
    );
    assert.notEqual(state.players[0].team, state.players[1].team);
    const hitA = waitFor(
      a.socket,
      (s) =>
        s.type === "state" &&
        s.players.some((p) => p.id === b.id && p.health === 78),
    );
    const hitB = waitFor(
      b.socket,
      (s) =>
        s.type === "state" &&
        s.players.some((p) => p.id === b.id && p.health === 78),
    );
    a.socket.send(
      JSON.stringify({
        type: "skill",
        skill: "basic",
        target: { x: 23, z: 20 },
      }),
    );
    await Promise.all([hitA, hitB]);
    const isolated = await connect("other-room");
    const otherState = await waitFor(
      isolated.socket,
      (s) => s.type === "state",
    );
    assert.equal(otherState.players.length, 2);
    assert.ok(otherState.players.every((p) => p.health === p.maxHealth));
    for (let i = 0; i < 4; i++) await connect("arena");
    const extra = new WebSocket(`ws://127.0.0.1:${port}/ws?room=arena`);
    clients.push(extra);
    const close = await new Promise((resolve) =>
      extra.on("close", (code, reason) =>
        resolve({ code, reason: reason.toString() }),
      ),
    );
    assert.equal(close.code, 1008);
    assert.match(close.reason, /Room full/);
  },
);
