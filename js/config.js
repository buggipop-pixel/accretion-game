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
    desc: 'Строй новые звёздные системы. 5 систем — и ты увидишь галактику.',
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
    desc: 'Идеально круглые орбиты, столкновений нет.',
    eccentricity: 0.00,
    precession: 0.000002,
    orbitDriftRate: 0.0,
    chaosticPulse: 0.0,
  },
  binary: {
    name: 'Двойная', stars: 2, chance: 0.38, rateMult: 1.7,
    collisionRate: 0.015,      // Раз в ~20 минут на пару
    civPassiveMult: 0.65, civClickMult: 3.0,
    icon: '✨', color: '#8b5cf6',
    desc: 'Две звезды. Редкие сближения планет.',
    eccentricity: 0.06,
    precession: 0.00002,
    orbitDriftRate: 0.3,
    chaosticPulse: 0.0003,
  },
  trinary: {
    name: 'Кратная', stars: 3, chance: 0.12, rateMult: 2.5,
    collisionRate: 0.025,      // Раз в ~10 минут, не смертельно
    civPassiveMult: 0.40, civClickMult: 6.0,
    icon: '💫', color: '#a855f7',
    desc: 'Три звезды. Частые сближения, риск столкновений.',
    eccentricity: 0.09,
    precession: 0.00004,
    orbitDriftRate: 0.5,
    chaosticPulse: 0.0008,
  },
};

// ─── Типы планет ────────────────────────────────────────────────
const PLANET_TYPES = {
  rocky:      { name: 'Каменная',       color: '#8a7159', civ: true,
                rate: 250, size: 1.0, desc: 'Землеподобный мир.' },
  superEarth: { name: 'Суперземля',     color: '#5a9c6e', civ: true,
                rate: 500, size: 1.3, desc: 'Массивнее Земли.' },
  iceGiant:   { name: 'Ледяной гигант', color: '#7ec8e3', civ: false,
                rate: 700, size: 1.5, desc: 'Источник комет.' },
  gasGiant:   { name: 'Газовый гигант', color: '#d4a76a', civ: false,
                rate: 900, size: 1.8, desc: 'Гравитационный щит.' },
  lava:       { name: 'Лава-планета',   color: '#ff4a22', civ: false,
                rate: 1400, size: 0.9, desc: 'Раскалённый мир.' },
};

// ─── Физические константы ───────────────────────────────────────
const PHYS = {
  refRadius: 100,
  refTemp: 280,
  snowLine: 200,
  refPeriod: 8,
};

// ─── Орбитальная геометрия ──────────────────────────────────────
// a_i = baseR × ratio^i  →  90, 112, 141, 176, 220, 275, 343, 429
const ORBIT_GEOMETRY = {
  baseR: 90,
  ratio: 1.25,
  minGap: 25,
  maxR: 500,
};

function getOrbitR(index) {
  return ORBIT_GEOMETRY.baseR * Math.pow(ORBIT_GEOMETRY.ratio, index);
}
window.getOrbitR = getOrbitR;

// ─── Порог гравитационного захвата ──────────────────────────────
// Множитель физического радиуса, при котором планеты считаются
// «взаимодействующими». 2.5 = реальное гравитационное влияние,
// а не только касание.
const COLLISION_CAPTURE_FACTOR = 2.5;
// ═══════════════════════════════════════════════════════════════
//  ПАРАМЕТРЫ МИССИЙ — кометы, экспедиции, колонии
//  Меняйте здесь, чтобы настроить длительность и стоимость
// ═══════════════════════════════════════════════════════════════
const MISSIONS_CFG = {
  // ─── КОМЕТЫ ───
  cometFlightBase: 600000,         // База полёта (мс) = 10 мин
  cometFlightMinMult: 0.5,         // Множитель для малой кометы (5 мин)
  cometFlightMaxMult: 1.5,         // Множитель для большой (15 мин)
  cometRewardBase: 500000,
  cometRewardPerPlanet: 0.3,
  cometFailChance: 0.25,

  // ─── ЭКСПЕДИЦИИ ───
  expeditionFlightMin: 600000,     // 10 мин
  expeditionFlightMax: 1200000,    // 20 мин
  expeditionCostBase: 3000,        // При 1 системе
  expeditionCostRatio: 1.5,        // Множитель за каждую систему
  expeditionRewardBase: 1000000,
  expeditionRewardPerPlanet: 0.4,
  expeditionFailChance: 0.15,

  // ─── КОЛОНИЯ ───
  colonyChance: 0.03,              // 3% шанс найти систему
  colonyEnergyCost: 50000,
  colonyEnergyRatio: 2.0,
  colonyCivCost: 50,
  colonyCivRatio: 1.8,

  // ─── УРОН ОТ ПРОЛЕТАЮЩИХ КОМЕТ ───
  cometDamageChance: 0.35,         // 35% шанс разрушения при попадании
  cometDamageRange: 2.5,           // Радиус столкновения = sumRadii × 2.5
};

// ─── ЛИМИТЫ АКТИВНОЙ ИГРЫ ───────────────────────────────────────
// Пассив медленный (часы/дни), актив — быстрее
const BALANCE = {
  // Множитель клика (чем выше, тем выгоднее активная игра)
  clickBonus: 1.0,
  // Множитель пассивного дохода от планет
  passiveBonus: 1.0,
  // Дополнительный множитель за активные действия в час
  activeBonus: 1.5,
};

window.MISSIONS_CFG = MISSIONS_CFG;
window.BALANCE = BALANCE;
window.CFG = CFG;
window.STAGES = STAGES;
window.STAR_TYPES = STAR_TYPES;
window.SYSTEM_TYPES = SYSTEM_TYPES;
window.PLANET_TYPES = PLANET_TYPES;
window.PHYS = PHYS;
window.ORBIT_GEOMETRY = ORBIT_GEOMETRY;
window.COLLISION_CAPTURE_FACTOR = COLLISION_CAPTURE_FACTOR;
