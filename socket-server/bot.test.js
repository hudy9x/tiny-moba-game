import test from "node:test";
import assert from "node:assert/strict";
import { Match } from "./match.js";
test("FFA never adds bots or training dummies", () => {
  const m=new Match();m.addPlayer('human');
  assert.equal(m.players.size,1);assert.equal(m.mode,'ffa');
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
