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

// ─── Доход от планет ────────────────────────────────────────────
function planetRate() {
  let sum = 0;
  for (let i = 0; i < S.planets.length; i++) {
    const p = S.planets[i];
    if (p.forming) continue;
    if (typeof isPlanetInvaded === 'function' && isPlanetInvaded(p)) continue;

    let base = PLANET_TYPES[p.type].rate;
    if (typeof safronovAccretion === 'function') base *= (1 + safronovAccretion(p) * 10);
    if (p.mass > 1) base *= (1 + Math.log(p.mass) * 0.35);
    if (typeof tempAt === 'function') {
      const rAe = (p.orbitR || 100) / PHYS.refRadius;
      base *= 0.8 + Math.min(1, tempAt(rAe) / 400) * 0.4;
    }
    sum += base;
  }
  return sum;
}

// ─── Металлы ────────────────────────────────────────────────────
function metalsPerSec() {
  let sum = 0;
  for (let i = 0; i < S.planets.length; i++) {
    const p = S.planets[i];
    if (p.forming) continue;
    if (typeof isPlanetInvaded === 'function' && isPlanetInvaded(p)) continue;
    const pt = PLANET_TYPES[p.type];
    if (pt.bonus && pt.bonus.type === 'metals') sum += pt.bonus.metalsPerSec || 0;
  }
  return sum;
}

// ─── Доход в секунду ────────────────────────────────────────────
function dustPerSec() {
  const st = STAGES[S.stage];
  if (!st || S.stage === 'cloud' || S.stage === 'condense' || S.stage === 'protostar') return 0;
  
  let primeMult = 1;
  if (S.primeSystem && S.primeSystem.bonus && S.primeSystem.bonus.dustMult) primeMult += S.primeSystem.bonus.dustMult;
  const boostMult = (S.boosters && S.boosters.incomeUntil > Date.now()) ? PREMIUM_CFG.booster.incomeMult : 1;

  return (st.baseRate + planetRate()) * starMult() * systemTypeMult() * systemMult() * gammaMult() * galaxyMult() * (1 + (S.systemIncomeBonus || 0)) * primeMult * boostMult;
}

function clickGain() {
  const st = STAGES[S.stage];
  if (!st) return 0;
  return st.clickRate * starMult() * systemTypeMult() *
         systemMult() * gammaMult() * galaxyMult() *
         (typeof achIncomeMult === 'function' ? achIncomeMult() : 1);
}

// ─── Цивилизация ────────────────────────────────────────────────
function civPlanetCount() {
  if (!S.starType || !STAR_TYPES[S.starType].civ) return 0;
  let n = 0;
  for (let i = 0; i < S.planets.length; i++) {
    if (PLANET_TYPES[S.planets[i].type].civ && !S.planets[i].forming) n++;
  }
  return n;
}

function energyPerSec() {
  if (S.civLevel < 4) return 0;
  const c = civPlanetCount();
  if (c === 0) return 0;
  const levels = S.storageLevels || { energy: 1 };
  return (S.civLevel - 3) * c * 0.5 * Math.pow(1.5, (levels.energy || 1) - 1);
}

// ─── Стоимости ──────────────────────────────────────────────────
function planetCost(n) {
  const base = CFG.planetBaseCost   || 80000;
  const grw  = CFG.planetCostGrowth || 2.0;
  return Math.floor(base * Math.pow(grw, n || 0));
}

