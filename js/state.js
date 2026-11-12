// ═══════════════════════════════════════════════════════════════
//  STATE.JS — Центральное состояние игры и сохранение
// ═══════════════════════════════════════════════════════════════

const S = {
  // ─── Фазы и прогресс ───
  stage: 'cloud',
  tutorialStep: 0, // Обучалка: 0 — выключена, 1-5 — шаги
  tutorialDone: false, // Прошёл ли игрок обучение (не показываем повторно)
  // ★ Новое поэтапное обучение (js/tutorial.js): прогресс по шагам.
  //   done — карта пройденных шагов, off — пауза, isNew — первый запуск.
  tut: { v: 2, done: {}, off: false, isNew: false, migrated: 0 },
  activeEvent: null, // legacy: старые глобальные события (мигрируют при загрузке)
  lastEventAt: 0, // legacy
  lastRandomEvent: 0, // legacy
  activeRandomEvent: null, // текущее интерактивное событие (босс/тапы/выбор)
  activeWorldEvents: [], // активные daily/weekly модификаторы
  lastDailyEventDay: 0, // индекс дня последнего ежедневного события
  lastWeeklyEventWeek: 0, // индекс недели последнего еженедельного события
  weeklyEventPlan: null, // { week, dayOffset, eventId }
  phaseProgress: { cloud: 0, condense: 0, protostar: 0 },
  lastIgnitionQuality: 0.5,
  protostarHeat: 0,
  assemblyCooldownUntil: 0, // Защита от спама сборки планет
  evolutionPopupSuspended: false,
  // ─── Ресурсы ───
  dust: 0, dustTotal: 0,
  energy: 0, civLevel: 0,
  metalAmount: 0,
  fleet: { interceptor: 0, cruiser: 0, dreadnought: 0 }, // Верфь: купленные корабли
  fleetActive: false, // Флот включён в бой (нужна активная Автоборона ур.5)
  storageLevels: { dust: 1, energy: 1, civ: 1 },
  storageProgress: { dust: 0, energy: 0, civ: 0 },
  boosters: { incomeUntil: 0 }, // Временный бустер x2
  boosterDay: 0, // индекс дня последней покупки бустера за металл
  // ─── Ежедневные награды ───
  // ★ lastClaimedDay — номер ЕДИНОГО игрового дня (serverDayIndex), в который
  //   забрали награду. Именно он решает «можно ли забрать»: rolling 24 часа
  //   от локального Date.now() рассинхронизировал устройства и позволял
  //   забирать несколько дней подряд. lastClaimed оставлен для совместимости.
  dailyReward: { day: 0, lastClaimed: 0, lastClaimedDay: 0 },
  firstNightShieldUsed: false,
  // ─── Звезда и Системы ───
  starType: null, 
  systemType: null,
  systemName: 'Родная',  playerName: '',
  planets: [],
  otherSystems: [],
  activeSystemIdx: 0,
  // ★ Время, до которого текущая система выведена из строя вторжением.
  //   Без отдельного поля урон исчезал при входе в повреждённую систему.
  activeSystemDamagedUntil: 0,
  systems: 1,
  totalSystemsCreated: 1,
  systemIncomeBonus: 0,
  systemShopProgress: { dust: 0, energy: 0, civ: 0 },
  // ★ Сколько систем выбрано ползунком в магазине (1..N по пыли).
  systemShopBatch: 1,
  // ★ Снимок цен покупки системы: фиксируется на время покупки, чтобы
  //   вливание цивилизации не меняло цену энергии посреди прогресса.
  systemShopCost: null,
  // ★ Монотонный индекс цены системы: не сбрасывается престижем, чтобы
  //   после Вспышки цена новой системы не откатывалась к ранним значениям.
  systemCostFloor: 0,
  
  // ─── Прайм-система ───
  primeSystem: null,
  primeLastHealedAt: 0,
  primeDebuffUntil: 0,  // до этого времени доход Прайм-системы −50%
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
  // ─── LOD галактики и Сингулярности ───
  galaxyZoomLevel: 4,
  galaxyFocus: null,
  galaxyManualLod: false,
  singularities: 0,
  cosmicTrail: null,

  // ─── Достижения и Ежедневки ───
  unlockedAch: {},
  primeParts: 0,   // куски Прайм-системы за достижения (5 = 1 система)
  primeCrafts: 0,  // сколько Прайм-систем собрано за достижения (макс 2)
  stats: { comets: 0, expeditions: 0, invasionsDefeated: 0, clicks: 0, planets: 0, dailyClaims: 0 },
  dailyProgress: {},
  dailyClaimed: {},
  dailyDayIndex: 0,
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
  settings: { brightness: 1.0, sound: true, pushEnabled: true },
  vis: { collapse: 0, macroMergeAnims: {} },
};

