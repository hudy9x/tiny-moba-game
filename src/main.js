import { gameAudio } from "./audio.js";
import "./style.css";
import * as THREE from "three";
import { createWorld } from "./world.js";
import { setupMapSelector } from "./maps/selector.js";
import { buildTerrain } from "./terrain.js";
import { Player } from "./player.js";
import { CombatController } from "./combat/controller.js";
const modeName =
  { battle: "BOT BATTLE", training: "TRAINING", gem: "GEM GRAB" }[
    new URLSearchParams(location.search).get("mode")
  ] || "GEM GRAB";
document.querySelector(".world-title > span:last-child").textContent = modeName;
const host = document.querySelector("#world");
const world = createWorld(setupMapSelector());
const scene = new THREE.Scene();
scene.background = new THREE.Color(world.map.palette.background);
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
host.appendChild(renderer.domElement);
renderer.domElement.setAttribute(
  "aria-label",
  `${world.map.name} landscape. Use WASD or arrow keys to move.`,
);
const camera = new THREE.OrthographicCamera();
const target = new THREE.Vector3(world.spawns[0].x, 0, world.spawns[0].z);
const offset = new THREE.Vector3(25, 30, 25);
scene.add(new THREE.HemisphereLight(0xffffe5, 0x6d8d64, 1.5));
const sun = new THREE.DirectionalLight(0xfff5d4, 2.5);
sun.position.set(-12, 32, -8);
sun.target.position.set(world.mine.x, 0, world.mine.z);
scene.add(sun, sun.target);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {
  left: -35,
  right: 35,
  top: 35,
  bottom: -35,
  near: 0.1,
  far: 100,
});
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.025;
buildTerrain(scene, world);
const map = document.querySelector("#minimap"),
  ctx = map.getContext("2d");
function updateMap(tile) {
  ctx.clearRect(0, 0, 160, 160);
  const s = 160 / world.size;
  for (const t of world.tiles) {
    ctx.fillStyle = t.water
      ? world.map.palette.water[0]
      : t.tree
        ? world.map.palette.foliage[0]
        : t.sand
          ? world.map.palette.sand
          : world.map.palette.land[0];
    ctx.fillRect(t.x * s, t.z * s, s + 0.3, s + 0.3);
  }
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.fillStyle = "#ec7256";
  ctx.beginPath();
  ctx.arc(tile.x * s + s / 2, tile.z * s + s / 2, 3.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  document.querySelector("#coords").textContent =
    `${String(tile.x).padStart(2, "0")}, ${String(tile.z).padStart(2, "0")}`;
}
const player = new Player(scene, world, () => {});
updateMap(world.spawns[0]);

function resize() {
  const w = host.clientWidth,
    h = host.clientHeight;
  const span = w < 760 ? 17 : 23;
  camera.left = (-span * w) / h / 2;
  camera.right = (span * w) / h / 2;
  camera.top = span / 2;
  camera.bottom = -span / 2;
  camera.near = 0.1;
  camera.far = 150;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener("resize", resize);
resize();
const directions = {
  w: [0, -1],
  ArrowUp: [0, -1],
  s: [0, 1],
  ArrowDown: [0, 1],
  a: [-1, 0],
  ArrowLeft: [-1, 0],
  d: [1, 0],
  ArrowRight: [1, 0],
};
const held = new Set();
window.addEventListener("combat-input-reset", () => held.clear());
const dialog = document.querySelector("dialog");
window.addEventListener("keydown", (e) => {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (
    directions[key] &&
    !dialog.open &&
    !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)
  ) {
    e.preventDefault();
    held.add(key);
    combat.move(directions[key]);
  }
});
window.addEventListener("keyup", (e) => {
  held.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  combat.move(directions[[...held].at(-1)]);
});
window.addEventListener("blur", () => held.clear());
document.addEventListener("visibilitychange", () => held.clear());
const combat = new CombatController({
  scene,
  camera,
  host,
  world,
  player,
  updateMap,
  dialog,
});
const touch = { up: "w", down: "s", left: "a", right: "d" };
document.querySelectorAll("[data-dir]").forEach((b) => {
  b.addEventListener("pointerdown", (e) => {
    b.setPointerCapture(e.pointerId);
    held.add(touch[b.dataset.dir]);
    combat.move(directions[touch[b.dataset.dir]]);
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    b.addEventListener(event, () => {
      held.delete(touch[b.dataset.dir]);
      combat.move(directions[[...held].at(-1)]);
    });
});
let toastTimer;
function toast(message) {
  const el = document.querySelector("#toast");
  el.textContent = message;
  el.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("visible"), 2600);
}
document.querySelector("#help").onclick = () => {
  held.clear();
  combat.move();
  dialog.showModal();
};
dialog
  .querySelectorAll("button")
  .forEach((b) => (b.onclick = () => dialog.close()));
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      dialog.close();
  }
});
document.querySelector("#reset").onclick = () => {
  target.set(player.group.position.x - 1.3, 0, player.group.position.z - 1.3);
  toast("Camera centered on your explorer.");
};
document.querySelector("#fullscreen").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    toast("Fullscreen isn’t available in this browser.");
  }
};
const menu = document.querySelector("#character-menu");
document.querySelector("#character").setAttribute("aria-expanded", "false");
document.querySelector("#character").onclick = () => {
  menu.hidden = !menu.hidden;
  document
    .querySelector("#character")
    .setAttribute("aria-expanded", String(!menu.hidden));
};
document.querySelectorAll("[data-avatar]").forEach(
  (b) =>
    (b.onclick = () => {
      const skin = b.dataset.avatar;
      combat.setSkin(skin);
      document.querySelector("#character").innerHTML =
        `${skin === "pip" ? "Pip" : "Sprout"} <span>⌄</span>`;
      document
        .querySelector(".avatar-icon")
        .classList.toggle("sprout", skin === "sprout");
      menu.hidden = true;
      document
        .querySelector("#character")
        .setAttribute("aria-expanded", "false");
      b.blur();
      toast(
        skin === "pip"
          ? "Pip is ready to wander."
          : "A fresh adventure with Sprout.",
      );
    }),
);
document.addEventListener("pointerdown", (e) => {
  if (!e.target.closest(".character-select")) {
    menu.hidden = true;
    document.querySelector("#character").setAttribute("aria-expanded", "false");
  }
});
document.querySelector("#sound").onclick = async () => {
  try {
    const active = await gameAudio.toggle();
    const button = document.querySelector("#sound");
    button.classList.toggle("active", active);
    button.setAttribute(
      "aria-label",
      active ? "Mute game sound" : "Enable game sound",
    );
    button.setAttribute("aria-pressed", String(active));
    toast(active ? "Game sounds on." : "Game sounds off.");
  } catch {
    toast("Audio isn’t available in this browser.");
  }
};
const clock = new THREE.Clock();
let time = 0;
function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt;
  const key = dialog.open ? null : [...held].at(-1);
  combat.update(dt, time, key ? directions[key] : null);
  target.lerp(
    new THREE.Vector3(
      player.group.position.x - 1.3,
      0,
      player.group.position.z - 1.3,
    ),
    1 - Math.exp(-dt * 2),
  );
  camera.position.copy(target).add(offset);
  camera.lookAt(target);
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);
document.querySelector("#loading").remove();

window.addEventListener(
  "pagehide",
  () => {
    combat.dispose();
    gameAudio.dispose();
  },
  { once: true },
);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    combat.dispose();
    gameAudio.dispose();
    renderer.setAnimationLoop(null);
    renderer.dispose();
  });
