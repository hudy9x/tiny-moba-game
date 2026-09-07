/** Breadth-first navigation shares the authoritative walkability grid. */
export function updateBot(match, bot) {
  if (
    match.mode !== "battle" ||
    bot.motion ||
    bot.status === "dead" ||
    bot.knockbackPath.length
  )
    return;
  const target = [...match.players.values()].find(
    (p) => !p.bot && p.status !== "dead",
  );
  if (!target) return;
  if (match.time >= (bot.nextAttack || 0)) {
    match.cast(bot, "basic", target);
    bot.nextAttack = match.time + match.config.bot.attackInterval;
  }
  if (Math.hypot(bot.x - target.x, bot.z - target.z) < 2) return;
  const queue = [{ ...bot.tile, first: null }],
    seen = new Set();
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i],
      key = `${p.x},${p.z}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (p.x === target.tile.x && p.z === target.tile.z && p.first) {
      bot.facing = { x: p.first.x - bot.tile.x, z: p.first.z - bot.tile.z };
      match.startMotion(bot, p.first, match.config.bot.moveSpeed);
      return;
    }
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const next = { x: p.x + dx, z: p.z + dz };
      if (
        match.world.canWalk(next.x, next.z) &&
        !seen.has(`${next.x},${next.z}`)
      )
        queue.push({ ...next, first: p.first || next });
    }
  }
}
