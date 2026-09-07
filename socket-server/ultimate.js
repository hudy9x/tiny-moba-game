import {
  explosionProgress,
  expansionRadius,
  stageStarts,
} from "../src/combat/ultimateTimeline.js";

export function detonate(match, player, target) {
  const c = match.config.skills.ultimate;
  // Select the nearest tile center within cast range, including water/obstacle tiles.
  const candidates = match.world.tiles.filter(
    (t) => Math.hypot(t.x - player.x, t.z - player.z) <= c.range,
  );
  candidates.sort(
    (a, b) =>
      Math.hypot(a.x - target.x, a.z - target.z) -
      Math.hypot(b.x - target.x, b.z - target.z),
  );
  const center = candidates[0];
  if (!center) return;
  match.explosions.push({
    id: ++match.sequence,
    owner: player.id,
    team: player.team,
    x: center.x,
    z: center.z,
    radius: c.radius,
    damage: c.damage,
    animationSpeed: c.animationSpeed,
    duration: c.duration,
    startedAt: match.time,
    hit: new Set(),
  });
}

/** Radial displacement follows a safe cardinal tile path so no water/solid corners are crossed. */
export function knockback(match, player, center, fallback) {
  const c = match.config.skills.ultimate;
  const start = { x: Math.round(player.x), z: Math.round(player.z) };
  let dx = player.x - center.x,
    dz = player.z - center.z;
  if (Math.hypot(dx, dz) < 0.001) {
    dx = fallback.x;
    dz = fallback.z;
  }
  const length = Math.hypot(dx, dz) || 1;
  const desired = {
    x: start.x + Math.round((dx / length) * c.knockbackDistance),
    z: start.z + Math.round((dz / length) * c.knockbackDistance),
  };
  const path = [];
  let tile = { ...start };
  while (tile.x !== desired.x || tile.z !== desired.z) {
    const xRemaining = desired.x - tile.x,
      zRemaining = desired.z - tile.z;
    const next = { ...tile };
    if (Math.abs(xRemaining) >= Math.abs(zRemaining))
      next.x += Math.sign(xRemaining);
    else next.z += Math.sign(zRemaining);
    if (!match.world.canWalk(next.x, next.z)) break;
    path.push(next);
    tile = next;
  }
  player.input = { x: 0, z: 0 };
  player.inputAt = -Infinity;
  // Include a short settle to the current tile when interrupting a step.
  if (Math.hypot(player.x - start.x, player.z - start.z) > 0.001)
    path.unshift(start);
  player.motion = null;
  player.tile = { ...start };
  player.knockbackPath = path;
  beginKnockbackStep(match, player);
}

export function beginKnockbackStep(match, player) {
  const next = player.knockbackPath?.shift();
  if (!next) return;
  match.startMotion(player, next, match.config.skills.ultimate.knockbackSpeed);
  player.motion.knockback = true;
}

export function updateExplosions(match, previousTime) {
  const c = match.config.skills.ultimate;
  for (const blast of match.explosions) {
    const progress = explosionProgress(blast, match.time);
    const previous = explosionProgress(blast, previousTime);
    if (progress < stageStarts[1] || previous >= stageStarts[3]) continue;
    // Handle a tick crossing either edge of the hit window without missing the hit.
    const radius = expansionRadius(
      Math.min(progress, stageStarts[3]),
      blast.radius,
    );
    const owner = match.players.get(blast.owner);
    if (!owner) continue;
    for (const victim of match.players.values()) {
      if (
        victim.team === blast.team ||
        victim.status === "dead" ||
        blast.hit.has(victim.id) ||
        match.time < victim.invulnerableUntil ||
        Math.hypot(victim.x - blast.x, victim.z - blast.z) > radius
      )
        continue;
      blast.hit.add(victim.id);
      match.damage(victim, owner, blast.damage);
      if (victim.status !== "dead" && c.knockbackDistance > 0)
        knockback(match, victim, blast, owner.facing);
    }
  }
  match.explosions = match.explosions.filter(
    (b) => explosionProgress(b, match.time) < 1,
  );
}
