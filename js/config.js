// CONFIG.JS — настройки игры
const CFG = {
  clickBase: 1,
  offlineCapHours: 4,
  offlineEfficiency: 0.5,
  eventInterval: 200,
  eventChance: 0.5,
  choiceEventInterval: 320,
  expeditionCooldown: 90,
  cometCooldown: 60,
  expeditionFlightBase: 180,
  cometFlightBase: 120,
  collisionInterval: 60,
  formationDuration: 600,
  colonyChanceMax: 0.05,
  civGrowthPerPlanet: 0.02,
  civClickBoost: 0.02,
};

const STAGES = {
  cloud: {
    tag: 'ФАЗА I', scale: 'ОБЛАКО', name: 'Молекулярное облако',
    desc: 'Проведи пальцем — собери пыль.',
    goal: 500, baseRate: 0, clickRate: 1,
    goalLabel: 'Накопи 500 пылинок',
  },
  condense: {
    tag: 'ФАЗА II', scale: 'ОБЛАКО', name: 'Уплотнение',
    desc: 'Гравитация стягивает облако. Пассивный поток слабый.',
    goal: 25000, baseRate: 0.05, clickRate: 2,
    goalLabel: 'Накопи 25 000 пыли',
  },
  protostar: {
    tag: 'ФАЗА III', scale: 'ЗВЕЗДА', name: 'Протозвезда',
    desc: 'Звезда зажглась. Гравитация собирает пыль медленно.',
    goal: 200000, baseRate: 5, clickRate: 5,
    goalLabel: 'Накопи 200 000 пыли',
  },
  firstPlanet: {
    tag: 'ФАЗА IV', scale: 'ЗВЕЗДА', name: 'Первая планета',
    desc: 'Диск остывает. Пора сформировать первую планету.',
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

const STAR_TYPES = {
  M: { name: 'Красный карлик', color: 8, sat: 92, light: 60,
       rateMult: 6, civ: false, size: 0.65,
       desc: 'Живёт >56 млрд лет. Огромный пассив, но без цивилизаций.' },
  K: { name: 'Оранжевый карлик', color: 32, sat: 88, light: 68,
       rateMult: 3, civ: true, maxCiv: 7, size: 0.85,
       desc: 'Живёт 17–40 млрд лет. Баланс дохода и жизни.' },
  G: { name: 'Жёлтый карлик', color: 50, sat: 95, light: 74,
       rateMult: 1.5, civ: true, maxCiv: 10, size: 1.0,
       desc: 'Аналог Солнца. Все ветки доступны.' },
  A: { name: 'Белая звезда', color: 210, sat: 25, light: 88,
       rateMult: 2, civ: false, size: 1.25,
       desc: 'Живёт <7 млрд лет. Активное развитие, без цивилизаций.' },
  B: { name: 'Голубая звезда', color: 220, sat: 78, light: 78,
       rateMult: 3.5, civ: false, size: 1.6,
       desc: 'Живёт <400 млн лет. Максимальная скорость.' },
};

const SYSTEM_TYPES = {
  single: { name: 'Одиночная', stars: 1, chance: 0.50,
    rateMult: 1.0, collisionPerPlanet: 0,
    civPassiveMult: 1.0, civClickMult: 1.0,
    icon: '⭐', color: '#6b4de6',
    desc: 'Как Солнце. Стабильные орбиты, предсказуемое развитие.' },
  binary: { name: 'Двойная', stars: 2, chance: 0.38,
    rateMult: 1.7, collisionPerPlanet: 0.003,
    civPassiveMult: 0.65, civClickMult: 3.0,
    icon: '✨', color: '#8b5cf6',
    desc: 'Две звезды. Выше доход, но нестабильные орбиты.' },
  trinary: { name: 'Кратная', stars: 3, chance: 0.12,
    rateMult: 2.5, collisionPerPlanet: 0.010,
    civPassiveMult: 0.40, civClickMult: 6.0,
    icon: '💫', color: '#a855f7',
    desc: 'Три звезды. Максимум энергии, хаотичные орбиты.' },
};

const PLANET_TYPES = {
  rocky: { name: 'Каменная', color: '#8a7159', civ: true, rate: 200,
           size: 1.0, desc: 'Землеподобный мир. Основа для жизни.' },
  superEarth: { name: 'Суперземля', color: '#5a9c6e', civ: true, rate: 400,
                size: 1.3, desc: 'Массивнее Земли. Ускоренная жизнь.' },
  iceGiant: { name: 'Ледяной гигант', color: '#7ec8e3', civ: false, rate: 600,
              size: 1.5, desc: 'Источник комет.' },
  gasGiant: { name: 'Газовый гигант', color: '#d4a76a', civ: false, rate: 800,
              size: 1.8, desc: 'Гравитационный щит системы.' },
  lava: { name: 'Лава-планета', color: '#ff4a22', civ: false, rate: 1200,
          size: 0.9, desc: 'Раскалённый мир. Максимальный доход.' },
};

window.CFG = CFG;
window.STAGES = STAGES;
window.STAR_TYPES = STAR_TYPES;
window.SYSTEM_TYPES = SYSTEM_TYPES;
window.PLANET_TYPES = PLANET_TYPES;
