# Multiplayer Snake Arena

Play it now: https://vallmond.github.io/snake

## Features

- **Multisnake arena**: player plus up to four AI snakes spawned around the map with deterministic behaviour.
- **Deterministic game loop**: fixed-timestep updates, queued inputs, and consistent collision ordering.
- **Head-to-head combat**: longer snakes survive faceoffs; respawning AI enjoy a brief safe window.
- **Smart food system**: multiple food types (standard, bulk, speed boost) with deterministic spawning and effects.
- **AI rivals**: each tick, bots plan their turns by considering obstacles, food distance, and safe exits.
- **Dynamic board presets**: choose arena sizes, speeds, and opponent counts on demand.
- **Responsive canvas**: cell size auto-adjusts to fit desktop and mobile viewports without cropping.
- **Mobile joystick & gestures**: swipe anywhere or use the analog-style on-screen joystick for touch devices.
- **Restart controls**: instant restart via `R` key, Enter/Space after game over, or button tap on HUD.
- **GitHub Pages export**: `npm run export:docs` builds to `docs/` with relative asset paths for publishing.

## Getting Started

```bash
npm install
npm run dev
```

Visit the printed local URL to play. Use the HUD toggles to experiment with different arenas and opponent counts.

## Scripts

- `npm run dev` – start the dev server with hot reload.
- `npm run build` – type-check and bundle for production.
- `npm run export:docs` – build and copy static files into `docs/` for GitHub Pages.
- `npm run lint` – run ESLint on the project.

## Folder Highlights

- `src/game/` – game engine, deterministic RNG, state updates, and AI logic.
- `src/App.tsx` – canvas renderer, responsive UI, mobile controls, and HUD.
- `scripts/export-gh-pages.mjs` – helper to publish the latest build to GitHub Pages.

## Controls

- **Desktop**: Arrow keys / WASD to steer, `R` to restart, Enter/Space to restart after game over.
- **Mobile**: swipe anywhere on the board or drag the joystick; tap HUD restart when needed.
- **HUD**: adjust board presets, opponent counts, and observe tick/length/boost status in real time.

Enjoy tweaking the arena or branch the AI to create distinctive behaviours and difficulty levels!
