// ═══════════════════════════════════════════════════════════════
//  ECONOMY.JS — формулы дохода, стоимости, офлайн-прогресс
// ═══════════════════════════════════════════════════════════════

// ─── Множители ──────────────────────────────────────────────────
function econCfg() {
  return (typeof ECONOMY_CFG !== 'undefined' && ECONOMY_CFG) ? ECONOMY_CFG : {};
}
function starMult() { return S.starType ? STAR_TYPES[S.starType].rateMult : 1; }
function systemTypeMult() { return S.systemType ? SYSTEM_TYPES[S.systemType].rateMult : 1; }
// ★ Оставлено для клика. В доходе пыли больше НЕ участвует: раньше он заменял
//   доход неактивных систем (×N), теперь каждая система считается напрямую.
function systemMult() {
  return 1 + Math.max(0, S.systems - 1) * (CFG.systemIncomeMultPerSystem || 1.0);
}
function gammaMult() { return Date.now() < S.gammaDebuff ? 0.4 : 1; }
function galaxyMult() { return S.galaxyMultiplier || 1; }

// Множители конкретной системы (своя звезда + свой тип).
function systemStarMult(starType) {
  return (STAR_TYPES[starType] && Number(STAR_TYPES[starType].rateMult)) || 1;
}
function systemTypeMultOf(systemType) {
  return (SYSTEM_TYPES[systemType] && Number(SYSTEM_TYPES[systemType].rateMult)) || 1;
}

// ═══════════════════════════════════════════════════════════════
//  ★ ЕДИНЫЙ ОБХОД ВСЕХ СИСТЕМ ИГРОКА
//  Раньше доход считался только по активной системе (S.planets),
//  а владение N системами учитывалось плоским множителем systemMult().
//  Теперь каждая система игрока даёт доход сама за себя.
// ═══════════════════════════════════════════════════════════════
// callback(idx, planets, starType, systemType, incomeBonus, primeData, damaged, isActive)
function forEachOwnedSystem(cb) {
  if (!S) return;
  const activeIdx = Number(S.activeSystemIdx) || 0;

  // Активная система: источник истины — поля S.*
  cb(activeIdx,
     Array.isArray(S.planets) ? S.planets : [],
     S.starType || 'G',
     S.systemType || 'single',
     Number(S.systemIncomeBonus) || 0,
     S.primeSystem || null,
     false,
     true);

  const list = Array.isArray(S.otherSystems) ? S.otherSystems : [];
  const now = Date.now();
  for (let i = 0; i < list.length; i++) {
    if (i === activeIdx) continue;          // активную уже обошли
    const sys = list[i];
    if (!sys || typeof sys !== 'object') continue;
    const pd = (typeof primeDataOfSystem === 'function')
      ? primeDataOfSystem(sys)
      : (sys.primeData || sys.primeSystem || null);
    cb(i,
       Array.isArray(sys.planets) ? sys.planets : [],
       sys.starType || 'G',
       sys.systemType || 'single',
       Number(sys.incomeBonus) || 0,
       pd,
       !!(sys.damagedUntil && sys.damagedUntil > now),
       false);
  }
}
window.forEachOwnedSystem = forEachOwnedSystem;

// Всего планет во всех системах (для фоллбеков).
function totalPlanetCount() {
  let n = 0;
  forEachOwnedSystem(function(idx, planets) { n += planets.length; });
  return n;
}
window.totalPlanetCount = totalPlanetCount;

// ─── Прайм-бонусы: складываются со ВСЕХ прайм-систем ────────────
// Чтобы 12 прайм-систем не давали ×12 дохода, сумма проходит через
// затухание (primeBonusWeight) и жёсткий потолок (primeBonusCap).
function primeBonusMult(kind) {
  const cfg = econCfg();
  const weight = isFinite(Number(cfg.primeBonusWeight)) ? Number(cfg.primeBonusWeight) : 0.40;
  const cap = isFinite(Number(cfg.primeBonusCap)) ? Number(cfg.primeBonusCap) : 1.50;
  let raw = 0;

  function addBonus(b) {
    if (!b) return;
    raw += Number(b.allMult) || 0;
    if (kind === 'energy') raw += Number(b.energyMult) || 0;
    else raw += Number(b.dustMult) || 0;
  }

  if (S.primeSystem) addBonus(S.primeSystem.bonus);
  const list = Array.isArray(S.otherSystems) ? S.otherSystems : [];
  const activeIdx = Number(S.activeSystemIdx) || 0;
  for (let i = 0; i < list.length; i++) {
    if (i === activeIdx && S.primeSystem) continue;
    const sys = list[i];
    if (!sys) continue;
    const pd = (typeof primeDataOfSystem === 'function')
      ? primeDataOfSystem(sys)
      : (sys.primeData || sys.primeSystem || null);
    if (pd) addBonus(pd.bonus);
  }
  return 1 + Math.min(cap, raw * weight);
}
window.primeBonusMult = primeBonusMult;

