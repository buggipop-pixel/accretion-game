// ═══════════════════════════════════════════════════════════════
//  MINIGAMES.JS — mass (вихрь), ignite (30с), assemble (сборка)
// ═══════════════════════════════════════════════════════════════

const MG = {
  type: null,
  startAt: 0,
  onComplete: null,
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
  // assemble
  fieldParticles: [],
  absorbed: 0,
  composition: null,
  coreR: 15,
  result: null,
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
  baseDecay: 0.10,
  decayAccel: 0.18,
  tapBoost: 0.08,
  tapRadius: 250,
};

const MG_ASSEMBLE = {
  duration: 20,
  targetMass: 20,
  fingerRadius: 130,
  fingerForce: 500,
  absorbRadius: 50,
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
  } else if (type === 'assemble') {
    MG.fieldParticles = [];
    MG.absorbed = 0;
    MG.coreR = 15;
    MG.result = null;
    MG.composition = { stone: 0, ice: 0, gas: 0, fire: 0 };
    MG.elapsedSec = 0;

    // ★ Спавним частицы 4 типов
    const typePool = [
      'stone', 'stone', 'stone', 'stone',
      'ice', 'ice', 'ice',
      'gas', 'gas',
      'fire',
    ];
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 130 + Math.random() * 180;
      MG.fieldParticles.push({
        x: Math.cos(a) * r,
        y: Math.sin(a) * r * 0.85,
        vx: (Math.random() - 0.5) * 30,
        vy: (Math.random() - 0.5) * 30,
        r: 2 + Math.random() * 2,
        type: typePool[Math.floor(Math.random() * typePool.length)],
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

// ─── Обновление ─────────────────────────────────────────────────
function updateMinigame(dt, time) {
  const cx = window.CANVAS_CX || 0;
  const cy = window.CANVAS_CY || 0;
  const elapsed = (performance.now() - MG.startAt) / 1000;

  for (let i = MG.trail.length - 1; i >= 0; i--) {
    MG.trail[i].age += dt;
    if (MG.trail[i].age > 0.7) MG.trail.splice(i, 1);
  }

  if (MG.type === 'mass')     updateMass(dt, cx, cy);
  if (MG.type === 'ignite')   updateIgnite(dt, elapsed);
  if (MG.type === 'assemble') updateAssemble(dt, elapsed, cx, cy);
}

// ─── ВИХРЬ ──────────────────────────────────────────────────────
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
      const tdx = (MG.dragX - cx) - p.x;
      const tdy = (MG.dragY - cy) - p.y;
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

    p.vx *= 0.94;
    p.vy *= 0.94;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

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
    if (performance.now() - MG.finishAt > 1500) endMinigame(true);
  }
}

// ─── ЗАЖИГАНИЕ ──────────────────────────────────────────────────
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

// ─── СБОРКА ПЛАНЕТЫ ─────────────────────────────────────────────
function updateAssemble(dt, elapsed, cx, cy) {
  MG.elapsedSec = elapsed;

  // Притяжение к пальцу
  if (MG.dragActive) {
    const fx = MG.dragX - cx;
    const fy = MG.dragY - cy;
    for (let i = 0; i < MG.fieldParticles.length; i++) {
      const p = MG.fieldParticles[i];
      const dx = fx - p.x;
      const dy = fy - p.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < MG_ASSEMBLE.fingerRadius) {
        const force = (1 - d / MG_ASSEMBLE.fingerRadius) * MG_ASSEMBLE.fingerForce;
        p.vx += (dx / d) * force * dt;
        p.vy += (dy / d) * force * dt;
      }
    }
  }

  // Обновление частиц
  for (let i = MG.fieldParticles.length - 1; i >= 0; i--) {
    const p = MG.fieldParticles[i];
    p.vx *= 0.96;
    p.vy *= 0.96;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Отражение от границ
    if (Math.abs(p.x) > 280) { p.x = Math.sign(p.x) * 280; p.vx *= -0.8; }
    if (Math.abs(p.y) > 200) { p.y = Math.sign(p.y) * 200; p.vy *= -0.8; }

    // Поглощение ядром
    const dCore = Math.hypot(p.x, p.y);
    if (dCore < MG_ASSEMBLE.absorbRadius) {
      MG.composition[p.type]++;
      MG.absorbed++;
      MG.coreR += 0.6;
      MG.fieldParticles.splice(i, 1);
    }
  }

  MG.progress = Math.min(1, MG.absorbed / MG_ASSEMBLE.targetMass);

  // Финал
  if (elapsed >= MG_ASSEMBLE.duration) {
    finishAssemble();
  }
}

