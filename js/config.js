// ═══════════════════════════════════════════════════════════════
//  CONFIG.JS — Константы игры
//  Здесь собраны все балансные параметры. Меняй цифры здесь.
// ═══════════════════════════════════════════════════════════════

const CFG = {
  // ─── Офлайн и симуляция ───
  offlineCapHours: 8,
  offlineEfficiency: 1.0,
  offlineAttackMinSec: 3600,  // Офлайн-вторжения срабатывают только если игрок отсутствовал > 1 часа

  // ─── Экономика планет и систем ───
  planetBaseCost: 700000, planetCostGrowth: 2.0,
  systemBaseCost: 40000000, systemGrowth: 2.0, systemCostMin: 40000000,
  systemIncomeMultPerSystem: 1.0,
  storageInstantStars: 50,
};

// ─── ХРАНИЛИЩЕ ───
const STORAGE_CFG = {
  maxLevel: 7,
  dustHours: [8, 16, 24, 36, 48, 60, 72],
  dustCostShare: [0.9, 1.5, 2.5, 4.0, 6.0, 9.0],
  energyCostMult: 12, civCostMult: 20,
  getDustCapHours(level) { return this.dustHours[Math.min(Math.max(1, level||1), 7) - 1]; },
  getDustFlatCap(level) { return 50000 * Math.pow(10, (Math.min(Math.max(1, level||1), 7)) - 1) * this.getDustCapHours(level); },
  getEnergyFlatCap(level) { return 100000 * Math.pow(2, (Math.min(Math.max(1, level||1), 7)) - 1); },
  getCivFlatCap(level) { return 100 * Math.pow(1.5, (Math.min(Math.max(1, level||1), 7)) - 1); },
  getEnergyCapMult(level) { return Math.pow(2, (Math.min(Math.max(1, level||1), 7)) - 1); },
  getCivCapMult(level) { return Math.pow(1.5, (Math.min(Math.max(1, level||1), 7)) - 1); },
  getUpgradeCost(res, level) {
    if (level >= 7) return Infinity;
    const lvl = Math.min(Math.max(1, level||1), 7);
    const share = this.dustCostShare[lvl - 1] || 0.9;
    const dustCost = this.getDustFlatCap(lvl) * share;
    if (res === 'dust') return Math.floor(dustCost);
    if (res === 'energy') return Math.floor(dustCost * this.energyCostMult);
    if (res === 'civ') return Math.floor(dustCost * this.civCostMult);
    return Infinity;
  }
};

// ─── ФАЗЫ ───
const STAGES = {
  cloud:      { tag: 'ФАЗА I', scale: 'ОБЛАКО', name: 'Молекулярное облако', goal: 2000, baseRate: 0, clickRate: 0 },
  condense:   { tag: 'ФАЗА II', scale: 'ДИСК', name: 'Протопланетный диск', goal: 25000, baseRate: 0, clickRate: 0 },
  protostar:  { tag: 'ФАЗА III', scale: 'ЗВЕЗДА', name: 'Протозвезда', goal: null, baseRate: 0, clickRate: 0 },
  firstPlanet:{ tag: 'ФАЗА IV', scale: 'ЗВЕЗДА', name: 'Первая планета', goal: null, baseRate: 40, clickRate: 0 },
  system:     { tag: 'ФАЗА V', scale: 'СИСТЕМА', name: 'Формирование системы', goal: null, baseRate: 200, clickRate: 50 },
  galaxy:     { tag: 'ФАЗА VI', scale: 'ГАЛАКТИКА', name: 'Межзвёздная экспансия', goal: null, baseRate: 2000, clickRate: 100 },
};

// ─── ЗВЕЗДЫ И СИСТЕМЫ ───
const STAR_TYPES = {
  M: { name: 'Красный карлик', color: 8, sat: 92, light: 60, rateMult: 6, civ: false, size: 0.65, maxCiv: 0 },
  K: { name: 'Оранжевый карлик', color: 32, sat: 88, light: 68, rateMult: 3, civ: true, size: 0.85, maxCiv: 7 },
  G: { name: 'Жёлтый карлик', color: 50, sat: 95, light: 74, rateMult: 1.5, civ: true, size: 1.0, maxCiv: 10 },
  A: { name: 'Белая звезда', color: 210, sat: 25, light: 88, rateMult: 2, civ: false, size: 1.25, maxCiv: 0 },
  B: { name: 'Голубая звезда', color: 220, sat: 78, light: 78, rateMult: 3.5, civ: false, size: 1.6, maxCiv: 0 },
};

