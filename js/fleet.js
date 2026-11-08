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
  const len = r * 3.2;
  const wid = r * 1.25;

  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(pos.angle || 0);

  // Двигательный след
  const trail = pos.moving ? 1 : 0.55;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(-len * 1.6, 0, -len * 0.5, 0);
  g.addColorStop(0, 'rgba(90, 180, 255, 0)');
  g.addColorStop(0.6, 'rgba(90, 180, 255, 0.25)');
  g.addColorStop(1, 'rgba(180, 230, 255, 0.75)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-len * 0.55, -wid * 0.35);
  ctx.lineTo(-len * (1.3 + 0.35 * trail), 0);
  ctx.lineTo(-len * 0.55, wid * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Ореол
  const halo = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 2.2);
  halo.addColorStop(0, 'rgba(120, 200, 255, 0.28)');
  halo.addColorStop(1, 'rgba(120, 200, 255, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2);
  ctx.fill();

  // Корпус линкора
  ctx.fillStyle = '#dbe9ff';
  ctx.strokeStyle = '#7fb8ff';
  ctx.lineWidth = Math.max(1, 1.2 * z);
  ctx.beginPath();
  ctx.moveTo(len * 0.5, 0);
  ctx.lineTo(len * 0.12, -wid * 0.5);
  ctx.lineTo(-len * 0.32, -wid * 0.42);
  ctx.lineTo(-len * 0.5, 0);
  ctx.lineTo(-len * 0.32, wid * 0.42);
  ctx.lineTo(len * 0.12, wid * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Надстройка и крылья
  ctx.fillStyle = '#6b4de6';
  ctx.beginPath();
  ctx.moveTo(len * 0.05, -wid * 0.18);
  ctx.lineTo(-len * 0.18, 0);
  ctx.lineTo(len * 0.05, wid * 0.18);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(185, 168, 255, 0.9)';
  ctx.beginPath();
  ctx.moveTo(len * 0.02, -wid * 0.5);
  ctx.lineTo(-len * 0.2, -wid * 0.95);
  ctx.lineTo(-len * 0.05, -wid * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(len * 0.02, wid * 0.5);
  ctx.lineTo(-len * 0.2, wid * 0.95);
  ctx.lineTo(-len * 0.05, wid * 0.5);
  ctx.closePath();
  ctx.fill();

  // Пушки
  ctx.strokeStyle = '#9fd0ff';
  ctx.lineWidth = Math.max(1, 1.4 * z);
  ctx.beginPath();
  ctx.moveTo(len * 0.28, -wid * 0.18); ctx.lineTo(len * 0.62, -wid * 0.18);
  ctx.moveTo(len * 0.28, wid * 0.18); ctx.lineTo(len * 0.62, wid * 0.18);
  ctx.stroke();

  ctx.restore();

  // Бейдж количества
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
