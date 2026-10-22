// ═══════════════════════════════════════════════════════════════
//  INVASIONS.JS — вторжения с 3 уровнями сложности
// ═══════════════════════════════════════════════════════════════

function isPlanetInvaded(planet) {
  if (!S.invasions) return false;
  for (let i = 0; i < S.invasions.length; i++) {
    const inv = S.invasions[i];
    if (inv.targetType !== 'planet') continue;
    if (inv.planetSeed !== undefined && inv.planetSeed === planet.seed) return true;
    if (inv.planetSeeds && inv.planetSeeds.indexOf(planet.seed) !== -1) return true;
  }
  return false;
}
window.isPlanetInvaded = isPlanetInvaded;

function hasActiveInvasions() {
  return S.invasions && S.invasions.length > 0;
}
window.hasActiveInvasions = hasActiveInvasions;

// ─── Выбор tier по весам ────────────────────────────────────────
function rollInvasionTier() {
  const tiers = INVASION_CFG.tiers;
  const r = Math.random();
  let acc = 0;
  for (const key in tiers) {
    acc += tiers[key].weight;
    if (r < acc) return key;
  }
  return 'scout';
}
window.rollInvasionTier = rollInvasionTier;

// ─── Бонус автообороны ──────────────────────────────────────────
function calcDefenseBonus() {
  const now = Date.now();
  let activeLvl = 0;
  if (S.nightDefenseExpiresAt && S.nightDefenseExpiresAt > now) {
    activeLvl = S.nightDefenseLevel || 0;
  }
  
  let bonus = 0;
  if (activeLvl > 0) {
    bonus = (INVASION_CFG.defenseBonusBase || 6) * Math.pow(activeLvl, INVASION_CFG.defenseBonusExp || 0.8) / 100;
  }
  
  if (S.activeTrophyEffects) {
    for (let i = 0; i < S.activeTrophyEffects.length; i++) {
      const e = S.activeTrophyEffects[i];
      if (e.type === 'defense_level' && e.expiresAt > now) {
        const tmp = (INVASION_CFG.defenseBonusBase || 6) * Math.pow(e.value, INVASION_CFG.defenseBonusExp || 0.8) / 100;
        bonus = Math.max(bonus, tmp);
      }
    }
  }
  return bonus;
}
window.calcDefenseBonus = calcDefenseBonus;

// ─── Штраф за активные экспедиции ───────────────────────────────
function calcExpeditionPenalty() {
  const pct = (S.nightConfig && S.nightConfig.expeditionPercent) || 0;
  if (pct <= 0) return 0;
  return (pct / 100) * (NIGHT_CFG.expeditionDefensePenaltyMax || 0.30);
}

// ─── Ресурсный фактор ────────────────────────────────────────────
function calcResourceFactor() {
  const capE = Math.max(1, getResourceCap('energy'));
  const capC = Math.max(1, getResourceCap('civ'));
  const thresh = INVASION_CFG.resourceThresholdShare || 0.25;
  const eF = Math.min(1, S.energy / (thresh * capE));
  const cF = Math.min(1, S.civLevel / (thresh * capC));
  return Math.min(eF, cF);
}

// ─── Итоговый шанс отражения ───────────────────────────────────
function calcDefenseChance(tierKey) {
  const tier = INVASION_CFG.tiers[tierKey];
  if (!tier) return 0;
  // Щит — 100%
  if (S.shieldUntil && S.shieldUntil > Date.now()) return 1.0;

  const resFactor = calcResourceFactor();
  let chance = tier.baseChance * resFactor;

  // Автооборона (если включена)
  if (S.nightConfig && S.nightConfig.defenseEnabled) {
    chance += calcDefenseBonus();
  }

  // Штраф за экспедицию
  chance -= calcExpeditionPenalty();

  return Math.max(0, Math.min(tier.chanceCap, chance));
}
window.calcDefenseChance = calcDefenseChance;

