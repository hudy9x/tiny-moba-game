import * as THREE from "three";
import { gameConfig as config } from "../gameConfig.js";
import { GameConnection } from "./network.js";
import { CombatView } from "./view.js";

export class CombatController {
  constructor({ scene, camera, host, world, player, updateMap, dialog }) {
    Object.assign(this, { camera, host, player, updateMap, dialog, world });
    document.querySelector("#gem-goal").textContent =
      config.match.winningGemCount;
    document.querySelector("#help-gem-goal").textContent =
      config.match.winningGemCount;
    document.querySelector("#help-countdown").textContent =
      `${config.match.victoryCountdown} seconds`;
    this.view = new CombatView(scene, camera, host, world, player);
    this.abort = new AbortController();
    this.aim = { ...world.dummy };
    this.inputClock = 0;
    this.receivedAt = 0;
    this.lastTile = "";
    this.pendingDashUntil = 0;
    this.ray = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.1);
    this.connection = new GameConnection(
      (state) => this.receive(state),
      (status) => {
        document.querySelector("#connection-status").textContent = status;
      },
      world.map.id,
    );
    const options = { signal: this.abort.signal };
    host.addEventListener("pointermove", (e) => this.setAim(e), options);
    host.addEventListener(
      "pointerdown",
      (e) => {
        if (e.button === 0 && e.target.tagName === "CANVAS" && !dialog.open) {
          this.setAim(e);
          this.cast("basic");
        }
      },
      options,
    );
    window.addEventListener(
      "keydown",
      (e) => {
        if (
          dialog.open ||
          e.repeat ||
          e.ctrlKey ||
          e.metaKey ||
          e.altKey ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(
            document.activeElement.tagName,
          )
        )
          return;
        const skill = {
          1: "basic",
          2: "dash",
          " ": "dash",
          3: "ultimate",
          q: "ultimate",
          e: "ultimate",
        }[e.key.toLowerCase()];
        if (skill) {
          e.preventDefault();
          this.cast(skill);
        }
      },
      options,
    );
    document.querySelectorAll("[data-skill]").forEach((button) =>
      button.addEventListener(
        "click",
        () => {
          this.cast(button.dataset.skill);
          button.blur();
        },
        options,
      ),
    );
    window.addEventListener(
      "blur",
      () => this.connection.send({ type: "move", direction: { x: 0, z: 0 } }),
      options,
    );
  }

  setAim(e) {
    const r = this.host.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      (-(e.clientY - r.top) / r.height) * 2 + 1,
    );
    this.pointerPosition = { clientX: e.clientX, clientY: e.clientY };
    this.ray.setFromCamera(pointer, this.camera);
    const actors = [...this.view.actors.values()].filter(
      (a) => a.data.health > 0 && !a.local,
    );
    const hit = this.ray.intersectObjects(
      actors.map((a) => a.avatar.group),
      true,
    )[0];
    if (hit) {
      const actor = actors.find((a) => a.avatar.group === hit.object.parent);
      if (actor) {
        this.aim = { x: actor.data.x, z: actor.data.z };
        return;
      }
    }
    const point = this.ray.ray.intersectPlane(this.plane, new THREE.Vector3());
    if (point) this.aim = { x: point.x, z: point.z };
  }

  get localPlayerState() {
    return this.state?.players.find((p) => p.id === this.connection.id);
  }

  move(direction) {
    if (this.localPlayerState?.status === "dead") return;
    this.connection.send({
      type: "move",
      direction: direction
        ? { x: direction[0], z: direction[1] }
        : { x: 0, z: 0 },
    });
  }

  cast(skill) {
    if (!this.localPlayerState || this.localPlayerState.status === "dead")
      return;
    if (skill === "dash") this.pendingDashUntil = performance.now() + 300;
    this.connection.send({ type: "skill", skill, target: this.aim });
  }

  setSkin(skin) {
    this.connection.send({ type: "skin", skin });
  }

  receive(state) {
    if (state.mapId !== this.world.map.id) return;
    const wasDead = this.localPlayerState?.status === "dead";
    const nextLocal = state.players.find((p) => p.id === this.connection.id);
    if (wasDead !== (nextLocal?.status === "dead")) {
      this.pendingDashUntil = 0;
      window.dispatchEvent(new Event("combat-input-reset"));
    }
    this.state = state;
    this.receivedAt = performance.now();
    this.view.sync(state, this.connection.id);
    const local = state.players.find((p) => p.id === this.connection.id);
    if (!local) return;
    const x = Math.round(local.x),
      z = Math.round(local.z),
      tile = `${x},${z}`;
    if (tile !== this.lastTile) {
      this.lastTile = tile;
      this.updateMap({ x, z });
    }
    document.querySelector("#explored").textContent = state.players.some(
      (p) => p.bot,
    )
      ? new URLSearchParams(location.search).get("mode") === "battle"
        ? "Bot battle · Keep moving and fight back"
        : "Training · Try your skills on the dummy"
      : `${state.players.length} explorers · ${config.teams[local.team].name} team`;
    document.querySelector("#player-health").value = local.health;
    document.querySelector("#player-health").max = local.maxHealth;
    document.querySelector("#health-value").textContent =
      `${Math.ceil(local.health)} / ${local.maxHealth}`;
    document.querySelector("#fern-score").textContent = state.totals[0];
    document.querySelector("#coral-score").textContent = state.totals[1];
    document.querySelector("#team-name").textContent =
      config.teams[local.team].name.toUpperCase();
    document.querySelector("#team-name").style.color =
      config.teams[local.team].color;
  }

  update(dt, time, direction) {
    if (this.localPlayerState?.status === "dead") direction = null;
    if (this.pointerPosition) this.setAim(this.pointerPosition);
    this.inputClock += dt;
    const next = direction
      ? { x: direction[0], z: direction[1] }
      : { x: 0, z: 0 };
    const changed =
      next.x !== this.lastDirection?.x || next.z !== this.lastDirection?.z;
    if (changed || this.inputClock >= config.network.inputInterval) {
      this.inputClock = 0;
      this.lastDirection = next;
      this.connection.send({ type: "move", direction: next });
    }
    const state = this.state;
    const local = state?.players.find((p) => p.id === this.connection.id);
    if (
      local &&
      local.status !== "dead" &&
      this.pendingDashUntil > performance.now() &&
      state.time >= local.cooldowns.dash
    ) {
      this.connection.send({ type: "skill", skill: "dash", target: this.aim });
    } else this.pendingDashUntil = 0;
    const now = state
      ? state.time + Math.min((performance.now() - this.receivedAt) / 1000, 0.2)
      : 0;
    for (const button of document.querySelectorAll("[data-skill]")) {
      const remaining = local
        ? Math.max(0, local.cooldowns[button.dataset.skill] - now)
        : 0;
      button.disabled =
        !local ||
        local.status === "dead" ||
        state.winner !== null ||
        remaining > 0;
      button.querySelector(".cooldown").textContent =
        remaining > 0 ? `${remaining.toFixed(1)}s` : "Ready";
      button.style.setProperty(
        "--cooldown",
        `${(remaining / config.skills[button.dataset.skill].cooldown) * 100}%`,
      );
    }
    const banner = document.querySelector("#match-banner");
    let message = "";
    if (state?.winner !== null && state?.winner !== undefined) {
      message = `${config.teams[state.winner].name} wins! · New round in ${Math.max(0, Math.ceil(state.restartAt - now))}s`;
    } else if (local?.status === "dead") {
      message = `Gems dropped · Respawning in ${Math.max(0, Math.ceil(local.respawnAt - now))}s`;
    } else if (local && now < local.invulnerableUntil) {
      message = `Respawn shield · ${Math.ceil(local.invulnerableUntil - now)}s`;
    } else if (state?.countdown) {
      message = `${config.teams[state.countdown.team].name} holds ${config.match.winningGemCount}+ gems · ${Math.max(0, Math.ceil(state.countdown.endsAt - now))}s to victory`;
    }
    banner.textContent = message;
    banner.hidden = !message;
    this.view.update(dt, time);
  }

  dispose() {
    this.abort.abort();
    this.connection.dispose();
    this.view.dispose();
  }
}
