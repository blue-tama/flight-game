// Drawing only: the world's state and the current screen in, pixels out.
// A chase camera sits behind the plane and looks ahead down the valley; the
// terrain is a heightfield drawn far-to-near as shaded quads with distance
// fog, the rings and strips are projected into the same space, and the plane
// is drawn in screen space, banked with the pilot's bank. The HUD carries
// airspeed, altitude, heading, vertical speed, throttle, fuel, hull, score
// and the next ring, plus an attitude indicator that flies like the real one.

import { FIELD, FONT, PALETTE, VALLEY } from './config.js';
import { forwardVector, knots } from './plane.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const PANEL = { width: 760, top: 150, line: 32, bottom: 76 };
const FOV = 1.15;
const CAM_DIST = 17;
const CAM_HEIGHT = 5.5;
const TERRAIN_ROWS = 26;
const TERRAIN_COLS = 16;

/** Degrees, rounded, with a leading sign where it helps. */
function deg(radians) {
  return (radians * 180) / Math.PI;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Mix two RGB colours by t (0 = a, 1 = b). */
function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function css(rgb, alpha) {
  return alpha === undefined
    ? `rgb(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0})`
    : `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},${alpha})`;
}

/** Parse a #rrggbb palette colour into [r, g, b]. */
function parseHex(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

const SKY_TOP = parseHex(PALETTE.skyTop);
const SKY_MID = parseHex(PALETTE.skyMid);
const SKY_LOW = parseHex(PALETTE.skyLow);
const WATER = parseHex(PALETTE.water);
const GRASS_LOW = parseHex(PALETTE.grassLow);
const GRASS_HIGH = parseHex(PALETTE.grassHigh);
const ROCK = parseHex(PALETTE.rock);
const ROCK_DARK = parseHex(PALETTE.rockDark);
const SNOW = parseHex(PALETTE.snow);
const SAND = parseHex(PALETTE.sand);

/** Terrain colour from height and slope, fogged toward the sky with distance. */
function terrainColour(h, slope, fog) {
  let base;
  if (h < 38) base = WATER;
  else if (h < 48) base = SAND;
  else if (h < 120) base = mix(GRASS_LOW, GRASS_HIGH, (h - 48) / 72);
  else if (h < 200) base = mix(GRASS_HIGH, ROCK, (h - 120) / 80);
  else if (h < 320) base = mix(ROCK, ROCK_DARK, (h - 200) / 120);
  else base = mix(ROCK_DARK, SNOW, clamp((h - 320) / 90, 0, 1));
  const shaded = base.map((c) => c * (1 - clamp(slope, 0, 0.5)));
  return mix(shaded, SKY_LOW, clamp(fog, 0, 0.75));
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, ratio: 1 };
  const focal = (FIELD.height / 2) / Math.tan(FOV / 2);

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.ratio = ratio;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `bold ${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  function textPlain(value, x, y, size, color, align, baseline) {
    if (!fonts.has(-size)) fonts.set(-size, `${size}px ${FONT}`);
    context.font = fonts.get(-size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  /** Camera basis from the plane: behind it, above it, rolled with its bank. */
  function cameraBasis(plane) {
    const fwd = forwardVector(plane);
    const camPitch = plane.pitch * 0.45;
    const camRoll = plane.bank * 0.55;
    const ch = Math.cos(plane.heading);
    const sh = Math.sin(plane.heading);
    const cp = Math.cos(camPitch);
    const sp = Math.sin(camPitch);
    const forward = { x: sh * cp, y: sp, z: ch * cp };
    const right = { x: ch * Math.cos(camRoll), y: Math.sin(camRoll), z: -sh * Math.cos(camRoll) };
    const up = {
      x: -sh * sp * Math.cos(camRoll) - ch * Math.sin(camRoll),
      y: cp * Math.cos(camRoll),
      z: -ch * sp * Math.cos(camRoll) + sh * Math.sin(camRoll),
    };
    const origin = {
      x: plane.x - fwd.x * CAM_DIST,
      y: plane.y - fwd.y * CAM_DIST + CAM_HEIGHT,
      z: plane.z - fwd.z * CAM_DIST,
    };
    return { forward, right, up, origin };
  }

  /** Project a world point to field coordinates; null when behind the camera. */
  function project(p, cam) {
    const dx = p.x - cam.origin.x;
    const dy = p.y - cam.origin.y;
    const dz = p.z - cam.origin.z;
    const cx = dx * cam.right.x + dy * cam.right.y + dz * cam.right.z;
    const cy = dx * cam.up.x + dy * cam.up.y + dz * cam.up.z;
    const cz = dx * cam.forward.x + dy * cam.forward.y + dz * cam.forward.z;
    if (cz < 2) return null;
    return {
      x: FIELD.width / 2 + (cx * focal) / cz,
      y: FIELD.height / 2 - (cy * focal) / cz,
      d: cz,
    };
  }

  function drawSky() {
    const grad = context.createLinearGradient(0, 0, 0, FIELD.height);
    grad.addColorStop(0, PALETTE.skyTop);
    grad.addColorStop(0.45, PALETTE.skyMid);
    grad.addColorStop(0.62, PALETTE.skyLow);
    grad.addColorStop(1, PALETTE.skyLow);
    context.fillStyle = grad;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    // Sun: fixed in the sky ahead and to the right.
    const sunDir = { x: 0.45, y: 0.5, z: 0.76 };
    const sx = FIELD.width / 2 + (sunDir.x * focal) / 1.4;
    const sy = FIELD.height * 0.42 - (sunDir.y * focal) / 1.4;
    context.fillStyle = PALETTE.sun;
    context.beginPath();
    context.arc(sx, sy, 26, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = 'rgba(255,243,196,0.25)';
    context.beginPath();
    context.arc(sx, sy, 44, 0, Math.PI * 2);
    context.fill();
  }

  function drawTerrain(state, cam) {
    const terrain = state.terrain;
    const plane = state.plane;
    // Rows ahead, spaced wider with distance; columns spread wider too.
    const rows = [];
    for (let r = 0; r <= TERRAIN_ROWS; r += 1) {
      // Rows start a little behind the plane so the near ground fills the
      // bottom of the frame; rows behind the camera are skipped by project().
      const z = plane.z - 30 + r * r * 1.15;
      rows.push(z);
    }
    for (let r = TERRAIN_ROWS; r >= 0; r -= 1) {
      const z = rows[r];
      const half = 70 + r * 26;
      const step = (half * 2) / TERRAIN_COLS;
      for (let c = 0; c < TERRAIN_COLS; c += 1) {
        const x0 = plane.x - half + c * step;
        const x1 = x0 + step;
        const z0 = z;
        const z1 = r + 1 <= TERRAIN_ROWS ? rows[r + 1] : z + 40;
        const h00 = terrain.heightAt(x0, z0);
        const h10 = terrain.heightAt(x1, z0);
        const h01 = terrain.heightAt(x0, z1);
        const h11 = terrain.heightAt(x1, z1);
        const p00 = project({ x: x0, y: h00, z: z0 }, cam);
        const p10 = project({ x: x1, y: h10, z: z0 }, cam);
        const p11 = project({ x: x1, y: h11, z: z1 }, cam);
        const p01 = project({ x: x0, y: h01, z: z1 }, cam);
        if (!p00 || !p10 || !p11 || !p01) continue;
        const mid = (h00 + h10 + h01 + h11) / 4;
        const slope = Math.abs(h10 - h00) / step + Math.abs(h01 - h00) / Math.max(1, z1 - z0);
        const fog = clamp((z - plane.z) / 1400, 0, 1);
        context.fillStyle = css(terrainColour(mid, slope, fog));
        context.beginPath();
        context.moveTo(p00.x, p00.y);
        context.lineTo(p10.x, p10.y);
        context.lineTo(p11.x, p11.y);
        context.lineTo(p01.x, p01.y);
        context.closePath();
        context.fill();
      }
    }
  }

  function drawClouds(state, cam) {
    for (const cloud of state.terrain.clouds) {
      const p = project(cloud, cam);
      if (!p || p.d > 1600) continue;
      const size = (cloud.size * focal) / p.d;
      context.fillStyle = `rgba(255,255,255,${clamp(0.85 - p.d / 2200, 0.1, 0.85)})`;
      context.beginPath();
      context.ellipse(p.x, p.y, size, size * 0.36, 0, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.ellipse(p.x - size * 0.45, p.y + size * 0.1, size * 0.6, size * 0.28, 0, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawStrip(state, cam, strip) {
    const y = 44;
    // Clip the strip to what is ahead of the camera: when the plane is on
    // the strip, its near end is behind the camera and must not hide it.
    const zNear = Math.max(strip.z0, cam.origin.z + 5);
    if (zNear >= strip.z1) return;
    const corners = [
      { x: strip.x - strip.halfWidth, y, z: zNear },
      { x: strip.x + strip.halfWidth, y, z: zNear },
      { x: strip.x + strip.halfWidth, y, z: strip.z1 },
      { x: strip.x - strip.halfWidth, y, z: strip.z1 },
    ];
    const pts = corners.map((c) => project(c, cam));
    if (pts.some((p) => p === null)) return;
    context.fillStyle = PALETTE.runway;
    context.beginPath();
    context.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 4; i += 1) context.lineTo(pts[i].x, pts[i].y);
    context.closePath();
    context.fill();
    // Centre dashes down the strip.
    context.fillStyle = PALETTE.runwayMark;
    for (let z = zNear + 20; z < strip.z1 - 10; z += 40) {
      const a = project({ x: strip.x - 1.5, y: y + 0.3, z }, cam);
      const b = project({ x: strip.x + 1.5, y: y + 0.3, z }, cam);
      const c = project({ x: strip.x + 1.5, y: y + 0.3, z: z + 18 }, cam);
      const d = project({ x: strip.x - 1.5, y: y + 0.3, z: z + 18 }, cam);
      if (!a || !b || !c || !d) continue;
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.lineTo(c.x, c.y);
      context.lineTo(d.x, d.y);
      context.closePath();
      context.fill();
    }
  }

  function drawRing(state, cam, ring, isNext) {
    const centre = project(ring, cam);
    if (!centre) return;
    const rightPt = project({ x: ring.x + ring.r, y: ring.y, z: ring.z }, cam);
    const upPt = project({ x: ring.x, y: ring.y + ring.r, z: ring.z }, cam);
    if (!rightPt || !upPt) return;
    const rx = Math.abs(rightPt.x - centre.x);
    const ry = Math.abs(upPt.y - centre.y);
    if (rx < 2 || ry < 2) return;
    const colour = ring.passed ? PALETTE.ringDone : isNext ? PALETTE.ringNext : PALETTE.ringLater;
    context.lineWidth = isNext ? 7 : 4;
    context.strokeStyle = colour;
    context.globalAlpha = ring.passed ? 0.35 : 0.95;
    context.beginPath();
    context.ellipse(centre.x, centre.y, rx, ry, 0, 0, Math.PI * 2);
    context.stroke();
    context.globalAlpha = 1;
    context.lineWidth = 1;
    if (isNext) {
      text(`RING ${state.ringsPassed + 1}`, centre.x, centre.y - ry - 12, 20, PALETTE.ringNext, 'center');
    }
  }

  /** The plane itself, drawn in screen space and banked with the pilot's bank. */
  function drawPlane(state) {
    const plane = state.plane;
    const cx = FIELD.width / 2;
    const cy = FIELD.height * 0.66 + plane.pitch * 60;
    const bank = plane.bank;
    context.save();
    context.translate(cx, cy);
    context.rotate(bank);
    const scale = 1 + plane.speed / 400;
    context.scale(scale, scale);
    // Shadow under the plane on the ground far below is skipped: the chase view keeps it simple.
    // Wings.
    context.fillStyle = PALETTE.planeWing;
    context.beginPath();
    context.moveTo(-118, 6);
    context.lineTo(-14, -6);
    context.lineTo(14, -6);
    context.lineTo(118, 6);
    context.lineTo(104, 16);
    context.lineTo(-104, 16);
    context.closePath();
    context.fill();
    // Tailplane.
    context.fillStyle = PALETTE.planeWing;
    context.beginPath();
    context.moveTo(-46, -58);
    context.lineTo(-10, -66);
    context.lineTo(10, -66);
    context.lineTo(46, -58);
    context.lineTo(38, -48);
    context.lineTo(-38, -48);
    context.closePath();
    context.fill();
    // Fuselage.
    context.fillStyle = PALETTE.planeBody;
    context.beginPath();
    context.moveTo(0, -78);
    context.quadraticCurveTo(13, -40, 11, 8);
    context.lineTo(7, 52);
    context.quadraticCurveTo(0, 60, -7, 52);
    context.lineTo(-11, 8);
    context.quadraticCurveTo(-13, -40, 0, -78);
    context.closePath();
    context.fill();
    // Fin.
    context.fillStyle = PALETTE.planeTrim;
    context.beginPath();
    context.moveTo(0, -78);
    context.lineTo(4, -52);
    context.lineTo(-4, -52);
    context.closePath();
    context.fill();
    // Canopy.
    context.fillStyle = '#bfe3f2';
    context.beginPath();
    context.ellipse(0, -34, 7, 14, 0, 0, Math.PI * 2);
    context.fill();
    // Propeller disc at the nose.
    context.fillStyle = 'rgba(200,210,220,0.35)';
    context.beginPath();
    context.ellipse(0, -80, 4, 16, 0, 0, Math.PI * 2);
    context.fill();
    // Navigation lights.
    context.fillStyle = '#ff4d4d';
    context.beginPath();
    context.arc(-116, 10, 4, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#4dff88';
    context.beginPath();
    context.arc(116, 10, 4, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawHud(state) {
    const plane = state.plane;
    const speedKnots = knots(plane.speed);
    const altitude = Math.round((plane.y - 42) * 3.281);
    const heading = Math.round(((deg(plane.heading) % 360) + 360) % 360);
    const vspeed = Math.round(plane.vspeed * 196.85);
    const next = state.rings[state.ringsPassed];

    // Top bar: airspeed, altitude, heading, vertical speed.
    context.fillStyle = 'rgba(10,22,38,0.55)';
    context.fillRect(0, 0, FIELD.width, 64);
    text(`${speedKnots}`, 24, 40, 34, PALETTE.text, 'left');
    textPlain('KT', 24 + context.measureText(`${speedKnots}`).width + 8, 40, 16, PALETTE.muted, 'left');
    text(`${altitude}`, 300, 40, 34, PALETTE.text, 'left');
    textPlain('FT', 300 + context.measureText(`${altitude}`).width + 8, 40, 16, PALETTE.muted, 'left');
    text(`${String(heading).padStart(3, '0')}°`, 560, 40, 34, PALETTE.text, 'left');
    textPlain('HDG', 560 + context.measureText(`${String(heading).padStart(3, '0')}°`).width + 8, 40, 16, PALETTE.muted, 'left');
    const vsColour = vspeed >= 0 ? PALETTE.green : PALETTE.amber;
    text(`${vspeed >= 0 ? '+' : ''}${vspeed}`, 820, 40, 34, vsColour, 'left');
    textPlain('FT/MIN', 820 + context.measureText(`${vspeed >= 0 ? '+' : ''}${vspeed}`).width + 8, 40, 16, PALETTE.muted, 'left');

    // Score and rings, top right.
    text(`SCORE ${state.score}`, FIELD.width - 24, 40, 26, PALETTE.text, 'right');
    textPlain(`RINGS ${state.ringsPassed}/${state.rings.length}`, FIELD.width - 24, 62, 16, PALETTE.muted, 'right');

    // Throttle bar, left edge.
    context.fillStyle = 'rgba(10,22,38,0.55)';
    context.fillRect(20, 300, 18, 180);
    context.fillStyle = PALETTE.cyan;
    context.fillRect(20, 300 + 180 * (1 - plane.throttle), 18, 180 * plane.throttle);
    textPlain('THR', 20, 292, 14, PALETTE.muted, 'left');

    // Fuel and hull gauges, right edge.
    gauge(1242, 300, state.fuel, 'FUEL', state.fuel < 25 ? PALETTE.red : PALETTE.amber);
    gauge(1242, 380, state.hull, 'HULL', state.hull < 35 ? PALETTE.red : PALETTE.green);

    // Next-ring distance and direction, centre top.
    if (next) {
      const dx = next.x - plane.x;
      const dy = next.y - plane.y;
      const dz = next.z - plane.z;
      const dist = Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz));
      const targetHeading = Math.atan2(dx, dz);
      let rel = deg(targetHeading - plane.heading);
      while (rel > 180) rel -= 360;
      while (rel < -180) rel += 360;
      const arrow = rel > 12 ? '▶' : rel < -12 ? '◀' : '▲';
      text(`${arrow} NEXT RING ${dist}m`, FIELD.width / 2, 96, 22, PALETTE.ringNext, 'center');
    } else {
      text('ALL RINGS DONE — LAND ON THE FAR STRIP', FIELD.width / 2, 96, 22, PALETTE.green, 'center');
    }

    // Flash message, centre.
    if (state.messageTimer > 0) {
      text(state.message, FIELD.width / 2, 150, 26, PALETTE.text, 'center');
    }
    if (state.ringFlash > 0) {
      context.fillStyle = `rgba(255,176,46,${state.ringFlash * 0.25})`;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
    }
    drawAttitude(plane);
  }

  function gauge(x, y, value, label, colour) {
    context.fillStyle = 'rgba(10,22,38,0.55)';
    context.fillRect(x - 4, y, 26, 60);
    context.fillStyle = colour;
    context.fillRect(x, y + 56 * (1 - value / 100), 18, 56 * (value / 100));
    textPlain(label, x + 9, y + 76, 13, PALETTE.muted, 'center');
  }

  /** Attitude indicator: a horizon that rolls and pitches with the plane. */
  function drawAttitude(plane) {
    const cx = 84;
    const cy = FIELD.height - 84;
    const r = 56;
    context.save();
    context.beginPath();
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.clip();
    context.translate(cx, cy);
    context.rotate(-plane.bank);
    context.translate(0, plane.pitch * 120);
    context.fillStyle = '#3f7fc4';
    context.fillRect(-r, -r * 2, r * 2, r * 2);
    context.fillStyle = '#7a5230';
    context.fillRect(-r, 0, r * 2, r * 2);
    context.fillStyle = PALETTE.text;
    context.fillRect(-r, -2, r * 2, 4);
    context.restore();
    context.strokeStyle = PALETTE.text;
    context.lineWidth = 3;
    context.beginPath();
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.stroke();
    context.lineWidth = 1;
    // Fixed wings of the symbol.
    context.strokeStyle = PALETTE.amber;
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(cx - 34, cy);
    context.lineTo(cx - 10, cy);
    context.moveTo(cx + 10, cy);
    context.lineTo(cx + 34, cy);
    context.stroke();
    context.lineWidth = 1;
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(16,28,46,0.92)';
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.lineWidth = 1;
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 78, 46, PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      textPlain(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 21, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 38, 24, PALETTE.amber, 'center');
  }

  /** Paint one frame: sky, terrain, strips, rings, clouds, plane, HUD or a panel. */
  function draw(state, screen, best, time) {
    const plane = state.plane;
    const cam = cameraBasis(plane);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawSky();
    drawTerrain(state, cam);
    drawClouds(state, cam);
    drawStrip(state, cam, VALLEY.homeStrip);
    drawStrip(state, cam, VALLEY.farStrip);
    const nextIndex = state.ringsPassed;
    for (let i = state.rings.length - 1; i >= 0; i -= 1) {
      drawRing(state, cam, state.rings[i], i === nextIndex);
    }
    drawPlane(state);
    if (screen === SCREEN_TITLE) {
      const mission = state.mission;
      const lines = [
        `Mission ${mission.id + 1} — ${mission.name}: ${mission.id === 1 ? '10 rings, 180 seconds.' : mission.id === 2 ? '8 rings in gusting wind.' : '8 rings, then land on the far strip.'}`,
        '1 Ring Run   2 Canyon Sprint   3 Storm Pass',
        'W/S throttle · Arrows pitch and bank · Mouse steers · Space airbrake',
        'Fly the rings, mind the fuel, land on the far strip.',
        best > 0 ? `Best score ${best}` : '',
      ];
      drawPanel('RIDGELINE RUN', lines, 'Press Enter or click to fly');
      return;
    }
    drawHud(state);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The valley will wait for you.'], 'Press P to resume');
    } else if (screen === SCREEN_OVER) {
      if (state.status === 'landed') {
        const lines = [
          `Landed! Rings ${state.ringsPassed}/${state.rings.length} · Fuel ${Math.round(state.fuel)}% · Hull ${Math.round(state.hull)}%`,
          `Landing bonus ${state.landedBonus} · Score ${state.score} · Best ${best}`,
          state.score > best ? 'A new best score!' : '',
        ];
        drawPanel('Mission complete', lines, 'Press Enter or click to fly again');
      } else {
        const lines = [
          state.crashReason || 'The sortie ended.',
          `Rings ${state.ringsPassed}/${state.rings.length} · Score ${state.score} · Best ${best}`,
          '',
        ];
        drawPanel('Down', lines, 'Press Enter or click to try again');
      }
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
