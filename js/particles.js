// ═══════════════════════════════════════════════════════════════
//  PARTICLES.JS — фаза I: спираль. Фаза II: яркая звезда + кольца
// ═══════════════════════════════════════════════════════════════

const PART = {
  particles: [],
  passing: [],
  coreR: 1.8,
  corePulse: 0,
  starPulse: 0,
  absorbed: 0,
  dragX: 0, dragY: 0,
  dragActive: false,
  lastPassingAt: 0,
};

const PART_COUNT      = 700;
const TOUCH_RADIUS    = 100;
const TOUCH_VELOCITY  = 400;
const DUST_PER_CENTER = 0.15;
const DUST_PER_STAR   = 1.5;
const DUST_PER_FINGER = 0.5;

// ─── КОНФИГ ФАЗ ─────────────────────────────────────────────────
const CLOUD = {
  pull: 0.35,          // медленное стягивание
  spiralForce: 18,     // сила удержания на рукаве
  spiralTight: 0.85,   // «закрученность» log-спирали
  arms: 2,             // 2 рукава
  armSpread: 0.5,      // разброс частиц вокруг рукава
  pullCenterBoost: 1.0 // без ускорения у центра
};

const CONDENSE = {
  pull: 0.9,           // стягивание в центр
  ringHold: 1.6,       // сила удержания на кольце
  ringSpin: 85,        // скорость вращения вдоль кольца
  ringPull: 1.2,       // стягивание внутри кольца
  rings: [55, 108],    // 2 кольца
  ringWidth: 24,       // ширина зоны кольца
  coreGrow: 2.0,       // скорость роста ядра
};

const PASSING_MIN_MS = 120000;
const PASSING_MAX_MS = 300000;

// ─── ВИДИМОСТЬ ПЫЛИ ─────────────────────────────────────────────
function particleVisibility() {
  if (S.stage === 'cloud')       return 1.0;
  if (S.stage === 'condense')    return 0.9;
  if (S.stage === 'protostar')   return 0.55;
  if (S.stage === 'firstPlanet') return 0.40;
  if (S.stage === 'system') {
    const n = S.planets.length;
    return Math.max(0.18, 0.40 - n * 0.03);
  }
  if (S.stage === 'galaxy')      return 0.15;
  return 1.0;
}

