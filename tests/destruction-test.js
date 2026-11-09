// ═══════════════════════════════════════════════════════════════
//  DESTRUCTION TEST — разрушение по масштабу империи.
//  Запуск: node tests/destruction-test.js
// ═══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const noop = () => {};
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

function createGame() {
  const storage = Object.create(null);
  const localStorageMock = {
    getItem: (k) => (k in storage ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; },
    clear: () => { for (const k in storage) delete storage[k]; },
  };
  const documentMock = {
    getElementById: () => makeElement(),
    querySelector: () => makeElement(),
    querySelectorAll: () => [],
    createElement: () => makeElement(),
    addEventListener: noop, removeEventListener: noop,
    body: makeElement(), documentElement: makeElement(),
    visibilityState: 'visible', hidden: false, cookie: '',
  };
  const context = { console, document: documentMock, localStorage: localStorageMock, sessionStorage: localStorageMock };
  context.window = context;
  context.self = context;
  context.globalThis = context;
  context.top = context;
  context.parent = context;
  Object.assign(context, {
    addEventListener: noop, removeEventListener: noop,
    requestAnimationFrame: () => 0, cancelAnimationFrame: noop,
    setInterval: () => 0, clearInterval: noop,
    performance: { now: () => Date.now() },
    location: { href: 'http://localhost/', origin: 'http://localhost', reload: noop, assign: noop, replace: noop },
    alert: noop, confirm: () => false, prompt: () => '',
    Audio: function () { return { play: noop, pause: noop, currentTime: 0, volume: 1, loop: false, src: '' }; },
    Image: function () { const i = makeElement(); i.src = ''; i.width = 0; i.height = 0; i.complete = true; return i; },
    toast: noop, updateUI: noop, playSFX: noop, addEvent: noop, saveGame: noop,
    offerColony: noop, showModal: noop, hideModal: noop, openLeaderboard: noop,
    setTimeout, clearTimeout, Date, Math, JSON, Set, Array, Object, Number, String,
  });
  context.__notify = [];
  context.notifyEvent = function (cat, title, lines) { context.__notify.push({ cat: cat, title: title, lines: lines }); };
  context.sendPushNotification = noop;
  vm.createContext(context);
  ['config.js', 'state.js', 'economy.js', 'planets.js', 'prime.js', 'random-events.js'].forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', f), 'utf8'), context, { filename: f });
  });
  return context;
}

function planet() {
  return { type: 'rocky', baseOrbitR: 100, orbitR: 100, mass: 1, diameter: 1, forming: false, seed: Math.random() * 1e6 };
}
function sys(name) {
  return { name: name, starType: 'G', systemType: 'single', planets: [planet(), planet()] };
}
function setup(g, systems) {
  const S = g.S;
  S.activeSystemIdx = 0;
  S.primeSystem = null;
  S.shieldUntil = 0;
  S.planets = [planet(), planet(), planet()];
  S.otherSystems = [null];
  for (let i = 1; i < systems; i++) S.otherSystems.push(sys('Система ' + i));
  S.systems = systems;
  S.dust = 1000; S.energy = 1000; S.civLevel = 100; S.metalAmount = 1000;
  // Детерминированный RNG: 0 → крупный объект и предсказуемый шаффл.
  g.Math = Object.create(Math);
  g.Math.random = () => 0;
  return S;
}

let passed = 0, failed = 0;
function assert(name, cond, extra) {
  if (cond) { console.log('✅ ' + name); passed++; }
  else { console.error('❌ ' + name + (extra ? ' → ' + extra : '')); failed++; }
}

// 1. 150 систем → туманность, но потолок 34% = 51.
(function () {
  const g = createGame();
  const S = setup(g, 150);
  const res = g.RandomEvents.destroyByScale(1, 1);
  assert('150 систем: погибло 51 (потолок 34%)', res.systemsLost === 51, 'lost=' + res.systemsLost);
  assert('150 систем: счётчик систем уменьшился', S.systems === 99, 'systems=' + S.systems);
  assert('150 систем: массивы синхронны', S.otherSystems.length === 99, 'len=' + S.otherSystems.length);
  assert('150 систем: ресурсы потеряны на 15%', S.dust === 850, 'dust=' + S.dust);
  assert('150 систем: уведомление отправлено', g.__notify.length === 1);
})();

