/** Shared by the browser and authoritative server. Distances are tiles; times are seconds. */
export const gameConfig = {
  match: {
    winningGemCount: 10,
    victoryCountdown: 15,
    gemSpawnInterval: 4,
    gemCap: 15,
    pickupRadius: 0.65,
    respawnDelay: 3,
    restartDelay: 8,
    maxPlayers: 6,
    teamSize: 3,
    mine: { x: 22, z: 22 },
    spawns: [
      { x: 23, z: 24 },
      { x: 23, z: 20 },
    ],
    dummy: { x: 25, z: 22, health: 1000 },
  },
  player: {
    baseHealth: 100,
    moveSpeed: 5.25,
    regenerationDelay: 3,
    regenerationPerSecond: 12,
    hitRadius: 0.38,
  },
  skills: {
    basic: { cooldown: 0.45, projectileSpeed: 13, range: 9, damage: 22 },
    dash: { cooldown: 4, distance: 3, speed: 17 },
    ultimate: { cooldown: 10, radius: 2.4, range: 7, damage: 65 },
  },
  network: {
    tickRate: 30,
    inputInterval: 0.08,
    inputTimeout: 0.35,
    port: 3001,
  },
  teams: [
    { name: "Fern", color: "#3eaa89" },
    { name: "Coral", color: "#ee7866" },
  ],
};
