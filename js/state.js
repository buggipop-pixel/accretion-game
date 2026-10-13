// ═══════════════════════════════════════════════════════════════
//  STATE.JS — центральное состояние игры и сохранение
//  Все данные игры хранятся в объекте S.
// ═══════════════════════════════════════════════════════════════

const S = {
  // ─── Фаза ───
  stage: 'cloud',

  // ─── Ресурсы ───
  dust: 0, dustTotal: 0,
  energy: 0, civLevel: 0,
  storageLevels: { dust: 1, energy: 1, civ: 1 },
  storageProgress: { dust: 0, energy: 0, civ: 0 },

  // ─── Звезда ───
  starType: null, systemType: null,

  // ─── Системы ───
  planets: [],
  systemName: 'Родная',
  otherSystems: [],
  activeSystemIdx: 0,
  systems: 1,
  totalSystemsCreated: 1,
  systemIncomeBonus: 0,   // бонус дохода активной системы (магазин систем)
  systemShopProgress: { dust: 0, energy: 0, civ: 0 },  // шкалы магазина систем

  // ─── Камера ───
  panX: 0, panY: 0, zoom: 1.0, rotation: 0,

  // ─── Миссии ───
  missions: [], comets: [], expeditions: [],
  explosions: [],

  // ─── Вторжения ───
  invasions: [], lastInvasionCheck: 0,

  // ─── Престиж (Сверхновая) ───
  prestigeLevel: 0,        // сколько сверхновых уже прошло
  galaxies: 1,             // количество галактик
  galaxyForm: 'spiral',    // форма галактики: spiral/elliptical/irregular/ring
  galaxyMultiplier: 1,     // множитель дохода за галактики
  achievements: [],        // достижения (пока пусто)
  metalAmount: 0,          // накопленные металлы

  // ─── Таймеры ───
  lastTick: Date.now(),
  eventTimer: 0, collisionTimer: 0,
  gammaDebuff: 0, gasDensity: 1,

  // ─── Мини-игра ───
  activeMinigame: null,

  // ─── Визуал ───
  vis: { collapse: 0 },
};

const SAVE_KEY = 'accretion_v16';
let isResetting = false;

// ─── Сброс к начальным значениям ────────────────────────────────
function resetStateValues() {
  S.stage = 'cloud';
  S.dust = 0; S.dustTotal = 0;
  S.energy = 0; S.civLevel = 0;
  S.storageLevels = { dust: 1, energy: 1, civ: 1 };
  S.storageProgress = { dust: 0, energy: 0, civ: 0 };
  S.starType = null; S.systemType = null;
  S.planets = [];
  S.systemName = 'Родная';
  S.otherSystems = []; S.activeSystemIdx = 0;
  S.systems = 1; S.totalSystemsCreated = 1;
  S.systemIncomeBonus = 0;
  S.systemShopProgress = { dust: 0, energy: 0, civ: 0 };
  S.panX = 0; S.panY = 0; S.zoom = 1.0; S.rotation = 0;
  S.missions = []; S.comets = []; S.expeditions = [];
  S.explosions = [];
  S.invasions = []; S.lastInvasionCheck = 0;
  S.prestigeLevel = 0; S.galaxies = 1; S.galaxyForm = 'spiral';
  S.galaxyMultiplier = 1; S.achievements = []; S.metalAmount = 0;
  if (typeof MISS !== 'undefined') {
    MISS.comets = []; MISS.expeditions = [];
    MISS.lastCometAt = 0; MISS.lastExpeditionAt = 0;
  }
  S.lastTick = Date.now();
  S.eventTimer = 0; S.collisionTimer = 0; S.gammaDebuff = 0;
  S.gasDensity = 1;
  S.activeMinigame = null;
  S.vis = { collapse: 0 };
}

