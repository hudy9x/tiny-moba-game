# Little World
A self-contained Three.js isometric exploration prototype, served by Vite with HMR.

## Run
- `npm install`
- `npm run dev`
- `npm run build` for production; `npm run preview` to preview it.
- `npm test` verifies terrain determinism, collisions, and connected exploration.

Move with WASD or arrow keys, or the on-screen controls on small screens. Hold a direction for continuous steps. Trees, water, and world boundaries block movement. Select Pip or Sprout in the lower left. The return button resets your position. Optional synthesized river ambience needs no external assets.

## Structure
- `src/world.js`: deterministic grid and collision model.
- `src/terrain.js`: instanced terrain, water, trunks, foliage, and grass.
- `src/player.js`: procedural character models and interpolated tile movement.
- `src/main.js`: renderer, fixed orthographic follow camera, input, map, UI, and audio.

Terrain uses six instanced batches with shared box geometry, capped device pixel ratio, and one directional shadow map. The camera follows the player without orbit, zoom, or panning controls. All visuals are generated locally without image downloads or remote fonts.
