// ═══════════════════════════════════════════════════════════════
//  ECONOMY.JS — экономика: доход, стоимости, офлайн-прогресс
//  Здесь все формулы, которые считают деньги в игре
// ═══════════════════════════════════════════════════════════════

// ─── МНОЖИТЕЛИ ─────────────────────────────────────────────────

// Множитель от типа звезды
function starMult() {
  return S.starType ? STAR_TYPES[S.starType].rateMult : 1;
}

// Множитель от типа системы (одиночная/двойная/кратная)
function systemTypeMult() {
  return S.systemType ? SYSTEM_TYPES[S.systemType].rateMult : 1;
}

// Множитель от количества систем
// 1 система = ×1.0, 2 системы = ×1.5, 3 = ×2.0 и т.д.
function systemMult() {
  return 1 + Math.max(0, S.systems - 1) * 0.5;
}

// Дебафф от гамма-всплеска (временно -60%)
function gammaMult() {
  return Date.now() < S.gammaDebuff ? 0.4 : 1;
}

// ─── ДОХОД ─────────────────────────────────────────────────────

// Суммарный доход от всех планет (формирующиеся не считаются)
function planetRate() {
  let sum = 0;
  for (const p of S.planets) {
    if (p.forming) continue;
    let base = PLANET_TYPES[p.type].rate;

    // ★ Формула Сафронова: чем больше планета, тем быстрее растёт
    if (typeof safronovAccretion === 'function') {
      const accretion = safronovAccretion(p);
      base *= (1 + accretion * 10);
    }

    // ★ Ближе к звезде — горячее, дороже содержание, но и быстрее поток
    if (typeof tempAt === 'function') {
      const rAe = (p.orbitR || 100) / (window.PHYS?.refRadius || 100);
      const tempMult = 0.8 + Math.min(1, tempAt(rAe) / 400) * 0.4;
      base *= tempMult;
    }

    sum += base;
  }
  return sum;
}

// Общий доход пыли в секунду
function dustPerSec() {
  const st = STAGES[S.stage];
  if (!st) return 0;
  const base = st.baseRate + planetRate();
  return base
    * starMult()
    * systemTypeMult()
    * systemMult()
    * gammaMult();
}

// Доход за один клик по canvas
function clickGain() {
  const st = STAGES[S.stage];
  if (!st) return 0;
  return st.clickRate
    * starMult()
    * systemTypeMult()
    * systemMult()
    * gammaMult();
}

// ─── ЭНЕРГИЯ ────────────────────────────────────────────────────
// Энергия генерируется цивилизациями с уровня 4+
// (цив-планеты открываются после первого заселения)

function civPlanetCount() {
  if (!S.starType || !STAR_TYPES[S.starType].civ) return 0;
  let n = 0;
  for (const p of S.planets) {
    if (PLANET_TYPES[p.type].civ && !p.forming) n++;
  }
  return n;
}

// Сколько энергии в секунду приносит цивилизация
// Работает с уровня 4 (Индустриальная цивилизация)
function energyPerSec() {
  if (S.civLevel < 4) return 0;
  const civPlanets = civPlanetCount();
  if (civPlanets === 0) return 0;
  // Формула: (уровень − 3) × планет × 0.5
  return (S.civLevel - 3) * civPlanets * 0.5;
}

// ─── СТОИМОСТИ ──────────────────────────────────────────────────

// Стоимость планеты. Растёт экспоненциально: 500К, 1.1М, 2.4М...
function planetCost(n) {
  return Math.floor(500000 * Math.pow(2.2, n));
}

// Стоимость новой системы. Растёт быстрее: 5М, 12.5М, 31М...
function systemCost(n) {
  return Math.floor(5e9 * Math.pow(2.5, n));
}

// Максимум экспедиции — физический предел корабля
function expeditionMaxCapacity() {
  return 5000 + S.systems * 2000 + S.planets.length * 1000;
}

// Максимум кометы — зависит от ледяных гигантов
function cometMaxCapacity() {
  let ice = 0;
  for (const p of S.planets) {
    if (p.type === 'iceGiant' && !p.forming) ice++;
  }
  return 3000 + S.systems * 1500 + ice * 2000;
}