// ─── Доход одной планеты (без системных/глобальных множителей) ──
function planetBaseRate(p) {
  const pt = PLANET_TYPES[p.type];
  let base = pt ? Number(pt.rate) || 0 : 0;
  if (!isFinite(base)) base = 0;

  if (typeof safronovAccretion === 'function') base *= (1 + safronovAccretion(p) * 10);
  if (p.mass > 1 && isFinite(p.mass)) base *= (1 + Math.log(p.mass) * 0.35);

  if (typeof tempAt === 'function') {
    const rAe = (p.orbitR || 100) / PHYS.refRadius;
    base *= 0.8 + Math.min(1, tempAt(rAe) / 400) * 0.4;
  }

  return isFinite(base) ? base : 0;
}
window.planetBaseRate = planetBaseRate;

// ─── Учитываем ли планету в доходе ──────────────────────────────
// ★ Флаг `forming` снимается только у АКТИВНОЙ системы (updatePlanets),
//   поэтому в остальных системах планета могла «застрять» в статусе
//   формирования навсегда. Если formUntil уже прошёл — планета работает.
function isPlanetProducing(p, now) {
  if (!p) return false;
  now = now || Date.now();
  if (p.forming && (Number(p.formUntil) || 0) > now) return false;
  if (p.disabledUntil && p.disabledUntil > now) return false;
  if (typeof isPlanetInvaded === 'function' && isPlanetInvaded(p)) return false;
  return true;
}
window.isPlanetProducing = isPlanetProducing;

