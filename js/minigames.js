// ═══════════════════════════════════════════════════════════════
//  MINIGAMES.JS — три мини-игры на переходах фаз
//  1. mass     — раскрути вихрь, собери всю пыль
//  2. ignite   — 30 секунд держи топливо
//  3. accretion — сталкивай обломки
// ═══════════════════════════════════════════════════════════════

const MG = {
  type: null,
  startAt: 0,
  onComplete: null,

  // Общее
  progress: 0,
  dragX: 0, dragY: 0, dragActive: false,
  trail: [],

  // mass
  particles: [],
  capturedCount: 0,
  finishAt: 0,

  // ignite
  power: 0,
  elapsedSec: 0,
  quality: 0,

  // accretion
  chunks: [],
};

// ─── Параметры ──────────────────────────────────────────────────
const MG_VORTEX = {
  fingerRadius: 140,
  fingerForce: 2400,
  captureRadius: 130,
  orbitDecay: 0.05,
  minOrbitR: 25,
  slowDrift: 12,
  maxDrift: 300,
};

const MG_IGNITE = {
  duration: 30,
  baseDecay: 0.10,        // ★ было 0.05 — в 2 раза быстрее затухает
  decayAccel: 0.15,       // ★ было 0.10 — ускорение затухания
  tapBoost: 0.08,
  tapRadius: 250,
};

// ─── Запуск ─────────────────────────────────────────────────────
function startMinigame(type, onComplete) {
  MG.type = type;
  MG.startAt = performance.now();
  MG.onComplete = onComplete;
  MG.progress = 0;
  MG.dragActive = false;
  MG.trail = [];
  MG.finishAt = 0;

  if (type === 'mass') {
    MG.particles = [];
    MG.capturedCount = 0;
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 160 + Math.random() * 120;
      MG.particles.push({
        x: Math.cos(a) * r,
        y: Math.sin(a) * r * 0.85,
        vx: 0, vy: 0,
        r: 1.6 + Math.random() * 1.8,
        hue: 200 + Math.random() * 60,
        captured: false,
        orbitAngle: 0,
        orbitRadius: 0,
        orbitSpeed: 0,
      });
    }
  } else if (type === 'ignite') {
    MG.power = 0;
    MG.elapsedSec = 0;
    MG.quality = 0;
  } else if (type === 'accretion') {
    MG.chunks = [];
    const types = ['stone', 'ice', 'fire', 'gas'];
    for (let i = 0; i < 8; i++) {
      MG.chunks.push({
        x: (Math.random() * 2 - 1) * 200,
        y: (Math.random() * 2 - 1) * 150,
        vx: (Math.random() - 0.5) * 30,
        vy: (Math.random() - 0.5) * 30,
        r: 12,
        type: types[i % 4],
        level: 1,
      });
    }
  }

  S.activeMinigame = type;
  const modal = document.getElementById('modal');
  if (modal) modal.classList.remove('show');
}

function endMinigame(success) {
  const cb = MG.onComplete;
  MG.type = null;
  S.activeMinigame = null;
  if (cb) cb(success);
}

// ═══════════════════════════════════════════════════════════════
//  ОБНОВЛЕНИЕ
// ═══════════════════════════════════════════════════════════════
function updateMinigame(dt, time) {
  const cx = window.CANVAS_CX || 0;
  const cy = window.CANVAS_CY || 0;
  const elapsed = (performance.now() - MG.startAt) / 1000;

  // Затухание трейла (общее)
  for (let i = MG.trail.length - 1; i >= 0; i--) {
    MG.trail[i].age += dt;
    if (MG.trail[i].age > 0.7) MG.trail.splice(i, 1);
  }

  if (MG.type === 'mass')     updateMass(dt, cx, cy);
  if (MG.type === 'ignite')   updateIgnite(dt, elapsed);
  if (MG.type === 'accretion') updateAccretion(dt, cx, cy);
}

