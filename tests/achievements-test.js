// ═══════════════════════════════════════════════════════════════
//  ACHIEVEMENTS TEST — куски Прайма: 1 ачивка = 1 кусок, 5 = система,
//  максимум 2 системы; награда не выдаётся дважды.
//  Запуск: node tests/achievements-test.js
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
  context.__primeShown = 0;
  context.__sent = [];
  context.sendPushNotification = function (m) { context.__sent.push(m); };
  vm.createContext(context);

  const files = ['config.js', 'state.js', 'economy.js', 'planets.js', 'prime.js', 'premium.js', 'achievements.js'];
  files.forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', f), 'utf8'), context, { filename: f });
  });

  // Заглушка показа результата сундука/сборки — нам важна только экономика кусков.
  context.showChestResult = function () { context.__primeShown++; };
  return context;
}

let passed = 0, failed = 0;
function assert(name, cond, extra) {
  if (cond) { console.log('✅ ' + name); passed++; }
  else { console.error('❌ ' + name + (extra ? ' → ' + extra : '')); failed++; }
}

function fresh(g) {
  const S = g.S;
  S.unlockedAch = {};
  S.primeParts = 0;
  S.primeCrafts = 0;
  S.systems = 10;
  S.prestigeLevel = 0;
  S.dustTotal = 0;
  S.metalAmount = 0;
  S.stats = { comets: 0, expeditions: 0, invasionsDefeated: 0, clicks: 0, planets: 0, dailyClaims: 0 };
  S.planets = [];
  return S;
}

// 1. Одна ачивка = 1 кусок, без металла.
(function () {
  const g = createGame();
  const S = fresh(g);
  const beforeMetal = S.metalAmount;
  g.checkAchievements();
  assert('Ачивка: разблокирована', S.unlockedAch.ach_systems_10 === true);
  assert('Ачивка: выдан 1 кусок', S.primeParts === 1);
  assert('Ачивка: металл не начисляется', S.metalAmount === beforeMetal);
})();

// 2. Повторная проверка не выдаёт кусок дважды.
(function () {
  const g = createGame();
  const S = fresh(g);
  g.checkAchievements();
  g.checkAchievements();
  assert('Ачивка: повторно кусок не выдаётся', S.primeParts === 1);
})();

// 3. Пять ачивок = 5 кусков; сборка тратит 5 и создаёт систему.
(function () {
  const g = createGame();
  const S = fresh(g);
  S.systems = 10;
  S.prestigeLevel = 1;
  S.dustTotal = 1e12;
  S.stats.invasionsDefeated = 25;
  S.stats.comets = 50;
  g.checkAchievements();
  assert('Куски: 5 за пять ачивок', S.primeParts === 5, 'parts=' + S.primeParts);
  const ok = g.craftPrimeFromParts();
  assert('Сборка: успешна', ok === true);
  assert('Сборка: списано 5 кусков', S.primeParts === 0);
  assert('Сборка: счётчик систем = 1', S.primeCrafts === 1);
  assert('Сборка: показан результат', g.__primeShown === 1);
})();

// 4. Второй раз — только после ещё 5 кусков; третий невозможен.
(function () {
  const g = createGame();
  const S = fresh(g);
  S.primeParts = 10;  // эквивалент всех 10 ачивок
  S.primeCrafts = 0;
  assert('Куски: 10 доступны', S.primeParts === 10);
  g.craftPrimeFromParts();
  g.craftPrimeFromParts();
  assert('Сборка: максимум 2 системы', S.primeCrafts === 2, 'crafts=' + S.primeCrafts + ' parts=' + S.primeParts);
  assert('Сборка: третий раз запрещён', g.craftPrimeFromParts() === false);
})();

console.log('----------------------------------------');
console.log((failed === 0 ? '✅' : '❌') + ' ПРОЙДЕНО: ' + passed + ' · ПРОВАЛЕНО: ' + failed);
process.exit(failed === 0 ? 0 : 1);