// Стоимость колонии (в цив-уровнях и пыли)
function colonyCivCost() {
  return Math.ceil(20 * Math.pow(1.8, S.systems - 1));
}
function colonyDustCost() {
  return Math.floor(2e9 * Math.pow(2.5, S.systems - 1));
}

// ─── ЦЕЛЬ ТЕКУЩЕЙ ФАЗЫ ──────────────────────────────────────────

// Возвращает число — сколько пыли нужно для перехода на следующую фазу
// null — если цель не числовая (например, «формируй планеты»)
function currentGoal() {
  const st = STAGES[S.stage];
  if (!st) return null;
  if (S.stage === 'cloud' || S.stage === 'condense' ||
      S.stage === 'protostar' || S.stage === 'firstPlanet') {
    return st.goal;
  }
  if (S.stage === 'system') {
    if (S.planets.length >= 8) return null; // система готова к расширению
    return planetCost(S.planets.length);
  }
  if (S.stage === 'galaxy') {
    return systemCost(S.systems - 1);
  }
  return null;
}

// ─── ОФЛАЙН-ДОХОД ───────────────────────────────────────────────
// Считается при загрузке игры: сколько времени игрок отсутствовал
// и сколько пыли он заработал бы за это время
//
// Правила:
//  - Кап по времени: 4 часа (можно расширить через tech tree)
//  - Эффективность: 50% от онлайн-дохода
//  - Игрок НИКОГДА не уходит в минус

function applyOfflineProgress() {
  const now = Date.now();
  const elapsedSec = Math.max(0, (now - S.lastTick) / 1000);
  if (elapsedSec < 60) return; // меньше минуты — не считаем

  // Кап по времени
  const capSec = CFG.offlineCapHours * 3600;
  const cappedSec = Math.min(elapsedSec, capSec);

  // Доход с эффективностью 50%
  const rate = dustPerSec();
  const earned = Math.floor(rate * cappedSec * CFG.offlineEfficiency);

  if (earned > 0) {
    S.dust += earned;
    S.dustTotal += earned;
    // Возвращаем информацию для тоста
    return {
      seconds: Math.floor(elapsedSec),
      capped: elapsedSec > capSec,
      earned: earned,
    };
  }
  return null;
}

// ─── СОБЫТИЯ ПРИ КЛИКЕ ──────────────────────────────────────────

// Обработка клика по canvas — добавить пыль и буст цив
function handleCanvasClick(x, y) {
  // Пыль
  const gain = clickGain();
  S.dust += gain;
  S.dustTotal += gain;

  // Цив-буст (если есть civ-планета)
  if (civPlanetCount() > 0) {
    const sysType = S.systemType || 'single';
    const clickMult = SYSTEM_TYPES[sysType].civClickMult;
    S.civLevel += CFG.civClickBoost * clickMult;
  }
}

// ─── АВТОМАТИЧЕСКИЙ РОСТ ЦИВИЛИЗАЦИИ ────────────────────────────
// Вызывается каждый кадр из main.js

function tickCiv(dt) {
  const c = civPlanetCount();
  if (c === 0) return;
  const sysType = S.systemType || 'single';
  const passiveMult = SYSTEM_TYPES[sysType].civPassiveMult;
  const base = CFG.civGrowthPerPlanet * c * passiveMult;
  S.civLevel += base * dt;

  // Ограничение по типу звезды (maxCiv)
  if (S.starType) {
    const max = STAR_TYPES[S.starType].maxCiv || 10;
    if (S.civLevel > max) S.civLevel = max;
  }
}

// ─── ЭКСПОРТ В WINDOW ───────────────────────────────────────────
window.starMult = starMult;
window.systemTypeMult = systemTypeMult;
window.systemMult = systemMult;
window.gammaMult = gammaMult;
window.planetRate = planetRate;
window.dustPerSec = dustPerSec;
window.clickGain = clickGain;
window.civPlanetCount = civPlanetCount;
window.energyPerSec = energyPerSec;
window.planetCost = planetCost;
window.systemCost = systemCost;
window.expeditionMaxCapacity = expeditionMaxCapacity;
window.cometMaxCapacity = cometMaxCapacity;
window.colonyCivCost = colonyCivCost;
window.colonyDustCost = colonyDustCost;
window.currentGoal = currentGoal;
window.applyOfflineProgress = applyOfflineProgress;
window.handleCanvasClick = handleCanvasClick;
window.tickCiv = tickCiv;
