// ═══════════════════════════════════════════════════════════════
//  CONFIG.JS — константы игры
// ═══════════════════════════════════════════════════════════════

const CFG = {
  offlineCapHours: 8,        // совпадает с dustHours[0]
  offlineEfficiency: 1.0,    // 100% — офлайн идентичен онлайну
  eventInterval: 200,
  eventChance: 0.5,
  formationDuration: 600,
  civGrowthPerPlanet: 0.02,
  civClickBoost: 0.0,

    // ─── Экономика фаз IV–VI ───
    // Фиксированные капы в пыли (не зависят от дохода).
    // Скорость накопления зависит от качества систем.
    //   planetCost(n) = 700000 × 2^n
    // ★ Стоимость планет: 700K, 1.4M, 2.8M, 5.6M, 11.2M, 22.4M, 44.8M, 89.6M
    // Сумма на все 8 планет ~ 178M пыли.
    planetBaseCost: 700000,
    planetCostGrowth: 2.0,

    //   systemCost(n) = 40M × 2^n
    // ★ Стоимость систем: 40M, 80M, 160M, 320M.
    // Сумма на 4 новые системы ~ 600M пыли.
    systemBaseCost: 40000000,
    systemGrowth: 2.0,
    systemCostMin: 40000000,

    // Множитель дохода от количества систем (было ×0.5 — стало ×1.0)
    // 5 систем → ×5 к доходу всей галактики
    systemIncomeMultPerSystem: 1.0,

  // ─── Донат: стоимость мгновенного апгрейда хранилища ───
  storageInstantStars: 50,

  // ═════════════════════════════════════════════════════════════
  //  АКТИВНЫЕ ФАЗЫ I–III
  //  Пыль капает ТОЛЬКО от поглощения частиц (см. particles.js).
  //  Ускорение пальцем меняет МОДУЛЬ скорости, а не направление.
  // ═════════════════════════════════════════════════════════════
    activeBoost: {
    // ─── Фаза I ───
    cloud: {
      vRef: 25, radialSpeed: 25,
      holdBoost: 2.5, twistBoost: 1.0, twistThreshold: 999,
      dustPerParticle: 1,
    },

    // ─── Фаза II: диск у звезды ───
    condense: {
      vRef: 30, radialSpeed: 45,
      holdBoost: 2.0, twistBoost: 3.5, twistScale: 0.7, twistThreshold: 0.05,
      dustPerParticle: 2,
      diskRadius: 40,
      diskWidth: 12,
      diskOrbitSec: 3,
      diskSpinSpeed: 3.0,
      diskFormSec: 14,
    },

    // ─── Фаза III: ПЛОТНЫЙ диск ───
    protostar: {
      vRef: 20,                 // ★ ниже — частицы идут в диск, не разлетаются
      radialSpeed: 35,
      dustPerParticle: 1,
      diskRadius: 70,
      diskWidth: 20,            // ★ уже — плотнее
      diskOrbitSec: 5,
      diskSpinSpeed: 6.0,       // ★ очень быстрое вращение
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

// ═════════════════════════════════════════════════════════════════
//  STORAGE_CFG — конфиг хранилища ресурсов с капом и апгрейдами
// ═════════════════════════════════════════════════════════════════
const STORAGE_CFG = {
  maxLevel: 7,
  // Кап в часах для пыли (уровни 1-7)
  // Ур.1 = 8 ч (одна ночь), Ур.7 = 72 ч (выходные/праздники).
  dustHours: [8, 16, 24, 36, 48, 60, 72],
  // Доля капа уровня, которую нужно накопить на апгрейд (уровни 1→2 ... 6→7).
  // Доля растёт → каждый следующий апгрейд купить сложнее.
  dustCostShare: [0.9, 1.5, 2.5, 4.0, 6.0, 9.0],
  // Энергия и цивилизация дороже пыли (те же доли капа, но с множителем)
  energyCostMult: 12,
  civCostMult: 20,
  // Множитель капа для энергии (×2 на уровень): 1, 2, 4, 8, 16, 32, 64
  // Множитель капа для цивилизации (×1.5 на уровень): 1, 1.5, 2.25, 3.375, 5.0625, 7.59375, 11.39
  // Стоимость перехода на уровень (level): level 1->2 (idx 0), 2->3 (idx 1), etc.
  // dust: 50K * 10^(level-1)
  // energy: dustCost * 8
  // civ: dustCost * 12
    getDustCapHours(level) {
    const caps = [8, 16, 24, 36, 48, 60, 72];
    const lvl = Math.min(Math.max(1, level || 1), 7);
    return caps[lvl - 1];
  },
  // Плоский кап пыли уровня (страховка ранних фаз, когда доход ~0):
  // 50K, 1M, 20M, 400M, 8B, 120B, 2.4T
  getDustFlatCap(level) {
    const lvl = Math.min(Math.max(1, level || 1), 7);
    return 50000 * Math.pow(10, lvl - 1) * this.getDustCapHours(lvl);
  },
  // Энергия: базовый кап ×2 за уровень → 100K, 200K, 400K, ...
  getEnergyFlatCap(level) {
    const lvl = Math.min(Math.max(1, level || 1), 7);
    return 100000 * Math.pow(2, lvl - 1);
  },
  // Цивилизация: базовый кап ×1.5 за уровень → 100, 150, 225, ...
  getCivFlatCap(level) {
    const lvl = Math.min(Math.max(1, level || 1), 7);
    return 100 * Math.pow(1.5, lvl - 1);
  },
  getEnergyCapMult(level) {
    const lvl = Math.min(Math.max(1, level || 1), 7);
    return Math.pow(2, lvl - 1);
  },
  getCivCapMult(level) {
    const lvl = Math.min(Math.max(1, level || 1), 7);
    return Math.pow(1.5, lvl - 1);
  },
  getUpgradeCost(res, level) {
    if (level >= STORAGE_CFG.maxLevel) return Infinity;
    const lvl = Math.min(Math.max(1, level || 1), 7);
    // Стоимость = доля капа текущего уровня, поэтому апгрейд всегда достижим,
    // но с каждым уровнем требует заполнить хранилище сильнее.
    const share = this.dustCostShare[lvl - 1] || 0.9;
    const dustCost = this.getDustFlatCap(lvl) * share;
    if (res === 'dust') return Math.floor(dustCost);
    if (res === 'energy') return Math.floor(dustCost * (this.energyCostMult || 8));
    if (res === 'civ') return Math.floor(dustCost * (this.civCostMult || 12));
    return Infinity;
  }
};

// ─── Фазы развития ──────────────────────────────────────────────
const STAGES = {
  cloud: {
    tag: 'ФАЗА I', scale: 'ОБЛАКО', name: 'Молекулярное облако',
    desc: 'Холодная пыль дрейфует в пустоте. Проведи пальцем — собери пыль.',
    goal: 2000, baseRate: 0, clickRate: 0, goalLabel: 'Накопи 2 000 пылинок',
  },
  condense: {
    tag: 'ФАЗА II', scale: 'ДИСК', name: 'Протопланетный диск',
    desc: 'Гравитация сжимает облако. Диск вращается, пыль слипается.',
    goal: 25000, baseRate: 0, clickRate: 0, goalLabel: 'Накопи 25 000 пыли',
  },
  protostar: {
    tag: 'ФАЗА III', scale: 'ЗВЕЗДА', name: 'Протозвезда',
    desc: 'Термоядерный синтез запущен. Держи жар тапами!',
    goal: null, baseRate: 0, clickRate: 0, goalLabel: 'Держи жар',
  },
  firstPlanet: {
    tag: 'ФАЗА IV', scale: 'ЗВЕЗДА', name: 'Первая планета',
    desc: 'Диск остывает. Пора собрать первую планету из обломков.',
    goal: null, baseRate: 40, clickRate: 0, goalLabel: 'Собери первую планету',
  },
  system: {
    tag: 'ФАЗА V', scale: 'СИСТЕМА', name: 'Формирование системы',
    desc: 'Каждая планета увеличивает доход. Всего доступно 8 планет.',
    goal: null, baseRate: 200, clickRate: 50, goalLabel: 'Формируй планеты',
  },
  galaxy: {
    tag: 'ФАЗА VI', scale: 'ГАЛАКТИКА', name: 'Межзвёздная экспансия',
    desc: 'Строй новые звёздные системы. 10 систем — и ты станешь галактикой.',
    goal: null, baseRate: 2000, clickRate: 100, goalLabel: 'Расширяй галактику',
  },
};
// ─── Спектральные классы звёзд ──────────────────────────────────
const STAR_TYPES = {
  M: { name: 'Красный карлик', color: 8, sat: 92, light: 60,
       rateMult: 6, civ: false, size: 0.65,
       desc: '>56 млрд лет. Огромный пассив, но без цивилизаций.' },
  K: { name: 'Оранжевый карлик', color: 32, sat: 88, light: 68,
       rateMult: 3, civ: true, maxCiv: 7, size: 0.85,
       desc: '17–40 млрд лет. Баланс дохода и жизни.' },
  G: { name: 'Жёлтый карлик', color: 50, sat: 95, light: 74,
       rateMult: 1.5, civ: true, maxCiv: 10, size: 1.0,
       desc: 'Аналог Солнца. Все ветки доступны.' },
  A: { name: 'Белая звезда', color: 210, sat: 25, light: 88,
       rateMult: 2, civ: false, size: 1.25,
       desc: '<7 млрд лет. Активное развитие, без цивилизаций.' },
  B: { name: 'Голубая звезда', color: 220, sat: 78, light: 78,
       rateMult: 3.5, civ: false, size: 1.6,
       desc: '<400 млн лет. Максимальная скорость.' },
};

// ─── Типы звёздных систем ───────────────────────────────────────
const SYSTEM_TYPES = {
  single: {
    name: 'Одиночная', stars: 1, chance: 0.50, rateMult: 1.0,
    collisionRate: 0.08,
    civPassiveMult: 1.0, civClickMult: 1.0,
    icon: '⭐', color: '#6b4de6',
    desc: 'Идеально круглые орбиты.',
    eccentricity: 0.00, precession: 0.000002,
    orbitDriftRate: 0.0, chaosticPulse: 0.0,
  },
  binary: {
    name: 'Двойная', stars: 2, chance: 0.38, rateMult: 1.7,
    collisionRate: 0.20,
    civPassiveMult: 0.65, civClickMult: 3.0,
    icon: '✨', color: '#8b5cf6',
    desc: 'Две звезды. Слегка вытянутые орбиты.',
    eccentricity: 0.06, precession: 0.00002,
    orbitDriftRate: 0.3, chaosticPulse: 0.0003,
  },
  trinary: {
    name: 'Кратная', stars: 3, chance: 0.12, rateMult: 2.5,
    collisionRate: 0.35,
    civPassiveMult: 0.40, civClickMult: 6.0,
    icon: '💫', color: '#a855f7',
    desc: 'Три звезды. Заметно вытянутые орбиты.',
    eccentricity: 0.09, precession: 0.00004,
    orbitDriftRate: 0.5, chaosticPulse: 0.0008,
  },
};

// ─── Типы планет ────────────────────────────────────────────────
const PLANET_TYPES = {
  rocky: {
    name: 'Каменная', color: '#8a7159', civ: true,
    rate: 250, size: 1.0, desc: 'Землеподобный мир.',
    bonus: { type: 'basic' },
  },
  superEarth: {
    name: 'Земля', color: '#5a9c6e', civ: true,
    rate: 500, size: 1.3, desc: 'Колыбель жизни.',
    bonus: { type: 'civ', civMult: 1.5 },
  },
  iceGiant: {
    name: 'Ледяной гигант', color: '#7ec8e3', civ: false,
    rate: 700, size: 1.5, desc: 'Источник комет.',
    bonus: { type: 'comet' },
  },
  gasGiant: {
    name: 'Газовый гигант', color: '#d4a76a', civ: false,
    rate: 900, size: 1.8, desc: 'Гравитационный щит системы.',
    bonus: { type: 'shield', cometFailReduction: 0.3 },
  },
  lava: {
    name: 'Лава-планета', color: '#ff4a22', civ: false,
    rate: 1400, size: 0.9, desc: 'Раскалённый мир. Источник металлов.',
    bonus: { type: 'metals', metalsPerSec: 0.5 },
  },
};

// ─── Физические константы ───────────────────────────────────────
const PHYS = {
  refRadius: 100,
  refTemp: 280,
  refPeriod: 8,
};

// ─── Орбитальная геометрия ──────────────────────────────────────
const ORBIT_GEOMETRY = {
  baseR: 170,     // было 90 — даёт место для прайм-объекта в центре
  ratio: 1.22,
  minGap: 30,
  maxR: 750,      // 8-я орбита теперь на 620
};

function getOrbitR(index) {
  return ORBIT_GEOMETRY.baseR * Math.pow(ORBIT_GEOMETRY.ratio, index);
}

// ─── Матрица планет по орбитам ─────────────────────────────────
const ORBIT_PLANET_MATRIX = {
  M: [
    ['rocky'], ['rocky'], ['rocky'], ['rocky', 'gasGiant'],
    ['gasGiant'], ['gasGiant'], ['iceGiant'], ['iceGiant'],
  ],
  K: [
    ['lava'], ['rocky'], ['rocky', 'superEarth'], ['rocky', 'superEarth'],
    ['rocky', 'superEarth'], ['gasGiant'], ['gasGiant'], ['iceGiant'],
  ],
  G: [
    ['lava'], ['rocky'], ['rocky'], ['rocky', 'superEarth'],
    ['superEarth'], ['gasGiant'], ['gasGiant'], ['iceGiant'],
  ],
  A: [
    ['lava'], ['lava'], ['lava', 'rocky'], ['rocky'],
    ['gasGiant'], ['gasGiant'], ['gasGiant'], ['iceGiant'],
  ],
  B: [
    ['lava'], ['lava'], ['lava'], ['lava'],
    ['gasGiant'], ['gasGiant'], ['gasGiant'], ['iceGiant'],
  ],
};

function getAllowedTypesAtOrbit(starType, orbitIdx) {
  const matrix = ORBIT_PLANET_MATRIX[starType] || ORBIT_PLANET_MATRIX.G;
  if (orbitIdx < 0 || orbitIdx >= matrix.length) return [];
  return matrix[orbitIdx].slice();
}
function getAllowedTypesForSystem(starType) {
  const matrix = ORBIT_PLANET_MATRIX[starType] || ORBIT_PLANET_MATRIX.G;
  const set = {};
  for (let i = 0; i < matrix.length; i++) {
    for (let j = 0; j < matrix[i].length; j++) set[matrix[i][j]] = true;
  }
  return Object.keys(set);
}
function getAllowedOrbitsForType(starType, planetType) {
  const matrix = ORBIT_PLANET_MATRIX[starType] || ORBIT_PLANET_MATRIX.G;
  const orbits = [];
  for (let i = 0; i < matrix.length; i++) {
    if (matrix[i].indexOf(planetType) !== -1) orbits.push(i);
  }
  return orbits;
}

// ═══════════════════════════════════════════════════════════════
//  ВТОРЖЕНИЯ — трёхуровневая система сложности
// ═══════════════════════════════════════════════════════════════
const INVASION_CFG = {
  intervalMin: 20 * 60 * 1000,
  intervalMax: 40 * 60 * 1000,
  chance: 0.6,

  robberyDuration: 45 * 60 * 1000,
  destructionDuration: 15 * 60 * 1000,
  totalDuration: 60 * 60 * 1000,

  robberyMultiplier: 4,
  planetMaxHP: 100,
  hitRadius: 20,

  // ★ Три уровня сложности
  tiers: {
    scout:  { weight: 0.60, baseChance: 0.70, planets: 1, energyDrain: 0.03, civDrain: 0.05, lootMult: 1.0, chanceCap: 0.90, label: 'Разведка' },
    raid:   { weight: 0.30, baseChance: 0.50, planets: 2, energyDrain: 0.06, civDrain: 0.10, lootMult: 1.5, chanceCap: 0.80, label: 'Рейд' },
    siege:  { weight: 0.10, baseChance: 0.25, planets: 3, energyDrain: 0.10, civDrain: 0.15, lootMult: 2.5, chanceCap: 0.65, label: 'Осада' },
  },

  resourceThresholdShare: 0.25,   // 25% капа для полного ресурсного фактора

  // ★ Автооборона
  defenseBonusBase: 6,            // bonus = 6 * level^0.8
  defenseBonusExp: 0.8,
  defenseDrainReduction: 0.05,    // 5% за уровень, макс 25%
  defenseCost: [0, 300, 700, 1500, 3000, 6000],  // [0] не используется

  // ★ Штраф за активную экспедицию
  expeditionDefensePenalty: 0.15,

  // ★ Офлайн-атаки
  offlineAttackInterval: 2 * 60 * 60 * 1000,
  offlineAttackMax: 5,
  offlineAttackPerSystems: 3,
};

// ═══════════════════════════════════════════════════════════════
//  НОЧНОЙ РЕЖИМ — 4 пресета
// ═══════════════════════════════════════════════════════════════
const NIGHT_CFG = {
  lossCaps: {
    cautious:    0.05,
    balanced:    0.25,
    aggressive:  0.50,
    insane:      0.75,
  },

  damagePerHit: {
    cautious:    { planets: 1, systems: 0 },
    balanced:    { planets: 2, systems: 1 },
    aggressive:  { planets: 3, systems: 2 },
    insane:      { planets: 5, systems: 3 },
  },

  presets: {
    cautious:     { defense: 5, cometHours: 0, expPercent: 0 },
    balanced:     { defense: 3, cometHours: 3, expPercent: 30 },
    aggressive:   { defense: 0, cometHours: 6, expPercent: 70 },
    insane:       { defense: 0, cometHours: 8, expPercent: 100 },
  },

  expeditionDefensePenaltyMax: 0.30,
};

// ═══════════════════════════════════════════════════════════════
//  ТРОФЕЙНЫЕ КОНТРАКТЫ
// ═══════════════════════════════════════════════════════════════
const TROPHY_CFG = {
  dropChanceByMode: {
    cautious:    0.10,
    balanced:    0.20,
    aggressive:  0.35,
    insane:      0.50,
    default:     0.15,
  },

  rarityWeights: { common: 0.60, rare: 0.30, epic: 0.10 },

  rewards: {
    common: {
      systemDiscount:   [0.30, 0.40],
      shieldHours:      [1, 3],
      defenseDiscount:  [0.25, 0.35],
    },
    rare: {
      systemDiscount:   [0.45, 0.50],
      shieldHours:      [4, 6],
      freeDefenseLevel: [3, 4],
      freeDefenseHours: 12,
    },
    epic: {
      systemFree:       true,
      shieldHours:      [8, 9],
      freeDefenseLevel: [5, 5],
      freeDefenseHours: 24,
    },
  },
};

// ═══════════════════════════════════════════════════════════════
//  ПРЕМИУМ (за металл)
// ═══════════════════════════════════════════════════════════════
const PREMIUM_CFG = {
  shield: {
    hours: 8,
    costMetals: 1000,
  },
};
// ═══════════════════════════════════════════════════════════════
//  ПРЕСТИЖ (Сверхновая)
// ═══════════════════════════════════════════════════════════════
const PRESTIGE_CFG = {
  firstRequirement: 5,               // 1-я сверхновая на 5 систем
  stepMultiplier: 2,                 // Каждая следующая ×2 по системам
  multiplierPerGalaxy: 2.0,          // Каждая галактика ×2 к доходу
};

// ═══════════════════════════════════════════════════════════════
//  МЕТАЛЛЫ
// ═══════════════════════════════════════════════════════════════
const METALS_CFG = {
  expeditionCostMetals: 200,
  cometBoostCostMetals: 100,
  cometBoostSurvival: 0.3,
  colonyCostMetals: 500,
};

// ═══════════════════════════════════════════════════════════════
//  MISSIONS_CFG — кометы, экспедиции, колонии
//  Читается из js/missions.js (стоимости, время полёта, награды)
//  и js/particles.js (урон комет по планетам).
// ═══════════════════════════════════════════════════════════════
const MISSIONS_CFG = {
  // ─── Кометы: полёт 5–15 минут ───
  cometFlightBase: 5 * 60 * 1000,   // база: 5 минут
  cometFlightMinMult: 1.0,          // малая комета  → ~5 мин
  cometFlightMaxMult: 3.0,          // большая комета → ~15 мин
  cometRewardBase: 1000000,         // база награды
  cometRewardPerPlanet: 0.15,       // +15% за каждую планету в системе
  cometFailChance: 0.20,            // 20% — комета не возвращается
  cometDamageRange: 2.5,            // радиус урона пролетающей кометы
  cometDamageChance: 0.35,          // 35% — комета уничтожает планету

  // ─── Экспедиции: 10–20 минут, 3000 × 1.5^(систем-1) энергии ───
  expeditionCostBase: 3000,
  expeditionCostRatio: 1.5,
  expeditionFlightMin: 10 * 60 * 1000,
  expeditionFlightMax: 20 * 60 * 1000,
  expeditionRewardBase: 2000000,
  expeditionRewardPerPlanet: 0.25,
  expeditionFailChance: 0.25,

  // ─── Колония: 3% шанс, 50K × 2^(систем) энергии + 50 × 1.8 цив. ───
  colonyChance: 0.03,
  colonyEnergyCost: 50000,
  colonyEnergyRatio: 2,
  colonyCivCost: 50,
  colonyCivRatio: 1.8,
};

// ═══════════════════════════════════════════════════════════════
//  SYSTEM_SHOP_CFG — магазин новых систем (фаза «Галактика»)
//  Три шкалы: пыль (обязательна), энергия (бонус), цивилизация (шанс жизни)
// ═══════════════════════════════════════════════════════════════
const SYSTEM_SHOP_CFG = {
  dustSeconds: 1800,        // (устарело) пыль считается через systemCost()
  energyCapShare: 0.5,      // энергия: половина капа хранилища энергии
  civCapShare: 0.4,         // цивилизация: 40% капа хранилища цивилизации

  energyBonusPlanets: 2,    // +2 планеты при полностью вложенной энергии
  energyBonusIncome: 0.5,   // +50% дохода системы при полностью вложенной энергии

  colonyChanceFull: 0.60,   // шанс обитаемой системы при полном вложении
  gasChance: 0.30,          // шанс «газовой» системы (не зависит от вложений)
  // «Ледяная» система — всё, что осталось: 70% без вложений → 10% при полном
};

// ─── Salpeter IMF ───────────────────────────────────────────────
const STAR_WEIGHTS = { M: 60, K: 15, G: 10, A: 10, B: 5 };

function rollStarType() {
  const total = Object.values(STAR_WEIGHTS).reduce(function(s, v) { return s + v; }, 0);
  let r = Math.random() * total;
  for (const key in STAR_WEIGHTS) {
    r -= STAR_WEIGHTS[key];
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
  let starType;
  if (isColony) starType = Math.random() < 0.6 ? 'G' : 'K';
  else starType = rollStarType();
  const systemType = rollSystemType();
  const planets = [];
  for (let i = 0; i < 8; i++) {
    let pool = getAllowedTypesAtOrbit(starType, i);
    if (isColony) {
      pool = pool.filter(function(t) {
        return PLANET_TYPES[t] && PLANET_TYPES[t].civ;
      });
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

function planetMass(type) {
  const m = { rocky:1.0, superEarth:2.5, iceGiant:4.0, gasGiant:8.0, lava:1.5 };
  return m[type] || 1.0;
}
function planetDiameter(type) {
  const d = { rocky:1.0, superEarth:1.3, iceGiant:1.5, gasGiant:1.8, lava:0.9 };
  return d[type] || 1.0;
}

const SYS_PREFIXES = ['Альфа','Бета','Гамма','Дельта','Эпсилон','Дзета','Эта',
  'Тета','Йота','Каппа','Лямбда','Мю','Ню','Кси','Омикрон','Пи','Ро','Сигма',
  'Тау','Ипсилон','Фи','Хи','Пси','Омега'];
const SYS_NAMES = ['Кентавра','Центавра','Ориона','Лебедя','Лира','Дракона',
  'Феникса','Кита','Гидры','Пегаса','Кассиопеи','Персея','Андромеды',
  'Волопаса','Геркулеса','Змееносца','Ворона','Орла','Павлина','Журавля',
  'Тукана','Единорога'];
const SYS_SUFFIXES = ['',' I',' II',' III',' IV',' V',' A',' B'];

function generateSystemName() {
  let generatedName = '';
  let attempts = 0;
  const maxAttempts = 100; // Защита от бесконечного цикла

  while (attempts < maxAttempts) {
    const prefix = SYS_PREFIXES[Math.floor(Math.random() * SYS_PREFIXES.length)];
    const base = SYS_NAMES[Math.floor(Math.random() * SYS_NAMES.length)];
    const suffix = SYS_SUFFIXES[Math.floor(Math.random() * SYS_SUFFIXES.length)];
    generatedName = prefix + ' ' + base + suffix;

    let isDuplicate = false;

    // Проверяем родную систему
    if (typeof S !== 'undefined' && S.systemName === generatedName) {
      isDuplicate = true;
    }

    // Проверяем другие системы
    if (!isDuplicate && typeof S !== 'undefined' && S.otherSystems) {
      for (let i = 0; i < S.otherSystems.length; i++) {
        if (S.otherSystems[i] && S.otherSystems[i].name === generatedName) {
          isDuplicate = true;
          break;
        }
      }
    }

    if (!isDuplicate) break;
    attempts++;
  }

  return generatedName;
}

// ─── Экспорт ────────────────────────────────────────────────────
window.CFG = CFG;
window.STAGES = STAGES;
window.STAR_TYPES = STAR_TYPES;
window.SYSTEM_TYPES = SYSTEM_TYPES;
window.PLANET_TYPES = PLANET_TYPES;
window.PHYS = PHYS;
window.ORBIT_GEOMETRY = ORBIT_GEOMETRY;
window.INVASION_CFG = INVASION_CFG;
window.PRESTIGE_CFG = PRESTIGE_CFG;
window.METALS_CFG = METALS_CFG;
window.MISSIONS_CFG = MISSIONS_CFG;
window.STAR_WEIGHTS = STAR_WEIGHTS;
window.getOrbitR = getOrbitR;
window.getAllowedTypesAtOrbit = getAllowedTypesAtOrbit;
window.getAllowedTypesForSystem = getAllowedTypesForSystem;
window.getAllowedOrbitsForType = getAllowedOrbitsForType;
window.rollStarType = rollStarType;
window.rollSystemType = rollSystemType;
window.generateRandomSystem = generateRandomSystem;
window.generateSystemName = generateSystemName;
window.planetMass = planetMass;
window.planetDiameter = planetDiameter;
window.STORAGE_CFG = STORAGE_CFG;
window.SYSTEM_SHOP_CFG = SYSTEM_SHOP_CFG;
window.NIGHT_CFG = NIGHT_CFG;
window.TROPHY_CFG = TROPHY_CFG;
window.PREMIUM_CFG = PREMIUM_CFG;