const SAVE_KEY = 'accretion_v17';
let isResetting = false;

// ═══════════════════════════════════════════════════════════════
//  СБРОС ЗНАЧЕНИЙ (используется при престиже и перезапуске)
// ═══════════════════════════════════════════════════════════════
function resetStateValues() {
  S.dailyReward = { day: 0, lastClaimed: 0, lastClaimedDay: 0 };
  S.firstNightShieldUsed = false;
  S.stage = 'cloud';
  S.activeEvent = null;
  S.lastEventAt = 0;
  S.lastRandomEvent = 0;
  S.activeRandomEvent = null;
  S.activeWorldEvents = [];
  S.lastDailyEventDay = 0;
  S.lastWeeklyEventWeek = 0;
  S.weeklyEventPlan = null;
  S.phaseProgress = { cloud: 0, condense: 0, protostar: 0 };
  S.lastIgnitionQuality = 0.5;
  S.protostarHeat = 0;
  S.assemblyCooldownUntil = 0;
  S.evolutionPopupSuspended = false;
  S.dust = 0; S.dustTotal = 0;
  S.energy = 0; S.civLevel = 0; S.metalAmount = 0;
  S.fleet = { interceptor: 0, cruiser: 0, dreadnought: 0 };
  S.fleetActive = false;
  S.storageLevels = { dust: 1, energy: 1, civ: 1 };
  S.storageProgress = { dust: 0, energy: 0, civ: 0 };
  S.boosters = { incomeUntil: 0 };
  S.invasionDebuff = { pct: 0, until: 0 };
  S.invasionWaveApplied = null;

  S.starType = null; S.systemType = null;
  S.planets = [];
  S.systemName = 'Родная';
  S.otherSystems = []; S.activeSystemIdx = 0; S.activeSystemDamagedUntil = 0;
  S.systems = 1; S.totalSystemsCreated = 1;
  S.systemIncomeBonus = 0;
  S.systemShopProgress = { dust: 0, energy: 0, civ: 0 };
  S.systemShopBatch = 1;
  S.systemShopCost = null;
  S.systemCostFloor = 0;
  
  S.primeSystem = null;
  S.primeLastHealedAt = 0;
  S.primeDebuffUntil = 0;
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
  S.galaxyZoomLevel = 4; S.galaxyFocus = null; S.galaxyManualLod = false; S.singularities = 0; S.cosmicTrail = null;

  S.unlockedAch = {};
  S.primeParts = 0;
  S.primeCrafts = 0;
  S.stats = { comets: 0, expeditions: 0, invasionsDefeated: 0, clicks: 0, planets: 0, dailyClaims: 0 };
  S.dailyProgress = {};
  S.dailyClaimed = {};
  S.dailyDayIndex = 0;
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
  S.settings = { brightness: 1.0, sound: true, pushEnabled: true };
  S.vis = { collapse: 0, macroMergeAnims: {} };

  // Синхронизация с missions.js
  if (typeof MISS !== 'undefined') {
    MISS.comets = []; MISS.expeditions = [];
    MISS.lastCometAt = 0; MISS.lastExpeditionAt = 0;
  }
}

// ═══════════════════════════════════════════════════════════════
//  ПРАЙМ-СИСТЕМЫ: ИДЕНТИФИКАЦИЯ И ЗАЩИТА
//
//  Прайм-система определяется по флагу isPrime ИЛИ по наличию primeData.
//  Это лечит старые сейвы, где флаг мог не сохраниться, и даёт единый
//  способ проверки для престижа, вторжений и UI.
// ═══════════════════════════════════════════════════════════════
function primeDataOfSystem(sys) {
  if (!sys) return null;
  return sys.primeData || sys.primeSystem || null;
}