// ─── ВИХРЬ ──────────────────────────────────────────────────────
function updateMass(dt, cx, cy) {
  if (MG.dragActive) {
    MG.trail.push({ x: MG.dragX, y: MG.dragY, age: 0 });
  }

  for (let i = 0; i < MG.particles.length; i++) {
    const p = MG.particles[i];

    // Захваченная частица
    if (p.captured) {
      p.orbitAngle += p.orbitSpeed * dt;
      p.orbitRadius -= p.orbitRadius * MG_VORTEX.orbitDecay * dt;
      if (p.orbitRadius < MG_VORTEX.minOrbitR) {
        p.orbitRadius = MG_VORTEX.minOrbitR;
      }
      p.x = Math.cos(p.orbitAngle) * p.orbitRadius;
      p.y = Math.sin(p.orbitAngle) * p.orbitRadius * 0.85;
      continue;
    }

    // Притяжение к пальцу
    if (MG.dragActive) {
      const tdx = (MG.dragX - cx) - p.x;
      const tdy = (MG.dragY - cy) - p.y;
      const td = Math.hypot(tdx, tdy) || 1;
      if (td < MG_VORTEX.fingerRadius) {
        const f = (1 - td / MG_VORTEX.fingerRadius) * MG_VORTEX.fingerForce;
        p.vx += (tdx / td) * f * dt;
        p.vy += (tdy / td) * f * dt;
      }
    }

    // Слабый дрейф к центру
    const dCenter = Math.hypot(p.x, p.y) || 1;
    if (dCenter < MG_VORTEX.maxDrift) {
      const drift = MG_VORTEX.slowDrift * (1 - dCenter / MG_VORTEX.maxDrift);
      p.vx += (-p.x / dCenter) * drift * dt;
      p.vy += (-p.y / dCenter) * drift * dt;
    }

    p.vx *= 0.94;
    p.vy *= 0.94;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Захват
    const d = Math.hypot(p.x, p.y);
    if (d < MG_VORTEX.captureRadius) {
      p.captured = true;
      p.orbitAngle = Math.atan2(p.y, p.x);
      p.orbitRadius = Math.max(MG_VORTEX.minOrbitR, d);
      const tanSpeed = Math.hypot(p.vx, p.vy);
      p.orbitSpeed = Math.max(1.5, Math.min(5.0, 1.5 + tanSpeed / 100));
    }

    if (d > 400) {
      p.x = (p.x / d) * 400;
      p.y = (p.y / d) * 400;
      p.vx *= 0.5;
      p.vy *= 0.5;
    }
  }

  MG.capturedCount = 0;
  for (let i = 0; i < MG.particles.length; i++) {
    if (MG.particles[i].captured) MG.capturedCount++;
  }
  MG.progress = MG.capturedCount / MG.particles.length;

  if (MG.progress >= 1) {
    if (!MG.finishAt) MG.finishAt = performance.now();
    if (performance.now() - MG.finishAt > 1500) {
      endMinigame(true);
    }
  }
}

// ─── ЗАЖИГАНИЕ (30 сек) ─────────────────────────────────────────
function updateIgnite(dt, elapsed) {
  MG.elapsedSec = elapsed;

  // Затухание растёт со временем
  const decay = MG_IGNITE.baseDecay * (1 + elapsed * MG_IGNITE.decayAccel);
  MG.power = Math.max(0, MG.power - decay * dt);

  MG.progress = MG.power;

  // Финал на 30 секундах
  if (elapsed >= MG_IGNITE.duration) {
    MG.quality = MG.power;
    endMinigame(true);
  }
}

// ─── АККРЕЦИЯ ───────────────────────────────────────────────────
function updateAccretion(dt, cx, cy) {
  const wx = MG.dragActive ? (MG.dragX - cx) : 0;
  const wy = MG.dragActive ? (MG.dragY - cy) : 0;

  for (let i = 0; i < MG.chunks.length; i++) {
    const c = MG.chunks[i];
    if (MG.dragActive) {
      const dx = c.x - wx;
      const dy = c.y - wy;
      const d = Math.hypot(dx, dy) || 1;
      if (d < 80) {
        c.vx += dx / d * 300 * dt;
        c.vy += dy / d * 300 * dt;
      }
    }
    c.vx *= 0.97;
    c.vy *= 0.97;
    c.x += c.vx * dt;
    c.y += c.vy * dt;

    if (Math.abs(c.x) > 260) c.vx *= -0.8;
    if (Math.abs(c.y) > 190) c.vy *= -0.8;
    c.x = Math.max(-260, Math.min(260, c.x));
    c.y = Math.max(-190, Math.min(190, c.y));
  }

  // Слияния
  for (let i = 0; i < MG.chunks.length; i++) {
    for (let j = i + 1; j < MG.chunks.length; j++) {
      const a = MG.chunks[i], b = MG.chunks[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < a.r + b.r) {
        const merged = {
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
          vx: (a.vx + b.vx) / 2,
          vy: (a.vy + b.vy) / 2,
          r: Math.min(40, a.r + b.r * 0.6),
          type: a.type,
          level: a.level + b.level,
        };
        MG.chunks.splice(j, 1);
        MG.chunks.splice(i, 1);
        MG.chunks.push(merged);
        i = -1;
        break;
      }
    }
    if (i < 0) break;
  }

  let maxLevel = 0;
  for (let i = 0; i < MG.chunks.length; i++) {
    if (MG.chunks[i].level > maxLevel) maxLevel = MG.chunks[i].level;
  }
  MG.progress = Math.min(1, maxLevel / 5);
  if (MG.progress >= 1) endMinigame(true);
}

