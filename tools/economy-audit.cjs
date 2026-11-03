// ═══════════════════════════════════════════════════════════════
//  ECONOMY AUDIT — проверка «доход со всех систем» на реальном сейве
//  Запуск:  node tools/economy-audit.js
//  Сценарий: 17 систем, 12 прайм (по 2 лавы), престиж 5 (галактика ×32).
// ═══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const noop = () => {};
const storage = Object.create(null);

function makeElement() {
  return {
    style: {}, dataset: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    innerHTML: '', textContent: '', value: '', children: [],
    appendChild: noop, removeChild: noop, remove: noop,
    setAttribute: noop, getAttribute: () => null,
    addEventListener: noop, removeEventListener: noop,
    querySelector: () => makeElement(), querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }),
    focus: noop, blur: noop, play: noop, pause: noop,
  };
}

const mockDocument = {
  getElementById: () => makeElement(),
  querySelector: () => makeElement(),
  querySelectorAll: () => [],
  createElement: (tag) => {
    const el = makeElement();
    if (tag === 'canvas') {
      el.width = 800; el.height = 600;
      el.getContext = () => ({
        canvas: { width: 800, height: 600 },
        createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
        getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
        createRadialGradient: () => ({ addColorStop: noop }),
        createLinearGradient: () => ({ addColorStop: noop }),
      });
    }
    return el;
  },
  addEventListener: noop, removeEventListener: noop,
  body: makeElement(), documentElement: makeElement(),
  visibilityState: 'visible', hidden: false, cookie: '',
};

const localStorageMock = {
  getItem: (k) => (k in storage ? storage[k] : null),
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; },
  clear: () => { for (const k in storage) delete storage[k]; },
};

const context = {
  console, document: mockDocument,
  localStorage: localStorageMock, sessionStorage: localStorageMock,
};
context.window = context;
context.self = context;
context.globalThis = context;
context.top = context;
context.parent = context;
context.addEventListener = noop;
context.removeEventListener = noop;
context.dispatchEvent = noop;
context.performance = { now: () => Date.now() };
context.requestAnimationFrame = () => 0;
context.cancelAnimationFrame = noop;
context.setTimeout = () => 0;
context.clearTimeout = noop;
context.setInterval = () => 0;
context.clearInterval = noop;
context.fetch = () => Promise.reject(new Error('offline'));
context.navigator = { userAgent: 'node', language: 'ru-RU', languages: ['ru-RU'] };
context.location = { href: 'http://localhost/', origin: 'http://localhost', reload: noop, assign: noop, replace: noop };
context.alert = noop;
context.confirm = () => false;
context.prompt = () => '';
context.Audio = function Audio() { return { play: noop, pause: noop, currentTime: 0, volume: 1, loop: false, src: '' }; };
context.Image = function Image() { const i = makeElement(); i.src = ''; i.complete = true; return i; };
context.toast = noop;
context.updateUI = noop;
context.playSFX = noop;
context.addEvent = noop;
context.offerColony = noop;
context.showModal = noop;
context.hideModal = noop;

vm.createContext(context);

const files = ['config.js', 'state.js', 'physics.js', 'economy.js', 'prime.js', 'invasions.js', 'prestige.js'];
files.forEach((f) => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
  vm.runInContext(code, context, { filename: f });
});

// Мост: лексические const → window
vm.runInContext(`
  window.PLANET_TYPES = PLANET_TYPES;
  window.STAR_TYPES = STAR_TYPES;
  window.SYSTEM_TYPES = SYSTEM_TYPES;
  window.CFG = CFG;
  window.STAGES = STAGES;
  window.getOrbitR = getOrbitR;
  window.planetMass = planetMass;
  window.planetDiameter = planetDiameter;
  window.PRIME_OBJECTS = PRIME_OBJECTS;
`, context);

const S = context.window.S;

// ─── Сборка сейва как у игрока ──────────────────────────────────
function makePlanet(type, orbitIdx) {
  const orbitR = context.getOrbitR(orbitIdx);
  return {
    type, angle: 0, speed: 0.2,
    baseOrbitR: orbitR, orbitR,
    driftPhase: 0, rotation: 0, seed: Math.random() * 1e6,
    forming: false, formUntil: 0,
    mass: context.planetMass(type), diameter: context.planetDiameter(type),
    moons: [], precession: 0, trueAnomaly: 0,
  };
}

const PERFECT = ['lava', 'lava', 'superEarth', 'superEarth', 'gasGiant', 'gasGiant', 'iceGiant', 'iceGiant'];
const REGULAR_POOL = ['lava', 'rocky', 'rocky', 'superEarth', 'gasGiant', 'iceGiant'];

function makePrimeSystem(objectKey) {
  return {
    name: 'Прайм ' + objectKey,
    starType: 'G', systemType: 'single',
    planets: PERFECT.map((t, i) => makePlanet(t, i)),
    isPrime: true,
    primeData: context.createPrimeSystem(objectKey),
  };
}

