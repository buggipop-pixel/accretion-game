// ═══════════════════════════════════════════════════════════════
//  MINIGAMES.JS — три мини-игры
//  1. mass     — раскрути вихрь
//  2. ignite   — 30 секунд держи топливо
//  3. assemble — собери планету из цветных шаров
// ═══════════════════════════════════════════════════════════════

const MG = {
  type: null, startAt: 0, onComplete: null,
  progress: 0, dragX: 0, dragY: 0, dragActive: false, trail: [],
  particles: [], capturedCount: 0, finishAt: 0,
  power: 0, elapsedSec: 0, quality: 0,
  fieldParticles: [], result: null, resultLabel: null,
  sparks: [],
  fieldHalfW: 300, fieldHalfH: 200,
  startDistMin: 150, startDistMax: 220,
};

// ─── Параметры ──────────────────────────────────────────────────
const MG_VORTEX = {
  fingerRadius: 140, fingerForce: 2400, captureRadius: 130,
  orbitDecay: 0.05, minOrbitR: 25, slowDrift: 12, maxDrift: 300,
};

const MG_IGNITE = {
  duration: 30, baseDecay: 0.10, decayAccel: 0.18,
  tapBoost: 0.08, tapRadius: 250,
};

// ═══════════════════════════════════════════════════════════════
//  ПАРАМЕТРЫ СБОРКИ ПЛАНЕТЫ
//  colorsPerType = 4 → всего 16 шаров (по 4 каждого цвета)
//  Это минимум, чтобы собрать tier 3 (2 + 2 = 4)
// ═══════════════════════════════════════════════════════════════
const MG_ASSEMBLE = {
  duration: 30,               // Секунд на игру
  fingerRadius: 170,
  fingerForce: 1000,
  baseRadius: 18,             // Базовый радиус tier 1
  radiusStep: 6,              // +6 px за каждую единицу массы
  minBetweenDist: 120,        // Минимум между шарами при спавне
  mergeDist: 3,               // Зазор для слияния
  finishDelay: 1500,
  colorsPerType: 4,           // ★ 4 шара каждого цвета
};