// ─── СОЗДАНИЕ ЧАСТИЦ ────────────────────────────────────────────
function makeWorldParticle() {
  const W = window.CANVAS_W || 400;
  const H = window.CANVAS_H || 700;
  const z = S.zoom || 1;
  const halfW = W / (2 * z);
  const halfH = H / (2 * z);
  return {
    x: (Math.random() * 2 - 1) * halfW,
    y: (Math.random() * 2 - 1) * halfH,
    r: 0.5 + Math.random() * 1.2,
    hue: Math.random() < 0.72 ? 215 + Math.random() * 50 : 15 + Math.random() * 35,
    bright: 0.4 + Math.random() * 0.5,
    twinkle: Math.random() * Math.PI * 2,
    spinVar: 0.75 + Math.random() * 0.5,
    arm: Math.random() < 0.5 ? 0 : 1,          // в какой рукав
    armOffset: (Math.random() - 0.5) * CLOUD.armSpread,
    ring: Math.random() < 0.5 ? 0 : 1,          // какое кольцо
    age: 0,
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
    r: 0.5 + Math.random() * 1.2,
    hue: Math.random() < 0.72 ? 215 + Math.random() * 50 : 15 + Math.random() * 35,
    bright: 0.4 + Math.random() * 0.5,
    twinkle: Math.random() * Math.PI * 2,
    spinVar: 0.75 + Math.random() * 0.5,
    arm: Math.random() < 0.5 ? 0 : 1,
    armOffset: (Math.random() - 0.5) * CLOUD.armSpread,
    ring: Math.random() < 0.5 ? 0 : 1,
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

// ─── ФИЗИКА ─────────────────────────────────────────────────────
function normAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function updateParticles(dt, time) {
  const W = window.CANVAS_W || 400;
  const H = window.CANVAS_H || 700;
  const z = S.zoom || 1;
  const halfW = W / (2 * z);
  const halfH = H / (2 * z);
  const hasStar = !!S.starType;
  const stage = S.stage;
  const isCloud = stage === 'cloud';
  const isDisk  = stage === 'condense' || stage === 'protostar';

  const target = Math.round(PART_COUNT * Math.pow(1 / z, 1.2));
  const clampedTarget = Math.max(200, Math.min(1500, target));
  while (PART.particles.length < clampedTarget - 15) PART.particles.push(makeWorldParticle());
  while (PART.particles.length > clampedTarget + 15) PART.particles.pop();

  PART.corePulse *= 0.9;
  PART.starPulse *= 0.92;

  const absorbR = PART.coreR + 4;

  for (let i = PART.particles.length - 1; i >= 0; i--) {
    const p = PART.particles[i];
    p.twinkle += dt * 2;

    const dist = Math.sqrt(p.x * p.x + p.y * p.y) || 1;
    const dirX = -p.x / dist;
    const dirY = -p.y / dist;
    const tanX = -p.y / dist;
    const tanY = p.x / dist;

    let vx = 0, vy = 0;

    // ─── ФАЗА I: СПИРАЛЬНЫЕ РУКАВА ───
    if (isCloud) {
      // Целевой угол логарифмической спирали
      const targetA = p.arm * Math.PI
                    + Math.log(dist + 1) * CLOUD.spiralTight
                    + p.armOffset;
      const curA = Math.atan2(p.y, p.x);
      const aDiff = normAngle(targetA - curA);

      // Тангенциальная сила к рукаву
      vx += tanX * aDiff * CLOUD.spiralForce * p.spinVar;
      vy += tanY * aDiff * CLOUD.spiralForce * p.spinVar;

      // Медленное стягивание в центр (постоянное, без ускорения)
      vx += dirX * CLOUD.pull;
      vy += dirY * CLOUD.pull;
    }

    // ─── ФАЗА II: КОЛЬЦА + СТЯГИВАНИЕ ───
    else if (isDisk) {
      const ringR = p.ring === 0 ? CONDENSE.rings[0] : CONDENSE.rings[1];
      const rDiff = ringR - dist;

      if (Math.abs(rDiff) < CONDENSE.ringWidth) {
        // В зоне кольца: удержание + вращение
        vx += dirX * rDiff * CONDENSE.ringHold;
        vy += dirY * rDiff * CONDENSE.ringHold;
        vx += tanX * CONDENSE.ringSpin * p.spinVar;
        vy += tanY * CONDENSE.ringSpin * p.spinVar;
        // Медленное стягивание в центр
        vx += dirX * CONDENSE.ringPull;
        vy += dirY * CONDENSE.ringPull;
      } else {
        // Вне кольца: падение к ближайшему кольцу
        const pull = CONDENSE.pull * (rDiff > 0 ? 1.4 : 0.8);
        vx += dirX * pull;
        vy += dirY * pull;
      }
    }

    // ─── ФАЗА III+ ───
    else if (hasStar) {
      // Простое медленное стягивание к звезде
      vx += dirX * 1.5;
      vy += dirY * 1.5;
    }

    // ─── DRAG ───
    if (!hasStar && PART.dragActive) {
      const cx0 = window.CANVAS_CX || 0;
      const cy0 = window.CANVAS_CY || 0;
      const wx = (PART.dragX - cx0) / z;
      const wy = (PART.dragY - cy0) / z;
      const tdx = wx - p.x;
      const tdy = wy - p.y;
      const tdist = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
      if (tdist < TOUCH_RADIUS) {
        const s = (1 - tdist / TOUCH_RADIUS) * TOUCH_VELOCITY;
        vx += (tdx / tdist) * s;
        vy += (tdy / tdist) * s;
      }
    }

    // Anti-stuck
    p.age += dt;
    if (dist < 30 && p.age > 4) {
      vx += dirX * 25;
      vy += dirY * 25;
    }
    if (dist > 100) p.age = 0;

    p.x += vx * dt;
    p.y += vy * dt;

    // ─── ПОГЛОЩЕНИЕ ───
    const dCenter = Math.sqrt(p.x * p.x + p.y * p.y);
    if (dCenter < absorbR) {
      const gain = hasStar ? DUST_PER_STAR : DUST_PER_CENTER;
      S.dust += gain;
      S.dustTotal += gain;
      PART.absorbed++;
      if (hasStar) PART.starPulse = 1;
      else PART.corePulse = 1;
      PART.particles[i] = makeEdgeParticle();
      continue;
    }

    if (!hasStar && PART.dragActive) {
      const cx0 = window.CANVAS_CX || 0;
      const cy0 = window.CANVAS_CY || 0;
      const wx = (PART.dragX - cx0) / z;
      const wy = (PART.dragY - cy0) / z;
      const dF = Math.sqrt((p.x - wx) ** 2 + (p.y - wy) ** 2);
      if (dF < absorbR) {
        S.dust += DUST_PER_FINGER;
        S.dustTotal += DUST_PER_FINGER;
        PART.particles[i] = makeEdgeParticle();
        continue;
      }
    }

    if (p.x < -halfW - 80 || p.x > halfW + 80 ||
        p.y < -halfH - 80 || p.y > halfH + 80) {
      PART.particles[i] = makeEdgeParticle();
    }
  }

  // Рост ядра
  if (isDisk) {
    PART.coreR = 1.8 + Math.min(6, Math.log10(PART.absorbed + 1) * CONDENSE.coreGrow);
  } else {
    PART.coreR = 1.8;
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

  const cx = window.CANVAS_CX || 0;
  const cy = window.CANVAS_CY || 0;
  const W = window.CANVAS_W || 400;
  const H = window.CANVAS_H || 700;

  for (let i = PART.passing.length - 1; i >= 0; i--) {
    const o = PART.passing[i];

    // Комета гибнет у звезды
    if (o.type === 'comet' && S.starType && !o.dying) {
      const d = Math.sqrt((o.x - cx) ** 2 + (o.y - cy) ** 2);
      if (d < 90) {
        o.dying = true;
        o.dieAt = now;
        if (Array.isArray(S.explosions)) {
          S.explosions.push({
            x: o.x, y: o.y, type: 'destroy',
            startAt: now, endAt: now + 800, size: 25,
          });
        }
        if (typeof toast === 'function') {
          toast('☄️ Комета испарилась', 'Разрушена жаром звезды');
        }
        continue;
      }
    }

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

    if (o.x < -150 || o.x > W + 150 || o.y < -150 || o.y > H + 150) {
      PART.passing.splice(i, 1);
    }
  }
}

function spawnPassing() {
  const W = window.CANVAS_W || 400;
  const H = window.CANVAS_H || 700;
  const isComet = Math.random() < 0.6;
  const size = 0.7 + Math.random() * 1.8;
  const tailLen = Math.round(8 + size * 9);
  const side = Math.floor(Math.random() * 4);
  let x, y, vx, vy;
  const speed = 50 + Math.random() * 90;
  if (side === 0) { x = Math.random() * W; y = -50; vx = (Math.random() - 0.5) * 40; vy = speed; }
  else if (side === 1) { x = W + 50; y = Math.random() * H; vx = -speed; vy = (Math.random() - 0.5) * 40; }
  else if (side === 2) { x = Math.random() * W; y = H + 50; vx = (Math.random() - 0.5) * 40; vy = -speed; }
  else { x = -50; y = Math.random() * H; vx = speed; vy = (Math.random() - 0.5) * 40; }
  PART.passing.push({
    x, y, vx, vy,
    type: isComet ? 'comet' : 'ship',
    size: size, tailLen: tailLen,
    alpha: 1, age: 0, trail: [],
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
  const isDisk = S.stage === 'condense' || S.stage === 'protostar';

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // ─── ОРЕОЛ ЦЕНТРА ───
  if (!hasStar) {
    const pulse = 1 + PART.corePulse * 0.5;

    if (isDisk) {
      // Фаза II — яркая внутренняя корона
      const haloR = 22 * z;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR);
      g.addColorStop(0, 'rgba(230, 210, 255, 0.55)');
      g.addColorStop(0.3, 'rgba(180, 150, 240, 0.28)');
      g.addColorStop(0.7, 'rgba(130, 100, 210, 0.08)');
      g.addColorStop(1, 'rgba(80, 60, 150, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Фаза I — маленький ореол
      const haloR = 10 * z;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR);
      g.addColorStop(0, 'rgba(200, 180, 255, 0.25)');
      g.addColorStop(0.6, 'rgba(140, 120, 220, 0.08)');
      g.addColorStop(1, 'rgba(80, 60, 150, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Точка центра — как частица, чуть ярче
    const R = PART.coreR * pulse * z;
    ctx.fillStyle = 'rgba(240, 235, 255, 0.95)';
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
  }

  // ─── ЧАСТИЦЫ ───
  const sizeFactor = Math.max(0.7, z);
  for (const p of PART.particles) {
    const sx = cx + p.x * z;
    const sy = cy + p.y * z;

    const dist = Math.sqrt(p.x * p.x + p.y * p.y);
    const heat = Math.max(0, 1 - dist / 120);
    const hueShift = -heat * 45;
    const brightBoost = 1 + heat * 1.3;

    const tw = 0.7 + 0.3 * Math.sin(p.twinkle + t * 2);
    ctx.globalAlpha = Math.min(1, p.bright * tw * 0.85 * visibility * brightBoost);
    ctx.fillStyle = 'hsl(' + (p.hue + hueShift) + ', ' +
                    (65 + heat * 25) + '%, ' + (68 + heat * 18) + '%)';
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
    const alpha = o.alpha != null ? o.alpha : 1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < o.trail.length; i++) {
      const seg = o.trail[i];
      const life = i / o.trail.length;
      ctx.globalAlpha = life * 0.7 * alpha;
      const size = (1 + life * 2.5) * o.size;
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

    ctx.globalAlpha = 0.95 * alpha;
    ctx.fillStyle = o.type === 'comet' ? '#e8f6ff' : '#ffeec8';
    ctx.beginPath();
    ctx.arc(o.x, o.y, 2 * o.size * z, 0, Math.PI * 2);
    ctx.fill();

    const halo = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, 12 * o.size * z);
    if (o.type === 'comet') {
      halo.addColorStop(0, 'rgba(150, 220, 255, 0.5)');
      halo.addColorStop(1, 'rgba(100, 150, 255, 0)');
    } else {
      halo.addColorStop(0, 'rgba(255, 220, 150, 0.5)');
      halo.addColorStop(1, 'rgba(200, 150, 80, 0)');
    }
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(o.x, o.y, 12 * o.size * z, 0, Math.PI * 2);
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
