// ═══════════════════════════════════════════════════════════════
//  INVASIONS.JS — вторжения (планетные и системные)
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

// ─── Создание вторжения ─────────────────────────────────────────
function spawnInvasion() {
  const now = Date.now();

  // ★ В фазе галактики атакуется СИСТЕМА
  if (S.stage === 'galaxy') {
    const shipCount = Math.min(INVASION_CFG.shipsMax, INVASION_CFG.shipsBase + 2);
    const ships = [];
    for (let i = 0; i < shipCount; i++) {
      ships.push({
        angle: (i / shipCount) * Math.PI * 2 + Math.random() * 0.5,
        dist: 1.2 + Math.random() * 0.4,
        speed: 0.8 + Math.random() * 0.6,
        destroyed: false,
      });
    }
    S.invasions.push({
      id: Math.random().toString(36).slice(2),
      targetType: 'system',
      systemIdx: S.activeSystemIdx,
      ships: ships,
      spawnedAt: now,
      robberyEndsAt: now + INVASION_CFG.robberyDuration,
      destructionEndsAt: now + INVASION_CFG.totalDuration,
      hp: 200,
      stolen: 0,
    });
    toast('⚔️ Вторжение на систему!', S.systemName + ' атакована флотом');
    if (typeof addEvent === 'function') {
      addEvent('invasion_spawn', 'Вторжение на систему «' + S.systemName + '»', { meta: { systemIdx: S.activeSystemIdx } });
    }
    return;
  }

  // ★ В фазе V атакуется ПЛАНЕТА
  const active = S.planets.filter(function(p) { return !p.forming; });
  if (active.length === 0) return;
  const candidates = active.filter(function(p) { return !isPlanetInvaded(p); });
  if (candidates.length === 0) return;

  const victim = candidates[Math.floor(Math.random() * candidates.length)];
  const shipCount = Math.min(INVASION_CFG.shipsMax, INVASION_CFG.shipsBase + Math.floor(S.planets.length / 3));
  
  const ships = [];
  for (let i = 0; i < shipCount; i++) {
    ships.push({
      angle: (i / shipCount) * Math.PI * 2 + Math.random() * 0.5,
      dist: 1.8 + Math.random() * 0.6,
      speed: 0.8 + Math.random() * 0.6,
      destroyed: false,
    });
  }

  S.invasions.push({
    id: Math.random().toString(36).slice(2),
    targetType: 'planet',
    systemIdx: S.activeSystemIdx,
    planetSeed: victim.seed,
    ships: ships,
    spawnedAt: now,
    robberyEndsAt: now + INVASION_CFG.robberyDuration,
    destructionEndsAt: now + INVASION_CFG.totalDuration,
    hp: INVASION_CFG.planetMaxHP,
    stolen: 0,
  });

  toast('⚔️ Вторжение!', PLANET_TYPES[victim.type].name + ' атакована');
  if (typeof addEvent === 'function') {
    addEvent('invasion_spawn', 'Вторжение на «' + PLANET_TYPES[victim.type].name + '»', { meta: { systemIdx: S.activeSystemIdx } });
  }
}

