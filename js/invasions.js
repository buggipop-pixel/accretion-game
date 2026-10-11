// ═══════════════════════════════════════════════════════════════
//  INVASIONS.JS — вторжения враждебных флотов
//
//  ФАЗА 1: 45 минут — корабли грабят пыль из общего запаса.
//          Скорость: dustPerSec × 4 × количество_кораблей в секунду.
//  ФАЗА 2: 15 минут — планета теряет HP (100 → 0).
//  ФИНАЛ: 60 минут — планета уничтожена. Если была обитаемой —
//         теряется civ и энергия пропорционально доле (1/N).
//
//  Игрок кликает ТОЧНО по кораблю (радиус 20 px) — корабль убит.
//  Когда все корабли убиты — атака снята.
// ═══════════════════════════════════════════════════════════════

// ─── Проверка: планета под вторжением ───────────────────────────
function isPlanetInvaded(planet) {
  if (!S.invasions) return false;
  for (let i = 0; i < S.invasions.length; i++) {
    if (S.invasions[i].planetSeed === planet.seed) return true;
  }
  return false;
}
window.isPlanetInvaded = isPlanetInvaded;

// ─── Общий счётчик вторжений ────────────────────────────────────
function hasActiveInvasions() {
  return S.invasions && S.invasions.length > 0;
}
window.hasActiveInvasions = hasActiveInvasions;

// ─── Создание вторжения ─────────────────────────────────────────
function spawnInvasion() {
  const active = S.planets.filter(function(p) { return !p.forming; });
  if (active.length === 0) return;

  // Ищем планету без активного вторжения
  const candidates = active.filter(function(p) { return !isPlanetInvaded(p); });
  if (candidates.length === 0) return;

  const victim = candidates[Math.floor(Math.random() * candidates.length)];

  // Количество кораблей: 3 при малом числе планет, до 5 при большом
  const shipCount = Math.min(
    INVASION_CFG.shipsMax,
    INVASION_CFG.shipsBase + Math.floor(S.planets.length / 3)
  );

  const ships = [];
  for (let i = 0; i < shipCount; i++) {
    ships.push({
      angle: (i / shipCount) * Math.PI * 2 + Math.random() * 0.5,
      dist: 1.8 + Math.random() * 0.6,    // в долях от диаметра планеты
      speed: 0.8 + Math.random() * 0.6,   // скорость вращения
      destroyed: false,
    });
  }

  const now = Date.now();
  S.invasions.push({
    id: Math.random().toString(36).slice(2),
    planetSeed: victim.seed,
    ships: ships,
    spawnedAt: now,
    robberyEndsAt: now + INVASION_CFG.robberyDuration,
    destructionEndsAt: now + INVASION_CFG.totalDuration,
    hp: INVASION_CFG.planetMaxHP,
    stolen: 0,
  });

  toast('⚔️ Вторжение!', PLANET_TYPES[victim.type].name + ' атакована');
}

// ─── Проверка новых вторжений и обновление существующих ─────────
function tickInvasions(dt) {
  if (!S.invasions) S.invasions = [];
  const now = Date.now();

  // Проверка новых вторжений (только начиная с фазы V)
  if (S.stage === 'system' || S.stage === 'galaxy') {
    if (S.planets.length >= 2) {
      if (!S.lastInvasionCheck) S.lastInvasionCheck = now;
      const since = now - S.lastInvasionCheck;
      const interval = INVASION_CFG.intervalMin +
        Math.random() * (INVASION_CFG.intervalMax - INVASION_CFG.intervalMin);
      if (since >= interval) {
        S.lastInvasionCheck = now;
        if (Math.random() < INVASION_CFG.chance) spawnInvasion();
      }
    }
  }

  // Обновление существующих вторжений
  for (let i = S.invasions.length - 1; i >= 0; i--) {
    const inv = S.invasions[i];

    // Проверяем, жива ли планета
    let victim = null;
    for (let j = 0; j < S.planets.length; j++) {
      if (S.planets[j].seed === inv.planetSeed) { victim = S.planets[j]; break; }
    }
    if (!victim) { S.invasions.splice(i, 1); continue; }

    // Считаем живые корабли
    let aliveShips = 0;
    for (let s = 0; s < inv.ships.length; s++) {
      if (!inv.ships[s].destroyed) aliveShips++;
    }

    // Если все корабли мертвы — вторжение отбито
    if (aliveShips === 0) {
      toast('✓ Вторжение отбито', PLANET_TYPES[victim.type].name + ' свободна');
      S.invasions.splice(i, 1);
      continue;
    }

    // ─── ФАЗА 1: грабёж ───
    if (now < inv.robberyEndsAt && S.dust > 0) {
      const drain = dustPerSec() * INVASION_CFG.robberyMultiplier * aliveShips * dt;
      const actualDrain = Math.min(S.dust, drain);
      S.dust -= actualDrain;
      inv.stolen = (inv.stolen || 0) + actualDrain;
    }

    // ─── ФАЗА 2: уничтожение планеты ───
    const robbingDone = now >= inv.robberyEndsAt || S.dust <= 0;
    if (robbingDone) {
      const hpDrainPerSec = INVASION_CFG.planetMaxHP /
                            (INVASION_CFG.destructionDuration / 1000);
      inv.hp -= hpDrainPerSec * dt;

      if (inv.hp <= 0 || now >= inv.destructionEndsAt) {
        destroyPlanetByInvasion(victim);
        S.invasions.splice(i, 1);
        continue;
      }
    }

    // Вращение кораблей вокруг планеты
    for (let s = 0; s < inv.ships.length; s++) {
      const ship = inv.ships[s];
      if (ship.destroyed) continue;
      ship.angle += ship.speed * dt;
    }
  }
}
window.tickInvasions = tickInvasions;

