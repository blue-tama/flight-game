[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/blue-tama/flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/blue-tama/flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

# Ridgeline Run

An entry for the [make.fun best flight game bounty](https://make.fun/bounty/best-flight-game-20261126-0057): a bush pilot's valley run in plain Canvas 2D. Take off from the home strip, thread the glowing rings down a mountain valley — river below, ridgelines on both sides, snow on the high ground — and put her down on the far strip before the tanks run dry.

## The flying

- **Arcade flight model with teeth:** throttle chases a target speed, pitch climbs and dives, bank turns the heading. Below stall speed the wing stops flying and the nose drops; steep banks scrub speed; the airbrake (Space) drags you down for the landing.
- **Three missions:** Ring Run (8 rings, full tanks), Canyon Sprint (10 rings against a 180-second clock, tight fuel), Storm Pass (8 rings in gusting wind that pushes the plane around).
- **Fuel and damage are decisions:** every ring buys back fuel, every terrain scrape costs hull, a hard touchdown costs more. Land gently on the far strip for the landing bonus — fuel and hull left over pay out.
- **Instruments that fly:** airspeed, altitude, heading, vertical speed, throttle, fuel and hull on the HUD, plus an attitude indicator that rolls and pitches with the plane and a flight director pointing at the next ring.
- **Controls:** W/S throttle, arrows (or A/D) pitch and bank, mouse steers while held, Space airbrake, P pause, R restart, 1/2/3 pick a mission. Engine hum, wind, ring chimes and warnings are synthesised live with WebAudio — no audio files.

## The code

- `game/src/config.js` — every tuning number, mission and colour in one place.
- `game/src/random.js` — the seeded RNG and value noise the valley is built from.
- `game/src/terrain.js` — the valley: height function, runway strips, river, ring course, clouds.
- `game/src/plane.js` — the flight model: throttle, pitch, bank, stall, turns.
- `game/src/world.js` — the mission and the sortie: fuel, damage, rings, landings, crashes, score.
- `game/src/input.js` — keyboard and mouse, held keys and one-shot presses.
- `game/src/render.js` — the chase camera, the heightfield terrain, rings, strips, the plane and the HUD.
- `game/src/audio.js` — synthesised engine, wind, chimes and warnings.
- `game/src/shots.js` — the screenshot scenes, flown by an autopilot on the real rules.
- `game/src/main.js` — boot, the fixed-step loop and the title/play/paused/over screens.

Open `game/index.html` in a desktop browser and fly. `?seed=N` fixes the valley; `?shot=start|play|land|end&seed=N` stages a screenshot scene.

## How to run it

```sh
# Play it locally (any static server will do):
python3 -m http.server 8080 --directory game
# then open http://localhost:8080 in desktop Chrome.

# Hand it in (writes game/, screenshots/ and dossier.json to out/):
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```