function makeRegularSystem() {
  const planets = [];
  const n = 4 + Math.floor(Math.random() * 5); // 4..8
  for (let i = 0; i < n; i++) planets.push(makePlanet(REGULAR_POOL[Math.floor(Math.random() * REGULAR_POOL.length)], i));
  return { name: 'Обычная', starType: 'M', systemType: 'single', planets };
}

// 17 систем: домашняя + 12 прайм + 4 обычных
const primeKeys = ['blackHole', 'blackHole', 'massiveBH', 'quasar', 'pulsar', 'blackHole', 'quasar', 'blackHole', 'massiveBH', 'pulsar', 'blackHole', 'quasar'];
S.otherSystems = [null].concat(primeKeys.map(makePrimeSystem)).concat([makeRegularSystem(), makeRegularSystem(), makeRegularSystem(), makeRegularSystem()]);
S.systems = S.otherSystems.length;
S.activeSystemIdx = 0;
S.stage = 'galaxy';
S.galaxyMultiplier = 32;      // престиж 5
S.galaxyForm = 'elliptical';
S.prestigeLevel = 5;
S.galaxies = 6;
S.primeSystem = null;
S.starType = 'G';
S.systemType = 'single';
S.systemIncomeBonus = 0;
S.techLevels = { astro: 0, cyber: 0, quantum: 0, eng: 0 };
S.storageLevels = { dust: 3, energy: 3, civ: 3 };
S.civLevel = 11;
S.metalAmount = 2570;
S.dust = 1e6;
S.energy = 6870;
S.boosters = {};
S.invasionDebuff = null;
S.activeEvent = null;
S.invasions = [];

// Домашняя система игрока — 8 планет, из них 0 лавы (как в баге: «+0.0/с»)
S.planets = [
  makePlanet('rocky', 0), makePlanet('rocky', 1), makePlanet('superEarth', 2),
  makePlanet('superEarth', 3), makePlanet('gasGiant', 4), makePlanet('gasGiant', 5),
  makePlanet('iceGiant', 6), makePlanet('iceGiant', 7),
];

function fmt(n) {
  if (!isFinite(n)) return String(n);
  if (Math.abs(n) >= 1e6) return n.toExponential(2);
  return n.toFixed(2);
}
function perHour(n) { return fmt(n * 3600); }

const w = context.window;
const primeMult = w.primeBonusMult('dust');
const primeEnergy = w.primeBonusMult('energy');

console.log('════════════════════════════════════════════════════════════');
console.log(' СЦЕНАРИЙ: 17 систем (12 прайм), престиж 5, галактика ×32');
console.log(' Активная система: родная, 8 планет, ЛАВЫ НЕТ');
console.log('════════════════════════════════════════════════════════════');
console.log(' Систем в обходе:        ', w.forEachOwnedSystem ? 'да' : 'нет');
console.log(' Прайм-бонус (пыль):     ×' + fmt(primeMult));
console.log(' Прайм-бонус (энергия):  ×' + fmt(primeEnergy));
console.log('------------------------------------------------------------');

console.log(' ПЫЛЬ:      ' + fmt(w.dustPerSec()) + '/с   =  ' + perHour(w.dustPerSec()) + '/ч');
console.log(' ЭНЕРГИЯ:   ' + fmt(w.energyPerSec()) + '/с   =  ' + perHour(w.energyPerSec()) + '/ч');
console.log(' ЦИВИЛ.:    ' + fmt(w.civPerSec()) + '/с   =  ' + perHour(w.civPerSec()) + '/ч');
console.log(' МЕТАЛЛЫ:   ' + fmt(w.metalsPerSec()) + '/с   =  ' + perHour(w.metalsPerSec()) + '/ч');
console.log('------------------------------------------------------------');
console.log(' Кап пыли:    ' + fmt(w.getResourceCap('dust')));
console.log(' Кап энергии: ' + fmt(w.getResourceCap('energy')));
console.log(' Кап цив:     ' + fmt(w.getResourceCap('civ')));
console.log(' Кап металлов:' + fmt(w.metalsCap()) + '  (было бы 750×2^(ур.-1) = ' +
            Math.floor(750 * Math.pow(2, (S.storageLevels.energy || 1) - 1)) + ')');
console.log('------------------------------------------------------------');
console.log(' Лава-планет всего (по всем системам): ' + w.civPlanetCount() + ' обитаемых');

// ── Контроль: активная система БЕЗ лавы не должна обнулять металл
console.log('------------------------------------------------------------');
const noLava = w.metalsPerSec();
console.log(' Металлы при активной системе без лавы: ' + fmt(noLava) + '/с  ' +
            (noLava > 0 ? '✅ (раньше было 0.0)' : '❌ всё ещё 0'));

// ── Проверка: каждая система учитывается ровно один раз
let allPlanets = 0;
w.forEachOwnedSystem(function (idx, planets) { allPlanets += planets.length; });
let uniquePlanets = (S.planets || []).length;
for (let i = 1; i < S.otherSystems.length; i++) uniquePlanets += (S.otherSystems[i].planets || []).length;
console.log(' Планет в обходе: ' + allPlanets + ' / реально: ' + uniquePlanets +
            (allPlanets === uniquePlanets ? ' ✅ без дублей' : ' ❌ ДУБЛИ!'));

