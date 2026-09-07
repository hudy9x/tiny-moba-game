import layouts from "./layouts.json" with { type: "json" };
import { gameConfig } from "../gameConfig.js";

export const maps = layouts;
export function getMap(id = gameConfig.maps.defaultId) {
  const map = maps.find((map) => map.id === id);
  if (!map) throw new Error(`Unknown map: ${id}`);
  return map;
}
