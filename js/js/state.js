// ═══════════════════════════════════════════════════════════════
//  STATE.JS — состояние игры и сохранение
//  S — глобальный объект со всеми данными игрока
// ═══════════════════════════════════════════════════════════════

const S = {
  // Фаза игры
  stage: 'cloud',

  // Ресурсы
  dust: 0,           // пыль
  dustTotal: 0,      // всего добыто пыли (для статистики)
  energy: 0,         // энергия (новая валюта)
  civLevel: 0,       // уровень цивилизации

  // Прогресс
  starType: null,    // тип звезды (M/K/G/A/B)
  systemType: null,  // тип системы (single/binary/trinary)
  planets: [],       // массив планет
  systems: 1,        // количество систем

  // Активные процессы
  missions: [],      // активные экспедиции и кометы
  flights: [],       // визуальные полёты
  invasions: [],     // активные вторжения

  // Кулдауны
  cooldowns: { expedition: 0, comet: 0 },

  // Таймеры
  lastTick: Date.now(),
  eventTimer: 0,
  choiceTimer: 0,
  collisionTimer: 0,
  gammaDebuff: 0,

  // Визуал
  vis: { collapse: 0 },
  particles: [],
};

// ═══════════════════════════════════════════════════════════════
//  СОХРАНЕНИЕ И ЗАГРУЗКА
//  Используем localStorage браузера
// ═══════════════════════════════════════════════════════════════

const SAVE_KEY = 'accretion_v13';

// Сохранить игру
function saveGame() {
  try {
    S.lastTick = Date.now();
    const data = {
      stage: S.stage,
      dust: S.dust,
      dustTotal: S.dustTotal,
      energy: S.energy,
      civLevel: S.civLevel,
      starType: S.starType,
      systemType: S.systemType,
      planets: S.planets,
      systems: S.systems,
      cooldowns: S.cooldowns,
      missions: S.missions,
      gammaDebuff: S.gammaDebuff,
      lastTick: S.lastTick,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Не удалось сохранить:', e);
  }
}

// Загрузить игру
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    Object.assign(S, data);

    // Восстанавливаем значения по умолчанию, если их нет
    if (!S.cooldowns) S.cooldowns = { expedition: 0, comet: 0 };
    if (!S.missions) S.missions = [];
    if (!S.flights) S.flights = [];
    if (!S.invasions) S.invasions = [];
    if (!S.systems) S.systems = 1;
    if (typeof S.civLevel !== 'number') S.civLevel = 0;
    if (typeof S.energy !== 'number') S.energy = 0;

    // Проверяем целостность планет
    for (const p of S.planets) {
      if (!p.baseOrbitR) p.baseOrbitR = p.orbitR || 100;
      if (typeof p.forming !== 'boolean') p.forming = false;
    }

    // Восстанавливаем визуал
    S.vis.collapse = S.starType ? 1 : (S.stage === 'condense' ? 0.3 : 0);

    // Офлайн-доход считается позже, в economy.js
  } catch (e) {
    console.warn('Не удалось загрузить:', e);
  }
}

// Полный сброс
function resetGame() {
  localStorage.removeItem(SAVE_KEY);
  location.reload();
}

// Экспорт в window
window.S = S;
window.saveGame = saveGame;
window.loadGame = loadGame;
window.resetGame = resetGame;
