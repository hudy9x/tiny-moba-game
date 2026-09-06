import * as THREE from "three";
import { Player } from "../player.js";
import { gameConfig as config } from "../gameConfig.js";

/** Converts server entities into Three meshes and projected lightweight DOM labels. */
export class CombatView {
  constructor(scene, camera, host, world, localPlayer) {
    Object.assign(this, { scene, camera, host, world, localPlayer });
    this.actors = new Map();
    this.gems = new Map();
    this.projectiles = new Map();
    this.effects = [];
    this.layer = document.createElement("div");
    this.layer.className = "combat-labels";
    host.append(this.layer);
    this.gemGeometry = new THREE.OctahedronGeometry(0.19);
    this.gemMaterial = new THREE.MeshStandardMaterial({
      color: "#b6f5f0",
      emissive: "#248e8a",
      emissiveIntensity: 0.5,
      roughness: 0.3,
    });
    this.bulletGeometry = new THREE.SphereGeometry(0.11, 6, 4);
    this.teamMaterials = config.teams.map(
      (t) => new THREE.MeshBasicMaterial({ color: t.color }),
    );
    this.ringGeometry = new THREE.RingGeometry(0.47, 0.53, 24);
    this.mine = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.63, 0.75, 0.22, 6),
      new THREE.MeshLambertMaterial({ color: "#697d70" }),
    );
    base.position.y = 0.12;
    this.mine.add(base);
    for (let i = 0; i < 3; i++) {
      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.23),
        this.gemMaterial,
      );
      crystal.scale.y = 1.7;
      crystal.position.set((i - 1) * 0.24, 0.47 + (i === 1 ? 0.12 : 0), 0);
      this.mine.add(crystal);
    }
    this.mine.position.set(config.match.mine.x, 0.02, config.match.mine.z);
    scene.add(this.mine);
    this.mineLabel = document.createElement("div");
    this.mineLabel.className = "mine-label";
    this.mineLabel.textContent = "GEM MINE";
    this.layer.append(this.mineLabel);
  }

  sync(state, localId) {
    this.state = state;
    const ids = new Set(state.players.map((p) => p.id));
    for (const [id, actor] of this.actors) {
      if (!ids.has(id)) this.removeActor(id, actor);
    }
    for (const data of state.players) {
      let actor = this.actors.get(data.id);
      if (!actor) {
        const local = data.id === localId;
        const avatar = local
          ? this.localPlayer
          : new Player(this.scene, this.world, () => {});
        const label = document.createElement("div");
        label.className = "actor-label";
        label.innerHTML = "<span></span><progress></progress>";
        this.layer.append(label);
        const ring = new THREE.Mesh(
          this.ringGeometry,
          this.teamMaterials[data.team],
        );
        ring.rotation.x = -Math.PI / 2;
        this.scene.add(ring);
        avatar.group.position.set(data.x, 0.05, data.z);
        actor = { avatar, label, ring, local, data, wasDead: false };
        this.actors.set(data.id, actor);
      }
      if (actor.avatar.skin !== data.skin) actor.avatar.setSkin(data.skin);
      if (actor.wasDead && data.health > 0)
        actor.avatar.group.position.set(data.x, 0.05, data.z);
      actor.wasDead = data.health <= 0;
      actor.data = data;
      actor.avatar.group.visible = actor.ring.visible = data.health > 0;
      actor.label.style.display = data.health > 0 ? "" : "none";
      actor.label.style.setProperty("--team", config.teams[data.team].color);
      actor.label.querySelector("span").textContent =
        `${data.bot ? "DUMMY" : actor.local ? "YOU" : config.teams[data.team].name.toUpperCase()} · ◆ ${data.gems}`;
      const bar = actor.label.querySelector("progress");
      bar.max = data.maxHealth;
      bar.value = data.health;
      bar.setAttribute(
        "aria-label",
        `${data.bot ? "Dummy" : "Player"} health ${Math.ceil(data.health)}`,
      );
    }
    this.syncMeshes(
      this.gems,
      state.gems,
      this.gemGeometry,
      () => this.gemMaterial,
    );
    this.syncMeshes(
      this.projectiles,
      state.projectiles,
      this.bulletGeometry,
      (p) => this.teamMaterials[p.team],
    );
    for (const event of state.events) {
      if (event.type === "damage") {
        const label = document.createElement("div");
        label.className = "damage-number";
        label.textContent = `−${event.amount}`;
        this.layer.append(label);
        this.effects.push({ label, ...event, age: 0, duration: 0.8 });
      } else if (event.type === "ultimate") {
        const mesh = new THREE.Mesh(
          new THREE.RingGeometry(0.01, event.radius, 40),
          new THREE.MeshBasicMaterial({
            color: config.teams[event.team].color,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(event.x, 0.065, event.z);
        this.scene.add(mesh);
        this.effects.push({ mesh, age: 0, duration: 0.6 });
      }
    }
  }

  syncMeshes(map, entities, geometry, material) {
    const ids = new Set(entities.map((e) => e.id));
    for (const [id, mesh] of map)
      if (!ids.has(id)) {
        this.scene.remove(mesh);
        map.delete(id);
      }
    for (const entity of entities) {
      if (!map.has(entity.id)) {
        const mesh = new THREE.Mesh(geometry, material(entity));
        this.scene.add(mesh);
        map.set(entity.id, mesh);
      }
      const mesh = map.get(entity.id);
      mesh.userData.entity = entity;
      mesh.position.set(entity.x, 0.55, entity.z);
    }
  }

  project(label, x, y, z) {
    const p = new THREE.Vector3(x, y, z).project(this.camera);
    label.style.visibility =
      Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && Math.abs(p.z) <= 1
        ? "visible"
        : "hidden";
    label.style.left = `${((p.x + 1) * this.host.clientWidth) / 2}px`;
    label.style.top = `${((1 - p.y) * this.host.clientHeight) / 2}px`;
  }

  update(dt, time) {
    for (const actor of this.actors.values()) {
      const { data, avatar, ring, label } = actor;
      const position = avatar.group.position;
      const moving =
        Math.hypot(data.x - position.x, data.z - position.z) > 0.02;
      position.lerp(
        new THREE.Vector3(data.x, 0.05, data.z),
        1 - Math.exp(-dt * 24),
      );
      position.y = 0.05 + (moving ? Math.abs(Math.sin(time * 18)) * 0.045 : 0);
      avatar.group.rotation.y = Math.atan2(data.facing.x, data.facing.z);
      ring.position.set(position.x, 0.03, position.z);
      ring.scale.setScalar(data.dashing ? 1.3 : 1);
      this.project(label, position.x, 1.5, position.z);
    }
    for (const mesh of this.gems.values()) {
      mesh.rotation.y = time;
      mesh.position.y =
        0.65 + Math.sin(time * 3 + mesh.userData.entity.id) * 0.07;
    }
    this.project(
      this.mineLabel,
      config.match.mine.x,
      1.15,
      config.match.mine.z,
    );
    this.effects = this.effects.filter((effect) => {
      effect.age += dt;
      if (effect.age >= effect.duration) {
        effect.label?.remove();
        if (effect.mesh) {
          this.scene.remove(effect.mesh);
          effect.mesh.geometry.dispose();
          effect.mesh.material.dispose();
        }
        return false;
      }
      if (effect.label) {
        this.project(effect.label, effect.x, 1.6 + effect.age, effect.z);
        effect.label.style.opacity = 1 - effect.age / effect.duration;
      }
      if (effect.mesh)
        effect.mesh.material.opacity = 0.5 * (1 - effect.age / effect.duration);
      return true;
    });
  }

  removeActor(id, actor) {
    actor.label.remove();
    this.scene.remove(actor.ring);
    if (!actor.local) {
      this.scene.remove(actor.avatar.group);
      actor.avatar.group.traverse((obj) => {
        obj.geometry?.dispose();
        obj.material?.dispose();
      });
    } else this.localPlayer.group.visible = false;
    this.actors.delete(id);
  }

  dispose() {
    for (const [id, actor] of this.actors) this.removeActor(id, actor);
    for (const mesh of [...this.gems.values(), ...this.projectiles.values()])
      this.scene.remove(mesh);
    this.effects.forEach((e) => {
      e.label?.remove();
      if (e.mesh) {
        this.scene.remove(e.mesh);
        e.mesh.geometry.dispose();
        e.mesh.material.dispose();
      }
    });
    this.scene.remove(this.mine);
    this.mine.children.forEach((m) => m.geometry.dispose());
    this.mine.children[0].material.dispose();
    this.gemGeometry.dispose();
    this.gemMaterial.dispose();
    this.bulletGeometry.dispose();
    this.ringGeometry.dispose();
    this.teamMaterials.forEach((m) => m.dispose());
    this.layer.remove();
  }
}
