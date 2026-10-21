// ═══════════════════════════════════════════════════════════════
//  STATE.JS — центральное состояние игры и сохранение
//
//  Зависимости: config.js (STORAGE_CFG)
//  Экспортирует: window.S, saveGame, loadGame, resetGame, switchToSystem
//
//  Структура S:
//    • Фазы и прогресс: stage, phaseProgress, lastIgnitionQuality
//    • Ресурсы:         dust, energy, civLevel, metalAmount, storageLevels
//    • Системы:         planets, otherSystems, systems, activeSystemIdx
//    • Престиж:         prestigeLevel, galaxies, galaxyForm, galaxyMultiplier
//    • Прочее:          seenLore, seenMinigame, anticheat, primeSystem
//
//  Изменения сессии 2026-10-14 (ч.2):
//    • + seenMinigame — какие миниигры уже проходились (для кнопки «Пропустить»)
//    • + phaseProgress — счётчики активных действий в фазах I–III
//    • + lastIgnitionQuality — качество последнего зажигания
//    • − дубликат seenLore в saveGame()
//    • − слипшаяся строка в resetStateValues()
// ═══════════════════════════════════════════════════════════════

const S = {
  // ─── Фаза ───
  stage: 'cloud',

  // ─── Прогресс фазы I–III (активные действия) ───
  // cloud:     секунды удержания пальца
  // condense:  взвешенные секунды (удержание × скорость движения)
  // protostar: количество тапов
  // Обнуляется при переходе в следующую фазу (см. evolution.js).
  phaseProgress: { cloud: 0, condense: 0, protostar: 0 },
  lastIgnitionQuality: 0.5,   // 0..1, определяется в момент перехода III→IV
  protostarHeat: 0,   // 0..1, transient для фазы III (heat-механика)

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
  systemIncomeBonus: 0,
  systemShopProgress: { dust: 0, energy: 0, civ: 0 },

  // ─── Камера ───
  panX: 0, panY: 0, zoom: 1.0, rotation: 0,

  // ─── Миссии ───
  missions: [], comets: [], expeditions: [],
  explosions: [],

  // ─── Вторжения ───
  invasions: [], lastInvasionCheck: 0,

  // ─── Престиж (Сверхновая) ───
  prestigeLevel: 0,
  galaxies: 1,
  galaxyForm: 'spiral',
  galaxyMultiplier: 1,
  achievements: [],
  metalAmount: 0,

  // ─── Таймеры ───
  lastTick: Date.now(),
  eventTimer: 0, collisionTimer: 0,
  gammaDebuff: 0, gasDensity: 1,

  // ─── Мини-игра ───
  activeMinigame: null,

  // ─── Обучающие карточки ───
  seenLore: [],

  // ─── Журнал событий ───
  eventLog: [],
  eventLogUnread: 0,

  // ─── Мини-игры (какие уже проходились) ───
  // Ключи: 'mass' | 'ignite' | 'assemble' | '<type>_shown'
  // '_shown' → игрок прошёл эту миниигру хотя бы раз (можно показывать «Пропустить»)
  seenMinigame: {},

  // ─── Античит (только логирование) ───
  anticheat: { flags: 0, reasons: [], ts: 0, prestiges: [] },
  sessionStart: Date.now(),

  // ─── Прайм-система (одна на игрока) ───
  primeSystem: null,
  primeCandidates: [],

  // ─── 3D-обзор ───
  viewMode: 'normal',   // normal | free | tour
  tiltX: 0,
  tiltY: 0,

  // ─── Визуал ───
  vis: { collapse: 0 },
};

const SAVE_KEY = 'accretion_v17';   // v17: добавлены phaseProgress / seenMinigame
let isResetting = false;

// ─── Сброс к начальным значениям ────────────────────────────────
function resetStateValues() {
  S.stage = 'cloud';
  S.phaseProgress = { cloud: 0, condense: 0, protostar: 0 };
  S.lastIgnitionQuality = 0.5;
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
  S.seenLore = [];
  S.eventLog = [];
  S.eventLogUnread = 0;
  S.seenMinigame = {};
  S.anticheat = { flags: 0, reasons: [], ts: 0, prestiges: [] };
  S.sessionStart = Date.now();
  S.primeCandidates = [];
  S.viewMode = 'normal';
  S.tiltX = 0;
  S.tiltY = 0;

  // MISS живёт в missions.js — обнуляем синхронно
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
    if (typeof updateSystemSwitcher === 'function') updateSystemSwitcher();
    if (typeof updateUI === 'function') updateUI();
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
  if (typeof updateSystemSwitcher === 'function') updateSystemSwitcher();
  if (typeof updateUI === 'function') updateUI();
  return true;
}

