import test from "node:test";
import assert from "node:assert/strict";
import { Match } from "./match.js";
import { gameConfig } from "../src/gameConfig.js";

function advance(match, seconds) {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) match.step(1 / 60);
}
function position(p, x, z) {
  Object.assign(p, {
    x,
    z,
    tile: { x, z },
    motion: null,
    input: { x: 0, z: 0 },
  });
}
function pair() {
  const match = new Match();
  // Combat/rule scenarios set inventory explicitly; gem spawning has separate tests.
  match.nextGem = Infinity;
  return { match, a: match.addPlayer("a"), b: match.addPlayer("b") };
}

test("one human gets an enemy dummy; two get no dummy; 3v3 room caps at six", () => {
  const m = new Match();
  const a = m.addPlayer("a");
  assert.equal(m.players.get("dummy").maxHealth, 1000);
  assert.notEqual(m.players.get("dummy").team, a.team);
  for (let i = 1; i < 6; i++) m.addPlayer(String(i));
  assert.equal(m.players.has("dummy"), false);
  assert.equal(m.addPlayer("full"), null);
  assert.equal([...m.players.values()].filter((p) => p.team === 0).length, 3);
  for (let i = 1; i < 6; i++) m.removePlayer(String(i));
  assert.ok(m.players.has("dummy"));
});

test("movement is speed-limited, cardinal, and stops on stale input", () => {
  const { match: m, a } = pair();
  m.command(a.id, { type: "move", direction: { x: 100, z: 0 } });
  advance(m, 0.1);
  assert.equal(a.x, 23);
  m.command(a.id, { type: "move", direction: { x: 1, z: 0 } });
  m.step(0.05);
  assert.ok(Math.abs(a.x - 23.2625) < 0.00001);
  advance(m, 2);
  assert.equal(a.x, 25);
  assert.equal(a.motion, null);
});

test("water and trees block normal movement and dash cannot skip either", () => {
  const { match: m, a } = pair();
  for (const type of ["water", "tree"]) {
    const obstacle = m.world.tiles.find(
      (t) => t[type] && m.world.canWalk(t.x - 1, t.z),
    );
    position(a, obstacle.x - 1, obstacle.z);
    a.facing = { x: 1, z: 0 };
    a.cooldowns.dash = 0;
    m.command(a.id, { type: "move", direction: a.facing });
    m.command(a.id, { type: "skill", skill: "dash" });
    advance(m, 0.3);
    assert.equal(a.x, obstacle.x - 1);
    assert.equal(a.z, obstacle.z);
  }
});

test("projectiles damage opponents once and respect cooldowns and range", () => {
  const { match: m, a, b } = pair();
  position(a, 23, 24);
  position(b, 25, 24);
  const cmd = { type: "skill", skill: "basic", target: { x: b.x, z: b.z } };
  m.command(a.id, cmd);
  m.command(a.id, cmd);
  assert.equal(m.projectiles.length, 1);
  advance(m, 0.25);
  assert.equal(b.health, 78);
  assert.equal(m.projectiles.length, 0);
  assert.ok(a.lastCombat > 0);
  position(b, 40, 24);
  advance(m, 0.3);
  m.command(a.id, cmd);
  advance(m, 1);
  assert.equal(m.projectiles.length, 0);
  assert.equal(b.health, 78);
});

test("friendly fire is disabled", () => {
  const { match: m, a, b } = pair();
  const ally = m.addPlayer("ally");
  assert.equal(ally.team, a.team);
  position(a, 23, 24);
  position(ally, 24, 24);
  position(b, 25, 24);
  m.command(a.id, { type: "skill", skill: "basic", target: b });
  advance(m, 0.25);
  assert.equal(ally.health, 100);
  assert.equal(b.health, 78);
});

test("ultimate clamps target range and only damages opponents in radius", () => {
  const { match: m, a, b } = pair();
  position(a, 23, 24);
  position(b, 25, 24);
  m.command(a.id, {
    type: "skill",
    skill: "ultimate",
    target: { x: 25, z: 24 },
  });
  assert.equal(b.health, 100);
  advance(m, 0.15);
  assert.equal(b.health, 35);
  assert.equal(a.health, 100);
  m.command(a.id, {
    type: "skill",
    skill: "ultimate",
    target: { x: 25, z: 24 },
  });
  assert.equal(b.health, 35);
  a.cooldowns.ultimate = 0;
  m.command(a.id, {
    type: "skill",
    skill: "ultimate",
    target: { x: 999, z: 24 },
  });
  assert.equal(m.explosions.at(-1).x, 30);
});

test("dash distance, speed, and cooldown come from configuration", () => {
  const { match: m, a } = pair();
  a.facing = { x: 1, z: 0 };
  m.command(a.id, { type: "skill", skill: "dash" });
  m.step(0.05);
  assert.ok(Math.abs(a.x - 23.85) < 0.00001);
  advance(m, 0.2);
  assert.equal(a.x, 26);
  m.command(a.id, { type: "skill", skill: "dash" });
  assert.equal(a.motion, null);
});

