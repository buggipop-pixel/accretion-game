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

  // ─── Звезда ───
  starType: null, systemType: null,

  // ─── Системы ───
  planets: [],
  systemName: 'Родная',
  otherSystems: [],
  activeSystemIdx: 0,
  systems: 1,
  totalSystemsCreated: 1,

  // ─── Камера ───
  panX: 0, panY: 0, zoom: 1.0, rotation: 0,

  // ─── Миссии ───
  missions: [], comets: [], expeditions: [],
  explosions: [],

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

// ─── Сброс ──────────────────────────────────────────────────────
function resetStateValues() {
  S.stage = 'cloud';
  S.dust = 0; S.dustTotal = 0;
  S.energy = 0; S.civLevel = 0;
  S.starType = null; S.systemType = null;
  S.planets = [];
  S.systemName = 'Родная';
  S.otherSystems = []; S.activeSystemIdx = 0;
  S.systems = 1; S.totalSystemsCreated = 1;
  S.panX = 0; S.panY = 0; S.zoom = 1.0; S.rotation = 0;
  S.missions = []; S.comets = []; S.expeditions = [];
  S.explosions = [];
  S.lastTick = Date.now();
  S.eventTimer = 0; S.collisionTimer = 0; S.gammaDebuff = 0;
  S.gasDensity = 1;
  S.activeMinigame = null;
  S.vis = { collapse: 0 };
}

// ─── Переключение систем ────────────────────────────────────────
function switchToSystem(idx) {
  if (idx === S.activeSystemIdx) return false;
  if (idx < 0) return false;

  const currentData = {
    name: S.systemName,
    starType: S.starType,
    systemType: S.systemType,
    planets: S.planets || [],
  };

  if (idx === 0) {
    const home = S.otherSystems[0];
    if (!home) return false;
    if (S.activeSystemIdx > 0) S.otherSystems[S.activeSystemIdx] = currentData;
    S.otherSystems[0] = null;
    S.systemName = home.name;
    S.starType = home.starType;
    S.systemType = home.systemType;
    S.planets = home.planets;
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
  S.activeSystemIdx = idx;
  return true;
}

// ─── Сохранение ─────────────────────────────────────────────────
function saveGame() {
  if (isResetting) return;
  try {
    S.lastTick = Date.now();
    const data = {
      stage: S.stage, dust: S.dust, dustTotal: S.dustTotal,
      energy: S.energy, civLevel: S.civLevel,
      starType: S.starType, systemType: S.systemType,
      planets: S.planets, systemName: S.systemName,
      otherSystems: S.otherSystems, activeSystemIdx: S.activeSystemIdx,
      panX: S.panX, panY: S.panY, zoom: S.zoom, rotation: S.rotation,
      systems: S.systems, totalSystemsCreated: S.totalSystemsCreated,
      missions: S.missions, comets: S.comets, expeditions: S.expeditions,
      gasDensity: S.gasDensity,
      lastTick: S.lastTick,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) { console.warn('save error', e); }
}

// ─── Загрузка ───────────────────────────────────────────────────
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    Object.assign(S, data);

    if (!S.missions) S.missions = [];
    if (!S.comets) S.comets = [];
    if (!S.expeditions) S.expeditions = [];
    if (!S.otherSystems) S.otherSystems = [];
    if (typeof S.activeSystemIdx !== 'number') S.activeSystemIdx = 0;
    if (typeof S.rotation !== 'number') S.rotation = 0;
    if (typeof S.gasDensity !== 'number') S.gasDensity = 1;
    if (!S.systemName) S.systemName = 'Родная';

    for (let i = 0; i < S.planets.length; i++) {
      const p = S.planets[i];
      if (!p.baseOrbitR) p.baseOrbitR = p.orbitR || 100;
      if (typeof p.forming !== 'boolean') p.forming = false;
      if (typeof p.mass !== 'number') p.mass = 1.0;
      if (typeof p.diameter !== 'number') p.diameter = 1.0;
      if (!p.moons) p.moons = [];
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