// ═══════════════════════════════════════════════════════════════
//  РИСОВАНИЕ
// ═══════════════════════════════════════════════════════════════
function drawMinigame(ctx, time) {
  const cx = window.CANVAS_CX || 0;
  const cy = window.CANVAS_CY || 0;
  const t = time;

  // Затемнение
  ctx.save();
  ctx.fillStyle = 'rgba(2, 1, 10, 0.60)';
  ctx.fillRect(0, 0, window.CANVAS_W, window.CANVAS_H);
  ctx.restore();

  if (MG.type === 'mass')      drawMass(ctx, cx, cy, t);
  if (MG.type === 'ignite')    drawIgnite(ctx, cx, cy, t);
  if (MG.type === 'accretion') drawAccretion(ctx, cx, cy, t);

  // Кнопка «Пропустить» — вверху справа
  ctx.save();
  ctx.textAlign = 'right';
  ctx.font = '11px -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(139, 127, 212, 0.7)';
  ctx.fillText('Пропустить ▸', window.CANVAS_W - 16, 32);
  ctx.restore();
}

// ─── ВИХРЬ: рисуем ──────────────────────────────────────────────
function drawMass(ctx, cx, cy, t) {
  // Заголовок
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 16px -apple-system, sans-serif';
  ctx.fillStyle = '#e8e2ff';
  ctx.fillText('Создай вихрь', cx, cy - 230);
  ctx.font = '13px -apple-system, sans-serif';
  ctx.fillStyle = MG.progress >= 1 ? '#ffb347' : '#a89ce0';
  ctx.fillText(MG.progress >= 1 ? '★ ГОТОВО' : 'Раскрути пыль вокруг центра',
               cx, cy - 208);
  ctx.restore();

  // Кольцо захвата
  ctx.save();
  ctx.strokeStyle = 'rgba(160, 130, 240, ' + (0.2 + MG.progress * 0.4) + ')';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.arc(cx, cy, MG_VORTEX.captureRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Спиральные линии
  if (MG.capturedCount > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let s = 0; s < 3; s++) {
      const baseAngle = t * 0.8 + (s / 3) * Math.PI * 2;
      ctx.strokeStyle = 'rgba(180, 140, 255, ' + (0.15 + MG.progress * 0.35) + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let rr = MG_VORTEX.minOrbitR; rr < MG_VORTEX.captureRadius; rr += 5) {
        const a = baseAngle + rr * 0.06;
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr * 0.85;
        if (rr === MG_VORTEX.minOrbitR) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // Частицы
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < MG.particles.length; i++) {
    const p = MG.particles[i];
    const sx = cx + p.x;
    const sy = cy + p.y;
    const boost = p.captured ? 1.5 : 1.0;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, p.r * 4 * boost);
    g.addColorStop(0, 'hsla(' + p.hue + ', 90%, 85%, 1)');
    g.addColorStop(0.5, 'hsla(' + p.hue + ', 80%, 65%, 0.5)');
    g.addColorStop(1, 'hsla(' + p.hue + ', 70%, 50%, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, p.r * 4 * boost, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Трейл пальца
  if (MG.trail.length > 1) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i < MG.trail.length; i++) {
      const a = MG.trail[i - 1];
      const b = MG.trail[i];
      const alpha = Math.max(0, 1 - b.age / 0.7);
      ctx.strokeStyle = 'rgba(200, 180, 255, ' + (alpha * 0.8) + ')';
      ctx.lineWidth = 3 * alpha + 1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Центр
  const coreBase = 18 + MG.progress * 26;
  const corePulse = 1 + 0.08 * Math.sin(t * 3);
  const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreBase * corePulse * 3);
  cg.addColorStop(0, 'rgba(255, 240, 200, ' + (0.6 + MG.progress * 0.4) + ')');
  cg.addColorStop(0.4, 'rgba(255, 180, 80, ' + (0.25 + MG.progress * 0.35) + ')');
  cg.addColorStop(1, 'rgba(255, 100, 40, 0)');
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.arc(cx, cy, coreBase * corePulse * 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 250, 220, ' + (0.85 + MG.progress * 0.15) + ')';
  ctx.beginPath();
  ctx.arc(cx, cy, 6 + MG.progress * 8, 0, Math.PI * 2);
  ctx.fill();

  // Подсказка
  if (!MG.dragActive && MG.progress < 0.05) {
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 3);
    ctx.strokeStyle = '#b9a8ff';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    const hintR = 140;
    ctx.beginPath();
    ctx.arc(cx, cy, hintR, -Math.PI * 0.2, Math.PI * 0.9);
    ctx.stroke();
    const endA = Math.PI * 0.9;
    const ex = cx + Math.cos(endA) * hintR;
    const ey = cy + Math.sin(endA) * hintR;
    ctx.beginPath();
    ctx.moveTo(ex - 10, ey - 5);
    ctx.lineTo(ex, ey);
    ctx.lineTo(ex - 5, ey - 12);
    ctx.stroke();
    ctx.restore();
  }

  // Счётчик
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '11px -apple-system, sans-serif';
  ctx.fillStyle = '#8b7fd4';
  ctx.fillText(MG.capturedCount + ' / ' + MG.particles.length + ' частиц',
               cx, cy + 220);
  ctx.restore();
}

