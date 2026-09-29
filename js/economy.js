// ═══════════════════════════════════════════════════════════════
//  ECONOMY.JS — формулы дохода, стоимости, офлайн-прогресс
// ═══════════════════════════════════════════════════════════════

// ─── Множители ──────────────────────────────────────────────────
function starMult() { return S.starType ? STAR_TYPES[S.starType].rateMult : 1; }
function systemTypeMult() { return S.systemType ? SYSTEM_TYPES[S.systemType].rateMult : 1; }
function systemMult() { return 1 + Math.max(0, S.systems - 1) * 0.5; }
function gammaMult() { return Date.now() < S.gammaDebuff ? 0.4 : 1; }

// ─── Доход от планет ────────────────────────────────────────────
// Бонус Сафронова: чем массивнее планета, тем быстрее растёт.
// После слияния планета получает усиленный бонус — компенсация
// за потерянный слот.
function planetRate() {
  let sum = 0;
  for (let i = 0; i < S.planets.length; i++) {
    const p = S.planets[i];
    if (p.forming) continue;

    let base = PLANET_TYPES[p.type].rate;

    // Сафронов: множитель от массы (не от diameter)
    // mass=1 → ×1.0, mass=2 → ×1.4, mass=4 → ×1.8, mass=8 → ×2.2
    if (typeof safronovAccretion === 'function') {
      const acc = safronovAccretion(p);
      base *= (1 + acc * 10);
    }

    // ★ Бонус слияния: каждая единица массы сверх 1 даёт +15% к rate
    // Это компенсирует потерю слота: 1 планета массы 4 приносит
    // как 1.45 обычных планет.
    if (p.mass > 1) {
      base *= (1 + Math.log(p.mass) * 0.35);
    }

    // Температурный множитель
    if (typeof tempAt === 'function') {
      const rAe = (p.orbitR || 100) / PHYS.refRadius;
      base *= 0.8 + Math.min(1, tempAt(rAe) / 400) * 0.4;
    }

    sum += base;
  }
  return sum;
}

// ─── Общий доход ────────────────────────────────────────────────
function dustPerSec() {
  const st = STAGES[S.stage];
  if (!st) return 0;
  return (st.baseRate + planetRate()) * starMult() *
         systemTypeMult() * systemMult() * gammaMult();
}

function clickGain() {
  const st = STAGES[S.stage];
  if (!st) return 0;
  return st.clickRate * starMult() * systemTypeMult() *
         systemMult() * gammaMult();
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
  const capSec = CFG.offlineCapHours * 3600;
  const cappedSec = Math.min(elapsedSec, capSec);
  const rate = dustPerSec();
  const earned = Math.floor(rate * cappedSec * CFG.offlineEfficiency);
  if (earned > 0) {
    S.dust += earned; S.dustTotal += earned;
    return { seconds: Math.floor(elapsedSec), earned: earned };
  }
  return null;
}

// ─── Обработка клика ────────────────────────────────────────────
function handleCanvasClick(x, y) {
  const gain = clickGain();
  S.dust += gain; S.dustTotal += gain;
  if (civPlanetCount() > 0) {
    S.civLevel += CFG.civClickBoost *
      SYSTEM_TYPES[S.systemType || 'single'].civClickMult;
  }
}

// ─── Рост цивилизации ───────────────────────────────────────────
function tickCiv(dt) {
  const c = civPlanetCount();
  if (c === 0) return;
  const sysType = S.systemType || 'single';
  S.civLevel += CFG.civGrowthPerPlanet * c *
                SYSTEM_TYPES[sysType].civPassiveMult * dt;
  if (S.starType) {
    const max = STAR_TYPES[S.starType].maxCiv || 10;
    if (S.civLevel > max) S.civLevel = max;
  }
}

window.starMult = starMult;
window.dustPerSec = dustPerSec;
window.clickGain = clickGain;
window.planetRate = planetRate;
window.civPlanetCount = civPlanetCount;
window.energyPerSec = energyPerSec;
window.planetCost = planetCost;
window.systemCost = systemCost;
window.currentGoal = currentGoal;
window.applyOfflineProgress = applyOfflineProgress;
window.handleCanvasClick = handleCanvasClick;
window.tickCiv = tickCiv;
