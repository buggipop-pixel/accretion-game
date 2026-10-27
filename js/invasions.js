// ═══════════════════════════════════════════════════════════════
//  INVASIONS.JS — Вторжения на системы и планеты
// ═══════════════════════════════════════════════════════════════

function isPlanetInvaded(planet) {
  if (!S.invasions) return false;
  for (let i = 0; i < S.invasions.length; i++) {
    if (S.invasions[i].targetType === 'planet' && S.invasions[i].planetSeed === planet.seed) return true;
  }
  return false;
}
window.isPlanetInvaded = isPlanetInvaded;

function hasActiveInvasions() {
  return S.invasions && S.invasions.length > 0;
}
window.hasActiveInvasions = hasActiveInvasions;

// ─── Выбор сложности ────────────────────────────────────────────
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

// ─── Создание кораблей ──────────────────────────────────────────
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

// ─── Запуск вторжения ───────────────────────────────────────────
function spawnInvasion() {
  const now = Date.now();
  const tierKey = rollInvasionTier();
  const tier = INVASION_CFG.tiers[tierKey];

  // ★ Определяем цель: если систем > 1 или мы в галактике — бьем по системе
  if (S.stage === 'galaxy' || S.systems > 1) {
    const availableSystems = [0];
    for (let i = 1; i < S.otherSystems.length; i++) {
      if (S.otherSystems[i]) availableSystems.push(i);
    }
    
    const targetIdx = availableSystems[Math.floor(Math.random() * availableSystems.length)];
    const isActive = (targetIdx === S.activeSystemIdx && S.stage === 'system');
    const sysName = targetIdx === 0 ? 'Родная' : S.otherSystems[targetIdx].name;

    const shipCount = Math.min(INVASION_CFG.shipsMax, INVASION_CFG.shipsBase + 2);
    S.invasions.push({
      id: Math.random().toString(36).slice(2),
      tierKey: tierKey,
      targetType: 'system',
      systemIdx: targetIdx,
      ships: makeShips(shipCount),
      spawnedAt: now,
      robberyEndsAt: now + INVASION_CFG.robberyDuration,
      destructionEndsAt: now + INVASION_CFG.totalDuration,
      hp: 200,
      maxHp: 200,
      stolen: 0,
      drainedEnergy: 0,
      drainedCiv: 0,
      defenseBroken: false,
      notified: isActive || S.stage === 'galaxy',
    });

    if (!isActive && S.stage !== 'galaxy') {
      // Игрок в другой системе — присылаем уведомление
      toast('⚔️ Вторжение!', 'Атакована система «' + sysName + '»');
      if (typeof playSFX === 'function') playSFX('invasion');
      if (typeof addEvent === 'function') addEvent('invasion_spawn', tier.label + ' на систему «' + sysName + '»', { meta: { systemIdx: targetIdx } });
    }
    return;
  }

  // ★ Если система всего одна — бьем по планете
  const active = S.planets.filter(function(p) { return !p.forming && !isPlanetInvaded(p); });
  if (active.length === 0) return;

  const victim = active[Math.floor(Math.random() * active.length)];
  const shipCount = Math.min(INVASION_CFG.shipsMax, INVASION_CFG.shipsBase + 1);
  
  S.invasions.push({
    id: Math.random().toString(36).slice(2),
    tierKey: tierKey,
    targetType: 'planet',
    systemIdx: S.activeSystemIdx,
    planetSeed: victim.seed,
    ships: makeShips(shipCount),
    spawnedAt: now,
    robberyEndsAt: now + INVASION_CFG.robberyDuration,
    destructionEndsAt: now + INVASION_CFG.totalDuration,
    hp: INVASION_CFG.planetMaxHP,
    maxHp: INVASION_CFG.planetMaxHP,
    stolen: 0,
    drainedEnergy: 0,
    drainedCiv: 0,
    defenseBroken: false,
    notified: true,
  });

  toast('⚔️ Вторжение!', PLANET_TYPES[victim.type].name + ' атакована');
  if (typeof playSFX === 'function') playSFX('invasion');
  if (typeof addEvent === 'function') addEvent('invasion_spawn', tier.label + ': ' + PLANET_TYPES[victim.type].name);
}