function isPrimeSystemData(sys) {
  if (!sys) return false;
  return !!(sys.isPrime || primeDataOfSystem(sys));
}

// Прайм-система по индексу otherSystems. Для активной системы источник
// истины — S.primeSystem (данные в otherSystems могут быть ещё не синхронизированы).
function isPrimeSystemAt(idx) {
  const list = (S && Array.isArray(S.otherSystems)) ? S.otherSystems : [];
  if (idx === S.activeSystemIdx) return !!(S.primeSystem || isPrimeSystemData(list[idx]));
  return isPrimeSystemData(list[idx]);
}

// Лучший бонус кротовой норы среди ВСЕХ прайм-систем (для престижа).
function bestPrimeWormholePct() {
  const pcts = { wormhole: 0.2, wormhole2: 0.3, wormhole3: 0.5 };
  let best = 0;
  function consider(data) {
    if (!data) return;
    const pct = pcts[data.objectKey] || 0;
    if (pct > best) best = pct;
  }
  if (S && S.primeSystem) consider(S.primeSystem);
  const list = (S && Array.isArray(S.otherSystems)) ? S.otherSystems : [];
  for (let i = 0; i < list.length; i++) {
    const sys = list[i];
    if (!sys) continue;
    if (i === S.activeSystemIdx && S.primeSystem) continue; // уже учли выше
    consider(primeDataOfSystem(sys));
  }
  return best;
}

// Помечает систему как Прайм, не теряя остальные поля.
function markPrimeSystem(sys, data) {
  if (!sys) return sys;
  sys.isPrime = true;
  if (data) sys.primeData = data;
  return sys;
}

window.primeDataOfSystem = primeDataOfSystem;
window.isPrimeSystemData = isPrimeSystemData;
window.isPrimeSystemAt = isPrimeSystemAt;
window.bestPrimeWormholePct = bestPrimeWormholePct;
window.markPrimeSystem = markPrimeSystem;

// ─── Щит: единая проверка для вторжений, событий и UI ──────────
function isShieldActive(now) {
  const t = Number(now);
  const ts = (isFinite(t) && t > 0) ? t : Date.now();
  return !!(S && Number(S.shieldUntil) > ts);
}
window.isShieldActive = isShieldActive;

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
    primeData: S.primeSystem || null,
    damagedUntil: Number(S.activeSystemDamagedUntil) || 0
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
    S.activeSystemDamagedUntil = Number(home.damagedUntil) || 0;
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
  S.activeSystemDamagedUntil = Number(target.damagedUntil) || 0;
  S.activeSystemIdx = idx;
  S.panX = 0; S.panY = 0; S.zoom = 1; S.rotation = 0; S.tiltX = 0; S.tiltY = 0;
  if (typeof updateSystemSwitcher === 'function') updateSystemSwitcher();
  if (typeof updateUI === 'function') updateUI();
  return true;
}

// ═══════════════════════════════════════════════════════════════
//  СОХРАНЕНИЕ И ЗАГРУЗКА
// ═══════════════════════════════════════════════════════════════
// ★ Оптимизация сейва: убираем пустые массивы/null/пустые объекты,
// чтобы гигантские галактики (тысячи планет) не раздували localStorage.
// Все поля имеют фолбэки в loadGame(), поэтому удаление безопасно.
function stripEmptyForSave(data) {
  const out = {};
  for (const key in data) {
    const v = data[key];
    if (v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) continue;
    out[key] = v;
  }
  return out;
}

