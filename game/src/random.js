// A small seeded random source (mulberry32) plus the value-noise the terrain
// and the ring course are built from. Same seed, same valley, every run.

/** A seeded generator returning numbers in [0, 1). */
export function createRandom(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smoothstep interpolation between 0 and 1. */
export function smooth(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** A centred random offset in [-amount, amount]. */
export function jitter(random, amount) {
  return (random() * 2 - 1) * amount;
}

/** One-dimensional value noise: a fixed table of random heights, smoothly joined. */
export function makeNoise1D(random, size) {
  const table = new Float64Array(size + 1);
  for (let i = 0; i <= size; i += 1) table[i] = random();
  return function noise1(x) {
    const scaled = x * size;
    const i = Math.floor(scaled);
    const f = scaled - i;
    const a = table[i % size];
    const b = table[(i + 1) % size];
    return a + (b - a) * smooth(f);
  };
}

/** Two-dimensional value noise over a square grid of random heights. */
export function makeNoise2D(random, size) {
  const table = new Float64Array((size + 1) * (size + 1));
  for (let i = 0; i < table.length; i += 1) table[i] = random();
  function at(ix, iz) {
    return table[(iz % size) * (size + 1) + (ix % size)];
  }
  return function noise2(x, z) {
    const sx = x * size;
    const sz = z * size;
    const ix = Math.floor(sx);
    const iz = Math.floor(sz);
    const fx = smooth(sx - ix);
    const fz = smooth(sz - iz);
    const a = at(ix, iz);
    const b = at(ix + 1, iz);
    const c = at(ix, iz + 1);
    const d = at(ix + 1, iz + 1);
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  };
}
