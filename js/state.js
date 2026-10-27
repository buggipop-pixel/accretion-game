// ═══════════════════════════════════════════════════════════════
//  STATE.JS — Центральное состояние игры и сохранение
// ═══════════════════════════════════════════════════════════════

const S = {
  // ─── Фазы и прогресс ───
  stage: 'cloud',
  activeEvent: null,
  lastEventAt: 0,
  phaseProgress: { cloud: 0, condense: 0, protostar: 0 },
  lastIgnitionQuality: 0.5,
  protostarHeat: 0,
  assemblyCooldownUntil: 0, // Защита от спама сборки планет
  evolutionPopupSuspended: false,
  // ─── Ресурсы ───
  dust: 0, dustTotal: 0,
  energy: 0, civLevel: 0,
  metalAmount: 0,
  storageLevels: { dust: 1, energy: 1, civ: 1 },
  storageProgress: { dust: 0, energy: 0, civ: 0 },
  boosters: { incomeUntil: 0 }, // Временный бустер x2
  // ─── Ежедневные награды ───
  dailyReward: { day: 0, lastClaimed: 0 },
  firstNightShieldUsed: false,
  // ─── Звезда и Системы ───
  starType: null, 
  systemType: null,
  systemName: 'Родная',
  planets: [],
  otherSystems: [],
  activeSystemIdx: 0,
  systems: 1,
  totalSystemsCreated: 1,
  systemIncomeBonus: 0,
  systemShopProgress: { dust: 0, energy: 0, civ: 0 },
  
  // ─── Прайм-система ───
  primeSystem: null,
  primeCandidates: [],

  // ─── Ночной режим и защита ───
  nightConfig: { mode: 'balanced', defenseEnabled: true, cometHours: 0, expeditionPercent: 0 },
  nightDefenseLevel: 0,
  nightDefenseExpiresAt: 0,
  shieldUntil: 0,
  offlineAttacksDone: 0,
  trophyContracts: [],
  activeTrophyEffects: [],

  // ─── Камера ───
  panX: 0, panY: 0, zoom: 1.0, rotation: 0,
  viewMode: 'normal', tiltX: 0, tiltY: 0,

  // ─── Вторжения ───
  invasions: [], lastInvasionCheck: 0,
  explosions: [],
  // ─── Престиж ───
  prestigeLevel: 0,
  galaxies: 1,
  galaxyForm: 'spiral',
  galaxyMultiplier: 1,
  achievements: [],

  // ─── Достижения и Ежедневки ───
  unlockedAch: {},
  stats: { comets: 0, expeditions: 0, invasionsDefeated: 0, clicks: 0, planets: 0, dailyClaims: 0 },
  dailyProgress: {},
  dailyClaimed: {},
  lastDailyReset: 0,

  // ─── Вспомогательные таймеры ───
  lastTick: Date.now(),
  eventTimer: 0, collisionTimer: 0,
  gammaDebuff: 0, gasDensity: 1,
  activeMinigame: null,

  // ─── Лор и Журнал ───
  seenLore: [],
  seenMinigame: {},
  eventLog: [],
  eventLogUnread: 0,

  // ─── Античит и Сессия ───
  anticheat: { flags: 0, reasons: [], ts: 0, prestiges: [] },
  sessionStart: Date.now(),

  // ─── Настройки и Визуал ───
  settings: { brightness: 1.0, sound: true },
  vis: { collapse: 0 },
};

const SAVE_KEY = 'accretion_v17';
let isResetting = false;

