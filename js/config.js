// ═══════════════════════════════════════════════════════════════
//  CONFIG.JS — Константы игры
//  Здесь собраны все балансные параметры. Меняй цифры здесь.
// ═══════════════════════════════════════════════════════════════

const CFG = {
  // ─── Общие настройки ───
  offlineCapHours: 8,
  offlineEfficiency: 0.6,
  offlineAttackMinSec: 3600,  // Офлайн-вторжения срабатывают только если игрок отсутствовал > 1 часа
  eventInterval: 200,
  eventChance: 0.5,
  formationDuration: 120,     // Время формирования планеты после слияния (сек)
  civGrowthPerPlanet: 0.02,   // Скорость роста цивилизации с одной планеты
  civClickBoost: 0.0,

  // ─── Экономика планет и систем ───
  planetBaseCost: 3530000, planetCostGrowth: 2.0, planetCostExp: 2.0,
  // ★ systemCostExp 1.5 → 1.3: цена ~ N^1.3, доход ~ N, поэтому время до
  //   следующей системы растёт как N^0.3, а не N^0.5 (на 125 системах
  //   ожидание сокращается примерно в 2.6 раза). Раннюю игру не трогает:
  //   при N=1 цена та же.
  systemBaseCost: 71000000, systemGrowth: 1.5, systemCostExp: 1.3, systemCostMin: 1000000,
  systemIncomeMultPerSystem: 1.0,
  storageInstantStars: 50,

  // ═════════════════════════════════════════════════════════════
  //  АКТИВНЫЕ ФАЗЫ I–III
  // ═════════════════════════════════════════════════════════════
  activeBoost: {
    cloud: {
      vRef: 25, radialSpeed: 25,
      holdBoost: 2.5, twistBoost: 1.0, twistThreshold: 999,
      dustPerParticle: 1,
    },
    condense: {
      vRef: 30, radialSpeed: 45,
      holdBoost: 2.0, twistBoost: 3.5, twistScale: 0.7, twistThreshold: 0.05,
      dustPerParticle: 2,
      diskRadius: 40, diskWidth: 12, diskOrbitSec: 3,
      diskSpinSpeed: 3.0, diskFormSec: 14,
    },
    protostar: {
      vRef: 20, radialSpeed: 35,
      dustPerParticle: 1,
      diskRadius: 70, diskWidth: 20, diskOrbitSec: 5,
      diskSpinSpeed: 6.0,
      duration: 30,
      heatDecayBase: 0.10, heatDecayAccel: 0.15, heatTapBoost: 0.09,
      starThresholds: [
        { q: 0.90, star: 'M', color: '#ff3030' },
        { q: 0.70, star: 'B', color: '#5577ff' },
        { q: 0.45, star: 'K', color: '#ff9944' },
        { q: 0.25, star: 'A', color: '#ccccff' },
        { q: 0.00, star: 'G', color: '#ffcc55' },
      ],
    },
  },
};

// ─── ХРАНИЛИЩЕ ───
const STORAGE_CFG = {
  maxLevel: 7,
  dustHours: [8, 16, 24, 36, 48, 60, 72],
  dustCostShare: [0.9, 1.5, 2.5, 4.0, 6.0, 9.0],
  energyCostMult: 12, civCostMult: 20,
  getDustCapHours(level) { return this.dustHours[Math.min(Math.max(1, level||1), 7) - 1]; },
  getDustFlatCap(level) { return 50000 * Math.pow(10, (Math.min(Math.max(1, level||1), 7)) - 1) * this.getDustCapHours(level); },
  getEnergyFlatCap(level) { return 100000 * Math.pow(5, (Math.min(Math.max(1, level||1), 7)) - 1); },
  getCivFlatCap(level) { return 500 * Math.pow(3, (Math.min(Math.max(1, level||1), 7)) - 1); },
  getEnergyCapMult(level) { return Math.pow(2, (Math.min(Math.max(1, level||1), 7)) - 1); },
  getCivCapMult(level) { return Math.pow(3, (Math.min(Math.max(1, level||1), 7)) - 1); },
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
  firstPlanet:{ tag: 'ФАЗА IV', scale: 'ЗВЕЗДА', name: 'Первая планета', goal: null, baseRate: 800, clickRate: 0 },
  system:     { tag: 'ФАЗА V', scale: 'СИСТЕМА', name: 'Формирование системы', goal: null, baseRate: 1200, clickRate: 50 },
  galaxy:     { tag: 'ФАЗА VI', scale: 'ГАЛАКТИКА', name: 'Межзвёздная экспансия', goal: null, baseRate: 2500, clickRate: 100 },
};

// ─── ЗВЕЗДЫ И СИСТЕМЫ ───
const STAR_TYPES = {
  M: { name: 'Красный карлик', color: 8, sat: 92, light: 60, rateMult: 2.2, civ: false, size: 0.65, maxCiv: 0 },
  K: { name: 'Оранжевый карлик', color: 32, sat: 88, light: 68, rateMult: 2.1, civ: true, size: 0.85, maxCiv: 7 },
  G: { name: 'Жёлтый карлик', color: 50, sat: 95, light: 74, rateMult: 1.8, civ: true, size: 1.0, maxCiv: 10 },
  A: { name: 'Белая звезда', color: 210, sat: 25, light: 88, rateMult: 1.9, civ: false, size: 1.25, maxCiv: 0 },
  B: { name: 'Голубая звезда', color: 220, sat: 78, light: 78, rateMult: 2.0, civ: false, size: 1.6, maxCiv: 0 },
};

const SYSTEM_TYPES = {
  single:   { name: 'Одиночная', stars: 1, chance: 0.50, rateMult: 1.0, collisionRate: 0.08, civPassiveMult: 1.0, civClickMult: 1.0, icon: '⭐', color: '#6b4de6', eccentricity: 0.00, precession: 0.000002, orbitDriftRate: 0.0, chaosticPulse: 0.0 },
  binary:   { name: 'Двойная', stars: 2, chance: 0.38, rateMult: 1.15, collisionRate: 0.20, civPassiveMult: 0.65, civClickMult: 3.0, icon: '✨', color: '#8b5cf6', eccentricity: 0.06, precession: 0.00002, orbitDriftRate: 0.3, chaosticPulse: 0.0003 },
  trinary:  { name: 'Кратная', stars: 3, chance: 0.12, rateMult: 1.3, collisionRate: 0.35, civPassiveMult: 0.40, civClickMult: 6.0, icon: '💫', color: '#a855f7', eccentricity: 0.09, precession: 0.00004, orbitDriftRate: 0.5, chaosticPulse: 0.0008 },
};

