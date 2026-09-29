// ═══════════════════════════════════════════════════════════════
//  PARTICLES.JS — частицы пыли, визуализация фаз, пролёты комет
//  Фаза I:   разреженное облако, медленное стягивание
//  Фаза II:  плотный диск, 2 спиральных рукава
//  Фаза III: биполярные джеты, разреженный диск
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

// ─── Конфигурация фаз ───────────────────────────────────────────
const PHASE_CONFIG = {
  cloud: {
    vRef: 22, spiralB: 5, armAngleB: 0.04,
    armForce: 0.4, armSpread: 0.9, radialDrift: 0.8,
    jets: false, coreGlow: 0.2,
  },
  condense: {
    vRef: 55, spiralB: 14, armAngleB: 0.08,
    armForce: 0.7, armSpread: 0.5, radialDrift: 2.5,
    jets: false, coreGlow: 0.4,
  },
  protostar: {
    vRef: 65, spiralB: 16, armAngleB: 0.10,
    armForce: 0.8, armSpread: 0.4, radialDrift: 3.0,
    jets: true, coreGlow: 1.0,
  },
  firstPlanet: {
    vRef: 60, spiralB: 15, armAngleB: 0.09,
    armForce: 0.7, armSpread: 0.5, radialDrift: 2.0,
    jets: true, coreGlow: 1.0,
  },
  system: {
    vRef: 50, spiralB: 12, armAngleB: 0.08,
    armForce: 0.6, armSpread: 0.6, radialDrift: 1.5,
    jets: false, coreGlow: 1.0,
  },
  galaxy: {
    vRef: 40, spiralB: 10, armAngleB: 0.06,
    armForce: 0.5, armSpread: 0.7, radialDrift: 1.0,
    jets: false, coreGlow: 1.0,
  },
};

function getPhaseConfig() {
  return PHASE_CONFIG[S.stage] || PHASE_CONFIG.cloud;
}

function keplerTangential(r, vRef) {
  if (r < 20) r = 20;
  return vRef * Math.sqrt(100 / r);
}

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

// ─── Создание частиц ────────────────────────────────────────────
function makeWorldParticle() {
  const W = window.CANVAS_W || 400, H = window.CANVAS_H || 700;
  const z = S.zoom || 1;
  const halfW = W / (2 * z), halfH = H / (2 * z);
  return {
    x: (Math.random() * 2 - 1) * halfW,
    y: (Math.random() * 2 - 1) * halfH,
    r: 0.5 + Math.random() * 1.2,
    hue: Math.random() < 0.72 ? 215 + Math.random() * 50 : 15 + Math.random() * 35,
    bright: 0.4 + Math.random() * 0.5,
    twinkle: Math.random() * Math.PI * 2,
    spinVar: 0.9 + Math.random() * 0.2,
    arm: Math.random() < 0.5 ? 0 : 1,
    armOffset: (Math.random() - 0.5) * 0.9,
    age: 0,
  };
}

