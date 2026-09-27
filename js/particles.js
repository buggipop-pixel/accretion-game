// ═══════════════════════════════════════════════════════════════
//  PARTICLES.JS — пыль на всех фазах, с угасанием по прогрессу
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

const PART_COUNT      = 600;
const TOUCH_RADIUS    = 100;
const TOUCH_VELOCITY  = 400;
const ABSORB_RADIUS   = 14;
const DUST_PER_CENTER = 0.15;
const DUST_PER_FINGER = 0.5;
const SPIN_RADIUS     = 55;
const SPIN_STRENGTH   = 70;
const PASSING_MIN_MS  = 120000;
const PASSING_MAX_MS  = 300000;

// ─── Видимость пыли по фазам (1 = яркая, 0 = почти невидима) ────
function particleVisibility() {
  if (S.stage === 'cloud')       return 1.0;
  if (S.stage === 'condense')    return 0.75;
  if (S.stage === 'protostar')   return 0.45;
  if (S.stage === 'firstPlanet') return 0.30;
  if (S.stage === 'system') {
    // Чем больше планет, тем незаметнее пыль
    const n = S.planets.length;
    return Math.max(0.10, 0.30 - n * 0.025);
  }
  if (S.stage === 'galaxy')      return 0.06;
  return 1.0;
}

// ─── Скорость притяжения к центру (только до звезды) ────────────
function pullVelocity() {
  if (S.stage === 'cloud')     return 0.3;
  if (S.stage === 'condense')  return 1.2;
  if (S.stage === 'protostar') return 2.5;
  return 0.5; // после звезды — очень медленно
}

// ─── Создание частиц в мировых координатах ──────────────────────
function makeWorldParticle() {
  const W = window.CANVAS_W || 400;
  const H = window.CANVAS_H || 700;
  const z = S.zoom || 1;
  const halfW = W / (2 * z);
  const halfH = H / (2 * z);
  return {
    x: (Math.random() * 2 - 1) * halfW,
    y: (Math.random() * 2 - 1) * halfH,
    r: 0.5 + Math.random() * 1.3,
    hue: Math.random() < 0.72 ? 210 + Math.random() * 55 : 15 + Math.random() * 35,
    bright: 0.35 + Math.random() * 0.55,
    twinkle: Math.random() * Math.PI * 2,
  };
}

function makeEdgeParticle() {
  const W = window.CANVAS_W || 400;
  const H = window.CANVAS_H || 700;
  const z = S.zoom || 1;
  const halfW = W / (2 * z);
  const halfH = H / (2 * z);
  const side = Math.floor(Math.random() * 4);
  let x, y;
  if (side === 0) { x = (Math.random() * 2 - 1) * halfW; y = -halfH - 20; }
  else if (side === 1) { x = halfW + 20; y = (Math.random() * 2 - 1) * halfH; }
  else if (side === 2) { x = (Math.random() * 2 - 1) * halfW; y = halfH + 20; }
  else { x = -halfW - 20; y = (Math.random() * 2 - 1) * halfH; }
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
    PART.particles.push(makeWorldParticle());
  }
  PART.passing = [];
  PART.lastPassingAt = performance.now();
}