// 2. 12 систем → крупный объект 10, но потолок 5.
(function () {
  const g = createGame();
  const S = setup(g, 12);
  const res = g.RandomEvents.destroyByScale(1, 1);
  assert('12 систем: погибло 4 (потолок 34%)', res.systemsLost === 4, 'lost=' + res.systemsLost);
  assert('12 систем: осталось 8', S.systems === 8);
})();

// 3. Меньше 10 систем → гибнет планета, системы целы.
(function () {
  const g = createGame();
  const S = setup(g, 5);
  const before = S.systems;
  const res = g.RandomEvents.destroyByScale(1, 1);
  assert('5 систем: гибнет планета', res.planetsLost === 1 && res.systemsLost === 0);
  assert('5 систем: систем не убыло', S.systems === before);
  assert('5 систем: планет стало 2', S.planets.length === 2);
})();

// 4. Щит: 50% шанс полностью предотвратить разрушение.
(function () {
  const g = createGame();
  const S = setup(g, 150);
  S.shieldUntil = Date.now() + 3600 * 1000;
  const parts = g.RandomEvents.applyPenalty({ destroyPlanets: 1 }, 'Босс');
  assert('Щит: разрушение предотвращено', S.systems === 150 && S.otherSystems.length === 150);
  assert('Щит: текст про поглощение', parts.join(' ').includes('щит'), parts.join(' '));
})();

// 5. Прайм-системы не уничтожаются.
(function () {
  const g = createGame();
  const S = setup(g, 12);
  for (let i = 1; i < S.otherSystems.length; i++) {
    S.otherSystems[i].isPrime = true;
    S.otherSystems[i].primeData = { objectKey: 'blackHole', name: 'ЧД' };
  }
  const res = g.RandomEvents.destroyByScale(1, 1);
  assert('Прайм: системы не тронуты', res.systemsLost === 0 && S.systems === 12);
  assert('Прайм: гибнет планета активной системы', res.planetsLost === 1 && S.planets.length === 2);
})();

// 6. Прайм-система: ни системы, ни планеты — только дебаф дохода на час.
(function () {
  const g = createGame();
  const S = setup(g, 5);
  S.primeSystem = { objectKey: 'blackHole', bonus: { allMult: 1 } };
  const res = g.RandomEvents.destroyByScale(1, 1);
  assert('Прайм: дебаф вместо разрушения', res.primeDebuffed === true);
  assert('Прайм: планеты целы', S.planets.length === 3 && res.planetsLost === 0);
  assert('Прайм: дебаф на час выставлен', S.primeDebuffUntil > Date.now() + 3500 * 1000);
})();

// 7. Все системы Прайм (12): атака даёт только дебаф.
(function () {
  const g = createGame();
  const S = setup(g, 12);
  S.primeSystem = { objectKey: 'pulsar', bonus: { allMult: 1 } };
  for (let i = 1; i < S.otherSystems.length; i++) {
    S.otherSystems[i].isPrime = true;
    S.otherSystems[i].primeData = { objectKey: 'pulsar', bonus: { allMult: 1 } };
  }
  const res = g.RandomEvents.destroyByScale(1, 1);
  assert('Прайм-империя: системы целы', res.systemsLost === 0 && S.systems === 12);
  assert('Прайм-империя: планеты активной целы', S.planets.length === 3);
  assert('Прайм-империя: дебаф выдан', res.primeDebuffed === true);
})();

// 8. Дебаф режет бонус Прайма вдвое.
(function () {
  const g = createGame();
  const S = setup(g, 10);
  S.primeSystem = { objectKey: 'quasar', bonus: { allMult: 1 } };
  S.primeDebuffUntil = 0;
  const normal = g.primeBonusMult('dust');
  S.primeDebuffUntil = Date.now() + 3600 * 1000;
  const debuffed = g.primeBonusMult('dust');
  assert('Прайм-дебаф: бонус уменьшен', debuffed < normal, normal + ' → ' + debuffed);
  assert('Прайм-дебаф: ровно вдвое от прибавки', Math.abs((debuffed - 1) - (normal - 1) / 2) < 1e-9);
})();

console.log('----------------------------------------');
console.log((failed === 0 ? '✅' : '❌') + ' ПРОЙДЕНО: ' + passed + ' · ПРОВАЛЕНО: ' + failed);
process.exit(failed === 0 ? 0 : 1);
