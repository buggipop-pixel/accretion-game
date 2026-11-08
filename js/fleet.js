// ═══════════════════════════════════════════════════════════════
//  FLEET.JS — флагман флота: патруль, перелёт к цели, бой, возврат.
//  Логика урона остаётся в invasions.js; здесь — цель, перелёт и отрисовка.
// ═══════════════════════════════════════════════════════════════

const FLEET_VIS = {
  phase: 'idle',      // idle | travel | fight | return
  targetId: null,
  startedAt: 0,
  durationMs: 0,
  returnFrom: null,
  lastPos: null,
};

function fleetHasAliveShips(inv) {
  if (!inv || !Array.isArray(inv.ships)) return false;
  for (let i = 0; i < inv.ships.length; i++) {
    if (!inv.ships[i].destroyed) return true;
  }
  return false;
}

function fleetTargetById(id) {
  if (!S.invasions || id == null) return null;
  for (let i = 0; i < S.invasions.length; i++) {
    const inv = S.invasions[i];
    if (inv.id === id && fleetHasAliveShips(inv)) return inv;
  }
  return null;
}

// Экранная позиция «дома»: у звезды в системе или у активной системы в галактике.
function fleetHomeScreen(time) {
  const t = time || 0;
  const a = t * 0.35;
  if (S.stage === 'galaxy') {
    const p = galaxySystemPos(S.activeSystemIdx || 0, S.totalSystemsCreated || 1, t);
    return { x: p.x + Math.cos(a) * 24, y: p.y + Math.sin(a) * 14, angle: a + Math.PI / 2 };
  }
  const pos = worldToScreen(Math.cos(a) * 95, Math.sin(a) * 95 * 0.55);
  return { x: pos.x, y: pos.y, angle: a + Math.PI / 2 };
}

// Экранная позиция цели. Для невидимой в текущем виде системы уводим
// флагман за край экрана — логически он всё равно летит и воюет.
function fleetTargetScreen(inv, time) {
  if (!inv) return null;
  if (S.stage === 'galaxy') {
    const p = galaxySystemPos(inv.systemIdx || 0, S.totalSystemsCreated || 1, time || 0);
    return { x: p.x, y: p.y };
  }
  if (S.stage === 'system') {
    if (inv.targetType === 'system' && inv.systemIdx === S.activeSystemIdx) {
      const p = worldToScreen(0, 0);
      return { x: p.x, y: p.y };
    }
    if (inv.targetType === 'planet' && inv.planetSeed) {
      for (let i = 0; i < S.planets.length; i++) {
        if (S.planets[i].seed === inv.planetSeed) {
          const w = getPlanetWorldPos(S.planets[i], (performance.now() / 1000) || time || 0);
          const p = worldToScreen(w.x, w.y);
          return { x: p.x, y: p.y };
        }
      }
    }
    const w = (typeof W === 'number' ? W : 1200);
    const h = (typeof H === 'number' ? H : 700);
    return { x: w + 160, y: h / 2 };
  }
  return null;
}

function fleetTravelMs(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  const speed = Number(FLEET_CFG.travelSpeedPxPerSec) || 45;
  const minS = Number(FLEET_CFG.travelMinSec) || 4;
  const maxS = Number(FLEET_CFG.travelMaxSec) || 20;
  const sec = Math.min(maxS, Math.max(minS, dist / speed));
  return sec * 1000;
}

function fleetPickTarget(time) {
  if (!S.invasions || S.invasions.length === 0) return null;
  const home = fleetHomeScreen(time);
  let best = null, bestDist = Infinity;
  for (let i = 0; i < S.invasions.length; i++) {
    const inv = S.invasions[i];
    if (!fleetHasAliveShips(inv)) continue;
    const pos = fleetTargetScreen(inv, time);
    if (!pos) continue;
    const d = Math.hypot(pos.x - home.x, pos.y - home.y);
    if (d < bestDist) { best = inv; bestDist = d; }
  }
  return best;
}

// Флот реально воюет только после прибытия.
function fleetEngaged(inv) {
  return !!(inv && FLEET_VIS.phase === 'fight' && FLEET_VIS.targetId === inv.id);
}

function fleetStartTravel(inv, time) {
  const home = fleetHomeScreen(time);
  const target = fleetTargetScreen(inv, time) || home;
  FLEET_VIS.phase = 'travel';
  FLEET_VIS.targetId = inv.id;
  FLEET_VIS.startedAt = Date.now();
  FLEET_VIS.durationMs = fleetTravelMs(home, target);
}

