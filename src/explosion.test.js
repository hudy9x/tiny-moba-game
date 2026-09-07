import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { ExplosionRenderer } from "./combat/explosions.js";
import {
  explosionStage,
  explosionProgress,
} from "./combat/ultimateTimeline.js";

test("six visual phases use the same normalized server timeline", () => {
  assert.deepEqual(
    [0.05, 0.17, 0.3, 0.5, 0.7, 0.9].map(explosionStage),
    [0, 1, 2, 3, 4, 5],
  );
  assert.ok(
    Math.abs(
      explosionProgress(
        { startedAt: 10, duration: 1.2, animationSpeed: 2 },
        10.6,
      ) - 1,
    ) < 1e-10,
  );
});
test("overlapping explosions release per-effect resources and free atlas only after last effect", (t) => {
  const original = globalThis.document;
  const context = new Proxy(
    {},
    {
      get: (target, key) => target[key] ?? (() => {}),
      set: (target, key, value) => ((target[key] = value), true),
    },
  );
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => context }),
  };
  t.after(() => {
    if (original) globalThis.document = original;
    else delete globalThis.document;
  });
  const scene = new THREE.Scene(),
    renderer = new ExplosionRenderer(scene);
  const data = {
    x: 0,
    z: 0,
    radius: 2.4,
    startedAt: 0,
    duration: 1.2,
    animationSpeed: 1,
  };
  renderer.sync(
    [
      { ...data, id: 1 },
      { ...data, id: 2 },
    ],
    0,
  );
  const atlas = renderer.atlas,
    first = renderer.active.get(1);
  let disposed = 0;
  first.texture.addEventListener("dispose", () => disposed++);
  first.sprite.material.addEventListener("dispose", () => disposed++);
  renderer.sync([{ ...data, id: 2 }], 0.3);
  assert.equal(disposed, 2);
  assert.equal(renderer.atlas, atlas);
  assert.ok(atlas.canvas.width > 0);
  renderer.dispose();
  assert.equal(renderer.active.size, 0);
  assert.equal(renderer.atlas, null);
  assert.equal(atlas.canvas.width, 0);
  assert.equal(scene.children.length, 0);
  renderer.sync([{ ...data, id: 3 }], 0.9);
  renderer.serverTime = 2;
  renderer.update();
  assert.equal(renderer.active.size, 0);
  assert.equal(scene.children.length, 0);
});