// ─── Создание вторжения ─────────────────────────────────────────
function spawnInvasion() {
  const now = Date.now();
  const tierKey = rollInvasionTier();
  const tier = INVASION_CFG.tiers[tierKey];

  // ★ В фазе галактики атакуется СИСТЕМА
  if (S.stage === 'galaxy') {
    const ships = makeShips(tier.planets + 1);
    S.invasions.push({
      id: Math.random().toString(36).slice(2),
      tierKey: tierKey,
      targetType: 'system',
      systemIdx: S.activeSystemIdx,
      ships: ships,
      spawnedAt: now,
      robberyEndsAt: now + INVASION_CFG.robberyDuration,
      destructionEndsAt: now + INVASION_CFG.totalDuration,
      hp: INVASION_CFG.planetMaxHP * (tier.planets + 1),
      maxHp: INVASION_CFG.planetMaxHP * (tier.planets + 1),
      stolen: 0,
      drainedEnergy: 0,
      drainedCiv: 0,
      defenseBroken: false,
    });
    toast('⚔️ ' + tier.label + ' на систему!', S.systemName + ' атакована');
    if (typeof playSFX === 'function') playSFX('invasion');
    if (typeof addEvent === 'function') {
      addEvent('invasion_spawn', tier.label + ' на «' + S.systemName + '»', { meta: { systemIdx: S.activeSystemIdx } });
    }
    return;
  }

  // ★ В фазе V атакуется РОВНО ОДНА планета
  const active = S.planets.filter(function(p) { return !p.forming && !isPlanetInvaded(p); });
  if (active.length === 0) return;
  
  const victim = active[Math.floor(Math.random() * active.length)];
  
  S.invasions.push({
    id: Math.random().toString(36).slice(2),
    tierKey: tierKey,
    targetType: 'planet',
    systemIdx: S.activeSystemIdx,
    planetSeed: victim.seed, // Одна планета
    ships: makeShips(tier.planets), // Кораблей больше, но цель одна
    spawnedAt: now,
    robberyEndsAt: now + INVASION_CFG.robberyDuration,
    destructionEndsAt: now + INVASION_CFG.totalDuration,
    hp: INVASION_CFG.planetMaxHP,
    maxHp: INVASION_CFG.planetMaxHP,
    stolen: 0,
    drainedEnergy: 0,
    drainedCiv: 0,
    defenseBroken: false,
  });

  toast('⚔️ ' + tier.label + '!', PLANET_TYPES[victim.type].name + ' атакована');
  if (typeof playSFX === 'function') playSFX('invasion');
  if (typeof addEvent === 'function') {
    addEvent('invasion_spawn', tier.label + ': ' + PLANET_TYPES[victim.type].name, { meta: { systemIdx: S.activeSystemIdx } });
  }
}

function makeShips(count) {
  const ships = [];
  for (let i = 0; i < count; i++) {
    ships.push({
      angle: (i / count) * Math.PI * 2 + Math.random() * 0.5,
      dist: 1.2 + Math.random() * 0.6,
      speed: 0.8 + Math.random() * 0.6,
      destroyed: false,
    });
  }
  return ships;
}

// ─── Дренаж энергии/цив за атаку ────────────────────────────────
// Возвращает: { energy, civ }
function calcDrain(tierKey, dtSec) {
  const tier = INVASION_CFG.tiers[tierKey];
  if (!tier) return { energy: 0, civ: 0 };

  const capE = Math.max(1, getResourceCap('energy'));
  const capC = Math.max(1, getResourceCap('civ'));

  // Сколько обитаемых планет в системе (сейчас)
  const civPlanets = civPlanetCount();

  // Если обитаемых нет — сражения нет, дренажа нет
  if (civPlanets === 0) return { energy: 0, civ: 0 };

  // Множитель от количества обитаемых планет
  const planetMult = 1 + 0.3 * civPlanets;

  // Снижение от автообороны
  let reduction = 0;
  if (S.nightConfig && S.nightConfig.defenseEnabled) {
    reduction = (INVASION_CFG.defenseDrainReduction || 0.05) * (S.defenseLevel || 0);
    reduction = Math.min(0.25, reduction);
  }

  // Скорость в час × доля часа
  const hours = dtSec / 3600;
  const eDrain = capE * tier.energyDrain * planetMult * hours * (1 - reduction);
  const cDrain = capC * tier.civDrain * planetMult * hours * (1 - reduction);

  return { energy: eDrain, civ: cDrain };
}

