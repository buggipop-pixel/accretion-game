// ═══════════════════════════════════════════════════════════════
//  MINIGAMES.JS — mass (вихрь без таймера), ignite, accretion
// ═══════════════════════════════════════════════════════════════

const MG = {
  type: null,
  startAt: 0,
  onComplete: null,
  particles: [],
  power: 0,
  chunks: [],
  progress: 0,
  dragX: 0, dragY: 0, dragActive: false,
  trail: [],
  capturedCount: 0,
  finishAt: 0,
};

// ─── Параметры вихря ────────────────────────────────────────────
const VORTEX = {
  fingerRadius: 140,     // радиус действия пальца (было 110)
  fingerForce: 2400,     // сила притяжения (было 1600)
  captureRadius: 130,    // радиус захвата (было 95)
  orbitDecay: 0.05,      // очень медленное сползание (было 0.35)
  minOrbitR: 25,
  slowDrift: 12,
  maxDrift: 300,
};

// ─── Запуск ─────────────────────────────────────────────────────
function startMinigame(type, onComplete) {
  MG.type = type;
  MG.startAt = performance.now();
  MG.onComplete = onComplete;
  MG.particles = [];
  MG.power = 0;
  MG.chunks = [];
  MG.progress = 0;
  MG.dragActive = false;
  MG.trail = [];
  MG.capturedCount = 0;
  MG.finishAt = 0;

  if (type === 'mass') {
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
  } else if (type === 'accretion') {
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

// ─── Обновление ─────────────────────────────────────────────────
function updateMinigame(dt, time) {
  const cx = window.CANVAS_CX || 0;
  const cy = window.CANVAS_CY || 0;

  // Затухание трейла
  for (let i = MG.trail.length - 1; i >= 0; i--) {
    MG.trail[i].age += dt;
    if (MG.trail[i].age > 0.7) MG.trail.splice(i, 1);
  }

  // ═══ MASS — вихрь ═══
  if (MG.type === 'mass') {
    if (MG.dragActive) {
      MG.trail.push({ x: MG.dragX, y: MG.dragY, age: 0 });
    }

    for (const p of MG.particles) {
      // ★ ЗАХВАЧЕННАЯ ЧАСТИЦА — крутится вокруг центра
      if (p.captured) {
        p.orbitAngle += p.orbitSpeed * dt;
        p.orbitRadius -= p.orbitRadius * VORTEX.orbitDecay * dt;
        if (p.orbitRadius < VORTEX.minOrbitR) p.orbitRadius = VORTEX.minOrbitR;
        p.x = Math.cos(p.orbitAngle) * p.orbitRadius;
        p.y = Math.sin(p.orbitAngle) * p.orbitRadius * 0.85;
        continue;
      }

      // ─── СВОБОДНАЯ ЧАСТИЦА ───
      // Притяжение к пальцу
      if (MG.dragActive) {
        const tdx = (MG.dragX - cx) - p.x;
        const tdy = (MG.dragY - cy) - p.y;
        const td = Math.hypot(tdx, tdy) || 1;
        if (td < VORTEX.fingerRadius) {
          const force = (1 - td / VORTEX.fingerRadius) * VORTEX.fingerForce;
          p.vx += (tdx / td) * force * dt;
          p.vy += (tdy / td) * force * dt;
        }
      }

      // Слабый дрейф к центру
      const dCenter = Math.hypot(p.x, p.y) || 1;
      if (dCenter < VORTEX.maxDrift) {
        const drift = VORTEX.slowDrift * (1 - dCenter / VORTEX.maxDrift);
        p.vx += (-p.x / dCenter) * drift * dt;
        p.vy += (-p.y / dCenter) * drift * dt;
      }

      p.vx *= 0.94;
      p.vy *= 0.94;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // ★ Захват: как только частица в радиусе captureRadius
      const d = Math.hypot(p.x, p.y);
      if (d < VORTEX.captureRadius) {
        p.captured = true;
        p.orbitAngle = Math.atan2(p.y, p.x);
        p.orbitRadius = Math.max(VORTEX.minOrbitR, d);
        const tanSpeed = Math.hypot(p.vx, p.vy);
        p.orbitSpeed = Math.max(1.5, Math.min(5.0, 1.5 + tanSpeed / 100));
      }

      // Граница
      const maxR = 400;
      if (d > maxR) {
        p.x = (p.x / d) * maxR;
        p.y = (p.y / d) * maxR;
        p.vx *= 0.5;
        p.vy *= 0.5;
      }
    }

    MG.capturedCount = 0;
    for (const p of MG.particles) if (p.captured) MG.capturedCount++;
    MG.progress = MG.capturedCount / MG.particles.length;

    // Победа
    if (MG.progress >= 1) {
      if (!MG.finishAt) MG.finishAt = performance.now();
      if (performance.now() - MG.finishAt > 1500) {
        endMinigame(true);
        return;
      }
    }
    // ★ НЕТ никакой проверки по таймеру для mass!

  // ═══ IGNITE ═══
  } else if (MG.type === 'ignite') {
    MG.power = Math.max(0, MG.power - dt * 0.12);
    MG.progress = MG.power;
    if (MG.power >= 1) { endMinigame(true); return; }

  // ═══ ACCRETION ═══
  } else if (MG.type === 'accretion') {
    const wx = MG.dragActive ? (MG.dragX - cx) : 0;
    const wy = MG.dragActive ? (MG.dragY - cy) : 0;
    for (const c of MG.chunks) {
      if (MG.dragActive) {
        const dx = c.x - wx, dy = c.y - wy;
        const d = Math.hypot(dx, dy) || 1;
        if (d < 80) { c.vx += dx / d * 300 * dt; c.vy += dy / d * 300 * dt; }
      }
      c.vx *= 0.97; c.vy *= 0.97;
      c.x += c.vx * dt; c.y += c.vy * dt;
      if (Math.abs(c.x) > 260) c.vx *= -0.8;
      if (Math.abs(c.y) > 190) c.vy *= -0.8;
      c.x = Math.max(-260, Math.min(260, c.x));
      c.y = Math.max(-190, Math.min(190, c.y));
    }
    for (let i = 0; i < MG.chunks.length; i++) {
      for (let j = i + 1; j < MG.chunks.length; j++) {
        const a = MG.chunks[i], b = MG.chunks[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < a.r + b.r) {
          const merged = {
            x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
            vx: (a.vx + b.vx) / 2, vy: (a.vy + b.vy) / 2,
            r: Math.min(40, a.r + b.r * 0.6), type: a.type,
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
    const maxLevel = MG.chunks.reduce((m, c) => Math.max(m, c.level), 0);
    MG.progress = Math.min(1, maxLevel / 5);
    if (MG.progress >= 1) { endMinigame(true); return; }
  }
}

// ─── Рисование ──────────────────────────────────────────────────
function drawMinigame(ctx, time) {
  const cx = window.CANVAS_CX || 0;
  const cy = window.CANVAS_CY || 0;
  const t = time;

  ctx.save();
  ctx.fillStyle = 'rgba(2, 1, 10, 0.55)';
  ctx.fillRect(0, 0, window.CANVAS_W, window.CANVAS_H);
  ctx.restore();

  // Заголовок
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8e2ff';
  ctx.font = 'bold 16px -apple-system, sans-serif';

  let title = '', sub = '';
  if (MG.type === 'mass') {
    title = 'Создай вихрь';
    sub = MG.progress >= 1 ? '★ ГОТОВО' : 'Раскрути пыль вокруг центра';
  } else if (MG.type === 'ignite') {
    title = 'Зажги синтез';
    sub = 'Тапай по центру';
  } else if (MG.type === 'accretion') {
    title = 'Направь аккрецию';
    sub = 'Свайпами сталкивай обломки';
  }
  ctx.fillText(title, cx, cy - 230);
  ctx.font = '13px -apple-system, sans-serif';
  ctx.fillStyle = MG.progress >= 1 ? '#ffb347' : '#a89ce0';
  ctx.fillText(sub, cx, cy - 208);

  // Прогресс-бар — БЕЗ таймера, только счётчик
  const barW = 240, barH = 6;
  const bx = cx - barW / 2, by = cy + 210;
  ctx.fillStyle = 'rgba(139, 127, 212, 0.2)';
  ctx.fillRect(bx, by, barW, barH);
  ctx.fillStyle = MG.progress >= 1 ? '#ffb347' : '#b9a8ff';
  ctx.fillRect(bx, by, barW * MG.progress, barH);

  ctx.font = '11px -apple-system, sans-serif';
  ctx.fillStyle = '#8b7fd4';
  let statusText = '';
  if (MG.type === 'mass') {
    statusText = MG.capturedCount + ' / ' + MG.particles.length + ' частиц';
  } else {
    statusText = Math.floor(MG.progress * 100) + '%';
  }
  ctx.fillText(statusText, cx, by + 22);

  // ═══ MASS ═══
  if (MG.type === 'mass') {
    // ★ Кольцо захвата — пунктир
    ctx.save();
    ctx.strokeStyle = 'rgba(160, 130, 240, ' + (0.2 + MG.progress * 0.4) + ')';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.arc(cx, cy, VORTEX.captureRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // ★ Вихревые спиральные линии — когда есть захваченные
    if (MG.capturedCount > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const spirals = 3;
      for (let s = 0; s < spirals; s++) {
        const baseAngle = t * 0.8 + (s / spirals) * Math.PI * 2;
        ctx.strokeStyle = 'rgba(180, 140, 255, ' + (0.15 + MG.progress * 0.35) + ')';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let rr = VORTEX.minOrbitR; rr < VORTEX.captureRadius; rr += 5) {
          const a = baseAngle + rr * 0.06;
          const x = cx + Math.cos(a) * rr;
          const y = cy + Math.sin(a) * rr * 0.85;
          if (rr === VORTEX.minOrbitR) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    // Пылинки
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of MG.particles) {
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

      // ★ Орбитальный след для захваченной частицы
      if (p.captured) {
        ctx.strokeStyle = 'hsla(' + p.hue + ', 80%, 70%, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, p.orbitRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
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

    // Ядро
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

    // Подсказка — круговая стрелка
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

  // ═══ IGNITE ═══
  } else if (MG.type === 'ignite') {
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
    ctx.font = 'bold 14px -apple-system, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText('ТАП', cx, cy + 90);

  // ═══ ACCRETION ═══
  } else if (MG.type === 'accretion') {
    for (const c of MG.chunks) {
      const sx = cx + c.x;
      const sy = cy + c.y;
      let col = '#8a7159';
      if (c.type === 'ice') col = '#7ec8e3';
      if (c.type === 'fire') col = '#ff4a22';
      if (c.type === 'gas') col = '#d4a76a';
      const g = ctx.createRadialGradient(sx - c.r * 0.3, sy - c.r * 0.3, 0, sx, sy, c.r * 1.5);
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
  }
  ctx.restore();

  // Кнопка пропуска
  ctx.save();
  ctx.textAlign = 'right';
  ctx.font = '11px -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(139, 127, 212, 0.7)';
  ctx.fillText('Пропустить ▸', window.CANVAS_W - 16, 32);
  ctx.restore();
}

// ─── Ввод ───────────────────────────────────────────────────────
function mgPointerDown(x, y) {
  if (!MG.type) return;
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
    if (Math.hypot(x - cx, y - cy) < 150) {
      MG.power = Math.min(1, MG.power + 0.08);
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

window.startMinigame = startMinigame;
window.updateMinigame = updateMinigame;
window.drawMinigame = drawMinigame;
window.mgPointerDown = mgPointerDown;
window.mgPointerMove = mgPointerMove;
window.mgPointerUp = mgPointerUp;
window.MG = MG;
