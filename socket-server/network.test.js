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
  "real WebSocket clients all join one FFA arena regardless of legacy room or map",
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
    const connect = async (room, map = "greenwood") => {
      const socket = new WebSocket(
        `ws://127.0.0.1:${port}/ws?room=${room}&map=${map}`,
      );
      clients.push(socket);
      const welcome = await waitFor(socket, (s) => s.type === "welcome");
      return { socket, id: welcome.id };
    };
    const a = await connect("arena");
    let state = await waitFor(a.socket, (s) => s.type === "state");
    assert.equal(state.players.length,1);
    const b=await connect('different-room','canyon');
    state=await waitFor(a.socket,s=>s.type==='state' && s.players.length===2);
    assert.equal(state.mapId,'greenwood');
    assert.equal(state.mode,'ffa');
    assert.equal(state.phase,"waiting");
    b.socket.send(JSON.stringify({type:"start"}));
    state=await waitFor(a.socket,s=>s.type==="state" && s.phase==="running");
    assert.ok(state.endsAt-state.time>295);
    const bState=await waitFor(b.socket,s=>s.type==='state');
    assert.deepEqual(bState.players.map(p=>p.id),state.players.map(p=>p.id));
    a.socket.send(JSON.stringify({type:'name',name:'Arena Alice'}));
    await waitFor(b.socket,s=>s.type==='state' && s.players.some(p=>p.name==='Arena Alice'));
    for(let i=0;i<5;i++)await connect('legacy'+i);
    state=await waitFor(a.socket,s=>s.type==='state' && s.players.length===7);
    assert.ok(state.players.every(p=>!p.bot));
    a.socket.send(JSON.stringify({type:"end"}));
    await waitFor(b.socket,s=>s.type==="state" && s.phase==="ended");
    b.socket.send(JSON.stringify({type:"start",mapId:"winter"}));
    const changed=await waitFor(a.socket,s=>s.type==="state" && s.phase==="running" && s.mapId==="winter");
    assert.ok(changed.players.some(p=>p.id===a.id));
    assert.ok(changed.players.some(p=>p.id===b.id));
    a.socket.send(JSON.stringify({type:"map",mapId:"river"}));
    await waitFor(b.socket,s=>s.type==="state" && s.mapId==="river" && s.phase==="running");
    const late=await connect("late");
    const lateState=await waitFor(late.socket,s=>s.type==="state");
    assert.equal(lateState.mapId,"river");
  },
);
