// ═══════════════════════════════════════════════════════════════
//  PARTICLES.JS — облако пыли по всему экрану
//  Медленно стягивается к центру (пассив).
//  Drag ускоряет сбор, но работает ТОЛЬКО до выбора звезды.
// ═══════════════════════════════════════════════════════════════

const PART = {
  particles: [],
  coreR: 1.5,
  corePulse: 0,
  dragX: 0,
  dragY: 0,
  dragActive: false,
};

// ─── БАЛАНС ─────────────────────────────────────────────────────
const PART_COUNT      = 600;
const TOUCH_RADIUS    = 100;
const TOUCH_VELOCITY  = 400;
const ABSORB_RADIUS   = 14;
const DUST_PER_CENTER = 1;   // пыль за поглощение центром (пассив)
const DUST_PER_FINGER = 1;   // пыль за поглощение пальцем (актив)

// Скорость пассивного стягивания — зависит от фазы.
// Чем дальше игрок продвинулся, тем сильнее гравитация будущей звезды.
function pullVelocity() {
  if (S.stage === 'cloud')      return 0.025;
  if (S.stage === 'condense')   return 0.25;
  if (S.stage === 'protostar')  return 0.5;
  return 0.025;
}

// ─── СОЗДАНИЕ ЧАСТИЦЫ ───────────────────────────────────────────
function makeParticleRandom() {
  const W = window.CANVAS_W || 400;
  const H = window.CANVAS_H || 700;
  return {
    x: Math.random() * W,
    y: Math.random() * H,
    r: 0.5 + Math.random() * 1.3,
    hue: Math.random() < 0.72
      ? 210 + Math.random() * 55
      : 15 + Math.random() * 35,
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
    hue: Math.random() < 0.72
      ? 210 + Math.random() * 55
      : 15 + Math.random() * 35,
    bright: 0.35 + Math.random() * 0.55,
    twinkle: Math.random() * Math.PI * 2,
  };
}

function initParticles() {
  PART.particles = [];
  for (let i = 0; i < PART_COUNT; i++) {
    PART.particles.push(makeParticleRandom());
  }
}

// ─── ОБНОВЛЕНИЕ ─────────────────────────────────────────────────
function updateParticles(dt, time) {
  if (S.starType) return; // после звезды drag и частицы отключены

  const cx = window.CANVAS_CX || 0;
  const cy = window.CANVAS_CY || 0;
  const W = window.CANVAS_W || 400;
  const H = window.CANVAS_H || 700;
  const pull = pullVelocity();

  PART.corePulse *= 0.9;

  for (let i = PART.particles.length - 1; i >= 0; i--) {
    const p = PART.particles[i];
    p.twinkle += dt * 2;

    const dx = cx - p.x;
    const dy = cy - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    let vx = (dx / dist) * pull;
    let vy = (dy / dist) * pull;

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

    // Поглощение центром
    const dCenter = Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
    if (dCenter < ABSORB_RADIUS) {
      S.dust += DUST_PER_CENTER;
      S.dustTotal += DUST_PER_CENTER;
      PART.corePulse = 1;
      PART.particles[i] = makeParticleOnEdge();
      continue;
    }

    // Поглощение пальцем
    if (PART.dragActive) {
      const dFinger = Math.sqrt((p.x - PART.dragX) ** 2 + (p.y - PART.dragY) ** 2);
      if (dFinger < ABSORB_RADIUS) {
        S.dust += DUST_PER_FINGER;
        S.dustTotal += DUST_PER_FINGER;
        PART.particles[i] = makeParticleOnEdge();
        continue;
      }
    }

    // Частица улетела далеко — вернуть на край
    if (p.x < -60 || p.x > W + 60 || p.y < -60 || p.y > H + 60) {
      PART.particles[i] = makeParticleOnEdge();
    }
  }
}

// ─── РИСОВАНИЕ ──────────────────────────────────────────────────
function drawParticles(ctx, time) {
  if (S.starType) return;

  const cx = window.CANVAS_CX || 0;
  const cy = window.CANVAS_CY || 0;
  const t = time / 1000;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Очень слабый ореол вокруг центра
  const pulse = 1 + PART.corePulse * 0.5;
  const haloR = 18 * pulse;
  const haloGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR);
  haloGrad.addColorStop(0, 'rgba(160, 140, 230, 0.18)');
  haloGrad.addColorStop(0.5, 'rgba(120, 100, 200, 0.06)');
  haloGrad.addColorStop(1, 'rgba(80, 60, 150, 0)');
  ctx.fillStyle = haloGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
  ctx.fill();

  // Центр — как обычная частица
  ctx.fillStyle = 'rgba(200, 190, 240, 0.9)';
  ctx.beginPath();
  ctx.arc(cx, cy, PART.coreR * pulse, 0, Math.PI * 2);
  ctx.fill();

  // Частицы
  for (const p of PART.particles) {
    const twinkle = 0.7 + 0.3 * Math.sin(p.twinkle + t * 2);
    ctx.globalAlpha = p.bright * twinkle * 0.85;
    ctx.fillStyle = `hsl(${p.hue}, 70%, 70%)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Радиус пальца
  if (PART.dragActive) {
    ctx.save();
    ctx.globalAlpha = 0.10;
    const grad = ctx.createRadialGradient(
      PART.dragX, PART.dragY, 0,
      PART.dragX, PART.dragY, TOUCH_RADIUS
    );
    grad.addColorStop(0, 'rgba(185, 168, 255, 0.7)');
    grad.addColorStop(1, 'rgba(185, 168, 255, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(PART.dragX, PART.dragY, TOUCH_RADIUS, 0, Math.PI * 2);
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