// ─── Тик вторжений ──────────────────────────────────────────────
function tickInvasions(dt) {
  if (!S.invasions) S.invasions = [];
  const now = Date.now();

  // Очистка истёкших временных эффектов
  if (S.activeTrophyEffects) {
    S.activeTrophyEffects = S.activeTrophyEffects.filter(function(e) {
      return !e.expiresAt || e.expiresAt > now;
    });
  }

  // Спавн новых атак
  if (S.stage === 'system' || S.stage === 'galaxy') {
    if (!S.lastInvasionCheck) S.lastInvasionCheck = now;
    const since = now - S.lastInvasionCheck;
    const interval = INVASION_CFG.intervalMin + Math.random() * (INVASION_CFG.intervalMax - INVASION_CFG.intervalMin);
    if (since >= interval) {
      S.lastInvasionCheck = now;
      if (Math.random() < INVASION_CFG.chance) spawnInvasion();
    }
  }

  for (let i = S.invasions.length - 1; i >= 0; i--) {
    const inv = S.invasions[i];
    const tier = INVASION_CFG.tiers[inv.tierKey] || INVASION_CFG.tiers.raid;

    // ─── Вторжение на СИСТЕМУ ───
    if (inv.targetType === 'system') {
      if (inv.systemIdx !== S.activeSystemIdx) {
        S.invasions.splice(i, 1);
        continue;
      }

      let aliveShips = 0;
      for (let s = 0; s < inv.ships.length; s++) if (!inv.ships[s].destroyed) aliveShips++;

      if (aliveShips === 0) {
        toast('✓ Вторжение отбито', S.systemName + ' спасена');
        if (typeof addEvent === 'function') addEvent('invasion_deflect', 'Вторжение на «' + S.systemName + '» отбито');
        if (!S.stats) S.stats = {};
        S.stats.invasionsDefeated = (S.stats.invasionsDefeated || 0) + 1;
        if (typeof checkAchievements === 'function') checkAchievements();
        S.invasions.splice(i, 1);
        continue;
      }

      // Дренаж ресурсов (только пока идёт грабёж и не пробита оборона)
      if (now < inv.robberyEndsAt && !inv.defenseBroken) {
        const drain = calcDrain(inv.tierKey, dt);
        if (drain.energy > 0) {
          const actual = Math.min(S.energy, drain.energy);
          S.energy -= actual;
          inv.drainedEnergy += actual;
          if (actual < drain.energy) inv.defenseBroken = true;
        }
        if (drain.civ > 0) {
          const actual = Math.min(S.civLevel, drain.civ);
          S.civLevel -= actual;
          inv.drainedCiv += actual;
          if (actual < drain.civ) inv.defenseBroken = true;
        }
      }

      // Грабёж пыли
      if (now < inv.robberyEndsAt && S.dust > 0) {
        const drain = dustPerSec() * INVASION_CFG.robberyMultiplier * tier.lootMult * aliveShips * dt;
        S.dust -= Math.min(S.dust, drain);
      }

      // Фаза уничтожения
      const robbingDone = now >= inv.robberyEndsAt || S.dust <= 0;
      if (robbingDone) {
        const hpDrain = inv.maxHp / (INVASION_CFG.destructionDuration / 1000);
        inv.hp -= hpDrain * dt;
        if (inv.hp <= 0 || now >= inv.destructionEndsAt) {
          // ★ Уничтожаем систему
          if (S.activeSystemIdx > 0) {
            const destroyedIdx = S.activeSystemIdx;
            if (typeof switchToSystem === 'function') switchToSystem(0);
            S.otherSystems[destroyedIdx] = null;
            S.systems--;
            toast('💀 Система уничтожена', 'Возврат на родную');
            if (typeof addEvent === 'function') addEvent('invasion_destroy', 'Система уничтожена');
          }
          S.invasions.splice(i, 1);
          continue;
        }
      }

      for (let s = 0; s < inv.ships.length; s++) {
        if (!inv.ships[s].destroyed) inv.ships[s].angle += inv.ships[s].speed * dt;
      }
      continue;
    }

    // ─── Вторжение на ПЛАНЕТУ ───
    let victim = null;
    for (let j = 0; j < S.planets.length; j++) {
      if (S.planets[j].seed === inv.planetSeed) { victim = S.planets[j]; break; }
    }

    if (!victim) {
      S.invasions.splice(i, 1);
      continue;
    }

    let aliveShips = 0;
    for (let s = 0; s < inv.ships.length; s++) if (!inv.ships[s].destroyed) aliveShips++;
    if (aliveShips === 0) {
      toast('✓ Вторжение отбито', PLANET_TYPES[victim.type].name + ' свободна');
      if (!S.stats) S.stats = {};
      S.stats.invasionsDefeated = (S.stats.invasionsDefeated || 0) + 1;
      if (typeof checkAchievements === 'function') checkAchievements();
      S.invasions.splice(i, 1);
      continue;
    }

    // Дренаж ресурсов
    if (now < inv.robberyEndsAt && !inv.defenseBroken) {
      const drain = calcDrain(inv.tierKey, dt);
      if (drain.energy > 0) {
        const actual = Math.min(S.energy, drain.energy);
        S.energy -= actual;
        inv.drainedEnergy += actual;
        if (actual < drain.energy) inv.defenseBroken = true;
      }
      if (drain.civ > 0) {
        const actual = Math.min(S.civLevel, drain.civ);
        S.civLevel -= actual;
        inv.drainedCiv += actual;
        if (actual < drain.civ) inv.defenseBroken = true;
      }
    }

    // Грабёж пыли
    if (now < inv.robberyEndsAt && S.dust > 0) {
      const drain = dustPerSec() * INVASION_CFG.robberyMultiplier * tier.lootMult * aliveShips * dt;
      S.dust -= Math.min(S.dust, drain);
    }

    // Фаза уничтожения
    const robbingDone = now >= inv.robberyEndsAt || S.dust <= 0;
    if (robbingDone) {
      const hpDrainPerSec = inv.maxHp / (INVASION_CFG.destructionDuration / 1000);
      inv.hp -= hpDrainPerSec * dt;
      if (inv.hp <= 0 || now >= inv.destructionEndsAt) {
        destroyPlanetByInvasion(victim);
        S.invasions.splice(i, 1);
        continue;
      }
    }

    for (let s = 0; s < inv.ships.length; s++) {
      if (!inv.ships[s].destroyed) inv.ships[s].angle += inv.ships[s].speed * dt;
    }
  }
}
window.tickInvasions = tickInvasions;

