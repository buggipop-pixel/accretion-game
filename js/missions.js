// ═══════════════════════════════════════════════════════════════
//  MINIGAMES.JS — масс (воронка), ignite, accretion
//  Увеличены тайминги. Масс: игрок крутит пальцем → воронка сама тянет
// ═══════════════════════════════════════════════════════════════

const MG = {
  type: null,
  startAt: 0,
  duration: 10000,
  onComplete: null,
  particles: [],
  power: 0,
  chunks: [],
  progress: 0,
  dragX: 0, dragY: 0, dragActive: false,
  lastAngle: null,
  rotations: 0,
  targetRotations: 3,
  vortexActive: false,
  vortexStart: 0,
  trail: [],
};

const MG_DURATIONS = {
  mass: 20000,       // было 12000 → 20000
  ignite: 15000,     // было 10000 → 15000
  accretion: 20000,  // было 15000 → 20000
};

// ─── Запуск ─────────────────────────────────────────────────────
function startMinigame(type, onComplete) {
  MG.type = type;
  MG.startAt = performance.now();
  MG.onComplete = onComplete;
  MG.duration = MG_DURATIONS[type] || 15000;
  MG.particles = [];
  MG.power = 0;
  MG.chunks = [];
  MG.progress = 0;
  MG.dragActive = false;
  MG.lastAngle = null;
  MG.rotations = 0;
  MG.vortexActive = false;
  MG.vortexStart = 0;
  MG.trail = [];

  if (type === 'mass') {
    // Частицы на диске вокруг центра
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 60 + Math.random() * 150;
      MG.particles.push({
        x: Math.cos(a) * r,
        y: Math.sin(a) * r * 0.85,
        vx: 0, vy: 0,
        r: 1.4 + Math.random() * 1.6,
        hue: 200 + Math.random() * 60,
        spin: 0,
      });
    }
  } else if (type === 'ignite') {
    // Ничего дополнительно — только центр
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
  const elapsed = (performance.now() - MG.startAt) / 1000;
  const cx = window.CANVAS_CX || 0;
  const cy = window.CANVAS_CY || 0;

  // Затухание трейла
  for (let i = MG.trail.length - 1; i >= 0; i--) {
    MG.trail[i].age += dt;
    if (MG.trail[i].age > 0.55) MG.trail.splice(i, 1);
  }

  // ═══ MASS — воронка ═══
  if (MG.type === 'mass') {
    // Если drag активен, обновляем trail и считаем поворот
    if (MG.dragActive) {
      const dx = MG.dragX - cx;
      const dy = MG.dragY - cy;
      const distFromCenter = Math.hypot(dx, dy);

      if (distFromCenter > 35) {
        MG.trail.push({ x: MG.dragX, y: MG.dragY, age: 0 });

        const angle = Math.atan2(dy, dx);
        if (MG.lastAngle !== null) {
          let delta = angle - MG.lastAngle;
          // Нормализация через ±π
          while (delta > Math.PI) delta -= Math.PI * 2;
          while (delta < -Math.PI) delta += Math.PI * 2;
          MG.rotations += Math.abs(delta) / (Math.PI * 2);
        }
        MG.lastAngle = angle;
      }
    }

    // Прогресс — по вращениям (только пока воронка не активна)
    if (!MG.vortexActive) {
      MG.progress = Math.min(1, MG.rotations / MG.targetRotations);
      if (MG.progress >= 1) {
        MG.vortexActive = true;
        MG.vortexStart = performance.now();
      }
    }

    // Обновление частиц
    if (MG.vortexActive) {
      // ★ Воронка активна — всё затягивается
      const vortexAge = (performance.now() - MG.vortexStart) / 1000;
      const vortexPower = Math.min(1, vortexAge * 1.2);

      for (let i = MG.particles.length - 1; i >= 0; i--) {
        const p = MG.particles[i];
        const d = Math.hypot(p.x, p.y) || 1;
        const dirX = -p.x / d;
        const dirY = -p.y / d;
        const tanX = -p.y / d;
        const tanY = p.x / d;

        // Спиральное засасывание
        p.vx += dirX * 900 * vortexPower * dt;
        p.vy += dirY * 900 * vortexPower * dt;
        p.vx += tanX * 600 * vortexPower * dt;
        p.vy += tanY * 600 * vortexPower * dt;
        p.vx *= 0.94;
        p.vy *= 0.94;
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        if (d < 18) MG.particles.splice(i, 1);
      }

      // Завершение через 2.2с после активации
      if (performance.now() - MG.vortexStart > 2200) {
        endMinigame(true);
        return;
      }
    } else {
      // Лёгкий дрейф — частицы медленно вращаются
      for (const p of MG.particles) {
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }

    // Провал по времени
    if (elapsed > MG.duration / 1000) {
      endMinigame(MG.progress > 0.5);
      return;
    }

  // ═══ IGNITE ═══
  } else if (MG.type === 'ignite') {
    MG.power = Math.max(0, MG.power - dt * 0.12);
    MG.progress = MG.power;
    if (MG.power >= 1) { endMinigame(true); return; }
    if (elapsed > MG.duration / 1000) endMinigame(MG.power > 0.6);

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
      c.vx *= 0.97;
      c.vy *= 0.97;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
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
    if (elapsed > MG.duration / 1000) endMinigame(MG.progress > 0.6);
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

  const elapsed = (performance.now() - MG.startAt) / 1000;
  const left = Math.max(0, MG.duration / 1000 - elapsed);

  // Заголовок
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8e2ff';
  ctx.font = 'bold 16px -apple-system, sans-serif';

  let title = '', sub = '';
  if (MG.type === 'mass') {
    title = 'Создай воронку';
    sub = MG.vortexActive ? 'ВОРОНКА ЗАПУЩЕНА!' : 'Крути пальцем вокруг центра';
  } else if (MG.type === 'ignite') {
    title = 'Зажги синтез';
    sub = 'Тапай по центру';
  } else if (MG.type === 'accretion') {
    title = 'Направь аккрецию';
    sub = 'Свайпами сталкивай обломки';
  }
  ctx.fillText(title, cx, cy - 230);
  ctx.font = '13px -apple-system, sans-serif';
  ctx.fillStyle = MG.vortexActive ? '#ffb347' : '#a89ce0';
  ctx.fillText(sub, cx, cy - 208);

  // Прогресс-бар
  const barW = 240, barH = 6;
  const bx = cx - barW / 2, by = cy + 210;
  ctx.fillStyle = 'rgba(139, 127, 212, 0.2)';
  ctx.fillRect(bx, by, barW, barH);
  ctx.fillStyle = MG.vortexActive ? '#ffb347' : '#b9a8ff';
  ctx.fillRect(bx, by, barW * MG.progress, barH);
  ctx.font = '11px -apple-system, sans-serif';
  ctx.fillStyle = '#8b7fd4';
  ctx.fillText(Math.floor(MG.progress * 100) + '% · ' + left.toFixed(1) + 'с', cx, by + 22);

  // ═══ MASS ═══
  if (MG.type === 'mass') {
    // Пылинки
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of MG.particles) {
      const sx = cx + p.x;
      const sy = cy + p.y;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, p.r * 4);
      g.addColorStop(0, 'hsla(' + p.hue + ', 90%, 85%, 1)');
      g.addColorStop(0.5, 'hsla(' + p.hue + ', 80%, 65%, 0.5)');
      g.addColorStop(1, 'hsla(' + p.hue + ', 70%, 50%, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, p.r * 4, 0, Math.PI * 2);
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
        const alpha = Math.max(0, 1 - b.age / 0.55);
        ctx.strokeStyle = 'rgba(200, 180, 255, ' + (alpha * 0.7) + ')';
        ctx.lineWidth = 3 * alpha + 1;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Кольцо прогресса вокруг центра
    if (MG.progress > 0 && !MG.vortexActive) {
      ctx.save();
      ctx.strokeStyle = 'hsla(' + (260 + MG.progress * 100) + ', 90%, 70%, ' +
                         (0.4 + MG.progress * 0.6) + ')';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, cy, 100, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * MG.progress);
      ctx.stroke();
      ctx.restore();
    }

    // Пульсация воронки при активации
    if (MG.vortexActive) {
      const vortexAge = (performance.now() - MG.vortexStart) / 1000;
      for (let k = 0; k < 3; k++) {
        const r = 100 + k * 30 + vortexAge * 80;
        const alpha = Math.max(0, 0.6 - vortexAge * 0.3 - k * 0.15);
        if (alpha <= 0) continue;
        ctx.strokeStyle = 'rgba(255, 200, 120, ' + alpha + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Центр
    const pulse = 1 + MG.progress * 0.6;
    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 30 * pulse);
    cg.addColorStop(0, 'rgba(255, 240, 200, ' + (0.5 + MG.progress * 0.5) + ')');
    cg.addColorStop(0.5, 'rgba(255, 180, 80, ' + (0.2 + MG.progress * 0.4) + ')');
    cg.addColorStop(1, 'rgba(255, 100, 40, 0)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(cx, cy, 30 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 250, 220, 1)';
    ctx.beginPath();
    ctx.arc(cx, cy, 6 * pulse, 0, Math.PI * 2);
    ctx.fill();

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

  // Пропуск — верхний правый угол
  if (y < 50 && x > (window.CANVAS_W || 400) - 120) {
    endMinigame(false);
    return;
  }

  if (MG.type === 'mass') {
    MG.dragActive = true;
    MG.dragX = x;
    MG.dragY = y;
    MG.lastAngle = null;

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
  if (MG.type === 'mass') {
    MG.dragX = x;
    MG.dragY = y;
    // angle обновляем в updateMinigame
  } else if (MG.type === 'accretion') {
    MG.dragX = x;
    MG.dragY = y;
  }
}

function mgPointerUp() {
  MG.dragActive = false;
  MG.lastAngle = null;
}

// ─── Экспорт ────────────────────────────────────────────────────
window.startMinigame = startMinigame;
window.updateMinigame = updateMinigame;
window.drawMinigame = drawMinigame;
window.mgPointerDown = mgPointerDown;
window.mgPointerMove = mgPointerMove;
window.mgPointerUp = mgPointerUp;
window.MG = MG;