// ─── Доход от планет ВСЕХ систем игрока ─────────────────────────
function planetRate() {
  let sum = 0;
  const now = Date.now();
  forEachOwnedSystem(function(idx, planets, starType, systemType, incomeBonus, primeData, damaged) {
    if (damaged) return;                       // система выведена из строя вторжением
    let local = 0;
    for (let i = 0; i < planets.length; i++) {
      const p = planets[i];
      if (!isPlanetProducing(p, now)) continue;
      if (!isFinite(p.baseOrbitR)) continue;
      local += planetBaseRate(p);
    }
    if (local === 0) return;

    sum += local * systemStarMult(starType) * systemTypeMultOf(systemType) * (1 + incomeBonus);
  });
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

// ─── Металлы (доход в секунду от лава-планет ВСЕХ систем) ───────
function metalsPerSec() {
  let sum = 0;
  let hasLava = false;
  const now = Date.now();

  forEachOwnedSystem(function(idx, planets, starType, systemType, incomeBonus, primeData, damaged) {
    if (damaged) return;
    for (let i = 0; i < planets.length; i++) {
      const p = planets[i];
      if (!isPlanetProducing(p, now)) continue;
      const pt = PLANET_TYPES[p.type];
      if (pt && pt.bonus && pt.bonus.type === 'metals') {
        hasLava = true;
        sum += Number(pt.bonus.metalsPerSec) || 0;
      }
    }
  });

  // ★ Цив даёт пассивный бонус ко всей добыче (как и раньше).
  if (hasLava && S.civLevel > 100) {
    sum *= 1 + Math.floor(S.civLevel / 1000) * 0.1;
  }
  return isFinite(sum) ? sum : 0;
}

// ─── Доход в секунду (Абсолютная защита от NaN) ───
function dustPerSec() {
  const st = STAGES[S.stage];
  if (!st) return 0;
  if (S.stage === 'cloud' || S.stage === 'condense' || S.stage === 'protostar') return 0;

  // ★ Бонусы всех прайм-систем (с затуханием), а не только активной.
  const primeMultiplier = primeBonusMult('dust');
  const boostMult = (S.boosters && S.boosters.incomeUntil > Date.now()) ? (PREMIUM_CFG.booster.incomeMult || 1) : 1;

  const base = Number(st.baseRate) || 0;
  const pRate = Number(planetRate()) || 0;
  const gMult = Number(gammaMult()) || 1;
  const galMult = Number(galaxyMult()) || 1;
  const techMult = Number(1 + (S.techLevels?.astro || 0) * 0.15) || 1;

  let achMult = 1;
  if (typeof achIncomeMult === 'function') achMult = Number(achIncomeMult()) || 1;

  let finalRate = (base + pRate) * gMult * galMult * primeMultiplier * boostMult * techMult * achMult;
  finalRate *= invasionDebuffMult();   // ★ штраф после вторжения (−до 60%)
  if (typeof eventMult === 'function') finalRate *= eventMult('dust');
  return (isFinite(finalRate) && !isNaN(finalRate)) ? Math.max(0, finalRate) : 0;
}

function clickGain() {
  const st = STAGES[S.stage];
  if (!st) return 0;
  let finalRate = Number(st.clickRate || 0) * starMult() * systemTypeMult() * systemMult() * gammaMult() * galaxyMult() * (typeof achIncomeMult === 'function' ? achIncomeMult() : 1) * invasionDebuffMult();
  if (typeof eventMult === 'function') finalRate *= eventMult('click');
  return isFinite(finalRate) ? finalRate : 0;
}

// ─── Кап металлов: нельзя копить «в стол» ───────────────────────
// ★ Раньше это был единственный кап, не учитывающий доход: 750×2^(ур.-1),
//   т.е. максимум 48 000 и «стена» при любом прогрессе. Теперь, как у
//   пыли/энергии/цив: не меньше N часов текущего дохода.
function metalsCap() {
  const cfg = (typeof METALS_CFG !== 'undefined') ? METALS_CFG : {};
  const lvl = Math.max(1, Math.min(7, Number((S.storageLevels || {})[cfg.capStorage || 'energy']) || 1));
  const flat = (cfg.capBase || 750) * Math.pow(cfg.capGrowth || 2, lvl - 1);

  const econ = econCfg();
  const hoursRaw = Number(econ.metalsCapHours);
  const hours = (isFinite(hoursRaw) && hoursRaw > 0) ? hoursRaw : 2;

  const cap = Math.max(flat, metalsPerSec() * 3600 * hours);
  return isFinite(cap) ? Math.floor(cap) : flat;
}
window.metalsCap = metalsCap;

// ═══════════════════════════════════════════════════════════════
//  ★ ДИНАМИЧЕСКИЕ ЦЕНЫ
//  Цена = max(базовая, доход/час × часы). Так цена всегда означает
//  «столько-то часов добычи», и ресурсы приходится распределять:
//  оборона ↔ флот ↔ экспедиции ↔ колонии.
// ═══════════════════════════════════════════════════════════════
function priceFromIncome(base, incomePerSec, hours) {
  const b = Math.max(0, Number(base) || 0);
  const inc = Math.max(0, Number(incomePerSec) || 0);
  const h = Math.max(0, Number(hours) || 0);
  const price = Math.max(b, inc * 3600 * h);
  return isFinite(price) ? Math.ceil(price) : Math.ceil(b);
}
window.priceFromIncome = priceFromIncome;

function metalPrice(base, hours) { return priceFromIncome(base, metalsPerSec(), hours); }
function energyPrice(base, hours) { return priceFromIncome(base, energyPerSec(), hours); }
function civPrice(base, hours) { return priceFromIncome(base, civPerSec(), hours); }
window.metalPrice = metalPrice;
window.energyPrice = energyPrice;
window.civPrice = civPrice;

function priceHours(key) {
  const t = econCfg().priceHours || {};
  if (key === 'defense') return Array.isArray(t.defense) ? t.defense : [];
  if (key === 'fleet') return t.fleet || {};
  const v = Number(t[key]);
  return isFinite(v) && v >= 0 ? v : 0;
}
window.priceHoursFor = priceHours;
// ─── Автоборона: базовая цена × системы + динамика по доходу ────
function defenseActivationCost(level) {
  const lvl = Math.max(0, Math.min(5, Math.round(Number(level) || 0)));
  if (lvl === 0) return 0;

  const cfg = (typeof INVASION_CFG !== 'undefined') ? INVASION_CFG : {};
  const systemsExtra = Math.max(0, (S.systems || 1) - 1);
  const base = (Number((cfg.defenseCost || [])[lvl]) || 0) *
               (1 + systemsExtra * (Number(cfg.defenseCostMultiplierPerSystem) || 0));

  const hoursArr = priceHours('defense');
  return metalPrice(base, Number(hoursArr[lvl]) || 0);
}
window.defenseActivationCost = defenseActivationCost;

// ─── Верфь: цена одного корабля ────────────────────────────────
function fleetShipPrice(key) {
  const ships = (typeof FLEET_CFG !== 'undefined' && FLEET_CFG.ships) ? FLEET_CFG.ships : {};
  const ship = ships[key];
  if (!ship) return 0;
  const hoursMap = priceHours('fleet') || {};
  return metalPrice(ship.costMetals, Number(hoursMap[key]) || 0);
}
window.fleetShipPrice = fleetShipPrice;

// ─── Содержание активного флота ─────────────────────────────────
// ★ Флот больше не бесплатен: пока он включён, металл уходит постоянно.
//   Вес: перехватчик 1, крейсер 3, дредноут 8.
const FLEET_POWER = { interceptor: 1, cruiser: 3, dreadnought: 8 };

function fleetUpkeepShare(forceActive) {
  if (!forceActive && (typeof isFleetActive !== 'function' || !isFleetActive())) return 0;

  const cfg = econCfg();
  let power = 0;
  const fleet = S.fleet || {};
  for (const key in FLEET_POWER) {
    power += Math.max(0, Number(fleet[key]) || 0) * FLEET_POWER[key];
  }
  if (power <= 0) return 0;

  const perRaw = Number(cfg.fleetUpkeepPerPower);
  const capRaw = Number(cfg.fleetUpkeepCap);
  const per = (isFinite(perRaw) && perRaw >= 0) ? perRaw : 0.015;
  const cap = (isFinite(capRaw) && capRaw > 0) ? capRaw : 0.60;

  return Math.min(cap, power * per);
}
window.fleetUpkeepShare = fleetUpkeepShare;

function fleetUpkeepPerSec() {
  return metalsPerSec() * fleetUpkeepShare();
}
window.fleetUpkeepPerSec = fleetUpkeepPerSec;

// Списание содержания за dt. Возвращает фактически списанное.
// Если металла не хватает — флот уходит в резерв (это и есть «стратегия»).
function payFleetUpkeep(dt) {
  const perSec = fleetUpkeepPerSec();
  if (!(perSec > 0) || !(dt > 0)) return 0;

  const due = perSec * dt;
  const have = Math.max(0, Number(S.metalAmount) || 0);

  if (have >= due) {
    S.metalAmount = have - due;
    return due;
  }

  S.metalAmount = 0;
  if (S.fleetActive) {
    S.fleetActive = false;
    if (typeof toast === 'function' && !window.__fleetUpkeepWarned) {
      window.__fleetUpkeepWarned = true;
      toast('Флот в резерве', 'Не хватило металла на содержание флота');
      setTimeout(function () { window.__fleetUpkeepWarned = false; }, 5000);
    }
    if (typeof sendPushNotification === 'function') {
      sendPushNotification('🚀 <b>Действие флота закончилось.</b> Причина: не хватило металла на содержание.', 'fleet');
    }
  }
  return have;
}
window.payFleetUpkeep = payFleetUpkeep;

// ─── Цивилизация: подсчет обитаемых планет (во ВСЕХ системах) ───
function civPlanetCount() {
  let n = 0;
  const now = Date.now();
  forEachOwnedSystem(function(idx, planets, starType, systemType, incomeBonus, primeData, damaged) {
    if (damaged) return;
    for (let i = 0; i < planets.length; i++) {
      const p = planets[i];
      // ★ Убрана проверка на STAR_TYPES.civ, чтобы планеты на любых звездах давали жизнь
      if (!isPlanetProducing(p, now)) continue;
      const pt = PLANET_TYPES[p.type];
      if (pt && pt.civ) n++;
    }
  });
  return n;
}
window.civPlanetCount = civPlanetCount;

// ─── Рост цивилизации (по ВСЕМ системам) ────────────────────────
function civPerSec() {
  const techMult = 1 + ((S.techLevels?.cyber || 0) * 0.20);
  const now = Date.now();
  let total = 0;

  forEachOwnedSystem(function(idx, planets, starType, systemType, incomeBonus, primeData, damaged) {
    if (damaged) return;

    const typeCfg = SYSTEM_TYPES[systemType] || SYSTEM_TYPES.single;
    let mult = Number(typeCfg.civPassiveMult) || 1;
    let c = 0;

    for (let i = 0; i < planets.length; i++) {
      const p = planets[i];
      if (!isPlanetProducing(p, now)) continue;
      const pt = PLANET_TYPES[p.type];
      if (!pt) continue;
      if (pt.civ) c++;
      if (pt.bonus && pt.bonus.type === 'civ') mult *= (pt.bonus.civMult || 1);
    }

    if (c === 0) return;
    total += CFG.civGrowthPerPlanet * c * mult * techMult;
  });

  // ★ Фоллбек: если планет с жизнью нет, даем минимальный рост для восстановления
  if (total === 0) return 0.005 * techMult;

  let finalRate = total;
  if (typeof eventMult === 'function') finalRate *= eventMult('civ');
  return isFinite(finalRate) ? finalRate : 0;
}

// ─── Доход энергии (по ВСЕМ системам) ───────────────────────────
function energyPerSec() {
  const c = civPlanetCount();

  if (S.civLevel < 4) {
    // ★ Фоллбек: если цив < 4, но планеты есть, даем минимальный приток энергии
    return c > 0 ? 0.1 : 0;
  }
  if (c === 0) return 0;

  const levels = S.storageLevels || { energy: 1 };
  // ★ Энергобонусы всех прайм-систем (с затуханием), а не только активной.
  const primeMultiplier = primeBonusMult('energy');

  const base = Number(S.civLevel) || 0;
  const techMult = Number(1 + (S.techLevels?.quantum || 0) * 0.20) || 1;
  const lvlMult = Math.pow(1.5, (Number(levels.energy) || 1) - 1);

  let finalRate = (base - 3) * c * 0.5 * lvlMult * techMult * primeMultiplier;
  if (typeof eventMult === 'function') finalRate *= eventMult('energy');
  return (isFinite(finalRate) && !isNaN(finalRate)) ? Math.max(0, finalRate) : 0;
}
window.energyPerSec = energyPerSec;

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
    dustEarned: 0, energyEarned: 0, civEarned: 0, metalsEarned: 0,
    cometEarned: 0, expEarned: 0, nightEnded: false,
    invasionAttacks: 0, invasionDefended: 0, invasionLost: 0,
    invasionDrainE: 0, invasionDrainC: 0, shieldProtected: false,
    fleetUpkeep: 0, fleetDeactivated: false,
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

  // ★ Металлы тоже капаются офлайн (раньше офлайн их не начислял вовсе).
  const mRate = metalsPerSec();
  if (mRate > 0) {
    const econ = econCfg();
    const capHRaw = Number(econ.metalsCapHours);
    const capHours = (isFinite(capHRaw) && capHRaw > 0) ? capHRaw : 2;
    const mCappedSec = Math.min(elapsedSec, capHours * 3600);
    const mEarned = Math.floor(mRate * mCappedSec * CFG.offlineEfficiency);
    if (mEarned > 0) {
      const mCap = metalsCap();
      const availableM = mCap - (S.metalAmount || 0);
      if (availableM > 0) {
        const actualM = Math.min(mEarned, availableM);
        S.metalAmount = (S.metalAmount || 0) + actualM;
        out.metalsEarned = Math.floor(actualM);
      }
    }
  }

  // ★ Содержание флота за офлайн: списывается, но НЕ выключает флот.
  //   Окно — как у капа металлов (metalsCapHours), чтобы сумма была оплачиваемой:
  //   иначе ночная оборона умирала бы от нехватки металла без ведома игрока.
  const upkeepPerSec = (typeof fleetUpkeepPerSec === 'function') ? fleetUpkeepPerSec() : 0;
  if (upkeepPerSec > 0) {
    const econ = econCfg();
    const capHRaw = Number(econ.metalsCapHours);
    const capHours = (isFinite(capHRaw) && capHRaw > 0) ? capHRaw : 2;
    const due = Math.floor(upkeepPerSec * Math.min(elapsedSec, capHours * 3600));
    if (due > 0) {
      const have = Math.max(0, S.metalAmount || 0);
      const paid = Math.min(have, due);
      S.metalAmount = have - paid;
      out.fleetUpkeep = Math.floor(paid);
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

  if (out.dustEarned > 0 || out.energyEarned > 0 || out.civEarned > 0 || out.metalsEarned > 0 ||
      out.fleetUpkeep > 0 ||
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