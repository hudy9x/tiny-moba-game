# Little World · Gem Grab

A modular Three.js + Vite grid-world with an authoritative Node.js/WebSocket match server. The only runtime packages are Three.js and `ws`; Vite supplies development and HMR.

## Run locally

Requires Node.js 22.12+ (or a supported newer version).

```sh
npm install
npm run dev
```

This starts both the WebSocket server and Vite. Open **http://localhost:5173**. A lone player automatically gets an idle enemy dummy with 1,000 HP. Open another browser tab to join the opposing team; the dummy disappears. Up to six humans can join a room, balanced into three players per team.

Use `http://localhost:5173/?room=my-room` for a separate room. Room names accept 1–32 letters, digits, underscores, or hyphens. To test across devices on the same network, use the Vite Network URL printed at startup, with the same room query. Vite proxies `/ws` to the local backend.

Separate processes, if preferred:

```sh
npm run dev:server
npm run dev:client
```

Production verification:

```sh
npm test
npm run build
# Keep the backend running, then:
npm run preview
```

A production host must proxy WebSocket upgrades at `/ws` to the backend, or set `VITE_SOCKET_URL=wss://your-host/ws` when building. `PORT` and `HOST` override the backend listener. The default listener is `127.0.0.1:3001`; the Vite proxy uses `gameConfig.network.port`, so update the proxy destination too if overriding `PORT`.

## Controls

| Action           | Input              | Behavior                                                                         |
| ---------------- | ------------------ | -------------------------------------------------------------------------------- |
| Move             | WASD / arrows      | Cardinal grid steps, interpolated smoothly; hold to repeat                       |
| Basic / Pulse    | Left click / 1     | Projectile toward cursor, blocked by trees                                       |
| Dash             | Space / 2          | Up to three tiles along the last movement direction; stops before water or trees |
| Ultimate / Bloom | Q / E / 3          | Instant area damage centered at the cursor, clamped to cast range                |
| Choose avatar    | Bottom-left picker | Appearance synchronized to other players                                         |
| Center camera    | ↺                  | Re-centers the view without teleporting the player                               |

Touch devices have movement and skill buttons; tapping the world aims and fires. The last target is used by skill buttons. Opening help releases movement; the shared match continues running.

## Balance configuration

`src/gameConfig.js` is shared directly by the browser and server. All gameplay distances are in tiles, speeds in tiles/second, and durations in seconds.

| Group     | Defaults                                                                                                   |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| Match     | 10 gems to qualify; 15-second victory hold; one mine gem every 4 seconds; 15 uncollected mine gems maximum |
| Player    | 100 HP; 5.25 tiles/second; 12 HP/second regeneration after 3 seconds without taking **or dealing** damage  |
| Basic     | 0.45-second cooldown; speed 13; range 9; damage 22                                                         |
| Dash      | 4-second cooldown; distance 3; speed 17                                                                    |
| Ultimate  | 10-second cooldown; radius 2.4; cast range 7; damage 65                                                    |
| Lifecycle | 3-second respawn; automatic new round 8 seconds after victory                                              |

The mine, team spawns, dummy position/health, team colors, pickup radius, player hit radius, server tick rate, and input timeout are also configured here. Keep mine/spawn positions on walkable terrain if editing their coordinates. Geometry dimensions and cosmetic animation timing remain in rendering modules.

## Rules and decisions

- Walk over a gem to collect it. The HUD sums carried gems by team; every actor has an overhead gem count and health bar.
- Death drops **all** carried gems in one collectible pile at the exact death position. Respawn restores full health and zero gems. Disconnection also drops carried gems.
- Dropped piles retain their full gem value and do not count against the mine's spawn cap.
- A team with at least the configured gem threshold starts its countdown. Falling below the threshold cancels it. A newly qualifying opposing team gets a fresh countdown. If both qualify simultaneously, the countdown is contested and paused by cancellation until only one qualifies.
- Friendly fire is disabled. Basic projectiles can cross water but stop at trees or the map boundary. Ultimates damage enemies within the radius without a line-of-sight requirement.
- Dashes respect every intervening tile and do not grant invulnerability. A dash pressed mid-step is briefly buffered until that step completes.
- The dummy does not move, attack, or collect gems. It regenerates and respawns using the same combat lifecycle. Its large health pool makes it useful for solo damage testing.
- Rooms and matches are held in memory. A server restart resets them. A reconnect creates a fresh player identity; it does not restore the disconnected player's inventory.

