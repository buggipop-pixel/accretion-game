// ═══════════════════════════════════════════════════════════════
//  ECONOMY.JS — формулы дохода, стоимости, офлайн-прогресс
// ═══════════════════════════════════════════════════════════════

// ─── Множители ──────────────────────────────────────────────────
function starMult() { return S.starType ? STAR_TYPES[S.starType].rateMult : 1; }
function systemTypeMult() { return S.systemType ? SYSTEM_TYPES[S.systemType].rateMult : 1; }
function systemMult() { 
  return 1 + Math.max(0, S.systems - 1) * (CFG.systemIncomeMultPerSystem || 1.0); 
}
function gammaMult() { return Date.now() < S.gammaDebuff ? 0.4 : 1; }
function galaxyMult() { return S.galaxyMultiplier || 1; }

// ─── Доход от планет (Защита от NaN) ────────────────────────────
function planetRate() {
  let sum = 0;
  for (let i = 0; i < S.planets.length; i++) {
    const p = S.planets[i];
    if (!p || p.forming || !isFinite(p.baseOrbitR)) continue; 
    if (typeof isPlanetInvaded === 'function' && isPlanetInvaded(p)) continue;
    if (p.disabledUntil && p.disabledUntil > Date.now()) continue;   // ★ повреждена вторжением

    let base = PLANET_TYPES[p.type] ? PLANET_TYPES[p.type].rate : 0;
    if (!isFinite(base)) base = 0;

    if (typeof safronovAccretion === 'function') base *= (1 + safronovAccretion(p) * 10);
    if (p.mass > 1 && isFinite(p.mass)) base *= (1 + Math.log(p.mass) * 0.35);

    if (typeof tempAt === 'function') {
      const rAe = (p.orbitR || 100) / PHYS.refRadius;
      base *= 0.8 + Math.min(1, tempAt(rAe) / 400) * 0.4;
    }

    if (isFinite(base)) sum += base;
  }
  return isFinite(sum) ? sum : 0;
}

// ─── Штраф к доходу после вторжения («оккупация») ───────────────
function invasionDebuffMult() {
  if (!S.invasionDebuff) return 1;
  const d = S.invasionDebuff;
  if (!d.until || Date.now() >= d.until) return 1;
  const pct = Math.max(0, Math.min(INVASION_CFG.debuffStackCap || 0.6, Number(d.pct) || 0));
  return 1 - pct;
}
window.invasionDebuffMult = invasionDebuffMult;

// ─── Металлы (доход в секунду от лава-планет) ───────────────────
function metalsPerSec() {
  let sum = 0;
  // Проверяем, есть ли вообще лава-планеты (для базовой добычи)
  let hasLava = false;
  for (let i = 0; i < S.planets.length; i++) {
    const p = S.planets[i];
    if (!p || p.forming) continue;
    if (typeof isPlanetInvaded === 'function' && isPlanetInvaded(p)) continue;
    if (p.disabledUntil && p.disabledUntil > Date.now()) continue;
    const pt = PLANET_TYPES[p.type];
    if (pt && pt.bonus && pt.bonus.type === 'metals') {
      hasLava = true;
      sum += Number(pt.bonus.metalsPerSec) || 0;
    }
  }

  // ★ Если есть хотя бы одна Лава-планета, Цив дает пассивный бонус ко всем планетам
  if (hasLava && S.civLevel > 100) {
    // Каждые 1000 Цив дают +10% к добыче (очень скромно)
    let civBonus = 1 + Math.floor(S.civLevel / 1000) * 0.1;
    sum *= civBonus;
  }
  return sum;
}

