// ═══════════════════════════════════════════════════════════════
//  PARTICLES.JS — облако пыли, drag-сбор, комки, ядро
//  Работает только на фазах I–III (до выбора звезды)
// ═══════════════════════════════════════════════════════════════

// ─── СОСТОЯНИЕ ──────────────────────────────────────────────────
const PART = {
  particles: [],      // обычные частицы
  clusters: [],       // крупные комки
  coreR: 0,           // радиус ядра (растёт с dustTotal)
  corePulse: 0,       // анимация пульса при втягивании комка
  dragX: 0,           // позиция касания
  dragY: 0,
  dragActive: false,
  tutorialShown: false,
  tutorialTime: 0,
  lastSpawn: 0,
};

const PART_COUNT = 400;
const TOUCH_RADIUS = 90;      // радиус притяжения
const MERGE_THRESHOLD = 15;   // сколько частиц нужно для слияния
const CLUSTER_INIT_R = 4;     // стартовый радиус комка

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
    seed: seed || Math.random() * 1e6,
  };
}

function initParticles() {
  PART.particles = [];
  for (let i = 0; i < PART_COUNT; i++) {
    PART.particles.push(makeParticle(i * 1.7));
  }
  PART.clusters = [];
  PART.tutorialShown = false;
  PART.tutorialTime = 0;
}

function respawnParticle() {
  // Спавн новой частицы на краю экрана
  const angle = Math.random() * Math.PI * 2;
  const dist = 280 + Math.random() * 60;
  PART.particles.push({
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist * 0.75,
    vx: 0,
    vy: 0,
    r: 0.5 + Math.random() * 1.8,
    hue: Math.random() < 0.7 ? 215 + Math.random() * 50 : 15 + Math.random() * 35,
    bright: 0.4 + Math.random() * 0.6,
    twinkle: Math.random() * Math.PI * 2,
    seed: Math.random() * 1e6,
  });
}