test("regeneration waits three seconds after taking or dealing damage", () => {
  const { match: m, a, b } = pair();
  a.health = 50;
  b.health = 50;
  m.damage(b, a, 10);
  advance(m, 2.9);
  assert.equal(a.health, 50);
  assert.equal(b.health, 40);
  advance(m, 0.3);
  assert.ok(a.health > 50);
  assert.ok(b.health > 40);
});

test("mine periodically spawns up to its cap and pickup is counted only once", () => {
  const cfg = structuredClone(gameConfig);
  cfg.match.gemCap = 2;
  cfg.match.gemBatchMin = cfg.match.gemBatchMax = 2;
  const m = new Match(cfg, "greenwood", () => 0.5),
    a = m.addPlayer("a");
  position(a, 35, 23);
  advance(m, 13);
  assert.equal(m.gems.length, 2);
  for (const gem of [...m.gems]) {
    position(a, gem.x, gem.z);
    m.step(0.01);
  }
  assert.equal(a.gems, 2);
  assert.equal(m.gems.length, 0);
  m.step(0.01);
  assert.equal(a.gems, 2);
});

test("death drops all gems, blocks skills, and respawns with full health", () => {
  const { match: m, a, b } = pair();
  a.gems = 12;
  m.damage(a, b, 100);
  assert.equal(a.gems, 0);
  assert.equal(m.gems[0].value, 12);
  assert.equal(m.gems[0].x, a.x);
  m.command(a.id, { type: "skill", skill: "basic", target: b });
  assert.equal(m.projectiles.length, 0);
  advance(m, 2.9);
  assert.equal(a.health, 0);
  // Move the enemy over the dropped pile to steal it.
  position(b, a.x, a.z);
  m.step(0.01);
  assert.equal(b.gems, 12);
  assert.equal(m.gems.length, 0);
  advance(m, gameConfig.match.respawnDelay - 2.9);
  assert.equal(a.health, 100);
  assert.equal(a.gems, 0);
});

test("combined team gems start countdown; death cancels; steal transfers countdown", () => {
  const { match: m, a, b } = pair();
  const ally = m.addPlayer("ally");
  position(ally, 27, 24);
  a.gems = 6;
  ally.gems = 4;
  m.step(0.01);
  assert.equal(m.countdown.team, a.team);
  advance(m, 5);
  assert.equal(m.winner, null);
  m.damage(a, b, 100);
  m.step(0.01);
  assert.equal(m.countdown, null);
  b.gems = 4;
  position(b, a.x, a.z);
  m.step(0.01);
  assert.equal(b.gems, 10);
  assert.equal(m.countdown.team, b.team);
});

test("15-second hold wins, freezes play, then restarts the round", () => {
  const { match: m, a, b } = pair();
  a.gems = 10;
  m.step(0.01);
  advance(m, 14.9);
  assert.equal(m.winner, null);
  advance(m, 0.2);
  assert.equal(m.winner, a.team);
  m.command(b.id, { type: "skill", skill: "ultimate", target: a });
  assert.equal(a.health, 100);
  advance(m, 8.1);
  assert.equal(m.winner, null);
  assert.deepEqual(m.totals(), [0, 0]);
});

test("disconnect drops gems and cancels countdown; simultaneous threshold is contested", () => {
  const { match: m, a, b } = pair();
  a.gems = b.gems = 10;
  m.step(0.01);
  assert.equal(m.countdown, null);
  b.gems = 0;
  m.step(0.01);
  assert.equal(m.countdown.team, a.team);
  m.removePlayer(a.id);
  assert.equal(m.countdown, null);
  assert.equal(m.gems[0].value, 10);
});

test("malformed skill and movement commands cannot alter health, gems, or positions", () => {
  const { match: m, a } = pair();
  for (const cmd of [
    null,
    {},
    { type: "skill", skill: "__proto__", target: {} },
    { type: "skill", skill: "basic", target: { x: NaN, z: 0 } },
    { type: "move", direction: { x: 1, z: 1 } },
    { type: "health", health: 999, gems: 99 },
  ]) {
    m.command(a.id, cmd);
  }
  assert.equal(a.health, 100);
  assert.equal(a.gems, 0);
  assert.equal(a.x, 23);
  assert.equal(m.projectiles.length, 0);
});

test("a brief key tap starts exactly one complete grid step", () => {
  const { match: m, a } = pair();
  m.command(a.id, { type: "move", direction: { x: 1, z: 0 } });
  m.command(a.id, { type: "move", direction: { x: 0, z: 0 } });
  advance(m, 1);
  assert.equal(a.x, 24);
  assert.equal(a.motion, null);
});

