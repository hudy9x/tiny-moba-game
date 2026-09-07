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
| Ultimate / Bloom | Q / E / 3          | Six-stage explosion at the targeted tile; damage and knockback during expansion                |
| Choose avatar    | Bottom-left picker | Appearance synchronized to other players                                         |
| Center camera    | ↺                  | Re-centers the view without teleporting the player                               |

Touch devices have movement and skill buttons; tapping the world aims and fires. The last target is used by skill buttons. Opening help releases movement; the shared match continues running.

## Balance configuration

`src/gameConfig.js` is shared directly by the browser and server. All gameplay distances are in tiles, speeds in tiles/second, and durations in seconds.

| Group     | Defaults                                                                                                                                      |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Match     | 10 gems to qualify; 15-second victory hold; 1–4 scattered gems every 4 seconds; 15 uncollected mine gems maximum; gems expire after 5 seconds |
| Player    | 100 HP; 5.25 tiles/second; 12 HP/second regeneration after 3 seconds without taking **or dealing** damage                                     |
| Basic     | 0.45-second cooldown; speed 13; range 9; damage 22                                                                                            |
| Dash      | 4-second cooldown; distance 3; speed 17                                                                                                       |
| Ultimate  | 10-second cooldown; radius 2.4; cast range 7; damage 65                                                                                       |
| Lifecycle | 5-second respawn; 2-second respawn invulnerability; automatic new round 8 seconds after victory                                               |

Gem batch limits, scatter radius (4 tiles), expiry, respawn/shield timers, dummy health, team colors, hit/pickup radii, and network timing also live in `src/gameConfig.js`. Its `vfx` section controls beam size/colors, spark count/speed/gravity/lifetime/pool capacity, and damage-text pop/rise/lifetime. Map-specific mine, team spawn, and dummy coordinates live beside each collision grid in `src/maps/layouts.json`.

## Map selection

Choose **The Greenwood**, **Canyon Arena**, or **River Crossing** from the header selector. Selection changes the `map` URL parameter and reloads the page. The three layouts have distinct collision grids, palettes, mine/dummy/spawn coordinates, and obstacles: forest paths, sandstone rock corridors, and bridged water channels.

Examples:

- `http://localhost:5173/?map=greenwood&room=friends`
- `http://localhost:5173/?map=canyon&room=friends`
- `http://localhost:5173/?map=river&room=friends`

Players must use the same **map and room** to share a match. The server keys rooms by both values; changing map cannot move other players or mix incompatible collision grids. An unknown map ID is rejected by the server (the selector falls back to the default map for invalid browser URLs).

Each JSON layout contains `size`, `rows`, `palette`, `obstacle`, `mine`, two team `spawns`, and `dummy`. Grid characters: `.` grass, `:` sand/path, `~` water, `T` solid tree or rock. Coordinates use column `x` and row `z`, both zero-based. Keep spawn/mine/dummy points walkable and connected. The shared registry is imported by Node and Vite; no map-fetch request is needed.

## Rules and decisions

- Walk over a gem to collect it. The HUD sums carried gems by team; every actor has an overhead gem count and health bar.
- Death drops **all** carried gems in one collectible pile on the rounded, walkable death tile. The player enters `status: "dead"`, stops accepting movement/skills, is hidden, and gets a five-second countdown. Respawn restores full HP and zero gems at the team spawn, followed by two seconds of server-enforced invulnerability with a visible shield. Disconnection also drops carried gems.
- Dropped piles retain their full gem value and do not count against the mine's spawn cap. Both dropped piles and mine gems expire five seconds after creation, even during the victory screen. Expired gems cannot be collected on the expiry tick.
- Every mine cycle draws a random batch of 1–4 gems, restricted by the cap and available tiles. Gems scatter to distinct unoccupied walkable tiles reachable within four tiles of the mine. Collection removes the gem and increments inventory in the same server tick; the next snapshot updates every client.
- A team with at least the configured gem threshold starts its countdown. Falling below the threshold cancels it. A newly qualifying opposing team gets a fresh countdown. If both qualify simultaneously, the countdown is contested and paused by cancellation until only one qualifies.
- Friendly fire is disabled. Basic projectiles can cross water but stop at trees, rocks, or the map boundary. Ultimates damage enemies within the radius without a line-of-sight requirement.
- Dashes respect every intervening tile and do not grant invulnerability. A dash pressed mid-step is briefly buffered until that step completes.
- The dummy does not move, attack, or collect gems. It regenerates and respawns using the same combat lifecycle. Its large health pool makes it useful for solo damage testing.
- Rooms and matches are held in memory. A server restart resets them. A reconnect creates a fresh player identity; it does not restore the disconnected player's inventory.

