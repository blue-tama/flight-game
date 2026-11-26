// The valley itself: a height function over (x, z), the two runway strips
// flattened into it, the river down the middle, and the ring course that
// threads the valley. Pure functions of the seed — no state, no drawing.

import { RING, VALLEY } from './config.js';
import { createRandom, jitter, makeNoise1D, makeNoise2D, smooth } from './random.js';

/** How far the valley floor reaches either side of the centre line before the ridges rise. */
const VALLEY_HALF = 150;
/** Where the mountains top out. */
const RIDGE_HALF = 520;

/**
 * Build the terrain for a seed: a height function, the ring course and the
 * cloud positions. The valley floor is carved along the centre line so the
 * course is flyable, and the ridges rise on both sides.
 */
export function createTerrain(seed) {
  const random = createRandom(seed);
  const hills = makeNoise2D(random, 24);
  const ridge = makeNoise1D(random, 16);
  const wobble = makeNoise1D(random, 12);

  /** The valley centre line wanders gently as z grows. */
  function centreX(z) {
    return (wobble(z / 6000) - 0.5) * 220;
  }

  /** Ground height in metres at world (x, z). */
  function heightAt(x, z) {
    const cx = centreX(z);
    const off = Math.abs(x - cx);
    // Rolling hills everywhere, stronger further from the centre line.
    const hill = (hills(x / 1400 + 3, z / 1400 + 7) - 0.5) * 190;
    const ridgeH = (ridge(z / 2600 + 2) - 0.5) * 260;
    const side = smooth((off - VALLEY_HALF) / (RIDGE_HALF - VALLEY_HALF));
    let h = VALLEY.floorHeight + hill * (0.25 + side) + ridgeH * side * side + side * side * 320;
    // The riverbed dips just below the floor near the river line.
    const riverDip = Math.exp(-((x - (cx + VALLEY.riverX)) ** 2) / (2 * 26 * 26));
    h -= riverDip * 7;
    // Both runway strips are flat pads at floor height.
    h = flattenStrip(h, x, z, VALLEY.homeStrip);
    h = flattenStrip(h, x, z, VALLEY.farStrip);
    return h;
  }

  /** Blend the ground to the floor height over a runway strip and its apron. */
  function flattenStrip(h, x, z, strip) {
    const dz = Math.max(strip.z0 - z, 0, z - strip.z1);
    const dx = Math.abs(x - strip.x) - strip.halfWidth;
    const d = Math.max(dx, dz);
    if (d >= 60) return h;
    const t = smooth(d / 60);
    return VALLEY.floorHeight + (h - VALLEY.floorHeight) * t;
  }

  /** True when (x, z) is on a runway strip's pavement. */
  function onStrip(x, z) {
    for (const strip of [VALLEY.homeStrip, VALLEY.farStrip]) {
      if (x >= strip.x - strip.halfWidth && x <= strip.x + strip.halfWidth && z >= strip.z0 && z <= strip.z1) return strip;
    }
    return null;
  }

  /** True when (x, z) is over the river (water below the floor). */
  function onWater(x, z) {
    const cx = centreX(z);
    return Math.abs(x - (cx + VALLEY.riverX)) < 22 && heightAt(x, z) < VALLEY.floorHeight - 2;
  }

  /** The ring course: rings wander with the valley, climbing and dipping. */
  function buildRings(count) {
    const rings = [];
    const gap = (VALLEY.courseEnd - 500) / count;
    for (let i = 0; i < count; i += 1) {
      const z = 500 + gap * (i + 0.5);
      const cx = centreX(z);
      const side = (i % 2 === 0 ? 1 : -1) * (30 + 55 * ((i * 37) % 10) / 10);
      // High enough to clear the valley floor's bumps with room to spare.
      const y = 190 + 55 * Math.sin(i * 1.7 + 0.6) + 25 * Math.sin(i * 0.9);
      rings.push({ x: cx + side, y, z, r: RING.radius, passed: false });
    }
    return rings;
  }

  /** Cloud puffs: fixed world positions, drawn as billboards. */
  const clouds = [];
  for (let i = 0; i < 16; i += 1) {
    clouds.push({
      x: jitter(random, 700),
      y: 480 + random() * 260,
      z: random() * 6000,
      size: 60 + random() * 130,
    });
  }

  return { heightAt, onStrip, onWater, centreX, buildRings, clouds };
}