// ─── ПЛАНЕТЫ И ОРБИТЫ ───
const PLANET_TYPES = {
  rocky:      { name: 'Каменная', color: '#8a7159', civ: true, rate: 250, size: 1.0, bonus: { type: 'basic' } },
  superEarth: { name: 'Земля', color: '#5a9c6e', civ: true, rate: 500, size: 1.3, bonus: { type: 'civ', civMult: 1.5 } },
  iceGiant:   { name: 'Ледяной гигант', color: '#7ec8e3', civ: false, rate: 700, size: 1.5, bonus: { type: 'comet' } },
  gasGiant:   { name: 'Газовый гигант', color: '#d4a76a', civ: false, rate: 900, size: 1.8, bonus: { type: 'shield', cometFailReduction: 0.3 } },
  lava:       { name: 'Лава-планета', color: '#ff4a22', civ: false, rate: 1400, size: 0.9, bonus: { type: 'metals', metalsPerSec: 0.15 } },
};

const PHYS = { refRadius: 100, refTemp: 280, refPeriod: 8 };
const ORBIT_GEOMETRY = { baseR: 170, ratio: 1.22, minGap: 30, maxR: 750 };
function getOrbitR(index) { return ORBIT_GEOMETRY.baseR * Math.pow(ORBIT_GEOMETRY.ratio, index); }

// ─── МАТРИЦА ОРБИТ (Зависит от типа звезды) ───
const ORBIT_PLANET_MATRIX = {
  M: [['rocky'], ['rocky'], ['rocky'], ['rocky', 'gasGiant'], ['gasGiant'], ['gasGiant'], ['iceGiant'], ['iceGiant']],
  K: [['lava'], ['rocky'], ['rocky', 'superEarth'], ['rocky', 'superEarth'], ['rocky', 'superEarth'], ['gasGiant'], ['gasGiant'], ['iceGiant']],
  G: [['lava'], ['rocky'], ['rocky'], ['rocky', 'superEarth'], ['superEarth'], ['gasGiant'], ['gasGiant'], ['iceGiant']],
  A: [['lava'], ['lava'], ['lava', 'rocky'], ['rocky'], ['gasGiant'], ['gasGiant'], ['gasGiant'], ['iceGiant']],
  B: [['lava'], ['lava'], ['lava'], ['lava'], ['gasGiant'], ['gasGiant'], ['gasGiant'], ['iceGiant']],
};

// ★ СТАНДАРТНАЯ МАТРИЦА (для фаз ручной сборки: IV и V)
// Гарантирует, что у игрока всегда будет место под собранную планету.
const STANDARD_ORBIT_MATRIX = [
  ['lava'],
  ['lava'],
  ['lava', 'superEarth'],
  ['superEarth', 'rocky'],
  ['superEarth', 'rocky'],
  ['rocky', 'gasGiant'],
  ['gasGiant', 'iceGiant'],
  ['gasGiant', 'iceGiant']
];

function getAllowedTypesAtOrbit(starType, orbitIdx) {
  // Если игрок в фазе ручной сборки, используем стандарт
  if (typeof S !== 'undefined' && (S.stage === 'firstPlanet' || S.stage === 'system')) {
    if (orbitIdx < 0 || orbitIdx >= STANDARD_ORBIT_MATRIX.length) return [];
    return STANDARD_ORBIT_MATRIX[orbitIdx].slice();
  }
  // Иначе используем матрицу звезды
  const matrix = ORBIT_PLANET_MATRIX[starType] || ORBIT_PLANET_MATRIX.G;
  if (orbitIdx < 0 || orbitIdx >= matrix.length) return [];
  return matrix[orbitIdx].slice();
}

function getAllowedTypesForSystem(starType) {
  if (typeof S !== 'undefined' && (S.stage === 'firstPlanet' || S.stage === 'system')) {
    const set = {};
    for (let i = 0; i < STANDARD_ORBIT_MATRIX.length; i++) {
      for (let j = 0; j < STANDARD_ORBIT_MATRIX[i].length; j++) set[STANDARD_ORBIT_MATRIX[i][j]] = true;
    }
    return Object.keys(set);
  }
  const matrix = ORBIT_PLANET_MATRIX[starType] || ORBIT_PLANET_MATRIX.G;
  const set = {};
  for (let i = 0; i < matrix.length; i++) {
    for (let j = 0; j < matrix[i].length; j++) set[matrix[i][j]] = true;
  }
  return Object.keys(set);
}

function getAllowedOrbitsForType(starType, planetType) {
  const orbits = [];
  if (typeof S !== 'undefined' && (S.stage === 'firstPlanet' || S.stage === 'system')) {
    for (let i = 0; i < STANDARD_ORBIT_MATRIX.length; i++) {
      if (STANDARD_ORBIT_MATRIX[i].indexOf(planetType) !== -1) orbits.push(i);
    }
    return orbits;
  }
  const matrix = ORBIT_PLANET_MATRIX[starType] || ORBIT_PLANET_MATRIX.G;
  for (let i = 0; i < matrix.length; i++) {
    if (matrix[i].indexOf(planetType) !== -1) orbits.push(i);
  }
  return orbits;
}