test("dead status freezes input, snaps gem drops to death tile, and resets at team spawn", () => {
  const { match: m, a, b } = pair();
  position(a, 24.4, 24);
  a.gems = 7;
  m.damage(a, b, 100);
  assert.equal(a.status, "dead");
  assert.deepEqual([m.gems[0].x, m.gems[0].z, m.gems[0].value], [24, 24, 7]);
  m.command(a.id, { type: "move", direction: { x: 1, z: 0 } });
  m.command(a.id, { type: "skill", skill: "dash" });
  advance(m, 4.9);
  assert.equal(a.x, 24.4);
  assert.equal(a.health, 0);
  advance(m, 0.2);
  assert.equal(a.status, "alive");
  assert.equal(a.health, 100);
  assert.equal(a.x, m.world.spawns[a.team].x);
  assert.equal(a.z, m.world.spawns[a.team].z);
  assert.equal(a.gems, 0);
});

test("respawn shield rejects basic and ultimate damage for two seconds", () => {
  const { match: m, a, b } = pair();
  m.damage(a, b, 100);
  advance(m, 5.01);
  assert.equal(a.status, "alive");
  assert.ok(a.invulnerableUntil > m.time);
  m.command(b.id, { type: "skill", skill: "ultimate", target: a });
  m.command(b.id, { type: "skill", skill: "basic", target: a });
  advance(m, 0.5);
  assert.equal(a.health, 100);
  assert.ok(m.events.some((e) => e.type === "impact" && e.kind === "shield"));
  m.damage(a, b, 50);
  assert.equal(a.health, 100);
  advance(m, 1.6);
  m.damage(a, b, 22);
  assert.equal(a.health, 78);
});

test("random batches cover 1–4 gems and all scatter destinations are walkable and in radius", () => {
  for (const [random, count] of [
    [0, 1],
    [0.3, 2],
    [0.6, 3],
    [0.999, 4],
  ]) {
    const m = new Match(gameConfig, "greenwood", () => random);
    const a = m.addPlayer("a");
    position(a, 35, 23);
    advance(m, 4.01);
    assert.equal(m.gems.length, count);
    const tiles = new Set();
    for (const g of m.gems) {
      assert.ok(m.world.canWalk(g.x, g.z));
      const d = Math.hypot(g.x - m.world.mine.x, g.z - m.world.mine.z);
      assert.ok(d > 0 && d <= gameConfig.match.gemScatterRadius);
      assert.equal(
        g.expiresAt,
        m.nextGem -
          gameConfig.match.gemSpawnInterval +
          gameConfig.match.gemDespawnTime,
      );
      tiles.add(`${g.x},${g.z}`);
    }
    assert.equal(tiles.size, count);
  }
});

test("uncollected mine and dropped gems expire at five seconds, even during victory", () => {
  const m = new Match(gameConfig, "greenwood", () => 0);
  const a = m.addPlayer("a");
  position(a, 35, 23);
  advance(m, 4.01);
  const gem = m.gems[0];
  m.nextGem = Infinity;
  advance(m, 4.8);
  assert.ok(m.gems.some((g) => g.id === gem.id));
  advance(m, 0.3);
  assert.equal(m.gems.length, 0);
  a.gems = 8;
  m.dropGems(a);
  assert.equal(m.gems[0].value, 8);
  m.winner = 0;
  m.restartAt = m.time + 20;
  advance(m, 5.1);
  assert.equal(m.gems.length, 0);
});

test("expired gems cannot be collected on the expiry tick", () => {
  const m = new Match(gameConfig, "greenwood", () => 0);
  const a = m.addPlayer("a");
  position(a, 35, 23);
  advance(m, 4.01);
  const gem = m.gems[0];
  m.nextGem = Infinity;
  m.time = gem.expiresAt - 0.01;
  position(a, gem.x, gem.z);
  m.step(0.02);
  assert.equal(a.gems, 0);
  assert.equal(m.gems.length, 0);
});

test("projectile impacts emit sparks on obstacles and at entity collision points", () => {
  const { match: m, a, b } = pair();
  position(a, 23, 24);
  position(b, 25, 24);
  m.command(a.id, { type: "skill", skill: "basic", target: b });
  advance(m, 0.3);
  const hit = m.events.find((e) => e.type === "impact");
  const damage = m.events.find((e) => e.type === "damage");
  assert.equal(hit.kind, "entity");
  assert.equal(hit.x, damage.x);
  assert.equal(hit.z, damage.z);
  assert.ok(m.events.some((e) => e.type === "shot"));
  m.events = [];
  const obstacle = m.world.tiles.find(
    (t) => t.tree && m.world.canWalk(t.x - 1, t.z),
  );
  position(a, obstacle.x - 1, obstacle.z);
  a.cooldowns.basic = 0;
  m.command(a.id, { type: "skill", skill: "basic", target: obstacle });
  advance(m, 0.2);
  assert.ok(m.events.some((e) => e.type === "impact" && e.kind === "obstacle"));
  assert.equal(m.projectiles.length, 0);
});
