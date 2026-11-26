// The screenshot scenes behind ?shot=start|play|land|end. Each one plays the
// real rules forward from a fresh world, steered by a simple autopilot that
// aims at the next ring, holds a cruise speed and flares for the far strip,
// so every frame is what a real sortie looks like and the same seed always
// gives the same frame.

import { PLANE, STEP } from './config.js';
import { EVENT_CRASH, EVENT_LAND, STATUS_CRASHED, STATUS_LANDED } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

/** Clamp a value into a range. */
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Wrap an angle to (-PI, PI]. */
function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * The autopilot: a flight director that turns the plane toward a target
 * point, holds a target speed with the throttle and keeps the nose on the
 * target's altitude. It flies the same controls a player holds.
 */
export function autopilotControls(world, target, targetSpeed) {
  const plane = world.state.plane;
  const dx = target.x - plane.x;
  const dz = target.z - plane.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const wantedHeading = Math.atan2(dx, dz);
  const headingError = wrapAngle(wantedHeading - plane.heading);
  let bank = clamp(headingError * 2.0, -PLANE.maxBank, PLANE.maxBank);
  // On final, hold the centre line: add a cross-track term so the plane
  // converges on the strip instead of sailing past it sideways.
  if (target.r === undefined) bank = clamp(bank + clamp((0 - plane.x) * 0.008, -0.3, 0.3), -PLANE.maxBank, PLANE.maxBank);
  // A big heading error means a tight turn: slow down so the turn bites.
  const speedTarget = Math.abs(headingError) > 0.45 ? Math.min(targetSpeed, 45) : targetSpeed;
  // Stay above a ring until close, then ease down onto it: a hard dive at
  // a low ring is how sorties end in the mountainside. On final, sink in
  // proportion to the height above the strip, never below a floor, so the
  // plane always arrives at the ground instead of floating past it.
  let wantedPitch;
  if (target.r === undefined) {
    const heightAbove = Math.max(0, plane.y - 44);
    const sinkTarget = clamp(heightAbove * 0.15, 2.5, 6);
    wantedPitch = clamp(Math.asin(clamp(-sinkTarget / Math.max(plane.speed, 20), -1, 1)), -0.2, PLANE.maxPitch);
  } else {
    const approachY = dist > 300 ? target.y + 40 : target.y;
    wantedPitch = clamp(Math.atan2(approachY - plane.y, Math.max(30, dist)) * 1.2, -0.2, PLANE.maxPitch);
  }
  const throttle = clamp(0.45 + (speedTarget - plane.speed) * 0.03, 0, 1);
  return { pitch: wantedPitch, bank, throttle, brake: false };
}

/** The autopilot's target: the next ring, or a glide slope onto the far strip. */
export function autopilotTarget(world) {
  const ring = world.nextRing();
  if (ring) return { x: ring.x, y: ring.y, z: ring.z, r: ring.r, speed: 62 };
  const plane = world.state.plane;
  // Overshot the strip: climb straight ahead first, then come around.
  if (plane.z > 6550 && plane.y < 240) return { x: 0, y: 260, z: plane.z + 400, speed: 42 };
  if (plane.z > 6550) return { x: 0, y: 220, z: 5200, speed: 42 };
  // Final: glide down the slope toward the strip, aiming at a point that
  // stays ahead of the plane down the centre line — never at the fixed
  // threshold point itself, which the steering cannot face once it is past.
  const dist = Math.max(0, 6150 - plane.z);
  return { x: 0, y: 44 + dist * 0.06, z: Math.max(6150, plane.z + 200), speed: 36 };
}

/**
 * Set `world` to the named scene and return the screen to draw over it and
 * the best score to show. start: on the home strip under the title. play:
 * mid-course, a ring ahead. land: on final approach to the far strip. end:
 * the mission flown to its finish, landed or down.
 */
export function stageShot(name, world) {
  world.reset(0);
  const state = world.state;
  if (name !== 'play' && name !== 'land' && name !== 'end') {
    // Title backdrop: taxi out slowly so the strip and the valley are in view.
    for (let i = 0; i < 6 / STEP; i += 1) {
      world.step(STEP, { pitch: 0, bank: 0, throttle: 0.35, brake: false }, 0);
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }
  const maxSeconds = name === 'end' ? 420 : name === 'land' ? 300 : 75;
  let events = 0;
  for (let i = 0; i < maxSeconds / STEP; i += 1) {
    const target = autopilotTarget(world);
    const controls = autopilotControls(world, target, target.speed);
    events = world.step(STEP, controls, 0);
    if (events & (EVENT_LAND | EVENT_CRASH)) break;
    if (name === 'play' && state.ringsPassed >= 3) break;
    if (name === 'land' && world.nextRing() === null && Math.abs(state.plane.z - 5900) < 250) break;
  }
  if (state.status === STATUS_LANDED || state.status === STATUS_CRASHED) {
    return { screen: SCREEN_OVER, best: state.score };
  }
  return { screen: SCREEN_PLAY, best: state.score };
}
