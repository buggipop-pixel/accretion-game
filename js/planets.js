// ═══════════════════════════════════════════════════════════════
//  PLANETS.JS — планеты, орбиты, столкновения, формирование
// ═══════════════════════════════════════════════════════════════

const VIEW_COS = 0.5;

// ─── ДОБАВЛЕНИЕ ПЛАНЕТЫ ─────────────────────────────────────────
function addPlanet(type) {
  if (S.planets.length >= 8) return false;
  const idx = S.planets.length;
  S.planets.push({
    type: type,
    angle: Math.random() * Math.PI * 2,
    speed: 0.10 / Math.sqrt(idx + 1),       // дальние медленнее
    baseOrbitR: 90 + idx * 32,
    orbitR: 90 + idx * 32,
    driftPhase: Math.random() * Math.PI * 2,
    rotation: Math.random() * Math.PI * 2,  // для текстуры
    seed: Math.random() * 1e6,
    forming: false,
    formUntil: 0,
  });
  return true;
}

// ─── ОБНОВЛЕНИЕ ОРБИТ И СТОЛКНОВЕНИЙ ────────────────────────────
function updatePlanets(dt) {
  if (!S.systemType) return;
  const now = Date.now();

  // Дрейф орбит
  for (const p of S.planets) {
    if (p.forming) {
      if (now >= p.formUntil) {
        p.forming = false;
        if (typeof toast === 'function') {
          toast('🪐 Планета сформирована', PLANET_TYPES[p.type].name);
        }
      }
      continue;
    }
    p.orbitR = p.baseOrbitR * (1 + 0.12 * Math.sin(
      now * 0.00002 + p.driftPhase));
    p.rotation += dt * 0.5;
  }

  // Столкновения
  checkCollisions();
}

function checkCollisions() {
  const st = SYSTEM_TYPES[S.systemType];
  if (!st.collisionPerPlanet) return;

  // Счётчик времени
  if (!S.collisionTimer) S.collisionTimer = 0;
  S.collisionTimer += 1 / 60;
  if (S.collisionTimer < CFG.collisionInterval) return;
  S.collisionTimer = 0;

  const active = S.planets.filter(p => !p.forming);
  if (active.length < 3) return;

  const chance = st.collisionPerPlanet * active.length;
  if (Math.random() > chance) return;

  // Ищем две ближайшие планеты
  const sorted = active.slice().sort((a, b) => a.orbitR - b.orbitR);
  let pair = null;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (Math.abs(sorted[i + 1].orbitR - sorted[i].orbitR) < 35) {
      pair = [sorted[i], sorted[i + 1]];
      break;
    }
  }
  if (!pair) return;

  const [a, b] = pair;
  const aPt = PLANET_TYPES[a.type];
  const bPt = PLANET_TYPES[b.type];

  if (Math.random() < 0.5) {
    // Разрушение
    const refund = Math.floor((aPt.rate + bPt.rate) * 600);
    S.dust += refund;
    S.dustTotal += refund;
    S.planets = S.planets.filter(p => p !== a && p !== b);
    if (typeof showEventBanner === 'function') {
      showEventBanner('danger', '💥 Столкновение',
        aPt.name + ' и ' + bPt.name + ' разрушены. +' + fmt(refund) + ' пыли');
    }
    if (typeof toast === 'function') {
      toast('💥 Столкновение', '+' + fmt(refund) + ' пыли');
    }
  } else {
    // Слияние → формирование
    const newType = aPt.rate > bPt.rate ? a.type : b.type;
    S.planets = S.planets.filter(p => p !== a && p !== b);
    const idx = S.planets.length;
    S.planets.push({
      type: newType,
      angle: Math.random() * Math.PI * 2,
      speed: 0.10 / Math.sqrt(idx + 1),
      baseOrbitR: 90 + idx * 32,
      orbitR: 90 + idx * 32,
      driftPhase: Math.random() * Math.PI * 2,
      rotation: 0,
      seed: Math.random() * 1e6,
      forming: true,
      formUntil: Date.now() + CFG.formationDuration * 1000,
    });
    if (typeof showEventBanner === 'function') {
      showEventBanner('info', '🪐 Слияние',
        aPt.name + ' + ' + bPt.name + ' → формируется ' + PLANET_TYPES[newType].name);
    }
  }
}