// ─── Тик вторжений ──────────────────────────────────────────────
function tickInvasions(dt) {
  if (!S.invasions) S.invasions = [];
  const now = Date.now();

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

    if (inv.targetType === 'system') {
      if (inv.systemIdx !== S.activeSystemIdx) {
        S.invasions.splice(i, 1); // Игрок ушёл в другую систему
        continue;
      }
      
      let aliveShips = 0;
      for (let s = 0; s < inv.ships.length; s++) if (!inv.ships[s].destroyed) aliveShips++;
      
      if (aliveShips === 0) {
        toast('✓ Вторжение отбито', S.systemName + ' спасена');
        if (typeof addEvent === 'function') addEvent('invasion_deflect', 'Вторжение на «' + S.systemName + '» отбито');
        S.invasions.splice(i, 1);
        continue;
      }

      if (now < inv.robberyEndsAt && S.dust > 0) {
        const drain = dustPerSec() * INVASION_CFG.robberyMultiplier * 2 * aliveShips * dt;
        S.dust -= Math.min(S.dust, drain);
      }

      const robbingDone = now >= inv.robberyEndsAt || S.dust <= 0;
      if (robbingDone) {
        const hpDrain = 200 / (INVASION_CFG.destructionDuration / 1000);
        inv.hp -= hpDrain * dt;
        if (inv.hp <= 0 || now >= inv.destructionEndsAt) {
          if (S.activeSystemIdx > 0) {
            S.otherSystems[S.activeSystemIdx] = null;
            S.systems--;
            S.activeSystemIdx = 0;
            toast('💀 Система уничтожена', 'Возврат на родную');
            if (typeof addEvent === 'function') addEvent('invasion_destroy', 'Система «' + S.systemName + '» уничтожена');
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

    // Для планет
    let victim = null;
    for (let j = 0; j < S.planets.length; j++) {
      if (S.planets[j].seed === inv.planetSeed) { victim = S.planets[j]; break; }
    }
    if (!victim) { S.invasions.splice(i, 1); continue; }

    let aliveShips = 0;
    for (let s = 0; s < inv.ships.length; s++) if (!inv.ships[s].destroyed) aliveShips++;
    if (aliveShips === 0) {
      toast('✓ Вторжение отбито', PLANET_TYPES[victim.type].name + ' свободна');
      S.invasions.splice(i, 1);
      continue;
    }

    if (now < inv.robberyEndsAt && S.dust > 0) {
      const drain = dustPerSec() * INVASION_CFG.robberyMultiplier * aliveShips * dt;
      S.dust -= Math.min(S.dust, drain);
    }

    const robbingDone = now >= inv.robberyEndsAt || S.dust <= 0;
    if (robbingDone) {
      const hpDrainPerSec = INVASION_CFG.planetMaxHP / (INVASION_CFG.destructionDuration / 1000);
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
    toast('💀 Планета уничтожена', pt.name);
    if (typeof logPlanetDestroyed === 'function') logPlanetDestroyed(pt.name, 'invasion');
  } else {
    toast('💀 Планета уничтожена', pt.name);
    if (typeof logPlanetDestroyed === 'function') logPlanetDestroyed(pt.name, 'invasion');
  }
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
          let alive = false;
          for (let k = 0; k < inv.ships.length; k++) if (!inv.ships[k].destroyed) { alive = true; break; }
          if (!alive) {
            toast('✓ Вторжение отбито', S.systemName + ' спасена');
            S.invasions.splice(i, 1);
          }
          return true;
        }
      }
      continue;
    }

    if (inv.targetType === 'planet') {
      let victim = null;
      for (let j = 0; j < S.planets.length; j++) if (S.planets[j].seed === inv.planetSeed) { victim = S.planets[j]; break; }
      if (!victim) continue;
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
          let alive = false;
          for (let k = 0; k < inv.ships.length; k++) if (!inv.ships[k].destroyed) { alive = true; break; }
          if (!alive) {
            toast('✓ Вторжение отбито', PLANET_TYPES[victim.type].name + ' свободна');
            S.invasions.splice(i, 1);
          }
          return true;
        }
      }
    }
  }
  return false;
}
window.tryHitInvasionShip = tryHitInvasionShip;