// ═══════════════════════════════════════════════════════════════
//  СБРОС ЗНАЧЕНИЙ (используется при престиже и перезапуске)
// ═══════════════════════════════════════════════════════════════
function resetStateValues() {
  S.dailyReward = { day: 0, lastClaimed: 0 };
  S.firstNightShieldUsed = false;
  S.stage = 'cloud';
  S.activeEvent = null;
  S.lastEventAt = 0;
  S.phaseProgress = { cloud: 0, condense: 0, protostar: 0 };
  S.lastIgnitionQuality = 0.5;
  S.protostarHeat = 0;
  S.assemblyCooldownUntil = 0;
  S.evolutionPopupSuspended = false;
  S.dust = 0; S.dustTotal = 0;
  S.energy = 0; S.civLevel = 0; S.metalAmount = 0;
  S.storageLevels = { dust: 1, energy: 1, civ: 1 };
  S.storageProgress = { dust: 0, energy: 0, civ: 0 };
  S.boosters = { incomeUntil: 0 };

  S.starType = null; S.systemType = null;
  S.planets = [];
  S.systemName = 'Родная';
  S.otherSystems = []; S.activeSystemIdx = 0;
  S.systems = 1; S.totalSystemsCreated = 1;
  S.systemIncomeBonus = 0;
  S.systemShopProgress = { dust: 0, energy: 0, civ: 0 };
  
  S.primeSystem = null;
  S.primeCandidates = [];

  S.nightConfig = { mode: 'balanced', defenseEnabled: true, cometHours: 0, expeditionPercent: 0 };
  S.nightDefenseLevel = 0;
  S.nightDefenseExpiresAt = 0;
  S.shieldUntil = 0;
  S.offlineAttacksDone = 0;
  S.trophyContracts = [];
  S.activeTrophyEffects = [];

  S.panX = 0; S.panY = 0; S.zoom = 1.0; S.rotation = 0;
  S.viewMode = 'normal'; S.tiltX = 0; S.tiltY = 0;

  S.invasions = []; S.lastInvasionCheck = 0;
  S.explosions = [];
  S.prestigeLevel = 0; S.galaxies = 1; S.galaxyForm = 'spiral';
  S.galaxyMultiplier = 1; S.achievements = [];

  S.unlockedAch = {};
  S.stats = { comets: 0, expeditions: 0, invasionsDefeated: 0, clicks: 0, planets: 0, dailyClaims: 0 };
  S.dailyProgress = {};
  S.dailyClaimed = {};
  S.lastDailyReset = 0;

  S.seenLore = [];
  S.seenMinigame = {};
  S.eventLog = [];
  S.eventLogUnread = 0;

  S.anticheat = { flags: 0, reasons: [], ts: 0, prestiges: [] };
  S.sessionStart = Date.now();

  S.lastTick = Date.now();
  S.eventTimer = 0; S.collisionTimer = 0; S.gammaDebuff = 0;
  S.gasDensity = 1;
  S.activeMinigame = null;
  S.settings = { brightness: 1.0, sound: true };
  S.vis = { collapse: 0 };

  // Синхронизация с missions.js
  if (typeof MISS !== 'undefined') {
    MISS.comets = []; MISS.expeditions = [];
    MISS.lastCometAt = 0; MISS.lastExpeditionAt = 0;
  }
}

// ═══════════════════════════════════════════════════════════════
//  ПЕРЕКЛЮЧЕНИЕ СИСТЕМ (с сохранением Прайм-объектов)
// ═══════════════════════════════════════════════════════════════
function switchToSystem(idx) {
  if (idx === S.activeSystemIdx) return false;
  if (idx < 0) return false;

  const currentData = {
    name: S.systemName,
    starType: S.starType,
    systemType: S.systemType,
    planets: S.planets || [],
    incomeBonus: S.systemIncomeBonus || 0,
    isPrime: !!S.primeSystem,
    primeData: S.primeSystem || null
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
    S.primeSystem = home.isPrime ? home.primeData : null;
    S.activeSystemIdx = 0;
    S.panX = 0; S.panY = 0; S.zoom = 1; S.rotation = 0; S.tiltX = 0; S.tiltY = 0;
    if (typeof updateSystemSwitcher === 'function') updateSystemSwitcher();
    if (typeof updateUI === 'function') updateUI();
    return true;
  }

  // Переход на другую
  const target = S.otherSystems[idx];
  if (!target) return false;

  if (S.activeSystemIdx === 0) S.otherSystems[0] = currentData;
  else S.otherSystems[S.activeSystemIdx] = currentData;

  S.systemName = target.name;
  S.starType = target.starType;
  S.systemType = target.systemType;
  S.planets = target.planets || [];
  S.systemIncomeBonus = target.incomeBonus || 0;
  S.primeSystem = target.isPrime ? target.primeData : null;
  S.activeSystemIdx = idx;
  S.panX = 0; S.panY = 0; S.zoom = 1; S.rotation = 0; S.tiltX = 0; S.tiltY = 0;
  if (typeof updateSystemSwitcher === 'function') updateSystemSwitcher();
  if (typeof updateUI === 'function') updateUI();
  return true;
}

