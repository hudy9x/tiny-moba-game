import { updateBot } from "./bot.js";
import { sanitizeCostume, sanitizeName } from "../src/costume.js";
import { gameConfig as defaults } from "../src/gameConfig.js";
import { createWorld } from "../src/world.js";
import { detonate, updateExplosions, beginKnockbackStep } from "./ultimate.js";
import { scatterTiles, spawnGemBatch } from "./gems.js";

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const validPoint = (p) =>
  p &&
  Number.isFinite(p.x) &&
  Number.isFinite(p.z) &&
  Math.abs(p.x) < 10000 &&
  Math.abs(p.z) < 10000;
const cardinal = (p) =>
  validPoint(p) &&
  ((Math.abs(p.x) === 1 && p.z === 0) ||
    (Math.abs(p.z) === 1 && p.x === 0) ||
    (p.x === 0 && p.z === 0));

/** Pure simulation: no sockets, renderer, timers, or wall-clock dependencies. */
export class Match {
  constructor(
    config = defaults,
    mapId = config.maps.defaultId,
    random = Math.random,
  ) {
    this.config = config;
    this.mode = "gem";
    this.world = createWorld(mapId);
    this.random = random;
    this.scatterCandidates = scatterTiles(
      this.world,
      config.match.gemScatterRadius,
    );
    this.players = new Map();
    this.gems = [];
    this.projectiles = [];
    this.explosions = [];
    this.events = [];
    this.time = 0;
    this.sequence = 0;
    this.nextGem = config.match.gemSpawnInterval;
    this.countdown = null;
    this.winner = null;
    this.restartAt = null;
  }

  addPlayer(id) {
    if (this.players.has(id)) return this.players.get(id);
    const humans = [...this.players.values()].filter((p) => !p.bot);
    if (humans.length >= this.config.match.maxPlayers) return null;
    const counts = [0, 0];
    humans.forEach((p) => counts[p.team]++);
    const team = counts[0] <= counts[1] ? 0 : 1;
    if (counts[team] >= this.config.match.teamSize) return null;
    const p = this.makePlayer(id, team);
    this.players.set(id, p);
    this.syncDummy();
    return p;
  }

  makePlayer(id, team, bot = false) {
    const c = this.config;
    const spawn = bot ? this.world.dummy : this.world.spawns[team];
    const maxHealth = bot ? c.match.dummyHealth : c.player.baseHealth;
    return {
      id,
      team,
      bot,
      x: spawn.x,
      z: spawn.z,
      tile: { x: spawn.x, z: spawn.z },
      status: "alive",
      invulnerableUntil: 0,
      health: maxHealth,
      maxHealth,
      gems: 0,
      name: bot ? "Dummy" : "Explorer",
      skin: bot ? "sprout" : "pip",
      facing: { x: 0, z: 1 },
      input: { x: 0, z: 0 },
      inputAt: -Infinity,
      cooldowns: { basic: 0, dash: 0, ultimate: 0 },
      lastCombat: -Infinity,
      motion: null,
      knockbackPath: [],
      respawnAt: null,
    };
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.dropGems(p);
    this.players.delete(id);
    this.projectiles = this.projectiles.filter((b) => b.owner !== id);
    this.syncDummy();
    this.updateVictory();
  }

  syncDummy() {
    const humans = [...this.players.values()].filter((p) => !p.bot);
    if (humans.length === 1 && !this.players.has("dummy")) {
      this.players.set(
        "dummy",
        this.makePlayer("dummy", 1 - humans[0].team, true),
      );
    } else if (humans.length !== 1 && this.players.has("dummy")) {
      this.players.delete("dummy");
    }
  }

  command(id, command) {
    const p = this.players.get(id);
    if (!p || p.bot || !command || typeof command !== "object") return;
    if(command.type === "name") { p.name=sanitizeName(command.name); return; }
    if (command.type === "costume") {
      p.costume = sanitizeCostume(command.costume);
      return;
    }
    if (command.type === "skin" && ["pip", "sprout"].includes(command.skin)) {
      p.skin = command.skin;
      return;
    }
    if (
      p.status === "dead" ||
      p.motion?.knockback ||
      p.knockbackPath.length ||
      this.winner !== null
    )
      return;
    if (command.type === "move" && cardinal(command.direction)) {
      p.input = { ...command.direction };
      p.inputAt = this.time;
      if (p.input.x || p.input.z) {
        p.facing = { ...p.input };
        // Begin the first step on receipt, so a short tap cannot vanish between ticks.
        const end = { x: p.tile.x + p.input.x, z: p.tile.z + p.input.z };
        if (!p.motion && this.world.canWalk(end.x, end.z)) {
          this.startMotion(p, end, this.config.player.moveSpeed);
        }
      }
    }
    if (command.type === "skill") this.cast(p, command.skill, command.target);
  }

