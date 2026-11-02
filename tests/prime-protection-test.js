// ═══════════════════════════════════════════════════════════════
//  PRIME PROTECTION TEST — Прайм-системы не теряются при вспышке
//  и не могут быть уничтожены/ограблены вторжением.
//  Запуск: node tests/prime-protection-test.js
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

function makeContext2d() {
  return {
    canvas: { width: 800, height: 600 },
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createLinearGradient: () => ({ addColorStop: noop }),
    putImageData: noop, drawImage: noop, fillRect: noop, clearRect: noop,
    beginPath: noop, closePath: noop, arc: noop, ellipse: noop, fill: noop, stroke: noop,
    moveTo: noop, lineTo: noop, save: noop, restore: noop, translate: noop, rotate: noop,
    scale: noop, setTransform: noop, fillText: noop, strokeText: noop,
    measureText: () => ({ width: 0 }), setLineDash: noop,
  };
}

// Свежий vm-контекст с игровыми скриптами (как в smoke-test.js).
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
    getElementsByClassName: () => [],
    createElement: (tag) => {
      const el = makeElement();
      if (String(tag).toLowerCase() === 'canvas') { el.width = 800; el.height = 600; el.getContext = () => makeContext2d(); }
      return el;
    },
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
    Image: function () { const i = makeElement(); i.src = ''; i.width = 0; i.height = 0; i.complete = true; i.onload = null; i.onerror = null; return i; },
    toast: noop, updateUI: noop, playSFX: noop, addEvent: noop,
    offerColony: noop, showModal: noop, hideModal: noop,
    setTimeout, clearTimeout, Date, Math, JSON, Set, Array, Object, Number, String,
  });
  vm.createContext(context);

  const files = ['config.js', 'state.js', 'economy.js', 'planets.js', 'prime.js', 'invasions.js', 'premium.js', 'prestige.js'];
  files.forEach((f) => {
    const code = fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
    vm.runInContext(code, context, { filename: f });
  });
  return context;
}

let passed = 0;
let failed = 0;
function assert(name, condition) {
  if (condition) { console.log('✅ ' + name); passed++; }
  else { console.error('❌ ' + name); failed++; }
}

const wormhole3 = () => ({
  objectKey: 'wormhole3', objectName: 'Гигантская кротовая нора', objectIcon: 'wormhole',
  bonus: { keepSystems: 0.5 }, absorbRadius: 150, createdAt: Date.now(),
});
const blackHole = () => ({
  objectKey: 'blackHole', objectName: 'Чёрная дыра', objectIcon: 'blackHole',
  bonus: { dustMult: 0.25 }, absorbRadius: 150, createdAt: Date.now(),
});
const planets = () => [{ type: 'lava', baseOrbitR: 100, orbitR: 100, mass: 1, diameter: 1, forming: false, seed: Math.random() * 1e6 }];

function primeSystem(name, data, withFlag) {
  const sys = { name, starType: 'G', systemType: 'single', planets: planets(), primeData: data };
  if (withFlag) sys.isPrime = true;
  return sys;
}

