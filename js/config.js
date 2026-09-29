// ═══════════════════════════════════════════════════════════════
//  CONFIG.JS — все константы игры
//  Меняйте значения здесь, чтобы настроить баланс и поведение
// ═══════════════════════════════════════════════════════════════

// ─── Общие настройки экономики и таймингов ──────────────────────
const CFG = {
  offlineCapHours: 4,        // Максимум часов офлайн-дохода
  offlineEfficiency: 0.5,    // Доля от онлайн-дохода в офлайне
  eventInterval: 200,        // Секунд между пассивными событиями
  eventChance: 0.5,          // Шанс события при проверке
  collisionInterval: 60,     // Секунд между проверками столкновений
  formationDuration: 600,    // Секунд на формирование планеты после слияния

  civGrowthPerPlanet: 0.02,  // +0.02 уровня/сек за civ-планету
  civClickBoost: 0.02,       // +0.02 уровня за клик по canvas
};

// ─── Фазы развития ──────────────────────────────────────────────
// goal         — сколько пыли нужно для перехода (null = не числовая)
// baseRate     — базовый пассивный доход
// clickRate    — доход за клик
const STAGES = {
  cloud: {
    tag: 'ФАЗА I', scale: 'ОБЛАКО', name: 'Молекулярное облако',
    desc: 'Холодная пыль дрейфует в пустоте. Проведи пальцем — собери пыль.',
    goal: 500, baseRate: 0, clickRate: 1,
    goalLabel: 'Накопи 500 пылинок',
  },
  condense: {
    tag: 'ФАЗА II', scale: 'ДИСК', name: 'Протопланетный диск',
    desc: 'Гравитация сжимает облако. Диск вращается, пыль слипается.',
    goal: 25000, baseRate: 0.05, clickRate: 2,
    goalLabel: 'Накопи 25 000 пыли',
  },
  protostar: {
    tag: 'ФАЗА III', scale: 'ЗВЕЗДА', name: 'Протозвезда',
    desc: 'Термоядерный синтез запущен. Биполярные джеты пробивают кокон.',
    goal: 200000, baseRate: 5, clickRate: 5,
    goalLabel: 'Накопи 200 000 пыли',
  },
  firstPlanet: {
    tag: 'ФАЗА IV', scale: 'ЗВЕЗДА', name: 'Первая планета',
    desc: 'Диск остывает. Пора собрать первую планету из обломков.',
    goal: 800000, baseRate: 40, clickRate: 20,
    goalLabel: 'Накопи 800 000 пыли',
  },
  system: {
    tag: 'ФАЗА V', scale: 'СИСТЕМА', name: 'Формирование системы',
    desc: 'Каждая планета увеличивает доход. Всего доступно 8 планет.',
    goal: null, baseRate: 200, clickRate: 50,
    goalLabel: 'Формируй планеты',
  },
  galaxy: {
    tag: 'ФАЗА VI', scale: 'ГАЛАКТИКА', name: 'Межзвёздная экспансия',
    desc: 'Строй новые звёздные системы. 5 систем — и ты увидишь галактику.',
    goal: null, baseRate: 2000, clickRate: 100,
    goalLabel: 'Расширяй галактику',
  },
};

// ─── Типы звёзд (спектральные классы) ───────────────────────────
// rateMult — множитель дохода
// civ      — возможна ли жизнь на планетах этой звезды
// maxCiv   — максимальный уровень цивилизации (если civ = true)
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
// Орбитальная динамика для планет:
//   eccentricity   — насколько вытянута орбита (0 = круг)
//   precession     — скорость поворота перицентра орбиты (рад/сек)
//   orbitDriftRate — медленный дрейф радиуса орбиты (px/сек)
//   chaosticPulse  — вероятность случайного толчка за секунду
const SYSTEM_TYPES = {
  single: {
    name: 'Одиночная', stars: 1, chance: 0.50, rateMult: 1.0,
    collisionPerPlanet: 0,
    civPassiveMult: 1.0, civClickMult: 1.0,
    icon: '⭐', color: '#6b4de6',
    desc: 'Стабильные круговые орбиты, предсказуемое развитие.',
    eccentricity: 0.00,      // Идеальные круги
    precession: 0.000002,    // Почти нет прецессии
    orbitDriftRate: 0.0,     // Никакого дрейфа
    chaosticPulse: 0.0,      // Никаких толчков
  },
  binary: {
    name: 'Двойная', stars: 2, chance: 0.38, rateMult: 1.7,
    collisionPerPlanet: 0.003,
    civPassiveMult: 0.65, civClickMult: 3.0,
    icon: '✨', color: '#8b5cf6',
    desc: 'Две звезды. Эллиптические орбиты, редкие сближения.',
    eccentricity: 0.15,      // Заметно вытянутые
    precession: 0.00002,     // Заметная прецессия
    orbitDriftRate: 0.3,     // Медленный дрейф
    chaosticPulse: 0.0003,   // Редкие толчки
  },
  trinary: {
    name: 'Кратная', stars: 3, chance: 0.12, rateMult: 2.5,
    collisionPerPlanet: 0.010,
    civPassiveMult: 0.40, civClickMult: 6.0,
    icon: '💫', color: '#a855f7',
    desc: 'Три звезды. Хаотичные орбиты, частые сближения.',
    eccentricity: 0.25,      // Сильно вытянутые
    precession: 0.00005,     // Быстрая прецессия
    orbitDriftRate: 0.7,     // Заметный дрейф
    chaosticPulse: 0.001,    // Частые толчки
  },
};

// ─── Типы планет ────────────────────────────────────────────────
// civ   — может ли быть жизнь
// rate  — базовый доход пыли в секунду
// size  — визуальный множитель размера
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

// ─── Физические константы (Hayashi 1981) ────────────────────────
const PHYS = {
  refRadius: 100,   // 1 а.е. = 100 px
  refTemp: 280,     // T(1 а.е.) = 280 K
  snowLine: 270,    // 2.7 а.е. — снеговая линия
  refPeriod: 8,     // Секунд на оборот на радиусе 1 а.е.
};

window.CFG = CFG;
window.STAGES = STAGES;
window.STAR_TYPES = STAR_TYPES;
window.SYSTEM_TYPES = SYSTEM_TYPES;
window.PLANET_TYPES = PLANET_TYPES;
window.PHYS = PHYS;