function systemCost(n) {
  const base   = CFG.systemBaseCost || 1e8;
  const growth = CFG.systemGrowth   || 3.0;
  const min    = CFG.systemCostMin  || 1e6;
  const cost   = base * Math.pow(growth, n || 0);
  return Math.max(min, Math.floor(cost));
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

// ─── Кап хранилища ресурса ──────────────────────────────────────
function getResourceCap(res) {
  const levels = S.storageLevels || { dust: 1, energy: 1, civ: 1 };

  if (res === 'dust') {
    const hours = STORAGE_CFG.getDustCapHours(levels.dust);
    const flat = STORAGE_CFG.getDustFlatCap(levels.dust);
    const rateCap = dustPerSec() * 3600 * hours;
    return Math.floor(Math.max(flat, rateCap));
  }
  if (res === 'energy') {
    const hours = STORAGE_CFG.getDustCapHours(levels.energy);
    const flat = STORAGE_CFG.getEnergyFlatCap(levels.energy);
    const rateCap = energyPerSec() * 3600 * hours;
    return Math.floor(Math.max(flat, rateCap));
  }
  if (res === 'civ') {
    const mult = STORAGE_CFG.getCivCapMult(levels.civ);
    const flat = STORAGE_CFG.getCivFlatCap(levels.civ);
    const rateCap = civPerSec() * 3600 * mult;
    return Math.floor(Math.max(flat, rateCap));
  }
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
}

// ─── Рост цивилизации ───────────────────────────────────────────
function civPerSec() {
  const c = civPlanetCount();
  if (c === 0) return 0;
  const sysType = S.systemType || 'single';
  let mult = SYSTEM_TYPES[sysType].civPassiveMult;
  for (let i = 0; i < S.planets.length; i++) {
    const p = S.planets[i];
    if (p.forming) continue;
    const pt = PLANET_TYPES[p.type];
    if (pt.bonus && pt.bonus.type === 'civ') mult *= (pt.bonus.civMult || 1);
  }
  return CFG.civGrowthPerPlanet * c * mult;
}

function tickCiv(dt) {
  const perSec = civPerSec();
  if (perSec === 0) return;
  const civCap = getResourceCap('civ');
  if (S.civLevel < civCap) S.civLevel = Math.min(civCap, S.civLevel + perSec * dt);
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

  // ─── 0. Завершение миссий ───
  processOfflineMissions(out);

  // ─── 1. Пыль ───
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

  // ─── 2. Энергия ───
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

  // ─── 3. Цивилизация ───
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

  // ─── 4. Вторжения (только если офлайн > 1 часа или активен ночной режим) ───
  const isNightActive = S.nightDefenseExpiresAt && S.nightDefenseExpiresAt > now;
  if ((S.stage === 'system' || S.stage === 'galaxy') && (elapsedSec >= 3600 || isNightActive)) {
    simulateOfflineInvasions(elapsedSec, out);
  }

  // ─── 5. Отключение ночного режима, если он был активен ───
  if (out.nightEnded || (S.nightDefenseExpiresAt > 0)) {
    S.nightDefenseExpiresAt = 0;
    if (S.nightConfig) {
      S.nightConfig.defenseEnabled = false;
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

// ─── Завершение миссий в офлайне ───────────────────────────────
function processOfflineMissions(out) {
  if (typeof MISS === 'undefined') return;
  const now = Date.now();

  // ☄️ Кометы
  for (let i = MISS.comets.length - 1; i >= 0; i--) {
    const c = MISS.comets[i];
    const elapsedMs = now - c.startAt;
    let complete = false;
    let reward = 0;

    if (c.isNight) {
      out.nightEnded = true;
      if (elapsedMs >= c.flightTime) {
        complete = true;
        reward = c.fail ? 0 : c.reward;
      } else if (elapsedMs > 60000) { // Если пролетела хотя бы минуту, возвращаем досрочно
        complete = true;
        const ratio = elapsedMs / c.flightTime;
        reward = c.fail ? 0 : Math.floor(c.reward * ratio);
      }
    } else {
      if (elapsedMs >= c.flightTime) {
        complete = true;
        reward = c.fail ? 0 : c.reward;
      }
    }

    if (complete) {
      if (reward > 0) {
        S.dust += reward;
        S.dustTotal += reward;
        out.cometEarned = (out.cometEarned || 0) + reward;
      }
      MISS.comets.splice(i, 1);
    }
  }

  // 🚀 Экспедиции
  for (let i = MISS.expeditions.length - 1; i >= 0; i--) {
    const e = MISS.expeditions[i];
    const elapsedMs = now - e.startAt;
    let complete = false;
    let reward = 0;

    if (e.isNight) {
      out.nightEnded = true;
      if (elapsedMs >= e.flightTime) {
        complete = true;
        reward = e.fail ? 0 : e.reward;
      } else if (elapsedMs > 60000) {
        complete = true;
        const ratio = elapsedMs / e.flightTime;
        reward = e.fail ? 0 : Math.floor(e.reward * ratio);
      }
    } else {
      if (elapsedMs >= e.flightTime) {
        complete = true;
        reward = e.fail ? 0 : e.reward;
      }
    }

    if (complete) {
      if (reward > 0) {
        S.dust += reward;
        S.dustTotal += reward;
        out.expEarned = (out.expEarned || 0) + reward;
        if (e.hasColony && typeof offerColony === 'function') {
          setTimeout(offerColony, 1000);
        }
      }
      MISS.expeditions.splice(i, 1);
    }
  }
}

// ─── Симуляция ночных вторжений ────────────────────────────────
function simulateOfflineInvasions(elapsedSec, out) {
  const cfg = INVASION_CFG;
  const nightMode = (S.nightConfig && S.nightConfig.mode) || 'balanced';
  const nightCfg = NIGHT_CFG;
  const hours = elapsedSec / 3600;

  if (S.shieldUntil && S.shieldUntil > Date.now() - elapsedSec * 1000) {
    out.shieldProtected = true;
    return;
  }

  let attacks = Math.min(cfg.offlineAttackMax, Math.floor(hours / 2));
  const extraSystems = Math.floor((S.systems - 1) / cfg.offlineAttackPerSystems);
  attacks = Math.min(cfg.offlineAttackMax + extraSystems, attacks + extraSystems);
  if (attacks <= 0) return;

  const totalObjects = (S.stage === 'galaxy') ? S.systems : S.planets.length;
  const maxLosses = Math.floor(totalObjects * (nightCfg.lossCaps[nightMode] || 0.25));

  const defenseBonus = (S.nightConfig.defenseEnabled) ? calcDefenseBonus() : 0;
  const expPenalty = calcExpeditionPenalty();

  let losses = 0, defended = 0, lost = 0, totalDrainE = 0, totalDrainC = 0;

  for (let i = 0; i < attacks; i++) {
    const tierKey = rollInvasionTier();
    const tier = cfg.tiers[tierKey];

    const capE = Math.max(1, getResourceCap('energy'));
    const capC = Math.max(1, getResourceCap('civ'));
    const thresh = cfg.resourceThresholdShare;
    const eF = Math.min(1, Math.max(0, S.energy - totalDrainE) / (thresh * capE));
    const cF = Math.min(1, Math.max(0, S.civLevel - totalDrainC) / (thresh * capC));
    const resFactor = Math.min(eF, cF);

    let chance = tier.baseChance * resFactor + defenseBonus - expPenalty;
    chance = Math.max(0, Math.min(tier.chanceCap, chance));

    const drainDurationSec = Math.min((INVASION_CFG.robberyDuration / 1000), elapsedSec / (attacks + 1));
    const drain = calcDrainStatic(tierKey, drainDurationSec, totalDrainE, totalDrainC);
    totalDrainE += drain.energy;
    totalDrainC += drain.civ;

    if (Math.random() < chance) {
      defended++;
    } else {
      const dmg = (S.stage === 'galaxy')
        ? NIGHT_CFG.damagePerHit[nightMode].systems
        : NIGHT_CFG.damagePerHit[nightMode].planets;
      const actualDmg = Math.min(dmg, maxLosses - losses);
      if (actualDmg > 0) {
        losses += actualDmg;
        lost += actualDmg;
      }
    }
  }

  S.energy = Math.max(0, S.energy - totalDrainE);
  S.civLevel = Math.max(0, S.civLevel - totalDrainC);
  out.invasionDrainE = Math.floor(totalDrainE);
  out.invasionDrainC = Math.floor(totalDrainC);

  if (lost > 0) {
    if (S.stage === 'galaxy') applySystemLosses(lost);
    else applyPlanetLosses(lost);
  }

  out.invasionAttacks = attacks;
  out.invasionDefended = defended;
  out.invasionLost = lost;
}

function calcDrainStatic(tierKey, dtSec, alreadyE, alreadyC) {
  const tier = INVASION_CFG.tiers[tierKey];
  if (!tier) return { energy: 0, civ: 0 };
  const civPlanets = civPlanetCount();
  if (civPlanets === 0) return { energy: 0, civ: 0 };

  const capE = Math.max(1, getResourceCap('energy'));
  const capC = Math.max(1, getResourceCap('civ'));
  const planetMult = 1 + 0.3 * civPlanets;

  let reduction = 0;
  if (S.nightConfig && S.nightConfig.defenseEnabled) {
    reduction = Math.min(0.25, (INVASION_CFG.defenseDrainReduction || 0.05) * (S.defenseLevel || 0));
  }

  const hours = dtSec / 3600;
  const remainingE = Math.max(0, S.energy - alreadyE);
  const remainingC = Math.max(0, S.civLevel - alreadyC);

  const eDrain = Math.min(remainingE, capE * tier.energyDrain * planetMult * hours * (1 - reduction));
  const cDrain = Math.min(remainingC, capC * tier.civDrain * planetMult * hours * (1 - reduction));

  return { energy: eDrain, civ: cDrain };
}

function applyPlanetLosses(count) {
  if (S.planets.length === 0) return;
  const toRemove = Math.min(count, S.planets.length);
  for (let i = 0; i < toRemove; i++) {
    const idx = Math.floor(Math.random() * S.planets.length);
    S.planets.splice(idx, 1);
  }
  if (typeof addEvent === 'function') {
    addEvent('invasion_destroy', 'Ночные вторжения уничтожили ' + toRemove + ' планет');
  }
}

function applySystemLosses(count) {
  if (S.systems <= 1) {
    applyPlanetLosses(count * 3);
    return;
  }
  let removed = 0;
  for (let i = S.otherSystems.length - 1; i >= 1 && removed < count; i--) {
    if (S.otherSystems[i]) {
      S.otherSystems[i] = null;
      S.systems--;
      removed++;
    }
  }
  if (S.activeSystemIdx > 0 && !S.otherSystems[S.activeSystemIdx]) {
    if (typeof switchToSystem === 'function') switchToSystem(0);
  }
  if (typeof addEvent === 'function') {
    addEvent('invasion_destroy', 'Ночные вторжения уничтожили ' + removed + ' систем');
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