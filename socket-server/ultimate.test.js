import test from "node:test";
import assert from "node:assert/strict";
import { Match } from "./match.js";
import { knockback } from "./ultimate.js";
import { gameConfig } from "../src/gameConfig.js";
function setup(speed = 1) {
  const c = structuredClone(gameConfig);
  c.skills.ultimate.animationSpeed = speed;
  const m = new Match(c);
  m.nextGem = Infinity;
  const a = m.addPlayer("a"),
    b = m.addPlayer("b");
  Object.assign(a, { x: 23, z: 24, tile: { x: 23, z: 24 } });
  Object.assign(b, { x: 25, z: 24, tile: { x: 25, z: 24 } });
  return { m, a, b };
}
function advance(m, t) {
  for (let elapsed = 0; elapsed < t - 1e-9; elapsed += 0.01)
    m.step(Math.min(0.01, t - elapsed));
}
function cast(m, a, target) {
  m.command(a.id, { type: "skill", skill: "ultimate", target });
}

test("ignition has no damage; expansion hits once and knockback finishes on a valid tile", () => {
  const { m, a, b } = setup();
  cast(m, a, b);
  assert.equal(m.explosions.length, 1);
  assert.equal(b.health, 100);
  advance(m, 0.1);
  assert.equal(b.health, 100);
  advance(m, 0.05);
  assert.equal(b.health, 35);
  assert.ok(b.motion?.knockback);
  m.command(b.id, { type: "move", direction: { x: 1, z: 0 } });
  assert.deepEqual(b.input, { x: 0, z: 0 });
  advance(m, 0.5);
  assert.equal(b.health, 35);
  assert.equal(b.z, 26);
  assert.equal(b.x, 25);
  assert.ok(m.world.canWalk(b.x, b.z));
  assert.equal(m.events.filter((e) => e.type === "damage").length, 1);
  advance(m, 0.6);
  assert.equal(m.explosions.length, 0);
});
test("animationSpeed scales both damage window and lifetime", () => {
  const { m, a, b } = setup(2);
  cast(m, a, b);
  advance(m, 0.05);
  assert.equal(b.health, 100);
  advance(m, 0.02);
  assert.equal(b.health, 35);
  advance(m, 0.54);
  assert.equal(m.explosions.length, 0);
});
test("peak checks new entrants, skips allies and shields, and never hits after fragmentation", () => {
  const { m, a, b } = setup();
  b.x = 29;
  b.tile.x = 29;
  const ally = m.addPlayer("ally");
  Object.assign(ally, { x: 25, z: 24 });
  cast(m, a, { x: 25, z: 24 });
  advance(m, 0.2);
  assert.equal(b.health, 100);
  b.x = 26;
  b.tile.x = 26;
  advance(m, 0.05);
  assert.equal(b.health, 35);
  assert.equal(ally.health, 100);
  const late = m.addPlayer("late");
  late.x = 35;
  late.z = 24;
  late.tile = { x: 35, z: 24 };
  advance(m, 0.3);
  late.x = 25;
  late.tile.x = 25;
  advance(m, 0.2);
  assert.equal(late.health, 100);
});
test("respawn shield prevents both damage and displacement", () => {
  const { m, a, b } = setup();
  b.invulnerableUntil = 3;
  cast(m, a, b);
  advance(m, 0.6);
  assert.equal(b.health, 100);
  assert.deepEqual([b.x, b.z], [25, 24]);
  assert.equal(b.motion, null);
});
test("knockback cannot cross water, trees, or diagonal solid corners", () => {
  const { m, a, b } = setup();
  for (const kind of ["water", "tree"]) {
    const t = m.world.tiles.find(
      (t) => t[kind] && m.world.canWalk(t.x - 1, t.z),
    );
    Object.assign(b, {
      x: t.x - 1,
      z: t.z,
      tile: { x: t.x - 1, z: t.z },
      motion: null,
      knockbackPath: [],
    });
    knockback(m, b, { x: b.x - 1, z: b.z }, { x: 1, z: 0 });
    advance(m, 0.5);
    assert.equal(b.x, t.x - 1);
    assert.equal(b.z, t.z);
  }
  // Both axes of diagonal pushes use cardinal segments, checked individually.
  Object.assign(b, {
    x: 24,
    z: 24,
    tile: { x: 24, z: 24 },
    motion: null,
    knockbackPath: [],
  });
  knockback(m, b, { x: 23, z: 23 }, { x: 1, z: 0 });
  let old = { x: b.x, z: b.z };
  for (let i = 0; i < 60; i++) {
    m.step(0.01);
    assert.ok(m.world.canWalk(Math.round(b.x), Math.round(b.z)));
    assert.ok(Math.abs(b.x - old.x) < 1e-8 || Math.abs(b.z - old.z) < 1e-8);
    old = { x: b.x, z: b.z };
  }
});
test("all enemies in radius are hit once and lethal victims stay dead without knockback", () => {
  const { m, a, b } = setup();
  const ally = m.addPlayer("ally"),
    enemy = m.addPlayer("enemy");
  Object.assign(enemy, { x: 25, z: 23, tile: { x: 25, z: 23 } });
  b.health = 40;
  cast(m, a, { x: 25, z: 24 });
  advance(m, 0.35);
  assert.equal(b.status, "dead");
  assert.equal(b.motion, null);
  assert.deepEqual(b.knockbackPath, []);
  assert.equal(enemy.health, 35);
  assert.equal(ally.health, 100);
});
test("casting on self is allowed; target snaps to a tile; cleanup on restart and late snapshots", () => {
  const { m, a } = setup();
  cast(m, a, a);
  assert.deepEqual([m.explosions[0].x, m.explosions[0].z], [23, 24]);
  const snapshot = m.snapshot();
  assert.equal(snapshot.explosions.length, 1);
  assert.equal("hit" in snapshot.explosions[0], false);
  assert.equal(snapshot.explosions[0].animationSpeed, 1);
  m.restart();
  assert.equal(m.explosions.length, 0);
  a.cooldowns.ultimate = 0;
  cast(m, a, { x: 25.3, z: 24.2 });
  assert.deepEqual([m.explosions[0].x, m.explosions[0].z], [25, 24]);
});