## Exact integration points

### Existing movement → server intent

`src/main.js` still owns the existing WASD/arrow/touch held-key set. Key presses and releases call `combat.move(direction)` immediately so quick taps are preserved. Each animation frame also passes the held direction into `combat.update(dt, time, direction)` for input heartbeats.

The multiplayer loop no longer calls `Player.move()` or `Player.update()`. The retained methods are usable for a separate local-only mode, and their speed reads the shared config. In multiplayer, `socket-server/match.js` handles `move` commands, validates cardinal directions, checks `world.canWalk()`, and interpolates each step at the configured speed. Clients send intent, never trusted coordinates.

### Existing world/map → shared collision rules

Before creating the scene, `src/main.js` calls `setupMapSelector()` and passes its map ID to `createWorld(mapId)`. The server constructs `new Match(gameConfig, mapId)`, which loads the exact same JSON grid through `createWorld(mapId)`. `world.size`, `world.spawns`, `world.mine`, `world.dummy`, and `world.map.palette` drive camera initialization, character placement, collision checks, mine rendering, and the minimap. `src/terrain.js` still builds instanced batches once, rendering canyon obstacles as rock columns.

`CombatController.receive()` rounds the local player's authoritative position and calls the existing `updateMap({x, z})` only when its tile changes. This keeps the minimap marker and coordinate label synchronized. The mine uses `world.mine` (Greenwood/Canyon `(22, 22)`, River `(24, 23)`); it does not block movement.

### Existing character/camera → snapshot rendering

`src/combat/view.js` reuses the existing `Player` class for the local explorer and each remote avatar/dummy. `CombatView.sync()` creates/removes entities and applies health, skin, team-ring color, and overhead labels from snapshots. `CombatView.update()` smoothly interpolates toward authoritative positions and animates gems, ultimate effects, and floating hit numbers.

The original fixed orthographic camera continues following `player.group.position`. It gains no orbit, zoom, or free-pan controls. The old reset action now centers the camera rather than changing a networked player's position.

### VFX and lifecycle in the game loop

`CombatView.sync()` forwards authoritative projectiles to `CombatVFX.sync()` and dispatches server `shot` and `impact` events to the effect system. `CombatVFX.update(dt)`, called by `CombatView.update()`, advances white/pink radial sparks and short white-core/yellow-glow muzzle thrusts. Traveling tapered beams follow projectile position/direction. Shared beam geometry/materials and recycled beam groups avoid per-shot geometry allocations; a fixed pool of 280 instanced spark particles uses one draw call. Expired effects recycle their slots, and `dispose()` releases resources.

The visual thrust does not change combat balance: a basic projectile still stops on its first enemy/obstacle collision. Impact events are emitted even for obstacles and invulnerability shields; only actual damage produces the popping/fading text, positioned at the collision point.

`Match.damage()` transitions an actor to `dead`, clears motion/input, drops gems, and assigns `respawnAt`. `Match.step()` restores the actor when due and sets `invulnerableUntil`; `damage()` rejects all damage during that interval, including ultimates. Both timestamps and `status` are synchronized in snapshots. `CombatController.receive()` clears held inputs at death/respawn transitions; `move()` and `cast()` also reject dead-player input locally. `CombatView` hides dead actors and adds a temporary wireframe shield after respawn.

`socket-server/gems.js` caches reachable scatter candidates once per match, draws the random batch, and assigns `expiresAt`. `Match.step()` expires gems before spawning/collection, preventing last-tick duplicate or expired pickups. The random source is injectable into `Match` for deterministic tests; gameplay uses server-side `Math.random()`.

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

The server sends `welcome` with player ID/room/map ID, then `state` at 30 Hz with players, projectiles, gems, server time, team totals, countdown/winner state, actor `status`/`invulnerableUntil`, gem `expiresAt`, map ID, and active explosions (including their start time and animation parameters), and transient shot/impact/damage events. The server validates skill cooldowns/range/damage and exclusively resolves pickups/deaths/victory. Broadcast events are consumed once per tick and delivered identically to the room.

