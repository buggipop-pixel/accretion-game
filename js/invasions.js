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

// ─── ФЛОТ КАК АВТООБОРОНА ───────────────────────────────────────
// Корабли из Верфи больше не сбивают врагов «сами по себе»: автообороной
// управляет только активированный флот. Активировать его можно, лишь
// когда активна Автоборона уровня FLEET_CFG.activationDefenseLevel (5).

function fleetShipTotal() {
  let total = 0;
  if (!S.fleet) return 0;
  for (const key in FLEET_CFG.ships) {
    total += Math.max(0, Math.floor(Number(S.fleet[key]) || 0));
  }
  return total;
}

function fleetDps() {
  let dps = 0;
  if (!S.fleet) return 0;
  for (const key in FLEET_CFG.ships) {
    const cfg = FLEET_CFG.ships[key];
    const count = Math.max(0, Number(S.fleet[key]) || 0);
    dps += count * (Number(cfg.damage) || 0) * (Number(cfg.fireRate) || 0);
  }
  return dps;
}

function fleetDefenseLevelReq() {
  return Math.max(1, Math.floor(Number(FLEET_CFG.activationDefenseLevel) || 5));
}

// Условие активации: активная Автоборона уровня >= 5. Уровень считает
// общий хелпер activeDefenseLevel() (платная активация + трофеи).
function fleetDefenseReady(now) {
  return activeDefenseLevel(now) >= fleetDefenseLevelReq();
}

function isFleetActive(now) {
  return S.fleetActive === true && fleetShipTotal() > 0 && fleetDefenseReady(now);
}


// Наносит накопленный урон флота кораблям вторжения. HP врагов хранится
// в сейве вместе с кораблями; для старых сейвов HP проставляется лениво.
function applyFleetAutoDefense(inv, dt) {
  let destroyed = 0;
  const dps = fleetDps();
  if (!(dps > 0) || !Array.isArray(inv.ships)) return 0;
  if (!Array.isArray(inv.fleetShots)) inv.fleetShots = [];
  const maxHp = Math.max(1, Number(FLEET_CFG.invaderShipHp) || 100);
  inv.fleetDmgAcc = (Number(inv.fleetDmgAcc) || 0) + dps * dt;
  for (let s = 0; s < inv.ships.length && inv.fleetDmgAcc > 0; s++) {
    const ship = inv.ships[s];
    if (ship.destroyed) continue;
    if (!(Number(ship.hp) > 0)) ship.hp = maxHp;
    const hit = Math.min(inv.fleetDmgAcc, ship.hp);
    ship.hp -= hit;
    inv.fleetDmgAcc -= hit;
    if (ship.hp <= 0) { ship.hp = 0; ship.destroyed = true; destroyed++; }
  }

  // Визуализация: ~12 трассеров в секунду, пока флот ведёт огонь.
  inv.fleetShotAcc = (Number(inv.fleetShotAcc) || 0) + dt;
  if (inv.fleetShotAcc >= 0.08) {
    inv.fleetShotAcc -= 0.08;
    const aliveIdx = [];
    for (let s = 0; s < inv.ships.length; s++) if (!inv.ships[s].destroyed) aliveIdx.push(s);
    if (aliveIdx.length > 0) {
      const targetIdx = aliveIdx[Math.floor(Math.random() * aliveIdx.length)];
      inv.fleetShots.push({ startAt: Date.now(), targetIdx: targetIdx });
    }
  }
  if (!inv.fleetEngaged) {
    inv.fleetEngaged = true;
    if (inv.notified && typeof toast === 'function') {
      toast('🚀 Флот в бой', 'Автоборона ур.' + activeDefenseLevel());
    }
  }
  return destroyed;
}

window.fleetShipTotal = fleetShipTotal;
window.fleetDps = fleetDps;
window.fleetDefenseLevelReq = fleetDefenseLevelReq;
window.fleetDefenseReady = fleetDefenseReady;
window.isFleetActive = isFleetActive;

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
  const shipHp = Math.max(1, Number(FLEET_CFG.invaderShipHp) || 100);
  for (let i = 0; i < count; i++) {
    ships.push({
      angle: (i / count) * Math.PI * 2 + Math.random() * 0.5,
      dist: 1.2 + Math.random() * 0.6,
      speed: 0.8 + Math.random() * 0.6,
      hp: shipHp,
      maxHp: shipHp,
      destroyed: false,
    });
  }
  return ships;
}