const SYSTEM_TYPES = {
  single:   { name: 'Одиночная', stars: 1, chance: 0.50, rateMult: 1.0, collisionRate: 0.08, civPassiveMult: 1.0, civClickMult: 1.0, icon: '⭐', color: '#6b4de6', eccentricity: 0.00, precession: 0.000002, orbitDriftRate: 0.0, chaosticPulse: 0.0 },
  binary:   { name: 'Двойная', stars: 2, chance: 0.38, rateMult: 1.7, collisionRate: 0.20, civPassiveMult: 0.65, civClickMult: 3.0, icon: '✨', color: '#8b5cf6', eccentricity: 0.06, precession: 0.00002, orbitDriftRate: 0.3, chaosticPulse: 0.0003 },
  trinary:  { name: 'Кратная', stars: 3, chance: 0.12, rateMult: 2.5, collisionRate: 0.35, civPassiveMult: 0.40, civClickMult: 6.0, icon: '💫', color: '#a855f7', eccentricity: 0.09, precession: 0.00004, orbitDriftRate: 0.5, chaosticPulse: 0.0008 },
};

// ─── ПЛАНЕТЫ И ОРБИТЫ ───
const PLANET_TYPES = {
  rocky:      { name: 'Каменная', color: '#8a7159', civ: true, rate: 250, size: 1.0, bonus: { type: 'basic' } },
  superEarth: { name: 'Земля', color: '#5a9c6e', civ: true, rate: 500, size: 1.3, bonus: { type: 'civ', civMult: 1.5 } },
  iceGiant:   { name: 'Ледяной гигант', color: '#7ec8e3', civ: false, rate: 700, size: 1.5, bonus: { type: 'comet' } },
  gasGiant:   { name: 'Газовый гигант', color: '#d4a76a', civ: false, rate: 900, size: 1.8, bonus: { type: 'shield', cometFailReduction: 0.3 } },
  lava:       { name: 'Лава-планета', color: '#ff4a22', civ: false, rate: 1400, size: 0.9, bonus: { type: 'metals', metalsPerSec: 0.5 } },
};

const PHYS = { refRadius: 100, refTemp: 280, refPeriod: 8 };

const ORBIT_GEOMETRY = { baseR: 170, ratio: 1.22, minGap: 30, maxR: 750 };
function getOrbitR(index) { return ORBIT_GEOMETRY.baseR * Math.pow(ORBIT_GEOMETRY.ratio, index); }

// ─── МАТРИЦА ОРБИТ ───
const ORBIT_PLANET_MATRIX = {
  M: [['rocky'], ['rocky'], ['rocky'], ['rocky', 'gasGiant'], ['gasGiant'], ['gasGiant'], ['iceGiant'], ['iceGiant']],
  K: [['lava'], ['rocky'], ['rocky', 'superEarth'], ['rocky', 'superEarth'], ['rocky', 'superEarth'], ['gasGiant'], ['gasGiant'], ['iceGiant']],
  G: [['lava'], ['rocky'], ['rocky'], ['rocky', 'superEarth'], ['superEarth'], ['gasGiant'], ['gasGiant'], ['iceGiant']],
  A: [['lava'], ['lava'], ['lava', 'rocky'], ['rocky'], ['gasGiant'], ['gasGiant'], ['gasGiant'], ['iceGiant']],
  B: [['lava'], ['lava'], ['lava'], ['lava'], ['gasGiant'], ['gasGiant'], ['gasGiant'], ['iceGiant']],
};

// ─── ВТОРЖЕНИЯ ───
const INVASION_CFG = {
  intervalMin: 20 * 60 * 1000, intervalMax: 40 * 60 * 1000, chance: 0.6,
  robberyDuration: 45 * 60 * 1000, destructionDuration: 15 * 60 * 1000, totalDuration: 60 * 60 * 1000,
  robberyMultiplier: 4, planetMaxHP: 100, hitRadius: 20,
  tiers: {
    scout:  { weight: 0.60, baseChance: 0.70, planets: 1, energyDrain: 0.03, civDrain: 0.05, lootMult: 1.0, chanceCap: 0.90, label: 'Разведка' },
    raid:   { weight: 0.30, baseChance: 0.50, planets: 2, energyDrain: 0.06, civDrain: 0.10, lootMult: 1.5, chanceCap: 0.80, label: 'Рейд' },
    siege:  { weight: 0.10, baseChance: 0.25, planets: 3, energyDrain: 0.10, civDrain: 0.15, lootMult: 2.5, chanceCap: 0.65, label: 'Осада' },
  },
  resourceThresholdShare: 0.25,
  defenseBonusBase: 6, defenseBonusExp: 0.8, defenseDrainReduction: 0.05,
  defenseCost: [0, 300, 700, 1500, 3000, 6000],
  expeditionDefensePenalty: 0.15,
  offlineAttackInterval: 2 * 60 * 60 * 1000, offlineAttackMax: 5, offlineAttackPerSystems: 3,
};