// ═══════════════════════════════════════════════════════════════
//  СОХРАНЕНИЕ И ЗАГРУЗКА
// ═══════════════════════════════════════════════════════════════
function saveGame() {
  if (isResetting) return;
  try {
    S.lastTick = Date.now();
    const data = {
      // Фаза и прогресс
      stage: S.stage, phaseProgress: S.phaseProgress,
      lastIgnitionQuality: S.lastIgnitionQuality, assemblyCooldownUntil: S.assemblyCooldownUntil,
      evolutionPopupSuspended: S.evolutionPopupSuspended || false,
      // Ресурсы
      dust: S.dust, dustTotal: S.dustTotal,
      energy: S.energy, civLevel: S.civLevel, metalAmount: S.metalAmount,
      storageLevels: S.storageLevels, storageProgress: S.storageProgress,
      boosters: S.boosters,
      dailyReward: S.dailyReward,
      firstNightShieldUsed: S.firstNightShieldUsed,
      // Звезда и Системы
      starType: S.starType, systemType: S.systemType,
      planets: S.planets, systemName: S.systemName,
      otherSystems: S.otherSystems, activeSystemIdx: S.activeSystemIdx,
      systems: S.systems, totalSystemsCreated: S.totalSystemsCreated,
      systemIncomeBonus: S.systemIncomeBonus, systemShopProgress: S.systemShopProgress,
      primeSystem: S.primeSystem, primeCandidates: S.primeCandidates,

      // Ночной режим и защита
      nightConfig: S.nightConfig, nightDefenseLevel: S.nightDefenseLevel,
      nightDefenseExpiresAt: S.nightDefenseExpiresAt, shieldUntil: S.shieldUntil,
      offlineAttacksDone: S.offlineAttacksDone, trophyContracts: S.trophyContracts,
      activeTrophyEffects: S.activeTrophyEffects,

      // Камера
      panX: S.panX, panY: S.panY, zoom: S.zoom, rotation: S.rotation,
      viewMode: S.viewMode, tiltX: S.tiltX, tiltY: S.tiltY,
      
      // Вторжения
      invasions: S.invasions, lastInvasionCheck: S.lastInvasionCheck,
      activeEvent: S.activeEvent,
      lastEventAt: S.lastEventAt,
      
      // Престиж и ачивки
      prestigeLevel: S.prestigeLevel, galaxies: S.galaxies,
      galaxyForm: S.galaxyForm, galaxyMultiplier: S.galaxyMultiplier,
      achievements: S.achievements, unlockedAch: S.unlockedAch,
      stats: S.stats, dailyProgress: S.dailyProgress, dailyClaimed: S.dailyClaimed, lastDailyReset: S.lastDailyReset,
      
      // Лор и Журнал
      seenLore: S.seenLore, seenMinigame: S.seenMinigame,
      eventLog: S.eventLog, eventLogUnread: S.eventLogUnread,
      
      // Античит и настройки
      anticheat: S.anticheat, sessionStart: S.sessionStart,
      settings: S.settings, lastTick: S.lastTick, gasDensity: S.gasDensity,

      // MISS из missions.js
      missComets: (typeof MISS !== 'undefined') ? MISS.comets : [],
      missExpeditions: (typeof MISS !== 'undefined') ? MISS.expeditions : [],
      missLastCometAt: (typeof MISS !== 'undefined') ? MISS.lastCometAt : 0,
      missLastExpeditionAt: (typeof MISS !== 'undefined') ? MISS.lastExpeditionAt : 0,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) { console.warn('save error', e); }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    Object.assign(S, data);

    // ─── 1. Восстановление базовых полей и защита от undefined ───
    if (!S.phaseProgress) S.phaseProgress = { cloud: 0, condense: 0, protostar: 0 };
    S.activeMinigame = null;
    if (typeof S.phaseProgress.cloud !== 'number') S.phaseProgress.cloud = 0;
    if (typeof S.phaseProgress.condense !== 'number') S.phaseProgress.condense = 0;
    if (typeof S.phaseProgress.protostar !== 'number') S.phaseProgress.protostar = 0;
    if (typeof S.lastIgnitionQuality !== 'number') S.lastIgnitionQuality = 0.5;
    if (typeof S.protostarHeat !== 'number') S.protostarHeat = 0;
    if (typeof S.assemblyCooldownUntil !== 'number') S.assemblyCooldownUntil = 0;
    if (typeof S.evolutionPopupSuspended !== 'boolean') S.evolutionPopupSuspended = false;
    if (typeof S.metalAmount !== 'number') S.metalAmount = 0;
    if (!S.dailyReward || typeof S.dailyReward !== 'object') S.dailyReward = { day: 0, lastClaimed: 0 };
    if (typeof S.dailyReward.day !== 'number') S.dailyReward.day = 0;
    if (typeof S.dailyReward.lastClaimed !== 'number') S.dailyReward.lastClaimed = 0;
    if (typeof S.firstNightShieldUsed !== 'boolean') S.firstNightShieldUsed = false;
    if (!S.otherSystems) S.otherSystems = [];
    if (typeof S.activeSystemIdx !== 'number') S.activeSystemIdx = 0;
    if (typeof S.rotation !== 'number') S.rotation = 0;
    if (typeof S.gasDensity !== 'number') S.gasDensity = 1;
    if (!S.systemName) S.systemName = 'Родная';
    if (!S.storageLevels) S.storageLevels = { dust: 1, energy: 1, civ: 1 };
    if (!S.storageProgress) S.storageProgress = { dust: 0, energy: 0, civ: 0 };
    if (!S.boosters) S.boosters = { incomeUntil: 0 };

    // ─── 2. Вторжения ───
    if (!Array.isArray(S.invasions)) S.invasions = [];
    if (typeof S.lastEventAt !== 'number') S.lastEventAt = 0;
    if (!S.activeEvent || typeof S.activeEvent !== 'object') S.activeEvent = null;
    if (typeof S.lastInvasionCheck !== 'number') S.lastInvasionCheck = 0;

    // ─── 3. Престиж ───
    if (typeof S.prestigeLevel !== 'number') S.prestigeLevel = 0;
    if (typeof S.galaxies !== 'number') S.galaxies = 1;
    if (!S.galaxyForm) S.galaxyForm = 'spiral';
    if (typeof S.galaxyMultiplier !== 'number') S.galaxyMultiplier = 1;
    if (!Array.isArray(S.achievements)) S.achievements = [];

    // ─── 4. Достижения и Ежедневки ───
    if (!S.unlockedAch || typeof S.unlockedAch !== 'object' || Array.isArray(S.unlockedAch)) S.unlockedAch = {};
    if (!S.stats || typeof S.stats !== 'object' || Array.isArray(S.stats)) S.stats = {};
    if (typeof S.stats.comets !== 'number') S.stats.comets = 0;
    if (typeof S.stats.expeditions !== 'number') S.stats.expeditions = 0;
    if (typeof S.stats.invasionsDefeated !== 'number') S.stats.invasionsDefeated = 0;
    if (typeof S.stats.clicks !== 'number') S.stats.clicks = 0;
    if (typeof S.stats.planets !== 'number') S.stats.planets = 0;
    if (typeof S.stats.dailyClaims !== 'number') S.stats.dailyClaims = 0;
    if (!S.dailyProgress || typeof S.dailyProgress !== 'object') S.dailyProgress = {};
    if (!S.dailyClaimed || typeof S.dailyClaimed !== 'object') S.dailyClaimed = {};
    if (typeof S.lastDailyReset !== 'number') S.lastDailyReset = 0;

    // ─── 5. Лор, Журнал и Мини-игры ───
    if (!Array.isArray(S.seenLore)) S.seenLore = [];
    if (!Array.isArray(S.eventLog)) S.eventLog = [];
    if (typeof S.eventLogUnread !== 'number') S.eventLogUnread = 0;
    if (!S.seenMinigame || typeof S.seenMinigame !== 'object') S.seenMinigame = {};

    // ─── 6. Античит и Прайм ───
    if (!S.anticheat) S.anticheat = { flags: 0, reasons: [], ts: 0, prestiges: [] };
    if (!Array.isArray(S.primeCandidates)) S.primeCandidates = [];
    if (!S.primeSystem) S.primeSystem = null;
        // ★ Лечим старые сейвы: если Прайм есть, но данные потерялись — восстанавливаем
    for (let i = 1; i < S.otherSystems.length; i++) {
      const sys = S.otherSystems[i];
      if (sys && sys.isPrime && !sys.primeData) {
        sys.primeData = { 
          objectKey: 'blackHole', 
          objectName: 'Чёрная дыра', 
          objectIcon: 'blackHole', 
          bonus: { dustMult: 0.25 }, 
          absorbRadius: 150 
        };
      }
    }

    // ─── 7. Ночной режим и защита ───
    if (!S.nightConfig || typeof S.nightConfig !== 'object') {
      S.nightConfig = { mode: 'balanced', defenseEnabled: true, cometHours: 0, expeditionPercent: 0 };
    }
    if (typeof S.nightConfig.mode !== 'string') S.nightConfig.mode = 'balanced';
    if (typeof S.nightConfig.defenseEnabled !== 'boolean') S.nightConfig.defenseEnabled = true;
    if (typeof S.nightConfig.cometHours !== 'number') S.nightConfig.cometHours = 0;
    if (typeof S.nightConfig.expeditionPercent !== 'number') S.nightConfig.expeditionPercent = 0;
    if (typeof S.nightDefenseLevel !== 'number') S.nightDefenseLevel = 0;
    if (typeof S.nightDefenseExpiresAt !== 'number') S.nightDefenseExpiresAt = 0;
    if (typeof S.shieldUntil !== 'number') S.shieldUntil = 0;
    if (typeof S.offlineAttacksDone !== 'number') S.offlineAttacksDone = 0;
    if (!Array.isArray(S.trophyContracts)) S.trophyContracts = [];
    if (!Array.isArray(S.activeTrophyEffects)) S.activeTrophyEffects = [];

    // ─── 8. Камера и Настройки ───
    if (typeof S.viewMode !== 'string') S.viewMode = 'normal';
    if (typeof S.tiltX !== 'number') S.tiltX = 0;
    if (typeof S.tiltY !== 'number') S.tiltY = 0;
    if (typeof S.sessionStart !== 'number') S.sessionStart = Date.now();
    if (!S.settings) S.settings = { brightness: 1.0, sound: true };
    if (typeof S.settings.brightness !== 'number') S.settings.brightness = 1.0;
    if (typeof S.settings.sound !== 'boolean') S.settings.sound = true;

    // ─── 9. Магазин систем ───
    if (typeof S.systemIncomeBonus !== 'number') S.systemIncomeBonus = 0;
    if (!S.systemShopProgress) S.systemShopProgress = { dust: 0, energy: 0, civ: 0 };
    if (typeof S.systemShopProgress.dust !== 'number') S.systemShopProgress.dust = 0;
    if (typeof S.systemShopProgress.energy !== 'number') S.systemShopProgress.energy = 0;
    if (typeof S.systemShopProgress.civ !== 'number') S.systemShopProgress.civ = 0;

    if (S.activeSystemIdx > 0 && S.otherSystems[S.activeSystemIdx] && typeof S.otherSystems[S.activeSystemIdx].incomeBonus === 'number') {
      S.systemIncomeBonus = S.otherSystems[S.activeSystemIdx].incomeBonus;
    }

    // ─── 10. MISS из missions.js ───
    if (typeof MISS !== 'undefined') {
      MISS.comets = Array.isArray(data.missComets) ? data.missComets : [];
      MISS.expeditions = Array.isArray(data.missExpeditions) ? data.missExpeditions : [];
      MISS.lastCometAt = typeof data.missLastCometAt === 'number' ? data.missLastCometAt : 0;
      MISS.lastExpeditionAt = typeof data.missLastExpeditionAt === 'number' ? data.missLastExpeditionAt : 0;
    }

    // ─── 11. Восстановление планет (от битых данных) ───
    if (S.planets) {
      S.planets = S.planets.filter(p => p && typeof p === 'object' && isFinite(p.baseOrbitR));
      
      for (let i = 0; i < S.planets.length; i++) {
        const p = S.planets[i];
        if (!isFinite(p.baseOrbitR) || p.baseOrbitR <= 0) p.baseOrbitR = p.orbitR || 100;
        if (!isFinite(p.orbitR) || p.orbitR <= 0) p.orbitR = p.baseOrbitR;

        // Миграция старых сейвов на новые орбиты
        if (p.baseOrbitR < getOrbitR(0)) {
          let bestOrbit = p.baseOrbitR;
          let minDiff = Infinity;
          for (let j = 0; j < 8; j++) {
            const oR = getOrbitR(j);
            const diff = Math.abs(p.baseOrbitR - oR);
            if (diff < minDiff) { minDiff = diff; bestOrbit = oR; }
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
    }

    // ─── 12. Автокоррекция фазы (защита от залипания) ───
    if (S.stage === 'firstPlanet' && S.planets && S.planets.length > 0) {
      S.stage = 'system';
    }
    if (S.stage === 'system' && S.prestigeLevel > 0) {
      S.stage = 'galaxy';
    }
    if (S.stage === 'galaxy') {
      S.activeMinigame = null;
    }

    S.vis.collapse = S.starType ? 1 : (S.stage === 'condense' ? 0.3 : 0);
  } catch (e) { console.warn('load error', e); }
}

// ═══════════════════════════════════════════════════════════════
//  ЭКСПОРТ
// ═══════════════════════════════════════════════════════════════
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