function fleetStartReturn(time) {
  const from = FLEET_VIS.lastPos || fleetHomeScreen(time);
  const home = fleetHomeScreen(time);
  FLEET_VIS.phase = 'return';
  FLEET_VIS.targetId = null;
  FLEET_VIS.returnFrom = { x: from.x, y: from.y };
  FLEET_VIS.startedAt = Date.now();
  FLEET_VIS.durationMs = fleetTravelMs(from, home);
}

function tickFleet(dt, time) {
  if (!(typeof isFleetActive === 'function') || !isFleetActive()) {
    FLEET_VIS.phase = 'idle';
    FLEET_VIS.targetId = null;
    FLEET_VIS.lastPos = null;
    return;
  }

  const now = Date.now();
  const target = fleetTargetById(FLEET_VIS.targetId);

  if (FLEET_VIS.phase === 'idle') {
    const inv = fleetPickTarget(time);
    if (inv) fleetStartTravel(inv, time);
    return;
  }

  if (FLEET_VIS.phase === 'travel') {
    if (!target) { fleetStartReturn(time); return; }
    if (now - FLEET_VIS.startedAt >= FLEET_VIS.durationMs) {
      FLEET_VIS.phase = 'fight';
      FLEET_VIS.targetId = target.id;
    }
    return;
  }

  if (FLEET_VIS.phase === 'fight') {
    if (!target) { fleetStartReturn(time); return; }
    return;
  }

  if (FLEET_VIS.phase === 'return') {
    if (now - FLEET_VIS.startedAt >= FLEET_VIS.durationMs) {
      FLEET_VIS.phase = 'idle';
      FLEET_VIS.returnFrom = null;
      // ★ Действие флота завершено — короткое уведомление в Telegram.
      if (typeof notifyFleetEvent === 'function') {
        notifyFleetEvent('Флот завершил действие', [
          '🏠 Корабли вернулись в строй.',
          '🚀 В строю: ' + (typeof fleetShipTotal === 'function' ? fleetShipTotal() : 0),
        ]);
      }
    }
    return;
  }
}

function fleetScreenPos(time) {
  const home = fleetHomeScreen(time);
  const now = Date.now();

  if (FLEET_VIS.phase === 'travel') {
    const inv = fleetTargetById(FLEET_VIS.targetId);
    const target = fleetTargetScreen(inv, time) || home;
    const p = Math.min(1, Math.max(0, (now - FLEET_VIS.startedAt) / Math.max(1, FLEET_VIS.durationMs)));
    const e = p * p * (3 - 2 * p);
    const x = home.x + (target.x - home.x) * e;
    const y = home.y + (target.y - home.y) * e;
    return { x, y, angle: Math.atan2(target.y - home.y, target.x - home.x), moving: true };
  }

  if (FLEET_VIS.phase === 'fight') {
    const inv = fleetTargetById(FLEET_VIS.targetId);
    const target = fleetTargetScreen(inv, time) || home;
    const a = (time || 0) * 1.8;
    return {
      x: target.x + Math.cos(a) * 22,
      y: target.y + Math.sin(a) * 12,
      angle: a + Math.PI / 2,
      moving: true,
    };
  }

  if (FLEET_VIS.phase === 'return' && FLEET_VIS.returnFrom) {
    const p = Math.min(1, Math.max(0, (now - FLEET_VIS.startedAt) / Math.max(1, FLEET_VIS.durationMs)));
    const e = p * p * (3 - 2 * p);
    const from = FLEET_VIS.returnFrom;
    return {
      x: from.x + (home.x - from.x) * e,
      y: from.y + (home.y - from.y) * e,
      angle: Math.atan2(home.y - from.y, home.x - from.x),
      moving: true,
    };
  }

  return home;
}