// ─── Уничтожение планеты ────────────────────────────────────────
function destroyPlanetByInvasion(victim) {
  const pt = PLANET_TYPES[victim.type];
  const wasCiv = pt.civ;

  // Считаем, сколько всего обитаемых планет в системе
  let civPlanets = 0;
  for (let i = 0; i < S.planets.length; i++) {
    if (PLANET_TYPES[S.planets[i].type].civ && !S.planets[i].forming) civPlanets++;
  }

  // Взрыв до удаления
  const nowSec = performance.now() / 1000;
  const pos = (typeof getPlanetWorldPos === 'function')
    ? getPlanetWorldPos(victim, nowSec) : { x: 0, y: 0 };
  const sp = (typeof worldToScreen === 'function')
    ? worldToScreen(pos.x, pos.y) : { x: 0, y: 0 };

  S.explosions.push({
    x: sp.x, y: sp.y, type: 'destroy',
    startAt: Date.now(), endAt: Date.now() + 2000, size: 60,
  });

  // Удаляем планету
  S.planets = S.planets.filter(function(p) { return p !== victim; });

  // Потеря цив и энергии — только если планета была обитаемой
  if (wasCiv && civPlanets > 0) {
    const share = 1 / civPlanets;
    const civLoss = S.civLevel * share * 0.5;
    const energyLoss = S.energy * share * 0.5;
    S.civLevel = Math.max(0, S.civLevel - civLoss);
    S.energy = Math.max(0, S.energy - energyLoss);
    toast('💀 Планета уничтожена',
      pt.name + ' · Цив −' + civLoss.toFixed(1) +
      ' · Энергия −' + fmt(energyLoss));
  } else {
    toast('💀 Планета уничтожена', pt.name);
  }
}
window.destroyPlanetByInvasion = destroyPlanetByInvasion;

// ─── Клик по кораблю ────────────────────────────────────────────
// Возвращает true, если клик попал в корабль (и он убит).
function tryHitInvasionShip(screenX, screenY) {
  if (!S.invasions || S.invasions.length === 0) return false;

  const nowSec = performance.now() / 1000;
  const z = S.zoom || 1;
  const hitR = INVASION_CFG.hitRadius * z;

  for (let i = S.invasions.length - 1; i >= 0; i--) {
    const inv = S.invasions[i];

    // Ищем планету-жертву
    let victim = null;
    for (let j = 0; j < S.planets.length; j++) {
      if (S.planets[j].seed === inv.planetSeed) { victim = S.planets[j]; break; }
    }
    if (!victim) continue;

    const pos = (typeof getPlanetWorldPos === 'function')
      ? getPlanetWorldPos(victim, nowSec) : { x: 0, y: 0 };

    // Радиус орбиты корабля в мировых координатах
    const shipOrbitWorld = victim.diameter * 25;

    for (let si = inv.ships.length - 1; si >= 0; si--) {
      const ship = inv.ships[si];
      if (ship.destroyed) continue;

      const wx = pos.x + Math.cos(ship.angle) * shipOrbitWorld * ship.dist;
      const wy = pos.y + Math.sin(ship.angle) * shipOrbitWorld * ship.dist * 0.5;

      const sp = (typeof worldToScreen === 'function')
        ? worldToScreen(wx, wy) : { x: 0, y: 0 };

      const d = Math.hypot(sp.x - screenX, sp.y - screenY);
      if (d < hitR) {
        ship.destroyed = true;
        S.explosions.push({
          x: sp.x, y: sp.y, type: 'destroy',
          startAt: Date.now(), endAt: Date.now() + 500, size: 18,
        });

        // Проверяем, остались ли живые
        let alive = false;
        for (let k = 0; k < inv.ships.length; k++) {
          if (!inv.ships[k].destroyed) { alive = true; break; }
        }
        if (!alive) {
          toast('✓ Вторжение отбито', PLANET_TYPES[victim.type].name + ' свободна');
          S.invasions.splice(i, 1);
        }
        return true;
      }
    }
  }
  return false;
}
window.tryHitInvasionShip = tryHitInvasionShip;

