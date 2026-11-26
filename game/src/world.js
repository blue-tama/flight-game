// The mission and the sortie: fuel, damage, rings, landings, crashes and
// score. No drawing and no browser in here — step() advances one fixed step
// and returns what happened as bit flags, so the caller can react.

import { FUEL, HULL, LANDING, MISSIONS, PLANE, RING, STEP, TIME_BONUS_PER_SECOND } from './config.js';
import { createPlane, stepPlane } from './plane.js';
import { createTerrain } from './terrain.js';

export const EVENT_RING = 1;
export const EVENT_LAND = 2;
export const EVENT_CRASH = 4;
export const EVENT_FUEL_EMPTY = 8;
export const EVENT_SCORE = 16;

export const STATUS_FLYING = 'flying';
export const STATUS_LANDED = 'landed';
export const STATUS_CRASHED = 'crashed';

/** Distance between two points in the ring's plane (x, y, z). */
function distance3(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function createWorld(seed) {
  const terrain = createTerrain(seed);
  const plane = createPlane();
  const state = {
    plane,
    terrain,
    mission: MISSIONS[0],
    rings: [],
    ringsPassed: 0,
    fuel: FUEL.start,
    hull: HULL.start,
    score: 0,
    time: 0,
    status: STATUS_FLYING,
    crashReason: '',
    landedBonus: 0,
    stalled: false,
    ringFlash: 0,
    message: '',
    messageTimer: 0,
  };

  /** Start (or restart) a mission: plane on the home strip, full tanks. */
  function reset(missionId) {
    state.mission = MISSIONS[missionId] || MISSIONS[0];
    state.rings = terrain.buildRings(state.mission.rings);
    state.ringsPassed = 0;
    state.fuel = state.mission.fuel;
    state.hull = HULL.start;
    state.score = 0;
    state.time = 0;
    state.status = STATUS_FLYING;
    state.crashReason = '';
    state.landedBonus = 0;
    state.ringFlash = 0;
    state.message = '';
    state.messageTimer = 0;
    plane.x = 0;
    plane.y = terrain.heightAt(0, 60) + PLANE.gearHeight;
    plane.z = 60;
    plane.heading = 0;
    plane.pitch = 0;
    plane.bank = 0;
    plane.speed = 0;
    plane.throttle = 0;
    plane.vspeed = 0;
    plane.onGround = true;
  }

  /** The next ring still to fly through, or null when the course is done. */
  function nextRing() {
    for (let i = 0; i < state.rings.length; i += 1) {
      if (!state.rings[i].passed) return state.rings[i];
    }
    return null;
  }

  function crash(reason) {
    state.status = STATUS_CRASHED;
    state.crashReason = reason;
    plane.speed = 0;
  }

  function land() {
    const fuelBonus = Math.round(state.fuel * LANDING.fuelBonusPerUnit);
    const hullBonus = Math.round(state.hull * LANDING.hullBonusPerUnit);
    const timeBonus = state.mission.timeLimit > 0 ? Math.max(0, Math.round((state.mission.timeLimit - state.time) * TIME_BONUS_PER_SECOND)) : 0;
    state.landedBonus = LANDING.points + fuelBonus + hullBonus + timeBonus;
    state.score += state.landedBonus;
    state.status = STATUS_LANDED;
    plane.speed = 0;
    plane.onGround = true;
  }

  /**
   * One fixed step. `controls` is the pilot's pitch/bank/throttle/brake, `gust`
   * a turbulence push for this step. Returns EVENT_* flags for what happened.
   */
  function step(dt, controls, gust) {
    let events = 0;
    if (state.status !== STATUS_FLYING) return events;
    state.time += dt;
    if (state.messageTimer > 0) state.messageTimer -= dt;
    if (state.ringFlash > 0) state.ringFlash -= dt;

    // Fuel: the engine drinks with the throttle; empty tanks mean a glide.
    if (state.fuel > 0) {
      state.fuel -= (FUEL.burnBase + FUEL.burnPerThrottle * plane.throttle) * dt;
      if (state.fuel <= 0) {
        state.fuel = 0;
        events |= EVENT_FUEL_EMPTY;
        state.message = 'Fuel empty — glide her in!';
        state.messageTimer = 4;
      }
    }
    if (state.fuel === 0) controls = { ...controls, throttle: 0 };

    const wasOnGround = plane.onGround;
    state.stalled = stepPlane(plane, controls, gust, dt);
    const ground = terrain.heightAt(plane.x, plane.z);

    // Rings: fly through the centre and it counts, with fuel and points.
    // The catch is generous — the ring's glow is wider than its rim.
    const ring = nextRing();
    if (ring && distance3(plane, ring) < ring.r + 8) {
      ring.passed = true;
      state.ringsPassed += 1;
      state.score += RING.points;
      state.fuel = Math.min(100, state.fuel + FUEL.ringBonus);
      state.ringFlash = 1.2;
      state.message = `Ring ${state.ringsPassed} of ${state.rings.length} — +${RING.points}`;
      state.messageTimer = 2;
      events |= EVENT_RING | EVENT_SCORE;
    }

    // The ground: a gentle touchdown on pavement lands; anything else hurts.
    // While the plane is still rolling for takeoff the runway simply holds
    // her — a slow roll is not a landing and never a crash.
    if (plane.y <= ground + PLANE.gearHeight) {
      plane.y = ground + PLANE.gearHeight;
      const strip = terrain.onStrip(plane.x, plane.z);
      const sink = -plane.vspeed;
      const gentle = sink <= LANDING.maxSink && Math.abs(plane.bank) <= LANDING.maxBank;
      const inSpeed = plane.speed >= LANDING.speedMin && plane.speed <= LANDING.speedMax;
      if (wasOnGround) {
        // Still on the roll: hold her down until the wing lifts her off.
        if (plane.speed < PLANE.stallSpeed) plane.pitch = 0;
        plane.onGround = true;
      } else if (strip && gentle && inSpeed && state.ringsPassed === state.rings.length) {
        land();
        events |= EVENT_LAND | EVENT_SCORE;
        return events;
      } else if (strip && gentle && inSpeed) {
        // Landed early on a strip, rings still to fly: a bounce, not a landing.
        state.hull -= 8;
        state.message = 'Down early — take off again and finish the rings!';
        state.messageTimer = 3;
        plane.speed *= 0.4;
        plane.onGround = true;
        plane.pitch = 0;
        if (state.hull <= 0) {
          state.hull = 0;
          crash('The airframe gave out on that hard touchdown.');
          events |= EVENT_CRASH;
        }
      } else if (terrain.onWater(plane.x, plane.z)) {
        crash('Ditched in the river.');
        events |= EVENT_CRASH;
        return events;
      } else if (sink > LANDING.maxSink + 6 || (state.stalled && !wasOnGround)) {
        crash(sink > LANDING.maxSink + 6 ? 'Flew into the mountainside.' : 'Stalled into the ground.');
        events |= EVENT_CRASH;
        return events;
      } else {
        // A scrape: the ridge takes a bite out of the hull.
        state.hull -= HULL.scrape;
        state.message = 'Terrain strike! Hull damaged.';
        state.messageTimer = 2.5;
        plane.y = ground + PLANE.gearHeight + 18;
        plane.speed *= 0.7;
        if (state.hull <= 0) {
          state.hull = 0;
          crash('The airframe broke up after the strike.');
          events |= EVENT_CRASH;
          return events;
        }
      }
    } else {
      plane.onGround = false;
    }

    // A timed mission ends when the clock does.
    if (state.mission.timeLimit > 0 && state.time > state.mission.timeLimit && state.status === STATUS_FLYING) {
      crash('Out of time — the sprint clock ran out.');
      events |= EVENT_CRASH;
    }
    return events;
  }

  reset(0);
  return { state, reset, step, nextRing };
}
