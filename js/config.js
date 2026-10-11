// ═══════════════════════════════════════════════════════════════
//  CONFIG.JS — константы игры
// ═══════════════════════════════════════════════════════════════

const CFG = {
  offlineCapHours: 4,
  offlineEfficiency: 0.5,
  eventInterval: 200,
  eventChance: 0.5,
  formationDuration: 600,
  civGrowthPerPlanet: 0.02,
  civClickBoost: 0.02,
};

// ─── Фазы развития ──────────────────────────────────────────────
const STAGES = {
  cloud: {
    tag: 'ФАЗА I', scale: 'ОБЛАКО', name: 'Молекулярное облако',
    desc: 'Холодная пыль дрейфует в пустоте. Проведи пальцем — собери пыль.',
    goal: 500, baseRate: 0, clickRate: 1, goalLabel: 'Накопи 500 пылинок',
  },
  condense: {
    tag: 'ФАЗА II', scale: 'ДИСК', name: 'Протопланетный диск',
    desc: 'Гравитация сжимает облако. Диск вращается, пыль слипается.',
    goal: 25000, baseRate: 0.05, clickRate: 2, goalLabel: 'Накопи 25 000 пыли',
  },
  protostar: {
    tag: 'ФАЗА III', scale: 'ЗВЕЗДА', name: 'Протозвезда',
    desc: 'Термоядерный синтез запущен. Биполярные джеты пробивают кокон.',
    goal: 200000, baseRate: 5, clickRate: 5, goalLabel: 'Накопи 200 000 пыли',
  },
  firstPlanet: {
    tag: 'ФАЗА IV', scale: 'ЗВЕЗДА', name: 'Первая планета',
    desc: 'Диск остывает. Пора собрать первую планету из обломков.',
    goal: 800000, baseRate: 40, clickRate: 20, goalLabel: 'Накопи 800 000 пыли',
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
    collisionRate: 0,
    civPassiveMult: 1.0, civClickMult: 1.0,
    icon: '⭐', color: '#6b4de6',
    desc: 'Идеально круглые орбиты.',
    eccentricity: 0.00, precession: 0.000002,
    orbitDriftRate: 0.0, chaosticPulse: 0.0,
  },
  binary: {
    name: 'Двойная', stars: 2, chance: 0.38, rateMult: 1.7,
    collisionRate: 0.015,
    civPassiveMult: 0.65, civClickMult: 3.0,
    icon: '✨', color: '#8b5cf6',
    desc: 'Две звезды. Слегка вытянутые орбиты.',
    eccentricity: 0.06, precession: 0.00002,
    orbitDriftRate: 0.3, chaosticPulse: 0.0003,
  },
  trinary: {
    name: 'Кратная', stars: 3, chance: 0.12, rateMult: 2.5,
    collisionRate: 0.025,
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
  baseR: 90,
  ratio: 1.25,
  minGap: 25,
  maxR: 500,
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
//  ВТОРЖЕНИЯ — двухфазная атака
//  Фаза 1: грабёж пыли (45 минут)
//  Фаза 2: уничтожение планеты (15 минут)
//  Общая длительность: 1 час
// ═══════════════════════════════════════════════════════════════
const INVASION_CFG = {
  intervalMin: 20 * 60 * 1000,      // 20 минут
  intervalMax: 40 * 60 * 1000,      // 40 минут
  chance: 0.6,                       // 60% шанс

  shipsBase: 3,                      // Базовое число кораблей
  shipsMax: 5,                       // Максимум

  robberyDuration: 45 * 60 * 1000,      // 45 минут грабежа
  destructionDuration: 15 * 60 * 1000,  // 15 минут уничтожения
  totalDuration: 60 * 60 * 1000,        // 1 час всего

  robberyMultiplier: 4,              // dustPerSec × 4 × корабли в секунду
  planetMaxHP: 100,                  // HP планеты
  hitRadius: 20,                     // Радиус клика по кораблю (px)
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
      speed: 0.15 / Math.sqrt(orbitR / 90),
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
  const prefix = SYS_PREFIXES[Math.floor(Math.random() * SYS_PREFIXES.length)];
  const name = SYS_NAMES[Math.floor(Math.random() * SYS_NAMES.length)];
  const suffix = SYS_SUFFIXES[Math.floor(Math.random() * SYS_SUFFIXES.length)];
  return prefix + ' ' + name + suffix;
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