// ─── Уничтожение планеты ────────────────────────────────────────
function destroyPlanetByInvasion(victim) {
  const pt = PLANET_TYPES[victim.type];
  const wasCiv = pt.civ;
  let civPlanets = 0;
  for (let i = 0; i < S.planets.length; i++) {
    if (PLANET_TYPES[S.planets[i].type].civ && !S.planets[i].forming) civPlanets++;
  }

  const nowSec = performance.now() / 1000;
  const pos = getPlanetWorldPos(victim, nowSec);
  const sp = worldToScreen(pos.x, pos.y);

  S.explosions.push({ x: sp.x, y: sp.y, type: 'destroy', startAt: Date.now(), endAt: Date.now() + 2000, size: 60 });
  S.planets = S.planets.filter(function(p) { return p !== victim; });

  if (wasCiv && civPlanets > 0) {
    const share = 1 / civPlanets;
    S.civLevel = Math.max(0, S.civLevel - S.civLevel * share * 0.5);
    S.energy = Math.max(0, S.energy - S.energy * share * 0.5);
  }

  toast('💀 Планета уничтожена', pt.name);
  if (typeof playSFX === 'function') playSFX('explosion');
  if (typeof logPlanetDestroyed === 'function') logPlanetDestroyed(pt.name, 'invasion');
}
window.destroyPlanetByInvasion = destroyPlanetByInvasion;

