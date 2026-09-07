import * as THREE from "three";
import { createWorld } from "./world.js";
import { buildTerrain } from "./terrain.js";
import { Player } from "./player.js";

/** Shares the actual terrain and character builders with the game. */
export class MenuPreview {
  constructor(host) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Live 3D map and costume preview",
    );
    host.append(this.renderer.domElement);
    this.camera = new THREE.OrthographicCamera();
    this.resize = new ResizeObserver(() => this.frame());
    this.resize.observe(host);
    this.renderer.setAnimationLoop((time) => {
      if (!this.scene) return;
      if (this.characterMode)
        this.player.group.rotation.y = Math.sin(time * 0.00035) * 0.28 + 0.35;
      this.renderer.render(this.scene, this.camera);
    });
  }
  clear() {
    if (!this.scene) return;
    const geometries = new Set(),
      materials = new Set();
    this.scene.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      if (o.material) materials.add(o.material);
      o.shadow?.dispose();
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
  }
  show(mapId, outfit, characterMode) {
    this.characterMode = characterMode;
    if (this.mapId !== mapId) {
      this.clear();
      this.outfitKey = null;
      this.mapId = mapId;
      this.world = createWorld(mapId);
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(
        this.world.map.palette.background,
      );
      buildTerrain(this.scene, this.world);
      this.scene.add(new THREE.HemisphereLight(0xffffef, 0x738b87, 2));
      const sun = new THREE.DirectionalLight(0xfff4da, 2.4);
      sun.position.set(5, 38, 15);
      sun.target.position.set(22, 0, 22);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      Object.assign(sun.shadow.camera, {
        left: -40,
        right: 40,
        top: 40,
        bottom: -40,
        far: 100,
      });
      sun.shadow.normalBias = 0.025;
      this.scene.add(sun, sun.target);
      this.player = new Player(this.scene, this.world, () => {});
    }
    const key = JSON.stringify(outfit);
    if (this.outfitKey !== key || this.player.skin !== outfit.skin) {
      this.player.costume = { ...outfit };
      this.player.setSkin(outfit.skin);
      this.outfitKey = key;
    }
    this.player.group.visible = characterMode;
    this.frame();
  }
  frame() {
    if (!this.world) return;
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    const aspect = w / h,
      span = this.characterMode ? 3.5 : 37;
    this.camera.left = (-span * aspect) / 2;
    this.camera.right = (span * aspect) / 2;
    this.camera.top = span / 2;
    this.camera.bottom = -span / 2;
    this.camera.near = 0.1;
    this.camera.far = 200;
    const p = this.characterMode
      ? this.player.group.position
      : new THREE.Vector3(22, 0, 22);
    const target = new THREE.Vector3(p.x, this.characterMode ? 0.65 : 0, p.z);
    this.camera.position.copy(target).add(new THREE.Vector3(25, 30, 25));
    this.camera.lookAt(target);
    // Place the subject in the open space to the right of the frosted menu.
    this.camera.setViewOffset(w, h, -w * (w > 700 ? 0.16 : 0), 0, w, h);
    this.camera.updateProjectionMatrix();
  }
  dispose() {
    this.renderer.setAnimationLoop(null);
    this.resize.disconnect();
    this.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
