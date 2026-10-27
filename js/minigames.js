// ═══════════════════════════════════════════════════════════════
//  MINIGAMES.JS — мини-игра «Сборка планеты» (assemble)
// ═══════════════════════════════════════════════════════════════

const _COLOR_TO_PLANET = {
  ice:   'iceGiant',
  lava:  'lava',
  stone: 'rocky',
  gas:   'gasGiant',
};

const MG = {
  type: null,
  startAt: 0,
  onComplete: null,
  progress: 0,

  // Drag
  dragX: 0, dragY: 0, dragActive: false, trail: [],
  grabbedIndex: -1,
  grabbed: null,

  // Assemble
  fieldParticles: [],
  fieldHalfW: 300, fieldHalfH: 200,
  startDistMin: 150, startDistMax: 220,
  sparks: [],
  result: null, resultLabel: null,
  finishAt: 0, elapsedSec: 0,
  
  availableColors: ['ice', 'lava', 'stone', 'gas'],
  allowedPlanets: ['iceGiant', 'lava', 'rocky', 'gasGiant', 'superEarth']
};

// ─── Параметры сборки планеты ───────────────────────────────────
const MG_ASSEMBLE = {
  duration: 30,
  fingerRadius: 140,
  fingerForce: 2400,
  baseRadius: 18,
  radiusStep: 6,
  minBetweenDist: 120,
  mergeDist: 3,
  finishDelay: 1500,
  colorsPerType: 4,
};

// Цвета: 🔵 лёд, 🔴 лава, 🟢 камень, 🟡 газ
const ASSEMBLE_TYPES = {
  ice:   { color: '#3b9eff', glow: 'rgba(59,158,255,0.8)', name: 'Лёд',    planet: 'iceGiant' },
  lava:  { color: '#ff2d2d', glow: 'rgba(255,45,45,0.8)',  name: 'Лава',   planet: 'lava' },
  stone: { color: '#00e639', glow: 'rgba(0,230,57,0.8)',   name: 'Камень', planet: 'rocky' },
  gas:   { color: '#ffd633', glow: 'rgba(255,214,51,0.8)', name: 'Газ',    planet: 'gasGiant' },
};

// ═══════════════════════════════════════════════════════════════
//  ЗАПУСК
// ═══════════════════════════════════════════════════════════════
function startMinigame(type, onComplete) {
  if (!S.seenMinigame) S.seenMinigame = {};
  S.seenMinigame[type] = true;

  MG.type = type;
  MG.startAt = performance.now();
  MG.onComplete = onComplete;
  MG.progress = 0;
  MG.dragActive = false;
  MG.grabbedIndex = -1;
  MG.trail = [];
  MG.finishAt = 0;
  MG.sparks = [];
  MG.fieldParticles = [];
  MG.result = null;
  MG.resultLabel = null;

  const evolveBtnEl = document.getElementById('evolveBtn');
  if (evolveBtnEl) evolveBtnEl.classList.remove('show');

  if (type === 'assemble') {
    initAssembleField();

    if (MG.fieldParticles.length === 0) {
      if (typeof toast === 'function') {
        toast('Система заполнена', 'Все доступные орбиты заняты планетами');
      }
      endMinigame(false);
      return;
    }
  }

  S.activeMinigame = type;
  const modal = document.getElementById('modal');
  if (modal) modal.classList.remove('show');
}

function initAssembleField() {
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

  // Жестко даем 4 цвета
  MG.availableColors = ['ice', 'lava', 'stone', 'gas'];
  MG.allowedPlanets = ['iceGiant', 'lava', 'rocky', 'gasGiant', 'superEarth'];

  const types = MG.availableColors;
  const total = types.length * MG_ASSEMBLE.colorsPerType;
  const margin = 30;
  const innerW = (MG.fieldHalfW - margin) * 0.9;
  const innerH = (MG.fieldHalfH - margin) * 0.9;

  const placed = [];
  let attempts = 0;
  const maxAttempts = 500;

  for (let i = 0; i < total; i++) {
    let x = 0, y = 0, ok = false;
    while (!ok && attempts < maxAttempts) {
      attempts++;
      x = (Math.random() * 2 - 1) * innerW;
      y = (Math.random() * 2 - 1) * innerH;
      ok = true;
      for (let k = 0; k < placed.length; k++) {
        const dx = x - placed[k].x, dy = y - placed[k].y;
        if (dx * dx + dy * dy < 55 * 55) { ok = false; break; }
      }
    }
    placed.push({ x: x, y: y });
    const colorKey = types[Math.floor(i / MG_ASSEMBLE.colorsPerType)];
    const cc = {}; cc[colorKey] = 1;
    MG.fieldParticles.push({
      x: x, y: y, vx: 0, vy: 0,
      r: MG_ASSEMBLE.baseRadius,
      colors: [colorKey],
      colorCounts: cc,
      mass: 1,
      fixed: false,
    });
  }
}