// ─── Переключение между системами ───────────────────────────────
// Слот 0 — placeholder или родная система
// Слоты 1+ — основанные системы
function switchToSystem(idx) {
  if (idx === S.activeSystemIdx) return false;
  if (idx < 0) return false;

  const currentData = {
    name: S.systemName,
    starType: S.starType,
    systemType: S.systemType,
    planets: S.planets || [],
    incomeBonus: S.systemIncomeBonus || 0,
  };

  // Возврат на родную
  if (idx === 0) {
    const home = S.otherSystems[0];
    if (!home) return false;
    if (S.activeSystemIdx > 0) S.otherSystems[S.activeSystemIdx] = currentData;
    S.otherSystems[0] = null;
    S.systemName = home.name;
    S.starType = home.starType;
    S.systemType = home.systemType;
    S.planets = home.planets;
    S.systemIncomeBonus = home.incomeBonus || 0;
    S.activeSystemIdx = 0;
    return true;
  }

  const target = S.otherSystems[idx];
  if (!target) return false;

  if (S.activeSystemIdx === 0) S.otherSystems[0] = currentData;
  else S.otherSystems[S.activeSystemIdx] = currentData;

  S.systemName = target.name;
  S.starType = target.starType;
  S.systemType = target.systemType;
  S.planets = target.planets || [];
  S.systemIncomeBonus = target.incomeBonus || 0;
  S.activeSystemIdx = idx;
  return true;
}

