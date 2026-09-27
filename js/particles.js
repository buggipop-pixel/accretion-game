// ═══════════════════════════════════════════════════════════════
//  PARTICLES.JS — облако пыли, диск, редкие корабли/кометы
//  ФИКС: усилен диск на II фазе, ярче визуал
// ═══════════════════════════════════════════════════════════════

const PART = {
  particles: [],
  passing: [],
  coreR: 1.5,
  corePulse: 0,
  dragX: 0, dragY: 0,
  dragActive: false,
  lastPassingAt: 0,
};

const PART_COUNT       = 600;
const TOUCH_RADIUS     = 100;
const TOUCH_VELOCITY   = 400;
const ABSORB_RADIUS    = 14;
const DUST_PER_CENTER  = 0.15;
const DUST_PER_FINGER  = 0.5;
const DISC_R_BASE      = 50;
const PASSING_MIN_MS   = 120000;
const PASSING_MAX_MS   = 300000;

// ─── СКОРОСТЬ ДВИЖЕНИЯ К ЦЕНТРУ ─────────────────────────────────
function pullVelocity() {
  if (S.stage === 'cloud')     return 0.3;
  if (S.stage === 'condense')  return 1.2;
  if (S.stage === 'protostar') return 2.5;
  return 0.3;
}

// ─── РАДИУС ДИСКА ───────────────────────────────────────────────
function discRadius() {
  if (S.stage !== 'condense' && S.stage !== 'protostar') return 0;
  return DISC_R_BASE + Math.min(80, Math.log10(S.dustTotal + 10) * 20);
}

// ─── СОЗДАНИЕ ЧАСТИЦ ────────────────────────────────────────────
function makeParticleRandom() {
  const W = window.CANVAS_W || 400;
  const H = window.CANVAS_H || 700;
  return {
    x: Math.random() * W,
    y: Math.random() * H,
    r: 0.5 + Math.random() * 1.3,
    hue: Math.random() < 0.72 ? 210 + Math.random() * 55 : 15 + Math.random() * 35,
    bright: 0.35 + Math.random() * 0.55,
    twinkle: Math.random() * Math.PI * 2,
  };
}

function makeParticleOnEdge() {
  const W = window.CANVAS_W || 400;
  const H = window.CANVAS_H || 700;
  const side = Math.floor(Math.random() * 4);
  let x, y;
  if (side === 0) { x = Math.random() * W; y = -10; }
  else if (side === 1) { x = W + 10; y = Math.random() * H; }
  else if (side === 2) { x = Math.random() * W; y = H + 10; }
  else { x = -10; y = Math.random() * H; }
  return {
    x, y,
    r: 0.5 + Math.random() * 1.3,
    hue: Math.random() < 0.72 ? 210 + Math.random() * 55 : 15 + Math.random() * 35,
    bright: 0.35 + Math.random() * 0.55,
    twinkle: Math.random() * Math.PI * 2,
  };
}

function initParticles() {
  PART.particles = [];
  for (let i = 0; i < PART_COUNT; i++) {
    PART.particles.push(makeParticleRandom());
  }
  PART.passing = [];
  PART.lastPassingAt = performance.now();
}

