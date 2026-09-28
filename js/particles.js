// ═══════════════════════════════════════════════════════════════
//  PARTICLES.JS — правильная аккреция: закрутка снаружи, падение внутрь
// ═══════════════════════════════════════════════════════════════

const PART = {
  particles: [],
  passing: [],
  coreR: 1.5,
  corePulse: 0,
  starPulse: 0,
  dragX: 0, dragY: 0,
  dragActive: false,
  lastPassingAt: 0,
};

const PART_COUNT      = 600;
const TOUCH_RADIUS    = 100;
const TOUCH_VELOCITY  = 400;
const ABSORB_RADIUS   = 14;
const DUST_PER_CENTER = 0.15;
const DUST_PER_STAR   = 1.5;
const DUST_PER_FINGER = 0.5;

// ─── ЗОНЫ АККРЕЦИИ ──────────────────────────────────────────────
const SPIN_OUTER   = 140;   // внешняя граница закрутки
const SPIN_INNER   = 80;    // внутренняя граница — здесь спин = 0
const SPIN_STRENGTH = 90;   // базовая сила вращения

const PASSING_MIN_MS = 120000;
const PASSING_MAX_MS = 300000;

// ─── Видимость пыли по фазам ────────────────────────────────────
function particleVisibility() {
  if (S.stage === 'cloud')       return 1.0;
  if (S.stage === 'condense')    return 0.75;
  if (S.stage === 'protostar')   return 0.55;
  if (S.stage === 'firstPlanet') return 0.40;
  if (S.stage === 'system') {
    const n = S.planets.length;
    return Math.max(0.18, 0.40 - n * 0.03);
  }
  if (S.stage === 'galaxy')      return 0.15;
  return 1.0;
}

// ─── Базовая скорость притяжения к центру ───────────────────────
function basePull() {
  if (S.stage === 'cloud')     return 0.5;
  if (S.stage === 'condense')  return 1.5;
  if (S.stage === 'protostar') return 3.0;
  if (S.stage === 'firstPlanet' || S.stage === 'system') return 4.0;
  if (S.stage === 'galaxy')    return 2.0;
  return 0.5;
}

// ─── Создание частиц ────────────────────────────────────────────
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
    spinVar: 0.4 + Math.random() * 0.9,   // ← индивидуальный разброс
    age: 0,                                // ← сколько в зоне
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
    spinVar: 0.4 + Math.random() * 0.9,
    age: 0,
  };
}

function initParticles() {
  PART.particles = [];
  for (let i = 0; i < PART_COUNT; i++) PART.particles.push(makeWorldParticle());
  PART.passing = [];
  PART.lastPassingAt = performance.now();
}