// ─── ЗАЖИГАНИЕ: рисуем ──────────────────────────────────────────
function drawIgnite(ctx, cx, cy, t) {
  const left = Math.max(0, MG_IGNITE.duration - (MG.elapsedSec || 0));

    // ★ Прогноз — точная копия того, что будет в финале
  const q = MG.power;   // финальный quality = power в момент 30 сек
  let tier = 'G';
  let tierColor = '#ffcc55';
  if (q >= 0.90)      { tier = 'M'; tierColor = '#ff3030'; }
  else if (q >= 0.70) { tier = 'B'; tierColor = '#5577ff'; }
  else if (q >= 0.45) { tier = 'K'; tierColor = '#ff9944'; }
  else if (q >= 0.25) { tier = 'A'; tierColor = '#ccccff'; }

  // Заголовок
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 16px -apple-system, sans-serif';
  ctx.fillStyle = '#e8e2ff';
  ctx.fillText('Зажги синтез', cx, cy - 230);
  ctx.font = '13px -apple-system, sans-serif';
  ctx.fillStyle = '#a89ce0';
  ctx.fillText('Держи топливо ' + MG_IGNITE.duration + ' секунд', cx, cy - 208);
  ctx.restore();

  // Ядро
  const pulse = 1 + MG.power * 0.5;
  const coreR = (15 + MG.power * 30) * pulse;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 4);
  g.addColorStop(0, 'rgba(255, 240, 200, ' + (0.3 + MG.power * 0.7) + ')');
  g.addColorStop(0.3, 'rgba(255, 180, 80, ' + (0.2 + MG.power * 0.4) + ')');
  g.addColorStop(1, 'rgba(255, 100, 40, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, coreR * 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 250, 220, ' + (0.6 + MG.power * 0.4) + ')';
  ctx.beginPath();
  ctx.arc(cx, cy, coreR * 0.4, 0, Math.PI * 2);
  ctx.fill();

  // Кольцо топлива
  ctx.save();
  ctx.strokeStyle = 'rgba(60, 30, 20, 0.7)';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(cx, cy, 110, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = tierColor;
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, 110, -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * MG.power);
  ctx.stroke();

  // Свечение
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = tierColor;
  ctx.globalAlpha = 0.4 + 0.3 * Math.sin(t * 5);
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(cx, cy, 110, -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * MG.power);
  ctx.stroke();
  ctx.restore();

  // Прогноз звезды
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 28px -apple-system, sans-serif';
  ctx.fillStyle = tierColor;
  ctx.shadowColor = tierColor;
  ctx.shadowBlur = 20;
  ctx.globalAlpha = 0.9;
  ctx.fillText(tier, cx, cy - 130);
  ctx.font = '10px -apple-system, sans-serif';
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#a89ce0';
  ctx.globalAlpha = 0.7;
  ctx.fillText('прогноз звезды', cx, cy - 108);
    // ★ Предупреждение о риске
  const distToBorder = q >= 0.90 ? q - 0.90 :
                       q >= 0.70 ? q - 0.70 :
                       q >= 0.45 ? q - 0.45 : q - 0.25;
  if (distToBorder < 0.05 && q < 0.95) {
    ctx.font = 'bold 10px -apple-system, sans-serif';
    ctx.fillStyle = '#ff8866';
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 8);
    ctx.fillText('⚠ МОЖЕТ СНИЗИТЬСЯ', cx, cy - 92);
  }
  ctx.restore();

  // Таймер
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 20px -apple-system, sans-serif';
  ctx.fillStyle = left < 5 ? '#ff5555' : '#fff';
  ctx.globalAlpha = 0.85;
  ctx.fillText(left.toFixed(1) + 'с', cx, cy + 170);
  ctx.restore();

  // Подсказка
  if (MG.power < 0.1 && (MG.elapsedSec || 0) < 3) {
    ctx.save();
    ctx.font = 'bold 14px -apple-system, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 6);
    ctx.fillText('ТАПАЙ ПО ЦЕНТРУ', cx, cy + 220);
    ctx.restore();
  }
}