// ─── Клик по кораблю ────────────────────────────────────────────
function tryHitInvasionShip(screenX, screenY) {
  if (!S.invasions || S.invasions.length === 0) return false;
  const z = S.zoom || 1;
  const hitR = INVASION_CFG.hitRadius * z;

  for (let i = S.invasions.length - 1; i >= 0; i--) {
    const inv = S.invasions[i];

    if (inv.targetType === 'system' && S.stage === 'galaxy') {
      const gPos = galaxySystemPos(inv.systemIdx, S.totalSystemsCreated, performance.now() / 1000);
      const shipOrbitWorld = 40;
      for (let si = inv.ships.length - 1; si >= 0; si--) {
        const ship = inv.ships[si];
        if (ship.destroyed) continue;
        const wx = gPos.x + Math.cos(ship.angle) * shipOrbitWorld * ship.dist;
        const wy = gPos.y + Math.sin(ship.angle) * shipOrbitWorld * ship.dist * 0.5;
        const d = Math.hypot(wx - screenX, wy - screenY);
        if (d < hitR) {
          ship.destroyed = true;
          S.explosions.push({ x: wx, y: wy, type: 'destroy', startAt: Date.now(), endAt: Date.now() + 500, size: 18 });
          return true;
        }
      }
      continue;
    }

    if (inv.targetType === 'planet' && inv.planetSeed) {
      let victim = null;
      for (let j = 0; j < S.planets.length; j++) {
        if (S.planets[j].seed === inv.planetSeed) { victim = S.planets[j]; break; }
      }
      if (victim) {
        const pos = getPlanetWorldPos(victim, performance.now() / 1000);
        const shipOrbitWorld = victim.diameter * 25;
        for (let si = inv.ships.length - 1; si >= 0; si--) {
          const ship = inv.ships[si];
          if (ship.destroyed) continue;
          const wx = pos.x + Math.cos(ship.angle) * shipOrbitWorld * ship.dist;
          const wy = pos.y + Math.sin(ship.angle) * shipOrbitWorld * ship.dist * 0.5;
          const sp = worldToScreen(wx, wy);
          const d = Math.hypot(sp.x - screenX, sp.y - screenY);
          if (d < hitR) {
            ship.destroyed = true;
            S.explosions.push({ x: sp.x, y: sp.y, type: 'destroy', startAt: Date.now(), endAt: Date.now() + 500, size: 18 });
            return true;
          }
        }
      }
    }
  }
  return false;
}
window.tryHitInvasionShip = tryHitInvasionShip;

// ─── Отрисовка (упрощённая, но с tier-ом) ─────────────────────
function drawInvasions(ctx, time) {
  if (!S.invasions || S.invasions.length === 0) return;
  const now = Date.now();
  const z = S.zoom || 1;

  for (let i = 0; i < S.invasions.length; i++) {
    const inv = S.invasions[i];
    const tier = INVASION_CFG.tiers[inv.tierKey] || INVASION_CFG.tiers.raid;

    if (inv.targetType === 'system' && S.stage === 'galaxy') {
      const gPos = galaxySystemPos(inv.systemIdx, S.totalSystemsCreated, time);
      drawSystemInvasionVisual(ctx, gPos, inv, tier, time, z);
      continue;
    }
    if (inv.targetType === 'planet' && S.stage === 'galaxy') continue;

    // Планетное вторжение — рисуем вокруг атакованной планеты
    if (inv.targetType === 'planet' && inv.planetSeed) {
      let victim = null;
      for (let j = 0; j < S.planets.length; j++) {
        if (S.planets[j].seed === inv.planetSeed) { victim = S.planets[j]; break; }
      }
      if (victim) {
        const pos = getPlanetWorldPos(victim, performance.now() / 1000);
        const sp = worldToScreen(pos.x, pos.y);
        drawPlanetInvasionVisual(ctx, sp, pos, victim, inv, tier, now, time, z);
      }
    }
  }
}
window.drawInvasions = drawInvasions;

