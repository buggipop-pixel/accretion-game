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
  return 0; // флоту больше не нужна Автоборона определённого уровня
}

// ★ Флот всегда готов, если в Верфи есть хотя бы один корабль.
//   Раньше требовалась активная Автоборона ур.5 — игрок покупал флот,
//   но он «спал». Теперь купленные корабли работают всегда.
function fleetDefenseReady(now) {
  return fleetShipTotal() > 0;
}

function isFleetActive(now) {
  return fleetShipTotal() > 0;
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
      toast('🚀 Флот в бой', 'Автооборона ур.' + activeDefenseLevel());
    }
    if (typeof notifyFleetEvent === 'function') {
      notifyFleetEvent('Флот вступил в бой', [
        '🚀 Кораблей в строю: ' + fleetShipTotal(),
        '🎯 Цель: ' + (inv.planetName || inv.systemName || 'система'),
        '⚔️ Сложность: ' + (Number(inv.difficulty) || 1) + '/3',
      ], 'fleet_engage:' + inv.id);
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
function makeShips(count, opts) {
  opts = opts || {};
  const cfg = INVASION_CFG || {};
  const types = cfg.shipTypes || {};
  const tierKey = opts.tierKey || 'raid';
  const tier = (cfg.tiers && cfg.tiers[tierKey]) || {};
  const difficulty = Math.max(1, Math.min(3, Number(opts.difficulty || tier.difficulty) || 1));
  const pool = (Array.isArray(tier.shipTypes) && tier.shipTypes.length)
    ? tier.shipTypes
    : Object.keys(types);
  const pMin = Number(tier.powerMin) || 0.6;
  const pMax = Number(tier.powerMax) || 1.2;
  const fleetPower = (Number(opts.power) > 0)
    ? Number(opts.power)
    : (pMin + Math.random() * Math.max(0, pMax - pMin));
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const ships = [];
  for (let i = 0; i < n; i++) {
    const typeKey = pool[Math.floor(Math.random() * pool.length)] || 'fighter';
    const type = types[typeKey] || {};
    // У каждого корабля своя случайная мощность ±25% от силы эскадры.
    const shipPower = fleetPower * (0.75 + Math.random() * 0.5);
    const diffScale = 1 + (difficulty - 1) * 0.25;
    const maxHp = Math.max(1, Math.round((Number(type.hp) || 45) * shipPower * diffScale));
    const bounty = type.bounty || {};
    ships.push({
      type: typeKey,
      name: type.name || typeKey,
      color: type.color || '#ff5e5e',
      size: Number(type.size) || 1,
      power: Math.round(shipPower * 100) / 100,
      damage: Math.max(0, (Number(type.damage) || 2) * shipPower),
      bounty: {
        metals: Math.round((Number(bounty.metals) || 0) * shipPower * diffScale),
        dust: Math.round((Number(bounty.dust) || 0) * shipPower * diffScale),
        energy: Math.round((Number(bounty.energy) || 0) * shipPower * diffScale),
        civ: (Number(bounty.civ) || 0) * shipPower * diffScale,
      },
      angle: (n > 0 ? (i / n) * Math.PI * 2 : 0) + Math.random() * 0.5,
      dist: 1.2 + Math.random() * 0.6,
      speed: (Number(type.speed) || 1) * (0.8 + Math.random() * 0.4),
      hp: maxHp,
      maxHp: maxHp,
      destroyed: false,
    });
  }
  return ships;
}

// Случайное число кораблей/сила эскадры по сложности.
function rollInvasionShips(tierKey) {
  const tier = (INVASION_CFG.tiers && INVASION_CFG.tiers[tierKey]) || {};
  const min = Math.max(1, Math.floor(Number(tier.shipsMin) || Number(INVASION_CFG.shipsBase) || 1));
  const max = Math.max(min, Math.floor(Number(tier.shipsMax) || Number(INVASION_CFG.shipsMax) || min));
  const count = min + Math.floor(Math.random() * (max - min + 1));
  return { count: count, ships: makeShips(count, { tierKey: tierKey }) };
}

// Урон ручного клика по кораблю вторжения.
function invasionClickDamage() {
  const cfg = (INVASION_CFG && INVASION_CFG.manual) || {};
  const defLvl = (typeof activeDefenseLevel === 'function') ? activeDefenseLevel() : 0;
  const dps = (typeof fleetDps === 'function') ? fleetDps() : 0;
  const raw = (Number(cfg.clickDamageBase) || 22)
    + defLvl * (Number(cfg.clickDamagePerDefenseLevel) || 14)
    + dps * (Number(cfg.clickDamagePerFleetDps) || 0.35);
  return Math.max(1, Math.min(Number(cfg.clickDamageMax) || 260, Math.round(raw)));
}
window.invasionClickDamage = invasionClickDamage;

// ─── Запуск вторжения ───────────────────────────────────────────
function spawnInvasion() {
  const now = Date.now();
  // Премиум-щит: пока активен, вторжения не создаются вообще.
  if ((typeof isShieldActive === 'function') ? isShieldActive(now) : (S.shieldUntil && S.shieldUntil > now)) return;
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

    const rolled = rollInvasionShips(tierKey);
    const inv = {
      id: Math.random().toString(36).slice(2),
      tierKey: tierKey,
      difficulty: Math.max(1, Math.min(3, Number(tier.difficulty) || 1)),
      targetType: 'system',
      systemIdx: targetIdx,
      systemName: sysName,
      ships: rolled.ships,
      shipsTotal: rolled.count,
      fleetShots: [],
      spawnedAt: now,
      robberyEndsAt: now + INVASION_CFG.robberyDuration,
      destructionEndsAt: now + INVASION_CFG.totalDuration,
      hp: 200,
      maxHp: 200,
      stolen: 0,
      drainedEnergy: 0,
      drainedCiv: 0,
      stolenMetals: 0,
      defenseBroken: false,
      notified: true,
    };
    S.invasions.push(inv);

    // ★ Подробное уведомление в Telegram: сложность, состав, прочность.
    if (typeof notifyInvasionStart === 'function') notifyInvasionStart(inv);
    // ★ Журнал событий ведём всегда, включая галактическую стадию:
    // иначе атака на другую систему не видна в игре.
    if (typeof addEvent === 'function') {
      addEvent('invasion_spawn', tier.label + ': атакована система «' + sysName + '»', { meta: { systemIdx: targetIdx, tierKey: tierKey, tierLabel: tier.label, difficulty: inv.difficulty, ships: rolled.count, systemName: sysName, robberyMinutes: Math.round(INVASION_CFG.robberyDuration / 60000), destructionMinutes: Math.round(INVASION_CFG.destructionDuration / 60000), source: 'live' } });
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

    const rolledP = rollInvasionShips(tierKey);
    const pinv = {
      id: Math.random().toString(36).slice(2),
      waveId: waveId,
      tierKey: tierKey,
      difficulty: Math.max(1, Math.min(3, Number(tier.difficulty) || 1)),
      targetType: 'planet',
      systemIdx: S.activeSystemIdx,
      planetSeed: victim.seed,
      planetName: PLANET_TYPES[victim.type].name,
      ships: rolledP.ships,
      shipsTotal: rolledP.count,
      fleetShots: [],
      spawnedAt: now,
      robberyEndsAt: now + INVASION_CFG.robberyDuration,
      destructionEndsAt: now + INVASION_CFG.totalDuration,
      hp: INVASION_CFG.planetMaxHP,
      maxHp: INVASION_CFG.planetMaxHP,
      stolen: 0,
      drainedEnergy: 0,
      drainedCiv: 0,
      stolenMetals: 0,
      defenseBroken: false,
      notified: true,
    };
    S.invasions.push(pinv);
    // ★ Подробное уведомление по каждой атакованной планете.
    if (typeof notifyInvasionStart === 'function') notifyInvasionStart(pinv);
  }
  if (wantTargets === 0) return;

  toast('⚔️ ' + tier.label + '!', wantTargets > 1 ? ('Атаковано планет: ' + wantTargets) : (victimNames[0] + ' атакована'));
  if (typeof playSFX === 'function') playSFX('invasion');
  if (typeof addEvent === 'function') addEvent('invasion_spawn', tier.label + ': ' + victimNames.join(', '), { meta: { systemIdx: S.activeSystemIdx, planetSeed: victimSeeds[0], tierKey: tierKey, tierLabel: tier.label, difficulty: Math.max(1, Math.min(3, Number(tier.difficulty) || 1)), planetNames: victimNames.join(', '), source: 'live' } });
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
      inv.debuffPct = Math.max(Number(inv.debuffPct) || 0, pct);
      inv.debuffHours = Math.max(Number(inv.debuffHours) || 0, durH);
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
  let disabledCount = 0;
  for (const p of victims) {
    if (!p) continue;
    if (targetPlanets.length <= 1) break;  // последнюю планету не выключаем
    p.disabledUntil = now + dur; disabledCount++;
  }
  inv.disabledPlanets = Math.max(Number(inv.disabledPlanets) || 0, disabledCount);
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

// ─── Награда за ручное уничтожение корабля ────────────────────────
// Игрок, который сам сбивает вражеские корабли, получает ресурсы —
// это и есть «хороший буст» за активную игру вместо ожидания флота.
function grantManualKillReward(inv, ship) {
  const b = (ship && ship.bounty) || {};
  const manual = (INVASION_CFG && INVASION_CFG.manual) || {};
  const mult = Number(manual.rewardMult) || 1;
  const diffMult = (manual.difficultyBonus && manual.difficultyBonus[inv.difficulty]) || 1;
  const k = mult * diffMult;
  const metals = Math.round((Number(b.metals) || 0) * k);
  const dust = Math.round((Number(b.dust) || 0) * k);
  const energy = Math.round((Number(b.energy) || 0) * k);
  const civ = (Number(b.civ) || 0) * k;
  if (metals) S.metalAmount = (Number(S.metalAmount) || 0) + metals;
  if (dust) { S.dust = (Number(S.dust) || 0) + dust; S.dustTotal = (Number(S.dustTotal) || 0) + dust; }
  if (energy) S.energy = (Number(S.energy) || 0) + energy;
  if (civ) S.civLevel = (Number(S.civLevel) || 0) + civ;
  inv.bountyMetals = (Number(inv.bountyMetals) || 0) + metals;
  inv.bountyDust = (Number(inv.bountyDust) || 0) + dust;
  inv.bountyEnergy = (Number(inv.bountyEnergy) || 0) + energy;
  inv.bountyCiv = (Number(inv.bountyCiv) || 0) + civ;
  inv.shipsKilledByPlayer = (Number(inv.shipsKilledByPlayer) || 0) + 1;
  return { metals: metals, dust: dust, energy: energy, civ: civ };
}
window.grantManualKillReward = grantManualKillReward;

// ─── Вражеский огонь по флоту ──────────────────────────────────────
// Пока эскадра жива, она повреждает корабли игрока. Потерянные корабли
// списываются из S.fleet и сопровождаются уведомлением.
function applyEnemyFireToFleet(inv, dt) {
  const cfg = (INVASION_CFG && INVASION_CFG.enemyFire) || {};
  if (!(dt > 0) || !Array.isArray(inv.ships) || !S.fleet) return 0;
  let alive = 0, dps = 0;
  for (let i = 0; i < inv.ships.length; i++) {
    const ship = inv.ships[i];
    if (!ship || ship.destroyed) continue;
    alive++;
    dps += Math.max(0, Number(ship.damage) || 0);
  }
  if (alive === 0) return 0;
  const dmgPerSec = Math.min(Number(cfg.capDamagePerSec) || 6, dps * (Number(cfg.perShipDamagePerSec) || 0.9));
  inv.enemyDmgAcc = (Number(inv.enemyDmgAcc) || 0) + dmgPerSec * dt;
  let lost = 0;
  const order = ['interceptor', 'cruiser', 'dreadnought'];
  while (inv.enemyDmgAcc > 0) {
    let key = null;
    for (let i = 0; i < order.length; i++) {
      if ((Number(S.fleet[order[i]]) || 0) > 0) { key = order[i]; break; }
    }
    if (!key) { inv.enemyDmgAcc = 0; break; }
    const hp = Math.max(1, Number(FLEET_CFG.ships[key].hp) || 20);
    if (inv.enemyDmgAcc >= hp) {
      inv.enemyDmgAcc -= hp;
      S.fleet[key] = Math.max(0, (Number(S.fleet[key]) || 0) - 1);
      lost++;
    } else break;
  }
  if (lost > 0) {
    if (!S.stats) S.stats = {};
    S.stats.fleetLost = (Number(S.stats.fleetLost) || 0) + lost;
    if (typeof toast === 'function') toast('💥 Флот несёт потери', 'Уничтожено кораблей: ' + lost);
    if (typeof notifyFleetEvent === 'function') {
      notifyFleetEvent('Флот несёт потери', [
        '💥 Уничтожено кораблей: ' + lost,
        '🎯 Вторжение: ' + (inv.planetName || inv.systemName || 'система'),
        '⚔️ Сложность: ' + (Number(inv.difficulty) || 1) + '/3',
      ], 'fleet_loss:' + inv.id + ':' + (S.stats.fleetLost || 0));
    }
    if (fleetShipTotal() <= 0) {
      S.fleetActive = false;
      if (typeof notifyFleetEvent === 'function') notifyFleetEvent('Флот уничтожен', ['Все корабли потеряны в бою.'], 'fleet_dead:' + inv.id);
    }
  }
  return lost;
}
window.applyEnemyFireToFleet = applyEnemyFireToFleet;

// ─── Тик вторжений ──────────────────────────────────────────────
function tickInvasions(dt) {
  if (!S.invasions) S.invasions = [];
  const now = Date.now();

  // ★ Флот работает всегда, пока в Верфи есть корабли. Никаких «отводов»
  //   по истечении Автобороны больше нет (см. isFleetActive).
  if (S.fleetActive !== true && fleetShipTotal() > 0) S.fleetActive = true;

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
        const fleetPct = (typeof fleetRepelChance === 'function') ? Math.round(fleetRepelChance(now) * 100) : 0;
        if (typeof addEvent === 'function') addEvent('invasion_repelled', 'Атака отбита: Автоборона ур.' + defLvl + ' (+' + defPct + '% к отбитию), итого ' + repelPct + '%', { meta: { systemIdx: S.activeSystemIdx, defenseLevel: defLvl, defensePct: defPct, fleetPct: fleetPct, repelPercent: repelPct, systemName: S.systemName || 'Родная' } });
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
    // ★ Автооборона: флот доступен всегда, пока есть корабли.
    if (isFleetActive(now) && inv.ships && (typeof fleetEngaged !== 'function' || fleetEngaged(inv))) {
      const destroyedByFleet = applyFleetAutoDefense(inv, dt);
      let fleetAlive = 0;
      for (let s = 0; s < inv.ships.length; s++) if (!inv.ships[s].destroyed) fleetAlive++;
      if (fleetAlive === 0) {
        if (destroyedByFleet > 0 && inv.notified) toast('✓ Отбито', 'Флот уничтожил вражескую эскадру');
        if (!S.stats) S.stats = {};
        S.stats.invasionsDefeated = (S.stats.invasionsDefeated || 0) + 1;
        if (typeof notifyInvasionEnd === 'function') notifyInvasionEnd(inv, 'defeated');
        S.invasions.splice(i, 1);
        continue;
      }
      // ★ Враг отвечает огнём по кораблям игрока.
      applyEnemyFireToFleet(inv, dt);
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
        if (typeof notifyInvasionEnd === 'function') notifyInvasionEnd(inv, 'defeated');
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
          inv.systemsDamaged = Math.max(1, Number(inv.systemsDamaged) || 0);
          if (inv.notified) toast('⚠️ Система повреждена', 'Доход снижен, часть планет простаивает');
          if (typeof notifyInvasionEnd === 'function') notifyInvasionEnd(inv, 'breached');
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
      if (typeof notifyInvasionEnd === 'function') notifyInvasionEnd(inv, 'defeated');
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
        if (typeof notifyInvasionEnd === 'function') notifyInvasionEnd(inv, 'breached');
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
  if (typeof addEvent === 'function') addEvent('invasion_destroy', PLANET_TYPES[victim.type].name + ' повреждена', { meta: { systemIdx: S.activeSystemIdx, planetSeed: victim.seed, planetName: PLANET_TYPES[victim.type].name, planetType: victim.type, source: 'live' } });
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
          const hitDmg = invasionClickDamage();
          ship.hp = Math.max(0, (Number(ship.hp) || 0) - hitDmg);
          if (ship.hp <= 0) {
            ship.destroyed = true;
            S.explosions.push({ x: wx, y: wy, type: 'destroy', startAt: Date.now(), endAt: Date.now() + 500, size: 18 });
            const reward = grantManualKillReward(inv, ship);
            if (typeof toast === 'function') toast('🏆 Корабль уничтожен', '+' + Math.round(reward.metals) + '⚙ +' + Math.round(reward.dust) + '✦');
          } else {
            S.explosions.push({ x: wx, y: wy, type: 'hit', startAt: Date.now(), endAt: Date.now() + 250, size: 10 });
          }
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
            const hitDmg = invasionClickDamage();
            ship.hp = Math.max(0, (Number(ship.hp) || 0) - hitDmg);
            if (ship.hp <= 0) {
              ship.destroyed = true;
              S.explosions.push({ x: sp.x, y: sp.y, type: 'destroy', startAt: Date.now(), endAt: Date.now() + 500, size: 18 });
              const reward = grantManualKillReward(inv, ship);
              if (typeof toast === 'function') toast('🏆 Корабль уничтожен', '+' + Math.round(reward.metals) + '⚙ +' + Math.round(reward.dust) + '✦');
            } else {
              S.explosions.push({ x: sp.x, y: sp.y, type: 'hit', startAt: Date.now(), endAt: Date.now() + 250, size: 10 });
            }
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

// Корабль вторжения: форма/цвет/размер зависят от типа, поверх — HP-бар.
function invShipRgba(hex, a) {
  const h = String(hex || '#ff5e5e').replace('#', '');
  let r = 255, g = 94, b = 94;
  if (h.length === 3) {
    r = parseInt(h[0] + h[0], 16); g = parseInt(h[1] + h[1], 16); b = parseInt(h[2] + h[2], 16);
  } else if (h.length >= 6) {
    const n = parseInt(h.slice(0, 6), 16);
    if (isFinite(n)) { r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255; }
  }
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}

// Корабль вторжения: у каждого типа свой силуэт, свечение, сопла и HP-бар.
function drawInvaderShip(ctx, ship, z) {
  const s = Math.max(0.6, Number(ship.size) || 1) * z;
  const type = ship.type || 'fighter';
  const base = ship.color || '#ff5e5e';
  const t = (typeof performance !== 'undefined' && performance.now) ? performance.now() / 1000 : Date.now() / 1000;
  const pulse = 0.72 + 0.28 * Math.sin(t * 6 + (Number(ship.angle) || 0));

  ctx.save();

  // Двигательный след
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const plumeLen = (type === 'dread' ? 16 : type === 'frigate' ? 13 : type === 'corvette' ? 11 : 9) * s;
  const trail = ctx.createLinearGradient(-plumeLen, 0, -2 * s, 0);
  trail.addColorStop(0, invShipRgba(base, 0));
  trail.addColorStop(0.55, invShipRgba(base, 0.30 * pulse));
  trail.addColorStop(1, invShipRgba(base, 0.8 * pulse));
  ctx.fillStyle = trail;
  ctx.beginPath();
  ctx.moveTo(-2 * s, -2.6 * s);
  ctx.lineTo(-plumeLen, 0);
  ctx.lineTo(-2 * s, 2.6 * s);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Ореол
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 13 * s);
  halo.addColorStop(0, invShipRgba(base, 0.40 * pulse));
  halo.addColorStop(0.55, invShipRgba(base, 0.12));
  halo.addColorStop(1, invShipRgba(base, 0));
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(0, 0, 13 * s, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // Крылья / стабилизаторы (рисуем под корпусом)
  ctx.fillStyle = invShipRgba(base, 0.55);
  ctx.strokeStyle = invShipRgba(base, 0.85);
  ctx.lineWidth = Math.max(0.7, 0.7 * z);
  for (let dir = -1; dir <= 1; dir += 2) {
    ctx.beginPath();
    if (type === 'dread') {
      ctx.moveTo(2 * s, dir * 5.5 * s);
      ctx.lineTo(-4 * s, dir * 9.5 * s);
      ctx.lineTo(-8 * s, dir * 8.0 * s);
      ctx.lineTo(-6 * s, dir * 5.0 * s);
    } else if (type === 'frigate') {
      ctx.moveTo(2 * s, dir * 4.5 * s);
      ctx.lineTo(-2 * s, dir * 7.6 * s);
      ctx.lineTo(-6.5 * s, dir * 6.2 * s);
      ctx.lineTo(-4.5 * s, dir * 4.0 * s);
    } else if (type === 'corvette') {
      ctx.moveTo(1.8 * s, dir * 4.0 * s);
      ctx.lineTo(-1.5 * s, dir * 6.6 * s);
      ctx.lineTo(-5 * s, dir * 5.3 * s);
      ctx.lineTo(-3.5 * s, dir * 3.6 * s);
    } else {
      ctx.moveTo(1.8 * s, dir * 3.2 * s);
      ctx.lineTo(-1.0 * s, dir * 5.0 * s);
      ctx.lineTo(-4 * s, dir * 4.0 * s);
      ctx.lineTo(-2.8 * s, dir * 2.8 * s);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Корпус: силуэт зависит от типа
  ctx.beginPath();
  if (type === 'dread') {
    ctx.moveTo(10 * s, 0);
    ctx.lineTo(6 * s, -3.4 * s); ctx.lineTo(4.2 * s, -6.4 * s); ctx.lineTo(-7.4 * s, -6.2 * s);
    ctx.lineTo(-9 * s, -3 * s); ctx.lineTo(-9.4 * s, 0);
    ctx.lineTo(-9 * s, 3 * s); ctx.lineTo(-7.4 * s, 6.2 * s); ctx.lineTo(4.2 * s, 6.4 * s); ctx.lineTo(6 * s, 3.4 * s);
  } else if (type === 'frigate') {
    ctx.moveTo(9 * s, 0);
    ctx.lineTo(5 * s, -2.8 * s); ctx.lineTo(0, -5.2 * s); ctx.lineTo(-7.2 * s, -4.4 * s);
    ctx.lineTo(-8.4 * s, 0); ctx.lineTo(-7.2 * s, 4.4 * s); ctx.lineTo(0, 5.2 * s); ctx.lineTo(5 * s, 2.8 * s);
  } else if (type === 'corvette') {
    ctx.moveTo(8 * s, 0);
    ctx.lineTo(3.4 * s, -4.2 * s); ctx.lineTo(-5 * s, -4.8 * s); ctx.lineTo(-6.4 * s, 0);
    ctx.lineTo(-5 * s, 4.8 * s); ctx.lineTo(3.4 * s, 4.2 * s);
  } else {
    ctx.moveTo(8.4 * s, 0);
    ctx.lineTo(2.6 * s, -3.6 * s); ctx.lineTo(-4.6 * s, -2.6 * s); ctx.lineTo(-5.6 * s, 0);
    ctx.lineTo(-4.6 * s, 2.6 * s); ctx.lineTo(2.6 * s, 3.6 * s);
  }
  ctx.closePath();

  const hull = ctx.createLinearGradient(-8 * s, -6 * s, 9 * s, 5 * s);
  hull.addColorStop(0, invShipRgba(base, 0.55));
  hull.addColorStop(0.45, invShipRgba(base, 0.98));
  hull.addColorStop(1, '#ffffff');
  ctx.fillStyle = hull;
  ctx.fill();
  ctx.lineWidth = Math.max(0.8, 0.95 * z);
  ctx.strokeStyle = invShipRgba(base, 0.95);
  ctx.stroke();

  // Осевая линия корпуса
  ctx.strokeStyle = 'rgba(18, 8, 32, 0.55)';
  ctx.lineWidth = Math.max(0.6, 0.7 * z);
  ctx.beginPath(); ctx.moveTo(6 * s, 0); ctx.lineTo(-5 * s, 0); ctx.stroke();

  // Кабина и панель
  ctx.fillStyle = 'rgba(12, 8, 30, 0.55)';
  ctx.beginPath(); ctx.ellipse(-0.5 * s, 0, 1.9 * s, (type === 'dread' ? 1.7 : 1.05) * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath(); ctx.ellipse(2.4 * s, 0, 1.5 * s, 1.0 * s, 0, 0, Math.PI * 2); ctx.fill();

  // Сопла с пульсирующим свечением
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const nozzles = type === 'dread' ? [-3.2, 0, 3.2] : (type === 'frigate' ? [-2.2, 2.2] : [-1.5, 1.5]);
  const nozzleX = type === 'dread' ? -7.6 * s : -5.6 * s;
  for (let n = 0; n < nozzles.length; n++) {
    const ny = nozzles[n] * s;
    const nr = (type === 'dread' ? 1.5 : 1.0) * s * pulse;
    const ng = ctx.createRadialGradient(nozzleX, ny, 0, nozzleX, ny, nr * 2.2);
    ng.addColorStop(0, 'rgba(255,255,255,0.95)');
    ng.addColorStop(0.4, invShipRgba(base, 0.85));
    ng.addColorStop(1, invShipRgba(base, 0));
    ctx.fillStyle = ng;
    ctx.beginPath(); ctx.arc(nozzleX, ny, nr * 2.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // HP-бар
  if (ship.maxHp > 0 && ship.hp < ship.maxHp) {
    const w = 18 * s, h = Math.max(1.5, 2 * z);
    const ratio = Math.max(0, Math.min(1, ship.hp / ship.maxHp));
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(-w / 2, -11 * s, w, h);
    ctx.fillStyle = ratio > 0.5 ? '#7ee0a8' : (ratio > 0.25 ? '#ffb347' : '#ff4040');
    ctx.fillRect(-w / 2, -11 * s, w * ratio, h);
  }
  ctx.restore();
}
window.drawInvaderShip = drawInvaderShip;

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
        drawInvaderShip(ctx, ship, z);
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
        drawInvaderShip(ctx, ship, z);
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