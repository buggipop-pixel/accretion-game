// ═══════════════════════════════════════════════════════════════
//  PARTICLES.JS — облако пыли и drag-сбор
//  Работает только на фазах I–III (до выбора звезды)
//  Стягивание к центру появится после появления звезды
// ═══════════════════════════════════════════════════════════════

const PART = {
  particles: [],
  coreR: 0,
  corePulse: 0,
  dragX: 0,
  dragY: 0,
  dragActive: false,
  tutorialShown: false,
  tutorialTime: 0,
};

const PART_COUNT = 400;
const TOUCH_RADIUS = 100;   // радиус притяжения к пальцу

// ─── СОЗДАНИЕ ЧАСТИЦЫ ───────────────────────────────────────────
function makeParticle(seed) {
  const angle = Math.random() * Math.PI * 2;
  const dist = 60 + Math.random() * 260;
  return {
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist * 0.75,
    vx: 0,
    vy: 0,
    r: 0.5 + Math.random() * 1.8,
    hue: Math.random() < 0.7 ? 215 + Math.random() * 50 : 15 + Math.random() * 35,
    bright: 0.4 + Math.random() * 0.6,
    twinkle: Math.random() * Math.PI * 2,
  };
}

function initParticles() {
  PART.particles = [];
  for (let i = 0; i < PART_COUNT; i++) {
    PART.particles.push(makeParticle());
  }
  PART.tutorialShown = false;
  PART.tutorialTime = 0;
}

// ─── ОБНОВЛЕНИЕ ─────────────────────────────────────────────────
function updateParticles(dt, time) {
  // После появления звезды пыль больше не нужна
  if (S.starType) return;

  PART.coreR = 4 + Math.min(30, Math.log10(S.dustTotal + 10) * 8);
  PART.corePulse *= 0.92;

  const cx = window.CANVAS_CX || 0;
  const cy = window.CANVAS_CY || 0;
  const touchX = PART.dragX - cx;
  const touchY = (PART.dragY - cy) / 0.75;

  for (const p of PART.particles) {
    p.twinkle += dt * 2;

    // Притяжение только к пальцу (если тянем)
    if (PART.dragActive) {
      const dx = touchX - p.x;
      const dy = touchY - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < TOUCH_RADIUS && dist > 1) {
        const force = (1 - dist / TOUCH_RADIUS) * 1200;
        p.vx += (dx / dist) * force * dt;
        p.vy += (dy / dist) * force * dt;
      }
    }

    // Затухание
    p.vx *= 0.92;
    p.vy *= 0.92;

    // Свободный дрейф — минимальный, чтобы частицы не стояли на месте
    p.vx += (Math.random() - 0.5) * 2 * dt;
    p.vy += (Math.random() - 0.5) * 2 * dt;

    // Движение
    p.x += p.vx * dt * 60;
    p.y += p.vy * dt * 60;

    // Мягкое ограничение области (частицы не вылетают за 420)
    const r = Math.sqrt(p.x * p.x + p.y * p.y);
    if (r > 420) {
      const k = 420 / r;
      p.x *= k;
      p.y *= k;
      p.vx *= 0.5;
      p.vy *= 0.5;
    }
  }

  // Обучение
  if (!PART.tutorialShown) {
    PART.tutorialTime += dt;
    if (PART.tutorialTime > 20 || S.dustTotal > 200) {
      PART.tutorialShown = true;
    }
  }
}

// ─── РИСОВАНИЕ ──────────────────────────────────────────────────
function drawParticles(ctx, time) {
  if (S.starType) return;

  const cx = window.CANVAS_CX || 0;
  const cy = window.CANVAS_CY || 0;
  const t = time / 1000;

  // Ядро (тусклое, только намёк)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const pulse = 1 + PART.corePulse * 0.6;
  const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, PART.coreR * 5 * pulse);
  coreGrad.addColorStop(0, 'rgba(255, 240, 200, 0.7)');
  coreGrad.addColorStop(0.3, 'rgba(255, 200, 120, 0.35)');
  coreGrad.addColorStop(0.7, 'rgba(200, 140, 220, 0.12)');
  coreGrad.addColorStop(1, 'rgba(120, 80, 200, 0)');
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, PART.coreR * 5 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 250, 220, 0.9)';
  ctx.beginPath();
  ctx.arc(cx, cy, PART.coreR * 0.5 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Частицы
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of PART.particles) {
    const sx = cx + p.x;
    const sy = cy + p.y * 0.75;
    const twinkle = 0.7 + 0.3 * Math.sin(p.twinkle + t * 2);
    ctx.globalAlpha = p.bright * twinkle * 0.85;
    ctx.fillStyle = `hsl(${p.hue}, 70%, 70%)`;
    ctx.beginPath();
    ctx.arc(sx, sy, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Радиус притяжения пальца
  if (PART.dragActive) {
    ctx.save();
    const grad = ctx.createRadialGradient(PART.dragX, PART.dragY, 0,
                                          PART.dragX, PART.dragY, TOUCH_RADIUS);
    grad.addColorStop(0, 'rgba(185, 168, 255, 0.25)');
    grad.addColorStop(0.6, 'rgba(185, 168, 255, 0.08)');
    grad.addColorStop(1, 'rgba(185, 168, 255, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(PART.dragX, PART.dragY, TOUCH_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Подсказка (только на фазе I и только пока не собрано 200 пыли)
  if (!PART.tutorialShown && S.stage === 'cloud') {
    ctx.save();
    const alpha = Math.min(1, PART.tutorialTime / 1.2) *
                  (1 - Math.max(0, (PART.tutorialTime - 15) / 5));
    if (alpha > 0.01) {
      ctx.globalAlpha = alpha;
      const hintY = cy + 190;

      // Фон-плашка
      ctx.fillStyle = 'rgba(20, 14, 45, 0.75)';
      ctx.strokeStyle = 'rgba(185, 168, 255, 0.4)';
      ctx.lineWidth = 1;
      const boxW = 320, boxH = 68;
      const boxX = cx - boxW / 2, boxY = hintY - 30;
      roundRect(ctx, boxX, boxY, boxW, boxH, 12);
      ctx.fill();
      ctx.stroke();

      // Текст
      ctx.fillStyle = '#e8e2ff';
      ctx.font = 'bold 15px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Проведи пальцем — собери пыль', cx, hintY - 6);
      ctx.fillStyle = '#a89ce0';
      ctx.font = '12px -apple-system, sans-serif';
      ctx.fillText('Частицы притянутся к точке касания', cx, hintY + 16);
    }
    ctx.restore();
  }
}

// Вспомогательная функция для скруглённого прямоугольника
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - r);
  ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + r);
  ctx.arc(x + r, y + r, r, Math.PI, -Math.PI / 2);
  ctx.closePath();
}

// ─── ОБРАБОТКА DRAG ─────────────────────────────────────────────
function handleParticleDrag(x, y, active) {
  if (S.starType) return;
  PART.dragX = x;
  PART.dragY = y;
  PART.dragActive = active;
}

// ─── ЭКСПОРТ ────────────────────────────────────────────────────
window.initParticles = initParticles;
window.updateParticles = updateParticles;
window.drawParticles = drawParticles;
window.handleParticleDrag = handleParticleDrag;
window.PART = PART;