// ── Металлы: проверка, что считаются лавы всех систем
let lavaCount = 0;
w.forEachOwnedSystem(function (idx, planets) {
  for (const p of planets) {
    if (w.PLANET_TYPES[p.type] && w.PLANET_TYPES[p.type].bonus && w.PLANET_TYPES[p.type].bonus.type === 'metals') lavaCount++;
  }
});
console.log(' Лава-планет всего: ' + lavaCount + ' → ожидаемые металлы ' + fmt(lavaCount * 0.15) + '/с, факт ' + fmt(noLava) + '/с ' +
            (Math.abs(lavaCount * 0.15 - noLava) < 1e-9 ? '✅' : '❌'));

// ── Переключение на прайм-систему не должно менять общий доход
const before = w.dustPerSec();
w.switchToSystem(1);
const after = w.dustPerSec();
console.log(' Доход не зависит от открытой системы: ' + fmt(before) + ' → ' + fmt(after) +
            (Math.abs(before - after) < 1e-6 ? ' ✅' : ' ❌'));

// ── СРАВНЕНИЕ «было / стало» (старая формула на том же сейве)
function oldPlanetRate() {
  let sum = 0;
  for (const p of S.planets) {
    if (!p || p.forming || !isFinite(p.baseOrbitR)) continue;
    sum += w.planetBaseRate(p);
  }
  return sum;
}
function oldCivPlanets() {
  let n = 0;
  for (const p of S.planets) {
    if (w.PLANET_TYPES[p.type] && w.PLANET_TYPES[p.type].civ && !p.forming) n++;
  }
  return n;
}
const starM = w.STAR_TYPES[S.starType] ? w.STAR_TYPES[S.starType].rateMult : 1;
const typeM = w.SYSTEM_TYPES[S.systemType] ? w.SYSTEM_TYPES[S.systemType].rateMult : 1;
const oldDust = (2500 + oldPlanetRate()) * starM * typeM * w.systemMult() * S.galaxyMultiplier;
const oldEnergy = (S.civLevel - 3) * oldCivPlanets() * 0.5 * Math.pow(1.5, (S.storageLevels.energy || 1) - 1);

console.log('  БЫЛО  →  СТАЛО (тот же сейв, активная система — без лавы)');
console.log('  пыль:     ' + fmt(oldDust) + '/с  →  ' + fmt(w.dustPerSec()) + '/с');
console.log('  энергия:  ' + fmt(oldEnergy) + '/с  →  ' + fmt(w.energyPerSec()) + '/с');
console.log('  металлы:  0.00/с  →  ' + fmt(w.metalsPerSec()) + '/с   ← тот самый баг');
console.log('  кап металлов: ' + Math.floor(750 * Math.pow(2, (S.storageLevels.energy || 1) - 1)) + '  →  ' + fmt(w.metalsCap()));
// ── ДИНАМИЧЕСКИЕ ЦЕНЫ: сколько это в часах добычи
const mps = w.metalsPerSec();
const incomeH = mps * 3600;
function hours(price) { return incomeH > 0 ? (price / incomeH).toFixed(2) + ' ч добычи' : '—'; }

console.log('  ДИНАМИЧЕСКИЕ ЦЕНЫ (металл ' + fmt(incomeH) + '/ч)');
for (let lvl = 1; lvl <= 5; lvl++) {
  const c = w.defenseActivationCost(lvl);
  console.log('   Оборона ур.' + lvl + ' (10 ч): ' + fmt(c) + ' ⚙  =  ' + hours(c));
}
['interceptor', 'cruiser', 'dreadnought'].forEach(function (k) {
  const p = w.fleetShipPrice(k);
  console.log('   Корабль ' + k + ': ' + fmt(p) + ' ⚙  =  ' + hours(p));
});
const exp1 = w.expeditionCost ? w.expeditionCost(1) : null;
if (exp1) {
  console.log('   Экспедиция (ближняя): ' + fmt(exp1.metals) + ' ⚙ + ' + fmt(exp1.energy) + ' ⚡  =  ' + hours(exp1.metals));
}

// Содержание флота: сколько съедает при разном составе
S.nightConfig = { mode: 'balanced', defenseEnabled: true, cometHours: 0, expeditionPercent: 0 };
S.nightDefenseLevel = 5;
S.nightDefenseExpiresAt = Date.now() + 3600 * 1000;
S.fleetActive = true;
console.log('  СОДЕРЖАНИЕ ФЛОТА (% металлодобычи):');
[{ interceptor: 0, cruiser: 0, dreadnought: 1 },
 { interceptor: 0, cruiser: 0, dreadnought: 3 },
 { interceptor: 0, cruiser: 0, dreadnought: 8 },
 { interceptor: 20, cruiser: 10, dreadnought: 10 }].forEach(function (f) {
  S.fleet = f;
  const share = w.fleetUpkeepShare();
  console.log('   ' + JSON.stringify(f) + ' → ' + Math.round(share * 100) + '% дохода = ' +
              fmt(mps * share * 3600) + ' ⚙/ч');
});
S.fleetActive = false;

console.log('════════════════════════════════════════════════════════════');