// ─── ПРИТЯЖЕНИЕ К ПАЛЬЦУ ────────────────────────────────────────
function updateParticles(dt, time) {
  // Только на ранних фазах
  if (S.starType) return;

  const cx = window.CANVAS_CX || 0;
  const cy = window.CANVAS_CY || 0;
  const touchX = PART.dragX - cx;
  const touchY = (PART.dragY - cy) / 0.75; // компенсация сжатия по Y

  // Ядро растёт с общим количеством пыли
  PART.coreR = 4 + Math.min(30, Math.log10(S.dustTotal + 10) * 8);
  PART.corePulse *= 0.92;

  // Обновляем частицы
  for (let i = PART.particles.length - 1; i >= 0; i--) {
    const p = PART.particles[i];
    p.twinkle += dt * 2;

    // Притяжение к пальцу
    if (PART.dragActive) {
      const dx = touchX - p.x;
      const dy = touchY - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < TOUCH_RADIUS) {
        const force = (1 - dist / TOUCH_RADIUS) * 800;
        p.vx += (dx / (dist + 1)) * force * dt;
        p.vy += (dy / (dist + 1)) * force * dt;
      }
    }

    // Притяжение к ядру (слабое, для естественного движения)
    const toCoreX = -p.x;
    const toCoreY = -p.y;
    const coreDist = Math.sqrt(toCoreX * toCoreX + toCoreY * toCoreY);
    if (coreDist > 20) {
      const pull = 3 / (coreDist + 50);
      p.vx += toCoreX * pull * dt;
      p.vy += toCoreY * pull * dt;
    }

    // Затухание скорости
    p.vx *= 0.94;
    p.vy *= 0.94;

    // Движение
    p.x += p.vx * dt * 60;
    p.y += p.vy * dt * 60;

    // Не вылетать слишком далеко
    const r = Math.sqrt(p.x * p.x + p.y * p.y);
    if (r > 400) {
      p.x = (p.x / r) * 400;
      p.y = (p.y / r) * 400;
    }
  }

  // Проверяем слияние: считаем частицы в радиусе 40 от пальца
  if (PART.dragActive) {
    const nearby = [];
    for (let i = 0; i < PART.particles.length; i++) {
      const p = PART.particles[i];
      const dx = p.x - touchX;
      const dy = p.y - touchY;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 35) nearby.push(i);
    }
    if (nearby.length >= MERGE_THRESHOLD) {
      // Удаляем эти частицы, создаём комок в центре
      let sumX = 0, sumY = 0, sumHue = 0;
      // Удаляем с конца, чтобы индексы не съезжали
      nearby.sort((a, b) => b - a);
      for (const idx of nearby) {
        sumX += PART.particles[idx].x;
        sumY += PART.particles[idx].y;
        sumHue += PART.particles[idx].hue;
        PART.particles.splice(idx, 1);
      }
      const n = nearby.length;
      PART.clusters.push({
        x: sumX / n,
        y: sumY / n,
        vx: 0,
        vy: 0,
        r: CLUSTER_INIT_R + n * 0.4,
        mass: n,
        hue: sumHue / n,
        pulse: 0,
        spawnTime: performance.now(),
      });
      // Спавним новые частицы вместо удалённых
      for (let i = 0; i < n; i++) respawnParticle();
    }
  }

  // Обновляем комки
  for (let i = PART.clusters.length - 1; i >= 0; i--) {
    const c = PART.clusters[i];
    c.pulse += dt * 4;

    // Притяжение к ядру (сильное, спиральное)
    const dx = -c.x;
    const dy = -c.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 5) {
      const pull = 60 / (d + 30);
      c.vx += (dx / (d + 1)) * pull * dt;
      c.vy += (dy / (d + 1)) * pull * dt;
      // Лёгкое вращение вокруг центра
      c.vx += -dy * 0.15 * dt;
      c.vy += dx * 0.15 * dt;
    }
    c.vx *= 0.97;
    c.vy *= 0.97;
    c.x += c.vx * dt * 60;
    c.y += c.vy * dt * 60;

    // Достигли ядра — втягиваем
    if (d < 15) {
      const gain = 30 + c.mass * 8;
      S.dust += gain;
      S.dustTotal += gain;
      PART.corePulse = 1;
      PART.clusters.splice(i, 1);
    }
  }

  // Обучение
  if (!PART.tutorialShown) {
    PART.tutorialTime += dt;
    if (PART.tutorialTime > 30 || S.dustTotal > 100) {
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

  // Ядро (будущая звезда)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const pulse = 1 + PART.corePulse * 0.6;
  const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, PART.coreR * 5 * pulse);
  coreGrad.addColorStop(0, 'rgba(255, 240, 200, 0.9)');
  coreGrad.addColorStop(0.3, 'rgba(255, 200, 120, 0.5)');
  coreGrad.addColorStop(0.7, 'rgba(200, 140, 220, 0.2)');
  coreGrad.addColorStop(1, 'rgba(120, 80, 200, 0)');
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, PART.coreR * 5 * pulse, 0, Math.PI * 2);
  ctx.fill();
  // Точка ядра
  ctx.fillStyle = 'rgba(255, 250, 220, 1)';
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

  // Комки
  for (const c of PART.clusters) {
    const sx = cx + c.x;
    const sy = cy + c.y * 0.75;
    const pulse = 1 + 0.15 * Math.sin(c.pulse);
    const R = c.r * pulse;

    // Свечение комка
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R * 3);
    g.addColorStop(0, `hsla(${c.hue + 30}, 100%, 85%, 0.9)`);
    g.addColorStop(0.4, `hsla(${c.hue}, 90%, 65%, 0.5)`);
    g.addColorStop(1, `hsla(${c.hue - 30}, 80%, 50%, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, R * 3, 0, Math.PI * 2);
    ctx.fill();

    // Ядро комка
    ctx.fillStyle = `hsl(${c.hue + 30}, 100%, 92%)`;
    ctx.beginPath();
    ctx.arc(sx, sy, R, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Радиус притяжения пальца
  if (PART.dragActive) {
    ctx.save();
    ctx.globalAlpha = 0.15;
    const grad = ctx.createRadialGradient(PART.dragX, PART.dragY, 0,
                                          PART.dragX, PART.dragY, TOUCH_RADIUS);
    grad.addColorStop(0, 'rgba(185, 168, 255, 0.6)');
    grad.addColorStop(1, 'rgba(185, 168, 255, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(PART.dragX, PART.dragY, TOUCH_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Обучение
  if (!PART.tutorialShown && S.stage === 'cloud') {
    ctx.save();
    const alpha = Math.min(1, PART.tutorialTime / 1.5);
    ctx.globalAlpha = alpha * 0.85;
    ctx.fillStyle = '#b9a8ff';
    ctx.font = 'bold 16px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Проведи пальцем — собери пыль', cx, cy + 200);
    ctx.font = '13px -apple-system, sans-serif';
    ctx.globalAlpha = alpha * 0.6;
    ctx.fillText('Собери 15 частиц вместе → получишь комок', cx, cy + 222);
    ctx.restore();
  }
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
