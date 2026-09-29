// ═══════════════════════════════════════════════════════════════
//  MINIGAMES.JS — три мини-игры на переходах фаз
//  1. mass     — раскрути вихрь
//  2. ignite   — 30 секунд держи топливо
//  3. assemble — собери планету из частиц
// ═══════════════════════════════════════════════════════════════

const MG = {
  type: null, startAt: 0, onComplete: null,
  progress: 0, dragX: 0, dragY: 0, dragActive: false, trail: [],
  particles: [], capturedCount: 0, finishAt: 0,
  power: 0, elapsedSec: 0, quality: 0,
  fieldParticles: [], absorbed: 0, composition: null,
  coreR: 15, result: null,
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

// ═══ Мини-игра "Сборка планеты" ═══
// 12 крупных частиц: 3 льда (синие), 3 лавы (красные),
// 3 камня (зелёные), 3 газа (жёлтые).
//
// Логика:
//   Одинаковый цвет + одинаковый tier → tier растёт (1 → 2 → 3)
//   tier 3 одноцветной = звезда → планета этого цвета
//   Разные цвета → смешиваются, состав расширяется
//   Когда состав 4 цвета → землеподобная планета
const MG_ASSEMBLE = {
  duration: 25,          // Секунд на всю игру
  fingerRadius: 110,     // Радиус действия пальца
  fingerForce: 700,      // Сила притяжения к пальцу
  baseRadius: 22,        // Радиус tier 1
  tierStep: 8,           // +8px за tier (2, 3)
  mergeDist: 4,          // Зазор для слияния
  finishDelay: 1500,     // Мс после победы
  colorsPerType: 3,      // Частиц каждого цвета
};

const ASSEMBLE_TYPES = {
  ice:   { color: '#3b9eff', glow: 'rgba(59,158,255,0.8)', name: 'лёд',    planet: 'iceGiant' },
  lava:  { color: '#ff2d2d', glow: 'rgba(255,45,45,0.8)',  name: 'лава',   planet: 'lava' },
  stone: { color: '#00e639', glow: 'rgba(0,230,57,0.8)',   name: 'камень', planet: 'rocky' },
  gas:   { color: '#ffd633', glow: 'rgba(255,214,51,0.8)', name: 'газ',    planet: 'gasGiant' },
};

// ─── Запуск ─────────────────────────────────────────────────────
function startMinigame(type, onComplete) {
  MG.type = type;
  MG.startAt = performance.now();
  MG.onComplete = onComplete;
  MG.progress = 0; MG.dragActive = false;
  MG.trail = []; MG.finishAt = 0;

  if (type === 'mass') {
    MG.particles = []; MG.capturedCount = 0;
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 160 + Math.random() * 120;
      MG.particles.push({
        x: Math.cos(a)*r, y: Math.sin(a)*r*0.85,
        vx: 0, vy: 0, r: 1.6 + Math.random()*1.8,
        hue: 200 + Math.random()*60,
        captured: false, orbitAngle: 0, orbitRadius: 0, orbitSpeed: 0,
      });
    }
  } else if (type === 'ignite') {
    MG.power = 0; MG.elapsedSec = 0; MG.quality = 0;
      } else if (type === 'assemble') {
    MG.fieldParticles = [];
    MG.result = null;
    MG.resultLabel = null;
    MG.elapsedSec = 0;
    MG.finishAt = 0;

    // ★ По 3 частицы каждого из 4 цветов = 12 частиц
    const types = ['ice', 'lava', 'stone', 'gas'];
    for (let t = 0; t < types.length; t++) {
      for (let k = 0; k < MG_ASSEMBLE.colorsPerType; k++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 130 + Math.random() * 80;
        MG.fieldParticles.push({
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist * 0.8,
          vx: (Math.random() - 0.5) * 80,
          vy: (Math.random() - 0.5) * 80,
          r: MG_ASSEMBLE.baseRadius,
          colors: [types[t]],
          tier: 1,
          fixed: false,
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

  if (MG.type === 'mass')     updateMass(dt, cx, cy);
  if (MG.type === 'ignite')   updateIgnite(dt, elapsed);
  if (MG.type === 'assemble') updateAssemble(dt, elapsed, cx, cy);
}

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
        const f = (1 - td/MG_VORTEX.fingerRadius) * MG_VORTEX.fingerForce;
        p.vx += (tdx/td)*f*dt; p.vy += (tdy/td)*f*dt;
      }
    }
    const dCenter = Math.hypot(p.x, p.y) || 1;
    if (dCenter < MG_VORTEX.maxDrift) {
      const drift = MG_VORTEX.slowDrift * (1 - dCenter/MG_VORTEX.maxDrift);
      p.vx += (-p.x/dCenter)*drift*dt; p.vy += (-p.y/dCenter)*drift*dt;
    }
    p.vx *= 0.94; p.vy *= 0.94;
    p.x += p.vx*dt; p.y += p.vy*dt;
    const d = Math.hypot(p.x, p.y);
    if (d < MG_VORTEX.captureRadius) {
      p.captured = true;
      p.orbitAngle = Math.atan2(p.y, p.x);
      p.orbitRadius = Math.max(MG_VORTEX.minOrbitR, d);
      const tanSpeed = Math.hypot(p.vx, p.vy);
      p.orbitSpeed = Math.max(1.5, Math.min(5.0, 1.5 + tanSpeed/100));
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

function updateIgnite(dt, elapsed) {
  MG.elapsedSec = elapsed;
  const decay = MG_IGNITE.baseDecay * (1 + elapsed * MG_IGNITE.decayAccel);
  MG.power = Math.max(0, MG.power - decay*dt);
  MG.progress = MG.power;
  if (elapsed >= MG_IGNITE.duration) {
    MG.quality = MG.power;
    endMinigame(true);
  }
}

function updateAssemble(dt, elapsed, cx, cy) {
  MG.elapsedSec = elapsed;

  // ─── Притяжение к пальцу ───
  if (MG.dragActive) {
    const fx = MG.dragX - cx;
    const fy = MG.dragY - cy;
    for (let i = 0; i < MG.fieldParticles.length; i++) {
      const p = MG.fieldParticles[i];
      if (p.fixed) continue;
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

  // ─── Движение ───
  for (let i = 0; i < MG.fieldParticles.length; i++) {
    const p = MG.fieldParticles[i];
    if (p.fixed) continue;
    p.vx *= 0.96;
    p.vy *= 0.96;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    if (Math.abs(p.x) > 260) { p.x = Math.sign(p.x) * 260; p.vx *= -0.7; }
    if (Math.abs(p.y) > 180) { p.y = Math.sign(p.y) * 180; p.vy *= -0.7; }
  }

  // ─── Столкновения и слияния ───
  for (let i = 0; i < MG.fieldParticles.length; i++) {
    const a = MG.fieldParticles[i];
    if (a.fixed) continue;

    for (let j = i + 1; j < MG.fieldParticles.length; j++) {
      const b = MG.fieldParticles[j];
      if (b.fixed) continue;

      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d = Math.hypot(dx, dy);
      const minD = a.r + b.r + MG_ASSEMBLE.mergeDist;

      if (d >= minD) continue;

      // ─── Определяем результат слияния ───
      const sameColors = a.colors.length === b.colors.length &&
                         a.colors.every(function(c) { return b.colors.indexOf(c) !== -1; });
      let mergeResult = null;

      if (sameColors) {
        // Одинаковые цвета
        if (a.colors.length === 1) {
          // Одноцветные — tier растёт
          const newTier = Math.min(3, Math.max(a.tier, b.tier) + 1);
          mergeResult = { colors: a.colors, tier: newTier };
        }
        // Смешанные с одинаковым составом — не сливаются
      } else {
        // Разные цвета — объединяем
        const merged = a.colors.slice();
        for (let k = 0; k < b.colors.length; k++) {
          if (merged.indexOf(b.colors[k]) === -1) merged.push(b.colors[k]);
        }
        // Слияние только если состав расширился
        if (merged.length > a.colors.length || merged.length > b.colors.length) {
          mergeResult = { colors: merged, tier: 1 };
        }
      }

      if (mergeResult) {
        // ─── Слияние ───
        a.x = (a.x + b.x) / 2;
        a.y = (a.y + b.y) / 2;
        a.vx = (a.vx + b.vx) / 2;
        a.vy = (a.vy + b.vy) / 2;
        a.colors = mergeResult.colors;
        a.tier = mergeResult.tier;
        a.r = MG_ASSEMBLE.baseRadius + (a.tier - 1) * MG_ASSEMBLE.tierStep;

        MG.fieldParticles.splice(j, 1);
        j--;

        // Проверка финала
        if (a.colors.length === 1 && a.tier >= 3) {
          // Одноцветная звезда — планета того цвета
          a.fixed = true;
          a.vx = 0; a.vy = 0;
          if (!MG.result) {
            MG.result = ASSEMBLE_TYPES[a.colors[0]].planet;
            MG.resultLabel = ASSEMBLE_TYPES[a.colors[0]].name;
            MG.finishAt = performance.now();
          }
        } else if (a.colors.length >= 4) {
          // 4 цвета — землеподобная
          a.fixed = true;
          a.vx = 0; a.vy = 0;
          if (!MG.result) {
            MG.result = 'superEarth';
            MG.resultLabel = 'землеподобная';
            MG.finishAt = performance.now();
          }
        }
      } else {
        // ─── Отскок (разные tier или одинаковые смешанные) ───
        if (d > 0.001) {
          const nx = dx / d;
          const ny = dy / d;
          const overlap = minD - d;
          a.x += nx * overlap * 0.5;
          a.y += ny * overlap * 0.5;
          b.x -= nx * overlap * 0.5;
          b.y -= ny * overlap * 0.5;

          const avx = a.vx, avy = a.vy;
          a.vx = b.vx * 0.7;
          a.vy = b.vy * 0.7;
          b.vx = avx * 0.7;
          b.vy = avy * 0.7;
        }
      }
    }
  }

  // Прогресс
  MG.progress = MG.result ? 1 : Math.min(0.95, elapsed / MG_ASSEMBLE.duration);

  // Финал
  if (MG.finishAt && performance.now() - MG.finishAt > MG_ASSEMBLE.finishDelay) {
    finishAssemble();
    return;
  }
  if (elapsed >= MG_ASSEMBLE.duration) finishAssemble();
}

function finishAssemble() {
  // Если ядро не собрано — землеподобная (баланс)
  if (!MG.result) {
    MG.result = 'superEarth';
    MG.quality = 0.5;
    endMinigame(true);
    return;
  }

  // Ядро собрано — определяем планету
  const planetType = ASSEMBLE_TO_PLANET[MG.result] || 'rocky';
  MG.result = planetType;
  MG.quality = 1.0;
  endMinigame(true);
}

// ─── Рисование ──────────────────────────────────────────────────
function drawMinigame(ctx, time) {
  const cx = window.CANVAS_CX || 0, cy = window.CANVAS_CY || 0;
  const t = time;

  ctx.save();
  ctx.fillStyle = 'rgba(2, 1, 10, 0.60)';
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
  ctx.strokeStyle = 'rgba(160, 130, 240, ' + (0.2 + MG.progress*0.4) + ')';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.arc(cx, cy, MG_VORTEX.captureRadius, 0, Math.PI*2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  if (MG.capturedCount > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let s = 0; s < 3; s++) {
      const baseAngle = t*0.8 + (s/3)*Math.PI*2;
      ctx.strokeStyle = 'rgba(180, 140, 255, ' + (0.15 + MG.progress*0.35) + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let rr = MG_VORTEX.minOrbitR; rr < MG_VORTEX.captureRadius; rr += 5) {
        const a = baseAngle + rr*0.06;
        const x = cx + Math.cos(a)*rr;
        const y = cy + Math.sin(a)*rr*0.85;
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
    const sx = cx + p.x, sy = cy + p.y;
    const boost = p.captured ? 1.5 : 1.0;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, p.r*4*boost);
    g.addColorStop(0, 'hsla(' + p.hue + ', 90%, 85%, 1)');
    g.addColorStop(0.5, 'hsla(' + p.hue + ', 80%, 65%, 0.5)');
    g.addColorStop(1, 'hsla(' + p.hue + ', 70%, 50%, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, p.r*4*boost, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.restore();

  if (MG.trail.length > 1) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i < MG.trail.length; i++) {
      const a = MG.trail[i-1], b = MG.trail[i];
      const alpha = Math.max(0, 1 - b.age/0.7);
      ctx.strokeStyle = 'rgba(200, 180, 255, ' + (alpha*0.8) + ')';
      ctx.lineWidth = 3*alpha + 1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  const coreBase = 18 + MG.progress*26;
  const corePulse = 1 + 0.08*Math.sin(t*3);
  const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreBase*corePulse*3);
  cg.addColorStop(0, 'rgba(255,240,200,' + (0.6 + MG.progress*0.4) + ')');
  cg.addColorStop(0.4, 'rgba(255,180,80,' + (0.25 + MG.progress*0.35) + ')');
  cg.addColorStop(1, 'rgba(255,100,40,0)');
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.arc(cx, cy, coreBase*corePulse*3, 0, Math.PI*2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,250,220,' + (0.85 + MG.progress*0.15) + ')';
  ctx.beginPath();
  ctx.arc(cx, cy, 6 + MG.progress*8, 0, Math.PI*2);
  ctx.fill();

  if (!MG.dragActive && MG.progress < 0.05) {
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.3*Math.sin(t*3);
    ctx.strokeStyle = '#b9a8ff';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    const hintR = 140;
    ctx.beginPath();
    ctx.arc(cx, cy, hintR, -Math.PI*0.2, Math.PI*0.9);
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

  const pulse = 1 + MG.power*0.5;
  const coreR = (15 + MG.power*30)*pulse;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR*4);
  g.addColorStop(0, 'rgba(255,240,200,' + (0.3 + MG.power*0.7) + ')');
  g.addColorStop(0.3, 'rgba(255,180,80,' + (0.2 + MG.power*0.4) + ')');
  g.addColorStop(1, 'rgba(255,100,40,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, coreR*4, 0, Math.PI*2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,250,220,' + (0.6 + MG.power*0.4) + ')';
  ctx.beginPath();
  ctx.arc(cx, cy, coreR*0.4, 0, Math.PI*2);
  ctx.fill();

  ctx.save();
  ctx.strokeStyle = 'rgba(60,30,20,0.7)';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(cx, cy, 110, 0, Math.PI*2);
  ctx.stroke();
  ctx.strokeStyle = tierColor;
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, 110, -Math.PI/2, -Math.PI/2 + Math.PI*2*MG.power);
  ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = tierColor;
  ctx.globalAlpha = 0.4 + 0.3*Math.sin(t*5);
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(cx, cy, 110, -Math.PI/2, -Math.PI/2 + Math.PI*2*MG.power);
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
}

function drawAssemble(ctx, cx, cy, t) {
  const left = Math.max(0, MG_ASSEMBLE.duration - (MG.elapsedSec || 0));

  // Заголовок
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 16px -apple-system, sans-serif';
  ctx.fillStyle = '#e8e2ff';
  ctx.fillText('Собери планету', cx, cy - 240);
  ctx.font = '12px -apple-system, sans-serif';
  ctx.fillStyle = '#a89ce0';
  ctx.fillText('Столкни одинаковые → большая. Ещё раз → звезда.',
               cx, cy - 220);
  ctx.fillText('Разные цвета смешиваются — 4 цвета = Земля.',
               cx, cy - 204);
  ctx.restore();

  // Прогресс
  const barW = 260, barH = 6;
  const bx = cx - barW / 2, by = cy + 220;
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
    ctx.fillText('★ ЯДРО СОБРАНО: ' + pt.name, cx, by + 22);
  } else {
    ctx.fillStyle = '#8b7fd4';
    ctx.fillText('Ядро не собрано — ' + left.toFixed(1) + 'с · получишь суперземлю',
                 cx, by + 22);
  }
  ctx.restore();

  // Легенда
  const legendY = cy + 260;
  const legendItems = [
    { key: 'ice',   label: 'лёд' },
    { key: 'lava',  label: 'лава' },
    { key: 'stone', label: 'камень' },
    { key: 'gas',   label: 'газ' },
  ];
  const legendW = 60;
  const totalW = legendItems.length * legendW;
  const startX = cx - totalW / 2 + legendW / 2;

  ctx.save();
  for (let i = 0; i < legendItems.length; i++) {
    const item = legendItems[i];
    const conf = ASSEMBLE_TYPES[item.key];
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
    ctx.fillText(item.label, lx, legendY + 16);
  }
  ctx.restore();

  // Частицы
  for (let i = 0; i < MG.fieldParticles.length; i++) {
    drawAssembleParticle(ctx, MG.fieldParticles[i], cx, cy, t, i);
  }

  // Подсказка
  if (!MG.dragActive && !MG.result && (MG.elapsedSec || 0) < 4) {
    ctx.save();
    ctx.font = 'bold 14px -apple-system, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 5);
    ctx.fillText('ТАЩИ ПАЛЬЦЕМ — СТАЛКИВАЙ ОДИНАКОВЫЕ',
                 cx, cy + 310);
    ctx.restore();
  }
}

// ─── Рисование одной частицы ────────────────────────────────────
function drawAssembleParticle(ctx, p, cx, cy, t, idx) {
  const sx = cx + p.x;
  const sy = cy + p.y;

  // Свечение
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const pulse = 1 + 0.06 * Math.sin(t * 4 + idx);
  const glowR = p.r * 2 * pulse;
  const gg = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
  if (p.colors.length === 1) {
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
  if (p.colors.length === 1) {
    // Одноцветная — обычный шар
    const color = ASSEMBLE_TYPES[p.colors[0]].color;
    const g = ctx.createRadialGradient(sx - p.r * 0.3, sy - p.r * 0.3, 0,
                                        sx, sy, p.r);
    g.addColorStop(0, lightenHex(color, 0.35));
    g.addColorStop(1, darkenHex(color, 0.3));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, p.r, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Многоцветная — сектора
    const n = p.colors.length;
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
    // Мягкое внутреннее свечение
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, p.r);
    g.addColorStop(0, 'rgba(255,255,255,0.15)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, p.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Обводка
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = p.tier >= 3 ? 3 : (p.tier >= 2 ? 2 : 1.5);
  ctx.beginPath();
  ctx.arc(sx, sy, p.r, 0, Math.PI * 2);
  ctx.stroke();

  // Звезда для tier 3
  if (p.tier >= 3) {
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 12;
    ctx.font = 'bold ' + Math.round(p.r * 0.9) + 'px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', sx, sy);
    ctx.restore();
  }
}

// ─── Утилиты цвета ──────────────────────────────────────────────
function lightenHex(hex, amt) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 'rgb(' + Math.min(255, r + amt * 255) + ',' +
    Math.min(255, g + amt * 255) + ',' +
    Math.min(255, b + amt * 255) + ')';
}
function darkenHex(hex, amt) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 'rgb(' + Math.max(0, r - amt * 255) + ',' +
    Math.max(0, g - amt * 255) + ',' +
    Math.max(0, b - amt * 255) + ')';
}

// ─── Утилиты цветов для assemble ────────────────────────────────
function lightenHex(hex, amt) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 'rgb(' + Math.min(255, r + amt * 255) + ',' +
    Math.min(255, g + amt * 255) + ',' +
    Math.min(255, b + amt * 255) + ')';
}
function darkenHex(hex, amt) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 'rgb(' + Math.max(0, r - amt * 255) + ',' +
    Math.max(0, g - amt * 255) + ',' +
    Math.max(0, b - amt * 255) + ')';
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
    if (Math.hypot(x-cx, y-cy) < MG_IGNITE.tapRadius) {
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