// ─── НОЧНОЙ РЕЖИМ ───
const NIGHT_CFG = {
  lossCaps: { cautious: 0.05, balanced: 0.25, aggressive: 0.50, insane: 0.75 },
  damagePerHit: {
    cautious: { planets: 1, systems: 0 }, balanced: { planets: 2, systems: 1 },
    aggressive: { planets: 3, systems: 2 }, insane: { planets: 5, systems: 3 },
  },
  presets: {
    cautious: { defense: 5, cometHours: 0, expPercent: 0 },
    balanced: { defense: 3, cometHours: 3, expPercent: 30 },
    aggressive: { defense: 0, cometHours: 6, expPercent: 70 },
    insane: { defense: 0, cometHours: 8, expPercent: 100 },
  },
  expeditionDefensePenaltyMax: 0.30,
};

// ─── ТРОФЕИ ───
const TROPHY_CFG = {
  dropChanceByMode: { cautious: 0.10, balanced: 0.20, aggressive: 0.35, insane: 0.50, default: 0.15 },
  rarityWeights: { common: 0.60, rare: 0.30, epic: 0.10 },
  rewards: {
    common: { systemDiscount: [0.30, 0.40], shieldHours: [1, 3], defenseDiscount: [0.25, 0.35] },
    rare:   { systemDiscount: [0.45, 0.50], shieldHours: [4, 6], freeDefenseLevel: [3, 4], freeDefenseHours: 12 },
    epic:   { systemFree: true, shieldHours: [8, 9], freeDefenseLevel: [5, 5], freeDefenseHours: 24 },
  },
};

// ─── ПРЕМИУМ (Металлы) ───
const PREMIUM_CFG = {
  shield: { hours: 8, costMetals: 1000 },
  booster: { hours: 2, costMetals: 1000, incomeMult: 2.0 }, // Бустер дохода
};

// ─── МИССИИ ───
const MISSIONS_CFG = {
  cometFlightBase: 5 * 60 * 1000, cometFlightMinMult: 1.0, cometFlightMaxMult: 3.0,
  cometRewardBase: 1000000, cometRewardPerPlanet: 0.15, cometFailChance: 0.20,
  cometDamageRange: 2.5, cometDamageChance: 0.35,
  expeditionCostBase: 3000, expeditionCostRatio: 1.5,
  expeditionFlightMin: 10 * 60 * 1000, expeditionFlightMax: 20 * 60 * 1000,
  expeditionRewardBase: 2000000, expeditionRewardPerPlanet: 0.25, expeditionFailChance: 0.25,
  colonyChance: 0.03, colonyEnergyCost: 50000, colonyEnergyRatio: 2, colonyCivCost: 50, colonyCivRatio: 1.8,
};

// ─── МАГАЗИН СИСТЕМ ───
const SYSTEM_SHOP_CFG = {
  dustSeconds: 1800, energyCapShare: 0.5, civCapShare: 0.4,
  energyBonusPlanets: 2, energyBonusIncome: 0.5,
  colonyChanceFull: 0.60, gasChance: 0.30,
  primeChance: 0.05, // 5% шанс Прайм-объекта
};

const PRESTIGE_CFG = { firstRequirement: 5, stepMultiplier: 2, multiplierPerGalaxy: 2.0 };
const METALS_CFG = { expeditionCostMetals: 200, cometBoostCostMetals: 100, cometBoostSurvival: 0.3, colonyCostMetals: 500 };
const STAR_WEIGHTS = { M: 60, K: 15, G: 10, A: 10, B: 5 };
// ═══════════════════════════════════════════════════════════════
//  ГЕНЕРАТОРЫ СИСТЕМ И ЗВЕЗД (восстановлено)
// ═══════════════════════════════════════════════════════════════
const SYS_PREFIXES = ['Альфа','Бета','Гамма','Дельта','Эпсилон','Дзета','Эта','Тета','Йота','Каппа','Лямбда','Мю','Ню','Кси','Омикрон','Пи','Ро','Сигма','Тау','Ипсилон','Фи','Хи','Пси','Омега'];
const SYS_NAMES = ['Кентавра','Центавра','Ориона','Лебедя','Лира','Дракона','Феникса','Кита','Гидры','Пегаса','Кассиопеи','Персея','Андромеды','Волопаса','Геркулеса','Змееносца','Ворона','Орла','Павлина','Журавля','Тукана','Единорога'];
const SYS_SUFFIXES = ['',' I',' II',' III',' IV',' V',' A',' B'];