// Цвета: 🔵 лёд, 🔴 лава, 🟢 камень, 🟡 газ
const ASSEMBLE_TYPES = {
  ice:   { color: '#3b9eff', glow: 'rgba(59,158,255,0.8)', name: 'Лёд',    planet: 'iceGiant' },
  lava:  { color: '#ff2d2d', glow: 'rgba(255,45,45,0.8)',  name: 'Лава',   planet: 'lava' },
  stone: { color: '#00e639', glow: 'rgba(0,230,57,0.8)',   name: 'Камень', planet: 'rocky' },
  gas:   { color: '#ffd633', glow: 'rgba(255,214,51,0.8)', name: 'Газ',    planet: 'gasGiant' },
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
  MG.sparks = [];

  if (type === 'mass') {
    MG.particles = [];
    MG.capturedCount = 0;
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 160 + Math.random() * 120;
      MG.particles.push({
        x: Math.cos(a) * r, y: Math.sin(a) * r * 0.85,
        vx: 0, vy: 0, r: 1.6 + Math.random() * 1.8,
        hue: 200 + Math.random() * 60,
        captured: false, orbitAngle: 0, orbitRadius: 0, orbitSpeed: 0,
      });
    }
  } else if (type === 'ignite') {
    MG.power = 0; MG.elapsedSec = 0; MG.quality = 0;
  } else if (type === 'assemble') {
    const W = window.CANVAS_W || 400;
    const H = window.CANVAS_H || 700;
    MG.fieldHalfW = W / 2 - 25;
    MG.fieldHalfH = H / 2 - 140;
    MG.startDistMin = Math.min(MG.fieldHalfW, MG.fieldHalfH) * 0.40;
    MG.startDistMax = Math.min(MG.fieldHalfW, MG.fieldHalfH) * 0.95;

    MG.fieldParticles = [];
    MG.result = null;
    MG.resultLabel = null;
    MG.elapsedSec = 0;
    MG.finishAt = 0;

    // 4 цвета × 4 шара = 16 шаров
    // Каждый цвет — в своём квадранте поля
    const types = ['ice', 'lava', 'stone', 'gas'];
    const quadrantMap = [
      { sx: -1, sy: -1 },   // лёд — влево-верх
      { sx:  1, sy: -1 },   // лава — вправо-верх
      { sx: -1, sy:  1 },   // камень — влево-низ
      { sx:  1, sy:  1 },   // газ — вправо-низ
    ];

    for (let ti = 0; ti < types.length; ti++) {
      const quad = quadrantMap[ti];
      for (let k = 0; k < MG_ASSEMBLE.colorsPerType; k++) {
        let px = 0, py = 0, placed = false;
        for (let attempt = 0; attempt < 60 && !placed; attempt++) {
          const angle = Math.random() * Math.PI * 2;
          const dist = MG.startDistMin +
            Math.random() * (MG.startDistMax - MG.startDistMin);
          px = quad.sx * MG.fieldHalfW * 0.55 + Math.cos(angle) * dist * 0.35;
          py = quad.sy * MG.fieldHalfH * 0.55 + Math.sin(angle) * dist * 0.35;

          if (Math.abs(px) > MG.fieldHalfW - 35) continue;
          if (Math.abs(py) > MG.fieldHalfH - 35) continue;

          placed = true;
          for (let j = 0; j < MG.fieldParticles.length; j++) {
            const other = MG.fieldParticles[j];
            if (Math.hypot(other.x - px, other.y - py) < MG_ASSEMBLE.minBetweenDist) {
              placed = false; break;
            }
          }
        }

        MG.fieldParticles.push({
          x: px, y: py,
          vx: (Math.random() - 0.5) * 40,
          vy: (Math.random() - 0.5) * 40,
          r: MG_ASSEMBLE.baseRadius,
          colors: [types[ti]],   // массив цветов
          mass: 1,               // масса = сумма tier'ов
          fixed: false,          // финальный (планета)
        });
      }
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

// ─── Обновление ─────────────────────────────────────────────────
function updateMinigame(dt, time) {
  const cx = window.CANVAS_CX || 0, cy = window.CANVAS_CY || 0;
  const elapsed = (performance.now() - MG.startAt) / 1000;

  for (let i = MG.trail.length - 1; i >= 0; i--) {
    MG.trail[i].age += dt;
    if (MG.trail[i].age > 0.7) MG.trail.splice(i, 1);
  }
  for (let i = MG.sparks.length - 1; i >= 0; i--) {
    const s = MG.sparks[i];
    s.age += dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vx *= 0.92;
    s.vy *= 0.92;
    if (s.age > s.life) MG.sparks.splice(i, 1);
  }

  if (MG.type === 'mass')     updateMass(dt, cx, cy);
  if (MG.type === 'ignite')   updateIgnite(dt, elapsed);
  if (MG.type === 'assemble') updateAssemble(dt, elapsed, cx, cy);
}

// ─── Мини-игра 1: Вихрь ─────────────────────────────────────────
function updateMass(dt, cx, cy) {
  if (MG.dragActive) MG.trail.push({ x: MG.dragX, y: MG.dragY, age: 0 });
  for (let i = 0; i < MG.particles.length; i++) {
    const p = MG.particles[i];
    if (p.captured) {
      p.orbitAngle += p.orbitSpeed * dt;
      p.orbitRadius -= p.orbitRadius * MG_VORTEX.orbitDecay * dt;
      if (p.orbitRadius < MG_VORTEX.minOrbitR) p.orbitRadius = MG_VORTEX.minOrbitR;
      p.x = Math.cos(p.orbitAngle) * p.orbitRadius;
      p.y = Math.sin(p.orbitAngle) * p.orbitRadius * 0.85;
      continue;
    }
    if (MG.dragActive) {
      const tdx = (MG.dragX - cx) - p.x, tdy = (MG.dragY - cy) - p.y;
      const td = Math.hypot(tdx, tdy) || 1;
      if (td < MG_VORTEX.fingerRadius) {
        const f = (1 - td / MG_VORTEX.fingerRadius) * MG_VORTEX.fingerForce;
        p.vx += (tdx / td) * f * dt;
        p.vy += (tdy / td) * f * dt;
      }
    }
    const dCenter = Math.hypot(p.x, p.y) || 1;
    if (dCenter < MG_VORTEX.maxDrift) {
      const drift = MG_VORTEX.slowDrift * (1 - dCenter / MG_VORTEX.maxDrift);
      p.vx += (-p.x / dCenter) * drift * dt;
      p.vy += (-p.y / dCenter) * drift * dt;
    }
    p.vx *= 0.94; p.vy *= 0.94;
    p.x += p.vx * dt; p.y += p.vy * dt;
    const d = Math.hypot(p.x, p.y);
    if (d < MG_VORTEX.captureRadius) {
      p.captured = true;
      p.orbitAngle = Math.atan2(p.y, p.x);
      p.orbitRadius = Math.max(MG_VORTEX.minOrbitR, d);
      const tanSpeed = Math.hypot(p.vx, p.vy);
      p.orbitSpeed = Math.max(1.5, Math.min(5.0, 1.5 + tanSpeed / 100));
    }
    if (d > 400) { p.x = (p.x/d)*400; p.y = (p.y/d)*400; p.vx *= 0.5; p.vy *= 0.5; }
  }
  MG.capturedCount = 0;
  for (let i = 0; i < MG.particles.length; i++) {
    if (MG.particles[i].captured) MG.capturedCount++;
  }
  MG.progress = MG.capturedCount / MG.particles.length;
  if (MG.progress >= 1) {
    if (!MG.finishAt) MG.finishAt = performance.now();
    if (performance.now() - MG.finishAt > 1500) endMinigame(true);
  }
}

// ─── Мини-игра 2: Зажигание ─────────────────────────────────────
function updateIgnite(dt, elapsed) {
  MG.elapsedSec = elapsed;
  const decay = MG_IGNITE.baseDecay * (1 + elapsed * MG_IGNITE.decayAccel);
  MG.power = Math.max(0, MG.power - decay * dt);
  MG.progress = MG.power;
  if (elapsed >= MG_IGNITE.duration) {
    MG.quality = MG.power;
    endMinigame(true);
  }
}

// ═══════════════════════════════════════════════════════════════
//  ПРАВИЛА СЛИЯНИЯ — строгие tier'ы
//  mono tier 1 + mono tier 1 (тот же) → mono tier 2 (mass 2)
//  mono tier 2 + mono tier 2 (тот же) → mono tier 3 (mass 4) FIXED
//  mono tier 1 + mono tier 1 (разный) → 2-цветный (mass 2)
//  multi + mono tier 1 (новый цвет)   → multi + 1 (mass +1)
//  mono tier 1 + mono tier 2 / multi  → отскок
// ═══════════════════════════════════════════════════════════════
function updateAssemble(dt, elapsed, cx, cy) {
  MG.elapsedSec = elapsed;

  // Трейл пальца
  if (MG.dragActive && Math.random() < 0.4) {
    MG.sparks.push({
      x: MG.dragX - cx, y: MG.dragY - cy,
      vx: (Math.random() - 0.5) * 30,
      vy: (Math.random() - 0.5) * 30,
      age: 0, life: 0.35,
      trail: true,
    });
  }

  // Притяжение к пальцу
  if (MG.dragActive) {
    const fx = MG.dragX - cx, fy = MG.dragY - cy;
    for (let i = 0; i < MG.fieldParticles.length; i++) {
      const p = MG.fieldParticles[i];
      if (p.fixed) continue;
      const dx = fx - p.x, dy = fy - p.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < MG_ASSEMBLE.fingerRadius) {
        const force = (1 - d / MG_ASSEMBLE.fingerRadius) * MG_ASSEMBLE.fingerForce;
        p.vx += (dx / d) * force * dt;
        p.vy += (dy / d) * force * dt;
      }
    }
  }

  // Движение
  for (let i = 0; i < MG.fieldParticles.length; i++) {
    const p = MG.fieldParticles[i];
    if (p.fixed) continue;
    p.vx *= 0.96; p.vy *= 0.96;
    p.x += p.vx * dt; p.y += p.vy * dt;

    if (Math.abs(p.x) > MG.fieldHalfW) {
      p.x = Math.sign(p.x) * MG.fieldHalfW; p.vx *= -0.7;
    }
    if (Math.abs(p.y) > MG.fieldHalfH) {
      p.y = Math.sign(p.y) * MG.fieldHalfH; p.vy *= -0.7;
    }
  }

  // Столкновения
  for (let i = 0; i < MG.fieldParticles.length; i++) {
    const a = MG.fieldParticles[i];
    if (a.fixed) continue;

    for (let j = i + 1; j < MG.fieldParticles.length; j++) {
      const b = MG.fieldParticles[j];
      if (b.fixed) continue;

      const dx = a.x - b.x, dy = a.y - b.y;
      const d = Math.hypot(dx, dy);
      const minD = a.r + b.r + MG_ASSEMBLE.mergeDist;
      if (d >= minD) continue;

      // ─── Определяем, могут ли они слиться ───
      const aMono = a.colors.length === 1;
      const bMono = b.colors.length === 1;
      let mergeResult = null;

      if (aMono && bMono) {
        // Оба одноцветные
        if (a.colors[0] === b.colors[0]) {
          // Одинаковый цвет: только равные tier'ы (масса)
          if (a.mass === b.mass && a.mass < 4) {
            mergeResult = { colors: [a.colors[0]], mass: a.mass + b.mass };
          }
        } else {
          // Разные цвета: только оба tier 1 → 2-цветный
          if (a.mass === 1 && b.mass === 1) {
            const c1 = a.colors[0], c2 = b.colors[0];
            mergeResult = { colors: [c1, c2], mass: 2 };
          }
        }
      } else if (aMono && !bMono) {
        // mono + multi: mono должна быть tier 1, цвет новый
        if (a.mass === 1 && b.colors.indexOf(a.colors[0]) === -1 &&
            b.colors.length < 4) {
          mergeResult = { colors: b.colors.concat([a.colors[0]]), mass: b.mass + 1 };
        }
      } else if (!aMono && bMono) {
        if (b.mass === 1 && a.colors.indexOf(b.colors[0]) === -1 &&
            a.colors.length < 4) {
          mergeResult = { colors: a.colors.concat([b.colors[0]]), mass: a.mass + 1 };
        }
      }
      // multi + multi — не сливаются

      if (mergeResult) {
        // ─── Слияние ───
        a.x = (a.x + b.x) / 2;
        a.y = (a.y + b.y) / 2;
        a.vx = (a.vx + b.vx) / 2;
        a.vy = (a.vy + b.vy) / 2;
        a.colors = mergeResult.colors;
        a.mass = mergeResult.mass;
        a.r = MG_ASSEMBLE.baseRadius + (a.mass - 1) * MG_ASSEMBLE.radiusStep;

        MG.fieldParticles.splice(j, 1);
        j--;

        // Искры
        for (let s = 0; s < 12; s++) {
          const sa = Math.random() * Math.PI * 2;
          const ss = 60 + Math.random() * 120;
          MG.sparks.push({
            x: a.x, y: a.y,
            vx: Math.cos(sa) * ss,
            vy: Math.sin(sa) * ss,
            age: 0, life: 0.6,
          });
        }

        // ─── Проверка финала ───
        const colorCount = a.colors.length;
        if (colorCount === 1 && a.mass >= 4) {
          // mono tier 3 → планета
          a.fixed = true; a.vx = 0; a.vy = 0;
          if (!MG.result) {
            MG.result = ASSEMBLE_TYPES[a.colors[0]].planet;
            MG.resultLabel = ASSEMBLE_TYPES[a.colors[0]].name;
            MG.finishAt = performance.now();
          }
        } else if (colorCount >= 4) {
          // 4 цвета = Земля
          a.fixed = true; a.vx = 0; a.vy = 0;
          if (!MG.result) {
            MG.result = 'superEarth';
            MG.resultLabel = 'Земля';
            MG.finishAt = performance.now();
          }
        }
      } else {
        // ─── Отскок ───
        if (d > 0.001) {
          const nx = dx / d, ny = dy / d;
          const overlap = minD - d;
          a.x += nx * overlap * 0.5; a.y += ny * overlap * 0.5;
          b.x -= nx * overlap * 0.5; b.y -= ny * overlap * 0.5;
          const avx = a.vx, avy = a.vy;
          a.vx = b.vx * 0.7; a.vy = b.vy * 0.7;
          b.vx = avx * 0.7; b.vy = avy * 0.7;
        }
      }
    }
  }

  MG.progress = MG.result ? 1 : Math.min(0.95, elapsed / MG_ASSEMBLE.duration);
  if (MG.finishAt && performance.now() - MG.finishAt > MG_ASSEMBLE.finishDelay) {
    finishAssemble(); return;
  }
  if (elapsed >= MG_ASSEMBLE.duration) finishAssemble();
}

function finishAssemble() {
  if (!MG.result) {
    MG.result = 'superEarth';
    MG.quality = 0.5;
  } else {
    MG.quality = 1.0;
  }
  endMinigame(true);
}

// ═══════════════════════════════════════════════════════════════
//  РИСОВАНИЕ
// ═══════════════════════════════════════════════════════════════
function drawMinigame(ctx, time) {
  const cx = window.CANVAS_CX || 0, cy = window.CANVAS_CY || 0;
  const t = time;

  ctx.save();
  ctx.fillStyle = 'rgba(2, 1, 10, 0.65)';
  ctx.fillRect(0, 0, window.CANVAS_W, window.CANVAS_H);
  ctx.restore();

  if (MG.type === 'mass')     drawMass(ctx, cx, cy, t);
  if (MG.type === 'ignite')   drawIgnite(ctx, cx, cy, t);
  if (MG.type === 'assemble') drawAssemble(ctx, cx, cy, t);

  ctx.save();
  ctx.textAlign = 'right';
  ctx.font = '11px -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(139, 127, 212, 0.7)';
  ctx.fillText('Пропустить ▸', window.CANVAS_W - 16, 32);
  ctx.restore();
}

function drawMass(ctx, cx, cy, t) {
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

  ctx.save();
  ctx.strokeStyle = 'rgba(160, 130, 240, ' + (0.2 + MG.progress * 0.4) + ')';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.arc(cx, cy, MG_VORTEX.captureRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < MG.particles.length; i++) {
    const p = MG.particles[i];
    const sx = cx + p.x, sy = cy + p.y;
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

  if (MG.trail.length > 1) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i < MG.trail.length; i++) {
      const a = MG.trail[i - 1], b = MG.trail[i];
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

  const coreBase = 18 + MG.progress * 26;
  const corePulse = 1 + 0.08 * Math.sin(t * 3);
  const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreBase * corePulse * 3);
  cg.addColorStop(0, 'rgba(255,240,200,' + (0.6 + MG.progress * 0.4) + ')');
  cg.addColorStop(0.4, 'rgba(255,180,80,' + (0.25 + MG.progress * 0.35) + ')');
  cg.addColorStop(1, 'rgba(255,100,40,0)');
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.arc(cx, cy, coreBase * corePulse * 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,250,220,' + (0.85 + MG.progress * 0.15) + ')';
  ctx.beginPath();
  ctx.arc(cx, cy, 6 + MG.progress * 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '11px -apple-system, sans-serif';
  ctx.fillStyle = '#8b7fd4';
  ctx.fillText(MG.capturedCount + ' / ' + MG.particles.length + ' частиц',
               cx, cy + 220);
  ctx.restore();
}

function drawIgnite(ctx, cx, cy, t) {
  const left = Math.max(0, MG_IGNITE.duration - (MG.elapsedSec || 0));
  let tier = 'G', tierColor = '#ffcc55';
  if (MG.power >= 0.90) { tier = 'M'; tierColor = '#ff3030'; }
  else if (MG.power >= 0.70) { tier = 'B'; tierColor = '#5577ff'; }
  else if (MG.power >= 0.45) { tier = 'K'; tierColor = '#ff9944'; }
  else if (MG.power >= 0.25) { tier = 'A'; tierColor = '#ccccff'; }

  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 16px -apple-system, sans-serif';
  ctx.fillStyle = '#e8e2ff';
  ctx.fillText('Зажги синтез', cx, cy - 230);
  ctx.font = '13px -apple-system, sans-serif';
  ctx.fillStyle = '#a89ce0';
  ctx.fillText('Держи топливо ' + MG_IGNITE.duration + ' секунд', cx, cy - 208);
  ctx.restore();

  const pulse = 1 + MG.power * 0.5;
  const coreR = (15 + MG.power * 30) * pulse;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 4);
  g.addColorStop(0, 'rgba(255,240,200,' + (0.3 + MG.power * 0.7) + ')');
  g.addColorStop(0.3, 'rgba(255,180,80,' + (0.2 + MG.power * 0.4) + ')');
  g.addColorStop(1, 'rgba(255,100,40,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, coreR * 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,250,220,' + (0.6 + MG.power * 0.4) + ')';
  ctx.beginPath();
  ctx.arc(cx, cy, coreR * 0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.strokeStyle = 'rgba(60,30,20,0.7)';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(cx, cy, 110, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = tierColor;
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, 110, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * MG.power);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 28px -apple-system, sans-serif';
  ctx.fillStyle = tierColor;
  ctx.shadowColor = tierColor;
  ctx.shadowBlur = 20;
  ctx.fillText(tier, cx, cy - 130);
  ctx.shadowBlur = 0;
  ctx.font = '10px -apple-system, sans-serif';
  ctx.fillStyle = '#a89ce0';
  ctx.fillText('прогноз звезды', cx, cy - 108);
  ctx.font = 'bold 20px -apple-system, sans-serif';
  ctx.fillStyle = left < 5 ? '#ff5555' : '#fff';
  ctx.fillText(left.toFixed(1) + 'с', cx, cy + 170);
  ctx.restore();
}

function drawAssemble(ctx, cx, cy, t) {
  const left = Math.max(0, MG_ASSEMBLE.duration - (MG.elapsedSec || 0));

   // ─── Заголовок с подсказкой типов ───
  let hintText = '4 одинаковых → планета · 4 разных → Земля';
  if (typeof getAllowedTypesForSystem === 'function' && S.starType) {
    const types = getAllowedTypesForSystem(S.starType);
    const names = types.map(function(t) {
      return PLANET_TYPES[t] ? PLANET_TYPES[t].name : t;
    });
    if (names.length > 0) {
      hintText = 'Доступно: ' + names.join(' · ');
    }
  }

  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 16px -apple-system, sans-serif';
  ctx.fillStyle = '#e8e2ff';
  ctx.fillText('Собери планету', cx, cy - MG.fieldHalfH - 30);

  ctx.font = 'bold 12px -apple-system, sans-serif';
  ctx.fillStyle = '#7ec8e3';
  ctx.fillText(hintText, cx, cy - MG.fieldHalfH - 10);

  // Прогресс
  const barW = 260, barH = 6;
  const bx = cx - barW / 2, by = cy + MG.fieldHalfH + 20;
  ctx.save();
  ctx.fillStyle = 'rgba(139,127,212,0.2)';
  ctx.fillRect(bx, by, barW, barH);
  ctx.fillStyle = MG.result ? '#ffb347' : '#b9a8ff';
  ctx.fillRect(bx, by, barW * MG.progress, barH);
  ctx.textAlign = 'center';
  ctx.font = '11px -apple-system, sans-serif';
  if (MG.result) {
    const pt = PLANET_TYPES[MG.result] || PLANET_TYPES.rocky;
    ctx.fillStyle = '#5ee0a0';
    ctx.font = 'bold 13px -apple-system, sans-serif';
    ctx.fillText('★ ' + pt.name, cx, by + 22);
  } else {
    ctx.fillStyle = '#8b7fd4';
    ctx.fillText(left.toFixed(1) + 'с · суперземля по умолчанию',
                 cx, by + 22);
  }
  ctx.restore();

  // Легенда
  const legendY = cy + MG.fieldHalfH + 48;
  const legendItems = ['ice', 'lava', 'stone', 'gas'];
  const legendW = 60;
  const totalW = legendItems.length * legendW;
  const startX = cx - totalW / 2 + legendW / 2;

  ctx.save();
  for (let i = 0; i < legendItems.length; i++) {
    const key = legendItems[i];
    const conf = ASSEMBLE_TYPES[key];
    const lx = startX + i * legendW;
    const g = ctx.createRadialGradient(lx, legendY, 0, lx, legendY, 8);
    g.addColorStop(0, conf.color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(lx, legendY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a89ce0';
    ctx.font = '9px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(conf.name, lx, legendY + 16);
  }
  ctx.restore();

  // Частицы
  for (let i = 0; i < MG.fieldParticles.length; i++) {
    drawAssembleParticle(ctx, MG.fieldParticles[i], cx, cy, t, i);
  }

  // Искры
  if (MG.sparks.length > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < MG.sparks.length; i++) {
      const s = MG.sparks[i];
      const alpha = Math.max(0, 1 - s.age / s.life);
      const size = s.trail ? 3 : 2;
      const color = s.trail ? 'rgba(200,180,255,' : 'rgba(255,220,150,';
      ctx.fillStyle = color + (alpha * 0.9) + ')';
      ctx.beginPath();
      ctx.arc(cx + s.x, cy + s.y, size * (1 + (1 - alpha) * 2), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ─── Отрисовка одного шара ──────────────────────────────────────
function drawAssembleParticle(ctx, p, cx, cy, t, idx) {
  const sx = cx + p.x, sy = cy + p.y;
  const colorCount = p.colors.length;

  // Свечение
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const pulse = 1 + 0.06 * Math.sin(t * 4 + idx);
  const glowR = p.r * 2.2 * pulse;
  const gg = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
  if (colorCount === 1) {
    gg.addColorStop(0, ASSEMBLE_TYPES[p.colors[0]].glow);
  } else {
    gg.addColorStop(0, 'rgba(255,255,255,0.4)');
  }
  gg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gg;
  ctx.beginPath();
  ctx.arc(sx, sy, glowR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Тело
  if (colorCount === 1) {
    // Одноцветный — градиент
    const color = ASSEMBLE_TYPES[p.colors[0]].color;
    const g = ctx.createRadialGradient(sx - p.r * 0.3, sy - p.r * 0.3, 0, sx, sy, p.r);
    g.addColorStop(0, lightenHex(color, 0.35));
    g.addColorStop(1, darkenHex(color, 0.3));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, p.r, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Многоцветный — сектора равной доли
    const n = colorCount;
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2 - Math.PI / 2;
      const a1 = ((k + 1) / n) * Math.PI * 2 - Math.PI / 2;
      ctx.fillStyle = ASSEMBLE_TYPES[p.colors[k]].color;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.arc(sx, sy, p.r, a0, a1);
      ctx.closePath();
      ctx.fill();
    }
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, p.r);
    g.addColorStop(0, 'rgba(255,255,255,0.15)');
    g.addColorStop(0.7, 'rgba(0,0,0,0.05)');
    g.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, p.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Обводка
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = p.fixed ? 3 : (p.mass >= 2 ? 2 : 1.5);
  ctx.beginPath();
  ctx.arc(sx, sy, p.r, 0, Math.PI * 2);
  ctx.stroke();

  // ★ Только для финальных
  if (p.fixed) {
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 14;
    ctx.font = 'bold ' + Math.round(p.r * 0.9) + 'px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', sx, sy);
    ctx.restore();
  }

  // ─── Подпись ───
  let label = null;
  let labelColor = '#e8e2ff';

  if (colorCount === 1) {
    // Одноцветный
    label = ASSEMBLE_TYPES[p.colors[0]].name;
  } else if (colorCount >= 4) {
    label = 'Земля';
    labelColor = '#5ee0a0';
  } else {
    // Многоцветный 2–3 цвета: имя первого + кол-во цветов
    label = colorCount + ' цвета: ' + ASSEMBLE_TYPES[p.colors[0]].name + '...';
  }

  if (label) {
    ctx.save();
    ctx.font = 'bold 10px -apple-system, sans-serif';
    const lblW = ctx.measureText(label).width;
    const bgX = sx - lblW / 2 - 4;
    const bgY = sy + p.r + 4;
    ctx.fillStyle = 'rgba(15, 25, 45, 0.9)';
    ctx.fillRect(bgX, bgY, lblW + 8, 14);
    ctx.strokeStyle = 'rgba(139, 127, 212, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bgX, bgY, lblW + 8, 14);
    ctx.fillStyle = labelColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, sx, bgY + 7);
    ctx.restore();
  }
}

// ─── Утилиты цвета ──────────────────────────────────────────────
function lightenHex(hex, amt) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 'rgb(' + Math.min(255, r + amt * 255) + ',' +
    Math.min(255, g + amt * 255) + ',' + Math.min(255, b + amt * 255) + ')';
}
function darkenHex(hex, amt) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 'rgb(' + Math.max(0, r - amt * 255) + ',' +
    Math.max(0, g - amt * 255) + ',' + Math.max(0, b - amt * 255) + ')';
}

// ─── Ввод ───────────────────────────────────────────────────────
function mgPointerDown(x, y) {
  if (!MG.type) return;
  if (y < 50 && x > (window.CANVAS_W || 400) - 120) {
    endMinigame(false); return;
  }
  if (MG.type === 'mass' || MG.type === 'assemble') {
    MG.dragActive = true; MG.dragX = x; MG.dragY = y;
  } else if (MG.type === 'ignite') {
    const cx = window.CANVAS_CX || 0, cy = window.CANVAS_CY || 0;
    if (Math.hypot(x - cx, y - cy) < MG_IGNITE.tapRadius) {
      MG.power = Math.min(1, MG.power + MG_IGNITE.tapBoost);
    }
  }
}

function mgPointerMove(x, y) {
  if (!MG.type) return;
  if (MG.type === 'mass' || MG.type === 'assemble') {
    MG.dragX = x; MG.dragY = y;
  }
}

function mgPointerUp() { MG.dragActive = false; }

window.startMinigame = startMinigame;
window.updateMinigame = updateMinigame;
window.drawMinigame = drawMinigame;
window.mgPointerDown = mgPointerDown;
window.mgPointerMove = mgPointerMove;
window.mgPointerUp = mgPointerUp;
window.MG = MG;
