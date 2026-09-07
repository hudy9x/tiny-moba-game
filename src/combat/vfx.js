import * as THREE from "three";
import { gameConfig } from "../gameConfig.js";

/** Shared beam assets and a fixed-capacity, single-draw-call spark pool. */
export class CombatVFX {
  constructor(scene, config = gameConfig.vfx) {
    this.scene = scene;
    this.config = config;
    this.beams = new Map();
    this.flashes = [];
    this.freeBeams = [];
    this.beamGeometry = new THREE.ConeGeometry(0.5, 1, 4);
    this.beamGeometry.rotateX(Math.PI / 2);
    this.coreMaterial = new THREE.MeshBasicMaterial({
      color: config.beamCore,
      toneMapped: false,
    });
    this.glowMaterial = new THREE.MeshBasicMaterial({
      color: config.beamGlow,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.sparkGeometry = new THREE.ConeGeometry(0.055, 0.34, 4);
    this.sparkMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.sparks = new THREE.InstancedMesh(
      this.sparkGeometry,
      this.sparkMaterial,
      config.maxSparks,
    );
    this.sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.sparks.frustumCulled = false;
    this.sparks.count = 0;
    scene.add(this.sparks);
    this.particles = Array.from({ length: config.maxSparks }, () => ({
      active: false,
      age: 0,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      color: new THREE.Color(),
    }));
    this.cursor = 0;
    this.transform = new THREE.Object3D();
    this.up = new THREE.Vector3(0, 1, 0);
    this.direction = new THREE.Vector3();
  }

  createBeam() {
    const group = this.freeBeams.pop() || new THREE.Group();
    if (!group.children.length) {
      const core = new THREE.Mesh(this.beamGeometry, this.coreMaterial);
      const glow = new THREE.Mesh(this.beamGeometry, this.glowMaterial);
      core.scale.set(
        this.config.beamWidth,
        this.config.beamWidth,
        this.config.beamLength,
      );
      glow.scale.set(
        this.config.beamWidth * 3,
        this.config.beamWidth * 3,
        this.config.beamLength * 1.08,
      );
      core.position.z = glow.position.z = -this.config.beamLength / 2;
      group.add(glow, core);
    }
    group.scale.setScalar(1);
    this.scene.add(group);
    return group;
  }

  recycleBeam(beam) {
    this.scene.remove(beam);
    this.freeBeams.push(beam);
  }

  sync(projectiles) {
    const ids = new Set(projectiles.map((p) => p.id));
    for (const [id, beam] of this.beams)
      if (!ids.has(id)) {
        this.recycleBeam(beam);
        this.beams.delete(id);
      }
    for (const p of projectiles) {
      if (!this.beams.has(p.id)) this.beams.set(p.id, this.createBeam());
      const beam = this.beams.get(p.id);
      beam.position.set(p.x, 0.55, p.z);
      beam.rotation.y = Math.atan2(p.dx, p.dz);
      beam.scale.z = Math.min(
        1,
        (p.traveled ?? this.config.beamLength) / this.config.beamLength,
      );
    }
  }

  shot(event) {
    const beam = this.createBeam();
    beam.position.set(
      event.x + event.dx * this.config.muzzleLength,
      0.55,
      event.z + event.dz * this.config.muzzleLength,
    );
    beam.rotation.y = Math.atan2(event.dx, event.dz);
    this.flashes.push({ beam, age: 0 });
  }

  impact(event) {
    for (let i = 0; i < this.config.sparksPerImpact; i++) {
      const p = this.particles[this.cursor];
      this.cursor = (this.cursor + 1) % this.particles.length;
      const angle = (i / this.config.sparksPerImpact) * Math.PI * 2;
      const speed = this.config.sparkSpeed * (0.65 + Math.random() * 0.35);
      p.active = true;
      p.age = 0;
      p.position.set(event.x, 0.55, event.z);
      p.velocity.set(
        Math.cos(angle) * speed,
        (0.2 + Math.random() * 0.8) * speed,
        Math.sin(angle) * speed,
      );
      p.color.set(this.config.sparkColors[i % this.config.sparkColors.length]);
    }
  }

  update(dt) {
    let count = 0;
    for (const p of this.particles) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= this.config.sparkLifetime) {
        p.active = false;
        continue;
      }
      p.position.addScaledVector(p.velocity, dt);
      p.velocity.y -= this.config.sparkGravity * dt;
      this.transform.position.copy(p.position);
      this.transform.quaternion.setFromUnitVectors(
        this.up,
        this.direction.copy(p.velocity).normalize(),
      );
      const life = 1 - p.age / this.config.sparkLifetime;
      this.transform.scale.set(life, life * 1.8, life);
      this.transform.updateMatrix();
      this.sparks.setMatrixAt(count, this.transform.matrix);
      this.sparks.setColorAt(count, p.color);
      count++;
    }
    this.sparks.count = count;
    this.sparks.instanceMatrix.needsUpdate = true;
    if (this.sparks.instanceColor) this.sparks.instanceColor.needsUpdate = true;
    this.flashes = this.flashes.filter((f) => {
      f.age += dt;
      if (f.age >= this.config.muzzleLifetime) {
        this.recycleBeam(f.beam);
        return false;
      }
      const fade = 1 - f.age / this.config.muzzleLifetime;
      f.beam.scale.set(
        fade,
        fade,
        this.config.muzzleLength / this.config.beamLength,
      );
      return true;
    });
  }

  dispose() {
    for (const beam of this.beams.values()) this.scene.remove(beam);
    for (const f of this.flashes) this.scene.remove(f.beam);
    this.scene.remove(this.sparks);
    this.beamGeometry.dispose();
    this.coreMaterial.dispose();
    this.glowMaterial.dispose();
    this.sparkGeometry.dispose();
    this.sparkMaterial.dispose();
    this.beams.clear();
    this.flashes = [];
    this.freeBeams = [];
  }
}