## Exact integration points

### Existing movement → server intent

`src/main.js` still owns the existing WASD/arrow/touch held-key set. Key presses and releases call `combat.move(direction)` immediately so quick taps are preserved. Each animation frame also passes the held direction into `combat.update(dt, time, direction)` for input heartbeats.

The multiplayer loop no longer calls `Player.move()` or `Player.update()`. The retained methods are usable for a separate local-only mode, and their speed reads the shared config. In multiplayer, `socket-server/match.js` handles `move` commands, validates cardinal directions, checks `world.canWalk()`, and interpolates each step at the configured speed. Clients send intent, never trusted coordinates.

### Existing world/map → shared collision rules

The server imports the same `createWorld()` from `src/world.js` used by the client. Thus the deterministic tree and water occupancy matches the rendered terrain without sending the whole grid over the network. `src/terrain.js` continues to create the instanced terrain and forest once.

`CombatController.receive()` rounds the local player's authoritative position and calls the existing `updateMap({x, z})` only when its tile changes. This keeps the minimap marker and coordinate label synchronized. The central mine is an additional visual object on tile `(22, 22)`; it does not block movement.

### Existing character/camera → snapshot rendering

`src/combat/view.js` reuses the existing `Player` class for the local explorer and each remote avatar/dummy. `CombatView.sync()` creates/removes entities and applies health, skin, team-ring color, and overhead labels from snapshots. `CombatView.update()` smoothly interpolates toward authoritative positions and animates gems, ultimate effects, and floating hit numbers.

The original fixed orthographic camera continues following `player.group.position`. It gains no orbit, zoom, or free-pan controls. The old reset action now centers the camera rather than changing a networked player's position.

### Inputs and transport

`src/combat/controller.js` raycasts cursor coordinates into the world, with direct avatar hits resolving to the actor's position. It sends basic/dash/ultimate commands, renders cooldown/health/team/victory UI, and connects the existing animation loop to `CombatView`.

`src/combat/network.js` owns the browser WebSocket, room query, welcome identity, automatic reconnect, and connection status. `socket-server/index.js` owns room membership, maximum capacity, input payload/rate limits, dead-connection cleanup, and snapshot broadcasts. `socket-server/match.js` is a pure simulation with no socket or rendering dependencies.

### Protocol

Client messages:

```js
{ type: 'move', direction: { x: 1, z: 0 } }
{ type: 'move', direction: { x: 0, z: 0 } } // Release input
{ type: 'skill', skill: 'basic', target: { x: 25, z: 22 } }
{ type: 'skill', skill: 'dash' }
{ type: 'skill', skill: 'ultimate', target: { x: 25, z: 22 } }
{ type: 'skin', skin: 'sprout' }
```

The server sends `welcome` with player ID/room, then `state` at 30 Hz with players, projectiles, gems, server time, team totals, countdown/winner state, and transient damage/ultimate events. The server validates skill cooldowns/range/damage and exclusively resolves pickups/deaths/victory. Broadcast events are consumed once per tick and delivered identically to the room.

## Verification

`npm test` covers deterministic terrain, connected walkable space, invalid moves, tap movement, dash obstacle traversal/speed/cooldowns, projectile collision/range/friendly fire, ultimate targeting, regeneration, mine cap/pickup uniqueness, death/drop/respawn, team totals, cancellation/theft, win/restart, disconnects, malformed inputs, and real multi-client WebSocket synchronization/room isolation/capacity.

This is a local/LAN prototype, with no accounts, persistence, matchmaking service, or latency prediction. Client interpolation smooths snapshots; movement follows server acknowledgement. Shared geometry is reused for gems, projectiles, and team rings; entity meshes and effect resources are cleaned up when removed.