## Verification

`npm test` covers deterministic terrain, connected walkable space, invalid moves, tap movement, dash obstacle traversal/speed/cooldowns, projectile collision/range/friendly fire, ultimate targeting, regeneration, mine cap/pickup uniqueness, death/drop/respawn, team totals, cancellation/theft, win/restart, disconnects, malformed inputs, all three map layouts/connectivity/spawns, random gem batch size/scattering/expiry, dead-state input blocking, respawn protection, VFX pooling/cleanup, and real multi-client WebSocket synchronization/map-room isolation/capacity.

This is a local/LAN prototype, with no accounts, persistence, matchmaking service, or latency prediction. Client interpolation smooths snapshots; movement follows server acknowledgement. Shared geometry is reused for gems, projectiles, and team rings; entity meshes and effect resources are cleaned up when removed.


### Ultimate explosion integration

`gameConfig.skills.ultimate` exposes `radius`, `damage`, and `animationSpeed` (1 = normal, 2 = twice as fast), plus `duration`, `knockbackDistance`, and `knockbackSpeed`. Colors and atlas resolution live in `gameConfig.vfx.explosion`.

`socket-server/ultimate.js` snaps casts to the nearest tile inside cast range and creates an explosion immediately. `Match.step()` advances its shared timeline: ignition, puffy expansion, peak shockwaves, fragmentation, hollow smoke/embers, and fade. Enemies are checked during 10–42% of the animation, hit only once per explosion, and knocked back along walkable grid tiles. Allies, dead actors, and invulnerable actors are excluded. Water and obstacles stop knockback; the movement loop resumes after displacement completes.

`CombatView.sync()` forwards snapshot explosions to `ExplosionRenderer`; `CombatView.update()` advances their animation each frame. `src/combat/explosionFrames.js` paints procedural cel-shaded frames into a shared atlas, while `src/combat/ultimateTimeline.js` keeps visual phases and server damage timing aligned. No external textures or new dependencies are required. Completed effects dispose their materials, texture views, and shockwave geometry; the final active effect also releases the shared atlas and its canvas pixels.

### Winter arena and skill audio

Choose **Frostpine Hollow** in the map selector (or `?map=winter`). Its JSON layout includes snowy paths, blue ponds that block movement, snow-capped pine obstacles, and map-specific spawn/mine coordinates. Pine geometry uses the existing terrain instance batches.

Click the sound button to enable ambience and skill sounds: a short descending pulse for the basic attack, filtered wind for dash, and a low boom for Ultimate. Sound starts muted and only initializes Web Audio after this click. Confirmed server shots/dashes and newly received explosions drive playback, so rejected casts stay silent and explosion snapshots do not repeat the sound. Nearby casts are louder; voices are capped and disconnected after playback. No audio files or dependencies are required.

Tune `gameConfig.audio` for master/ambient volume, audible distance, voice cap, and each skill's duration, frequencies, and volume. `src/audio.js` owns synthesis and cleanup; `CombatView.sync()` connects combat events to playback; the existing sound button toggles the shared context.

### Start menu, costumes, and moving opponent

The entry point is `src/entry.js`: select a mode, press Start game, customize Pip/Sprout (body color, eyes, hat), choose a map, then enter. The game and network connection are created only after setup. Click the Little World logo to return to the menu. Frostpine Hollow is the winter option. Mode/map/room together isolate multiplayer sessions.

Bot Battle enables a moving, shooting practice opponent; Training keeps the high-health dummy idle. Gem Grab retains the multiplayer gem objective. The practice modes also retain arena gems and combat rules. `socket-server/bot.js` uses breadth-first paths through walkable tiles; `gameConfig.bot` controls its movement speed and attack interval. Hurt actors briefly flash pink alongside existing sparks and damage numbers.

Costumes are validated by `src/costume.js`, synchronized in player snapshots, and rendered by `Player.build()`. Menu choices are remembered for this browser tab. Replace the supplied `public/sounds/basic.wav`, `dash.wav`, and `ultimate.wav` to customize skill audio; reload and enable sound. Missing or invalid audio falls back to synthesis. Paths and volumes live in `gameConfig.audio`.