// ─── АККРЕЦИЯ: рисуем ───────────────────────────────────────────
function drawAccretion(ctx, cx, cy, t) {
  // Заголовок
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 16px -apple-system, sans-serif';
  ctx.fillStyle = '#e8e2ff';
  ctx.fillText('Направь аккрецию', cx, cy - 230);
  ctx.font = '13px -apple-system, sans-serif';
  ctx.fillStyle = '#a89ce0';
  ctx.fillText('Свайпами сталкивай обломки', cx, cy - 208);
  ctx.restore();

  // Обломки
  for (let i = 0; i < MG.chunks.length; i++) {
    const c = MG.chunks[i];
    const sx = cx + c.x;
    const sy = cy + c.y;
    let col = '#8a7159';
    if (c.type === 'ice') col = '#7ec8e3';
    if (c.type === 'fire') col = '#ff4a22';
    if (c.type === 'gas') col = '#d4a76a';
    const g = ctx.createRadialGradient(sx - c.r * 0.3, sy - c.r * 0.3, 0,
                                        sx, sy, c.r * 1.5);
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, c.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(sx, sy, c.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.level, sx, sy);
  }

  // Прогресс
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '11px -apple-system, sans-serif';
  ctx.fillStyle = '#8b7fd4';
  ctx.fillText(Math.floor(MG.progress * 100) + '% · макс уровень: ' +
               Math.round(MG.progress * 5), cx, cy + 220);
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
//  ВВОД
// ═══════════════════════════════════════════════════════════════
function mgPointerDown(x, y) {
  if (!MG.type) return;

  // Пропустить
  if (y < 50 && x > (window.CANVAS_W || 400) - 120) {
    endMinigame(false);
    return;
  }

  if (MG.type === 'mass') {
    MG.dragActive = true;
    MG.dragX = x;
    MG.dragY = y;
  } else if (MG.type === 'ignite') {
    const cx = window.CANVAS_CX || 0;
    const cy = window.CANVAS_CY || 0;
    if (Math.hypot(x - cx, y - cy) < MG_IGNITE.tapRadius) {
      MG.power = Math.min(1, MG.power + MG_IGNITE.tapBoost);
    }
  } else if (MG.type === 'accretion') {
    MG.dragActive = true;
    MG.dragX = x;
    MG.dragY = y;
  }
}

function mgPointerMove(x, y) {
  if (!MG.type) return;
  if (MG.type === 'mass' || MG.type === 'accretion') {
    MG.dragX = x;
    MG.dragY = y;
  }
}

function mgPointerUp() {
  MG.dragActive = false;
}

// ═══════════════════════════════════════════════════════════════
//  ЭКСПОРТ
// ═══════════════════════════════════════════════════════════════
window.startMinigame = startMinigame;
window.updateMinigame = updateMinigame;
window.drawMinigame = drawMinigame;
window.mgPointerDown = mgPointerDown;
window.mgPointerMove = mgPointerMove;
window.mgPointerUp = mgPointerUp;
window.MG = MG;