function finishAssemble() {
  const c = MG.composition;
  const total = c.stone + c.ice + c.gas + c.fire;

  if (total === 0) {
    MG.result = 'rocky';
    MG.quality = 0;
    endMinigame(false);
    return;
  }

  const stoneR = c.stone / total;
  const iceR = c.ice / total;
  const gasR = c.gas / total;
  const fireR = c.fire / total;

  // ★ Определяем планету по составу
  if (fireR >= 0.4) MG.result = 'lava';
  else if (stoneR >= 0.55) MG.result = 'rocky';
  else if (iceR >= 0.55) MG.result = 'iceGiant';
  else if (gasR >= 0.55) MG.result = 'gasGiant';
  else if (stoneR >= 0.3 && iceR >= 0.3) MG.result = 'superEarth';
  else MG.result = 'rocky';

  MG.quality = Math.min(1, MG.absorbed / MG_ASSEMBLE.targetMass);
  endMinigame(MG.absorbed >= 3);
}

// ─── Рисование ──────────────────────────────────────────────────
function drawMinigame(ctx, time) {
  const cx = window.CANVAS_CX || 0;
  const cy = window.CANVAS_CY || 0;
  const t = time;

  ctx.save();
  ctx.fillStyle = 'rgba(2, 1, 10, 0.60)';
  ctx.fillRect(0, 0, window.CANVAS_W, window.CANVAS_H);
  ctx.restore();

  if (MG.type === 'mass')     drawMass(ctx, cx, cy, t);
  if (MG.type === 'ignite')   drawIgnite(ctx, cx, cy, t);
  if (MG.type === 'assemble') drawAssemble(ctx, cx, cy, t);

  // Пропустить
  ctx.save();
  ctx.textAlign = 'right';
  ctx.font = '11px -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(139, 127, 212, 0.7)';
  ctx.fillText('Пропустить ▸', window.CANVAS_W - 16, 32);
  ctx.restore();
}

// ─── Рисование: ВИХРЬ ───────────────────────────────────────────
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
    ctx.restore();
  }

  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '11px -apple-system, sans-serif';
  ctx.fillStyle = '#8b7fd4';
  ctx.fillText(MG.capturedCount + ' / ' + MG.particles.length + ' частиц',
               cx, cy + 220);
  ctx.restore();
}

