// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical
// area; the renderer scales it to the window, so no rule below depends on the screen size.
// World units are metres: the valley runs from the home strip at z = 0 to the far strip
// at z = 5600, with ridgelines on both sides and a river down the middle.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Flight model: speeds in m/s, angles in radians, fuel in percent. */
export const PLANE = {
  maxSpeed: 92,
  cruiseSpeed: 62,
  stallSpeed: 27,
  accel: 14,
  drag: 0.12,
  maxPitch: 0.32,
  maxBank: 0.85,
  pitchRate: 1.6,
  bankRate: 2.4,
  turnFactor: 9.81,
  climbSink: 3.5,
  brakeDrag: 1.6,
  gearHeight: 2.2,
};

/** Fuel and damage. */
export const FUEL = {
  start: 100,
  burnBase: 0.16,
  burnPerThrottle: 0.42,
  ringBonus: 7,
};

export const HULL = {
  start: 100,
  scrape: 20,
  hardLanding: 22,
  stallCrash: 100,
};

export const RING = { radius: 19, points: 250, count: 8 };

export const LANDING = {
  points: 500,
  fuelBonusPerUnit: 4,
  hullBonusPerUnit: 2,
  maxSink: 7,
  maxBank: 0.18,
  speedMin: 30,
  speedMax: 62,
};

/** Points per second left on the clock in a timed mission. */
export const TIME_BONUS_PER_SECOND = 5;

/** The three missions: same valley, different jobs. */
export const MISSIONS = [
  {
    id: 0,
    name: 'Ring Run',
    blurb: 'Thread all 8 rings, then land on the far strip.',
    rings: 8,
    fuel: 100,
    turbulence: 0,
    timeLimit: 0,
  },
  {
    id: 1,
    name: 'Canyon Sprint',
    blurb: 'Ten rings against the clock — 180 seconds, tight fuel.',
    rings: 10,
    fuel: 85,
    turbulence: 0.1,
    timeLimit: 180,
  },
  {
    id: 2,
    name: 'Storm Pass',
    blurb: 'Eight rings in gusting wind. Hold your line.',
    rings: 8,
    fuel: 100,
    turbulence: 0.55,
    timeLimit: 0,
  },
];

/** The valley's shape: runway strips, river and ring course. */
export const VALLEY = {
  homeStrip: { x: 0, z0: -60, z1: 260, halfWidth: 18 },
  farStrip: { x: 0, z0: 5800, z1: 6500, halfWidth: 18 },
  floorHeight: 42,
  riverX: -46,
  courseEnd: 5300,
};

export const PALETTE = {
  backdrop: '#0b1626',
  skyTop: '#274b7a',
  skyMid: '#7fa8c9',
  skyLow: '#cfe3ee',
  sun: '#fff3c4',
  cloud: '#ffffff',
  water: '#3f7fae',
  grassLow: '#5d8a4a',
  grassHigh: '#7fae5c',
  rock: '#8a7a68',
  rockDark: '#6b5d4f',
  snow: '#eef2f5',
  sand: '#c9b183',
  runway: '#3a3f46',
  runwayMark: '#f2f2e8',
  ringNext: '#ffb02e',
  ringLater: '#39c6d6',
  ringDone: '#7ddb6a',
  planeBody: '#e8542f',
  planeWing: '#f4f1e8',
  planeTrim: '#1e3a5f',
  panel: '#101c2e',
  panelEdge: '#2c4a6b',
  text: '#eef4f8',
  muted: '#9fb4c4',
  amber: '#ffb02e',
  green: '#7ddb6a',
  red: '#ff5a4e',
  cyan: '#39c6d6',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'ridgeline-run.best';
