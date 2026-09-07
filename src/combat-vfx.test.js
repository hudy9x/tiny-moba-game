import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { CombatVFX } from "./combat/vfx.js";
import { gameConfig } from "./gameConfig.js";

test("beam meshes share assets, follow projectile direction, and recycle on removal", () => {
  const scene = new THREE.Scene(),
    vfx = new CombatVFX(scene);
  vfx.sync([{ id: 1, x: 2, z: 3, dx: 1, dz: 0 }]);
  const beam = vfx.beams.get(1);
  assert.equal(beam.rotation.y, Math.PI / 2);
  assert.equal(beam.children.length, 2);
  assert.equal(beam.children[1].material.color.getHexString(), "ffffff");
  vfx.sync([]);
  assert.equal(vfx.freeBeams.length, 1);
  assert.equal(beam.parent, null);
  vfx.sync([{ id: 2, x: 4, z: 5, dx: 0, dz: 1 }]);
  assert.equal(vfx.beams.get(2), beam);
  vfx.dispose();
  assert.equal(scene.children.length, 0);
});
test("impact sparks remain bounded and all effects expire without scene leaks", () => {
  const scene = new THREE.Scene(),
    vfx = new CombatVFX(scene);
  for (let i = 0; i < 40; i++) vfx.impact({ x: 0, z: 0 });
  vfx.shot({ x: 0, z: 0, dx: 1, dz: 0 });
  vfx.update(0.01);
  assert.equal(vfx.sparks.count, gameConfig.vfx.maxSparks);
  vfx.update(gameConfig.vfx.sparkLifetime);
  assert.equal(vfx.sparks.count, 0);
  assert.equal(vfx.flashes.length, 0);
  vfx.dispose();
  assert.equal(scene.children.length, 0);
});