// ═══════════════════════════════════════════════════════════════
//  ЗАВЕРШЕНИЕ
// ═══════════════════════════════════════════════════════════════
function endMinigame(success) {
  const cb = MG.onComplete;
  const type = MG.type;
  MG.type = null;
  S.activeMinigame = null;
  if (type && S.seenMinigame) S.seenMinigame[type + '_shown'] = true;
  if (cb) cb(success);
}

// ═══════════════════════════════════════════════════════════════
//  ОБНОВЛЕНИЕ
// ═══════════════════════════════════════════════════════════════
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

  if (MG.type === 'assemble') updateAssemble(dt, elapsed, cx, cy);
}

function updateAssemble(dt, elapsed, cx, cy) {
  MG.elapsedSec = elapsed;

  if (MG.grabbed) {
    const gi = MG.fieldParticles.indexOf(MG.grabbed);
    if (gi < 0) { MG.grabbed = null; MG.grabbedIndex = -1; }
    else MG.grabbedIndex = gi;
  }

  if (MG.dragActive && Math.random() < 0.4) {
    MG.sparks.push({
      x: MG.dragX - cx, y: MG.dragY - cy,
      vx: (Math.random() - 0.5) * 30,
      vy: (Math.random() - 0.5) * 30,
      age: 0, life: 0.35, trail: true,
    });
  }

  if (MG.dragActive && MG.grabbedIndex >= 0 && MG.grabbedIndex < MG.fieldParticles.length) {
    const p = MG.fieldParticles[MG.grabbedIndex];
    if (!p.fixed) {
      const fx = MG.dragX - cx, fy = MG.dragY - cy;
      const dx = fx - p.x, dy = fy - p.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < MG_ASSEMBLE.fingerRadius) {
        const force = (1 - d / MG_ASSEMBLE.fingerRadius) * MG_ASSEMBLE.fingerForce;
        p.vx += (dx / d) * force * dt;
        p.vy += (dy / d) * force * dt;
      }
    }
  }

  for (let i = 0; i < MG.fieldParticles.length; i++) {
    const p = MG.fieldParticles[i];
    if (p.fixed) continue;
    const isGrabbed = (i === MG.grabbedIndex);
    const friction = isGrabbed ? 0.96 : 0.85;
    p.vx *= friction; p.vy *= friction;
    if (!isGrabbed && Math.abs(p.vx) < 2) p.vx = 0;
    if (!isGrabbed && Math.abs(p.vy) < 2) p.vy = 0;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (Math.abs(p.x) > MG.fieldHalfW) {
      p.x = Math.sign(p.x) * MG.fieldHalfW; p.vx *= -0.7;
    }
    if (Math.abs(p.y) > MG.fieldHalfH) {
      p.y = Math.sign(p.y) * MG.fieldHalfH; p.vy *= -0.7;
    }
  }

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

      const totalMass = a.mass + b.mass;
      const uniqueColors = [];
      for (let ci = 0; ci < a.colors.length; ci++) {
        if (uniqueColors.indexOf(a.colors[ci]) === -1) uniqueColors.push(a.colors[ci]);
      }
      for (let ci = 0; ci < b.colors.length; ci++) {
        if (uniqueColors.indexOf(b.colors[ci]) === -1) uniqueColors.push(b.colors[ci]);
      }

      const newCounts = {};
      if (a.colorCounts) for (const k in a.colorCounts) newCounts[k] = (newCounts[k] || 0) + a.colorCounts[k];
      if (b.colorCounts) for (const k in b.colorCounts) newCounts[k] = (newCounts[k] || 0) + b.colorCounts[k];

      let mergeResult = null;
      if (totalMass <= 4 && uniqueColors.length <= 4) {
        mergeResult = { colors: uniqueColors, mass: totalMass, colorCounts: newCounts };
      }

      if (mergeResult) {
        a.x = (a.x + b.x) / 2;
        a.y = (a.y + b.y) / 2;
        a.vx = (a.vx + b.vx) / 2;
        a.vy = (a.vy + b.vy) / 2;
        a.colors = mergeResult.colors;
        a.colorCounts = mergeResult.colorCounts;
        a.mass = mergeResult.mass;
        a.r = MG_ASSEMBLE.baseRadius + (a.mass - 1) * MG_ASSEMBLE.radiusStep;

        MG.fieldParticles.splice(j, 1);
        j--;
        if (MG.grabbed === b) MG.grabbed = a;

        for (let s = 0; s < 12; s++) {
          const sa = Math.random() * Math.PI * 2;
          const ss = 60 + Math.random() * 120;
          MG.sparks.push({
            x: a.x, y: a.y,
            vx: Math.cos(sa) * ss, vy: Math.sin(sa) * ss,
            age: 0, life: 0.6,
          });
        }

        if (a.mass >= 4) {
          a.fixed = true; a.vx = 0; a.vy = 0;
          if (!MG.result) {
            MG.result = determinePlanetFromColors(a.colorCounts);
            MG.resultLabel = PLANET_TYPES[MG.result].name;
            MG.finishAt = performance.now();
          }
        }
      } else {
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

function determinePlanetFromColors(colorCounts) {
  if (!colorCounts) return 'superEarth';
  const keys = Object.keys(colorCounts);
  if (keys.length === 0) return 'superEarth';
  if (keys.length >= 4) return 'superEarth';
  if (keys.length === 1) return _COLOR_TO_PLANET[keys[0]] || 'rocky';

  let bestKey = keys[0], bestCount = -1;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (colorCounts[k] > bestCount) { bestCount = colorCounts[k]; bestKey = k; }
  }
  return _COLOR_TO_PLANET[bestKey] || 'rocky';
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

  if (MG.type === 'assemble') drawAssemble(ctx, cx, cy, t);

  if (S.seenMinigame && S.seenMinigame[MG.type + '_shown']) {
    ctx.save();
    ctx.textAlign = 'right';
    ctx.font = '11px -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(139, 127, 212, 0.7)';
    ctx.fillText('Пропустить ▸', window.CANVAS_W - 16, 32);
    ctx.restore();
  }
}

