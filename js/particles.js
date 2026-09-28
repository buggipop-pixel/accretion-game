// ═══════════════════════════════════════════════════════════════
//  PARTICLES.JS — спираль Архимеда: v_r = v_t·b/r
// ═══════════════════════════════════════════════════════════════

const PART = {
  particles: [], passing: [],
  coreR: 1.8, corePulse: 0, starPulse: 0, absorbed: 0,
  dragX: 0, dragY: 0, dragActive: false, lastPassingAt: 0,
};

const PART_COUNT = 700;
const TOUCH_RADIUS = 100;
const TOUCH_VELOCITY = 400;
const DUST_PER_PARTICLE = 1;
const DUST_PER_FINGER = 1;

// ─── ФАЗА I: спираль Архимеда ───────────────────────────────────
// Условие спирали: v_r / v_t = b / r  →  v_r = v_t · b / r
// b — шаг спирали в пикселях на радиан.
const CLOUD = {
  spinBase: 14,        // тангенциальная скорость px/s
  spiralB: 6,          // b для формулы v_r = v_t · b / r
  armAngleB: 0.05,     // угол рукава растёт как dist · armAngleB
  armForce: 0.5,       // мягкое выравнивание к рукаву
  maxArmKick: 0.4,     // ограничение коррекции
  armSpread: 0.55,     // разброс от угла рукава
  spawnRMin: 170,
  spawnRMax: 230,
};

// ─── ФАЗА II: узкие кольца ──────────────────────────────────────
const CONDENSE = {
  rings: [22, 50],
  ringWidth: 8,
  ringHold: 2.4,
  ringSpin: 55,
  ringPull: 1.4,
  betweenPull: 1.8,
  coreGrow: 2.0,
};

const PASSING_MIN_MS = 120000;
const PASSING_MAX_MS = 300000;

// ─── Мировые ↔ экранные координаты ──────────────────────────────
function worldToScreen(wx, wy) {
  const z = S.zoom || 1;
  const rot = S.rotation || 0;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const rx = wx * cos - wy * sin;
  const ry = wx * sin + wy * cos;
  return {
    x: (window.CANVAS_CX || 0) + (S.panX || 0) + rx * z,
    y: (window.CANVAS_CY || 0) + (S.panY || 0) + ry * z,
  };
}
function screenToWorld(sx, sy) {
  const z = S.zoom || 1;
  const rot = S.rotation || 0;
  const x = (sx - (window.CANVAS_CX || 0) - (S.panX || 0)) / z;
  const y = (sy - (window.CANVAS_CY || 0) - (S.panY || 0)) / z;
  const cos = Math.cos(-rot), sin = Math.sin(-rot);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}
window.worldToScreen = worldToScreen;
window.screenToWorld = screenToWorld;

// ─── Видимость пыли ─────────────────────────────────────────────
function particleVisibility() {
  if (S.stage === 'cloud')       return 1.0;
  if (S.stage === 'condense')    return 0.95;
  if (S.stage === 'protostar')   return 0.55;
  if (S.stage === 'firstPlanet') return 0.40;
  if (S.stage === 'system') return Math.max(0.18, 0.40 - S.planets.length * 0.03);
  if (S.stage === 'galaxy')      return 0.15;
  return 1.0;
}

// ─── Создание частиц ────────────────────────────────────────────
function makeWorldParticle() {
  const W = window.CANVAS_W || 400, H = window.CANVAS_H || 700;
  const z = S.zoom || 1;
  const halfW = W / (2 * z), halfH = H / (2 * z);
  const arm = Math.random() < 0.5 ? 0 : 1;
  return {
    x: (Math.random() * 2 - 1) * halfW,
    y: (Math.random() * 2 - 1) * halfH,
    r: 0.5 + Math.random() * 1.2,
    hue: Math.random() < 0.72 ? 215 + Math.random() * 50 : 15 + Math.random() * 35,
    bright: 0.4 + Math.random() * 0.5,
    twinkle: Math.random() * Math.PI * 2,
    spinVar: 0.9 + Math.random() * 0.2,
    arm: arm,
    armOffset: (Math.random() - 0.5) * CLOUD.armSpread,
    ring: 0,
    age: 0,
  };
}

// Спавн на спирали Архимеда (для респавна у края)
function makeEdgeParticle() {
  const arm = Math.random() < 0.5 ? 0 : 1;
  const r = CLOUD.spawnRMin + Math.random() * (CLOUD.spawnRMax - CLOUD.spawnRMin);
  const baseAngle = arm * Math.PI + r * CLOUD.armAngleB;
  const angle = baseAngle + (Math.random() - 0.5) * CLOUD.armSpread * 2;
  return {
    x: Math.cos(angle) * r,
    y: Math.sin(angle) * r * 0.5,
    r: 0.5 + Math.random() * 1.2,
    hue: Math.random() < 0.72 ? 215 + Math.random() * 50 : 15 + Math.random() * 35,
    bright: 0.4 + Math.random() * 0.5,
    twinkle: Math.random() * Math.PI * 2,
    spinVar: 0.9 + Math.random() * 0.2,
    arm: arm,
    armOffset: (Math.random() - 0.5) * CLOUD.armSpread,
    ring: 0,
    age: 0,
  };
}