// ─── ОБНОВЛЕНИЕ ЧАСТИЦ ──────────────────────────────────────────
function updateParticles(dt, time) {
  if (S.starType) return;

  const cx = window.CANVAS_CX || 0;
  const cy = window.CANVAS_CY || 0;
  const W = window.CANVAS_W || 400;
  const H = window.CANVAS_H || 700;
  const z = S.zoom || 1;
  const pull = pullVelocity();
  const discR = discRadius();
  const inDiscPhase = discR > 0;

  // Динамическая плотность от зума
  const targetCount = Math.round(PART_COUNT / (z * z));
  const clampedTarget = Math.max(200, Math.min(1500, targetCount));
  while (PART.particles.length < clampedTarget - 20) PART.particles.push(makeParticleRandom());
  while (PART.particles.length > clampedTarget + 20) PART.particles.pop();

  PART.corePulse *= 0.9;

  for (let i = PART.particles.length - 1; i >= 0; i--) {
    const p = PART.particles[i];
    p.twinkle += dt * 2;

    const dx = cx - p.x;
    const dy = cy - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

    let vx = 0, vy = 0;

    // ─── ДИСК (фаза II) ───
    if (inDiscPhase && dist < discR && dist > 14) {
      const tangentX = -dy / dist;
      const tangentY = dx / dist;
      const angular = 220;             // вращение
      vx = tangentX * angular;
      vy = tangentY * angular;
      // сползание к центру
      vx += (dx / dist) * 30;
      vy += (dy / dist) * 30;
    } else {
      // ─── ОБЫЧНОЕ ПРИТЯЖЕНИЕ ───
      const proximityBoost = 1 + (1 - Math.min(1, dist / 300)) * 1.5;
      vx = (dx / dist) * pull * proximityBoost;
      vy = (dy / dist) * pull * proximityBoost;
    }

    // ─── DRAG ───
    if (PART.dragActive) {
      const tdx = PART.dragX - p.x;
      const tdy = PART.dragY - p.y;
      const tdist = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
      if (tdist < TOUCH_RADIUS) {
        const strength = (1 - tdist / TOUCH_RADIUS) * TOUCH_VELOCITY;
        vx += (tdx / tdist) * strength;
        vy += (tdy / tdist) * strength;
      }
    }

    p.x += vx * dt;
    p.y += vy * dt;

    // ─── ПОГЛОЩЕНИЕ ───
    const dCenter = Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
    if (dCenter < ABSORB_RADIUS) {
      S.dust += DUST_PER_CENTER;
      S.dustTotal += DUST_PER_CENTER;
      PART.corePulse = 1;
      PART.particles[i] = makeParticleOnEdge();
      continue;
    }

    if (PART.dragActive) {
      const dFinger = Math.sqrt((p.x - PART.dragX) ** 2 + (p.y - PART.dragY) ** 2);
      if (dFinger < ABSORB_RADIUS) {
        S.dust += DUST_PER_FINGER;
        S.dustTotal += DUST_PER_FINGER;
        PART.particles[i] = makeParticleOnEdge();
        continue;
      }
    }

    if (p.x < -80 || p.x > W + 80 || p.y < -80 || p.y > H + 80) {
      PART.particles[i] = makeParticleOnEdge();
    }
  }

  updatePassing(dt, time);
}

// ─── ПРОЛЁТЫ ────────────────────────────────────────────────────
function updatePassing(dt, time) {
  const now = performance.now();
  const interval = PASSING_MIN_MS + Math.random() * (PASSING_MAX_MS - PASSING_MIN_MS);
  if (now - PART.lastPassingAt > interval) {
    PART.lastPassingAt = now;
    spawnPassing();
  }

  for (let i = PART.passing.length - 1; i >= 0; i--) {
    const o = PART.passing[i];
    o.x += o.vx * dt;
    o.y += o.vy * dt;
    o.age += dt;
    o.trail.push({ x: o.x, y: o.y });
    if (o.trail.length > 15) o.trail.shift();

    const W = window.CANVAS_W || 400;
    const H = window.CANVAS_H || 700;
    if (o.x < -150 || o.x > W + 150 || o.y < -150 || o.y > H + 150) {
      PART.passing.splice(i, 1);
    }
  }
}

function spawnPassing() {
  const W = window.CANVAS_W || 400;
  const H = window.CANVAS_H || 700;
  const isComet = Math.random() < 0.6;
  const side = Math.floor(Math.random() * 4);
  let x, y, vx, vy;
  const speed = 60 + Math.random() * 80;

  if (side === 0) { x = Math.random() * W; y = -50; vx = (Math.random() - 0.5) * 40; vy = speed; }
  else if (side === 1) { x = W + 50; y = Math.random() * H; vx = -speed; vy = (Math.random() - 0.5) * 40; }
  else if (side === 2) { x = Math.random() * W; y = H + 50; vx = (Math.random() - 0.5) * 40; vy = -speed; }
  else { x = -50; y = Math.random() * H; vx = speed; vy = (Math.random() - 0.5) * 40; }

  PART.passing.push({
    x, y, vx, vy,
    type: isComet ? 'comet' : 'ship',
    age: 0,
    trail: [],
    hue: isComet ? 200 : 50,
  });
}

