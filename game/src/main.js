// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between four screens: title,
// play, paused and over. The throttle is a setting the pilot moves up and
// down; pitch and bank are targets the plane eases toward.
//
// ?seed=N fixes the valley and the ring course. ?shot=start|play|land|end
// (with &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot.

import { BEST_KEY, PLANE, STEP } from './config.js';
import { createWorld, EVENT_CRASH, EVENT_FUEL_EMPTY, EVENT_LAND, EVENT_RING } from './world.js';
import { ACTION_CONFIRM, ACTION_MISSION_1, ACTION_MISSION_2, ACTION_MISSION_3, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** Throttle units a second while the key is held. */
const THROTTLE_RATE = 0.9;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(seed);
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, world.state.time);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let missionId = 0;
  let throttle = 0;
  let accumulator = 0;
  let last = performance.now();
  let fuelWarned = false;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each ring.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset(missionId);
    throttle = 0;
    fuelWarned = false;
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce(`Flying. ${world.state.mission.name}. ${world.state.rings.length} rings, then land on the far strip.`);
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    if (world.state.status === 'landed') {
      audio.land();
      announce(`Landed. Mission complete. Score ${world.state.score}. Best ${best}.`);
    } else {
      audio.thud();
      announce(`Down. ${world.state.crashReason} Score ${world.state.score}. Best ${best}.`);
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MISSION_1 && screen === SCREEN_TITLE) {
      missionId = 0;
      world.reset(0);
      audio.click();
      announce('Mission 1, Ring Run.');
    } else if (actions & ACTION_MISSION_2 && screen === SCREEN_TITLE) {
      missionId = 1;
      world.reset(1);
      audio.click();
      announce('Mission 2, Canyon Sprint.');
    } else if (actions & ACTION_MISSION_3 && screen === SCREEN_TITLE) {
      missionId = 2;
      world.reset(2);
      audio.click();
      announce('Mission 3, Storm Pass.');
    }
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) startGame();
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
    if (actions & ACTION_RESTART && (screen === SCREEN_PLAY || screen === SCREEN_OVER)) startGame();
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      // The title's backdrop taxis slowly so the valley is alive behind the panel.
      world.step(STEP, { pitch: 0, bank: 0, throttle: 0.3, brake: false }, 0);
      return;
    }
    throttle = Math.min(1, Math.max(0, throttle + input.throttleDelta() * THROTTLE_RATE * STEP));
    const gust = world.state.mission.turbulence === 0 ? 0 : (Math.random() * 2 - 1) * world.state.mission.turbulence;
    const controls = {
      pitch: input.pitch() * PLANE.maxPitch,
      bank: input.bank() * PLANE.maxBank,
      throttle,
      brake: input.brake(),
    };
    const events = world.step(STEP, controls, gust);
    audio.update(throttle, world.state.plane.speed);
    if (events & EVENT_RING) {
      audio.ring();
      announce(world.state.message);
    }
    if (events & EVENT_FUEL_EMPTY) audio.warning();
    if (!fuelWarned && world.state.fuel < 25 && world.state.fuel > 0) {
      fuelWarned = true;
      audio.warning();
      announce('Fuel low.');
    }
    if (events & (EVENT_LAND | EVENT_CRASH)) endGame();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, world.state.time);
  }

  // Leaving the tab pauses a running game rather than letting the valley fly by unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Ridgeline Run. Press Enter or click to fly. Pick a mission with 1, 2 or 3.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
