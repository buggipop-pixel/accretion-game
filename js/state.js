// STATE.JS — состояние игры

const S = {
  stage: 'cloud',
  dust: 0,
  dustTotal: 0,
  energy: 0,
  civLevel: 0,

  // ─── Активная система ───
  starType: null,
  systemType: null,
  planets: [],
  systemName: 'Родная',

  // ─── Другие системы ───
  otherSystems: [],       // [{name, starType, systemType, planets[]}]
  activeSystemIdx: 0,     // 0 = активная, 1+ = из otherSystems

  // ─── Камера ───
  panX: 0,
  panY: 0,
  zoom: 1.0,

  // ─── Прогресс ───
  systems: 1,
  totalSystemsCreated: 1,

  // ─── Активные процессы ───
  missions: [],
  flights: [],
  invasions: [],
  explosions: [],          // визуальные взрывы

  // ─── Кулдауны ───
  cooldowns: { expedition: 0, comet: 0 },

  // ─── Таймеры ───
  lastTick: Date.now(),
  eventTimer: 0,
  choiceTimer: 0,
  collisionTimer: 0,
  gammaDebuff: 0,

  // ─── Визуал ───
  vis: { collapse: 0 },
};

const SAVE_KEY = 'accretion_v14';
let isResetting = false;

function resetStateValues() {
  S.stage = 'cloud';
  S.dust = 0;
  S.dustTotal = 0;
  S.energy = 0;
  S.civLevel = 0;
  S.starType = null;
  S.systemType = null;
  S.planets = [];
  S.systemName = 'Родная';
  S.otherSystems = [];
  S.activeSystemIdx = 0;
  S.panX = 0;
  S.panY = 0;
  S.zoom = 1.0;
  S.systems = 1;
  S.totalSystemsCreated = 1;
  S.missions = [];
  S.flights = [];
  S.invasions = [];
  S.explosions = [];
  S.cooldowns = { expedition: 0, comet: 0 };
  S.lastTick = Date.now();
  S.eventTimer = 0;
  S.choiceTimer = 0;
  S.collisionTimer = 0;
  S.gammaDebuff = 0;
  S.vis = { collapse: 0 };
}

// ─── ПЕРЕКЛЮЧЕНИЕ СИСТЕМ ────────────────────────────────────────
function switchToSystem(idx) {
  if (idx === S.activeSystemIdx) return false;
  if (idx < 0) return false;

  // Сохраняем текущую как "другую" (или в 0-й слот)
  const currentData = {
    name: S.systemName,
    starType: S.starType,
    systemType: S.systemType,
    planets: S.planets,
  };

  if (idx === 0) {
    // Возвращаемся в родную — из сохранённых
    if (!S.otherSystems[0]) {
      S.otherSystems[0] = currentData;
      return false;
    }
    const home = S.otherSystems[0];
    S.otherSystems[0] = currentData;
    S.systemName = home.name;
    S.starType = home.starType;
    S.systemType = home.systemType;
    S.planets = home.planets;
    S.activeSystemIdx = 0;
    return true;
  }

  const target = S.otherSystems[idx];
  if (!target) return false;

  // Меняем местами
  if (S.activeSystemIdx === 0) {
    S.otherSystems[0] = currentData;
  } else {
    S.otherSystems[S.activeSystemIdx] = currentData;
  }
  S.systemName = target.name;
  S.starType = target.starType;
  S.systemType = target.systemType;
  S.planets = target.planets;
  S.activeSystemIdx = idx;
  return true;
}

function getSystemList() {
  const list = [{ idx: 0, name: S.systemName, active: S.activeSystemIdx === 0 }];
  for (let i = 1; i < S.otherSystems.length; i++) {
    const sys = S.otherSystems[i];
    if (!sys) continue;
    list.push({ idx: i, name: sys.name, active: S.activeSystemIdx === i });
  }
  // Убедимся что родная тоже в списке
  if (S.otherSystems.length === 0) return list;
  return list;
}

// ─── СОХРАНЕНИЕ ─────────────────────────────────────────────────
function saveGame() {
  if (isResetting) return;
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
      systemName: S.systemName,
      otherSystems: S.otherSystems,
      activeSystemIdx: S.activeSystemIdx,
      panX: S.panX,
      panY: S.panY,
      zoom: S.zoom,
      rotation: S.rotation || 0,
      systems: S.systems,
      totalSystemsCreated: S.totalSystemsCreated,
      cooldowns: S.cooldowns,
      missions: S.missions,
      gammaDebuff: S.gammaDebuff,
      lastTick: S.lastTick,
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

    if (!S.cooldowns) S.cooldowns = { expedition: 0, comet: 0 };
    if (!S.missions) S.missions = [];
    if (!S.flights) S.flights = [];
    if (!S.invasions) S.invasions = [];
    if (!S.explosions) S.explosions = [];
    if (!S.otherSystems) S.otherSystems = [];
    if (typeof S.activeSystemIdx !== 'number') S.activeSystemIdx = 0;
    if (typeof S.panX !== 'number') S.panX = 0;
    if (typeof S.panY !== 'number') S.panY = 0;
    if (typeof S.zoom !== 'number') S.zoom = 1;
    if (typeof S.systems !== 'number') S.systems = 1;
    if (typeof S.totalSystemsCreated !== 'number') S.totalSystemsCreated = 1;
    if (typeof S.civLevel !== 'number') S.civLevel = 0;
    if (typeof S.energy !== 'number') S.energy = 0;
    if (!S.systemName) S.systemName = 'Родная';
    if (typeof S.rotation !== 'number') S.rotation = 0;

    // Восстанавливаем массы и диаметры планет
    for (const p of S.planets) {
      if (!p.baseOrbitR) p.baseOrbitR = p.orbitR || 100;
      if (typeof p.forming !== 'boolean') p.forming = false;
      if (typeof p.mass !== 'number') p.mass = planetMass(p.type);
      if (typeof p.diameter !== 'number') p.diameter = planetDiameter(p.type);
      if (!p.moons) p.moons = [];
    }
    for (const sys of S.otherSystems) {
      if (!sys.planets) continue;
      for (const p of sys.planets) {
        if (!p.moons) p.moons = [];
        if (typeof p.mass !== 'number') p.mass = planetMass(p.type);
        if (typeof p.diameter !== 'number') p.diameter = planetDiameter(p.type);
      }
    }

    S.vis.collapse = S.starType ? 1 : (S.stage === 'condense' ? 0.3 : 0);
  } catch (e) { console.warn('load error', e); }
}

function resetGame() {
  isResetting = true;
  localStorage.removeItem(SAVE_KEY);
  resetStateValues();
  setTimeout(() => location.reload(), 50);
}

// ─── ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ ПЛАНЕТ ─────────────────────────
function planetMass(type) {
  const map = {
    rocky: 1.0, superEarth: 2.5,
    iceGiant: 4.0, gasGiant: 8.0, lava: 1.5,
  };
  return map[type] || 1.0;
}
function planetDiameter(type) {
  const map = {
    rocky: 1.0, superEarth: 1.3,
    iceGiant: 1.5, gasGiant: 1.8, lava: 0.9,
  };
  return map[type] || 1.0;
}

window.S = S;
window.saveGame = saveGame;
window.loadGame = loadGame;
window.resetGame = resetGame;
window.switchToSystem = switchToSystem;
window.getSystemList = getSystemList;
window.planetMass = planetMass;
window.planetDiameter = planetDiameter;
