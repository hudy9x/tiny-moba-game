import { maps } from "../src/maps/registry.js";
import { selectMvp } from "../src/mvp.js";
import { sanitizeCostume, sanitizeName } from "../src/costume.js";
import { gameConfig as defaults } from "../src/gameConfig.js";
import { createWorld } from "../src/world.js";
import { detonate, updateExplosions } from "./ultimate.js";
import { scatterTiles } from "./gems.js";

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const validPoint = (p) =>
  p &&
  Number.isFinite(p.x) &&
  Number.isFinite(p.z) &&
  Math.abs(p.x) < 10000 &&
  Math.abs(p.z) < 10000;
/** Pure simulation: no sockets, renderer, timers, or wall-clock dependencies. */
export class Match {
  constructor(
    config = defaults,
    mapId = config.maps.defaultId,
    random = Math.random,
  ) {
    this.config = config;
    this.mode = "ffa";
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
    this.phase = "waiting";
    this.endsAt = null;
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
    const p = this.makePlayer(id, 0);
    this.players.set(id, p);
    return p;
  }

  makePlayer(id, team, bot = false) {
    const c = this.config;
    const candidates = this.world.spawns.filter(t => this.canOccupy(t.x, t.z));
    candidates.sort((a, b) => {
      const clearance = t => Math.min(...[...this.players.values()].filter(p => p.status !== "dead").map(p => distance(t, p)), 100);
      return clearance(b) - clearance(a);
    });
    const spawn = candidates[0] || this.world.spawns[0];
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
      kills: 0, deaths: 0, hitStreak: 0, damageDealt: 0,
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

  syncDummy() {}

  canOccupy(x, z) {
    const r = this.config.player.hitRadius;
    for (let tz = Math.round(z-r); tz <= Math.round(z+r); tz++)
      for (let tx = Math.round(x-r); tx <= Math.round(x+r); tx++) {
        if (this.world.canWalk(tx, tz)) continue;
        const dx = x - Math.max(tx-.5, Math.min(x, tx+.5));
        const dz = z - Math.max(tz-.5, Math.min(z, tz+.5));
        if (dx*dx + dz*dz < r*r) return false;
      }
    return true;
  }

  moveContinuous(p, dx, dz) {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx,dz)/this.config.player.collisionStep));
    for(let i=0;i<steps;i++) {
      if(this.canOccupy(p.x+dx/steps,p.z)) p.x+=dx/steps;
      if(this.canOccupy(p.x,p.z+dz/steps)) p.z+=dz/steps;
    }
    p.tile = {x:p.x,z:p.z};
  }

  changeMap(mapId) {
    if(!maps.some(map=>map.id===mapId) || mapId===this.world.map.id) return;
    this.world=createWorld(mapId);
    this.scatterCandidates=scatterTiles(this.world,this.config.match.gemScatterRadius);
    this.projectiles=[];this.explosions=[];this.events=[];
    for(const p of this.players.values()) {
      // Keep match stats, health, death timers and cooldowns; relocate only blocked positions.
      if(!this.canOccupy(p.x,p.z)) {
        const spawn=this.makePlayer(p.id,p.team,p.bot);
        p.x=spawn.x;p.z=spawn.z;
      }
      p.tile={x:p.x,z:p.z};p.input={x:0,z:0};p.inputAt=-Infinity;
      p.motion=null;p.knockbackPath=[];
    }
  }

  command(id, command) {
    const p = this.players.get(id);
    if (!p || p.bot || !command || typeof command !== "object") return;
    if(command.type === "map") { this.changeMap(command.mapId); return; }
    if(command.type === "start") {
      if(this.phase !== "running") {
        const mapId=command.mapId || this.world.map.id;
        if(!maps.some(map=>map.id===mapId)) return;
        this.world=createWorld(mapId);
        this.scatterCandidates=scatterTiles(this.world,this.config.match.gemScatterRadius);
        this.restart();
      }
      return;
    }
    if(command.type === "end") { if(this.phase === "running") this.finish("manual"); return; }
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
      p.knockbackPath.length
    )
      return;
    if (command.type === "move" && validPoint(command.direction)) {
      const {x,z} = command.direction;
      const length = Math.hypot(x,z) || 1;
      p.input = {x:x/length,z:z/length};
      p.inputAt = this.time;
      if (x || z) p.facing = {...p.input};
    }
    if (command.type === "skill" && this.phase === "running") this.cast(p, command.skill, command.target);
  }

  cast(p, skill, target) {
    if(this.phase !== "running") return;
    const c = this.config.skills[skill];
    if (
      !Object.hasOwn(this.config.skills, skill) ||
      !c ||
      this.time < p.cooldowns[skill]
    )
      return;
    if (skill === "dash") {
      p.motion = {dash:true, remaining:c.distance};
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
          hit: [],
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
    if (this.phase !== "running" || victim.status === "dead" || this.time < victim.invulnerableUntil)
      return;

    const actual = Math.min(victim.health, amount);
    if (actual <= 0) return;
    victim.health -= actual;
    if(attacker.id !== victim.id) attacker.damageDealt += actual;
    if(attacker.id !== victim.id && attacker.status !== "dead") attacker.hitStreak++;
    victim.lastCombat = attacker.lastCombat = this.time;
    this.events.push({
      type: "damage",
      x: point.x,
      z: point.z,
      amount: actual,
      id: victim.id,
      attacker: attacker.id,
      hitStreak: attacker.hitStreak,
    });
    if (victim.health <= 0) {
      victim.status = "dead";
      victim.deaths++;
      victim.hitStreak = 0;
      if (attacker.id !== victim.id) attacker.kills++;
      this.dropGems(victim);
      victim.motion = null;
      victim.knockbackPath = [];
      victim.input = { x: 0, z: 0 };
      victim.respawnAt = this.time + this.config.match.respawnDelay;
    }
  }

  dropGems(p) { p.gems = 0; }

  step(dt) {
    const previousTime = this.time;
    this.time += dt;
    this.updateVictory();
    this.gems = this.gems.filter((g) => this.time < g.expiresAt);
    const c = this.config;
    for (const p of this.players.values()) {
      if (p.status === "dead") {
        if (this.time >= p.respawnAt) {
          const fresh = this.makePlayer(p.id, p.team, p.bot);
          Object.assign(p, fresh, {
            kills: p.kills, deaths: p.deaths, damageDealt: p.damageDealt,
            skin: p.skin,
            costume: p.costume,
            name: p.name,
            lastCombat: this.time,
            invulnerableUntil: this.time + c.player.respawnInvulnerability,
          });
        }
        continue;
      }
      if (this.time - p.inputAt > c.network.inputTimeout)
        p.input = { x: 0, z: 0 };
      if (p.motion?.dash) {
        const travel = Math.min(p.motion.remaining, c.skills.dash.speed*dt);
        this.moveContinuous(p,p.facing.x*travel,p.facing.z*travel);
        p.motion.remaining -= travel;
        if (p.motion.remaining <= 0) p.motion=null;
      } else {
        this.moveContinuous(p,p.input.x*c.player.moveSpeed*dt,p.input.z*c.player.moveSpeed*dt);
      }
    }
    if(this.phase === "running") {
      this.updateProjectiles(dt);
      updateExplosions(this, previousTime);
    }
    this.updateVictory();
  }

  updateProjectiles(dt) {
    const c = this.config.skills.basic;
    this.projectiles = this.projectiles.filter((b) => {
      // Substeps prevent tunneling through a player or tree between server ticks.
      const travel = Math.min(c.projectileSpeed * dt, c.range - b.traveled);
      const substeps = Math.max(1, Math.ceil(travel / c.collisionStep));
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
            p.id !== b.owner && !b.hit?.includes(p.id) &&
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
            (b.hit ||= []).push(p.id);
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
    if (this.phase !== "running" || this.time < this.endsAt) return;
    this.finish("timeout");
  }

  finish(reason) {
    this.phase = "ended";
    this.mvp = reason === "timeout" ? selectMvp(this.players.values(),this.config.match.mvp) : null;
    this.celebrationEndsAt = this.mvp ? this.time + this.config.match.mvp.celebrationDuration : null;
    this.endReason = reason;
    this.remaining = Math.max(0,this.endsAt-this.time);
    const ranking = [...this.players.values()].sort((a,b)=>b.kills-a.kills || a.deaths-b.deaths || a.id.localeCompare(b.id));
    this.winner = ranking[0]?.id || "draw";
    this.winnerName = ranking[0]?.name || "Nobody";
    this.restartAt = null;
    this.projectiles = []; this.explosions = [];
    for(const p of this.players.values()) { p.input={x:0,z:0}; p.motion=null; p.hitStreak=0; }
  }

  restart() {
    this.mvp = null;
    this.celebrationEndsAt = null;
    this.phase = "running";
    this.endReason = null;
    this.winnerName = null;
    this.events = [];
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
    this.endsAt = this.time + this.config.match.duration;
    this.events.push({ type: "restart" });
  }

  snapshot() {
    return {
      mvp: this.mvp, celebrationEndsAt: this.celebrationEndsAt,
      phase: this.phase, endReason: this.endReason, remaining: this.phase === "waiting" ? this.config.match.duration : this.phase === "ended" ? this.remaining : Math.max(0,this.endsAt-this.time),
      mode: "ffa", endsAt: this.endsAt, winnerName: this.winnerName,
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
        gems: 0, kills: p.kills, deaths: p.deaths, hitStreak: p.hitStreak, damageDealt: p.damageDealt,
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