function drawSystemInvasionVisual(ctx, gPos, inv, tier, time, z) {
  const now = Date.now();
  const pulse = 1 + 0.15 * Math.sin(time * 4);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const aura = ctx.createRadialGradient(gPos.x, gPos.y, 0, gPos.x, gPos.y, 50 * pulse);
  aura.addColorStop(0, 'rgba(255, 40, 40, 0.4)');
  aura.addColorStop(0.6, 'rgba(255, 40, 40, 0.15)');
  aura.addColorStop(1, 'rgba(255, 40, 40, 0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(gPos.x, gPos.y, 50 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  for (let si = 0; si < inv.ships.length; si++) {
    const ship = inv.ships[si];
    if (ship.destroyed) continue;
    const wx = gPos.x + Math.cos(ship.angle) * 40 * ship.dist;
    const wy = gPos.y + Math.sin(ship.angle) * 40 * ship.dist * 0.5;
    drawShip(ctx, wx, wy, ship.angle, z);
  }

  drawInvasionBar(ctx, gPos.x, gPos.y - 40 * z, inv, tier, now, z);
}

function drawPlanetInvasionVisual(ctx, sp, pos, victim, inv, tier, now, time, z) {
  const pulse = 1 + 0.15 * Math.sin(time * 4);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const aura = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, 45 * z * pulse);
  aura.addColorStop(0, 'rgba(255, 40, 40, 0.35)');
  aura.addColorStop(0.6, 'rgba(255, 40, 40, 0.15)');
  aura.addColorStop(1, 'rgba(255, 40, 40, 0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(sp.x, sp.y, 45 * z * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const shipOrbitWorld = victim.diameter * 25;
  for (let si = 0; si < inv.ships.length; si++) {
    const ship = inv.ships[si];
    if (ship.destroyed) continue;
    const wx = pos.x + Math.cos(ship.angle) * shipOrbitWorld * ship.dist;
    const wy = pos.y + Math.sin(ship.angle) * shipOrbitWorld * ship.dist * 0.5;
    const ssp = worldToScreen(wx, wy);
    drawShip(ctx, ssp.x, ssp.y, ship.angle, z);
  }

  drawInvasionBar(ctx, sp.x, sp.y - 40 * z, inv, tier, now, z, victim);
}

function drawShip(ctx, sx, sy, angle, z) {
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(angle + Math.PI / 2);
  ctx.fillStyle = '#ff3030';
  ctx.beginPath();
  ctx.moveTo(6 * z, 0);
  ctx.lineTo(-4 * z, -5 * z);
  ctx.lineTo(-2 * z, 0);
  ctx.lineTo(-4 * z, 5 * z);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawInvasionBar(ctx, sx, sy, inv, tier, now, z, victim) {
  const elapsed = now - inv.spawnedAt;
  const total = INVASION_CFG.totalDuration;
  const remainMs = Math.max(0, total - elapsed);
  const mm = String(Math.floor(remainMs / 60000)).padStart(2, '0');
  const ss = String(Math.floor((remainMs % 60000) / 1000)).padStart(2, '0');
  const barW = 70 * z, barH = 4 * z;
  const barX = sx - barW / 2;
  const barY = sy;

  const tierColor = inv.tierKey === 'siege' ? '#ff2020'
                  : inv.tierKey === 'raid' ? '#ff8844' : '#ffcc55';

  ctx.save();
  ctx.fillStyle = 'rgba(15, 5, 5, 0.85)';
  ctx.fillRect(barX - 2, barY - 26 * z, barW + 4, 36 * z);
  ctx.strokeStyle = 'rgba(255, 60, 60, 0.6)';
  ctx.strokeRect(barX - 2, barY - 26 * z, barW + 4, 36 * z);
  ctx.fillStyle = '#ffd0d0';
  ctx.font = 'bold ' + Math.round(7 * z) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const label = (victim ? PLANET_TYPES[victim.type].name : S.systemName);
  ctx.fillText('⚔ ' + tier.label + ' · ' + label, sx, barY - 19 * z);

  const isDestroying = elapsed >= INVASION_CFG.robberyDuration;
  const phaseLabel = isDestroying ? '💀 УНИЧТОЖЕНИЕ' : '💰 ГРАБЁЖ';
  const hpPct = inv.hp / inv.maxHp;
  ctx.fillStyle = tierColor;
  ctx.fillRect(barX, barY - 10 * z, barW * Math.max(0, hpPct), barH);
  ctx.fillText(phaseLabel + ' · ' + mm + ':' + ss, sx, barY - 4 * z);
  ctx.restore();
}