// ─── Доход в секунду (Абсолютная защита от NaN) ───
function dustPerSec() {
  const st = STAGES[S.stage];
  if (!st) return 0;
  if (S.stage === 'cloud' || S.stage === 'condense' || S.stage === 'protostar') return 0;
  
  let primeMult = 1;
  if (S.primeSystem && S.primeSystem.bonus) {
    if (S.primeSystem.bonus.dustMult) primeMult += Number(S.primeSystem.bonus.dustMult) || 0;
    if (S.primeSystem.bonus.allMult) primeMult += Number(S.primeSystem.bonus.allMult) || 0;
  }
  const boostMult = (S.boosters && S.boosters.incomeUntil > Date.now()) ? (PREMIUM_CFG.booster.incomeMult || 1) : 1;

  const base = Number(st.baseRate) || 0;
  const pRate = Number(planetRate()) || 0;
  const sMult = Number(starMult()) || 1;
  const stMult = Number(systemTypeMult()) || 1;
  const sysMult = Number(systemMult()) || 1;
  const gMult = Number(gammaMult()) || 1;
  const galMult = Number(galaxyMult()) || 1;
  const sysInc = Number(1 + (S.systemIncomeBonus || 0)) || 1;
  const techMult = Number(1 + (S.techLevels?.astro || 0) * 0.15) || 1;
  
  let achMult = 1;
  if (typeof achIncomeMult === 'function') achMult = Number(achIncomeMult()) || 1;

  let finalRate = (base + pRate) * sMult * stMult * sysMult * gMult * galMult * sysInc * primeMult * boostMult * techMult * achMult;
  finalRate *= invasionDebuffMult();   // ★ штраф после вторжения (−до 60%)
  if (S.activeEvent && typeof EVENT_CFG !== 'undefined' && Array.isArray(EVENT_CFG.types)) {
    const evt = EVENT_CFG.types.find(t => t.id === S.activeEvent.id);
    if (evt && evt.globalIncomeMult) finalRate *= evt.globalIncomeMult;
  }
  return (isFinite(finalRate) && !isNaN(finalRate)) ? Math.max(0, finalRate) : 0;
}

function clickGain() {
  const st = STAGES[S.stage];
  if (!st) return 0;
  let finalRate = Number(st.clickRate || 0) * starMult() * systemTypeMult() * systemMult() * gammaMult() * galaxyMult() * (typeof achIncomeMult === 'function' ? achIncomeMult() : 1) * invasionDebuffMult();
  return isFinite(finalRate) ? finalRate : 0;
}

// ─── Кап металлов: нельзя копить «в стол» ───────────────────────
function metalsCap() {
  const cfg = (typeof METALS_CFG !== 'undefined') ? METALS_CFG : {};
  const lvl = Math.max(1, Math.min(7, Number((S.storageLevels || {})[cfg.capStorage || 'energy']) || 1));
  return Math.floor((cfg.capBase || 750) * Math.pow(cfg.capGrowth || 2, lvl - 1));
}
window.metalsCap = metalsCap;

// ─── Цивилизация: подсчет обитаемых планет ──────────────────────
// ─── Цивилизация: подсчет обитаемых планет ──────────────────────
function civPlanetCount() {
  let n = 0;
  for (let i = 0; i < S.planets.length; i++) {
    // ★ Убрана проверка на STAR_TYPES.civ, чтобы планеты на любых звездах давали жизнь
    if (PLANET_TYPES[S.planets[i].type].civ && !S.planets[i].forming) n++;
  }
  return n;
}
window.civPlanetCount = civPlanetCount;

// ─── Рост цивилизации ───────────────────────────────────────────
function civPerSec() {
  const c = civPlanetCount();
  if (c === 0) {
    // ★ Фоллбек: если планет нет, даем минимальный рост для восстановления
    return 0.005 * (1 + (S.techLevels?.cyber || 0) * 0.20);
  }
  const sysType = S.systemType || 'single';
  let mult = SYSTEM_TYPES[sysType].civPassiveMult;
  for (let i = 0; i < S.planets.length; i++) {
    const p = S.planets[i];
    if (p.forming) continue;
    if (p.disabledUntil && p.disabledUntil > Date.now()) continue;
    const pt = PLANET_TYPES[p.type];
    if (pt.bonus && pt.bonus.type === 'civ') mult *= (pt.bonus.civMult || 1);
  }
  let finalRate = CFG.civGrowthPerPlanet * c * mult * (1 + (S.techLevels?.cyber || 0) * 0.20);
  if (S.activeEvent && typeof EVENT_CFG !== 'undefined' && Array.isArray(EVENT_CFG.types)) {
    const evt = EVENT_CFG.types.find(t => t.id === S.activeEvent.id);
    if (evt && evt.globalIncomeMult) finalRate *= evt.globalIncomeMult;
  }
  return isFinite(finalRate) ? finalRate : 0;
}

