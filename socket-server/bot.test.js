import test from "node:test";
import assert from "node:assert/strict";
import { Match } from "./match.js";
test("battle bot navigates walkable tiles and attacks; training stays idle", () => {
  const m = new Match();
  m.mode = "battle";
  m.addPlayer("human");
  const bot = [...m.players.values()].find((p) => p.bot);
  const start = { x: bot.x, z: bot.z };
  let shot = false;
  for (let i = 0; i < 90; i++) {
    m.step(1 / 30);
    shot ||= m.events.some((e) => e.type === "shot");
    assert.ok(m.world.canWalk(bot.tile.x, bot.tile.z));
  }
  assert.ok(shot);
  assert.ok(bot.x !== start.x || bot.z !== start.z);
  const training = new Match();
  training.mode = "training";
  training.addPlayer("human");
  const idle = [...training.players.values()].find((p) => p.bot);
  training.step(0.1);
  assert.equal(idle.motion, null);
  assert.equal(training.projectiles.length, 0);
});
test("costume values are validated and synchronized", () => {
  const m = new Match();
  m.addPlayer("a");
  m.command("a", {
    type: "costume",
    costume: { color: "bad", eye: "bad", hat: "winter" },
  });
  assert.deepEqual(m.snapshot().players.find((p) => p.id === "a").costume, {
    color: "#f2684a",
    eye: "round",
    hat: "winter",
    shoes: "classic",
  });
});
