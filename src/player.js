import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { gameConfig } from "./gameConfig.js";
export class Player {
  constructor(scene, world, onStep) {
    this.world = world;
    this.onStep = onStep;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.tile = { ...this.world.spawns[0] };
    this.group.position.set(
      this.world.spawns[0].x,
      0.05,
      this.world.spawns[0].z,
    );
    this.progress = 1;
    this.skin = "pip";
    this.build();
  }
  build() {
    while (this.group.children.length) {
      const c = this.group.children[0];
      this.group.remove(c);
      c.geometry?.dispose();
      c.material?.dispose();
    }
    const sprout = this.skin === "sprout";
    const add = (w, h, d, color, x, y, z, round = 0) => {
      const m = new THREE.Mesh(
        round
          ? new RoundedBoxGeometry(w, h, d, 2, round)
          : new THREE.BoxGeometry(w, h, d),
        new THREE.MeshLambertMaterial({ color }),
      );
      m.position.set(x, y, z);
      m.castShadow = true;
      this.group.add(m);
      return m;
    };
    add(
      0.67,
      0.67,
      0.55,
      this.costume?.color || (sprout ? "#f2f0db" : "#f2684a"),
      0,
      0.6,
      0,
      0.09,
    );
    add(
      0.49,
      0.33,
      0.035,
      sprout ? "#e2e5cc" : "#ffdbaf",
      0,
      0.62,
      0.285,
      0.04,
    );
    add(
      0.046,
      this.costume?.eye === "sleepy" ? 0.018 : 0.062,
      0.025,
      this.costume?.eye === "bright" ? "#377ace" : "#303a32",
      -0.135,
      0.65,
      0.31,
      0.01,
    );
    add(
      0.046,
      ["sleepy", "wink"].includes(this.costume?.eye) ? 0.018 : 0.062,
      0.025,
      this.costume?.eye === "bright" ? "#377ace" : "#303a32",
      0.135,
      0.65,
      0.31,
      0.01,
    );
    if (["glasses", "sunglasses"].includes(this.costume?.eye)) {
      for(const x of [-0.135,0.135]) {
        if(this.costume.eye === "sunglasses") add(0.18,0.13,0.035,"#202f42",x,.65,.34,.025);
        else {
          for(const y of [.585,.715])add(.19,.025,.035,"#614936",x,y,.34);
          for(const dx of [-.085,.085])add(.025,.13,.035,"#614936",x+dx,.65,.34);
        }
      }
      add(.1,.025,.035,"#303a32",0,.66,.34);
    }
    add(0.035, 0.035, 0.038, "#eabf97", 0, 0.56, 0.31, 0.01);
    add(0.53, 0.14, 0.4, sprout ? "#d3d8c4" : "#39433a", 0, 0.2, 0, 0.035);
    const shoe = {
      classic: [.16,.16,.22,sprout ? "#98bd3d" : "#e8573c"],
      sneakers: [.20,.15,.30,"#faf8e9"],
      boots: [.19,.27,.25,"#6d4937"],
      slippers: [.24,.12,.29,"#eaaac0"],
    }[this.costume?.shoes || "classic"];
    this.feet = [-.19,.19].map(x=>add(shoe[0],shoe[1],shoe[2],shoe[3],x,shoe[1]/2,.1,.035));
    if(this.costume?.hat === "tophat") {
      add(.8,.07,.65,"#283244",0,.97,0,.02);add(.48,.38,.42,"#283244",0,1.17,0,.03);
      add(.49,.07,.43,"#cd6b6b",0,1.04,0);
    }
    if(this.costume?.hat === "crown") {
      add(.65,.12,.5,"#efbf42",0,1,0);
      for(const x of [-.25,0,.25])add(.1,.18,.1,"#ffe284",x,1.12,.21);
    }
    if(this.costume?.hat === "headphones") {
      add(.75,.07,.16,"#343b54",0,.97,0);
      for(const x of [-.37,.37])add(.12,.28,.23,"#9771c9",x,.78,0,.035);
    }
    if (["cap", "winter"].includes(this.costume?.hat)) {
      add(0.73, 0.17, 0.64, "#354e74", 0, 0.98, 0, 0.03);
      if (this.costume.hat === "winter")
        add(0.18, 0.18, 0.18, "#ffffff", 0, 1.15, 0, 0.04);
      else add(0.5, 0.05, 0.3, "#354e74", 0, 0.93, 0.36);
    }
    if (this.costume?.hat === "sprout" || (!this.costume && sprout)) {
      const a = add(0.13, 0.29, 0.1, "#88b942", -0.08, 1.02, 0, 0.035);
      a.rotation.z = 0.55;
      const b = add(0.13, 0.25, 0.1, "#a0cb4c", 0.08, 1, 0, 0.03);
      b.rotation.z = -0.55;
    }
  }
  setSkin(skin) {
    this.skin = skin;
    this.build();
  }
  move(dx, dz) {
    if (this.progress < 1) return false;
    const x = this.tile.x + dx,
      z = this.tile.z + dz;
    if (!this.world.canWalk(x, z)) return false;
    this.from = this.group.position.clone();
    this.tile = { x, z };
    this.progress = 0;
    this.group.rotation.y = Math.atan2(dx, dz);
    return true;
  }
  update(dt, time) {
    if (this.progress < 1) {
      this.progress = Math.min(
        1,
        this.progress + dt * gameConfig.player.moveSpeed,
      );
      const t = this.progress;
      this.group.position.lerpVectors(
        this.from,
        new THREE.Vector3(this.tile.x, 0.05, this.tile.z),
        t,
      );
      this.group.position.y = 0.05 + Math.sin(t * Math.PI) * 0.095;
      this.feet.forEach(
        (f, i) =>
          (f.position.z = 0.1 + Math.sin(t * Math.PI * 2 + i * Math.PI) * 0.08),
      );
      if (t === 1) this.onStep(this.tile);
    } else {
      this.group.position.y = 0.05 + Math.sin(time * 2) * 0.013;
    }
  }
  reset() {
    this.tile = { ...this.world.spawns[0] };
    this.progress = 1;
    this.group.position.set(
      this.world.spawns[0].x,
      0.05,
      this.world.spawns[0].z,
    );
    this.onStep(this.tile);
  }
}