  cast(p, skill, target) {
    const c = this.config.skills[skill];
    if (
      !Object.hasOwn(this.config.skills, skill) ||
      !c ||
      this.time < p.cooldowns[skill]
    )
      return;
    if (skill === "dash") {
      if (p.motion) return; // Finish the current tile before beginning a dash.
      const end = { ...p.tile };
      for (let i = 0; i < Math.floor(c.distance); i++) {
        const next = { x: end.x + p.facing.x, z: end.z + p.facing.z };
        if (!this.world.canWalk(next.x, next.z)) break;
        Object.assign(end, next);
      }
      if (!distance(end, p)) return;
      this.startMotion(p, end, c.speed, true);
      this.events.push({ type: "dash", x: p.x, z: p.z });
    } else {
      if (!validPoint(target)) return;
      const length = distance(target, p);
      if (length < 0.001 && skill === "basic") return;
      const direction = {
        x: (target.x - p.x) / (length || 1),
        z: (target.z - p.z) / (length || 1),
      };
      if (skill === "basic") {
        this.events.push({
          type: "shot",
          x: p.x,
          z: p.z,
          dx: direction.x,
          dz: direction.z,
        });
        this.projectiles.push({
          id: ++this.sequence,
          owner: p.id,
          team: p.team,
          x: p.x,
          z: p.z,
          dx: direction.x,
          dz: direction.z,
          traveled: 0,
        });
      } else {
        detonate(this, p, target);
      }
    }
    p.cooldowns[skill] = this.time + c.cooldown;
  }

  startMotion(p, end, speed, dash = false) {
    p.motion = {
      from: { x: p.x, z: p.z },
      end,
      elapsed: 0,
      duration: distance(p, end) / speed,
      dash,
    };
    p.tile = { ...end };
  }

  damage(victim, attacker, amount, point = victim) {
    if (victim.status === "dead" || this.time < victim.invulnerableUntil)
      return;

    const actual = Math.min(victim.health, amount);
    victim.health -= actual;
    victim.lastCombat = attacker.lastCombat = this.time;
    this.events.push({
      type: "damage",
      x: point.x,
      z: point.z,
      amount: actual,
      id: victim.id,
    });
    if (victim.health <= 0) {
      victim.status = "dead";
      this.dropGems(victim);
      victim.motion = null;
      victim.knockbackPath = [];
      victim.input = { x: 0, z: 0 };
      victim.respawnAt = this.time + this.config.match.respawnDelay;
    }
  }

  dropGems(p) {
    if (p.gems)
      this.gems.push({
        id: ++this.sequence,
        x: Math.round(p.x),
        z: Math.round(p.z),
        expiresAt: this.time + this.config.match.gemDespawnTime,
        value: p.gems,
        mine: false,
      });
    p.gems = 0;
  }

  step(dt) {
    const previousTime = this.time;
    this.time += dt;
    this.gems = this.gems.filter((g) => this.time < g.expiresAt);
    if (this.winner !== null) {
      if (this.time >= this.restartAt) this.restart();
      return;
    }
    const c = this.config;
    for (const p of this.players.values()) {
      if (p.status === "dead") {
        if (this.time >= p.respawnAt) {
          const fresh = this.makePlayer(p.id, p.team, p.bot);
          Object.assign(p, fresh, {
            skin: p.skin,
            costume: p.costume,
            name: p.name,
            lastCombat: this.time,
            invulnerableUntil: this.time + c.player.respawnInvulnerability,
          });
        }
        continue;
      }
      if (p.bot) updateBot(this, p);
      if (this.time - p.lastCombat >= c.player.regenerationDelay) {
        p.health = Math.min(
          p.maxHealth,
          p.health + c.player.regenerationPerSecond * dt,
        );
      }
      if (this.time - p.inputAt > c.network.inputTimeout)
        p.input = { x: 0, z: 0 };
      if (!p.motion && p.knockbackPath.length) beginKnockbackStep(this, p);
      if (!p.motion && (p.input.x || p.input.z)) {
        const end = { x: p.tile.x + p.input.x, z: p.tile.z + p.input.z };
        if (this.world.canWalk(end.x, end.z))
          this.startMotion(p, end, c.player.moveSpeed);
      }
      if (p.motion) {
        const m = p.motion;
        m.elapsed += dt;
        const t = Math.min(1, m.elapsed / m.duration);
        p.x = m.from.x + (m.end.x - m.from.x) * t;
        p.z = m.from.z + (m.end.z - m.from.z) * t;
        if (t === 1) p.motion = null;
      }
    }
    this.updateProjectiles(dt);
    updateExplosions(this, previousTime);
    if (this.time >= this.nextGem) {
      this.nextGem = this.time + c.match.gemSpawnInterval;
      spawnGemBatch(this);
    }
    this.gems = this.gems.filter((gem) => {
      const eligible = [...this.players.values()]
        .filter(
          (p) =>
            !p.bot && p.health > 0 && distance(p, gem) <= c.match.pickupRadius,
        )
        .sort((a, b) => distance(a, gem) - distance(b, gem));
      if (!eligible.length) return true;
      eligible[0].gems += gem.value;
      return false;
    });
    this.updateVictory();
  }

