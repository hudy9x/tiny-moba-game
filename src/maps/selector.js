import { maps, getMap } from "./registry.js";
import { gameConfig } from "../gameConfig.js";

/** Maps are selected before constructing the world. Reload joins that map's room. */
export function setupMapSelector() {
  const url = new URL(location.href);
  const requested = url.searchParams.get("map") || gameConfig.maps.defaultId;
  const map = getMap(
    maps.some((m) => m.id === requested)
      ? requested
      : gameConfig.maps.defaultId,
  );
  const select = document.querySelector("#map-select");
  for (const entry of maps) {
    const option = document.createElement("option");
    option.value = entry.id;
    option.textContent = entry.name;
    select.append(option);
  }
  select.value = map.id;
  select.addEventListener("change", () => {
    url.searchParams.set("map", select.value);
    location.assign(url.href);
  });
  document.querySelector("#map-title").textContent = map.name.toUpperCase();
  document.querySelector("#biome-name").textContent = map.biome;
  return map.id;
}
