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
  // Вторжения НЕ уменьшают доход — они грабят накопленную пыль.
  return (st.baseRate + planetRate()) * starMult() *
         systemTypeMult() * systemMult() * gammaMult() * galaxyMult();
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
  return (S.civLevel - 3) * c * 0.5;
}

// ─── Стоимости ──────────────────────────────────────────────────
function planetCost(n) { return Math.floor(500000 * Math.pow(2.2, n)); }
function systemCost(n) { return Math.floor(5e9 * Math.pow(2.5, n)); }

// ─── Цель текущей фазы ──────────────────────────────────────────
function currentGoal() {
  const st = STAGES[S.stage];
  if (!st) return null;
  if (S.stage === 'cloud' || S.stage === 'condense' ||
      S.stage === 'protostar' || S.stage === 'firstPlanet') return st.goal;
  if (S.stage === 'system') {
    if (S.planets.length >= 8) return null;
    return planetCost(S.planets.length);
  }
  if (S.stage === 'galaxy') return systemCost(S.systems - 1);
  return null;
}

// ─── Офлайн-прогресс ────────────────────────────────────────────
function applyOfflineProgress() {
  const now = Date.now();
  const elapsedSec = Math.max(0, (now - S.lastTick) / 1000);
  if (elapsedSec < 60) return;
  const levels = S.storageLevels || { dust: 1, energy: 1, civ: 1 };
  const capSec = STORAGE_CFG.getDustCapHours(levels.dust) * 3600;
  const cappedSec = Math.min(elapsedSec, capSec);
  const rate = dustPerSec();
  const earned = Math.floor(rate * cappedSec * CFG.offlineEfficiency);
  if (earned > 0) {
    const dustCap = getResourceCap('dust');
    const available = dustCap - S.dust;
    if (available > 0) {
      const actualEarned = Math.min(earned, available);
      S.dust += actualEarned;
      S.dustTotal += actualEarned;
      return { seconds: Math.floor(elapsedSec), earned: actualEarned };
    }
  }
  return null;
}

// ─── Обработка клика ────────────────────────────────────────────
function handleCanvasClick(x, y) {
  const dustCap = getResourceCap('dust');
  if (S.dust < dustCap) {
    const gain = clickGain();
    const actualGain = Math.min(dustCap - S.dust, gain);
    S.dust += actualGain;
    S.dustTotal += actualGain;
  }
  if (civPlanetCount() > 0) {
    const civCap = getResourceCap('civ');
    if (S.civLevel < civCap) {
      const boost = CFG.civClickBoost * SYSTEM_TYPES[S.systemType || 'single'].civClickMult;
      S.civLevel = Math.min(civCap, S.civLevel + boost);
    }
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
function getResourceCap(res) {
  const levels = S.storageLevels || { dust: 1, energy: 1, civ: 1 };
  if (res === 'dust') return 50000 * Math.pow(10, levels.dust - 1) * STORAGE_CFG.getDustCapHours(levels.dust);
  if (res === 'energy') return 100000 * Math.pow(2, levels.energy - 1);
  if (res === 'civ') return 100 * Math.pow(1.5, levels.civ - 1);
  return 1000;
}
window.getResourceCap = getResourceCap;
window.getResourceCap = getResourceCap;