// ─── ОБНОВЛЕНИЕ ─────────────────────────────────────────────────
function updateParticles(dt, time) {
  const W = window.CANVAS_W || 400;
  const H = window.CANVAS_H || 700;
  const z = S.zoom || 1;
  const halfW = W / (2 * z);
  const halfH = H / (2 * z);
  const hasStar = !!S.starType;
  const pull = pullVelocity();
  const visibility = particleVisibility();

  // Плотность от зума
  const target = Math.round(PART_COUNT * Math.pow(1 / z, 1.2) * visibility);
  const clampedTarget = Math.max(150, Math.min(1400, target));
  while (PART.particles.length < clampedTarget - 15) PART.particles.push(makeWorldParticle());
  while (PART.particles.length > clampedTarget + 15) PART.particles.pop();

  PART.corePulse *= 0.9;

  for (let i = PART.particles.length - 1; i >= 0; i--) {
    const p = PART.particles[i];
    p.twinkle += dt * 2;

    const dist = Math.sqrt(p.x * p.x + p.y * p.y) || 1;
    const dirX = -p.x / dist;
    const dirY = -p.y / dist;

    // Притяжение к центру
    const prox = 1 + (1 - Math.min(1, dist / 400)) * 1.2;
    let vx = dirX * pull * prox;
    let vy = dirY * pull * prox;

    // Закручивание возле центра (только до звезды)
    if (!hasStar && dist < SPIN_RADIUS) {
      const t = 1 - dist / SPIN_RADIUS;
      const tanX = -p.y / dist;
      const tanY = p.x / dist;
      vx += tanX * SPIN_STRENGTH * t;
      vy += tanY * SPIN_STRENGTH * t;
      vx -= dirX * pull * prox * t * 0.5;
      vy -= dirY * pull * prox * t * 0.5;
    }

    // DRAG (только до звезды)
    if (!hasStar && PART.dragActive) {
      const cx = window.CANVAS_CX || 0;
      const cy = window.CANVAS_CY || 0;
      const wx = (PART.dragX - cx) / z;
      const wy = (PART.dragY - cy) / z;
      const tdx = wx - p.x;
      const tdy = wy - p.y;
      const tdist = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
      if (tdist < TOUCH_RADIUS) {
        const s = (1 - tdist / TOUCH_RADIUS) * TOUCH_VELOCITY;
        vx += (tdx / tdist) * s;
        vy += (tdy / tdist) * s;
      }
    }

    p.x += vx * dt;
    p.y += vy * dt;

    // Поглощение центром — только до звезды
    if (!hasStar) {
      const dCenter = Math.sqrt(p.x * p.x + p.y * p.y);
      if (dCenter < ABSORB_RADIUS) {
        S.dust += DUST_PER_CENTER;
        S.dustTotal += DUST_PER_CENTER;
        PART.corePulse = 1;
        PART.particles[i] = makeEdgeParticle();
        continue;
      }

      if (PART.dragActive) {
        const cx = window.CANVAS_CX || 0;
        const cy = window.CANVAS_CY || 0;
        const wx = (PART.dragX - cx) / z;
        const wy = (PART.dragY - cy) / z;
        const dF = Math.sqrt((p.x - wx) ** 2 + (p.y - wy) ** 2);
        if (dF < ABSORB_RADIUS) {
          S.dust += DUST_PER_FINGER;
          S.dustTotal += DUST_PER_FINGER;
          PART.particles[i] = makeEdgeParticle();
          continue;
        }
      }
    }

    // Улетел — вернуть на край
    if (p.x < -halfW - 80 || p.x > halfW + 80 ||
        p.y < -halfH - 80 || p.y > halfH + 80) {
      PART.particles[i] = makeEdgeParticle();
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
    age: 0, trail: [],
    hue: isComet ? 200 : 50,
  });
}

// ─── РИСОВАНИЕ ──────────────────────────────────────────────────
function drawParticles(ctx, time) {
  const cx = window.CANVAS_CX || 0;
  const cy = window.CANVAS_CY || 0;
  const z = S.zoom || 1;
  const t = time;
  const visibility = particleVisibility();
  const hasStar = !!S.starType;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Ореол центра — только до звезды
  if (!hasStar) {
    const pulse = 1 + PART.corePulse * 0.5;
    const haloR = 14 * pulse * z;
    const haloGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR);
    haloGrad.addColorStop(0, 'rgba(180, 160, 240, 0.25)');
    haloGrad.addColorStop(0.5, 'rgba(140, 120, 220, 0.08)');
    haloGrad.addColorStop(1, 'rgba(80, 60, 150, 0)');
    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(220, 210, 255, 0.95)';
    ctx.beginPath();
    ctx.arc(cx, cy, PART.coreR * pulse * z, 0, Math.PI * 2);
    ctx.fill();
  }

  // Частицы
  const sizeFactor = Math.max(0.7, z);
  for (const p of PART.particles) {
    const sx = cx + p.x * z;
    const sy = cy + p.y * z;
    const tw = 0.7 + 0.3 * Math.sin(p.twinkle + t * 2);
    ctx.globalAlpha = p.bright * tw * 0.85 * visibility;
    ctx.fillStyle = 'hsl(' + p.hue + ', 70%, 70%)';
    ctx.beginPath();
    ctx.arc(sx, sy, p.r * sizeFactor, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Радиус пальца — только до звезды
  if (!hasStar && PART.dragActive) {
    ctx.save();
    ctx.globalAlpha = 0.10;
    const grad = ctx.createRadialGradient(
      PART.dragX, PART.dragY, 0,
      PART.dragX, PART.dragY, TOUCH_RADIUS * z
    );
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