// ─── Доход энергии ───
function energyPerSec() {
  if (S.civLevel < 4) {
    // ★ Фоллбек: если цив < 4, но планеты есть, даем минимальный приток энергии
    return S.planets.length > 0 ? 0.1 : 0;
  }
  const c = civPlanetCount();
  if (c === 0) return 0;
  const levels = S.storageLevels || { energy: 1 };
  
  let primeMult = 1;
  if (S.primeSystem && S.primeSystem.bonus) {
    if (S.primeSystem.bonus.energyMult) primeMult += Number(S.primeSystem.bonus.energyMult) || 0;
    if (S.primeSystem.bonus.allMult) primeMult += Number(S.primeSystem.bonus.allMult) || 0;
  }

  const base = Number(S.civLevel) || 0;
  const techMult = Number(1 + (S.techLevels?.quantum || 0) * 0.20) || 1;
  const lvlMult = Math.pow(1.5, (Number(levels.energy) || 1) - 1);

  let finalRate = (base - 3) * c * 0.5 * lvlMult * techMult * primeMult;
  if (S.activeEvent && typeof EVENT_CFG !== 'undefined' && Array.isArray(EVENT_CFG.types)) {
    const evt = EVENT_CFG.types.find(t => t.id === S.activeEvent.id);
    if (evt && evt.globalIncomeMult) finalRate *= evt.globalIncomeMult;
    if (evt && evt.energyMult) finalRate *= evt.energyMult;
  }
  return (isFinite(finalRate) && !isNaN(finalRate)) ? Math.max(0, finalRate) : 0;
}

// ─── Стоимости (Динамический баланс) ────────────────────────────
function planetCost(n) {
  // ★ абсолютная цена: НЕ зависит от дохода. Иначе множители (престиж, системы,
  // звезда) не ускоряют игру: цена и доход сокращаются в дроби.
  const base = CFG.planetBaseCost || 4470000;
  const exp  = CFG.planetCostExp || 2.0;
  return Math.floor(base * Math.pow((n || 0) + 1, exp));
}

function systemCost(n) {
  // ★ абсолютная цена по номеру системы: base * k^exp (k = n+1)
  const base = CFG.systemBaseCost || 90000000;
  const exp  = CFG.systemCostExp || 1.5;
  const min  = CFG.systemCostMin  || 1e6;
  const cost = base * Math.pow((n || 0) + 1, exp);
  const discount = 1 - (S.techLevels?.eng || 0) * 0.05;
  return Math.max(min, Math.floor(cost * discount));
}
// ─── Цель текущей фазы ──────────────────────────────────────────
function currentGoal() {
  const st = STAGES[S.stage];
  if (!st) return null;
  if (S.stage === 'cloud' || S.stage === 'condense') return st.goal;
  if (S.stage === 'protostar') return null;
  if (S.stage === 'firstPlanet') return planetCost(0);
  if (S.stage === 'system') {
    if (S.planets.length >= 8) return null;
    return planetCost(S.planets.length);
  }
  if (S.stage === 'galaxy') {
    if (typeof systemShopCosts === 'function') return systemShopCosts().dust;
    return systemCost(S.systems - 1);
  }
  return null;
}

// ─── Кап хранилища (Абсолютная защита от NaN) ───
function getResourceCap(res) {
  const levels = S.storageLevels || { dust: 1, energy: 1, civ: 1 };
  
  const getLevel = (key) => {
    const l = parseInt(levels[key]);
    return (isFinite(l) && l >= 1) ? Math.min(l, 7) : 1;
  };

  if (res === 'dust') {
    const lvl = getLevel('dust');
    const hours = STORAGE_CFG.getDustCapHours(lvl);
    const flat = STORAGE_CFG.getDustFlatCap(lvl);
    const rateCap = dustPerSec() * 3600 * hours;
    let cap = Math.max(flat, rateCap);
    return isFinite(cap) ? Math.floor(cap) : 50000;
  }
  if (res === 'energy') {
    const lvl = getLevel('energy');
    const hours = STORAGE_CFG.getDustCapHours(lvl);
    const flat = STORAGE_CFG.getEnergyFlatCap(lvl);
    const rateCap = energyPerSec() * 3600 * hours;
    let cap = Math.max(flat, rateCap);
    return isFinite(cap) ? Math.floor(cap) : 10000;
  }
  if (res === 'civ') {
    const lvl = getLevel('civ');
    const hours = STORAGE_CFG.getDustCapHours(lvl);
    const flat = STORAGE_CFG.getCivFlatCap(lvl);
    const rateCap = civPerSec() * 3600 * hours;
    let cap = Math.max(flat, rateCap);
    return isFinite(cap) ? Math.floor(cap) : 1000;
  }
  if (res === 'metals') return metalsCap();
  return 1000;
}

