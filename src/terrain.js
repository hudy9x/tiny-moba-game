import * as THREE from "three";
import { noise } from "./world.js";
export function buildTerrain(scene, world) {
  const box = new THREE.BoxGeometry(1, 1, 1);
  const dummy = new THREE.Object3D();
  function batch(items, material) {
    const mesh = new THREE.InstancedMesh(box, material, items.length);
    items.forEach((a, i) => {
      dummy.position.set(...a.p);
      dummy.scale.set(...a.s);
      dummy.rotation.set(0, a.r || 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (a.c) mesh.setColorAt(i, new THREE.Color(a.c));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }
  const earth = [],
    grass = [],
    water = [],
    trunks = [],
    leaves = [],
    details = [];
  const palette = world.map.palette;
  const greens = palette.land;
  for (const t of world.tiles) {
    const { x, z } = t;
    earth.push({
      p: [x, -0.65, z],
      s: [0.994, 0.8, 0.994],
      c: t.water ? "#739777" : palette.earth[Math.floor(noise(x + 3, z) * 3)],
    });
    if (t.water) {
      water.push({
        p: [x, -0.27, z],
        s: [1, 0.28, 1],
        c: palette.water[Math.floor(noise(x, z) * 3)],
      });
      if (noise(x + 6, z) > 0.8)
        details.push({
          p: [x, -0.119, z],
          s: [0.3, 0.007, 0.025],
          c: "#8fd9cc",
        });
      continue;
    }
    grass.push({
      p: [x, -0.12, z],
      s: [0.985, 0.27, 0.985],
      c: t.sand
        ? palette.sand
        : greens[Math.floor(noise(x, z) * greens.length)],
    });
    if (t.tree && world.map.obstacle === "rock") {
      const h = 0.8 + noise(x, z) * 1.3;
      leaves.push({
        p: [x, h / 2, z],
        s: [0.85, h, 0.85],
        c: palette.foliage[0],
      });
      leaves.push({
        p: [x + 0.1, h + 0.12, z],
        s: [0.65, 0.25, 0.67],
        c: palette.foliage[2],
      });
    } else if (t.tree) {
      const h = 1.5 + noise(x + 2, z) * 0.9;
      trunks.push({
        p: [x, h * 0.36, z],
        s: [0.19, h * 0.72, 0.19],
        c: "#705333",
      });
      const base = noise(x, z) > 0.87 ? palette.foliage[0] : palette.foliage[1];
      for (let j = 0; j < 4; j++) {
        const width = [1.15, 1.4, 1.1, 0.7][j];
        leaves.push({
          p: [x, h * 0.54 + j * 0.31, z],
          s: [width, 0.4, width * 0.88],
          c: j === 3 ? palette.foliage[3] : j === 2 ? palette.foliage[2] : base,
        });
      }
      leaves.push({
        p: [x - 0.4, h * 0.72, z + 0.12],
        s: [0.43, 0.45, 0.6],
        c: palette.foliage[1],
      });
    } else if (noise(x + 18, z) > 0.91 && !t.sand) {
      for (let i = 0; i < 3; i++)
        details.push({
          p: [x - 0.25 + i * 0.15, 0.1, z + 0.1],
          s: [0.04, 0.19 + noise(x + i, z) * 0.15, 0.04],
          c: "#759c3d",
        });
    }
  }
  batch(earth, new THREE.MeshLambertMaterial());
  batch(grass, new THREE.MeshLambertMaterial());
  const wm = batch(
    water,
    new THREE.MeshPhongMaterial({
      transparent: true,
      opacity: 0.83,
      shininess: 30,
      specular: 0x123432,
    }),
  );
  wm.castShadow = false;
  batch(trunks, new THREE.MeshLambertMaterial());
  batch(leaves, new THREE.MeshLambertMaterial());
  batch(details, new THREE.MeshLambertMaterial());
  return wm;
}