// ─── Тик вторжений ──────────────────────────────────────────────
function tickInvasions(dt) {
  if (!S.invasions) S.invasions = [];
  const now = Date.now();

  if (S.activeTrophyEffects) {
    S.activeTrophyEffects = S.activeTrophyEffects.filter(e => !e.expiresAt || e.expiresAt > now);
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

    // ★ Автооборона (сбивает корабли)
    if (S.nightDefenseExpiresAt > now && inv.ships) {
      let alive = 0;
      for (let s = 0; s < inv.ships.length; s++) if (!inv.ships[s].destroyed) alive++;
      if (alive > 0) {
        inv.autoDefenseTimer = (inv.autoDefenseTimer || 0) + dt;
        const interval = 15 / (S.nightDefenseLevel || 1);
        if (inv.autoDefenseTimer >= interval) {
          inv.autoDefenseTimer = 0;
          for (let s = 0; s < inv.ships.length; s++) {
            if (!inv.ships[s].destroyed) {
              inv.ships[s].destroyed = true;
              break;
            }
          }
          alive = 0;
          for (let s = 0; s < inv.ships.length; s++) if (!inv.ships[s].destroyed) alive++;
          
          if (alive === 0) {
            if (inv.notified) toast('✓ Отбито', 'Автооборона сбила флот');
            if (!S.stats) S.stats = {};
            S.stats.invasionsDefeated = (S.stats.invasionsDefeated || 0) + 1;
            S.invasions.splice(i, 1);
            continue;
          }
        }
      }
    }

    // ─── Вторжение на СИСТЕМУ ───
    if (inv.targetType === 'system') {
      let aliveShips = 0;
      for (let s = 0; s < inv.ships.length; s++) if (!inv.ships[s].destroyed) aliveShips++;

      if (aliveShips === 0) {
        if (inv.notified) toast('✓ Вторжение отбито', 'Система спасена');
        if (!S.stats) S.stats = {};
        S.stats.invasionsDefeated = (S.stats.invasionsDefeated || 0) + 1;
        S.invasions.splice(i, 1);
        continue;
      }

      if (now < inv.robberyEndsAt && !inv.defenseBroken) {
        const capE = Math.max(1, getResourceCap('energy'));
        const capC = Math.max(1, getResourceCap('civ'));
        const civPlanets = civPlanetCount();
        if (civPlanets > 0) {
          const hours = dt / 3600;
          const reduction = S.nightConfig.defenseEnabled ? Math.min(0.25, (INVASION_CFG.defenseDrainReduction || 0.05) * (S.defenseLevel || 0)) : 0;
          const eDrain = capE * tier.energyDrain * (1 + 0.3 * civPlanets) * hours * (1 - reduction);
          const cDrain = capC * tier.civDrain * (1 + 0.3 * civPlanets) * hours * (1 - reduction);
          
          const actualE = Math.min(S.energy, eDrain);
          const actualC = Math.min(S.civLevel, cDrain);
          S.energy -= actualE;
          S.civLevel -= actualC;
          inv.drainedEnergy += actualE;
          inv.drainedCiv += actualC;
          if (actualE < eDrain || actualC < cDrain) inv.defenseBroken = true;
        }
      }

      if (now < inv.robberyEndsAt && S.dust > 0) {
        const drain = dustPerSec() * INVASION_CFG.robberyMultiplier * tier.lootMult * aliveShips * dt;
        S.dust -= Math.min(S.dust, drain);
      }

      const robbingDone = now >= inv.robberyEndsAt || S.dust <= 0;
      if (robbingDone) {
        const hpDrain = inv.maxHp / (INVASION_CFG.destructionDuration / 1000);
        inv.hp -= hpDrain * dt;
        
        if (inv.hp <= 0 || now >= inv.destructionEndsAt) {
          if (inv.systemIdx > 0) {
            S.otherSystems[inv.systemIdx] = null;
            S.systems--;
            if (S.activeSystemIdx === inv.systemIdx) {
              if (typeof switchToSystem === 'function') switchToSystem(0);
              S.stage = S.systems >= 5 ? 'galaxy' : 'system';
            }
            toast('💀 Система уничтожена', 'Врагам удалось прорваться');
            if (typeof addEvent === 'function') addEvent('invasion_destroy', 'Система уничтожена вторжением');
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
    if (!victim) { S.invasions.splice(i, 1); continue; }

    let aliveShips = 0;
    for (let s = 0; s < inv.ships.length; s++) if (!inv.ships[s].destroyed) aliveShips++;
    if (aliveShips === 0) {
      toast('✓ Вторжение отбито', PLANET_TYPES[victim.type].name + ' свободна');
      if (!S.stats) S.stats = {};
      S.stats.invasionsDefeated = (S.stats.invasionsDefeated || 0) + 1;
      S.invasions.splice(i, 1);
      continue;
    }

    if (now < inv.robberyEndsAt && S.dust > 0) {
      const drain = dustPerSec() * INVASION_CFG.robberyMultiplier * tier.lootMult * aliveShips * dt;
      S.dust -= Math.min(S.dust, drain);
    }

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

function destroyPlanetByInvasion(victim) {
  const pt = PLANET_TYPES[victim.type];
  const nowSec = performance.now() / 1000;
  const pos = getPlanetWorldPos(victim, nowSec);
  const sp = worldToScreen(pos.x, pos.y);

  S.explosions.push({ x: sp.x, y: sp.y, type: 'destroy', startAt: Date.now(), endAt: Date.now() + 2000, size: 60 });
  S.planets = S.planets.filter(function(p) { return p !== victim; });

  toast('💀 Планета уничтожена', pt.name);
  if (typeof playSFX === 'function') playSFX('explosion');
  if (typeof logPlanetDestroyed === 'function') logPlanetDestroyed(pt.name, 'invasion');
}

// ─── Клик по кораблю ────────────────────────────────────────────
function tryHitInvasionShip(screenX, screenY) {
  if (!S.invasions || S.invasions.length === 0) return false;
  const z = S.zoom || 1;
  const hitR = INVASION_CFG.hitRadius * z;

  for (let i = S.invasions.length - 1; i >= 0; i--) {
    const inv = S.invasions[i];

    if (inv.targetType === 'system') {
      let cxPos, cyPos, shipOrbitWorld;
      if (S.stage === 'galaxy') {
        const gPos = galaxySystemPos(inv.systemIdx, S.totalSystemsCreated, performance.now() / 1000);
        cxPos = gPos.x; cyPos = gPos.y; shipOrbitWorld = 40;
      } else if (S.stage === 'system' && inv.systemIdx === S.activeSystemIdx) {
        const cp = worldToScreen(0, 0);
        cxPos = cp.x; cyPos = cp.y; shipOrbitWorld = 120 * z;
      } else {
        continue;
      }

      for (let si = inv.ships.length - 1; si >= 0; si--) {
        const ship = inv.ships[si];
        if (ship.destroyed) continue;
        const wx = cxPos + Math.cos(ship.angle) * shipOrbitWorld * ship.dist;
        const wy = cyPos + Math.sin(ship.angle) * shipOrbitWorld * ship.dist * 0.5;
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

// ─── Отрисовка ──────────────────────────────────────────────────
function drawInvasions(ctx, time) {
  if (!S.invasions || S.invasions.length === 0) return;
  const now = Date.now();
  const z = S.zoom || 1;

  for (let i = 0; i < S.invasions.length; i++) {
    const inv = S.invasions[i];
    const tier = INVASION_CFG.tiers[inv.tierKey] || INVASION_CFG.tiers.raid;

    if (inv.targetType === 'system') {
      let cxPos, cyPos, shipOrbitWorld;

      if (S.stage === 'galaxy') {
        const gPos = galaxySystemPos(inv.systemIdx, S.totalSystemsCreated, time);
        cxPos = gPos.x; cyPos = gPos.y; shipOrbitWorld = 40;
      } else if (S.stage === 'system' && inv.systemIdx === S.activeSystemIdx) {
        const cp = worldToScreen(0, 0);
        cxPos = cp.x; cyPos = cp.y; shipOrbitWorld = 120 * z;
      } else {
        continue; // Игрок не видит эту систему
      }

      const pulse = 1 + 0.15 * Math.sin(time * 4);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const auraR = S.stage === 'galaxy' ? 50 * z : 80 * z;
      const aura = ctx.createRadialGradient(cxPos, cyPos, 0, cxPos, cyPos, auraR * pulse);
      aura.addColorStop(0, 'rgba(255, 40, 40, 0.4)');
      aura.addColorStop(0.6, 'rgba(255, 40, 40, 0.15)');
      aura.addColorStop(1, 'rgba(255, 40, 40, 0)');
      ctx.fillStyle = aura; ctx.beginPath(); ctx.arc(cxPos, cyPos, auraR * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      for (let si = 0; si < inv.ships.length; si++) {
        const ship = inv.ships[si];
        if (ship.destroyed) continue;
        const wx = cxPos + Math.cos(ship.angle) * shipOrbitWorld * ship.dist;
        const wy = cyPos + Math.sin(ship.angle) * shipOrbitWorld * ship.dist * 0.5;

        ctx.save();
        ctx.translate(wx, wy);
        ctx.rotate(ship.angle + Math.PI / 2);
        ctx.fillStyle = '#ff3030';
        ctx.beginPath();
        ctx.moveTo(6 * z, 0); ctx.lineTo(-4 * z, -5 * z); ctx.lineTo(-2 * z, 0); ctx.lineTo(-4 * z, 5 * z); ctx.closePath(); ctx.fill();
        ctx.restore();
      }

      const elapsed = now - inv.spawnedAt, total = INVASION_CFG.totalDuration;
      const remainMs = Math.max(0, total - elapsed);
      const mm = String(Math.floor(remainMs / 60000)).padStart(2, '0'), ss = String(Math.floor((remainMs % 60000) / 1000)).padStart(2, '0');
      const barW = 70 * z, barH = 4 * z;
      const barX = cxPos - barW / 2, barY = cyPos - (S.stage === 'galaxy' ? 40 : 160) * z;

      ctx.save();
      ctx.fillStyle = 'rgba(15, 5, 5, 0.85)'; ctx.fillRect(barX - 2, barY - 26 * z, barW + 4, 36 * z);
      ctx.strokeStyle = 'rgba(255, 60, 60, 0.6)'; ctx.strokeRect(barX - 2, barY - 26 * z, barW + 4, 36 * z);
      ctx.fillStyle = '#ffd0d0'; ctx.font = 'bold ' + Math.round(7 * z) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      
      let sysName = inv.systemIdx === 0 ? 'Родная' : (S.otherSystems[inv.systemIdx] ? S.otherSystems[inv.systemIdx].name : 'Неизвестно');
      ctx.fillText('⚔ ' + sysName, cxPos, barY - 19 * z);
      ctx.fillStyle = '#ff3030'; ctx.fillRect(barX, barY - 10 * z, barW * (elapsed / total), barH);
      ctx.fillText('УНИЧТОЖЕНИЕ ' + mm + ':' + ss, cxPos, barY - 4 * z);
      ctx.restore();
      continue;
    }

    if (inv.targetType === 'planet' && S.stage === 'galaxy') continue;

    if (inv.targetType === 'planet' && inv.planetSeed) {
      let victim = null;
      for (let j = 0; j < S.planets.length; j++) {
        if (S.planets[j].seed === inv.planetSeed) { victim = S.planets[j]; break; }
      }
      if (!victim) continue;

      const pos = getPlanetWorldPos(victim, performance.now() / 1000);
      const sp = worldToScreen(pos.x, pos.y);
      const pulse = 1 + 0.15 * Math.sin(time * 4);

      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const aura = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, 45 * z * pulse);
      aura.addColorStop(0, 'rgba(255, 40, 40, 0.35)'); aura.addColorStop(0.6, 'rgba(255, 40, 40, 0.15)'); aura.addColorStop(1, 'rgba(255, 40, 40, 0)');
      ctx.fillStyle = aura; ctx.beginPath(); ctx.arc(sp.x, sp.y, 45 * z * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      const shipOrbitWorld = victim.diameter * 25;
      for (let si = 0; si < inv.ships.length; si++) {
        const ship = inv.ships[si];
        if (ship.destroyed) continue;
        const wx = pos.x + Math.cos(ship.angle) * shipOrbitWorld * ship.dist;
        const wy = pos.y + Math.sin(ship.angle) * shipOrbitWorld * ship.dist * 0.5;
        const ssp = worldToScreen(wx, wy);
        ctx.save(); ctx.translate(ssp.x, ssp.y); ctx.rotate(ship.angle + Math.PI / 2);
        ctx.fillStyle = '#ff3030'; ctx.beginPath();
        ctx.moveTo(6 * z, 0); ctx.lineTo(-4 * z, -5 * z); ctx.lineTo(-2 * z, 0); ctx.lineTo(-4 * z, 5 * z); ctx.closePath(); ctx.fill();
        ctx.restore();
      }

      const elapsed = now - inv.spawnedAt, total = INVASION_CFG.totalDuration;
      const remainMs = Math.max(0, total - elapsed);
      const mm = String(Math.floor(remainMs / 60000)).padStart(2, '0'), ss = String(Math.floor((remainMs % 60000) / 1000)).padStart(2, '0');
      const barW = 70 * z, barH = 4 * z;
      const barX = sp.x - barW / 2, barY = sp.y - 40 * z;

      ctx.save();
      ctx.fillStyle = 'rgba(15, 5, 5, 0.85)'; ctx.fillRect(barX - 2, barY - 26 * z, barW + 4, 36 * z);
      ctx.strokeStyle = 'rgba(255, 60, 60, 0.6)'; ctx.strokeRect(barX - 2, barY - 26 * z, barW + 4, 36 * z);
      ctx.fillStyle = '#ffd0d0'; ctx.font = 'bold ' + Math.round(7 * z) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⚔ ' + PLANET_TYPES[victim.type].name, sp.x, barY - 19 * z);
      
      const isDestroying = elapsed >= INVASION_CFG.robberyDuration;
      const phaseLabel = isDestroying ? '💀 УНИЧТОЖЕНИЕ' : '💰 ГРАБЁЖ';
      const phaseColor = isDestroying ? '#ff3030' : '#ff9944';
      
      ctx.fillStyle = phaseColor; ctx.fillRect(barX, barY - 10 * z, barW * (elapsed / total), barH);
      ctx.fillText(phaseLabel + ' · ' + mm + ':' + ss, sp.x, barY - 4 * z);
      ctx.restore();
    }
  }
}

window.spawnInvasion = spawnInvasion;
window.tickInvasions = tickInvasions;
window.drawInvasions = drawInvasions;
window.tryHitInvasionShip = tryHitInvasionShip;
window.destroyPlanetByInvasion = destroyPlanetByInvasion;