// ─── Запуск вторжения ───────────────────────────────────────────
function spawnInvasion() {
  const now = Date.now();
  // Премиум-щит: пока активен, вторжения не создаются вообще.
  if (S.shieldUntil && S.shieldUntil > now) return;
  const tierKey = rollInvasionTier();
  const tier = INVASION_CFG.tiers[tierKey];

  // ★ Определяем цель: если систем > 1 или мы в галактике — бьем по системе
  if (S.stage === 'galaxy' || S.systems > 1) {
    // ★ Прайм-системы неприступны: вторжение выбирает только обычные системы
    const availableSystems = [];
    if (!isPrimeSystemAt(0)) availableSystems.push(0);
    for (let i = 1; i < S.otherSystems.length; i++) {
      if (S.otherSystems[i] && !isPrimeSystemAt(i)) availableSystems.push(i);
    }
    if (availableSystems.length === 0) {
      // Все системы — Прайм: атаковать некого.
      return;
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
      fleetShots: [],
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

    if (typeof sendPushNotification === 'function') {
      sendPushNotification('⚔️ <b>Вторжение!</b> На вашу систему напали. Срочно зайдите в игру!', 'invasion');
    }

    // ★ Журнал событий ведём всегда, включая галактическую стадию:
    // иначе атака на другую систему не видна в игре.
    if (typeof addEvent === 'function') {
      addEvent('invasion_spawn', tier.label + ': атакована система «' + sysName + '»', { meta: { systemIdx: targetIdx, tierKey: tierKey } });
    }
    // Тост не дублируем, только если игрок уже смотрит на атакованную систему.
    if (!isActive) {
      toast('⚔️ Вторжение!', 'Атакована система «' + sysName + '»');
      if (typeof playSFX === 'function') playSFX('invasion');
    }
    return;
  }

  // ★ Если система всего одна — бьём СРАЗУ ПО НЕСКОЛЬКИМ планетам (tier.targets)
  // Прайм-система не может быть целью вторжения вообще.
  if (S.primeSystem) return;
  const active = S.planets.filter(function(p) { return !p.forming && !isPlanetInvaded(p) && !(p.disabledUntil > now); });
  if (active.length === 0) return;

  const wantTargets = Math.max(1, Math.min(tier.targets || 1, active.length));
  const waveId = 'w' + now.toString(36) + Math.random().toString(36).slice(2, 6);
  const victimNames = [];
  const victimSeeds = [];

  for (let t = 0; t < wantTargets; t++) {
    const idx = Math.floor(Math.random() * active.length);
    const victim = active.splice(idx, 1)[0];
    if (!victim) break;
    victimNames.push(PLANET_TYPES[victim.type].name);
    victimSeeds.push(victim.seed);

    S.invasions.push({
      id: Math.random().toString(36).slice(2),
      waveId: waveId,
      tierKey: tierKey,
      targetType: 'planet',
      systemIdx: S.activeSystemIdx,
      planetSeed: victim.seed,
      ships: makeShips(Math.min(INVASION_CFG.shipsMax, INVASION_CFG.shipsBase + 1)),
      fleetShots: [],
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
  }
  if (wantTargets === 0) return;

  if (typeof sendPushNotification === 'function') {
    sendPushNotification('⚔️ <b>Вторжение!</b> На вашу систему напали. Срочно зайдите в игру!', 'invasion');
  }
  toast('⚔️ ' + tier.label + '!', wantTargets > 1 ? ('Атаковано планет: ' + wantTargets) : (victimNames[0] + ' атакована'));
  if (typeof playSFX === 'function') playSFX('invasion');
  if (typeof addEvent === 'function') addEvent('invasion_spawn', tier.label + ': ' + victimNames.join(', '), { meta: { systemIdx: S.activeSystemIdx, planetSeed: victimSeeds[0] } });
}

// ─── Урон второго порядка: оккупация и простой планет ───────────

function applyInvasionAftermath(inv, victim) {
  // ★ Прайм-система не получает урона от вторжений
  if (inv && typeof inv.systemIdx === 'number' && typeof isPrimeSystemAt === 'function' && isPrimeSystemAt(inv.systemIdx)) return;
  const tier = INVASION_CFG.tiers[inv.tierKey] || INVASION_CFG.tiers.raid;
  const now = Date.now();

  // 1) штраф к доходу — один раз на волну
  if (!inv.waveId || S.invasionWaveApplied !== inv.waveId) {
    S.invasionWaveApplied = inv.waveId || ('solo' + now);
    const pct = tier.debuffPct || 0;
    const durH = tier.debuffHours || 0;
    if (pct > 0 && durH > 0) {
      const cur = (S.invasionDebuff && S.invasionDebuff.until > now) ? (Number(S.invasionDebuff.pct) || 0) : 0;
      S.invasionDebuff = {
        pct: Math.min(INVASION_CFG.debuffStackCap || 0.6, cur + pct),
        until: Math.max((S.invasionDebuff && S.invasionDebuff.until) || 0, now + durH * 3600 * 1000),
      };
      if (typeof toast === 'function') toast('⚠️ Оккупация', 'Доход −' + Math.round(pct * 100) + '% на ' + durH.toFixed(1) + ' ч');
    }
  }

  // 2) планеты простаивают, но НЕ удаляются
  const targetIdx = (typeof inv.systemIdx === 'number') ? inv.systemIdx : S.activeSystemIdx;
  // ★ Прайм-система неуязвима, даже если вторжение пришло по старому сейву.
  if (typeof isPrimeSystemAt === 'function' && isPrimeSystemAt(targetIdx)) return;
  const targetSys = (targetIdx !== S.activeSystemIdx && S.otherSystems) ? S.otherSystems[targetIdx] : null;
  // Урон идёт по планетам ИМЕННО той системы, которую атаковали, а не по активной.
  const targetPlanets = (targetSys && Array.isArray(targetSys.planets)) ? targetSys.planets : (S.planets || []);

  const victims = [];
  const direct = victim || targetPlanets.find(function(p) { return p.seed === inv.planetSeed; });
  if (direct) victims.push(direct);
  if (!direct && targetPlanets.length > 1) {
    const pool = targetPlanets.filter(function(p) { return !p.forming && !(p.disabledUntil > now); });
    const need = Math.min(tier.disablePlanets || 1, pool.length - 1);
    for (let i = 0; i < need; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      victims.push(pool.splice(idx, 1)[0]);
    }
  }
  const dur = (tier.disableHours || 2) * 3600 * 1000;
  for (const p of victims) {
    if (!p) continue;
    if (targetPlanets.length <= 1) break;  // последнюю планету не выключаем
    p.disabledUntil = now + dur;
  }
}

window.applyInvasionAftermath = applyInvasionAftermath;

// Живое ограбление: каждое успешное вторжение тянет ВСЕ ресурсы —
// пыль, ⚡, 🧬 и ⚙ — пропорционально theftMin и длительности грабежа.
function applyLiveRobbery(inv, tier, dt, divisor) {
  if (!(dt > 0)) return;
  const durSec = Math.max(1, (INVASION_CFG.robberyDuration || 45 * 60 * 1000) / 1000);
  const share = Math.min(1, dt / durSec);
  const minutes = (tier.theftMin || 0) / Math.max(1, divisor || 1);
  const steal = (available, ratePerSec) => {
    const total = Math.max(0, Number(ratePerSec) || 0) * minutes * 60;
    return Math.min(Math.max(0, Number(available) || 0), total * share);
  };

  const d = steal(S.dust, dustPerSec());
  if (d > 0) { S.dust -= d; inv.stolen = (inv.stolen || 0) + d; }
  const e = steal(S.energy, energyPerSec());
  if (e > 0) { S.energy -= e; inv.drainedEnergy = (inv.drainedEnergy || 0) + e; }
  const c = steal(S.civLevel, civPerSec());
  if (c > 0) { S.civLevel -= c; inv.drainedCiv = (inv.drainedCiv || 0) + c; }
  const m = steal(S.metalAmount, metalsPerSec());
  if (m > 0) { S.metalAmount -= m; inv.stolenMetals = (inv.stolenMetals || 0) + m; }
}

// ─── Тик вторжений ──────────────────────────────────────────────
function tickInvasions(dt) {
  if (!S.invasions) S.invasions = [];
  const now = Date.now();

  // Флот активен только пока держится Автоборона ур.5: истекла/снизилась —
  // отводим корабли, чтобы игрок не получал «бесплатную» защиту.
  if (S.fleetActive && !isFleetActive(now)) {
    S.fleetActive = false;
    const reason = fleetShipTotal() <= 0
      ? 'Верфь пуста'
      : 'Нужна активная Автоборона ур.' + fleetDefenseLevelReq();
    if (typeof toast === 'function') toast('🚀 Флот отведён', reason);
    if (typeof sendPushNotification === 'function') {
      sendPushNotification('🚀 <b>Действие флота закончилось.</b> Причина: ' + reason + '.', 'fleet');
    }
  }

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
      // ★ Сначала проверяем шанс отбития (уровни + флот, кап 80%, щит 100%).
      const repel = (typeof invasionRepelChance === 'function') ? invasionRepelChance(now) : 0;
      if (Math.random() < repel) {
        const repelPct = Math.round(repel * 100);
        if (repel < 1 && typeof toast === 'function') {
          toast('🛡 Вторжение отбито', 'Шанс отбития ' + repelPct + '%');
        }
        // ★ Показываем вклад Автобороны, чтобы бонус уровня был виден.
        const defLvl = (typeof activeDefenseLevel === 'function') ? activeDefenseLevel(now) : (S.nightDefenseLevel || 0);
        const defPct = Math.round(defLvl * (Number(INVASION_CFG.repelDefensePerLevel) || 0.10) * 100);
        if (typeof addEvent === 'function') addEvent('invasion_repelled', 'Атака отбита: Автоборона ур.' + defLvl + ' (+' + defPct + '% к отбитию), итого ' + repelPct + '%', { meta: { systemIdx: S.activeSystemIdx, defenseLevel: defLvl } });
      } else if (Math.random() < INVASION_CFG.chance) {
        spawnInvasion();
      }
    }
  }

  // ★ АВТОВОССТАНОВЛЕНИЕ ПРАЙМ-СИСТЕМЫ
  if (S.primeSystem && S.planets.length < 8 && !hasActiveInvasions()) {
    if (!S.primeLastHealedAt) S.primeLastHealedAt = now;
    if (now - S.primeLastHealedAt > 30 * 60 * 1000) { // 30 минут
      S.primeLastHealedAt = now;
      S.planets = [];
      for (let i = 0; i < 8; i++) {
        const orbitR = getOrbitR(i);
        const allowed = getAllowedTypesAtOrbit('G', i); // Для Прайма всегда G
        if (allowed.length > 0) {
          const type = allowed[0];
          S.planets.push({
            type: type, angle: Math.random() * Math.PI * 2, speed: 0.2 / Math.pow(orbitR / 90, 1.5),
            baseOrbitR: orbitR, orbitR: orbitR, driftPhase: Math.random() * Math.PI * 2,
            rotation: Math.random() * Math.PI * 2, seed: Math.random() * 1e6,
            forming: false, formUntil: 0, mass: planetMass(type), diameter: planetDiameter(type),
            moons: [], precession: 0, trueAnomaly: 0,
          });
        }
      }
      if (typeof toast === 'function') toast('🌟 Прайм-система восстановлена', 'Идеальное состояние');
    }
  } else if (S.planets.length >= 8) {
    S.primeLastHealedAt = now;
  }

  for (let i = S.invasions.length - 1; i >= 0; i--) {
    const inv = S.invasions[i];
    const tier = INVASION_CFG.tiers[inv.tierKey] || INVASION_CFG.tiers.raid;

    // ★ Прайм-системы нельзя ограбить/уничтожить вторжением.
    const invSysIdx = (typeof inv.systemIdx === 'number') ? inv.systemIdx : -1;
    if (invSysIdx >= 0 && typeof isPrimeSystemAt === 'function' && isPrimeSystemAt(invSysIdx)) {
      if (inv.notified) toast('🛡️ Прайм-система неприступна', 'Вторжение отступило');
      S.invasions.splice(i, 1);
      continue;
    }
    // ★ Автооборона: её ведёт только активированный флот.
    // Никакого автоматического сбития без кораблей больше нет.
    if (isFleetActive(now) && inv.ships && (typeof fleetEngaged !== 'function' || fleetEngaged(inv))) {
      const destroyedByFleet = applyFleetAutoDefense(inv, dt);
      let fleetAlive = 0;
      for (let s = 0; s < inv.ships.length; s++) if (!inv.ships[s].destroyed) fleetAlive++;
      if (fleetAlive === 0) {
        if (destroyedByFleet > 0 && inv.notified) toast('✓ Отбито', 'Флот уничтожил вражескую эскадру');
        if (!S.stats) S.stats = {};
        S.stats.invasionsDefeated = (S.stats.invasionsDefeated || 0) + 1;
        S.invasions.splice(i, 1);
        continue;
      }
    }
    // ─── Очистка устаревших трассеров флота ───
    if (Array.isArray(inv.fleetShots) && inv.fleetShots.length > 0) {
      const shotLife = Math.max(1, Number(FLEET_CFG.shotLifetimeMs) || 350);
      inv.fleetShots = inv.fleetShots.filter(function (sh) { return now - sh.startAt < shotLife; });
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

      if (now < inv.robberyEndsAt) {
        applyLiveRobbery(inv, tier, dt, tier.targets);
      }

      const robbingDone = now >= inv.robberyEndsAt || (S.dust <= 0 && S.energy <= 0 && S.civLevel <= 0 && S.metalAmount <= 0);
      
      // ★ ФИКС: Разрушение только если живы корабли
      if (robbingDone && aliveShips > 0) {
        const hpDrain = inv.maxHp / (INVASION_CFG.destructionDuration / 1000);
        inv.hp -= hpDrain * dt;
        if (inv.hp <= 0 || now >= inv.destructionEndsAt) {
          applyInvasionAftermath(inv);
          if (inv.notified) toast('⚠️ Система повреждена', 'Доход снижен, часть планет простаивает');
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

    if (now < inv.robberyEndsAt) {
      applyLiveRobbery(inv, tier, dt, 1);
    }

    const robbingDone = now >= inv.robberyEndsAt || (S.dust <= 0 && S.energy <= 0 && S.civLevel <= 0 && S.metalAmount <= 0);
    if (robbingDone && aliveShips > 0) {
      if (inv.hp <= 0 || now >= inv.destructionEndsAt) {
        applyInvasionAftermath(inv, victim);
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
  // ★ удаление планет отключено: вторжение только повреждает (disabledUntil)
  if (!victim) return;
  victim.disabledUntil = Date.now() + (INVASION_CFG.planetDisabledHours || 2) * 3600 * 1000;
  toast('⚠️ Планета повреждена', PLANET_TYPES[victim.type].name);
  if (typeof addEvent === 'function') addEvent('invasion_destroy', PLANET_TYPES[victim.type].name + ' повреждена', { meta: { systemIdx: S.activeSystemIdx, planetSeed: victim.seed } });
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
// Трассеры флота: короткие зелёные лазеры по вражеским кораблям.
function drawFleetShots(ctx, inv, z, shipScreenPos) {
  if (!inv.fleetShots || inv.fleetShots.length === 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = '#7ee0a8';
  ctx.lineWidth = Math.max(1, 2 * z);
  for (let i = 0; i < inv.fleetShots.length; i++) {
    const shot = inv.fleetShots[i];
    const ship = inv.ships && inv.ships[shot.targetIdx];
    if (!ship || ship.destroyed) continue;
    const p = shipScreenPos(ship);
    if (!p) continue;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y + 30 * z);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  ctx.restore();
}

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

      drawFleetShots(ctx, inv, z, function (ship) {
        return {
          x: cxPos + Math.cos(ship.angle) * shipOrbitWorld * ship.dist,
          y: cyPos + Math.sin(ship.angle) * shipOrbitWorld * ship.dist * 0.5,
        };
      });

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

      drawFleetShots(ctx, inv, z, function (ship) {
        return worldToScreen(
          pos.x + Math.cos(ship.angle) * shipOrbitWorld * ship.dist,
          pos.y + Math.sin(ship.angle) * shipOrbitWorld * ship.dist * 0.5
        );
      });

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