function handleCanvasClick(x, y) {
  if (typeof playSFX === 'function') playSFX('ui_click');
  const dustCap = getResourceCap('dust');
  if (S.dust < dustCap) {
    const gain = clickGain();
    const actualGain = Math.min(dustCap - S.dust, gain);
    S.dust += actualGain;
    S.dustTotal += actualGain;
  }
  if (typeof trackDaily === 'function') trackDaily('d_click', 1);
  if (!S.stats) S.stats = {};
  S.stats.clicks = (S.stats.clicks || 0) + 1;

  // ★ В режиме серверного кошелька сообщаем о клике (батчами, раз в 3 с).
  // Доход всё равно считает сервер своей формулой clickGain().
  if (typeof reportClickToServer === 'function') reportClickToServer(1);
}


function tickCiv(dt) {
  const perSec = civPerSec();
  if (perSec === 0) return;
  const civCap = getResourceCap('civ');
  if (S.civLevel < civCap) {
    S.civLevel = Math.min(civCap, S.civLevel + perSec * dt);
  }
}

// ═══════════════════════════════════════════════════════════════
//  ОФЛАЙН-ПРОГРЕСС
// ═══════════════════════════════════════════════════════════════
function applyOfflineProgress() {
  const now = Date.now();
  const elapsedSec = Math.max(0, (now - S.lastTick) / 1000);
  if (elapsedSec < 30) return null;

  const levels = S.storageLevels || { dust: 1, energy: 1, civ: 1 };
  const out = {
    seconds: Math.floor(elapsedSec),
    dustEarned: 0, energyEarned: 0, civEarned: 0,
    cometEarned: 0, expEarned: 0, nightEnded: false,
    invasionAttacks: 0, invasionDefended: 0, invasionLost: 0,
    invasionDrainE: 0, invasionDrainC: 0, shieldProtected: false,
  };

  processOfflineMissions(out);

  const dustCapSec = STORAGE_CFG.getDustCapHours(levels.dust) * 3600;
  const dustCappedSec = Math.min(elapsedSec, dustCapSec);
  const dRate = dustPerSec();
  const dEarned = Math.floor(dRate * dustCappedSec * CFG.offlineEfficiency);
  if (dEarned > 0) {
    const dustCap = getResourceCap('dust');
    const available = dustCap - S.dust;
    if (available > 0) {
      const actual = Math.min(dEarned, available);
      S.dust += actual;
      S.dustTotal += actual;
      out.dustEarned = actual;
    }
  }

  const eRate = energyPerSec();
  if (eRate > 0) {
    const energyCapSec = STORAGE_CFG.getDustCapHours(levels.energy) * 3600;
    const energyCappedSec = Math.min(elapsedSec, energyCapSec);
    const eEarned = Math.floor(eRate * energyCappedSec * CFG.offlineEfficiency);
    if (eEarned > 0) {
      const energyCap = getResourceCap('energy');
      const availableE = energyCap - S.energy;
      if (availableE > 0) {
        const actual = Math.min(eEarned, availableE);
        S.energy += actual;
        out.energyEarned = actual;
      }
    }
  }

  const cRate = civPerSec();
  if (cRate > 0) {
    const civCapSec = STORAGE_CFG.getDustCapHours(levels.civ) * 3600;
    const civCappedSec = Math.min(elapsedSec, civCapSec);
    const cEarned = cRate * civCappedSec * CFG.offlineEfficiency;
    if (cEarned > 0) {
      const civCap = getResourceCap('civ');
      const availableC = civCap - S.civLevel;
      if (availableC > 0) {
        const actual = Math.min(cEarned, availableC);
        S.civLevel += actual;
        out.civEarned = Math.floor(actual);
      }
    }
  }

  // Офлайн-атаки (только если офлайн > 1 часа или активен ночной режим)
  const isNightActive = S.nightDefenseExpiresAt && S.nightDefenseExpiresAt > now;
  if ((S.stage === 'system' || S.stage === 'galaxy') && (elapsedSec >= 3600 || isNightActive)) {
    simulateOfflineInvasions(elapsedSec, out);
  }

  // Ночные миссии завершились — сбрасываем их бюджет. Сама оборона
  // живёт свой срок (10 ч) и не обнуляется при возвращении игрока.
  if (out.nightEnded) {
    if (S.nightConfig) {
      S.nightConfig.cometHours = 0;
      S.nightConfig.expeditionPercent = 0;
    }
  }

  if (out.dustEarned > 0 || out.energyEarned > 0 || out.civEarned > 0 || 
      out.invasionAttacks > 0 || out.cometEarned > 0 || out.expEarned > 0 || out.nightEnded) {
    return out;
  }
  return null;
}