function drawAssemble(ctx, cx, cy, t) {
  const left = Math.max(0, MG_ASSEMBLE.duration - (MG.elapsedSec || 0));

  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 16px -apple-system, sans-serif';
  ctx.fillStyle = '#e8e2ff';
  ctx.fillText('Собери планету', cx, cy - MG.fieldHalfH - 60);

  const COLOR_LABEL = {
    ice:   { color: '#3b9eff', name: 'Лёд'   },
    lava:  { color: '#ff2d2d', name: 'Лава'  },
    stone: { color: '#00e639', name: 'Камень'},
    gas:   { color: '#ffd633', name: 'Газ'   },
  };
  const PLANET_LABEL = {
    iceGiant:   'Ледяной гигант',
    lava:       'Лава-планета',
    rocky:      'Каменная',
    gasGiant:   'Газовый гигант',
    superEarth: 'Земля',
  };

  const allowedColors = (MG.availableColors && MG.availableColors.length) ? MG.availableColors : ['ice', 'lava', 'stone', 'gas'];
  const allowedPlanets = MG.allowedPlanets || [];

  const hintY = cy - MG.fieldHalfH - 38;
  ctx.font = 'bold 11px -apple-system, sans-serif';
  ctx.fillStyle = '#a89ce0';
  ctx.fillText('Можно собрать:', cx, hintY);

  const items = [];
  for (let pi = 0; pi < allowedPlanets.length; pi++) {
    const planetKey = allowedPlanets[pi];
    if (planetKey === 'superEarth') continue;
    const planetName = PLANET_LABEL[planetKey] || planetKey;
    let color = '#b9a8ff';
    const reverse = { iceGiant:'ice', lava:'lava', rocky:'stone', gasGiant:'gas' };
    for (let ck in COLOR_LABEL) {
      if (reverse[planetKey] === ck) color = COLOR_LABEL[ck].color;
    }
    items.push({ color: color, text: '×' + MG_ASSEMBLE.colorsPerType + ' ' + planetName });
  }

  if (items.length > 0) {
    const lineY = hintY + 20;
    const totalTextW = items.reduce(function(acc, it) {
      return acc + 10 + ctx.measureText(it.text).width + 14;
    }, 0);
    let cursorX = cx - totalTextW / 2;

    for (let ii = 0; ii < items.length; ii++) {
      const it = items[ii];
      ctx.beginPath();
      ctx.fillStyle = it.color;
      ctx.arc(cursorX + 5, lineY - 3, 4, 0, Math.PI * 2);
      ctx.fill();
      cursorX += 12;

      ctx.font = 'bold 11px -apple-system, sans-serif';
      ctx.fillStyle = '#e8e2ff';
      ctx.textAlign = 'left';
      ctx.fillText(it.text, cursorX, lineY);
      cursorX += ctx.measureText(it.text).width + 14;
    }
    ctx.textAlign = 'center';
  }

  if (allowedPlanets.indexOf('superEarth') !== -1) {
    const eqY = hintY + 40;
    ctx.font = 'bold 11px -apple-system, sans-serif';
    ctx.fillStyle = '#5ee0a0';
    ctx.fillText('🌈 Земля · 4 разных цвета', cx, eqY);
  }

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
    ctx.fillText(left.toFixed(1) + 'с · суперземля по умолчанию', cx, by + 22);
  }
  ctx.restore();

  const legendY = cy + MG.fieldHalfH + 48;
  const legendItems = (MG.availableColors && MG.availableColors.length) ? MG.availableColors : ['ice', 'lava', 'stone', 'gas'];
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

  for (let i = 0; i < MG.fieldParticles.length; i++) {
    drawAssembleParticle(ctx, MG.fieldParticles[i], cx, cy, t, i);
  }

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

