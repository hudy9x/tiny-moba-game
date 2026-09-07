import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, START, SIZE } from "./world.js";
test("world is deterministic and start is walkable", () => {
  const a = createWorld();
  assert.equal(a.tiles.length, SIZE * SIZE);
  assert.deepEqual(a.tiles, createWorld().tiles);
  assert.ok(a.canWalk(START.x, START.z));
});
test("water, trees, and world edges reject movement", () => {
  const w = createWorld();
  assert.ok(w.tiles.some((t) => t.water));
  assert.ok(w.tiles.some((t) => t.tree));
  for (const t of w.tiles)
    assert.equal(w.canWalk(t.x, t.z), !t.water && !t.tree);
  assert.equal(w.canWalk(-1, 0), false);
  assert.equal(w.canWalk(SIZE, 0), false);
});
test("spawn has a connected area to explore", () => {
  const w = createWorld(),
    seen = new Set(),
    q = [START];
  while (q.length) {
    const t = q.pop(),
      key = `${t.x},${t.z}`;
    if (seen.has(key) || !w.canWalk(t.x, t.z)) continue;
    seen.add(key);
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      q.push({ x: t.x + dx, z: t.z + dz });
  }
  assert.ok(seen.size > 700);
});

import { maps } from "./maps/registry.js";
import { Match } from "../socket-server/match.js";
import { gameConfig } from "./gameConfig.js";
for (const map of maps)
  test(`${map.name}: valid JSON grid and reachable mine, spawns, dummy`, () => {
    assert.equal(map.rows.length, map.size);
    map.rows.forEach((row) => {
      assert.equal(row.length, map.size);
      assert.match(row, /^[.~T:]+$/);
    });
    const w = createWorld(map.id),
      server = new Match(gameConfig, map.id, () => 0.8);
    assert.deepEqual(w.tiles, server.world.tiles);
    const seen = new Set(),
      queue = [w.mine];
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i],
        k = `${p.x},${p.z}`;
      if (seen.has(k) || !w.canWalk(p.x, p.z)) continue;
      seen.add(k);
      for (const [x, z] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
        queue.push({ x: p.x + x, z: p.z + z });
    }
    for (const p of [w.mine, ...w.spawns, w.dummy])
      assert.ok(seen.has(`${p.x},${p.z}`));
    assert.ok(server.scatterCandidates.length >= 4);
    const a = server.addPlayer("a"),
      b = server.addPlayer("b");
    assert.deepEqual([a.x, a.z], [w.spawns[0].x, w.spawns[0].z]);
    assert.ok(w.spawns.some(s=>s.x===b.x && s.z===b.z));
    assert.notDeepEqual([a.x,a.z],[b.x,b.z]);
  });
test("unknown map IDs fail explicitly", () =>
  assert.throws(() => createWorld("unknown"), /Unknown map/));