// ─── Рисование: ЗАЖИГАНИЕ ───────────────────────────────────────
function drawIgnite(ctx, cx, cy, t) {
  const left = Math.max(0, MG_IGNITE.duration - (MG.elapsedSec || 0));

  let tier = 'G';
  let tierColor = '#ffcc55';
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
  ctx.arc(cx, cy, 110, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * MG.power);
  ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = tierColor;
  ctx.globalAlpha = 0.4 + 0.3 * Math.sin(t * 5);
  ctx.lineWidth = 14;
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
  ctx.globalAlpha = 0.9;
  ctx.fillText(tier, cx, cy - 130);
  ctx.font = '10px -apple-system, sans-serif';
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#a89ce0';
  ctx.globalAlpha = 0.7;
  ctx.fillText('прогноз звезды', cx, cy - 108);
  ctx.restore();

  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 20px -apple-system, sans-serif';
  ctx.fillStyle = left < 5 ? '#ff5555' : '#fff';
  ctx.globalAlpha = 0.85;
  ctx.fillText(left.toFixed(1) + 'с', cx, cy + 170);
  ctx.restore();

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

// ─── Рисование: СБОРКА ПЛАНЕТЫ ──────────────────────────────────
function drawAssemble(ctx, cx, cy, t) {
  const left = Math.max(0, MG_ASSEMBLE.duration - (MG.elapsedSec || 0));

  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 16px -apple-system, sans-serif';
  ctx.fillStyle = '#e8e2ff';
  ctx.fillText('Собери планету', cx, cy - 230);
  ctx.font = '13px -apple-system, sans-serif';
  ctx.fillStyle = '#a89ce0';
  ctx.fillText('Води пальцем — частицы тянутся за ним', cx, cy - 208);
  ctx.restore();

  // Ядро
  const corePulse = 1 + 0.06 * Math.sin(t * 4);
  const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, MG.coreR * 3 * corePulse);
  cg.addColorStop(0, 'rgba(255, 240, 200, 0.95)');
  cg.addColorStop(0.4, 'rgba(255, 180, 80, 0.45)');
  cg.addColorStop(1, 'rgba(255, 100, 40, 0)');
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.arc(cx, cy, MG.coreR * 3 * corePulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff8dc';
  ctx.beginPath();
  ctx.arc(cx, cy, MG.coreR * corePulse, 0, Math.PI * 2);
  ctx.fill();

  // Радиус поглощения
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 200, 120, 0.2)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.arc(cx, cy, MG_ASSEMBLE.absorbRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Частицы поля
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < MG.fieldParticles.length; i++) {
    const p = MG.fieldParticles[i];
    const sx = cx + p.x;
    const sy = cy + p.y;
    let hue = 30;      // камень
    if (p.type === 'ice') hue = 200;
    if (p.type === 'gas') hue = 50;
    if (p.type === 'fire') hue = 15;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, p.r * 3);
    g.addColorStop(0, 'hsla(' + hue + ', 85%, 82%, 1)');
    g.addColorStop(0.5, 'hsla(' + hue + ', 75%, 62%, 0.6)');
    g.addColorStop(1, 'hsla(' + hue + ', 70%, 50%, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, p.r * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Прогресс-бар + состав
  const barW = 240, barH = 6;
  const bx = cx - barW / 2, by = cy + 210;
  ctx.save();
  ctx.fillStyle = 'rgba(139, 127, 212, 0.2)';
  ctx.fillRect(bx, by, barW, barH);
  ctx.fillStyle = MG.progress >= 1 ? '#ffb347' : '#b9a8ff';
  ctx.fillRect(bx, by, barW * MG.progress, barH);

  ctx.textAlign = 'center';
  ctx.font = '11px -apple-system, sans-serif';
  ctx.fillStyle = '#8b7fd4';
  const c = MG.composition;
  const total = c.stone + c.ice + c.gas + c.fire;
  const stoneP = total ? Math.round(c.stone / total * 100) : 0;
  const iceP = total ? Math.round(c.ice / total * 100) : 0;
  const gasP = total ? Math.round(c.gas / total * 100) : 0;
  const fireP = total ? Math.round(c.fire / total * 100) : 0;
  ctx.fillText('🪨 ' + stoneP + '% · ❄ ' + iceP + '% · 💨 ' + gasP + '% · 🔥 ' + fireP + '%',
               cx, by + 22);
  ctx.fillText(MG.absorbed + ' / ' + MG_ASSEMBLE.targetMass + ' частиц · ' +
               left.toFixed(1) + 'с', cx, by + 40);
  ctx.restore();

  if (!MG.dragActive && MG.absorbed === 0) {
    ctx.save();
    ctx.font = 'bold 14px -apple-system, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 6);
    ctx.fillText('ВОДИ ПАЛЬЦЕМ ПО ЭКРАНУ', cx, cy + 270);
    ctx.restore();
  }
}

// ─── Ввод ───────────────────────────────────────────────────────
function mgPointerDown(x, y) {
  if (!MG.type) return;
  if (y < 50 && x > (window.CANVAS_W || 400) - 120) {
    endMinigame(false);
    return;
  }

  if (MG.type === 'mass' || MG.type === 'assemble') {
    MG.dragActive = true;
    MG.dragX = x;
    MG.dragY = y;
  } else if (MG.type === 'ignite') {
    const cx = window.CANVAS_CX || 0;
    const cy = window.CANVAS_CY || 0;
    if (Math.hypot(x - cx, y - cy) < MG_IGNITE.tapRadius) {
      MG.power = Math.min(1, MG.power + MG_IGNITE.tapBoost);
    }
  }
}

function mgPointerMove(x, y) {
  if (!MG.type) return;
  if (MG.type === 'mass' || MG.type === 'assemble') {
    MG.dragX = x;
    MG.dragY = y;
  }
}

function mgPointerUp() {
  MG.dragActive = false;
}

// ─── Экспорт ────────────────────────────────────────────────────
window.startMinigame = startMinigame;
window.updateMinigame = updateMinigame;
window.drawMinigame = drawMinigame;
window.mgPointerDown = mgPointerDown;
window.mgPointerMove = mgPointerMove;
window.mgPointerUp = mgPointerUp;
window.MG = MG;