// ─── РИСОВАНИЕ ──────────────────────────────────────────────────
function drawParticles(ctx, time) {
  if (S.starType) {
    drawPassing(ctx);
    return;
  }

  const cx = window.CANVAS_CX || 0;
  const cy = window.CANVAS_CY || 0;
  const t = time;
  const z = S.zoom || 1;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // ─── ОРЕОЛ ЦЕНТРА ───
  const pulse = 1 + PART.corePulse * 0.5;
  const haloR = 18 * pulse * z;
  const haloGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR);
  haloGrad.addColorStop(0, 'rgba(160, 140, 230, 0.18)');
  haloGrad.addColorStop(0.5, 'rgba(120, 100, 200, 0.06)');
  haloGrad.addColorStop(1, 'rgba(80, 60, 150, 0)');
  ctx.fillStyle = haloGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
  ctx.fill();

  // ─── ДИСК (ФАЗА II) — ЯРКИЙ ───
  const discR = discRadius();
  if (discR > 0) {
    // Многослойное свечение диска
    const discGrad1 = ctx.createRadialGradient(cx, cy, discR * 0.4 * z, cx, cy, discR * z);
    discGrad1.addColorStop(0, 'rgba(255, 200, 255, 0.35)');
    discGrad1.addColorStop(0.5, 'rgba(200, 140, 250, 0.20)');
    discGrad1.addColorStop(1, 'rgba(120, 70, 220, 0)');
    ctx.fillStyle = discGrad1;
    ctx.beginPath();
    ctx.arc(cx, cy, discR * z, 0, Math.PI * 2);
    ctx.fill();

    // Тонкое кольцо-орбита
    ctx.strokeStyle = 'rgba(200, 160, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, discR * 0.7 * z, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 200, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, discR * 0.9 * z, 0, Math.PI * 2);
    ctx.stroke();

    // Дополнительные точки-частицы на диске (имитация плотных орбит)
    for (let i = 0; i < 24; i++) {
      const a = t * 0.8 + i * (Math.PI * 2 / 24);
      const r = discR * (0.55 + Math.sin(i * 1.3) * 0.25) * z;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r * 0.55;
      const size = 1.5 + Math.sin(i * 2.7) * 0.8;
      const alpha = 0.6 + Math.sin(t * 2 + i) * 0.3;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'hsl(' + (270 + i * 5) + ', 80%, 75%)';
      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ─── ЦЕНТР ───
  ctx.fillStyle = 'rgba(200, 190, 240, 0.95)';
  ctx.beginPath();
  ctx.arc(cx, cy, PART.coreR * pulse * z, 0, Math.PI * 2);
  ctx.fill();

  // ─── ЧАСТИЦЫ ───
  for (const p of PART.particles) {
    const sx = cx + (p.x - cx) * z;
    const sy = cy + (p.y - cy) * z;
    const twinkle = 0.7 + 0.3 * Math.sin(p.twinkle + t * 2);
    ctx.globalAlpha = p.bright * twinkle * 0.85;
    ctx.fillStyle = 'hsl(' + p.hue + ', 70%, 70%)';
    ctx.beginPath();
    ctx.arc(sx, sy, p.r * z, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // ─── DRAG ───
  if (PART.dragActive) {
    ctx.save();
    ctx.globalAlpha = 0.10;
    const grad = ctx.createRadialGradient(PART.dragX, PART.dragY, 0, PART.dragX, PART.dragY, TOUCH_RADIUS);
    grad.addColorStop(0, 'rgba(185, 168, 255, 0.7)');
    grad.addColorStop(1, 'rgba(185, 168, 255, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(PART.dragX, PART.dragY, TOUCH_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawPassing(ctx);
}

function drawPassing(ctx) {
  const z = S.zoom || 1;
  for (const o of PART.passing) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < o.trail.length; i++) {
      const seg = o.trail[i];
      const life = i / o.trail.length;
      ctx.globalAlpha = life * 0.6;
      const size = 1 + life * 2.5;
      const grad = ctx.createRadialGradient(seg.x, seg.y, 0, seg.x, seg.y, size * 2);
      if (o.type === 'comet') {
        grad.addColorStop(0, 'rgba(150, 220, 255, 0.9)');
        grad.addColorStop(1, 'rgba(100, 150, 255, 0)');
      } else {
        grad.addColorStop(0, 'rgba(255, 220, 150, 0.9)');
        grad.addColorStop(1, 'rgba(200, 150, 80, 0)');
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(seg.x, seg.y, size * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = o.type === 'comet' ? '#e8f6ff' : '#ffeec8';
    ctx.beginPath();
    ctx.arc(o.x, o.y, 2 * z, 0, Math.PI * 2);
    ctx.fill();

    const halo = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, 10 * z);
    if (o.type === 'comet') {
      halo.addColorStop(0, 'rgba(150, 220, 255, 0.5)');
      halo.addColorStop(1, 'rgba(100, 150, 255, 0)');
    } else {
      halo.addColorStop(0, 'rgba(255, 220, 150, 0.5)');
      halo.addColorStop(1, 'rgba(200, 150, 80, 0)');
    }
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(o.x, o.y, 10 * z, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

// ─── DRAG ───────────────────────────────────────────────────────
function handleParticleDrag(x, y, active) {
  if (S.starType) return;
  PART.dragX = x;
  PART.dragY = y;
  PART.dragActive = active;
}

window.initParticles = initParticles;
window.updateParticles = updateParticles;
window.drawParticles = drawParticles;
window.handleParticleDrag = handleParticleDrag;
window.PART = PART;
