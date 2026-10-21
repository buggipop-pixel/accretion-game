// ═══════════════════════════════════════════════════════════════
//  ECONOMY.JS — формулы дохода, стоимости, офлайн-прогресс
// ═══════════════════════════════════════════════════════════════

// ─── Множители ──────────────────────────────────────────────────
function starMult() { return S.starType ? STAR_TYPES[S.starType].rateMult : 1; }
function systemTypeMult() { return S.systemType ? SYSTEM_TYPES[S.systemType].rateMult : 1; }
function systemMult() { return 1 + Math.max(0, S.systems - 1) * 0.5; }
function gammaMult() { return Date.now() < S.gammaDebuff ? 0.4 : 1; }
function galaxyMult() { return S.galaxyMultiplier || 1; }

// ─── Доход от планет ────────────────────────────────────────────
function planetRate() {
  let sum = 0;
  for (let i = 0; i < S.planets.length; i++) {
    const p = S.planets[i];
    if (p.forming) continue;

    // Вторжения блокируют доход планеты
    if (typeof isPlanetInvaded === 'function' && isPlanetInvaded(p)) continue;

    let base = PLANET_TYPES[p.type].rate;

    if (typeof safronovAccretion === 'function') {
      base *= (1 + safronovAccretion(p) * 10);
    }
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
    if (pt.bonus && pt.bonus.type === 'metals') {
      sum += pt.bonus.metalsPerSec || 0;
    }
  }
  return sum;
}

// ─── Доход в секунду ────────────────────────────────────────────
function dustPerSec() {
  const st = STAGES[S.stage];
  if (!st) return 0;
  if (S.stage === 'cloud' || S.stage === 'condense' || S.stage === 'protostar') return 0;
  // Вторжения НЕ уменьшают доход — они грабят накопленную пыль.
  return (st.baseRate + planetRate()) * starMult() *
         systemTypeMult() * systemMult() * gammaMult() * galaxyMult() *
         (1 + (S.systemIncomeBonus || 0));
}

function clickGain() {
  const st = STAGES[S.stage];
  if (!st) return 0;
  return st.clickRate * starMult() * systemTypeMult() *
         systemMult() * gammaMult() * galaxyMult();
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
  // Масштабируем от уровня хранилища энергии, чтобы пассив
  // не отставал от растущего капа на высоких уровнях.
  const levels = S.storageLevels || { energy: 1 };
  return (S.civLevel - 3) * c * 0.5 * Math.pow(1.5, (levels.energy || 1) - 1);
}

// ─── Стоимости ──────────────────────────────────────────────────
// ФИКСИРОВАННАЯ цена: 80K × 2^n.
// Не зависит от dustPerSec — качество системы влияет через доход.
function planetCost(n) {
  const base = CFG.planetBaseCost   || 80000;
  const grw  = CFG.planetCostGrowth || 2.0;
  return Math.floor(base * Math.pow(grw, n || 0));
}

// ФИКСИРОВАННАЯ цена: base × growth^n.
// Не привязана к dustPerSec — поэтому топовые системы
// копят быстрее, плохие дольше. Даёт разброс времени.
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
  if (S.stage === 'protostar') return null;   // управляется таймером heat
  if (S.stage === 'firstPlanet') {
    // ★ Динамическая цель = цена первой планеты
    return planetCost(0);
  }
  if (S.stage === 'system') {
    if (S.planets.length >= 8) return null;
    return planetCost(S.planets.length);
  }
  if (S.stage === 'galaxy') {
    // В фазе «Галактика» цель — цена системы в магазине (js/shop.js)
    if (typeof systemShopCosts === 'function') return systemShopCosts().dust;
    return systemCost(S.systems - 1);
  }
  return null;
}

// ─── Офлайн-прогресс ────────────────────────────────────────────
// Считает пыль, энергию и цивилизацию по одинаковым правилам.
// Возвращает объект со всеми начисленными ресурсами или null,
// если офлайн был меньше 30 сек или всё в капе.
function applyOfflineProgress() {
  const now = Date.now();
  const elapsedSec = Math.max(0, (now - S.lastTick) / 1000);
  if (elapsedSec < 30) return null;

  const levels = S.storageLevels || { dust: 1, energy: 1, civ: 1 };
  const out = {
    seconds: Math.floor(elapsedSec),
    dustEarned: 0,
    energyEarned: 0,
    civEarned: 0,
  };

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
  const cRate = (typeof civPerSec === 'function') ? civPerSec() : 0;
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

  if (out.dustEarned > 0 || out.energyEarned > 0 || out.civEarned > 0) {
    return out;
  }
  return null;
}
// Клик даёт только пыль (в фазах, где clickRate > 0).
// Цивилизация растёт пассивно через civPerSec — клики её не ускоряют.
function handleCanvasClick(x, y) {
  const dustCap = getResourceCap('dust');
  if (S.dust < dustCap) {
    const gain = clickGain();
    const actualGain = Math.min(dustCap - S.dust, gain);
    S.dust += actualGain;
    S.dustTotal += actualGain;
  }
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
    if (pt.bonus && pt.bonus.type === 'civ') {
      mult *= (pt.bonus.civMult || 1);
    }
  }
  return CFG.civGrowthPerPlanet * c * mult;
}
window.civPerSec = civPerSec;

function tickCiv(dt) {
  const perSec = civPerSec();
  if (perSec === 0) return;
  const civCap = getResourceCap('civ');
  if (S.civLevel < civCap) {
    S.civLevel = Math.min(civCap, S.civLevel + perSec * dt);
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
// ─── Кап хранилища ресурса ──────────────────────────────────────
// Кап = максимум из (плоский кап уровня) и (N часов текущего дохода).
// Плоский кап вытягивает ранние фазы, когда доход ещё почти нулевой;
// «часы дохода» не дают капу задушить игрока на поздних фазах.
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
window.getResourceCap = getResourceCap;