// ─── Отрисовка вторжений ────────────────────────────────────────
function drawInvasions(ctx, time) {
  if (!S.invasions || S.invasions.length === 0) return;

  const now = Date.now();
  const nowSec = performance.now() / 1000;
  const z = S.zoom || 1;

  for (let i = 0; i < S.invasions.length; i++) {
    const inv = S.invasions[i];

    let victim = null;
    for (let j = 0; j < S.planets.length; j++) {
      if (S.planets[j].seed === inv.planetSeed) { victim = S.planets[j]; break; }
    }
    if (!victim) continue;

    const pos = (typeof getPlanetWorldPos === 'function')
      ? getPlanetWorldPos(victim, nowSec) : { x: 0, y: 0 };
    const centerSp = (typeof worldToScreen === 'function')
      ? worldToScreen(pos.x, pos.y) : { x: 0, y: 0 };

    // ─── Красный ореол вокруг планеты (атакована) ───
    const pulse = 1 + 0.15 * Math.sin(time * 4);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const aura = ctx.createRadialGradient(
      centerSp.x, centerSp.y, 0,
      centerSp.x, centerSp.y, 45 * z * pulse
    );
    aura.addColorStop(0, 'rgba(255, 40, 40, 0.35)');
    aura.addColorStop(0.6, 'rgba(255, 40, 40, 0.15)');
    aura.addColorStop(1, 'rgba(255, 40, 40, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(centerSp.x, centerSp.y, 45 * z * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ─── Корабли ───
    const shipOrbitWorld = victim.diameter * 25;

    for (let si = 0; si < inv.ships.length; si++) {
      const ship = inv.ships[si];
      if (ship.destroyed) continue;

      const wx = pos.x + Math.cos(ship.angle) * shipOrbitWorld * ship.dist;
      const wy = pos.y + Math.sin(ship.angle) * shipOrbitWorld * ship.dist * 0.5;
      const sp = (typeof worldToScreen === 'function')
        ? worldToScreen(wx, wy) : { x: 0, y: 0 };

      // Красное свечение
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, 16 * z);
      g.addColorStop(0, 'rgba(255, 60, 60, 0.95)');
      g.addColorStop(0.5, 'rgba(220, 20, 20, 0.55)');
      g.addColorStop(1, 'rgba(180, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 16 * z, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Треугольный корабль (нос по направлению движения)
      ctx.save();
      const s = 7 * z;
      const angle = ship.angle + Math.PI / 2;
      ctx.translate(sp.x, sp.y);
      ctx.rotate(angle);

      ctx.fillStyle = '#ff3030';
      ctx.strokeStyle = '#ffe0e0';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(s, 0);
      ctx.lineTo(-s * 0.6, -s * 0.7);
      ctx.lineTo(-s * 0.3, 0);
      ctx.lineTo(-s * 0.6, s * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Иконка угрозы
      ctx.fillStyle = '#fff';
      ctx.font = 'bold ' + Math.round(6 * z) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('☠', 0, 0);

      ctx.restore();
    }

    // ─── Прогресс-бар с оставшимся временем ───
    const elapsed = now - inv.spawnedAt;
    const total = INVASION_CFG.totalDuration;
    const remainMs = Math.max(0, total - elapsed);
    const remainSec = Math.floor(remainMs / 1000);
    const mm = String(Math.floor(remainSec / 60)).padStart(2, '0');
    const ss = String(remainSec % 60).padStart(2, '0');

    const isDestroying = elapsed >= INVASION_CFG.robberyDuration;
    const phaseLabel = isDestroying ? '💀 УНИЧТОЖЕНИЕ' : '💰 ГРАБЁЖ';
    const phaseColor = isDestroying ? '#ff3030' : '#ff9944';

    const barY = centerSp.y - 40 * z;
    const barW = 70 * z;
    const barH = 4 * z;
    const barX = centerSp.x - barW / 2;
    const progress = elapsed / total;

    // Фон бара
    ctx.save();
    ctx.fillStyle = 'rgba(15, 5, 5, 0.85)';
    ctx.fillRect(barX - 2, barY - 14 * z, barW + 4, 22 * z);
    ctx.strokeStyle = 'rgba(255, 60, 60, 0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX - 2, barY - 14 * z, barW + 4, 22 * z);

    // Заполненный прогресс
    ctx.fillStyle = phaseColor;
    ctx.fillRect(barX, barY - 10 * z, barW * progress, barH);

    // Текст фазы
    ctx.fillStyle = phaseColor;
    ctx.font = 'bold ' + Math.round(7 * z) + 'px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(phaseLabel + ' · ' + mm + ':' + ss,
                 centerSp.x, barY - 4 * z);
    ctx.restore();
  }
}
window.drawInvasions = drawInvasions;