// ─── ВТОРЖЕНИЯ ───
const INVASION_CFG = {
  intervalMin: 2 * 60 * 60 * 1000,  // 2 часа — попытки вторжений чаще, но шанс отбития решает
  intervalMax: 5 * 60 * 60 * 1000,  // 5 часов
  chance: 1.0,                      // попытка всегда; отбитие считает invasionRepelChance()

  shipsBase: 3,   // Базовое число кораблей вторжения
  shipsMax: 5,    // Максимум кораблей
  robberyDuration: 45 * 60 * 1000, destructionDuration: 15 * 60 * 1000, totalDuration: 60 * 60 * 1000,
  planetMaxHP: 100, hitRadius: 20,
  // ★ Урон вторжений (v2): измеряется в МИНУТАХ экономики, а не в xN дохода/сек.
  // theftMin — сколько минут дохода уносит; debuffPct/debuffHours — штраф к доходу;
  // targets — сколько планет атакуется одновременно; disablePlanets/disableHours — простой.
  tiers: {
    scout:  { difficulty: 1, weight: 0.55, targets: 1, theftMin: 25, debuffPct: 0.15, debuffHours: 2, disablePlanets: 1, disableHours: 1.5, label: 'Лёгкое (1)', shipsMin: 1, shipsMax: 3, powerMin: 0.6, powerMax: 1.2, shipTypes: ['fighter', 'fighter', 'corvette'] },
    raid:   { difficulty: 2, weight: 0.30, targets: 2, theftMin: 50, debuffPct: 0.25, debuffHours: 3, disablePlanets: 2, disableHours: 2, label: 'Среднее (2)', shipsMin: 3, shipsMax: 6, powerMin: 0.9, powerMax: 1.8, shipTypes: ['fighter', 'corvette', 'corvette', 'frigate'] },
    siege:  { difficulty: 3, weight: 0.15, targets: 3, theftMin: 90, debuffPct: 0.35, debuffHours: 5, disablePlanets: 3, disableHours: 3, label: 'Тяжёлое (3)', shipsMin: 5, shipsMax: 9, powerMin: 1.2, powerMax: 2.4, shipTypes: ['corvette', 'frigate', 'frigate', 'dread'] },
  },
  // ★ Типы кораблей вторжения (как корабли флота). hp/damage — база,
  //   в спавне масштабируются случайной мощностью эскадры и сложностью.
  shipTypes: {
    fighter:  { name: 'Истребитель', hp: 45,  damage: 2,  speed: 1.10, size: 0.80, color: '#ff6b6b', bounty: { metals: 25,  dust: 800,   energy: 300,  civ: 0.01 } },
    corvette: { name: 'Корвет',     hp: 90,  damage: 4,  speed: 0.90, size: 1.00, color: '#ff9944', bounty: { metals: 70,  dust: 2200,  energy: 900,  civ: 0.03 } },
    frigate:  { name: 'Фрегат',     hp: 160, damage: 7,  speed: 0.70, size: 1.25, color: '#ff4fd8', bounty: { metals: 180, dust: 6000,  energy: 2500, civ: 0.08 } },
    dread:    { name: 'Дредноут',   hp: 320, damage: 12, speed: 0.50, size: 1.60, color: '#b23bff', bounty: { metals: 450, dust: 16000, energy: 7000, civ: 0.20 } },
  },
  // ★ Ручное уничтожение вторжения: урон клика и бонусные ресурсы.
  manual: {
    clickDamageBase: 22,
    clickDamagePerDefenseLevel: 14,
    clickDamagePerFleetDps: 0.35,
    clickDamageMax: 260,
    rewardMult: 1.0,
    difficultyBonus: { 1: 1.0, 2: 1.6, 3: 2.4 },
    messageCooldownMs: 2500,
  },
  // ★ Вражеский огонь по флоту: пока эскадра жива, она повреждает корабли игрока.
  enemyFire: {
    perShipDamagePerSec: 0.9,
    capDamagePerSec: 6,
    notifyShipLoss: true,
  },
  // ★ Шанс отбить вторжение: уровни обороны + вклад флота, общий кап 80%.
  repelDefensePerLevel: 0.10,      // 10% за уровень, ур.5 = 50%
  repelFleetMetalsPerPercent: 500, // +1 п.п. за каждые 500 ⚙ стоимости флота
  repelFleetCap: 0.30,             // флот добавляет не более +30 п.п.
  repelTotalCap: 0.80,             // потолок, чтобы щит за Stars оставался смыслом
  debuffStackCap: 0.80,            // суммарный штраф к доходу не более -80%
  nightLossCapShare: 0.40,         // за офлайн-сессию не более 40% каждой валюты
  nightCapHours: 4,                // и не более 4 часов прогресса
  planetDisabledHours: 2,          // сколько планета простаивает после повреждения
  repairCostShare: 0.15,           // ремонт планеты стоит 15% её цены в пыли
  defenseHours: 10,                // ★ активная Автоборона живёт 10 ч (щит за Stars — отдельно, 24 ч)
  defenseCost: [0, 150, 350, 750, 1500, 3000],
  defenseCostMultiplierPerSystem: 0.15, // +15% к цене за каждую систему свыше 1
  expeditionDefensePenalty: 0.15,
  offlineAttackInterval: 3 * 60 * 60 * 1000, offlineAttackMax: 5, offlineAttackPerSystems: 3,

  // ★ ЗАПУСТЕНИЕ ГАЛАКТИКИ.
  // Чем дольше игрок не заходит, тем жёстче офлайн-атаки: больше волн,
  // выше кап потерь, дольше простой планет и системы целиком.
  // Это осознанное наказание за «забыл про галактику», а не просто кража.
  neglect: {
    thresholdHours: 72,            // до 3 суток отсутствия — обычные правила, штраф не начисляется
    hoursPerLevel: 24,             // +1 уровень за каждые следующие сутки (3 дня = ур.1, 7 дней = ур.5)
    maxLevel: 5,
    attacksPerLevel: 1,            // +1 атака за уровень запустения
    maxAttacks: 12,                // жёсткий потолок, чтобы длинный отпуск не убивал всё
    theftMinutesPerLevel: 25,      // +25 минут экономики к краже за уровень
    theftMinutesCap: 180,          // но не больше 3 часов экономики за один удар
    lossCapSharePerLevel: 0.08,    // 40% -> до 80% каждой валюты
    lossCapShareMax: 0.80,
    planetDisablePerLevel: 1,      // дополнительные планеты в простой
    systemDamageFromLevel: 2,      // с ур.2 (≈4 суток) начинают выводиться из строя целые системы
    systemsDamagedPerLevel: 1,     // N повреждённых систем = уровень запустения
    systemDamageHoursBase: 2,
    systemDamageHoursPerLevel: 2,
    systemDamageHoursMax: 24,      // максимум сутки простоя системы
    debuffPctPerLevel: 0.03,       // дополнительный штраф к доходу
    debuffHoursPerLevel: 2,
    debuffHoursMax: 12,
  },
};