function countPrimes(S) {
  let count = 0;
  for (let i = 0; i < S.otherSystems.length; i++) {
    const sys = S.otherSystems[i];
    if (sys && (sys.isPrime || sys.primeData)) count++;
  }
  return count;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function testPrestigeKeepsAllPrimes() {
  // Сценарий 1: игрок находится в обычной системе, два Прайма лежат в otherSystems,
  // причём у одного (кротовой норы) флаг isPrime потерян — как в старых сейвах.
  const g = createGame();
  const S = g.S;
  S.stage = 'galaxy';
  S.prestigeLevel = 0;
  S.galaxies = 1; S.galaxyMultiplier = 1;
  S.systems = 12;
  S.planets = planets();
  S.systemName = 'Родная'; S.starType = 'K'; S.systemType = 'single';
  S.primeSystem = null;
  S.activeSystemIdx = 0;
  S.otherSystems = [null,
    primeSystem('WormPrime', wormhole3(), false), // без isPrime — проверяем лечение
    primeSystem('BHPrime', blackHole(), true)];
  for (let i = 0; i < 10; i++) S.otherSystems.push({ name: 'Reg' + i, starType: 'G', systemType: 'single', planets: planets() });

  g.performSupernova(1);
  await wait(1700);

  assert('Вспышка: обе прайм-системы выжили, хотя у одной не было флага isPrime', countPrimes(S) === 2);
  const keys = S.otherSystems.filter((s) => s && s.primeData).map((s) => s.primeData.objectKey).sort();
  assert('Вспышка: сохранились именно ЧД и кротовая нора', keys.join(',') === 'blackHole,wormhole3');
  assert('Вспышка: у всех прайм-систем восстановлен флаг isPrime', S.otherSystems.filter((s) => s && s.primeData).every((s) => s.isPrime === true));
  assert('Вспышка: праймы не превышают общий лимит систем', S.systems === S.otherSystems.filter(Boolean).length);
}

async function testPrestigeKeepsActiveHomePrime() {
  // Сценарий 2: Прайм висит на активной родной системе (S.primeSystem при idx 0),
  // второй Прайм — в otherSystems. Оба обязаны выжить.
  const g = createGame();
  const S = g.S;
  S.stage = 'system';
  S.prestigeLevel = 0;
  S.galaxies = 1; S.galaxyMultiplier = 1;
  S.systems = 8;
  S.planets = planets();
  S.systemName = 'Дом'; S.starType = 'G'; S.systemType = 'single';
  S.primeSystem = wormhole3();
  S.activeSystemIdx = 0;
  S.otherSystems = [null, primeSystem('BHPrime', blackHole(), true)];
  for (let i = 0; i < 6; i++) S.otherSystems.push({ name: 'Reg' + i, starType: 'G', systemType: 'single', planets: planets() });

  g.performSupernova(1);
  await wait(1700);

  assert('Вспышка: Прайм на родной (активной) системе не потерялся', countPrimes(S) === 2);
  const keys = S.otherSystems.filter((s) => s && s.primeData).map((s) => s.primeData.objectKey).sort();
  assert('Вспышка: активный Прайм + Прайм из сейва оба на месте', keys.join(',') === 'blackHole,wormhole3');
}

function testInvasionNeverTargetsPrime() {
  const g = createGame();
  const S = g.S;
  S.stage = 'galaxy';
  S.systems = 6;
  S.primeSystem = null;
  S.activeSystemIdx = 0;
  S.otherSystems = [null,
    primeSystem('WormPrime', wormhole3(), true),
    primeSystem('BHPrime', blackHole(), true),
    { name: 'Reg0', starType: 'G', systemType: 'single', planets: planets() },
    { name: 'Reg1', starType: 'G', systemType: 'single', planets: planets() }];

  let primeTargets = 0;
  for (let i = 0; i < 300; i++) {
    S.invasions = [];
    g.spawnInvasion();
    for (const inv of S.invasions) {
      if (typeof inv.systemIdx === 'number' && g.isPrimeSystemAt(inv.systemIdx)) primeTargets++;
    }
  }
  assert('Вторжение: 300 попыток — ни одна не выбрала Прайм-систему', primeTargets === 0);

  // Если в галактике вообще нет обычных систем (даже родная — Прайм), атаковать некого.
  S.otherSystems = [null, primeSystem('WormPrime', wormhole3(), true), primeSystem('BHPrime', blackHole(), true)];
  S.primeSystem = blackHole();
  S.systems = 3;
  S.invasions = [];
  g.spawnInvasion();
  assert('Вторжение: при одних Прайм-системах новая атака не создаётся', S.invasions.length === 0);
}

function testInvasionCannotDamagePrime() {
  const g = createGame();
  const S = g.S;
  S.stage = 'galaxy';
  S.systems = 3;
  S.activeSystemIdx = 0;
  S.otherSystems = [null,
    primeSystem('WormPrime', wormhole3(), true),
    primeSystem('BHPrime', blackHole(), true)];
  S.primeSystem = blackHole();
  S.activeSystemIdx = 2;
  S.planets = planets();
  S.systemName = 'BHPrime';

  // «Старая» атака, нацеленная на Прайм, должна быть снята без урона.
  const before = S.planets.length;
  S.invasions = [{
    id: 'x', tierKey: 'raid', targetType: 'system', systemIdx: 2,
    ships: [{ destroyed: false }], spawnedAt: 0,
    robberyEndsAt: 0, destructionEndsAt: 0, hp: 200, maxHp: 200,
    stolen: 0, drainedEnergy: 0, drainedCiv: 0, defenseBroken: false, notified: true,
  }];
  g.tickInvasions(1);
  assert('Вторжение: атака на Прайм-систему снимается без урона', S.invasions.length === 0 && S.planets.length === before);
  assert('Вторжение: планеты Прайм-системы не выключены', S.planets.every((p) => !(p.disabledUntil > Date.now())));

  // Прямой вызов последствий вторжения не должен трогать Прайм.
  const p = S.planets[0];
  g.applyInvasionAftermath({ systemIdx: 2, tierKey: 'raid', waveId: 'w', stolen: 0 });
  assert('Вторжение: последствия не выключают планеты Прайм-системы', !(p.disabledUntil > Date.now()));
  assert('Вторжение: доход Прайм-системы не штрафуется', !S.invasionDebuff || !S.invasionDebuff.until);

  // Атака на ОБЫЧНУЮ систему не должна задевать планеты активного Прайма.
  S.otherSystems[0] = { name: 'Home', starType: 'G', systemType: 'single', planets: [planets()[0], planets()[0], planets()[0]] };
  const primePlanet = S.planets[0];
  primePlanet.disabledUntil = 0;
  g.applyInvasionAftermath({ systemIdx: 0, tierKey: 'raid', waveId: 'w2', stolen: 0 });
  assert('Вторжение: атака на обычную систему не выключает планеты активного Прайма', !(primePlanet.disabledUntil > Date.now()));
  // Урон системы (старая ветка экономики) тоже не должен бить Прайм.
  S.otherSystems[1].damagedUntil = 0;
  g.applySystemLosses(5);
  assert('Вторжение: обычные потери систем не повреждают Прайм-систему', !(S.otherSystems[1].damagedUntil > Date.now()));

  // Офлайн-урон в Прайм-системе не наносится.
  const dust = S.dust;
  const hit = g.applyInvasionHit('raid', { dust: 1e9, energy: 1e9, civ: 1e9 }, 1);
  assert('Вторжение: офлайн-урон в Прайм-системе равен нулю', hit.dust === 0 && hit.energy === 0 && hit.civ === 0 && S.dust === dust);
}

(async function run() {
  console.log('========================================');
  console.log('🧪 ТЕСТЫ ЗАЩИТЫ ПРАЙМ-СИСТЕМ');
  console.log('========================================');
  try {
    await testPrestigeKeepsAllPrimes();
    await testPrestigeKeepsActiveHomePrime();
    testInvasionNeverTargetsPrime();
    testInvasionCannotDamagePrime();
  } catch (e) {
    console.error('❌ Исключение в тестах: ' + (e && e.stack || e));
    failed++;
  }
  console.log('========================================');
  console.log(`ИТОГО: Пройдено ${passed}, Провалено ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
})();
