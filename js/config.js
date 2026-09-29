// ═══════════════════════════════════════════════════════════════
//  CONFIG.JS — константы игры
// ═══════════════════════════════════════════════════════════════

const CFG = {
  offlineCapHours: 4,
  offlineEfficiency: 0.5,
  eventInterval: 200,
  eventChance: 0.5,
  collisionInterval: 60,
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
// ВАЖНО про эксцентриситет:
//   Орбиты — эллипсы с перицентром a(1-e) и апоцентром a(1+e).
//   Для соседних орбит a_i и a_{i+1} условие непересечения:
//       a_{i+1}(1-e) > a_i(1+e)
//       a_{i+1}/a_i > (1+e)/(1-e)
//   При ratio = 1.25 и e <= 0.09 условие выполняется для всех орбит.
const SYSTEM_TYPES = {
  single: {
    name: 'Одиночная', stars: 1, chance: 0.50, rateMult: 1.0,
    collisionPerPlanet: 0,
    civPassiveMult: 1.0, civClickMult: 1.0,
    icon: '⭐', color: '#6b4de6',
    desc: 'Идеально круглые орбиты, стабильное развитие.',
    eccentricity: 0.00,      // Круги
    precession: 0.000002,
    orbitDriftRate: 0.0,
    chaosticPulse: 0.0,
  },
  binary: {
    name: 'Двойная', stars: 2, chance: 0.38, rateMult: 1.7,
    collisionPerPlanet: 0.004,
    civPassiveMult: 0.65, civClickMult: 3.0,
    icon: '✨', color: '#8b5cf6',
    desc: 'Две звезды. Слегка вытянутые орбиты, заметный дрейф.',
    eccentricity: 0.06,      // Безопасно при ratio=1.25
    precession: 0.00002,
    orbitDriftRate: 0.3,
    chaosticPulse: 0.0003,
  },
  trinary: {
    name: 'Кратная', stars: 3, chance: 0.12, rateMult: 2.5,
    collisionPerPlanet: 0.010,
    civPassiveMult: 0.40, civClickMult: 6.0,
    icon: '💫', color: '#a855f7',
    desc: 'Три звезды. Заметно вытянутые орбиты, хаотичный дрейф.',
    eccentricity: 0.09,      // Максимум при ratio=1.25
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
  snowLine: 200,      // Снеговая линия между 3-й (176) и 4-й (220) орбитой
  refPeriod: 8,
};

// ─── Орбитальная геометрия ──────────────────────────────────────
// Орбиты расположены по геометрической прогрессии:
//   a_i = baseR × ratio^i
// Это гарантирует, что соседние орбиты не пересекаются даже
// при ненулевом эксцентриситете.
//
// Проверка при ratio = 1.25 и e = 0.09:
//   a_{i+1}/a_i = 1.25 > (1+0.09)/(1-0.09) = 1.198 ✓
//
// Орбиты: 90, 112, 141, 176, 220, 275, 343, 429 (8 планет)
const ORBIT_GEOMETRY = {
  baseR: 90,          // Первая орбита
  ratio: 1.25,        // Множитель между орбитами
  minGap: 25,         // Минимальный зазор при миграции
  maxR: 500,          // Максимальный радиус орбиты
};

// Возвращает радиус орбиты по индексу (0..7)
function getOrbitR(index) {
  return ORBIT_GEOMETRY.baseR * Math.pow(ORBIT_GEOMETRY.ratio, index);
}
window.getOrbitR = getOrbitR;

window.CFG = CFG;
window.STAGES = STAGES;
window.STAR_TYPES = STAR_TYPES;
window.SYSTEM_TYPES = SYSTEM_TYPES;
window.PLANET_TYPES = PLANET_TYPES;
window.PHYS = PHYS;
window.ORBIT_GEOMETRY = ORBIT_GEOMETRY;