// ─── НОЧНОЙ РЕЖИМ ───
const NIGHT_CFG = {
  presets: {
    cautious: { cometHours: 0, expPercent: 0 },
    balanced: { cometHours: 3, expPercent: 30 },
    aggressive: { cometHours: 6, expPercent: 70 },
    insane: { cometHours: 8, expPercent: 100 },
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
  shield: { hours: 8, costMetals: 600 },
  booster: { hours: 2, costMetals: 600, incomeMult: 2.0 },
};

// ─── МИССИИ ───
const MISSIONS_CFG = {
  cometFlightBase: 5 * 60 * 1000, cometFlightMinMult: 1.0, cometFlightMaxMult: 3.0,
  cometRewardBase: 1000000, cometRewardPerPlanet: 0.15, cometFailChance: 0.20,
  cometRewardMult: 1.35,       // ★ награда = стоимость кометы * 1.35 (EV +8% при fail 20%)
  cometDamageRange: 2.5, cometDamageChance: 0.35,
  expeditionCostBase: 3000, expeditionCostRatio: 1.5,
  expeditionFlightMin: 10 * 60 * 1000, expeditionFlightMax: 20 * 60 * 1000,
  expeditionRewardBase: 2000000, expeditionRewardPerPlanet: 0.25, expeditionFailChance: 0.25,
  expeditionRewardShare: 0.5,  // ★ награда = доход * 0.5 * время полёта (EV x1.375)
  expeditionEnergySeconds: 300, // ★ цена = 5 минут дохода энергии
  colonyChance: 0.03, colonyEnergyCost: 50000, colonyEnergyRatio: 2, colonyCivCost: 50, colonyCivRatio: 1.8,
};

// ─── МАГАЗИН СИСТЕМ ───
const SYSTEM_SHOP_CFG = {
  dustSeconds: 1800, energyCapShare: 0.5, civCapShare: 0.4,
  shopEnergySeconds: 1800, shopCivSeconds: 900, // ★ цена шкал = 30/15 мин дохода, а не % капа
  // ★ Энергия и цивилизация больше не дают планет/дохода: только шанс,
  //   что система окажется «живой». Полный залив двух шкал = 100% от этого.
  lifeChanceFull: 0.60,
  colonyChanceFull: 0.60, // алиас для старых вызовов
  gasChance: 0.30,
  batchMax: 50, // максимум систем за одну покупку (ползунок)
  primeChance: 0,
};
// ★ Множитель престижа: раньше ×2.0 за вспышку — на 12-й галактике
//   получалось ×2048, и доход улетал в космос. Теперь шаг мягче (×1.3)
//   плюс потолок: 12-я галактика ≈ ×23, 20-я ≈ ×190, 30-я ≈ ×2.6К.
const PRESTIGE_CFG = {
  firstRequirement: 10,
  stepMultiplier: 1.4,
  multiplierPerGalaxy: 1.3,
  multiplierCap: 1e6,
  requirements: [10, 50, 150, 450, 1350, 4050]
};

// ═══════════════════════════════════════════════════════════════
//  LOD ГАЛАКТИКИ
//  Уровень 4 — отдельные звёзды (мало систем),
//  3 — туманности (10 систем / объект),
//  2 — созвездия (50 систем / объект),
//  1 — скопления (150 систем / объект),
//  0 — сверхскопления (450 систем / объект).
//  Пороги общие для отрисовки, квестов и престижа.
// ═══════════════════════════════════════════════════════════════
const GALAXY_LOD_CFG = {
  mergeThresholds: [10, 50, 150, 450],
  levels: [
    { level: 4, minSystems: 1,   groupSize: 1,   kind: 'star',          label: 'Звёзды' },
    { level: 3, minSystems: 10,  groupSize: 10,  kind: 'nebula',        label: 'Туманность' },
    { level: 2, minSystems: 50,  groupSize: 50,  kind: 'constellation', label: 'Созвездие' },
    { level: 1, minSystems: 150, groupSize: 150, kind: 'cluster',       label: 'Скопление' },
    { level: 0, minSystems: 450, groupSize: 450, kind: 'supercluster',  label: 'Сверхскопление' },
  ],
};

// Базовый (самый подробный безопасный) уровень для текущего числа систем.
function galaxyLodForTotal(total) {
  const n = Math.max(1, Number(total) || 1);
  if (n >= 450) return 0;
  if (n >= 150) return 1;
  if (n >= 50) return 2;
  if (n >= 10) return 3;
  return 4;
}

function galaxyGroupSizeForLevel(level) {
  const lvl = Math.max(0, Math.min(4, Math.floor(Number(level) || 0)));
  for (let i = 0; i < GALAXY_LOD_CFG.levels.length; i++) {
    if (GALAXY_LOD_CFG.levels[i].level === lvl) return GALAXY_LOD_CFG.levels[i].groupSize;
  }
  return 1;
}

function galaxyLodMeta(level) {
  const lvl = Math.max(0, Math.min(4, Math.floor(Number(level) || 0)));
  for (let i = 0; i < GALAXY_LOD_CFG.levels.length; i++) {
    if (GALAXY_LOD_CFG.levels[i].level === lvl) return GALAXY_LOD_CFG.levels[i];
  }
  return GALAXY_LOD_CFG.levels[0];
}

function galaxyMacroGroupCount(total, level) {
  const n = Math.max(1, Number(total) || 1);
  const size = galaxyGroupSizeForLevel(level);
  return Math.max(1, Math.ceil(n / size));
}

// Предохранитель: при >450 систем ручной LOD 4 (1000+ звёзд) запрещён.
// LOD 3 — туманности, максимум ~N/10 объектов, что безопасно для Canvas.
function galaxyMaxLodForTotal(total) {
  return (Number(total) || 1) > 450 ? 3 : 4;
}

function clampGalaxyLodForTotal(level, total) {
  const maxLod = galaxyMaxLodForTotal(total);
  return Math.max(0, Math.min(maxLod, Math.floor(Number(level) || 0)));
}

// Множитель дохода за уровень вспышки (0 — вспышек ещё не было).
// Единственный источник истины: и сейв, и окно престижа считают отсюда.
function prestigeMultiplierFor(level) {
  const lvl = Math.max(0, Math.floor(Number(level) || 0));
  const step = Number(PRESTIGE_CFG.multiplierPerGalaxy) || 1.3;
  const cap = Number(PRESTIGE_CFG.multiplierCap) || 1e6;
  const mult = Math.pow(step, lvl);
  return isFinite(mult) ? Math.min(cap, mult) : cap;
}
const METALS_CFG = { expeditionCostMetals: 200, cometBoostCostMetals: 100, cometBoostSurvival: 0.3, colonyCostMetals: 500,
  capBase: 750, capGrowth: 2.0,            // ★ кап металлов: 750 x 2^(уровень хранилища-1)
  capStorage: 'energy' };

// ═══════════════════════════════════════════════════════════════
//  ★ ЭКОНОМИКА ИМПЕРИИ (доход со ВСЕХ систем)
//  Доход больше не зависит от того, какая система открыта: каждая
//  система игрока даёт пыль/энергию/цив/металлы сама за себя.
// ═══════════════════════════════════════════════════════════════
const ECONOMY_CFG = {
  // Прайм-бонусы (dustMult/allMult/energyMult) складываются со ВСЕХ
  // прайм-систем, но с затуханием:
  //   итог = 1 + min(primeBonusCap, Σбонусов × primeBonusWeight)
  primeBonusWeight: 0.20,   // ★ нерф -50%: прайм-бонус вдвое слабее (аудит монетизации)
  primeBonusCap: 1.50,          // потолок: +150% (т.е. максимум ×2.5)

  // Кап металлов = max(750 × 2^(ур.хранилища-1), доход × 3600 × metalsCapHours)
  // Чтобы «медленный» ресурс не упирался в потолок при росте империи.
  metalsCapHours: 2,

  // ─── ДИНАМИЧЕСКИЕ ЦЕНЫ ─────────────────────────────────────────
  // Цена = max(базовая, доход/час × priceHours). Игрок считает не
  // «3000 ⚙», а «столько-то часов добычи» — ресурсы распределяются осознанно.
  priceHours: {
    // Автоборона: часы металлодобычи по уровням 1..5 (держится defenseHours = 10 ч)
    defense: [0, 0.15, 0.35, 0.70, 1.20, 2.00],
    // Верфь: часы металлодобычи за ОДИН корабль
    fleet: { interceptor: 0.25, cruiser: 0.75, dreadnought: 2.00 },
    // Экспедиция: часы металлодобычи за запуск (×дальность)
    expedition: 0.15,
  },

  // Содержание АКТИВНОГО флота: доля металлодобычи в секунду.
  // Вес корабля: перехватчик 1, крейсер 3, дредноут 8; за каждую единицу
  // веса — fleetUpkeepPerPower дохода, но не более fleetUpkeepCap.
  // 0 — флот содержать бесплатно.
  fleetUpkeepPerPower: 0.015,
  fleetUpkeepCap: 0.60,
};

// ─── ФЛОТ (Верфь) ───
const FLEET_CFG = {
  ships: {
    interceptor: { name: 'Перехватчик', costMetals: 500,  costEnergy: 1000,  costCiv: 5,  damage: 4,  fireRate: 1.2, hp: 20 },
    cruiser:     { name: 'Крейсер',     costMetals: 2000, costEnergy: 4000,  costCiv: 20, damage: 12, fireRate: 0.7, hp: 60 },
    dreadnought: { name: 'Дредноут',    costMetals: 8000, costEnergy: 16000, costCiv: 80, damage: 40, fireRate: 0.4, hp: 200 },
  },
  shotLifetimeMs: 350,
  // ★ Флот больше не требует активации: купленные корабли всегда на службе
  //   и всегда отображаются в игре. activationDefenseLevel оставлен для
  //   совместимости старого сейва/тестов, но больше не блокирует флот.
  alwaysActive: true,
  activationDefenseLevel: 0,
  // HP одного корабля вторжения (автооборона флотом тратит урон в HP).
  invaderShipHp: 100,
  // ★ Визуал флагмана и перелёты к атакованной цели.
  flagshipBaseRadius: 10,
  flagshipRadiusPerShip: 0.15,
  flagshipMaxRadius: 22,
  travelSpeedPxPerSec: 45,
  travelMinSec: 4,
  travelMaxSec: 20,
};
const STAR_WEIGHTS = { M: 60, K: 15, G: 10, A: 10, B: 5 };

// ─── СУНДУКИ ───
const CHEST_CFG = {
  costStars: 200,
  shieldStars: 100,
  lootTable: [
    { key: 'blackHole', weight: 20 }, { key: 'pulsar', weight: 20 }, { key: 'wormhole', weight: 20 },
    { key: 'quasar', weight: 10 }, { key: 'magnetar', weight: 10 }, { key: 'gravLens', weight: 10 },
    { key: 'massiveBH', weight: 4 }, { key: 'superBH', weight: 2 }, { key: 'darkMatter', weight: 2 },
    { key: 'quarkVoid', weight: 1 }, { key: 'primeBH', weight: 1 },
  ]
};

// ─── СЛУЧАЙНЫЕ СОБЫТИЯ ───
// Единая подсистема: ежедневные события (интерактивные, мгновенные и
// «мировые» баффы/дебаффы) и суточные «убер»-события (выпадают раз в неделю).
// Всё, что раньше было отдельными «глобальными событиями», теперь живёт здесь.
//
// kind: boss   — босс, тапы + урон флота, таймер
//       tap    — только тапы
//       good   — мгновенная награда
//       bad    — мгновенный штраф
//       world  — временный мировой модификатор (mods)
//       choice — выбор из 2–3 вариантов (риск/награда)
// mods: allMult / dustMult / energyMult / civMult / metalsMult / clickMult /
//       cometMult / expeditionMult — перемножаются для всех активных событий.
const EVENTS_CFG = {
  daily: {
    chance: 0.7,          // шанс события в сутки (один бросок на день)
    minStage: 'system',   // не спавним раньше системы
    pool: [
      // ── БОССЫ ──────────────────────────────────────────────────
      { id: 'leviathan', kind: 'boss', weight: 6, icon: '🐙', color: '#ff6b6b', title: 'Космический Левиафан', desc: 'Огромный организм атакует систему. Уничтожьте его!', hp: 900, tapDamage: 6, timeLimit: 60, reward: { dust: 50000, dustHours: 1, metals: 300 }, penalty: { destroyPlanets: 1 } },
      { id: 'wandering_bh', kind: 'boss', weight: 4, icon: '🕳️', color: '#b9a8ff', title: 'Блуждающая Чёрная Дыра', desc: 'Искажает пространство и пожирает планеты.', hp: 1800, tapDamage: 3, timeLimit: 90, reward: { dust: 100000, dustHours: 2 }, penalty: { destroyPlanets: 1 } },
      { id: 'wandering_magnetar', kind: 'boss', weight: 5, icon: '🧲', color: '#7ec8e3', title: 'Блуждающий Магнетар', desc: 'Магнитное поле высасывает энергию из систем.', hp: 1400, tapDamage: 4, timeLimit: 75, reward: { energy: 5000, energyHours: 2 }, penalty: { energyPct: 0.5 } },
      { id: 'void_kraken', kind: 'boss', weight: 3, icon: '🦑', color: '#8b7fd4', title: 'Кракен Пустоты', desc: 'Щупальца тянутся к вашим планетам.', hp: 2500, tapDamage: 3, timeLimit: 100, reward: { dust: 120000, dustHours: 2, metals: 800 }, penalty: { disablePlanetHours: 2 } },
      { id: 'rogue_dreadnought', kind: 'boss', weight: 3, icon: '🛸', color: '#ff9944', title: 'Мятежный дредноут', desc: 'Автономный корабль-убийца вышел на охоту.', hp: 2200, tapDamage: 4, timeLimit: 90, reward: { metals: 1500, energy: 8000 }, penalty: { metalsPct: 0.25 } },
      { id: 'crystal_tyrant', kind: 'boss', weight: 2, icon: '💎', color: '#7ee0a8', title: 'Кристаллический тиран', desc: 'Живой кристалл поглощает свет звёзд.', hp: 3200, tapDamage: 2, timeLimit: 120, reward: { dust: 180000, dustHours: 3, civ: 3 }, penalty: { destroyPlanets: 1 } },

      // ── АКТИВНЫЕ УГРОЗЫ (ТОЛЬКО ТАПЫ) ─────────────────────────
      { id: 'meteor_shower', kind: 'tap', weight: 6, icon: '☄️', color: '#ffb347', title: 'Метеоритный дождь', desc: 'Тапайте, чтобы сбить осколки!', tapsRequired: 50, timeLimit: 60, reward: { dust: 5000, dustHours: 0.5 }, penalty: { disablePlanetHours: 1 } },
      { id: 'pirate_raid', kind: 'tap', weight: 5, icon: '🏴‍☠️', color: '#ff9944', title: 'Пиратский налёт', desc: 'Отгоните рейдеров тапами!', tapsRequired: 40, timeLimit: 55, reward: { metals: 700 }, penalty: { metalsPct: 0.15 } },
      { id: 'nanite_swarm', kind: 'tap', weight: 4, icon: '🦠', color: '#7ee0a8', title: 'Рой нанитов', desc: 'Сожмите рой, пока он не сожрал энергию.', tapsRequired: 70, timeLimit: 70, reward: { energy: 4000 }, penalty: { energyPct: 0.3 } },
      { id: 'solar_flare_tap', kind: 'tap', weight: 4, icon: '🔥', color: '#ffcc55', title: 'Солнечная вспышка', desc: 'Сбейте плазменные выбросы тапами!', tapsRequired: 60, timeLimit: 65, reward: { dust: 20000, energy: 2000 }, penalty: { worldEvent: 'dust_drought', durationHours: 2 } },

      // ── МГНОВЕННЫЕ НАГРАДЫ ─────────────────────────────────────
      { id: 'derelict_ship', kind: 'good', weight: 8, icon: '🚀', color: '#7ec8e3', title: 'Заброшенный корабль', desc: 'Найден старый крейсер. Металл ещё пригодится.', reward: { metals: 500, metalsHours: 1 } },
      { id: 'supply_convoy', kind: 'good', weight: 7, icon: '📦', color: '#7ee0a8', title: 'Караван снабжения', desc: 'Торговый конвой сбросил контейнеры с энергией.', reward: { energy: 3000, energyHours: 1 } },
      { id: 'ancient_cache', kind: 'good', weight: 6, icon: '🗝️', color: '#ffcc55', title: 'Древний тайник', desc: 'В астероиде спрятан запас пыли.', reward: { dust: 25000, dustHours: 1 } },
      { id: 'refugee_fleet', kind: 'good', weight: 5, icon: '🛖', color: '#b9a8ff', title: 'Флот беженцев', desc: 'Беженцы просят убежища и вливаются в цивилизацию.', reward: { civ: 3, civHours: 4 } },
      { id: 'comet_shard', kind: 'good', weight: 6, icon: '🌠', color: '#7ec8e3', title: 'Осколок кометы', desc: 'Обломок кометы упал прямо в систему.', reward: { dust: 15000, dustHours: 1 } },
      { id: 'trophy_beacon', kind: 'good', weight: 1, icon: '🏆', color: '#ffcc55', title: 'Трофейный маяк', desc: 'Сигнал древнего контракта. Награда ждёт.', reward: { trophy: 'insane' } },
      { id: 'gas_cloud', kind: 'good', weight: 5, icon: '🌫️', color: '#7ec8e3', title: 'Газовое облако', desc: 'Плотное облако можно переработать в топливо.', reward: { energy: 2000, metals: 300 } },
      { id: 'quantum_lab', kind: 'good', weight: 4, icon: '🔬', color: '#b9a8ff', title: 'Квантовая лаборатория', desc: 'Брошенная станция с работающим реактором.', reward: { civ: 2, energy: 1500 } },
      { id: 'scavenger_haul', kind: 'good', weight: 5, icon: '🛠️', color: '#ffb347', title: 'Улов мусорщиков', desc: 'Разобранный корпус дал много металла.', reward: { metals: 1000 } },

      // ── МГНОВЕННЫЕ ШТРАФЫ ──────────────────────────────────────
      { id: 'reactor_meltdown', kind: 'bad', weight: 3, icon: '⚠️', color: '#ff5e5e', title: 'Расплавление реактора', desc: 'Скачок напряжения сжёг часть запасов энергии.', penalty: { energyPct: 0.25 } },
      { id: 'smuggler_tax', kind: 'bad', weight: 4, icon: '💰', color: '#ff9944', title: 'Налог контрабандистов', desc: 'Контрабандисты забрали часть металла «за проход».', penalty: { metalsPct: 0.2 } },
      { id: 'corsair_raid', kind: 'bad', weight: 4, icon: '⚔️', color: '#ff5e5e', title: 'Корсарский рейд', desc: 'Одна из планет выведена из строя на час.', penalty: { disablePlanetHours: 1 } },
      { id: 'ion_storm_raid', kind: 'bad', weight: 3, icon: '🌩️', color: '#8b7fd4', title: 'Ионный шторм', desc: 'Помехи снижают выработку энергии на 3 часа.', penalty: { worldEvent: 'energy_leak', durationHours: 3 } },
      { id: 'dust_drought_raid', kind: 'bad', weight: 3, icon: '🌵', color: '#ffb347', title: 'Пылевая засуха', desc: 'Потоки пыли ослабевают на 3 часа.', penalty: { worldEvent: 'dust_drought', durationHours: 3 } },

      // ── МИРОВЫЕ БАФФЫ И ДЕБАФФЫ ────────────────────────────────
      { id: 'trade_boom', kind: 'world', weight: 6, icon: '📈', color: '#7ee0a8', title: 'Торговый бум', desc: 'Доход пыли +60% на 2 часа.', durationHours: 2, mods: { dustMult: 1.6 } },
      { id: 'solar_wind', kind: 'world', weight: 5, icon: '💨', color: '#7ec8e3', title: 'Солнечный ветер', desc: 'Выработка энергии +80% на 2 часа.', durationHours: 2, mods: { energyMult: 1.8 } },
      { id: 'renaissance', kind: 'world', weight: 4, icon: '🎭', color: '#b9a8ff', title: 'Ренессанс', desc: 'Рост цивилизации +100% на 3 часа.', durationHours: 3, mods: { civMult: 2.0 } },
      { id: 'forge_fever', kind: 'world', weight: 4, icon: '⚒️', color: '#ffb347', title: 'Кузнечная лихорадка', desc: 'Добыча металла +100% на 3 часа.', durationHours: 3, mods: { metalsMult: 2.0 } },
      { id: 'lucky_star', kind: 'world', weight: 3, icon: '🍀', color: '#ffcc55', title: 'Счастливая звезда', desc: 'Награды комет +100% на 4 часа.', durationHours: 4, mods: { cometMult: 2.0 } },
      { id: 'golden_hour', kind: 'world', weight: 3, icon: '🌟', color: '#ffcc55', title: 'Золотой час', desc: 'Весь доход +40% на 1 час.', durationHours: 1, mods: { allMult: 1.4 } },
      { id: 'neural_boost', kind: 'world', weight: 4, icon: '🧠', color: '#b9a8ff', title: 'Нейроусиление', desc: 'Доход от кликов +100% на 2 часа.', durationHours: 2, mods: { clickMult: 2.0 } },
      { id: 'dust_drought', kind: 'world', weight: 2, icon: '🌵', color: '#ff9944', title: 'Пылевая засуха', desc: 'Доход пыли −35% на 3 часа.', durationHours: 3, mods: { dustMult: 0.65 } },
      { id: 'energy_leak', kind: 'world', weight: 2, icon: '🕳️', color: '#8b7fd4', title: 'Утечка энергии', desc: 'Выработка энергии −40% на 3 часа.', durationHours: 3, mods: { energyMult: 0.6 } },

      // ── ВЫБОР (РИСК / НАГРАДА) ─────────────────────────────────
      {
        id: 'distress_signal', kind: 'choice', weight: 5, icon: '📡', color: '#7ec8e3', title: 'Сигнал бедствия',
        desc: 'Неизвестный корабль просит о помощи. Ответить?',
        options: [
          { id: 'help', label: 'Помочь', desc: 'Потратить 10% энергии. Шанс 65% на большой куш.', cost: { energyPct: 0.1 }, chance: 0.65, success: { dust: 60000, dustHours: 2, metals: 500 }, fail: { energyPct: 0.15 } },
          { id: 'ignore', label: 'Игнорировать', desc: 'Без риска и без награды.', chance: 1, success: {} }
        ]
      },
      {
        id: 'black_market', kind: 'choice', weight: 4, icon: '🕶️', color: '#ff9944', title: 'Чёрный рынок',
        desc: 'Торговец предлагает ящик «неизвестного происхождения».',
        options: [
          { id: 'buy', label: 'Купить (800 ⚙)', desc: '70% — редкая добыча, 30% — пустышка.', cost: { metals: 800 }, chance: 0.7, success: { dust: 75000, dustHours: 2, civ: 1 }, fail: { metalsPct: 0.1 } },
          { id: 'pass', label: 'Пройти мимо', desc: 'Лучше не связываться.', chance: 1, success: {} }
        ]
      },
      {
        id: 'ancient_artifact', kind: 'choice', weight: 3, icon: '🗿', color: '#b9a8ff', title: 'Древний артефакт',
        desc: 'В обломках найден странный монолит. Что с ним делать?',
        options: [
          { id: 'study', label: 'Изучить (3000 ⚡)', desc: '55% — прорыв в цивилизации, 45% — выброс энергии.', cost: { energy: 3000 }, chance: 0.55, success: { civ: 5, civHours: 8, dust: 30000 }, fail: { disablePlanetHours: 2 } },
          { id: 'sell', label: 'Продать', desc: 'Гарантированно получить пыль.', chance: 1, success: { dust: 20000, dustHours: 1 } }
        ]
      }
    ]
  },

  weekly: {
    durationHours: 24,
    pool: [
      { id: 'week_golden_age', weight: 6, icon: '🌟', color: '#ffcc55', title: 'День Золотого века', desc: 'Весь доход ×2 на 24 часа. Лучшее время для экспансии!', durationHours: 24, mods: { allMult: 2.0 } },
      { id: 'week_comet', weight: 5, icon: '☄️', color: '#7ec8e3', title: 'День Комет', desc: 'Награды комет ×3, весь доход +25% на 24 часа.', durationHours: 24, mods: { cometMult: 3.0, allMult: 1.25 } },
      { id: 'week_forge', weight: 5, icon: '⚒️', color: '#ffb347', title: 'День Кузни', desc: 'Добыча металла ×3 и весь доход +10% на 24 часа.', durationHours: 24, mods: { metalsMult: 3.0, allMult: 1.1 } },
      { id: 'week_mind', weight: 5, icon: '🧠', color: '#b9a8ff', title: 'День Разума', desc: 'Рост цивилизации ×3, энергия ×1.5 на 24 часа.', durationHours: 24, mods: { civMult: 3.0, energyMult: 1.5 } },
      { id: 'week_storm', weight: 4, icon: '🌪️', color: '#8b7fd4', title: 'День Штормов', desc: 'Пыль ×2.5, но энергия ×0.8. Дерзкое время.', durationHours: 24, mods: { dustMult: 2.5, energyMult: 0.8 } },
      { id: 'week_void', weight: 4, icon: '🕳️', color: '#8b7fd4', title: 'День Пустоты', desc: 'Клики ×5, пассивная пыль ×0.8 на 24 часа.', durationHours: 24, mods: { clickMult: 5.0, dustMult: 0.8 } },
      { id: 'week_wanderers', weight: 4, icon: '🚀', color: '#7ee0a8', title: 'День Странников', desc: 'Награды экспедиций ×2.5, комет ×1.5 на 24 часа.', durationHours: 24, mods: { expeditionMult: 2.5, cometMult: 1.5 } },
      { id: 'week_harvest', weight: 5, icon: '🌾', color: '#ffb347', title: 'День Урожая', desc: 'Пыль +80%, кометы +50% на 24 часа.', durationHours: 24, mods: { dustMult: 1.8, cometMult: 1.5 } },
      { id: 'week_singularity', weight: 2, icon: '✨', color: '#ffffff', title: 'Полдня Сингулярности', desc: 'RARE! Весь доход ×3, но только 12 часов.', durationHours: 12, mods: { allMult: 3.0 } },
      { id: 'week_plague', weight: 2, icon: '🦠', color: '#7ee0a8', title: 'День Чумы', desc: 'Доход ×0.65, зато металл ×2.5. Переживите её.', durationHours: 24, mods: { allMult: 0.65, metalsMult: 2.5 } },
      { id: 'week_fortune', weight: 3, icon: '🍀', color: '#7ee0a8', title: 'День Фортуны', desc: 'Клики ×3, весь доход +30% на 24 часа.', durationHours: 24, mods: { clickMult: 3.0, allMult: 1.3 } },
      { id: 'week_black_market', weight: 3, icon: '🕶️', color: '#ff9944', title: 'День Чёрного рынка', desc: 'Металл ×2, клики ×2 на 24 часа.', durationHours: 24, mods: { metalsMult: 2.0, clickMult: 2.0 } },

      // ── НЕГАТИВНЫЕ СУТОЧНЫЕ СОБЫТИЯ ──────────────────────────────
      { id: 'week_taxes', weight: 3, icon: '💸', color: '#ff5e5e', title: 'День Налогов', desc: 'Империя вводит поборы: весь доход ×0.8, пыль ×0.7 на 24 часа.', durationHours: 24, mods: { allMult: 0.8, dustMult: 0.7 } },
      { id: 'week_famine', weight: 2, icon: '🍂', color: '#ff9944', title: 'День Голода', desc: 'Пыль ×0.55, энергия ×0.8, цивилизация ×0.8. Переживите спад.', durationHours: 24, mods: { dustMult: 0.55, energyMult: 0.8, civMult: 0.8 } },
      { id: 'week_darkness', weight: 2, icon: '🌑', color: '#8b7fd4', title: 'День Тьмы', desc: 'Энергия ×0.5, кометы ×0.6, клики ×0.7 на 24 часа.', durationHours: 24, mods: { energyMult: 0.5, cometMult: 0.6, clickMult: 0.7 } },
      { id: 'week_discord', weight: 3, icon: '⚔️', color: '#ff5e5e', title: 'День Раздора', desc: 'Весь доход ×0.85, клики ×0.6. Смутное время.', durationHours: 24, mods: { allMult: 0.85, clickMult: 0.6 } },

      // ── СМЕШАННЫЕ СУТОЧНЫЕ СОБЫТИЯ (ПЛЮС И МИНУС) ───────────────
      { id: 'week_titanforge', weight: 3, icon: '🏗️', color: '#ffb347', title: 'День Титанов', desc: 'Металл ×3, но энергия ×0.7 на 24 часа.', durationHours: 24, mods: { metalsMult: 3.0, energyMult: 0.7 } },
      { id: 'week_echo', weight: 3, icon: '📡', color: '#7ec8e3', title: 'День Эха', desc: 'Кометы ×3, но пыль ×0.8 на 24 часа.', durationHours: 24, mods: { cometMult: 3.0, dustMult: 0.8 } },
      { id: 'week_war', weight: 2, icon: '🪖', color: '#ff9944', title: 'День Войны', desc: 'Металл ×2.5, но весь доход ×0.75. Кузница победы.', durationHours: 24, mods: { metalsMult: 2.5, allMult: 0.75 } }
    ]
  },

  limits: {
    maxWorldEvents: 5,
    primeProtected: true
  }
};

// Совместимость со старыми названиями (внешние скрипты/тесты).
const RANDOM_EVENTS = EVENTS_CFG.daily.pool;
const EVENT_CFG = EVENTS_CFG;

// ═══════════════════════════════════════════════════════════════
//  ГЕНЕРАТОРЫ СИСТЕМ И ЗВЕЗД
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
  const weights = STAR_WEIGHTS;
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
  
  // Реалистичное распределение: у звезды планеты есть чаще, на окраинах — реже
  const spawnChances = [0.95, 0.85, 0.70, 0.50, 0.40, 0.25, 0.15, 0.05];

  for (let i = 0; i < 8; i++) {
    let pool = getAllowedTypesAtOrbit(starType, i);
    
    if (isColony) {
      pool = pool.filter(function(t) { return PLANET_TYPES[t] && PLANET_TYPES[t].civ; });
      if (pool.length === 0) continue;
    }
    if (pool.length === 0) continue;
    
    // Бросаем кубик на появление планеты
    if (Math.random() > spawnChances[i]) continue;
    
    const type = pool[Math.floor(Math.random() * pool.length)];
    const orbitR = getOrbitR(i);
    planets.push({
      type: type, angle: Math.random() * Math.PI * 2, speed: 0.2 / Math.pow(orbitR / 90, 1.5),
      baseOrbitR: orbitR, orbitR: orbitR, driftPhase: Math.random() * Math.PI * 2,
      rotation: Math.random() * Math.PI * 2, seed: Math.random() * 1e6,
      forming: false, formUntil: 0, mass: planetMass(type), diameter: planetDiameter(type),
      moons: [], precession: 0, trueAnomaly: 0,
    });
  }

  // Если вдруг вообще ничего не выпало (шанс ~0.1%), даем хотя бы одну планету у звезды
  if (planets.length === 0) {
    const orbitR = getOrbitR(0);
    const pool = getAllowedTypesAtOrbit(starType, 0);
    if (pool.length > 0) {
      const type = pool[0];
      planets.push({
        type: type, angle: Math.random() * Math.PI * 2, speed: 0.2 / Math.pow(orbitR / 90, 1.5),
        baseOrbitR: orbitR, orbitR: orbitR, driftPhase: Math.random() * Math.PI * 2,
        rotation: Math.random() * Math.PI * 2, seed: Math.random() * 1e6,
        forming: false, formUntil: 0, mass: planetMass(type), diameter: planetDiameter(type),
        moons: [], precession: 0, trueAnomaly: 0,
      });
    }
  }
  
  return {
    name: generateSystemName(),
    starType: starType, systemType: systemType, planets: planets,
  };
}
function planetMass(type) {
  const m = { rocky:1.0, superEarth:2.5, iceGiant:4.0, gasGiant:8.0, lava:1.5 };
  return m[type] || 1.0;
}