function processOfflineMissions(out) {
  if (typeof MISS === 'undefined') return;
  const now = Date.now();

  for (let i = MISS.comets.length - 1; i >= 0; i--) {
    const c = MISS.comets[i];
    const elapsedMs = now - c.startAt;
    let complete = false, reward = 0;

    if (c.isNight) {
      out.nightEnded = true;
      if (elapsedMs >= c.flightTime) {
        complete = true; reward = c.fail ? 0 : c.reward;
      } else if (elapsedMs > 60000) {
        complete = true;
        const ratio = elapsedMs / c.flightTime;
        reward = c.fail ? 0 : Math.floor(c.reward * ratio);
      }
    } else {
      if (elapsedMs >= c.flightTime) {
        complete = true; reward = c.fail ? 0 : c.reward;
      }
    }

    if (complete) {
      if (reward > 0) {
        S.dust += reward; S.dustTotal += reward;
        out.cometEarned = (out.cometEarned || 0) + reward;
      }
      MISS.comets.splice(i, 1);
    }
  }

  for (let i = MISS.expeditions.length - 1; i >= 0; i--) {
    const e = MISS.expeditions[i];
    const elapsedMs = now - e.startAt;
    let complete = false, reward = 0;

    if (e.isNight) {
      out.nightEnded = true;
      if (elapsedMs >= e.flightTime) {
        complete = true; reward = e.fail ? 0 : e.reward;
      } else if (elapsedMs > 60000) {
        complete = true;
        const ratio = elapsedMs / e.flightTime;
        reward = e.fail ? 0 : Math.floor(e.reward * ratio);
      }
    } else {
      if (elapsedMs >= e.flightTime) {
        complete = true; reward = e.fail ? 0 : e.reward;
      }
    }

    if (complete) {
      if (reward > 0) {
        S.dust += reward; S.dustTotal += reward;
        out.expEarned = (out.expEarned || 0) + reward;
        if (e.hasColony && typeof offerColony === 'function') {
          setTimeout(offerColony, 1000);
        }
      }
      MISS.expeditions.splice(i, 1);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  АВТООБОРОНА: ЭФФЕКТИВНЫЙ УРОВЕНЬ И БОНУСЫ
//  Учитывает платную активацию (24 ч) и трофейные «бесплатные уровни».
//  Выключенный тумблер автообороны обнуляет уровень.
// ═══════════════════════════════════════════════════════════════
function activeDefenseLevel(now) {
  now = now || Date.now();
  if (!S.nightConfig || S.nightConfig.defenseEnabled !== true) return 0;
  let lvl = 0;
  if ((S.nightDefenseExpiresAt || 0) > now) {
    lvl = Math.max(lvl, Math.floor(Number(S.nightDefenseLevel) || 0));
  }
  if (Array.isArray(S.activeTrophyEffects)) {
    for (let i = 0; i < S.activeTrophyEffects.length; i++) {
      const e = S.activeTrophyEffects[i];
      if (e && e.type === 'defense_level' && (e.expiresAt || 0) > now) {
        lvl = Math.max(lvl, Math.floor(Number(e.value) || 0));
      }
    }
  }
  return Math.min(5, Math.max(0, lvl));
}

// Стоимость текущего флота в металлах — «вложения» для бонуса отбития.
function fleetMetalValue() {
  let total = 0;
  if (!S.fleet) return 0;
  for (const key in FLEET_CFG.ships) {
    const cfg = FLEET_CFG.ships[key];
    total += Math.max(0, Number(S.fleet[key]) || 0) * (Number(cfg.costMetals) || 0);
  }
  return total;
}

// Вклад уровней обороны: 10% за уровень (0..50%).
function defenseRepelChance(now) {
  const lvl = activeDefenseLevel(now);
  return lvl * (Number(INVASION_CFG.repelDefensePerLevel) || 0.10);
}

// Вклад флота: +1 п.п. за каждые 500 ⚙ стоимости флота, не более +30 п.п.
// Считается только когда флот активирован (для этого нужна оборона ур.5).
function fleetRepelChance(now) {
  if (typeof isFleetActive !== 'function' || !isFleetActive(now)) return 0;
  const perPct = Number(INVASION_CFG.repelFleetMetalsPerPercent) || 500;
  const cap = Number(INVASION_CFG.repelFleetCap) || 0.30;
  return Math.min(cap, fleetMetalValue() / perPct / 100);
}

// Итоговый шанс отбить вторжение (доля 0..1).
// Уровни + флот не более 80%; премиум-щит даёт гарантированные 100%.
function invasionRepelChance(now) {
  now = now || Date.now();
  if (S.shieldUntil && S.shieldUntil > now) return 1;
  const totalCap = Number(INVASION_CFG.repelTotalCap) || 0.80;
  const base = Math.min(totalCap, defenseRepelChance(now) + fleetRepelChance(now));
  return Math.max(0, Math.min(1, base - calcExpeditionPenalty()));
}

// Штраф к обороне от ночной экспедиции (доля).
function calcExpeditionPenalty() {
  const pct = (S.nightConfig && Number(S.nightConfig.expeditionPercent)) || 0;
  const max = Number(NIGHT_CFG.expeditionDefensePenaltyMax) || 0.30;
  return (pct / 100) * max;
}

window.activeDefenseLevel = activeDefenseLevel;
window.fleetMetalValue = fleetMetalValue;
window.defenseRepelChance = defenseRepelChance;
window.fleetRepelChance = fleetRepelChance;
window.invasionRepelChance = invasionRepelChance;
window.calcExpeditionPenalty = calcExpeditionPenalty;

function simulateOfflineInvasions(elapsedSec, out) {
  const cfg = INVASION_CFG;
  const hours = elapsedSec / 3600;

  if (S.shieldUntil && S.shieldUntil > Date.now() - elapsedSec * 1000) {
    out.shieldProtected = true;
    return;
  }

  // ★ 1 атака на offlineAttackInterval, не более offlineAttackMax
  const perHours = (cfg.offlineAttackInterval || 5 * 3600 * 1000) / 3600000;
  let attacks = Math.min(cfg.offlineAttackMax || 4, Math.floor(hours / perHours));
  if (attacks <= 0) return;

  const capShare = cfg.nightLossCapShare || 0.4;
  const caps = { dust: (S.dust || 0) * capShare, energy: (S.energy || 0) * capShare, civ: (S.civLevel || 0) * capShare, metals: (S.metalAmount || 0) * capShare };
  const repel = invasionRepelChance();
  let defended = 0, lostDust = 0, lostE = 0, lostC = 0, lostM = 0, disabled = 0;

  for (let i = 0; i < attacks; i++) {
    const tierKey = rollInvasionTier();
    if (Math.random() < repel) { defended++; continue; }

    const hit = applyInvasionHit(tierKey, caps);
    lostDust += hit.dust; lostE += hit.energy; lostC += hit.civ; lostM += hit.metals; disabled += hit.disabled;
    caps.dust -= hit.dust; caps.energy -= hit.energy; caps.civ -= hit.civ; caps.metals -= hit.metals;
  }

  out.invasionAttacks = attacks;
  out.invasionDefended = defended;
  out.invasionLost = disabled;
  out.invasionDrainE = Math.floor(lostE);
  out.invasionDrainC = Math.floor(lostC);
  out.invasionLostDust = Math.floor(lostDust);
  out.invasionLostMetals = Math.floor(lostM);
  if (disabled > 0 && typeof addEvent === 'function') {
    addEvent('invasion_destroy', 'Вторжения повредили ' + disabled + ' планет(ы)');
  }
}

// ★ Наносит урон одного удачного вторжения. Возвращает фактический урон.
function applyInvasionHit(tierKey, caps) {
  const cfg = INVASION_CFG;
  const tier = cfg.tiers[tierKey] || cfg.tiers.raid;
  const out = { dust: 0, energy: 0, civ: 0, metals: 0, disabled: 0 };
  // ★ Прайм-система неприкосновенна: никакого урона от вторжений
  if (S.primeSystem || (typeof isPrimeSystemAt === 'function' && isPrimeSystemAt(S.activeSystemIdx))) return out;

  const now = Date.now();
  const minutes = tier.theftMin || 0;
  const capD = caps ? Math.max(0, caps.dust) : Infinity;
  const capEn = caps ? Math.max(0, caps.energy) : Infinity;
  const capCi = caps ? Math.max(0, caps.civ) : Infinity;
  const capMe = caps ? Math.max(0, caps.metals) : Infinity;

  // 1) кража «минут экономики» из каждого пула
  const stealD = Math.min(S.dust || 0, capD, dustPerSec() * minutes * 60);
  if (stealD > 0) { S.dust -= stealD; out.dust = stealD; }
  const eps = energyPerSec();
  if (eps > 0) {
    const stealE = Math.min(S.energy || 0, capEn, eps * minutes * 60);
    if (stealE > 0) { S.energy -= stealE; out.energy = stealE; }
  }
  const cps = civPerSec();
  if (cps > 0) {
    const stealC = Math.min(S.civLevel || 0, capCi, cps * minutes * 60);
    if (stealC > 0) { S.civLevel -= stealC; out.civ = stealC; }
  }
  const mps = metalsPerSec();
  if (mps > 0) {
    const stealM = Math.min(S.metalAmount || 0, capMe, mps * minutes * 60);
    if (stealM > 0) { S.metalAmount -= stealM; out.metals = stealM; }
  }

  // 2) «оккупация»: штраф к доходу на N часов (стек до debuffStackCap)
  const pct = tier.debuffPct || 0;
  const durH = tier.debuffHours || 0;
  if (pct > 0 && durH > 0) {
    const cur = (S.invasionDebuff && S.invasionDebuff.until > now) ? Number(S.invasionDebuff.pct) || 0 : 0;
    S.invasionDebuff = {
      pct: Math.min(cfg.debuffStackCap || 0.8, cur + pct),
      until: Math.max((S.invasionDebuff && S.invasionDebuff.until) || 0, now + durH * 3600 * 1000),
    };
  }

  // 3) повреждение планет: простой N часов, но НЕ удаление
  const alive = (S.planets || []).filter(function(p) { return p && !p.forming && !(p.disabledUntil > now); });
  const canDisable = Math.max(0, Math.min(tier.disablePlanets || 0, (S.planets || []).length - 1));
  for (let i = 0; i < canDisable && alive.length > 0; i++) {
    const idx = Math.floor(Math.random() * alive.length);
    const victim = alive.splice(idx, 1)[0];
    victim.disabledUntil = now + (tier.disableHours || 2) * 3600 * 1000;
    out.disabled++;
  }
  return out;
}
window.applyInvasionHit = applyInvasionHit;

function applySystemLosses(count) {
  // ★ Системы больше не удаляются: вторжение лишь выводит их из строя.
  let damaged = 0;
  const until = Date.now() + (INVASION_CFG.planetDisabledHours || 2) * 3600 * 1000;
  for (let i = 1; i < S.otherSystems.length && damaged < count; i++) {
    const sys = S.otherSystems[i];
    // ★ Прайм-системы не повреждаются вторжениями
    if (sys && !(sys.damagedUntil > Date.now()) && !(typeof isPrimeSystemData === 'function' && isPrimeSystemData(sys))) {
      sys.damagedUntil = until;
      damaged++;
    }
  }
  if (damaged > 0 && typeof addEvent === 'function') {
    addEvent('invasion_destroy', 'Вторжения повредили ' + damaged + ' систем(ы)');
  }
}

// ─── Экспорт ────────────────────────────────────────────────────
window.starMult = starMult;
window.systemTypeMult = systemTypeMult;
window.systemMult = systemMult;
window.gammaMult = gammaMult;
window.galaxyMult = galaxyMult;
window.planetRate = planetRate;
window.metalsPerSec = metalsPerSec;
window.dustPerSec = dustPerSec;
window.clickGain = clickGain;
window.civPlanetCount = civPlanetCount;
window.energyPerSec = energyPerSec;
window.planetCost = planetCost;
window.systemCost = systemCost;
window.currentGoal = currentGoal;
window.applyOfflineProgress = applyOfflineProgress;
window.handleCanvasClick = handleCanvasClick;
window.tickCiv = tickCiv;
window.getResourceCap = getResourceCap;