function initParticles() {
  PART.particles = [];
  PART.absorbed = 0;
  for (let i = 0; i < PART_COUNT; i++) PART.particles.push(makeWorldParticle());
  PART.passing = [];
  PART.lastPassingAt = performance.now();
}

function normAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// ─── Обновление ─────────────────────────────────────────────────
function updateParticles(dt, time) {
  const W = window.CANVAS_W || 400, H = window.CANVAS_H || 700;
  const z = S.zoom || 1;
  const halfW = W / (2 * z), halfH = H / (2 * z);
  const hasStar = !!S.starType;
  const stage = S.stage;
  const isCloud = stage === 'cloud';
  const isDisk  = stage === 'condense' || stage === 'protostar';

  const target = Math.round(PART_COUNT * Math.pow(1 / z, 1.2));
  const clampedTarget = Math.max(250, Math.min(1500, target));
  while (PART.particles.length < clampedTarget) PART.particles.push(makeWorldParticle());
  while (PART.particles.length > clampedTarget + 5) PART.particles.pop();

  PART.corePulse *= 0.9;
  PART.starPulse *= 0.92;
  const absorbR = PART.coreR + 3;

  const fingerWorld = (PART.dragActive && !hasStar)
    ? screenToWorld(PART.dragX, PART.dragY) : null;

  for (let i = PART.particles.length - 1; i >= 0; i--) {
    const p = PART.particles[i];
    p.twinkle += dt * 2;

    const dist = Math.sqrt(p.x * p.x + p.y * p.y) || 1;
    const dirX = -p.x / dist, dirY = -p.y / dist;
    const tanX = -p.y / dist, tanY = p.x / dist;
    let vx = 0, vy = 0;

    // ─── ФАЗА I: спираль Архимеда ───
    if (isCloud) {
      const tangential = CLOUD.spinBase * p.spinVar;
      // ★ Условие Архимедовой спирали: v_r = v_t · b / r
      const radial = tangential * CLOUD.spiralB / Math.max(25, dist);

      vx += tanX * tangential;
      vy += tanY * tangential;
      vx += dirX * radial;
      vy += dirY * radial;

      // Мягкое выравнивание к 2 рукавам
      const targetA = p.arm * Math.PI + dist * CLOUD.armAngleB + p.armOffset;
      const curA = Math.atan2(p.y, p.x);
      let aDiff = normAngle(targetA - curA);
      if (aDiff > CLOUD.maxArmKick) aDiff = CLOUD.maxArmKick;
      if (aDiff < -CLOUD.maxArmKick) aDiff = -CLOUD.maxArmKick;
      vx += tanX * aDiff * CLOUD.armForce;
      vy += tanY * aDiff * CLOUD.armForce;
    }

    // ─── ФАЗА II: кольца ───
    else if (isDisk) {
      const ringR = p.ring === 0 ? CONDENSE.rings[0] : CONDENSE.rings[1];
      const rDiff = ringR - dist;
      if (Math.abs(rDiff) < CONDENSE.ringWidth) {
        vx += dirX * rDiff * CONDENSE.ringHold;
        vy += dirY * rDiff * CONDENSE.ringHold;
        vx += tanX * CONDENSE.ringSpin * p.spinVar;
        vy += tanY * CONDENSE.ringSpin * p.spinVar;
        vx += dirX * CONDENSE.ringPull;
        vy += dirY * CONDENSE.ringPull;
      } else {
        vx += dirX * CONDENSE.betweenPull;
        vy += dirY * CONDENSE.betweenPull;
      }
    }

    // ─── ФАЗА III+ ───
    else if (hasStar) {
      vx += dirX * 1.5;
      vy += dirY * 1.5;
    }

    // DRAG
    if (fingerWorld) {
      const tdx = fingerWorld.x - p.x, tdy = fingerWorld.y - p.y;
      const tdist = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
      if (tdist < TOUCH_RADIUS) {
        const s = (1 - tdist / TOUCH_RADIUS) * TOUCH_VELOCITY;
        vx += (tdx / tdist) * s;
        vy += (tdy / tdist) * s;
      }
    }

    // Anti-stuck
    p.age += dt;
    if (dist < 40 && p.age > 5) { vx += dirX * 40; vy += dirY * 40; }
    if (dist > 150) p.age = 0;

    p.x += vx * dt;
    p.y += vy * dt;

    // Поглощение
    const dCenter = Math.sqrt(p.x * p.x + p.y * p.y);
    if (dCenter < absorbR) {
      S.dust += DUST_PER_PARTICLE;
      S.dustTotal += DUST_PER_PARTICLE;
      PART.absorbed++;
      if (hasStar) PART.starPulse = 1; else PART.corePulse = 1;
      PART.particles[i] = makeEdgeParticle();
      continue;
    }

    if (fingerWorld) {
      const dF = Math.sqrt((p.x - fingerWorld.x) ** 2 + (p.y - fingerWorld.y) ** 2);
      if (dF < absorbR) {
        S.dust += DUST_PER_FINGER;
        S.dustTotal += DUST_PER_FINGER;
        PART.particles[i] = makeEdgeParticle();
        continue;
      }
    }

    // Улетел — на край спирали
    if (p.x < -halfW - 80 || p.x > halfW + 80 ||
        p.y < -halfH - 80 || p.y > halfH + 80) {
      PART.particles[i] = makeEdgeParticle();
    }
  }

  if (isDisk) {
    PART.coreR = 1.8 + Math.min(6, Math.log10(PART.absorbed + 1) * CONDENSE.coreGrow);
  } else PART.coreR = 1.8;

  updatePassing(dt, time);
}

