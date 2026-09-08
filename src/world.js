import { getMap } from "./maps/registry.js";
// Compatibility exports for local-only callers. Multiplayer uses world.size/spawns.
export const SIZE = getMap().size;
export const START = getMap().spawns[0];
export function noise(x, z) {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
export function isWater(x, z, mapId) {
  return getMap(mapId).rows[z]?.[x] === "~";
}

/** JSON legend: . grass, : sand/path, ~ water, T solid tree/rock. */
export function createWorld(mapId) {
  const map = getMap(mapId);
  const tiles = [],
    lookup = new Map();
  for (let z = 0; z < map.size; z++)
    for (let x = 0; x < map.size; x++) {
      const value = map.rows[z][x];
      const tile = {
        x,
        z,
        water: value === "~",
        tree: ["T","H","M"].includes(value),
        house: value === "H",
        mountain: value === "M",
        bridge: value === "B",
        elevation: map.mountainHeights?.[`${x},${z}`] || 0,
        sand: value === ":",
      };
      tiles.push(tile);
      lookup.set(`${x},${z}`, tile);
    }
  return {
    map,
    size: map.size,
    mine: map.mine,
    spawns: map.spawns,
    dummy: map.dummy,
    tiles,
    lookup,
    canWalk(x, z) {
      const tile = lookup.get(`${x},${z}`);
      return !!tile && !tile.water && !tile.tree;
    },
  };
}
