// ═══════════════════════════════════════════════════════════════
//  STATE.JS — состояние игры и сохранение
// ═══════════════════════════════════════════════════════════════

const S = {
  stage: 'cloud',

  // Ресурсы
  dust: 0,
  dustTotal: 0,
  energy: 0,
  civLevel: 0,

  // Прогресс
  starType: null,
  systemType: null,
  planets: [],
  systems: 1,

  // Активные процессы
  missions: [],
  flights: [],
  invasions: [],

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

const SAVE_KEY = 'accretion_v13';

// Флаг: идёт сброс — не сохранять!
let isResetting = false;

// ─── ФУНКЦИЯ СБРОСА ЗНАЧЕНИЙ ────────────────────────────────────
// Возвращает S в исходное состояние
function resetStateValues() {
  S.stage = 'cloud';
  S.dust = 0;
  S.dustTotal = 0;
  S.energy = 0;
  S.civLevel = 0;
  S.starType = null;
  S.systemType = null;
  S.planets = [];
  S.systems = 1;
  S.missions = [];
  S.flights = [];
  S.invasions = [];
  S.cooldowns = { expedition: 0, comet: 0 };
  S.lastTick = Date.now();
  S.eventTimer = 0;
  S.choiceTimer = 0;
  S.collisionTimer = 0;
  S.gammaDebuff = 0;
  S.vis = { collapse: 0 };
}

// ─── СОХРАНЕНИЕ ─────────────────────────────────────────────────
function saveGame() {
  if (isResetting) return; // защита от перезаписи при сбросе
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

// ─── ЗАГРУЗКА ───────────────────────────────────────────────────
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    Object.assign(S, data);

    if (!S.cooldowns) S.cooldowns = { expedition: 0, comet: 0 };
    if (!S.missions) S.missions = [];
    if (!S.flights) S.flights = [];
    if (!S.invasions) S.invasions = [];
    if (!S.systems) S.systems = 1;
    if (typeof S.civLevel !== 'number') S.civLevel = 0;
    if (typeof S.energy !== 'number') S.energy = 0;

    for (const p of S.planets) {
      if (!p.baseOrbitR) p.baseOrbitR = p.orbitR || 100;
      if (typeof p.forming !== 'boolean') p.forming = false;
    }

    S.vis.collapse = S.starType ? 1 : (S.stage === 'condense' ? 0.3 : 0);
  } catch (e) {
    console.warn('Не удалось загрузить:', e);
  }
}

// ─── ПОЛНЫЙ СБРОС ───────────────────────────────────────────────
function resetGame() {
  isResetting = true;                       // блокируем saveGame
  localStorage.removeItem(SAVE_KEY);        // удаляем сохранение
  resetStateValues();                        // обнуляем S
  setTimeout(function() {
    location.reload();                       // перезагружаем страницу
  }, 50);
}

window.S = S;
window.saveGame = saveGame;
window.loadGame = loadGame;
window.resetGame = resetGame;
window.resetStateValues = resetStateValues;
