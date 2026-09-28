// MINIGAMES.JS — три мини-игры на переходах фаз
const MG = {
  type: null, startAt: 0, duration: 10000, onComplete: null,
  particles: [], power: 0, chunks: [], progress: 0,
  dragX: 0, dragY: 0, dragActive: false,
};

function startMinigame(type, onComplete) {
  MG.type = type;
  MG.startAt = performance.now();
  MG.onComplete = onComplete;
  MG.particles = []; MG.power = 0; MG.chunks = []; MG.progress = 0;
  MG.dragActive = false;

  if (type === 'mass') {
    MG.duration = 12000;
    for (let i = 0; i < 80; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 120 + Math.random() * 200;
      MG.particles.push({
        x: Math.cos(a) * r, y: Math.sin(a) * r * 0.7,
        vx: 0, vy: 0, r: 1 + Math.random() * 2,
        hue: 200 + Math.random() * 60,
      });
    }
  } else if (type === 'ignite') {
    MG.duration = 10000;
  } else if (type === 'accretion') {
    MG.duration = 15000;
    const types = ['stone', 'ice', 'fire', 'gas'];
    for (let i = 0; i < 8; i++) {
      MG.chunks.push({
        x: (Math.random() * 2 - 1) * 200, y: (Math.random() * 2 - 1) * 150,
        vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30,
        r: 12, type: types[i % 4], level: 1,
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

function updateMinigame(dt, time) {
  const elapsed = (performance.now() - MG.startAt) / 1000;
  const cx = window.CANVAS_CX || 0;
  const cy = window.CANVAS_CY || 0;

  if (MG.type === 'mass') {
    const wx = MG.dragActive ? (MG.dragX - cx) : 0;
    const wy = MG.dragActive ? (MG.dragY - cy) : 0;
    for (let i = MG.particles.length - 1; i >= 0; i--) {
      const p = MG.particles[i];
      const d = Math.hypot(p.x, p.y) || 1;
      let ax = -p.x / d * 15, ay = -p.y / d * 15;
      if (MG.dragActive) {
        const tdx = wx - p.x, tdy = wy - p.y;
        const td = Math.hypot(tdx, tdy) || 1;
        if (td < 100) { ax += tdx / td * 400; ay += tdy / td * 400; }
      }
      p.vx += ax * dt; p.vy += ay * dt;
      p.vx *= 0.94; p.vy *= 0.94;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (d < 18) MG.particles.splice(i, 1);
    }
    MG.progress = Math.min(1, (80 - MG.particles.length) / 70);
    if (MG.progress >= 1) endMinigame(true);
    if (elapsed > MG.duration / 1000) endMinigame(MG.progress > 0.6);

  } else if (MG.type === 'ignite') {
    MG.power = Math.max(0, MG.power - dt * 0.15);
    MG.progress = MG.power;
    if (MG.power >= 1) endMinigame(true);
    if (elapsed > MG.duration / 1000) endMinigame(MG.power > 0.6);

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
          MG.chunks.splice(j, 1); MG.chunks.splice(i, 1);
          MG.chunks.push(merged); i = -1; break;
        }
      }
      if (i < 0) break;
    }
    const maxLevel = MG.chunks.reduce((m, c) => Math.max(m, c.level), 0);
    MG.progress = Math.min(1, maxLevel / 5);
    if (MG.progress >= 1) endMinigame(true);
    if (elapsed > MG.duration / 1000) endMinigame(MG.progress > 0.6);
  }
}

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

  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8e2ff';
  ctx.font = 'bold 16px -apple-system, sans-serif';

  let title = '', sub = '';
  if (MG.type === 'mass') { title = 'Собери критическую массу'; sub = 'Тяни пальцем частицы к центру'; }
  else if (MG.type === 'ignite') { title = 'Зажги синтез'; sub = 'Тапай по центру'; }
  else if (MG.type === 'accretion') { title = 'Направь аккрецию'; sub = 'Свайпами сталкивай обломки'; }
  ctx.fillText(title, cx, cy - 220);
  ctx.font = '12px -apple-system, sans-serif';
  ctx.fillStyle = '#a89ce0';
  ctx.fillText(sub, cx, cy - 200);

  const barW = 240, barH = 6;
  const bx = cx - barW / 2, by = cy + 200;
  ctx.fillStyle = 'rgba(139, 127, 212, 0.2)';
  ctx.fillRect(bx, by, barW, barH);
  ctx.fillStyle = '#b9a8ff';
  ctx.fillRect(bx, by, barW * MG.progress, barH);
  ctx.font = '11px -apple-system, sans-serif';
  ctx.fillStyle = '#8b7fd4';
  ctx.fillText(Math.floor(MG.progress * 100) + '% · ' + left.toFixed(1) + 'с', cx, by + 22);

  if (MG.type === 'mass') {
    ctx.globalCompositeOperation = 'lighter';
    for (const p of MG.particles) {
      const sx = cx + p.x, sy = cy + p.y;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, p.r * 3);
      g.addColorStop(0, 'hsla(' + p.hue + ', 80%, 80%, 1)');
      g.addColorStop(1, 'hsla(' + p.hue + ', 70%, 50%, 0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(sx, sy, p.r * 3, 0, Math.PI * 2); ctx.fill();
    }
    const pg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 30);
    pg.addColorStop(0, 'rgba(255, 240, 200, 0.9)');
    pg.addColorStop(1, 'rgba(255, 200, 120, 0)');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(cx, cy, 30, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

  } else if (MG.type === 'ignite') {
    const pulse = 1 + MG.power * 0.5;
    const coreR = (15 + MG.power * 30) * pulse;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 4);
    g.addColorStop(0, 'rgba(255, 240, 200, ' + (0.3 + MG.power * 0.7) + ')');
    g.addColorStop(0.3, 'rgba(255, 180, 80, ' + (0.2 + MG.power * 0.4) + ')');
    g.addColorStop(1, 'rgba(255, 100, 40, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, coreR * 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255, 250, 220, ' + (0.6 + MG.power * 0.4) + ')';
    ctx.beginPath(); ctx.arc(cx, cy, coreR * 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.font = 'bold 14px -apple-system, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText('ТАП', cx, cy + 90);

  } else if (MG.type === 'accretion') {
    for (const c of MG.chunks) {
      const sx = cx + c.x, sy = cy + c.y;
      let col = '#8a7159';
      if (c.type === 'ice') col = '#7ec8e3';
      if (c.type === 'fire') col = '#ff4a22';
      if (c.type === 'gas') col = '#d4a76a';
      const g = ctx.createRadialGradient(sx - c.r*0.3, sy - c.r*0.3, 0, sx, sy, c.r*1.5);
      g.addColorStop(0, col);
      g.addColorStop(1, 'rgba(0,0,0,0.4)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(sx, sy, c.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(sx, sy, c.r, 0, Math.PI * 2); ctx.stroke();
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

function mgPointerDown(x, y) {
  if (!MG.type) return;
  if (MG.type === 'mass') { MG.dragActive = true; MG.dragX = x; MG.dragY = y; }
  else if (MG.type === 'ignite') {
    const cx = window.CANVAS_CX || 0;
    const cy = window.CANVAS_CY || 0;
    if (Math.hypot(x - cx, y - cy) < 150) MG.power = Math.min(1, MG.power + 0.08);
  } else if (MG.type === 'accretion') { MG.dragActive = true; MG.dragX = x; MG.dragY = y; }
  // Skip
  if (y < 50 && x > (window.CANVAS_W || 400) - 120) endMinigame(false);
}

function mgPointerMove(x, y) {
  if (!MG.type) return;
  if (MG.type === 'mass' || MG.type === 'accretion') { MG.dragX = x; MG.dragY = y; }
}
function mgPointerUp() { MG.dragActive = false; }

window.startMinigame = startMinigame;
window.updateMinigame = updateMinigame;
window.drawMinigame = drawMinigame;
window.mgPointerDown = mgPointerDown;
window.mgPointerMove = mgPointerMove;
window.mgPointerUp = mgPointerUp;
window.MG = MG;