// ─── Пролёты ────────────────────────────────────────────────────
function updatePassing(dt, time) {
  const now = performance.now();
  const interval = PASSING_MIN_MS + Math.random() * (PASSING_MAX_MS - PASSING_MIN_MS);
  if (now - PART.lastPassingAt > interval) {
    PART.lastPassingAt = now; spawnPassing();
  }
  const W = window.CANVAS_W || 400, H = window.CANVAS_H || 700;
  const z = S.zoom || 1;
  const halfW = W / (2 * z), halfH = H / (2 * z);

  for (let i = PART.passing.length - 1; i >= 0; i--) {
    const o = PART.passing[i];
    if (o.type === 'comet' && S.starType && !o.dying) {
      const d = Math.sqrt(o.x * o.x + o.y * o.y);
      if (d < 90) {
        o.dying = true; o.dieAt = now;
        if (Array.isArray(S.explosions)) {
          const sp = worldToScreen(o.x, o.y);
          S.explosions.push({
            x: sp.x, y: sp.y, type: 'destroy',
            startAt: now, endAt: now + 800, size: 22,
          });
        }
        if (typeof toast === 'function') toast('☄️ Комета испарилась', 'Жар звезды');
        continue;
      }
    }
    if (o.dying) {
      const age = (now - o.dieAt) / 800;
      if (age > 1) { PART.passing.splice(i, 1); continue; }
      o.alpha = 1 - age;
    }
    o.x += o.vx * dt; o.y += o.vy * dt; o.age += dt;
    o.trail.push({ x: o.x, y: o.y });
    if (o.trail.length > o.tailLen) o.trail.shift();
    if (o.x < -halfW - 150 || o.x > halfW + 150 ||
        o.y < -halfH - 150 || o.y > halfH + 150) {
      PART.passing.splice(i, 1);
    }
  }
}

function spawnPassing() {
  const W = window.CANVAS_W || 400, H = window.CANVAS_H || 700;
  const z = S.zoom || 1;
  const halfW = W / (2 * z), halfH = H / (2 * z);
  const isComet = Math.random() < 0.6;
  const size = 0.3 + Math.random() * 0.7;
  const tailLen = Math.round(8 + size * 14);
  const side = Math.floor(Math.random() * 4);
  let x, y, vx, vy;
  const speed = 50 + Math.random() * 90;
  if (side === 0) { x = (Math.random()*2-1)*halfW; y = -halfH-40; vx = (Math.random()-0.5)*40; vy = speed; }
  else if (side === 1) { x = halfW+40; y = (Math.random()*2-1)*halfH; vx = -speed; vy = (Math.random()-0.5)*40; }
  else if (side === 2) { x = (Math.random()*2-1)*halfW; y = halfH+40; vx = (Math.random()-0.5)*40; vy = -speed; }
  else { x = -halfW-40; y = (Math.random()*2-1)*halfH; vx = speed; vy = (Math.random()-0.5)*40; }
  PART.passing.push({
    x, y, vx, vy,
    type: isComet ? 'comet' : 'ship',
    size, tailLen, alpha: 1, age: 0, trail: [],
  });
}