function planetDiameter(type) {
  const d = { rocky:1.0, superEarth:1.3, iceGiant:1.5, gasGiant:1.8, lava:0.9 };
  return d[type] || 1.0;
}
// ─── ГЛОБАЛЬНЫЕ СОБЫТИЯ ───
// Устарело: глобальные события влились в EVENTS_CFG (random-events.js).
// Оставлено пустое объявление для обратной совместимости старых сборок.
const EVENT_CFG_LEGACY = { types: [] };

// Экспорт
window.EVENTS_CFG = EVENTS_CFG;
window.EVENT_CFG = EVENTS_CFG;
window.CFG = CFG;
window.STAGES = STAGES;
window.STAR_TYPES = STAR_TYPES;
window.SYSTEM_TYPES = SYSTEM_TYPES;
window.PLANET_TYPES = PLANET_TYPES;
window.RANDOM_EVENTS = RANDOM_EVENTS;
window.PHYS = PHYS;
window.ORBIT_GEOMETRY = ORBIT_GEOMETRY;
window.INVASION_CFG = INVASION_CFG;
window.NIGHT_CFG = NIGHT_CFG;
window.TROPHY_CFG = TROPHY_CFG;
window.PREMIUM_CFG = PREMIUM_CFG;
window.MISSIONS_CFG = MISSIONS_CFG;
window.SYSTEM_SHOP_CFG = SYSTEM_SHOP_CFG;
window.PRESTIGE_CFG = PRESTIGE_CFG;
window.GALAXY_LOD_CFG = GALAXY_LOD_CFG;
window.galaxyLodForTotal = galaxyLodForTotal;
window.galaxyGroupSizeForLevel = galaxyGroupSizeForLevel;
window.galaxyLodMeta = galaxyLodMeta;
window.galaxyMacroGroupCount = galaxyMacroGroupCount;
window.galaxyMaxLodForTotal = galaxyMaxLodForTotal;
window.clampGalaxyLodForTotal = clampGalaxyLodForTotal;
window.prestigeMultiplierFor = prestigeMultiplierFor;
window.METALS_CFG = METALS_CFG;
window.ECONOMY_CFG = ECONOMY_CFG;
window.STAR_WEIGHTS = STAR_WEIGHTS;
window.STORAGE_CFG = STORAGE_CFG;
window.CHEST_CFG = CHEST_CFG;
window.getOrbitR = getOrbitR;
window.generateSystemName = generateSystemName;
window.rollStarType = rollStarType;
window.rollSystemType = rollSystemType;
window.generateRandomSystem = generateRandomSystem;
window.getAllowedTypesAtOrbit = getAllowedTypesAtOrbit;
window.getAllowedTypesForSystem = getAllowedTypesForSystem;
window.getAllowedOrbitsForType = getAllowedOrbitsForType;
window.planetMass = planetMass;
window.planetDiameter = planetDiameter;