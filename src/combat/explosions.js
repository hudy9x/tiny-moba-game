import * as THREE from "three";
import { gameConfig } from "../gameConfig.js";
import { drawExplosionFrame } from "./explosionFrames.js";
import { explosionProgress, stageStarts } from "./ultimateTimeline.js";

/** One atlas shared by active explosions; each effect owns only its texture view/materials. */
export class ExplosionRenderer {
  constructor(scene, config = gameConfig.vfx.explosion) {
    this.scene = scene;
    this.config = config;
    this.active = new Map();
    this.atlas = null;
  }
  createAtlas() {
    const { frameSize, frameCount } = this.config;
    const columns = 6,
      rows = Math.ceil(frameCount / columns);
    const canvas = document.createElement("canvas");
    canvas.width = columns * frameSize;
    canvas.height = rows * frameSize;
    const ctx = canvas.getContext("2d");
    for (let i = 0; i < frameCount; i++) {
      ctx.save();
      ctx.translate(
        (i % columns) * frameSize,
        Math.floor(i / columns) * frameSize,
      );
      drawExplosionFrame(ctx, i / (frameCount - 1), frameSize, this.config);
      ctx.restore();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    this.atlas = { texture, canvas, columns, rows };
  }
  sync(explosions, time) {
    this.serverTime = time;
    this.receivedAt = performance.now();
    const ids = new Set(explosions.map((e) => e.id));
    for (const id of this.active.keys()) if (!ids.has(id)) this.remove(id);
    for (const data of explosions) {
      if (explosionProgress(data, time) >= 1) continue;
      if (this.active.has(data.id)) {
        this.active.get(data.id).data = data;
        continue;
      }
      if (!this.atlas) this.createAtlas();
      const texture = this.atlas.texture.clone();
      texture.needsUpdate = true;
      texture.repeat.set(1 / this.atlas.columns, 1 / this.atlas.rows);
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      });
      const sprite = new THREE.Sprite(material);
      // Lift the billboard so its lower smoke lobes clear the ground plane.
      sprite.position.set(data.x, data.radius * 1.05, data.z);
      sprite.scale.setScalar(data.radius * 2.6);
      this.scene.add(sprite);
      const rings = [];
      for (let i = 0; i < 2; i++) {
        const geometry = new THREE.RingGeometry(0.96, 1, 64);
        const material = new THREE.MeshBasicMaterial({
          color: i ? "#fffde5" : "#ffc155",
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          toneMapped: false,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(data.x, 0.07 + i * 0.01, data.z);
        this.scene.add(mesh);
        rings.push(mesh);
      }
      const telegraph=new THREE.Mesh(new THREE.RingGeometry(0.92,1,64),new THREE.MeshBasicMaterial({color:'#ff62bd',transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));
      telegraph.rotation.x=-Math.PI/2;telegraph.position.set(data.x,.12,data.z);telegraph.scale.setScalar(data.radius);
      this.scene.add(telegraph);
      sprite.visible=false;
      this.active.set(data.id, { data, sprite, texture, rings, telegraph, frame: -1 });
    }
  }
  update() {
    if (!this.atlas) return;
    const now = this.serverTime + (performance.now() - this.receivedAt) / 1000;
    for (const [id, e] of this.active) {
      const waiting=now<e.data.startedAt;
      e.telegraph.visible=waiting;
      e.sprite.visible=!waiting;
      if(waiting){e.rings.forEach(r=>r.visible=false);continue;}
      const p = explosionProgress(e.data, now);
      if (p >= 1) {
        this.remove(id);
        continue;
      }
      const frame = Math.min(
        this.config.frameCount - 1,
        Math.floor(p * this.config.frameCount),
      );
      if (frame !== e.frame) {
        e.texture.offset.set(
          (frame % this.atlas.columns) / this.atlas.columns,
          1 - (Math.floor(frame / this.atlas.columns) + 1) / this.atlas.rows,
        );
        e.frame = frame;
      }
      for (let i = 0; i < e.rings.length; i++) {
        const shock = (p - stageStarts[2] - i * 0.035) / 0.24;
        e.rings[i].visible = shock >= 0 && shock <= 1;
        e.rings[i].scale.setScalar(
          e.data.radius * (0.68 + Math.max(0, shock) * 0.55),
        );
        e.rings[i].material.opacity = Math.max(0, 1 - shock) * 0.85;
      }
    }
  }
  remove(id) {
    const e = this.active.get(id);
    if (!e) return;
    this.scene.remove(e.sprite,e.telegraph);
    e.telegraph.geometry.dispose();e.telegraph.material.dispose();
    e.texture.dispose();
    e.sprite.material.dispose();
    for (const ring of e.rings) {
      this.scene.remove(ring);
      ring.geometry.dispose();
      ring.material.dispose();
    }
    this.active.delete(id);
    if (!this.active.size && this.atlas) {
      this.atlas.texture.dispose();
      this.atlas.canvas.width = this.atlas.canvas.height = 0;
      this.atlas = null;
    }
  }
  dispose() {
    for (const id of [...this.active.keys()]) this.remove(id);
  }
}