function drawAssembleParticle(ctx, p, cx, cy, t, idx) {
  const sx = cx + p.x, sy = cy + p.y;
  const colorCount = p.colors.length;

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

  if (colorCount === 1) {
    const color = ASSEMBLE_TYPES[p.colors[0]].color;
    const g = ctx.createRadialGradient(sx - p.r * 0.3, sy - p.r * 0.3, 0, sx, sy, p.r);
    g.addColorStop(0, lightenHex(color, 0.35));
    g.addColorStop(1, darkenHex(color, 0.3));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, p.r, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // ★ Круговая диаграмма
    let currentAngle = (p.x * 13.7 + p.y * 41.3) % (Math.PI * 2);
    for (let i = 0; i < p.colors.length; i++) {
      const colorKey = p.colors[i];
      const count = p.colorCounts[colorKey];
      const angleSize = (count / p.mass) * Math.PI * 2;
      const color = ASSEMBLE_TYPES[colorKey].color;
      
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.arc(sx, sy, p.r, currentAngle, currentAngle + angleSize);
      ctx.closePath();
      
      const grad = ctx.createRadialGradient(sx - p.r * 0.3, sy - p.r * 0.3, 0, sx, sy, p.r);
      grad.addColorStop(0, lightenHex(color, 0.35));
      grad.addColorStop(1, darkenHex(color, 0.3));
      ctx.fillStyle = grad;
      ctx.fill();
      
      if (i > 0) {
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(currentAngle) * p.r, sy + Math.sin(currentAngle) * p.r);
        ctx.stroke();
      }
      currentAngle += angleSize;
    }
    
    const gv = ctx.createRadialGradient(sx, sy, p.r * 0.4, sx, sy, p.r);
    gv.addColorStop(0, 'rgba(255,255,255,0.15)');
    gv.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = gv;
    ctx.beginPath();
    ctx.arc(sx, sy, p.r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = p.fixed ? 3 : (p.mass >= 2 ? 2 : 1.5);
  ctx.beginPath();
  ctx.arc(sx, sy, p.r, 0, Math.PI * 2);
  ctx.stroke();

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

  let dominantKey = p.colors[0];
  let maxCount = -1;
  for (let ck in p.colorCounts) {
    if (p.colorCounts[ck] > maxCount) {
      maxCount = p.colorCounts[ck];
      dominantKey = ck;
    }
  }

  let label = null;
  let labelColor = '#e8e2ff';
  
  if (colorCount === 1) {
    label = ASSEMBLE_TYPES[p.colors[0]].name;
  } else if (colorCount >= 4) {
    label = 'Земля';
    labelColor = '#5ee0a0';
  } else {
    label = colorCount + ' цв.: ' + ASSEMBLE_TYPES[dominantKey].name + ' (осн.)';
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

function mgPointerDown(x, y) {
  if (!MG.type) return;
  if (y < 50 && x > (window.CANVAS_W || 400) - 120) {
    if (S.seenMinigame && S.seenMinigame[MG.type + '_shown']) endMinigame(false);
    return;
  }
  if (MG.type === 'assemble') {
    MG.dragActive = true;
    MG.dragX = x;
    MG.dragY = y;

    const cx = window.CANVAS_CX || 0, cy = window.CANVAS_CY || 0;
    const fx = x - cx, fy = y - cy;
    let bestIdx = -1;
    let bestD2 = MG_ASSEMBLE.fingerRadius * MG_ASSEMBLE.fingerRadius;
    for (let i = 0; i < MG.fieldParticles.length; i++) {
      const p = MG.fieldParticles[i];
      if (p.fixed) continue;
      const dx = p.x - fx, dy = p.y - fy;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; bestIdx = i; }
    }
    MG.grabbedIndex = bestIdx;
    MG.grabbed = bestIdx >= 0 ? MG.fieldParticles[bestIdx] : null;
  }
}

function mgPointerMove(x, y) {
  if (!MG.type) return;
  if (MG.type === 'assemble') {
    MG.dragX = x;
    MG.dragY = y;
  }
}

function mgPointerUp() {
  MG.dragActive = false;
  MG.grabbedIndex = -1;
  MG.grabbed = null;
}

window.startMinigame = startMinigame;
window.updateMinigame = updateMinigame;
window.drawMinigame = drawMinigame;
window.mgPointerDown = mgPointerDown;
window.mgPointerMove = mgPointerMove;
window.mgPointerUp = mgPointerUp;
window.MG = MG;