/** Cached reachable scatter tiles and authoritative gem lifecycle helpers. */
export function scatterTiles(world, radius) {
  const queue = [world.mine],
    seen = new Set(),
    candidates = [];
  for (let i = 0; i < queue.length; i++) {
    const tile = queue[i],
      key = `${tile.x},${tile.z}`;
    if (seen.has(key) || !world.canWalk(tile.x, tile.z)) continue;
    seen.add(key);
    const d = Math.hypot(tile.x - world.mine.x, tile.z - world.mine.z);
    if (d > radius) continue;
    if (d > 0) candidates.push({ ...tile });
    for (const [x, z] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      queue.push({ x: tile.x + x, z: tile.z + z });
  }
  return candidates;
}

export function spawnGemBatch(match) {
  const c = match.config.match;
  const count = Math.min(
    c.gemCap - match.gems.filter((g) => g.mine).length,
    c.gemBatchMin +
      Math.floor(match.random() * (c.gemBatchMax - c.gemBatchMin + 1)),
  );
  const occupied = new Set(match.gems.map((g) => `${g.x},${g.z}`));
  const free = match.scatterCandidates.filter(
    (t) => !occupied.has(`${t.x},${t.z}`),
  );
  for (let i = 0; i < count && free.length; i++) {
    const index = Math.floor(match.random() * free.length);
    const [point] = free.splice(index, 1);
    match.gems.push({
      id: ++match.sequence,
      ...point,
      value: 1,
      mine: true,
      expiresAt: match.time + c.gemDespawnTime,
    });
  }
}