// ─── ГЛАВНАЯ ЛОГИКА АККРЕЦИИ ────────────────────────────────────
function updateParticles(dt, time) {
  const W = window.CANVAS_W || 400;
  const H = window.CANVAS_H || 700;
  const z = S.zoom || 1;
  const halfW = W / (2 * z);
  const halfH = H / (2 * z);
  const hasStar = !!S.starType;
  const base = basePull();

  // Плотность по зуму
  const target = Math.round(PART_COUNT * Math.pow(1 / z, 1.2));
  const clampedTarget = Math.max(200, Math.min(1400, target));
  while (PART.particles.length < clampedTarget - 15) PART.particles.push(makeWorldParticle());
  while (PART.particles.length > clampedTarget + 15) PART.particles.pop();

  PART.corePulse *= 0.9;
  PART.starPulse *= 0.92;

  for (let i = PART.particles.length - 1; i >= 0; i--) {
    const p = PART.particles[i];
    p.twinkle += dt * 2;

    const dist = Math.sqrt(p.x * p.x + p.y * p.y) || 1;
    const dirX = -p.x / dist;   // к центру
    const dirY = -p.y / dist;
    const tanX = -p.y / dist;   // тангенциальная
    const tanY = p.x / dist;

    let vx = 0, vy = 0;

    if (dist > SPIN_OUTER) {
      // ─── ДАЛЬНЯЯ ЗОНА: только притяжение ───
      const prox = 1 + (1 - Math.min(1, dist / 500)) * 1.5;
      vx = dirX * base * prox;
      vy = dirY * base * prox;

    } else if (dist > SPIN_INNER) {
      // ─── СРЕДНЯЯ ЗОНА: закрутка + притяжение ───
      const span = SPIN_OUTER - SPIN_INNER;  // 60 px
      const t = (SPIN_OUTER - dist) / span;  // 0 на краю, 1 у внутренней границы
      // Спин силён на внешней стороне, падает к 0 у внутренней
      const spinPower = SPIN_STRENGTH * (1 - t) * p.spinVar;
      vx += tanX * spinPower;
      vy += tanY * spinPower;
      // Притяжение растёт к внутренней границе
      const inward = base * (1.5 + t * 3);
      vx += dirX * inward;
      vy += dirY * inward;

    } else {
      // ─── ВНУТРЕННЯЯ ЗОНА: чистое падение с ускорением ───
      const t = 1 - dist / SPIN_INNER;  // 0 на границе, 1 в центре
      const inward = base * (4 + t * 12);
      vx = dirX * inward;
      vy = dirY * inward;
      // Чуть-чуть оставляем вращения, чтобы не выглядело как падение по прямой
      vx += tanX * SPIN_STRENGTH * 0.1 * p.spinVar;
      vy += tanY * SPIN_STRENGTH * 0.1 * p.spinVar;

      // Anti-stuck: если долго в центре — форсаж к ядру
      p.age = (p.age || 0) + dt;
      if (p.age > 8) {
        vx += dirX * 30;
        vy += dirY * 30;
      }
    }

    // DRAG
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

    // ─── ПОГЛОЩЕНИЕ ЦЕНТРОМ / ЗВЕЗДОЙ ───
    const dCenter = Math.sqrt(p.x * p.x + p.y * p.y);
    if (dCenter < ABSORB_RADIUS) {
      const gain = hasStar ? DUST_PER_STAR : DUST_PER_CENTER;
      S.dust += gain;
      S.dustTotal += gain;
      if (hasStar) PART.starPulse = 1;
      else PART.corePulse = 1;
      PART.particles[i] = makeEdgeParticle();
      continue;
    }

    // ─── ПОГЛОЩЕНИЕ ПАЛЬЦЕМ ───
    if (!hasStar && PART.dragActive) {
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

    // Улетел — вернуть
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

// ─── ФОРМАТ ─────────────────────────────────────────────────────
function fmtShort(n) {
  if (typeof window.fmt === 'function') return window.fmt(n);
  if (n < 1000) return Math.floor(n).toString();
  const units = ['', 'К', 'М', 'Б', 'Т'];
  let i = 0;
  while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
  return n.toFixed(1) + units[i];
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

    // Разогрев ближе к центру — частицы ярче и теплее
    const dist = Math.sqrt(p.x * p.x + p.y * p.y);
    const heat = Math.max(0, 1 - dist / 120); // 0..1
    const hueShift = -heat * 40; // синий → оранжевый
    const brightBoost = 1 + heat * 1.2;

    const tw = 0.7 + 0.3 * Math.sin(p.twinkle + t * 2);
    ctx.globalAlpha = Math.min(1, p.bright * tw * 0.85 * visibility * brightBoost);
    ctx.fillStyle = 'hsl(' + (p.hue + hueShift) + ', ' + (70 + heat * 20) + '%, ' + (70 + heat * 15) + '%)';
    ctx.beginPath();
    ctx.arc(sx, sy, p.r * sizeFactor * (1 + heat * 0.3), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Радиус пальца
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

  // Подпись дохода
  if (hasStar) {
    const perHour = (typeof dustPerSec === 'function') ? dustPerSec() * 3600 : 0;
    const yOff = 55 * z;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.9;
    ctx.font = '600 12px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#b9a8ff';
    ctx.shadowColor = 'rgba(107, 77, 230, 0.8)';
    ctx.shadowBlur = 8;
    ctx.fillText('+' + fmtShort(perHour) + ' / час', cx, cy + yOff);
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

// ─── РЕАКЦИЯ НА ВОЗВРАТ ВКЛАДКИ ─────────────────────────────────
// Когда игрок возвращается после долгого отсутствия — разбрасываем частицы,
// чтобы не видеть «застывшее кольцо»
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