function generateSystemName() {
  let generatedName = '';
  let attempts = 0;
  while (attempts < 100) {
    const prefix = SYS_PREFIXES[Math.floor(Math.random() * SYS_PREFIXES.length)];
    const base = SYS_NAMES[Math.floor(Math.random() * SYS_NAMES.length)];
    const suffix = SYS_SUFFIXES[Math.floor(Math.random() * SYS_SUFFIXES.length)];
    generatedName = prefix + ' ' + base + suffix;

    let isDuplicate = false;
    if (typeof S !== 'undefined' && S.systemName === generatedName) isDuplicate = true;
    if (!isDuplicate && typeof S !== 'undefined' && S.otherSystems) {
      for (let i = 0; i < S.otherSystems.length; i++) {
        if (S.otherSystems[i] && S.otherSystems[i].name === generatedName) {
          isDuplicate = true; break;
        }
      }
    }
    if (!isDuplicate) break;
    attempts++;
  }
  return generatedName;
}

function rollStarType() {
  const weights = { M: 60, K: 15, G: 10, A: 10, B: 5 };
  let total = 100;
  let r = Math.random() * total;
  for (const key in weights) {
    r -= weights[key];
    if (r <= 0) return key;
  }
  return 'M';
}

function rollSystemType() {
  const r = Math.random();
  if (r < 0.50) return 'single';
  if (r < 0.88) return 'binary';
  return 'trinary';
}

function generateRandomSystem(opts) {
  opts = opts || {};
  const isColony = opts.isColony === true;
  let starType = isColony ? (Math.random() < 0.6 ? 'G' : 'K') : rollStarType();
  const systemType = rollSystemType();
  const planets = [];
  
  for (let i = 0; i < 8; i++) {
    let pool = getAllowedTypesAtOrbit(starType, i);
    if (isColony) {
      pool = pool.filter(function(t) { return PLANET_TYPES[t] && PLANET_TYPES[t].civ; });
      if (pool.length === 0) continue;
    }
    if (pool.length === 0) continue;
    if (Math.random() > 0.65) continue;
    
    const type = pool[Math.floor(Math.random() * pool.length)];
    const orbitR = getOrbitR(i);
    planets.push({
      type: type,
      angle: Math.random() * Math.PI * 2,
      speed: 0.2 / Math.pow(orbitR / 90, 1.5),
      baseOrbitR: orbitR, orbitR: orbitR,
      driftPhase: Math.random() * Math.PI * 2,
      rotation: Math.random() * Math.PI * 2,
      seed: Math.random() * 1e6,
      forming: false, formUntil: 0,
      mass: planetMass(type),
      diameter: planetDiameter(type),
      moons: [], precession: 0, trueAnomaly: 0,
    });
  }
  return {
    name: generateSystemName(),
    starType: starType, systemType: systemType, planets: planets,
  };
}

function getAllowedTypesAtOrbit(starType, orbitIdx) {
  const matrix = ORBIT_PLANET_MATRIX[starType] || ORBIT_PLANET_MATRIX.G;
  if (orbitIdx < 0 || orbitIdx >= matrix.length) return [];
  return matrix[orbitIdx].slice();
}

function getAllowedOrbitsForType(starType, planetType) {
  const matrix = ORBIT_PLANET_MATRIX[starType] || ORBIT_PLANET_MATRIX.G;
  const orbits = [];
  for (let i = 0; i < matrix.length; i++) {
    if (matrix[i].indexOf(planetType) !== -1) orbits.push(i);
  }
  return orbits;
}

function planetMass(type) {
  const m = { rocky:1.0, superEarth:2.5, iceGiant:4.0, gasGiant:8.0, lava:1.5 };
  return m[type] || 1.0;
}

function planetDiameter(type) {
  const d = { rocky:1.0, superEarth:1.3, iceGiant:1.5, gasGiant:1.8, lava:0.9 };
  return d[type] || 1.0;
}

// Экспорт (если у тебя в конце config.js есть экспорты через window, добавь эти строки):
window.generateSystemName = generateSystemName;
window.rollStarType = rollStarType;
window.rollSystemType = rollSystemType;
window.generateRandomSystem = generateRandomSystem;
window.getAllowedTypesAtOrbit = getAllowedTypesAtOrbit;
window.getAllowedOrbitsForType = getAllowedOrbitsForType;