// ─── Сохранение в localStorage ──────────────────────────────────
function saveGame() {
  if (isResetting) return;
  try {
    S.lastTick = Date.now();
    const data = {
      // Фаза и прогресс
      stage: S.stage,
      phaseProgress: S.phaseProgress,
      lastIgnitionQuality: S.lastIgnitionQuality,
      // Ресурсы
      dust: S.dust, dustTotal: S.dustTotal,
      energy: S.energy, civLevel: S.civLevel,
      storageLevels: S.storageLevels,
      storageProgress: S.storageProgress,
      // Звезда и системы
      starType: S.starType, systemType: S.systemType,
      planets: S.planets, systemName: S.systemName,
      otherSystems: S.otherSystems, activeSystemIdx: S.activeSystemIdx,
      systems: S.systems, totalSystemsCreated: S.totalSystemsCreated,
      systemIncomeBonus: S.systemIncomeBonus,
      systemShopProgress: S.systemShopProgress,
      // Камера
      panX: S.panX, panY: S.panY, zoom: S.zoom, rotation: S.rotation,
      // Миссии
      missions: S.missions, comets: S.comets, expeditions: S.expeditions,
      gasDensity: S.gasDensity,
      lastTick: S.lastTick,
      // Вторжения
      invasions: S.invasions, lastInvasionCheck: S.lastInvasionCheck,
      // Престиж
      prestigeLevel: S.prestigeLevel, galaxies: S.galaxies,
      galaxyForm: S.galaxyForm, galaxyMultiplier: S.galaxyMultiplier,
      achievements: S.achievements, metalAmount: S.metalAmount,
      // Обучающие карточки и миниигры
      seenLore: S.seenLore || [],
      eventLog: S.eventLog || [],
      eventLogUnread: S.eventLogUnread || 0,
      seenMinigame: S.seenMinigame || {},
      // Античит и Прайм
      anticheat: S.anticheat || null,
      primeSystem: S.primeSystem || null,
      primeCandidates: S.primeCandidates || [],
      // MISS из missions.js
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

    // ─── Защита от отсутствующих полей ───
    if (!S.phaseProgress) S.phaseProgress = { cloud: 0, condense: 0, protostar: 0 };
        // Активная миниигра — транзиентное состояние, не должно переживать перезагрузку.
    // Если осталось с прошлой сессии (например, после обновления кода) — сбрасываем.
    S.activeMinigame = null;
    if (typeof S.phaseProgress.cloud !== 'number') S.phaseProgress.cloud = 0;
    if (typeof S.phaseProgress.condense !== 'number') S.phaseProgress.condense = 0;
    if (typeof S.phaseProgress.protostar !== 'number') S.phaseProgress.protostar = 0;
    if (typeof S.lastIgnitionQuality !== 'number') S.lastIgnitionQuality = 0.5;
    if (typeof S.protostarHeat !== 'number') S.protostarHeat = 0;

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

    // Вторжения
    if (!Array.isArray(S.invasions)) S.invasions = [];
    if (typeof S.lastInvasionCheck !== 'number') S.lastInvasionCheck = 0;

    // Престиж
    if (typeof S.prestigeLevel !== 'number') S.prestigeLevel = 0;
    if (typeof S.galaxies !== 'number') S.galaxies = 1;
    if (!S.galaxyForm) S.galaxyForm = 'spiral';
    if (typeof S.galaxyMultiplier !== 'number') S.galaxyMultiplier = 1;
    if (!Array.isArray(S.achievements)) S.achievements = [];
    if (typeof S.metalAmount !== 'number') S.metalAmount = 0;

    // Лор и миниигры
    if (!Array.isArray(S.seenLore)) S.seenLore = [];
    if (!Array.isArray(S.eventLog)) S.eventLog = [];
    if (typeof S.eventLogUnread !== 'number') S.eventLogUnread = 0;
    if (!S.seenMinigame || typeof S.seenMinigame !== 'object') S.seenMinigame = {};

    // Античит и Прайм
    if (!S.anticheat) S.anticheat = { flags: 0, reasons: [], ts: 0, prestiges: [] };
    if (!Array.isArray(S.primeCandidates)) S.primeCandidates = [];

    // 3D-обзор
    if (typeof S.viewMode !== 'string') S.viewMode = 'normal';
    if (typeof S.tiltX !== 'number') S.tiltX = 0;
    if (typeof S.tiltY !== 'number') S.tiltY = 0;
    if (typeof S.sessionStart !== 'number') S.sessionStart = Date.now();

    // Магазин систем
    if (typeof S.systemIncomeBonus !== 'number') S.systemIncomeBonus = 0;
    if (!S.systemShopProgress) S.systemShopProgress = { dust: 0, energy: 0, civ: 0 };
    if (typeof S.systemShopProgress.dust !== 'number') S.systemShopProgress.dust = 0;
    if (typeof S.systemShopProgress.energy !== 'number') S.systemShopProgress.energy = 0;
    if (typeof S.systemShopProgress.civ !== 'number') S.systemShopProgress.civ = 0;

    // Бонус дохода берём из данных активной системы
    if (S.activeSystemIdx > 0 && S.otherSystems[S.activeSystemIdx] &&
        typeof S.otherSystems[S.activeSystemIdx].incomeBonus === 'number') {
      S.systemIncomeBonus = S.otherSystems[S.activeSystemIdx].incomeBonus;
    }

    // MISS из missions.js
    if (typeof MISS !== 'undefined') {
      MISS.comets = Array.isArray(data.missComets) ? data.missComets : [];
      MISS.expeditions = Array.isArray(data.missExpeditions) ? data.missExpeditions : [];
      MISS.lastCometAt = typeof data.missLastCometAt === 'number' ? data.missLastCometAt : 0;
      MISS.lastExpeditionAt = typeof data.missLastExpeditionAt === 'number' ? data.missLastExpeditionAt : 0;
    }

    // ─── Восстановление полей планет ───
    for (let i = 0; i < S.planets.length; i++) {
      const p = S.planets[i];
      if (!isFinite(p.baseOrbitR) || p.baseOrbitR <= 0) p.baseOrbitR = p.orbitR || 100;
      if (!isFinite(p.orbitR) || p.orbitR <= 0) p.orbitR = p.baseOrbitR;

      // ★ Миграция старых сейвов на новые орбиты.
      // Если планета стоит ближе первой орбиты — переносим на ближайшую.
      if (p.baseOrbitR < getOrbitR(0)) {
        let bestOrbit = p.baseOrbitR;
        let minDiff = Infinity;
        for (let j = 0; j < 8; j++) {
          const oR = getOrbitR(j);
          const diff = Math.abs(p.baseOrbitR - oR);
          if (diff < minDiff) {
            minDiff = diff;
            bestOrbit = oR;
          }
        }
        p.baseOrbitR = bestOrbit;
        p.orbitR = bestOrbit;
      }

      if (typeof p.forming !== 'boolean') p.forming = false;
      if (!isFinite(p.mass) || p.mass <= 0) p.mass = 1.0;
      if (!isFinite(p.diameter) || p.diameter <= 0) p.diameter = 1.0;
      if (!isFinite(p.angle)) p.angle = Math.random() * Math.PI * 2;
      if (!isFinite(p.speed) || p.speed <= 0) p.speed = 0.2 / Math.pow((p.baseOrbitR || 100) / 90, 1.5);
      if (!p.moons) p.moons = [];
      if (!isFinite(p.precession)) p.precession = 0;
      if (!isFinite(p.trueAnomaly)) p.trueAnomaly = p.angle || 0;
    }

     // ★ Автокоррекция залипшего stage:
    //   - 'firstPlanet' с уже существующими планетами → 'system'
    //   - 'system' с 8+ планетами → 'galaxy' (уже перешли)
    if (S.stage === 'firstPlanet' && S.planets && S.planets.length > 0) {
      S.stage = 'system';
    }
    if (S.stage === 'system' && S.planets && S.planets.length >= 8) {
      S.stage = 'galaxy';
    }
    // ★ Старые сейвы: престиж уже был, но stage остался 'system' —
    // переключаем в мета-цикл (сборка планет отключена).
    if (S.stage === 'system' && S.prestigeLevel > 0) {
      S.stage = 'galaxy';
    }

    // ★ Фаза VI: сбрасываем активную миниигру — в галактике её быть не должно
    if (S.stage === 'galaxy') {
      S.activeMinigame = null;
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

// ─── Экспорт ────────────────────────────────────────────────────
window.S = S;
window.saveGame = saveGame;
window.loadGame = loadGame;
window.resetGame = resetGame;
window.switchToSystem = switchToSystem;