function saveGame() {
  if (isResetting) return;
  try {
    // ★ lastTick — «сердце» офлайн-прогресса. Его двигает ТОЛЬКО игровой цикл
    //   (и applyOfflineProgress). Сохранение не должно стирать время отсутствия:
    //   иначе автосейв в свёрнутой вкладке «съедал» всю ночь.
    if (typeof S.tutorialStep !== 'number') S.tutorialStep = 0;
    const data = {
      // Фаза и прогресс
      stage: S.stage, phaseProgress: S.phaseProgress, playerName: S.playerName || '',
      tutorialStep: S.tutorialStep, tutorialDone: !!S.tutorialDone,
      tut: S.tut,
      lastIgnitionQuality: S.lastIgnitionQuality, assemblyCooldownUntil: S.assemblyCooldownUntil,
      evolutionPopupSuspended: S.evolutionPopupSuspended || false,
      // Ресурсы
      dust: S.dust, dustTotal: S.dustTotal,
      energy: S.energy, civLevel: S.civLevel, metalAmount: S.metalAmount,
      fleet: S.fleet, fleetActive: S.fleetActive,
      storageLevels: S.storageLevels, storageProgress: S.storageProgress,
      boosters: S.boosters, boosterDay: S.boosterDay,
      dailyReward: S.dailyReward,
      firstNightShieldUsed: S.firstNightShieldUsed,
      // Звезда и Системы
      starType: S.starType, systemType: S.systemType,
      planets: S.planets, systemName: S.systemName,
      otherSystems: S.otherSystems, activeSystemIdx: S.activeSystemIdx,
      activeSystemDamagedUntil: S.activeSystemDamagedUntil || 0,
      systems: S.systems, totalSystemsCreated: S.totalSystemsCreated,
      systemIncomeBonus: S.systemIncomeBonus, systemShopProgress: S.systemShopProgress,
      systemShopCost: S.systemShopCost,
      systemCostFloor: S.systemCostFloor,
      primeSystem: S.primeSystem, primeCandidates: S.primeCandidates,
      primeLastHealedAt: S.primeLastHealedAt, primeDebuffUntil: S.primeDebuffUntil,
      primeParts: S.primeParts, primeCrafts: S.primeCrafts,

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
      invasionDebuff: S.invasionDebuff || null,
      saveVersion: S.saveVersion || 0,
      activeEvent: S.activeEvent,
      lastEventAt: S.lastEventAt,
      lastRandomEvent: S.lastRandomEvent,
      activeRandomEvent: S.activeRandomEvent,
      activeWorldEvents: S.activeWorldEvents,
      lastDailyEventDay: S.lastDailyEventDay,
      lastWeeklyEventWeek: S.lastWeeklyEventWeek,
      weeklyEventPlan: S.weeklyEventPlan,
      
      // Престиж и ачивки
      prestigeLevel: S.prestigeLevel, galaxies: S.galaxies,
      galaxyForm: S.galaxyForm, galaxyMultiplier: S.galaxyMultiplier,
      achievements: S.achievements, unlockedAch: S.unlockedAch,
      galaxyZoomLevel: S.galaxyZoomLevel,
      singularities: S.singularities,
      cosmicTrail: S.cosmicTrail,
      stats: S.stats, dailyProgress: S.dailyProgress, dailyClaimed: S.dailyClaimed, lastDailyReset: S.lastDailyReset,
      dailyDayIndex: S.dailyDayIndex,
      
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
    localStorage.setItem(SAVE_KEY, JSON.stringify(stripEmptyForSave(data)));
  } catch (e) { console.warn('save error', e); }

  // ★ Локальные изменения ещё не подтверждены сервером. Если save упадёт,
  // при следующем старте не позволим старому облаку их перетереть.
  if (typeof markCloudDirty === 'function') markCloudDirty();
  // ★ Любое действие, вызвавшее saveGame(), сразу уходит и в облако.
  // autoSaveToCloud() сам проверяет Telegram и защищён от рекурсии.
  if (typeof autoSaveToCloud === 'function') autoSaveToCloud(true);
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    Object.assign(S, data);

    // ★ Санити lastTick: битые часы / старый сейв / восстановление бэкапа
    //   не должны давать «отсутствие» на дни вперёд. Кривые значения — к now,
    //   а любые старше 30 суток считаем как 30 суток (сервер делает так же).
    {
      const nowTs = Date.now();
      const rawTick = Number(S.lastTick);
      const maxAwayMs = 30 * 24 * 3600 * 1000;
      if (!isFinite(rawTick) || rawTick <= 0 || rawTick > nowTs) S.lastTick = nowTs;
      else if (nowTs - rawTick > maxAwayMs) S.lastTick = nowTs - maxAwayMs;
    }

    // ─── 1. Восстановление базовых полей и защита от undefined ───
    if (!S.phaseProgress) S.phaseProgress = { cloud: 0, condense: 0, protostar: 0 };
    if (typeof S.tutorialStep !== 'number' || !isFinite(S.tutorialStep) || S.tutorialStep < 0 || S.tutorialStep > 5) S.tutorialStep = 0;
    S.tutorialStep = Math.floor(S.tutorialStep);
    if (typeof S.tutorialDone !== 'boolean') S.tutorialDone = false;
    if (!S.tut || typeof S.tut !== 'object' || Array.isArray(S.tut)) {
      S.tut = { v: 2, done: {}, off: false, isNew: false, migrated: 0 };
    }
    if (!S.tut.done || typeof S.tut.done !== 'object' || Array.isArray(S.tut.done)) S.tut.done = {};
    if (typeof S.tut.off !== 'boolean') S.tut.off = false;
    if (typeof S.tut.isNew !== 'boolean') S.tut.isNew = false;
    if (typeof S.tut.migrated !== 'number') S.tut.migrated = 0;
    if (typeof S.tut.v !== 'number') S.tut.v = 0;
    S.activeMinigame = null;
    if (typeof S.phaseProgress.cloud !== 'number') S.phaseProgress.cloud = 0;
    if (typeof S.phaseProgress.condense !== 'number') S.phaseProgress.condense = 0;
    if (typeof S.phaseProgress.protostar !== 'number') S.phaseProgress.protostar = 0;
    if (typeof S.lastIgnitionQuality !== 'number') S.lastIgnitionQuality = 0.5;
    if (typeof S.protostarHeat !== 'number') S.protostarHeat = 0;
    if (typeof S.assemblyCooldownUntil !== 'number') S.assemblyCooldownUntil = 0;
    if (typeof S.evolutionPopupSuspended !== 'boolean') S.evolutionPopupSuspended = false;
    if (typeof S.metalAmount !== 'number') S.metalAmount = 0;
    if (!S.invasionDebuff || typeof S.invasionDebuff !== 'object') S.invasionDebuff = { pct: 0, until: 0 };
    if (typeof S.saveVersion !== 'number') S.saveVersion = 0;
    if (!S.fleet || typeof S.fleet !== 'object' || Array.isArray(S.fleet)) {
      S.fleet = { interceptor: 0, cruiser: 0, dreadnought: 0 };
    }
    for (const shipKey in FLEET_CFG.ships) {
      const n = Number(S.fleet[shipKey]);
      S.fleet[shipKey] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    }
    if (typeof S.fleetActive !== 'boolean') S.fleetActive = false;
    if (!S.dailyReward || typeof S.dailyReward !== 'object') S.dailyReward = { day: 0, lastClaimed: 0, lastClaimedDay: 0 };
    if (typeof S.dailyReward.day !== 'number') S.dailyReward.day = 0;
    S.dailyReward.day = Math.max(0, Math.min(6, Math.floor(S.dailyReward.day) || 0));
    if (typeof S.dailyReward.lastClaimed !== 'number') S.dailyReward.lastClaimed = 0;
    // ★ Старые сейвы не знают lastClaimedDay — выводим его из timestamp,
    //   чтобы после обновления не выдать награду повторно.
    if (typeof S.dailyReward.lastClaimedDay !== 'number') {
      const lastTs = Number(S.dailyReward.lastClaimed) || 0;
      S.dailyReward.lastClaimedDay = (lastTs > 0 && typeof serverDayIndex === 'function')
        ? serverDayIndex(lastTs)
        : 0;
    }
    if (typeof S.firstNightShieldUsed !== 'boolean') S.firstNightShieldUsed = false;
    if (!S.otherSystems) S.otherSystems = [];
    if (typeof S.activeSystemIdx !== 'number') S.activeSystemIdx = 0;
    if (typeof S.activeSystemDamagedUntil !== 'number') S.activeSystemDamagedUntil = 0;
    if (typeof S.rotation !== 'number') S.rotation = 0;
    if (typeof S.gasDensity !== 'number') S.gasDensity = 1;
    if (!S.systemName) S.systemName = 'Родная';
    if (typeof S.playerName !== 'string') S.playerName = '';
    if (!S.storageLevels) S.storageLevels = { dust: 1, energy: 1, civ: 1 };
    if (!S.storageProgress) S.storageProgress = { dust: 0, energy: 0, civ: 0 };
    if (!S.boosters) S.boosters = { incomeUntil: 0 };

    // ─── 2. Вторжения ───
    if (!Array.isArray(S.invasions)) S.invasions = [];
    if (typeof S.lastEventAt !== 'number') S.lastEventAt = 0;
    if (typeof S.lastRandomEvent !== 'number' || !isFinite(S.lastRandomEvent)) S.lastRandomEvent = 0;
    if (!S.activeEvent || typeof S.activeEvent !== 'object') S.activeEvent = null;
    if (!S.activeRandomEvent || typeof S.activeRandomEvent !== 'object' || !S.activeRandomEvent.id) S.activeRandomEvent = null;
    if (!Array.isArray(S.activeWorldEvents)) S.activeWorldEvents = [];
    else S.activeWorldEvents = S.activeWorldEvents.filter(function(e) {
      return e && typeof e === 'object' && typeof e.id === 'string' && typeof e.endsAt === 'number' && isFinite(e.endsAt);
    });
    if (typeof S.lastDailyEventDay !== 'number' || !isFinite(S.lastDailyEventDay)) S.lastDailyEventDay = 0;
    if (typeof S.lastWeeklyEventWeek !== 'number' || !isFinite(S.lastWeeklyEventWeek)) S.lastWeeklyEventWeek = 0;
    if (S.weeklyEventPlan && (typeof S.weeklyEventPlan !== 'object' || typeof S.weeklyEventPlan.week !== 'number')) S.weeklyEventPlan = null;
    // ★ Миграция старых глобальных событий в единую систему случайных событий.
    if (S.activeEvent && typeof S.activeEvent.endsAt === 'number' && S.activeEvent.endsAt > Date.now()) {
      const legacyMap = { comet_halley: 'lucky_star', solar_flare: 'energy_leak', space_storm: 'golden_hour', income: 'golden_hour' };
      const newId = legacyMap[S.activeEvent.id];
      if (newId) S.activeWorldEvents.push({ id: newId, tier: 'daily', startedAt: Date.now(), endsAt: S.activeEvent.endsAt });
    }
    S.activeEvent = null;
    S.lastEventAt = 0;
    S.lastRandomEvent = 0;
    if (typeof S.lastInvasionCheck !== 'number') S.lastInvasionCheck = 0;

    // ─── 3. Престиж ───
    if (typeof S.prestigeLevel !== 'number') S.prestigeLevel = 0;
    if (typeof S.galaxies !== 'number') S.galaxies = 1;
    if (!S.galaxyForm) S.galaxyForm = 'spiral';
    if (typeof S.galaxyMultiplier !== 'number') S.galaxyMultiplier = 1;
    // ★ Кривая множителя престижа изменилась (было ×2 за вспышку).
    //   Приводим старый сейв к новой формуле — иначе ×2048 останется навсегда.
    if (typeof prestigeMultiplierFor === 'function') {
      const targetMult = prestigeMultiplierFor(S.prestigeLevel || 0);
      if (!isFinite(S.galaxyMultiplier) || S.galaxyMultiplier > targetMult) {
        S.galaxyMultiplier = targetMult;
      }
    }
    if (!Array.isArray(S.achievements)) S.achievements = [];

    // ─── 3b. LOD, Сингулярности и космический след ───
    if (typeof S.singularities !== 'number' || !isFinite(S.singularities) || S.singularities < 0) S.singularities = 0;
    S.singularities = Math.floor(S.singularities);
    const savedLod = (data && typeof data.galaxyZoomLevel === 'number' && isFinite(data.galaxyZoomLevel))
      ? data.galaxyZoomLevel : null;
    const autoLod = (typeof galaxyLodForTotal === 'function')
      ? galaxyLodForTotal(S.totalSystemsCreated || 1) : 4;
    S.galaxyZoomLevel = (savedLod === null)
      ? autoLod
      : Math.min(autoLod, Math.max(0, Math.floor(savedLod)));
    S.galaxyFocus = null;
    S.galaxyManualLod = false;
    if (!S.vis || typeof S.vis !== 'object') S.vis = { collapse: 0, macroMergeAnims: {} };
    if (!S.vis.macroMergeAnims || typeof S.vis.macroMergeAnims !== 'object') S.vis.macroMergeAnims = {};
    if (S.cosmicTrail && (typeof S.cosmicTrail !== 'object' ||
        typeof S.cosmicTrail.x !== 'number' || typeof S.cosmicTrail.y !== 'number' ||
        typeof S.cosmicTrail.start !== 'number')) {
      S.cosmicTrail = null;
    }
    // ─── 4. Достижения и Ежедневки ───
    if (!S.unlockedAch || typeof S.unlockedAch !== 'object' || Array.isArray(S.unlockedAch)) S.unlockedAch = {};
    if (typeof S.primeParts !== 'number' || !isFinite(S.primeParts) || S.primeParts < 0) S.primeParts = 0;
    S.primeParts = Math.floor(S.primeParts);
    if (typeof S.primeDebuffUntil !== 'number' || !isFinite(S.primeDebuffUntil) || S.primeDebuffUntil < 0) S.primeDebuffUntil = 0;
    if (typeof S.primeCrafts !== 'number' || !isFinite(S.primeCrafts) || S.primeCrafts < 0) S.primeCrafts = 0;
    S.primeCrafts = Math.min(2, Math.floor(S.primeCrafts));
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
    if (typeof S.dailyDayIndex !== 'number') S.dailyDayIndex = 0;
    if (typeof S.boosterDay !== 'number') S.boosterDay = 0;

    // ─── 5. Лор, Журнал и Мини-игры ───
    if (!Array.isArray(S.seenLore)) S.seenLore = [];
    if (!Array.isArray(S.eventLog)) S.eventLog = [];
    if (typeof S.eventLogUnread !== 'number') S.eventLogUnread = 0;
    if (!S.seenMinigame || typeof S.seenMinigame !== 'object') S.seenMinigame = {};

    // ─── 6. Античит и Прайм ───
    if (!S.anticheat) S.anticheat = { flags: 0, reasons: [], ts: 0, prestiges: [] };
    if (!Array.isArray(S.primeCandidates)) S.primeCandidates = [];
    if (!S.primeSystem) S.primeSystem = null;
    if (typeof S.primeLastHealedAt !== 'number') S.primeLastHealedAt = 0;
    // ★ Лечим старые сейвы: Прайм мог сохраниться без флага isPrime
    // (или наоборот — флаг без данных). Обе стороны нормализуем.
    if (Array.isArray(S.otherSystems)) {
      for (let i = 0; i < S.otherSystems.length; i++) {
        const sys = S.otherSystems[i];
        if (!sys || typeof sys !== 'object') continue;
        if (sys.primeData || sys.isPrime) {
          sys.isPrime = true;
          if (!sys.primeData) {
            sys.primeData = {
              objectKey: 'blackHole',
              objectName: 'Чёрная дыра',
              objectIcon: 'blackHole',
              bonus: { dustMult: 0.25 },
              absorbRadius: 150
            };
          }
        }
      }
    }
    // Родная система тоже может быть Праймом (например, после админ-выдачи).
    if (S.primeSystem && typeof S.primeSystem === 'object') {
      if (!S.primeSystem.objectKey) S.primeSystem.objectKey = 'blackHole';
      if (!S.primeSystem.objectName) S.primeSystem.objectName = 'Чёрная дыра';
      if (!S.primeSystem.bonus) S.primeSystem.bonus = { dustMult: 0.25 };
    }

    // ★ Слияние дублей Прайм-объектов вернулось: два одинаковых объекта
    // складываются в один более редкий. Старые сейвы, накопленные без
    // слияния, чинятся сразу при загрузке; активную систему не трогаем —
    // её Прайм живёт в S.primeSystem и сольётся при вспышке.
    if (typeof mergeDuplicatePrimesInSave === 'function') {
      mergeDuplicatePrimesInSave(S);
    }

    // ─── 7. Ночной режим и защита ───
    if (!S.nightConfig || typeof S.nightConfig !== 'object') {
      S.nightConfig = { mode: 'balanced', defenseEnabled: true, cometHours: 0, expeditionPercent: 0 };
    }
    if (typeof S.nightConfig.mode !== 'string') S.nightConfig.mode = 'balanced';
    // ★ Тумблер ВКЛ/ВЫКЛ убран: обороной управляют уровень и срок.
    S.nightConfig.defenseEnabled = true;
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
    if (typeof S.settings.pushEnabled !== 'boolean') S.settings.pushEnabled = true;

    // ─── 9. Магазин систем ───
    if (typeof S.systemIncomeBonus !== 'number') S.systemIncomeBonus = 0;
    if (!S.systemShopProgress) S.systemShopProgress = { dust: 0, energy: 0, civ: 0 };
    if (typeof S.systemShopProgress.dust !== 'number') S.systemShopProgress.dust = 0;
    if (typeof S.systemShopProgress.energy !== 'number') S.systemShopProgress.energy = 0;
    if (typeof S.systemShopProgress.civ !== 'number') S.systemShopProgress.civ = 0;
    if (typeof S.systemShopBatch !== 'number' || !isFinite(S.systemShopBatch)) S.systemShopBatch = 1;
    // ★ Снимок цен покупки системы: валидный объект с тремя неотрицательными
    //   числами, иначе сбрасываем (миграция старых сейвов).
    const shopCostSnap = S.systemShopCost;
    if (shopCostSnap && typeof shopCostSnap === 'object' &&
        Number.isFinite(Number(shopCostSnap.dust)) && Number(shopCostSnap.dust) >= 0 &&
        Number.isFinite(Number(shopCostSnap.energy)) && Number(shopCostSnap.energy) >= 0 &&
        Number.isFinite(Number(shopCostSnap.civ)) && Number(shopCostSnap.civ) >= 0) {
      S.systemShopCost = {
        dust: Math.floor(Number(shopCostSnap.dust)),
        energy: Math.floor(Number(shopCostSnap.energy)),
        civ: Math.floor(Number(shopCostSnap.civ)),
      };
    } else {
      S.systemShopCost = null;
    }
    // ★ Миграция старых сейвов: поднимаем индекс цены до текущего размера
    //   империи. После престижа prestige.js пересчитывает его от выживших.
    S.systemCostFloor = Math.max(
      0,
      Number.isFinite(Number(S.systemCostFloor)) ? Math.floor(Number(S.systemCostFloor)) : 0,
      (Number(S.systems) || 1) - 1,
      (Number(S.totalSystemsCreated) || 1) - 1
    );

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
        if (!isFinite(p.angle) || p.angle === 0) p.angle = Math.random() * Math.PI * 2;
        if (!isFinite(p.speed) || p.speed <= 0) p.speed = 0.2 / Math.pow((p.baseOrbitR || 100) / 90, 1.5);
        if (!p.moons) p.moons = [];
        if (!isFinite(p.precession)) p.precession = 0;
        if (!isFinite(p.trueAnomaly)) p.trueAnomaly = p.angle || 0;
      }
    }

    // ─── 12. Автокоррекция фазы (защита от залипания) ───
    // В ранних фазах звезды быть не должно — чистим залипший starType из старых сейвов,
    // иначе включится панорамирование и тапы/драг перестанут работать
    if ((S.stage === 'cloud' || S.stage === 'condense' || S.stage === 'protostar') && (S.dustTotal || 0) < 10000) {
      S.starType = null;
    }
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
  // ★ Синхронные флаги для cloudsave.js (защита от восстановления облачного сейва)
  try {
    window.isResetting = true;
    if (typeof S === 'object' && S) S.isResetting = true;
  } catch (e) { /* ignore */ }
  // ★ Метка переживает location.reload(), чтобы syncCloudOnStart() не вернул старый сейв
  try { localStorage.setItem('accretion_reset_pending', '1'); } catch (e) { /* ignore */ }
  localStorage.removeItem(SAVE_KEY);
  resetStateValues();
  setTimeout(function() { location.reload(); }, 50);
}

window.S = S;
window.saveGame = saveGame;
window.loadGame = loadGame;
window.resetGame = resetGame;
window.switchToSystem = switchToSystem;