// ─── Сохранение в localStorage ──────────────────────────────────
function saveGame() {
  if (isResetting) return;
  try {
    S.lastTick = Date.now();
    const data = {
      stage: S.stage, dust: S.dust, dustTotal: S.dustTotal,
      energy: S.energy, civLevel: S.civLevel,
      storageLevels: S.storageLevels,
      storageProgress: S.storageProgress,
      starType: S.starType, systemType: S.systemType,
      planets: S.planets, systemName: S.systemName,
      otherSystems: S.otherSystems, activeSystemIdx: S.activeSystemIdx,
      panX: S.panX, panY: S.panY, zoom: S.zoom, rotation: S.rotation,
      systems: S.systems, totalSystemsCreated: S.totalSystemsCreated,
      systemIncomeBonus: S.systemIncomeBonus,
      systemShopProgress: S.systemShopProgress,
      missions: S.missions, comets: S.comets, expeditions: S.expeditions,
      gasDensity: S.gasDensity,
      lastTick: S.lastTick,
      // ─── Вторжения ───
      invasions: S.invasions, lastInvasionCheck: S.lastInvasionCheck,
      // ─── Престиж ───
      prestigeLevel: S.prestigeLevel, galaxies: S.galaxies,
      galaxyForm: S.galaxyForm, galaxyMultiplier: S.galaxyMultiplier,
      achievements: S.achievements, metalAmount: S.metalAmount,
      // ─── Активные полёты (MISS из missions.js) ───
      missComets: (typeof MISS !== 'undefined') ? MISS.comets : [],
      missExpeditions: (typeof MISS !== 'undefined') ? MISS.expeditions : [],
      missLastCometAt: (typeof MISS !== 'undefined') ? MISS.lastCometAt : 0,
      missLastExpeditionAt: (typeof MISS !== 'undefined') ? MISS.lastExpeditionAt : 0,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) { console.warn('save error', e); }
}

// ─── Загрузка из localStorage ───────────────────────────────────
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    Object.assign(S, data);

    // Защита от отсутствующих полей
    if (!S.missions) S.missions = [];
    if (!S.comets) S.comets = [];
    if (!S.expeditions) S.expeditions = [];
    if (!S.otherSystems) S.otherSystems = [];
    if (typeof S.activeSystemIdx !== 'number') S.activeSystemIdx = 0;
    if (typeof S.rotation !== 'number') S.rotation = 0;
    if (typeof S.gasDensity !== 'number') S.gasDensity = 1;
    if (!S.systemName) S.systemName = 'Родная';
    if (!S.storageLevels) S.storageLevels = { dust: 1, energy: 1, civ: 1 };
    if (!S.storageProgress) S.storageProgress = { dust: 0, energy: 0, civ: 0 };
    // ─── Вторжения ───
    if (!Array.isArray(S.invasions)) S.invasions = [];
    if (typeof S.lastInvasionCheck !== 'number') S.lastInvasionCheck = 0;
    // ─── Престиж ───
    if (typeof S.prestigeLevel !== 'number') S.prestigeLevel = 0;
    if (typeof S.galaxies !== 'number') S.galaxies = 1;
    if (!S.galaxyForm) S.galaxyForm = 'spiral';
    if (typeof S.galaxyMultiplier !== 'number') S.galaxyMultiplier = 1;
    if (!Array.isArray(S.achievements)) S.achievements = [];
    if (typeof S.metalAmount !== 'number') S.metalAmount = 0;

    // ─── Магазин систем ───
    if (typeof S.systemIncomeBonus !== 'number') S.systemIncomeBonus = 0;
    if (!S.systemShopProgress) S.systemShopProgress = { dust: 0, energy: 0, civ: 0 };
    if (typeof S.systemShopProgress.dust !== 'number') S.systemShopProgress.dust = 0;
    if (typeof S.systemShopProgress.energy !== 'number') S.systemShopProgress.energy = 0;
    if (typeof S.systemShopProgress.civ !== 'number') S.systemShopProgress.civ = 0;
    // Бонус дохода берём из данных активной системы, если он там есть
    if (S.activeSystemIdx > 0 && S.otherSystems[S.activeSystemIdx] &&
        typeof S.otherSystems[S.activeSystemIdx].incomeBonus === 'number') {
      S.systemIncomeBonus = S.otherSystems[S.activeSystemIdx].incomeBonus;
    }

    // ─── Активные полёты: MISS живёт в missions.js ───
    if (typeof MISS !== 'undefined') {
      MISS.comets = Array.isArray(data.missComets) ? data.missComets : [];
      MISS.expeditions = Array.isArray(data.missExpeditions) ? data.missExpeditions : [];
      MISS.lastCometAt = typeof data.missLastCometAt === 'number' ? data.missLastCometAt : 0;
      MISS.lastExpeditionAt = typeof data.missLastExpeditionAt === 'number' ? data.missLastExpeditionAt : 0;
    }

    // Восстановление полей планет
    for (let i = 0; i < S.planets.length; i++) {
      const p = S.planets[i];
      // isFinite-проверки: typeof NaN === 'number', поэтому одной проверки типа мало
      if (!isFinite(p.baseOrbitR) || p.baseOrbitR <= 0) p.baseOrbitR = p.orbitR || 100;
      if (!isFinite(p.orbitR) || p.orbitR <= 0) p.orbitR = p.baseOrbitR;
      if (typeof p.forming !== 'boolean') p.forming = false;
      if (!isFinite(p.mass) || p.mass <= 0) p.mass = 1.0;
      if (!isFinite(p.diameter) || p.diameter <= 0) p.diameter = 1.0;
      if (!isFinite(p.angle)) p.angle = Math.random() * Math.PI * 2;
      if (!isFinite(p.speed) || p.speed <= 0) p.speed = 0.15 / Math.sqrt((p.baseOrbitR || 100) / 90);
      if (!p.moons) p.moons = [];
      // ★ Прецессия орбиты (для эллиптических орбит в двойных/тройных)
      if (!isFinite(p.precession)) p.precession = 0;
      // ★ Истинная аномалия (угол положения на эллипсе)
      if (!isFinite(p.trueAnomaly)) p.trueAnomaly = p.angle || 0;
    }

    S.vis.collapse = S.starType ? 1 : (S.stage === 'condense' ? 0.3 : 0);
  } catch (e) { console.warn('load error', e); }
}

function resetGame() {
  isResetting = true;
  localStorage.removeItem(SAVE_KEY);
  resetStateValues();
  setTimeout(function() { location.reload(); }, 50);
}

window.S = S;
window.saveGame = saveGame;
window.loadGame = loadGame;
window.resetGame = resetGame;
window.switchToSystem = switchToSystem;
