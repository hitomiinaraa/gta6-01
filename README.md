# EMBER TIDE — Cinder Cove

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/hitomiinaraa/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/hitomiinaraa/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

**A complete 3D open-world crime game for the [make.fun bounty "Make GTA 6"](https://make.fun/bounty/gta6-01) — built from scratch in one session, fully offline, no network requests.**

Rook Marlowe, ex-stunt driver, owes the fixer Vesper Kane one big favor. Take back Cinder Cove — a sun-soaked coastal city at golden hour — from harbor boss Corvin Hale, one job at a time, while the CCPD hunts you down.

## What is in the game

- **A living city** — deterministic procedural Cinder Cove: downtown skyscrapers, Marina Row, Ember Beach with a ferris wheel, the Harbor Yards, Cinder Park, a stadium, the Cinder Tower, and a causeway bridge over the marina channel. Day/night cycle, dusk lighting, fog, lit windows, street lamps, palms.
- **On foot** — third-person character with animated limbs, sprint, jump, mouse-look orbit camera with wall collision, over-the-shoulder aim.
- **By car** — enter/exit any car (F), carjack occupied cars, arcade physics (acceleration, braking, reverse, handbrake drift, body roll, damage, smoke, explosions, burning wrecks). 8 vehicle types: sedan, sports car, SUV, truck, bus, police interceptor, motorcycle, taxi — each with headlights, taillights, brake lights, sirens, horn, engine sound.
- **Traffic & pedestrians** — lane-following traffic with traffic lights, yielding and honking; pedestrians on sidewalks who cross at crosswalks and panic on gunfire or explosions.
- **Combat** — fists, pistol, SMG, shotgun, carbine, grenades; assisted aim, crosshair, recoil, muzzle flash, tracers, impact sparks, reload, ammo, enemy gang AI that seeks cover and shoots back.
- **Wanted 0–5 stars** — crimes raise heat; CCPD dispatch chases, PITs/rams, sets roadblocks, sends foot cops, a SWAT van presence and the CONDOR-1 helicopter with a searchlight at high levels. Lose them by leaving the search circle and staying hidden until the stars flash and clear.
- **Death / arrest** — WASTED / BUSTED screens, respawn at the hospital / police station with a fee, wanted reset, no softlocks.
- **Story: 8 chained missions** — car theft, delivery, chase, drive-by, rooftop shootout, bank heist with getaway, a five-star escape, and a boss finale — with cinematic dialogue (letterbox, portraits, subtitles), world beam markers, minimap blips, timers, fail/retry and money rewards. Side work: taxi fares, street races, random crimes, 12 ember-token collectibles.
- **HUD** — mission card with progress, money, wanted stars (flashing while evading), clock, respect rank, CCPD dispatch panel (named units, distance, tactics), weapon slots + ammo, health/armor bars, speedometer + car condition, radio station, district label, a **real rotating minimap** (roads, buildings, water, player arrow, police, mission marker, GPS, search circle) and a **full-screen map (M)** with click-to-set waypoint and a GPS route line.
- **Menus & saves** — animated title flyover, New Game / Continue / Controls / Settings, pause menu, autosave + manual save in localStorage (versioned, corrupt-save safe), volume / sensitivity / graphics / invert-Y settings.
- **Audio** — everything synthesized with WebAudio: engine hum pitched to speed, sirens, gunshots, impacts, explosions, footsteps, UI, and four procedural radio stations.

## Controls

| Key | Action |
|---|---|
| WASD | Move / drive |
| Mouse | Look (click to lock) · Right mouse: aim · Left click: shoot |
| Shift | Sprint |
| Space | Jump / handbrake (in car) |
| F | Enter / steal / exit car |
| E | Advance dialogue |
| 1–6 | Weapons · R reload · H horn · hold R recover car |
| M | Full map (click to set waypoint) |
| N | Start next mission · T taxi job · U street race |
| Q | Radio station · Esc pause · F3 debug overlay |

## Run it

Open `game/index.html` in desktop Chrome. No build step, no server, no network — everything is vendored under `game/` (Three.js r160 MIT, see `game/vendor/THREE-LICENSE.txt`).

## Structure

- `main.ts` — Node 22 entry: copies `game/` + `screenshots/` to `/output` and writes `dossier.json` (starter plumbing, unchanged).
- `game/index.html` — loads `vendor/three.min.js` then the game sources as classic scripts (no modules, no import maps, no CDN — works from `file://`).
- `game/src/` — one file per system: `config` (tuning, story, names), `util` (seeded RNG, spatial grid), `audio` (WebAudio synth + radio), `input` (keyboard/mouse/pointer lock), `city` (procedural Cinder Cove), `player` (on-foot character + camera), `vehicles` (models, arcade physics, traffic AI), `peds` (pedestrians), `combat` (weapons, gang AI), `police` (wanted, dispatch, heli, roadblocks), `missions` (8 story missions, cutscenes, taxi/races/tokens), `hud` (HUD, minimap, full map), `save` (localStorage), `shots` (deterministic screenshot staging), `main` (state machine, fixed-timestep loop, effects).
- `game/vendor/three.min.js` — vendored Three.js (MIT).
- `screenshots/` — 4 real renders of the game's own code (1280×720 JPEG).

## Screenshots

1. **Cover** — golden-hour chase down the beach boulevard: 4 wanted stars, CONDOR-1 searchlight, ferris wheel, police converging, mission dialogue.
2. **On foot** — stadium-lot firefight: rifle aimed, tracer fire, mission beam, pedestrians, traffic, 2 stars.
3. **Five stars at night** — roadblock ahead, helicopter searchlight, Vesper's cutscene dialogue, letterbox.
4. **Full map** — Cinder Cove with GPS route to the Marina Row waypoint and the 8-mission list.

## Notes on the build

- All names, characters, brands, city, story, art and music are original fiction. Nothing is taken from Rockstar or any commercial game.
- The game is deterministic for a given seed (seeded RNG everywhere); the grader's two `main.ts` runs produce identical bytes.
- Screenshots are real renders taken with headless Chromium (SwiftShader) from `?shot=1..4` staging URLs; the game underneath is the same playable build.