  updateProjectiles(dt) {
    const c = this.config.skills.basic;
    this.projectiles = this.projectiles.filter((b) => {
      // Substeps prevent tunneling through a player or tree between server ticks.
      const travel = Math.min(c.projectileSpeed * dt, c.range - b.traveled);
      const substeps = Math.max(1, Math.ceil(travel / 0.15));
      for (let i = 0; i < substeps; i++) {
        b.x += (b.dx * travel) / substeps;
        b.z += (b.dz * travel) / substeps;
        b.traveled += travel / substeps;
        const tile = this.world.lookup.get(
          `${Math.round(b.x)},${Math.round(b.z)}`,
        );
        if (!tile || tile.tree) {
          this.events.push({
            type: "impact",
            x: b.x,
            z: b.z,
            kind: "obstacle",
          });
          return false;
        }
        for (const p of this.players.values()) {
          if (
            p.team !== b.team &&
            p.health > 0 &&
            distance(b, p) <= this.config.player.hitRadius
          ) {
            const owner = this.players.get(b.owner);
            this.events.push({
              type: "impact",
              x: b.x,
              z: b.z,
              kind: this.time < p.invulnerableUntil ? "shield" : "entity",
            });
            if (owner) this.damage(p, owner, c.damage, b);
            return false;
          }
        }
      }
      return b.traveled < c.range;
    });
  }

  totals() {
    const totals = [0, 0];
    for (const p of this.players.values()) if (!p.bot) totals[p.team] += p.gems;
    return totals;
  }

  updateVictory() {
    if (this.winner !== null) return;
    const totals = this.totals();
    const threshold = this.config.match.winningGemCount;
    // Only one qualifying team can count down; simultaneous qualification is contested.
    const qualifying = [0, 1].filter((team) => totals[team] >= threshold);
    if (qualifying.length !== 1) {
      this.countdown = null;
      return;
    }
    const team = qualifying[0];
    if (this.countdown?.team !== team) {
      this.countdown = {
        team,
        endsAt: this.time + this.config.match.victoryCountdown,
      };
    }
    if (this.time >= this.countdown.endsAt) {
      this.winner = team;
      this.restartAt = this.time + this.config.match.restartDelay;
      this.projectiles = [];
      this.explosions = [];
    }
  }

  restart() {
    for (const p of this.players.values()) {
      Object.assign(p, this.makePlayer(p.id, p.team, p.bot), {
        skin: p.skin,
        costume: p.costume,
            name: p.name,
      });
    }
    this.gems = [];
    this.projectiles = [];
    this.explosions = [];
    this.countdown = null;
    this.winner = null;
    this.restartAt = null;
    this.nextGem = this.time + this.config.match.gemSpawnInterval;
    this.events.push({ type: "restart" });
  }

  snapshot() {
    return {
      mapId: this.world.map.id,
      time: this.time,
      totals: this.totals(),
      countdown: this.countdown,
      winner: this.winner,
      restartAt: this.restartAt,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        team: p.team,
        bot: p.bot,
        x: p.x,
        z: p.z,
        status: p.status,
        invulnerableUntil: p.invulnerableUntil,
        health: p.health,
        maxHealth: p.maxHealth,
        gems: p.gems,
        skin: p.skin,
        facing: p.facing,
        cooldowns: { ...p.cooldowns },
        respawnAt: p.respawnAt,
        costume: p.costume,
            name: p.name,
        dashing: !!p.motion?.dash,
        knockedBack: !!p.motion?.knockback,
      })),
      gems: this.gems.map((g) => ({ ...g })),
      explosions: this.explosions.map(({ hit, ...blast }) => ({ ...blast })),
      projectiles: this.projectiles.map((b) => ({ ...b })),
      events: this.events.splice(0),
    };
  }
}