// ─── Рисование ──────────────────────────────────────────────────
function drawParticles(ctx, time) {
  const z = S.zoom || 1;
  const t = time;
  const visibility = particleVisibility();
  const hasStar = !!S.starType;
  const isDisk = S.stage === 'condense' || S.stage === 'protostar';

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  if (!hasStar) {
    const pulse = 1 + PART.corePulse * 0.5;
    const coreRNow = PART.coreR * pulse * z;
    const cpos = worldToScreen(0, 0);
    const haloR = (isDisk ? 20 : 10) * z;
    const g = ctx.createRadialGradient(cpos.x, cpos.y, 0, cpos.x, cpos.y, haloR);
    if (isDisk) {
      g.addColorStop(0, 'rgba(230, 210, 255, 0.5)');
      g.addColorStop(0.4, 'rgba(180, 150, 240, 0.2)');
      g.addColorStop(1, 'rgba(80, 60, 150, 0)');
    } else {
      g.addColorStop(0, 'rgba(200, 180, 255, 0.22)');
      g.addColorStop(0.6, 'rgba(140, 120, 220, 0.06)');
      g.addColorStop(1, 'rgba(80, 60, 150, 0)');
    }
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cpos.x, cpos.y, haloR, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(240, 235, 255, 0.95)';
    ctx.beginPath(); ctx.arc(cpos.x, cpos.y, coreRNow, 0, Math.PI*2); ctx.fill();
  }

  const sizeFactor = Math.max(0.7, z);
  for (const p of PART.particles) {
    const sp = worldToScreen(p.x, p.y);
    const dist = Math.sqrt(p.x * p.x + p.y * p.y);
    const heat = Math.max(0, 1 - dist / 120);
    const hueShift = -heat * 45;
    const brightBoost = 1 + heat * 1.3;
    const tw = 0.7 + 0.3 * Math.sin(p.twinkle + t * 2);
    ctx.globalAlpha = Math.min(1, p.bright * tw * 0.85 * visibility * brightBoost);
    ctx.fillStyle = 'hsl(' + (p.hue + hueShift) + ', ' +
                    (65 + heat * 25) + '%, ' + (68 + heat * 18) + '%)';
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, p.r * sizeFactor * (1 + heat * 0.3), 0, Math.PI*2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  if (!hasStar && PART.dragActive) {
    ctx.save();
    ctx.globalAlpha = 0.10;
    const grad = ctx.createRadialGradient(
      PART.dragX, PART.dragY, 0, PART.dragX, PART.dragY, TOUCH_RADIUS * z);
    grad.addColorStop(0, 'rgba(185, 168, 255, 0.7)');
    grad.addColorStop(1, 'rgba(185, 168, 255, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(PART.dragX, PART.dragY, TOUCH_RADIUS * z, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  drawPassing(ctx);
}

function drawPassing(ctx) {
  const z = S.zoom || 1;
  for (const o of PART.passing) {
    const alpha = o.alpha != null ? o.alpha : 1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < o.trail.length; i++) {
      const seg = o.trail[i];
      const sp = worldToScreen(seg.x, seg.y);
      const life = i / o.trail.length;
      ctx.globalAlpha = life * 0.7 * alpha;
      const size = (1 + life * 2.5) * o.size * z;
      const grad = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, size * 2);
      if (o.type === 'comet') {
        grad.addColorStop(0, 'rgba(150, 220, 255, 0.9)');
        grad.addColorStop(1, 'rgba(100, 150, 255, 0)');
      } else {
        grad.addColorStop(0, 'rgba(255, 220, 150, 0.9)');
        grad.addColorStop(1, 'rgba(200, 150, 80, 0)');
      }
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, size*2, 0, Math.PI*2); ctx.fill();
    }
    const sp = worldToScreen(o.x, o.y);
    ctx.globalAlpha = 0.95 * alpha;
    ctx.fillStyle = o.type === 'comet' ? '#e8f6ff' : '#ffeec8';
    ctx.beginPath(); ctx.arc(sp.x, sp.y, 1.6*o.size*z, 0, Math.PI*2); ctx.fill();
    const halo = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, 8*o.size*z);
    if (o.type === 'comet') {
      halo.addColorStop(0, 'rgba(150, 220, 255, 0.5)');
      halo.addColorStop(1, 'rgba(100, 150, 255, 0)');
    } else {
      halo.addColorStop(0, 'rgba(255, 220, 150, 0.5)');
      halo.addColorStop(1, 'rgba(200, 150, 80, 0)');
    }
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(sp.x, sp.y, 8*o.size*z, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

function handleParticleDrag(x, y, active) {
  if (S.starType) return;
  PART.dragX = x; PART.dragY = y; PART.dragActive = active;
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && PART.particles.length > 0) {
    for (let i = 0; i < PART.particles.length; i++) {
      PART.particles[i] = makeEdgeParticle();
    }
  }
});

window.initParticles = initParticles;
window.updateParticles = updateParticles;
window.drawParticles = drawParticles;
window.handleParticleDrag = handleParticleDrag;
window.PART = PART;