// ─── РИСОВАНИЕ ──────────────────────────────────────────────────
function drawPlanets(ctx, time) {
  if (S.planets.length === 0) return;
  const cx = window.CANVAS_CX || 0;
  const cy = window.CANVAS_CY || 0;
  const t = time / 1000;
  const starHue = S.starType ? STAR_TYPES[S.starType].color : 260;

  // Орбиты
  ctx.save();
  for (const p of S.planets) {
    if (p.forming) continue;
    ctx.strokeStyle = 'hsla(' + starHue + ', 50%, 60%, 0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, p.orbitR, p.orbitR * VIEW_COS, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // Сортировка по глубине (сначала дальние)
  const sorted = S.planets.map(p => {
    const angle = p.angle + t * p.speed;
    const sinA = Math.sin(angle);
    const x = cx + Math.cos(angle) * p.orbitR;
    const y = cy + sinA * p.orbitR * VIEW_COS;
    return { p, x, y, depth: sinA };
  }).sort((a, b) => a.depth - b.depth);

  for (const item of sorted) {
    const p = item.p;
    const x = item.x;
    const y = item.y;
    const depth = item.depth;
    const behind = depth < 0;
    const scale = 1 + depth * 0.15;
    const alpha = behind ? 0.7 : 1;

    if (p.forming) {
      drawFormingPlanet(ctx, x, y, t, p);
      continue;
    }

    const pt = PLANET_TYPES[p.type];
    const baseSize = 5 * (pt.size || 1) * scale;
    drawTexturedPlanet(ctx, x, y, baseSize, p, alpha, t);
  }
}

// ─── ТЕКСТУРИРОВАННАЯ ПЛАНЕТА ───────────────────────────────────
function drawTexturedPlanet(ctx, x, y, size, p, alpha, t) {
  const pt = PLANET_TYPES[p.type];
  const cx = window.CANVAS_CX || 0;
  const cy = window.CANVAS_CY || 0;

  // Атмосферное свечение
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha * 0.5;
  const glowGrad = ctx.createRadialGradient(x, y, size * 0.7, x, y, size * 2.8);
  glowGrad.addColorStop(0, pt.color);
  glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(x, y, size * 2.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Тело планеты
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.clip();

  // Базовый градиент
  const baseGrad = ctx.createRadialGradient(
    x - size * 0.3, y - size * 0.3, 0,
    x, y, size
  );
  baseGrad.addColorStop(0, lightenColor(pt.color, 0.4));
  baseGrad.addColorStop(0.7, pt.color);
  baseGrad.addColorStop(1, darkenColor(pt.color, 0.4));
  ctx.fillStyle = baseGrad;
  ctx.fillRect(x - size, y - size, size * 2, size * 2);

  // Процедурная текстура
  drawPlanetTexture(ctx, x, y, size, p, pt);

  // Тень от звезды (тёмная сторона)
  const shadowAngle = Math.atan2(y - cy, x - cx) - Math.PI;
  const shadowGrad = ctx.createRadialGradient(
    x + Math.cos(shadowAngle) * size * 1.5,
    y + Math.sin(shadowAngle) * size * 1.5,
    0,
    x + Math.cos(shadowAngle) * size * 1.5,
    y + Math.sin(shadowAngle) * size * 1.5,
    size * 2
  );
  shadowGrad.addColorStop(0, 'rgba(0,0,0,0.75)');
  shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shadowGrad;
  ctx.fillRect(x - size, y - size, size * 2, size * 2);

  ctx.restore();

  // Кольца для газовых гигантов
  if (p.type === 'gasGiant') {
    drawRings(ctx, x, y, size, alpha);
  }
}

// ─── ТЕКСТУРЫ ───────────────────────────────────────────────────
function drawPlanetTexture(ctx, x, y, size, p, pt) {
  const seed = p.seed;
  const rot = p.rotation || 0;

  ctx.save();
  ctx.globalAlpha = 0.4;

  if (p.type === 'rocky' || p.type === 'superEarth') {
    // Кратеры и пятна
    for (let i = 0; i < 12; i++) {
      const a = hash(seed + i * 3.7) * Math.PI * 2;
      const r = hash(seed + i * 5.1) * size * 0.85;
      const cr = 1 + hash(seed + i * 7.3) * (size * 0.18);
      const px = x + Math.cos(a + rot * 0.3) * r;
      const py = y + Math.sin(a + rot * 0.3) * r;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.arc(px, py, cr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (p.type === 'gasGiant' || p.type === 'iceGiant') {
    // Горизонтальные полосы
    const stripes = 6;
    for (let i = 0; i < stripes; i++) {
      const sy = y - size + (i + 0.5) * (size * 2 / stripes);
      const sh = (size * 2 / stripes) * 0.5;
      const hueShift = hash(seed + i * 11.3);
      ctx.fillStyle = p.type === 'gasGiant'
        ? `hsla(${35 + hueShift * 15}, 60%, ${50 + hueShift * 20}%, 0.6)`
        : `hsla(${200 + hueShift * 20}, 70%, ${65 + hueShift * 15}%, 0.55)`;
      ctx.beginPath();
      ctx.ellipse(x + Math.sin(rot * 0.5 + i) * 2, sy, size, sh, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (p.type === 'lava') {
    // Раскалённые трещины
    const pulse = 0.7 + 0.3 * Math.sin(Date.now() * 0.003 + seed);
    ctx.globalAlpha = 0.7;
    for (let i = 0; i < 8; i++) {
      const a = hash(seed + i * 13.7) * Math.PI * 2;
      const r = hash(seed + i * 17.1) * size * 0.8;
      const px = x + Math.cos(a + rot * 0.2) * r;
      const py = y + Math.sin(a + rot * 0.2) * r;
      const gr = ctx.createRadialGradient(px, py, 0, px, py, size * 0.25);
      gr.addColorStop(0, `rgba(255, 200, 60, ${pulse})`);
      gr.addColorStop(0.5, `rgba(255, 100, 20, ${pulse * 0.7})`);
      gr.addColorStop(1, 'rgba(200, 40, 0, 0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(px, py, size * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

// ─── КОЛЬЦА ─────────────────────────────────────────────────────
function drawRings(ctx, x, y, size, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(1, 0.32);
  ctx.strokeStyle = 'rgba(212, 167, 106, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, size * 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 224, 160, 0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, size * 2.4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ─── ФОРМИРУЮЩАЯСЯ ПЛАНЕТА ───────────────────────────────────────
function drawFormingPlanet(ctx, x, y, t, p) {
  const remain = Math.max(0, (p.formUntil - Date.now()) / 1000);
  const total = CFG.formationDuration;
  const progress = 1 - remain / total;
  const pulse = 1 + 0.2 * Math.sin(t * 6);

  ctx.save();
  // Золотое свечение
  const g = ctx.createRadialGradient(x, y, 0, x, y, 20 * pulse);
  g.addColorStop(0, 'rgba(255, 220, 150, 0.9)');
  g.addColorStop(0.5, 'rgba(255, 180, 80, 0.4)');
  g.addColorStop(1, 'rgba(255, 150, 50, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, 20 * pulse, 0, Math.PI * 2);
  ctx.fill();

  // Прогресс-кольцо
  ctx.strokeStyle = 'rgba(255, 220, 150, 0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
  ctx.stroke();

  // Внутренняя пунктирная окружность
  ctx.strokeStyle = 'rgba(255, 220, 150, 0.4)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore();
}

// ─── УТИЛИТЫ ЦВЕТА ──────────────────────────────────────────────
function hexToRgb(hex) {
  const m = hex.match(/^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  return m ? {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  } : { r: 128, g: 128, b: 128 };
}

function lightenColor(hex, amt) {
  const c = hexToRgb(hex);
  return 'rgb(' + Math.min(255, c.r + amt * 255) + ',' +
    Math.min(255, c.g + amt * 255) + ',' +
    Math.min(255, c.b + amt * 255) + ')';
}

function darkenColor(hex, amt) {
  const c = hexToRgb(hex);
  return 'rgb(' + Math.max(0, c.r - amt * 255) + ',' +
    Math.max(0, c.g - amt * 255) + ',' +
    Math.max(0, c.b - amt * 255) + ')';
}

function hash(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

window.addPlanet = addPlanet;
window.updatePlanets = updatePlanets;
window.drawPlanets = drawPlanets;
