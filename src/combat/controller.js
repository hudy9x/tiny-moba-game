import {ArenaSelector} from "../maps/selector.js";
import * as THREE from "three";
import { gameConfig as config } from "../gameConfig.js";
import { GameConnection } from "./network.js";
import { CombatView } from "./view.js";

export class CombatController {
  constructor({ scene, camera, host, world, player, updateMap, loadMap, dialog }) {
    Object.assign(this, { camera, host, player, updateMap, loadMap, dialog, world });
    this.arenaSelector = new ArenaSelector(mapId=>this.connection.send({type:"map",mapId}));
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
    for(const type of ["start","end"]) document.querySelector(`#${type}-game`).addEventListener("click",()=>this.connection.send({type}),options);
    const toggleLeaderboard = () => {
      const panel=document.querySelector('#leaderboard');
      panel.hidden=!panel.hidden;
      document.querySelector('#leaderboard-toggle').setAttribute('aria-expanded',String(!panel.hidden));
    };
    document.querySelector('#leaderboard-toggle').addEventListener('click',toggleLeaderboard,options);
    window.addEventListener('keydown',e=>{
      if(e.key === 'Escape' && !e.repeat && !dialog.open) {e.preventDefault();toggleLeaderboard();}
    },options);
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
          e.isComposing || e.keyCode === 229 ||
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
    if (!this.localPlayerState || this.localPlayerState.status === "dead" || this.state?.phase !== "running")
      return;
    if (skill === "dash") this.pendingDashUntil = performance.now() + 300;
    this.connection.send({ type: "skill", skill, target: this.aim });
  }

  setSkin(skin) {
    this.connection.send({ type: "skin", skin });
  }

  receive(state) {
    if (state.mapId !== this.world.map.id) {
      for(const [id,actor] of this.view.actors) this.view.removeActor(id,actor);
      this.view.explosions.dispose();
      this.loadMap(state.mapId);
      this.lastTile="";
      window.dispatchEvent(new Event('combat-input-reset'));
    }
    this.arenaSelector.sync(state);
    const wasDead = this.localPlayerState?.status === "dead";
    const nextLocal = state.players.find((p) => p.id === this.connection.id);
    if (wasDead !== (nextLocal?.status === "dead") || state.phase !== this.state?.phase) {
      this.pendingDashUntil = 0;
      window.dispatchEvent(new Event("combat-input-reset"));
    }
    document.querySelector('#app').classList.toggle('match-running',state.phase === 'running');
    document.querySelector('.intro').hidden = state.phase === 'running';
    document.querySelector('#start-game').hidden = state.phase === 'running';
    document.querySelector('#start-game').disabled = !nextLocal;
    document.querySelector('#end-game').hidden = state.phase !== 'running';
    document.querySelector('#match-timer').hidden = state.phase !== 'running';
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
    document.querySelector("#explored").textContent = `${state.players.length} ${state.players.length === 1 ? "player" : "players"} · Everyone is a rival`;
    const board=document.querySelector('#leaderboard-body');
    board.replaceChildren();
    [...state.players].sort((a,b)=>b.kills-a.kills || a.deaths-b.deaths || a.id.localeCompare(b.id)).forEach((p,i)=>{
      const row=document.createElement('tr');
      if(i<3) row.className=`podium podium-${i+1}`;
      for(const value of [i<3 ? ["🥇","🥈","🥉"][i] : i+1, p.name+(p.id===local.id?' (YOU)':''),p.kills,p.deaths]) {
        const cell=document.createElement('td');cell.textContent=value;row.append(cell);
      }
      board.append(row);
    });
    document.querySelector("#player-health").value = local.health;
    document.querySelector("#player-health").max = local.maxHealth;
    document.querySelector("#health-value").textContent =
      `${Math.ceil(local.health)} / ${local.maxHealth}`;
    document.querySelector("#team-name").textContent = local.name;
    document.querySelector("#character").innerHTML = `${local.skin === "sprout" ? "Sprout" : "Pip"} <span>⌄</span>`;
    document.querySelector(".avatar-icon").classList.toggle("sprout",local.skin === "sprout");

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
      state.phase === "running" &&
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
        state.phase !== "running" ||
        remaining > 0;
      button.classList.toggle("cooling-down",remaining > 0);
      button.querySelector(".cooldown").textContent =
        remaining > 0 ? `${remaining.toFixed(1)}s` : "Ready";
      button.style.setProperty(
        "--cooldown",
        `${(remaining / config.skills[button.dataset.skill].cooldown) * 100}%`,
      );
    }
    const banner = document.querySelector("#match-banner");
    let message = "";
    if (local?.status === "dead") {
      message = `Respawning in ${Math.max(0, Math.ceil(local.respawnAt - now))}s`;
    } else if (local && now < local.invulnerableUntil) {
      message = `Respawn shield · ${Math.ceil(local.invulnerableUntil - now)}s`;
    }
    const celebration=document.querySelector('#mvp-celebration');
    celebration.hidden = !(state?.phase === 'ended' && state.mvp && now < state.celebrationEndsAt);
    if(!celebration.hidden) {
      document.querySelector('#mvp-name').textContent=state.mvp.name;
      document.querySelector('#mvp-stats').textContent=`${state.mvp.kills} kills · ${state.mvp.deaths} deaths · ${Math.round(state.mvp.damageDealt)} damage · ${Math.round(state.mvp.score)} MVP points`;
    }
    const seconds=state?Math.max(0,Math.ceil(state.phase === "running" ? state.endsAt-now : state.remaining)):config.match.duration;
    document.querySelector('#match-timer').textContent=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
    banner.textContent = message;
    banner.hidden = !message;
    this.view.update(dt, time);
  }

  dispose() {
    this.abort.abort();
    this.arenaSelector.dispose();
    this.connection.dispose();
    this.view.dispose();
  }
}