function drawFleet(ctx, time) {
  // ★ Флагман виден всегда, пока в Верфи есть корабли: флот не надо
  //   активировать, он постоянно на службе.
  if (typeof fleetShipTotal !== 'function' || fleetShipTotal() <= 0) return;
  if (!S.fleetActive) S.fleetActive = true; // синхронизируем старые сейвы
  if (S.activeMinigame) return;
  const pos = fleetScreenPos(time);
  if (!pos || !isFinite(pos.x) || !isFinite(pos.y)) return;
  FLEET_VIS.lastPos = { x: pos.x, y: pos.y };

  const z = S.zoom || 1;
  const total = (typeof fleetShipTotal === 'function') ? fleetShipTotal() : 0;
  const baseR = Number(FLEET_CFG.flagshipBaseRadius) || 10;
  const perShip = Number(FLEET_CFG.flagshipRadiusPerShip) || 0.15;
  const maxR = Number(FLEET_CFG.flagshipMaxRadius) || 22;
  const scale = (S.stage === 'galaxy' ? 0.75 : 1) * z;
  const r = (baseR + Math.min(maxR - baseR, total * perShip)) * scale;
  const len = r * 3.6;
  const wid = r * 1.55;
  const tt = (typeof time === 'number' && isFinite(time)) ? time : 0;
  const moving = !!pos.moving;

  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(pos.angle || 0);

  // ── Реактивная струя ─────────────────────────────────────────
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const flick = 0.85 + 0.15 * Math.sin(tt * 17 + pos.x * 0.03);
  const plumeEnd = len * (moving ? 2.35 : 1.35) * flick;
  const plume = ctx.createLinearGradient(-len * 0.42, 0, -plumeEnd, 0);
  plume.addColorStop(0, 'rgba(225, 245, 255, 0.95)');
  plume.addColorStop(0.35, 'rgba(95, 180, 255, 0.45)');
  plume.addColorStop(1, 'rgba(70, 110, 255, 0)');
  ctx.fillStyle = plume;
  ctx.beginPath();
  ctx.moveTo(-len * 0.42, -wid * 0.30);
  ctx.quadraticCurveTo(-len * 1.1, -wid * 0.16, -plumeEnd, 0);
  ctx.quadraticCurveTo(-len * 1.1, wid * 0.16, -len * 0.42, wid * 0.30);
  ctx.closePath();
  ctx.fill();

  // Яркие язычки пламени
  for (let i = -1; i <= 1; i++) {
    const fy = i * wid * 0.16;
    const fl = plumeEnd * (0.55 + 0.2 * Math.sin(tt * 21 + i));
    const fg = ctx.createLinearGradient(-len * 0.45, fy, -fl, fy);
    fg.addColorStop(0, 'rgba(255,255,255,0.9)');
    fg.addColorStop(1, 'rgba(120,200,255,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(-len * 0.45, fy - wid * 0.05);
    ctx.lineTo(-fl, fy);
    ctx.lineTo(-len * 0.45, fy + wid * 0.05);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // ── Ореол ────────────────────────────────────────────────────
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 3);
  halo.addColorStop(0, 'rgba(120, 200, 255, 0.26)');
  halo.addColorStop(0.6, 'rgba(110, 140, 255, 0.10)');
  halo.addColorStop(1, 'rgba(110, 140, 255, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(0, 0, r * 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // ── Корабли сопровождения (визуально показывают размер флота) ─
  const escorts = Math.min(3, Math.max(0, total - 1));
  for (let i = 0; i < escorts; i++) {
    const orb = tt * 0.7 + i * 2.2;
    const ex = -len * 0.72 + Math.cos(orb) * r * 0.9;
    const ey = Math.sin(orb) * wid * 0.85;
    const es = r * 0.30;
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(0.25 * Math.sin(orb));
    ctx.fillStyle = 'rgba(155, 205, 255, 0.92)';
    ctx.beginPath();
    ctx.moveTo(es * 1.9, 0);
    ctx.lineTo(-es * 1.1, -es * 0.8);
    ctx.lineTo(-es * 0.5, 0);
    ctx.lineTo(-es * 1.1, es * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(130, 220, 255, 0.9)';
    ctx.beginPath(); ctx.arc(-es * 0.9, 0, es * 0.35, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ── Крылья (фиолетовый акцент) ───────────────────────────────
  const wing = ctx.createLinearGradient(0, -wid, 0, wid);
  wing.addColorStop(0, 'rgba(150, 130, 255, 0.95)');
  wing.addColorStop(0.5, 'rgba(105, 80, 230, 0.95)');
  wing.addColorStop(1, 'rgba(150, 130, 255, 0.95)');
  for (let dir = -1; dir <= 1; dir += 2) {
    ctx.beginPath();
    ctx.moveTo(len * 0.14, dir * wid * 0.30);
    ctx.lineTo(-len * 0.06, dir * wid * 0.98);
    ctx.lineTo(-len * 0.34, dir * wid * 0.80);
    ctx.lineTo(-len * 0.30, dir * wid * 0.32);
    ctx.closePath();
    ctx.fillStyle = wing;
    ctx.fill();
    ctx.strokeStyle = 'rgba(185, 168, 255, 0.85)';
    ctx.lineWidth = Math.max(0.8, 0.9 * z);
    ctx.stroke();
  }

  // ── Корпус ───────────────────────────────────────────────────
  const hull = ctx.createLinearGradient(-len * 0.5, 0, len * 0.56, 0);
  hull.addColorStop(0, '#8fb4ea');
  hull.addColorStop(0.55, '#d7e8ff');
  hull.addColorStop(1, '#f6fbff');
  ctx.fillStyle = hull;
  ctx.strokeStyle = 'rgba(150, 205, 255, 0.95)';
  ctx.lineWidth = Math.max(1, 1.3 * z);
  ctx.beginPath();
  ctx.moveTo(len * 0.56, 0);
  ctx.quadraticCurveTo(len * 0.40, -wid * 0.20, len * 0.18, -wid * 0.26);
  ctx.lineTo(len * 0.05, -wid * 0.52);
  ctx.lineTo(-len * 0.26, -wid * 0.46);
  ctx.lineTo(-len * 0.40, -wid * 0.22);
  ctx.lineTo(-len * 0.48, 0);
  ctx.lineTo(-len * 0.40, wid * 0.22);
  ctx.lineTo(-len * 0.26, wid * 0.46);
  ctx.lineTo(len * 0.05, wid * 0.52);
  ctx.lineTo(len * 0.18, wid * 0.26);
  ctx.quadraticCurveTo(len * 0.40, wid * 0.20, len * 0.56, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // ── Кабина ───────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(40, 60, 120, 0.75)';
  ctx.beginPath();
  ctx.ellipse(len * 0.20, 0, len * 0.10, wid * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(170, 225, 255, 0.95)';
  ctx.beginPath();
  ctx.ellipse(len * 0.22, 0, len * 0.055, wid * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── Реактор ──────────────────────────────────────────────────
  const corePulse = 0.7 + 0.3 * Math.sin(tt * 4.5);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.75);
  core.addColorStop(0, 'rgba(230, 250, 255, ' + (0.95 * corePulse) + ')');
  core.addColorStop(0.35, 'rgba(120, 210, 255, 0.55)');
  core.addColorStop(1, 'rgba(90, 140, 255, 0)');
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.75, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // ── Пушки ────────────────────────────────────────────────────
  ctx.strokeStyle = '#a8d4ff';
  ctx.lineWidth = Math.max(1, 1.4 * z);
  ctx.beginPath();
  ctx.moveTo(len * 0.30, -wid * 0.20); ctx.lineTo(len * 0.64, -wid * 0.20);
  ctx.moveTo(len * 0.30, wid * 0.20); ctx.lineTo(len * 0.64, wid * 0.20);
  ctx.stroke();

  // ── Щит ──────────────────────────────────────────────────────
  ctx.save();
  ctx.strokeStyle = 'rgba(130, 200, 255, 0.35)';
  ctx.lineWidth = Math.max(0.8, 1.0 * z);
  ctx.setLineDash([r * 0.55, r * 0.45]);
  ctx.lineDashOffset = -tt * 22;
  ctx.beginPath();
  ctx.ellipse(0, 0, len * 0.62, wid * 0.92, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.restore();

  // ── Бейдж количества ─────────────────────────────────────────
  const labelY = pos.y - r * 2.6;
  ctx.save();
  ctx.font = 'bold ' + Math.max(9, Math.round(9 * z)) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(10, 6, 32, 0.7)';
  const tw = ctx.measureText('×' + total).width + 10;
  ctx.fillRect(pos.x - tw / 2, labelY - 8, tw, 15);
  ctx.fillStyle = '#dbe9ff';
  ctx.fillText('×' + total, pos.x, labelY);
  ctx.restore();
}

window.tickFleet = tickFleet;
window.drawFleet = drawFleet;
window.fleetEngaged = fleetEngaged;
window.FLEET_VIS = FLEET_VIS;
