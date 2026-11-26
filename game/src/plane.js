// The flight model: one plane, arcade physics. Throttle sets the speed the
// engine chases, pitch sets the climb, bank turns the heading. Below stall
// speed the wing stops flying and the nose drops; near the ground the
// controls stay alive so a landing is always the pilot's to make.

import { PLANE } from './config.js';

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

/** The plane's state: position, attitude, speed, throttle and vertical speed. */
export function createPlane() {
  return {
    x: 0,
    y: 46,
    z: 60,
    heading: 0,
    pitch: 0,
    bank: 0,
    speed: 0,
    throttle: 0,
    vspeed: 0,
    onGround: true,
  };
}

/**
 * One fixed step. `controls` holds the pilot's targets: pitch and bank in
 * radians, throttle 0..1, brake true to drag the airbrakes out. `gust` is the
 * mission's turbulence, a small random push on bank and pitch each step.
 */
export function stepPlane(plane, controls, gust, dt) {
  const authority = clamp(plane.speed / 45, 0.5, 1);
  const targetPitch = clamp(controls.pitch, -PLANE.maxPitch, PLANE.maxPitch);
  const targetBank = clamp(controls.bank, -PLANE.maxBank, PLANE.maxBank);

  plane.pitch += clamp(targetPitch - plane.pitch, -PLANE.pitchRate * authority * dt, PLANE.pitchRate * authority * dt);
  plane.bank += clamp(targetBank - plane.bank, -PLANE.bankRate * authority * dt, PLANE.bankRate * authority * dt);
  if (gust !== 0) {
    plane.bank += gust * 0.25 * dt;
    plane.pitch += gust * 0.12 * dt;
  }

  plane.throttle = clamp(controls.throttle, 0, 1);
  const targetSpeed = plane.throttle * PLANE.maxSpeed;
  const drag = PLANE.drag + (controls.brake ? PLANE.brakeDrag : 0);
  plane.speed += (targetSpeed - plane.speed) * Math.min(1, (PLANE.accel / PLANE.maxSpeed + drag) * dt * 2);
  if (plane.speed < 0) plane.speed = 0;

  // Turning: bank into the turn, heading follows the bank.
  const turnRate = (PLANE.turnFactor * Math.tan(plane.bank)) / Math.max(plane.speed, 12);
  plane.heading = wrapAngle(plane.heading + turnRate * dt);

  // Climbing: the wing lifts with speed and pitch; slow flight sinks.
  const stalled = plane.speed < PLANE.stallSpeed;
  const lift = stalled ? 0.35 : 1;
  const climb = plane.speed * Math.sin(plane.pitch) * lift - (stalled ? PLANE.climbSink : 0);
  plane.vspeed = climb;
  plane.y += climb * dt;

  // Rolling out of a steep bank scrubs speed, like the real thing.
  if (Math.abs(plane.bank) > 0.5) plane.speed -= Math.abs(plane.bank) * 1.5 * dt;

  plane.x += Math.sin(plane.heading) * plane.speed * Math.cos(plane.pitch) * dt;
  plane.z += Math.cos(plane.heading) * plane.speed * Math.cos(plane.pitch) * dt;
  return stalled;
}

/** The plane's forward direction as a unit vector. */
export function forwardVector(plane) {
  return {
    x: Math.sin(plane.heading) * Math.cos(plane.pitch),
    y: Math.sin(plane.pitch),
    z: Math.cos(plane.heading) * Math.cos(plane.pitch),
  };
}

/** Speed in knots, for the HUD's airspeed readout. */
export function knots(speed) {
  return Math.round(speed * 1.944);
}