function makeEdgeParticle() {
  const arm = Math.random() < 0.5 ? 0 : 1;
  const r = 170 + Math.random() * 60;
  const baseAngle = arm * Math.PI + r * 0.04;
  const angle = baseAngle + (Math.random() - 0.5) * 1.8;
  return {
    x: Math.cos(angle) * r,
    y: Math.sin(angle) * r * 0.5,
    r: 0.5 + Math.random() * 1.2,
    hue: Math.random() < 0.72 ? 215 + Math.random() * 50 : 15 + Math.random() * 35,
    bright: 0.4 + Math.random() * 0.5,
    twinkle: Math.random() * Math.PI * 2,
    spinVar: 0.9 + Math.random() * 0.2,
    arm: arm,
    armOffset: (Math.random() - 0.5) * 0.9,
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

// ─── Обновление частиц ──────────────────────────────────────────
function updateParticles(dt, time) {
  const W = window.CANVAS_W || 400, H = window.CANVAS_H || 700;
  const z = S.zoom || 1;
  const halfW = W / (2 * z), halfH = H / (2 * z);
  const cfg = getPhaseConfig();
  const hasStar = !!S.starType;

  // Динамическая плотность по зуму
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

    // Кеплеровское вращение + спираль
    const tangential = keplerTangential(dist, cfg.vRef) * p.spinVar;
    const radial = tangential * cfg.spiralB / Math.max(25, dist);
    vx += tanX * tangential;
    vy += tanY * tangential;
    vx += dirX * (radial + cfg.radialDrift);
    vy += dirY * (radial + cfg.radialDrift);

    // Выравнивание к рукавам
    const targetA = p.arm * Math.PI + dist * cfg.armAngleB + p.armOffset;
    const curA = Math.atan2(p.y, p.x);
    let aDiff = normAngle(targetA - curA);
    if (aDiff > 0.35) aDiff = 0.35;
    if (aDiff < -0.35) aDiff = -0.35;
    vx += tanX * aDiff * cfg.armForce;
    vy += tanY * aDiff * cfg.armForce;

    // Притяжение к пальцу
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

    // Поглощение центром
    const dCenter = Math.sqrt(p.x * p.x + p.y * p.y);
    if (dCenter < absorbR) {
      S.dust += DUST_PER_PARTICLE;
      S.dustTotal += DUST_PER_PARTICLE;
      PART.absorbed++;
      if (hasStar) PART.starPulse = 1; else PART.corePulse = 1;
      PART.particles[i] = makeEdgeParticle();
      continue;
    }

    // Поглощение пальцем
    if (fingerWorld) {
      const dF = Math.sqrt((p.x - fingerWorld.x) ** 2 + (p.y - fingerWorld.y) ** 2);
      if (dF < absorbR) {
        S.dust += DUST_PER_FINGER;
        S.dustTotal += DUST_PER_FINGER;
        PART.particles[i] = makeEdgeParticle();
        continue;
      }
    }

    // Улетел далеко — на край
    if (p.x < -halfW - 80 || p.x > halfW + 80 ||
        p.y < -halfH - 80 || p.y > halfH + 80) {
      PART.particles[i] = makeEdgeParticle();
    }
  }

  // Рост ядра
  if (S.stage === 'condense' || S.stage === 'protostar') {
    PART.coreR = 1.8 + Math.min(6, Math.log10(PART.absorbed + 1) * 2.0);
  } else PART.coreR = 1.8;

  updatePassing(dt, time);
}

// ─── Пролёты (кометы, корабли) ──────────────────────────────────
function updatePassing(dt, time) {
  const now = performance.now();
  const interval = 120000 + Math.random() * 180000;
  if (now - PART.lastPassingAt > interval) {
    PART.lastPassingAt = now;
    spawnPassing();
  }

  const W = window.CANVAS_W || 400, H = window.CANVAS_H || 700;
  const z = S.zoom || 1;
  const halfW = W / (2 * z), halfH = H / (2 * z);

  for (let i = PART.passing.length - 1; i >= 0; i--) {
    const o = PART.passing[i];

    // ★ Гравитация звезды на кометы
    if (o.type === 'comet' && S.starType && !o.dying) {
      const dx = -o.x, dy = -o.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d < 300) {
        const grav = 8000 / (d * d + 100);
        o.vx += (dx / d) * grav * dt;
        o.vy += (dy / d) * grav * dt;
      }
    }

    // ★ Сгорание у звезды
    if (o.type === 'comet' && S.starType && !o.dying) {
      const d = Math.sqrt(o.x * o.x + o.y * o.y);
      if (d < 90) {
        o.dying = true;
        o.dieAt = now;
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

    // ★ Столкновение с планетами через реальные позиции
    if (o.type === 'comet' && !o.dying && S.planets && S.planets.length > 0
        && typeof getPlanetWorldPos === 'function') {
      const nowSec = now / 1000;
      for (let j = 0; j < S.planets.length; j++) {
        const pl = S.planets[j];
        if (pl.forming) continue;
        const pos = getPlanetWorldPos(pl, nowSec);
        const dd = Math.hypot(o.x - pos.x, o.y - pos.y);
        const hitR = pl.diameter * 8 + o.size * 15;
        if (dd < hitR) {
          o.dying = true;
          o.dieAt = now;
          const sp = worldToScreen(o.x, o.y);
          S.explosions.push({
            x: sp.x, y: sp.y, type: 'destroy',
            startAt: now, endAt: now + 900, size: 30,
          });
          if (typeof toast === 'function') {
            toast('☄️ Комета врезалась', PLANET_TYPES[pl.type].name);
          }
          break;
        }
      }
    }

    // Умирающая комета затухает
    if (o.dying) {
      const age = (now - o.dieAt) / 800;
      if (age > 1) { PART.passing.splice(i, 1); continue; }
      o.alpha = 1 - age;
    }

    o.x += o.vx * dt;
    o.y += o.vy * dt;
    o.age += dt;
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
    x: x, y: y, vx: vx, vy: vy,
    type: isComet ? 'comet' : 'ship',
    size: size, tailLen: tailLen,
    alpha: 1, age: 0, trail: [],
  });
}

// ─── Рисование частиц ───────────────────────────────────────────
function particleVisibility() {
  if (S.stage === 'cloud')       return 1.0;
  if (S.stage === 'condense')    return 0.95;
  if (S.stage === 'protostar')   return 0.7;
  if (S.stage === 'firstPlanet') return 0.5;
  if (S.stage === 'system') return Math.max(0.2, 0.5 - S.planets.length * 0.04);
  if (S.stage === 'galaxy')      return 0.15;
  return 1.0;
}

function drawParticles(ctx, time) {
  const z = S.zoom || 1;
  const t = time;
  const cfg = getPhaseConfig();
  const hasStar = !!S.starType;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Ореол / ядро / джеты
  if (!hasStar) {
    const pulse = 1 + PART.corePulse * 0.5;
    const coreRNow = PART.coreR * pulse * z;
    const cpos = worldToScreen(0, 0);

    if (cfg.jets) drawJets(ctx, cpos.x, cpos.y, z, t, cfg.coreGlow);

    const haloR = (S.stage === 'condense' ? 20 : 10) * z;
    const g = ctx.createRadialGradient(cpos.x, cpos.y, 0, cpos.x, cpos.y, haloR);
    g.addColorStop(0, 'rgba(230, 210, 255, ' + (0.3 + cfg.coreGlow * 0.3) + ')');
    g.addColorStop(0.4, 'rgba(180, 150, 240, ' + (0.1 + cfg.coreGlow * 0.15) + ')');
    g.addColorStop(1, 'rgba(80, 60, 150, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cpos.x, cpos.y, haloR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(240, 235, 255, ' + (0.6 + cfg.coreGlow * 0.35) + ')';
    ctx.beginPath();
    ctx.arc(cpos.x, cpos.y, coreRNow, 0, Math.PI * 2);
    ctx.fill();
  }

  // Частицы
  const sizeFactor = Math.max(0.7, z);
  for (let i = 0; i < PART.particles.length; i++) {
    const p = PART.particles[i];
    const sp = worldToScreen(p.x, p.y);
    const dist = Math.sqrt(p.x * p.x + p.y * p.y);

    let heat = 0;
    if (typeof tempAt === 'function') {
      const rAe = dist / PHYS.refRadius;
      const temp = tempAt(rAe);
      heat = Math.max(0, Math.min(1, (temp - 50) / 400));
    } else {
      heat = Math.max(0, 1 - dist / 120);
    }
    const hueShift = -heat * 60 + (1 - heat) * 20;
    const brightBoost = 1 + heat * 1.5;

    const tw = 0.7 + 0.3 * Math.sin(p.twinkle + t * 2);
    const alpha = Math.min(1, p.bright * tw * 0.85 *
                  particleVisibility() * brightBoost);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'hsl(' + (p.hue + hueShift) + ', ' +
                    (65 + heat * 25) + '%, ' + (68 + heat * 18) + '%)';
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, p.r * sizeFactor * (1 + heat * 0.3), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Drag радиус
  if (!hasStar && PART.dragActive) {
    ctx.save();
    ctx.globalAlpha = 0.10;
    const grad = ctx.createRadialGradient(
      PART.dragX, PART.dragY, 0, PART.dragX, PART.dragY, TOUCH_RADIUS * z);
    grad.addColorStop(0, 'rgba(185, 168, 255, 0.7)');
    grad.addColorStop(1, 'rgba(185, 168, 255, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(PART.dragX, PART.dragY, TOUCH_RADIUS * z, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawPassing(ctx);
}

// ─── Биполярные джеты (фаза протозвезды) ────────────────────────
function drawJets(ctx, cx, cy, z, t, intensity) {
  if (intensity < 0.5) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let side = -1; side <= 1; side += 2) {
    const jetLen = 60 * z * intensity;
    const jetW = 8 * z;
    const grad = ctx.createLinearGradient(cx, cy, cx, cy + side * jetLen);
    grad.addColorStop(0, 'rgba(180, 220, 255, ' + (0.6 * intensity) + ')');
    grad.addColorStop(0.5, 'rgba(120, 180, 255, ' + (0.3 * intensity) + ')');
    grad.addColorStop(1, 'rgba(80, 120, 255, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx - jetW, cy);
    ctx.lineTo(cx + jetW, cy);
    ctx.lineTo(cx + jetW * 0.4, cy + side * jetLen);
    ctx.lineTo(cx - jetW * 0.4, cy + side * jetLen);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawPassing(ctx) {
  const z = S.zoom || 1;
  for (let i = 0; i < PART.passing.length; i++) {
    const o = PART.passing[i];
    const alpha = o.alpha != null ? o.alpha : 1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let j = 0; j < o.trail.length; j++) {
      const seg = o.trail[j];
      const sp = worldToScreen(seg.x, seg.y);
      const life = j / o.trail.length;
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
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, size * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    const sp = worldToScreen(o.x, o.y);
    ctx.globalAlpha = 0.95 * alpha;
    ctx.fillStyle = o.type === 'comet' ? '#e8f6ff' : '#ffeec8';
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 1.6 * o.size * z, 0, Math.PI * 2);
    ctx.fill();
    const halo = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, 8 * o.size * z);
    if (o.type === 'comet') {
      halo.addColorStop(0, 'rgba(150, 220, 255, 0.5)');
      halo.addColorStop(1, 'rgba(100, 150, 255, 0)');
    } else {
      halo.addColorStop(0, 'rgba(255, 220, 150, 0.5)');
      halo.addColorStop(1, 'rgba(200, 150, 80, 0)');
    }
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 8 * o.size * z, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function handleParticleDrag(x, y, active) {
  if (S.starType) return;
  PART.dragX = x;
  PART.dragY = y;
  PART.dragActive = active;
}

document.addEventListener('visibilitychange', function() {
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
window.worldToScreen = worldToScreen;
window.screenToWorld = screenToWorld;
window.PART = PART;