// ─── Отрисовка ──────────────────────────────────────────────────
function drawInvasions(ctx, time) {
  if (!S.invasions || S.invasions.length === 0) return;
  const now = Date.now();
  const z = S.zoom || 1;

  for (let i = 0; i < S.invasions.length; i++) {
    const inv = S.invasions[i];

    if (inv.targetType === 'system' && S.stage === 'galaxy') {
      const gPos = galaxySystemPos(inv.systemIdx, S.totalSystemsCreated, time);
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

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(wx, wy, 0, wx, wy, 12);
        g.addColorStop(0, 'rgba(255, 60, 60, 1)');
        g.addColorStop(1, 'rgba(180, 0, 0, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(wx, wy, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.translate(wx, wy);
        ctx.rotate(ship.angle + Math.PI / 2);
        ctx.fillStyle = '#ff3030';
        ctx.beginPath();
        ctx.moveTo(6, 0);
        ctx.lineTo(-4, -5);
        ctx.lineTo(-2, 0);
        ctx.lineTo(-4, 5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      const elapsed = now - inv.spawnedAt;
      const total = INVASION_CFG.totalDuration;
      const remainMs = Math.max(0, total - elapsed);
      const mm = String(Math.floor(remainMs / 60000)).padStart(2, '0');
      const ss = String(Math.floor((remainMs % 60000) / 1000)).padStart(2, '0');
      const barW = 70, barH = 4;
      const barX = gPos.x - barW / 2;
      const barY = gPos.y - 40;

      ctx.save();
      ctx.fillStyle = 'rgba(15, 5, 5, 0.85)';
      ctx.fillRect(barX - 2, barY - 26, barW + 4, 36);
      ctx.strokeStyle = 'rgba(255, 60, 60, 0.6)';
      ctx.strokeRect(barX - 2, barY - 26, barW + 4, 36);
      ctx.fillStyle = '#ffd0d0';
      ctx.font = 'bold 7px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚔ ' + S.systemName, gPos.x, barY - 19);
      ctx.fillStyle = '#ff3030';
      ctx.fillRect(barX, barY - 10, barW * (elapsed / total), barH);
      ctx.fillText('УНИЧТОЖЕНИЕ ' + mm + ':' + ss, gPos.x, barY - 4);
      ctx.restore();
      continue;
    }

    // ★ Планетарные вторжения не отрисовываются в галактическом виде
    if (inv.targetType === 'planet' && S.stage === 'galaxy') {
      continue;
    }

    // Отрисовка планетных вторжений (старая логика)
    let victim = null;
    for (let j = 0; j < S.planets.length; j++) if (S.planets[j].seed === inv.planetSeed) { victim = S.planets[j]; break; }
    if (!victim) continue;

    const pos = getPlanetWorldPos(victim, performance.now() / 1000);
    const centerSp = worldToScreen(pos.x, pos.y);

    const pulse = 1 + 0.15 * Math.sin(time * 4);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const aura = ctx.createRadialGradient(centerSp.x, centerSp.y, 0, centerSp.x, centerSp.y, 45 * z * pulse);
    aura.addColorStop(0, 'rgba(255, 40, 40, 0.35)');
    aura.addColorStop(0.6, 'rgba(255, 40, 40, 0.15)');
    aura.addColorStop(1, 'rgba(255, 40, 40, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(centerSp.x, centerSp.y, 45 * z * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const shipOrbitWorld = victim.diameter * 25;
    for (let si = 0; si < inv.ships.length; si++) {
      const ship = inv.ships[si];
      if (ship.destroyed) continue;
      const wx = pos.x + Math.cos(ship.angle) * shipOrbitWorld * ship.dist;
      const wy = pos.y + Math.sin(ship.angle) * shipOrbitWorld * ship.dist * 0.5;
      const sp = worldToScreen(wx, wy);

      ctx.save();
      ctx.translate(sp.x, sp.y);
      ctx.rotate(ship.angle + Math.PI / 2);
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

    const elapsed = now - inv.spawnedAt;
    const total = INVASION_CFG.totalDuration;
    const remainMs = Math.max(0, total - elapsed);
    const mm = String(Math.floor(remainMs / 60000)).padStart(2, '0');
    const ss = String(Math.floor((remainMs % 60000) / 1000)).padStart(2, '0');
    const barW = 70 * z, barH = 4 * z;
    const barX = centerSp.x - barW / 2;
    const barY = centerSp.y - 40 * z;

    ctx.save();
    ctx.fillStyle = 'rgba(15, 5, 5, 0.85)';
    ctx.fillRect(barX - 2, barY - 26 * z, barW + 4, 36 * z);
    ctx.strokeStyle = 'rgba(255, 60, 60, 0.6)';
    ctx.strokeRect(barX - 2, barY - 26 * z, barW + 4, 36 * z);
    ctx.fillStyle = '#ffd0d0';
    ctx.font = 'bold ' + Math.round(7 * z) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚔ ' + PLANET_TYPES[victim.type].name, centerSp.x, barY - 19 * z);
    
    const isDestroying = elapsed >= INVASION_CFG.robberyDuration;
    const phaseLabel = isDestroying ? '💀 УНИЧТОЖЕНИЕ' : '💰 ГРАБЁЖ';
    const phaseColor = isDestroying ? '#ff3030' : '#ff9944';
    
    ctx.fillStyle = phaseColor;
    ctx.fillRect(barX, barY - 10 * z, barW * (elapsed / total), barH);
    ctx.fillText(phaseLabel + ' · ' + mm + ':' + ss, centerSp.x, barY - 4 * z);
    ctx.restore();
  }
}
window.drawInvasions = drawInvasions;