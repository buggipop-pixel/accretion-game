// ═══════════════════════════════════════════════════════════════
//  NEGLECT TEST — «запустение галактики»
//  Долгое отсутствие должно усиливать офлайн-вторжения: больше волн,
//  выше кап потерь, повреждение целых систем и простой планет.
//  Запуск: node tests/neglect-test.js
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
    Image: function () { const i = makeElement(); i.src = ''; i.width = 0; i.height = 0; i.complete = true; i.onload = null; i.onerror = null; return i; },
    toast: noop, updateUI: noop, playSFX: noop, addEvent: noop,
    setTimeout, clearTimeout, Date, Math, JSON, Set, Array, Object, Number, String,
  });
  vm.createContext(context);

  ['config.js', 'state.js', 'economy.js', 'planets.js', 'prime.js', 'invasions.js'].forEach((f) => {
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

function planet(seed) {
  return {
    type: 'superEarth', baseOrbitR: 100, orbitR: 100, mass: 1, diameter: 1,
    forming: false, seed: seed || 1, civLevel: 0,
  };
}

function system(name, seed) {
  return {
    name: name, starType: 'G', systemType: 'single', incomeBonus: 0,
    planets: [planet(seed), planet(seed + 1), planet(seed + 2)],
  };
}

function prepare(g, opts) {
  opts = opts || {};
  const S = g.S;
  S.stage = 'galaxy';
  S.systems = 5;
  S.activeSystemIdx = 0;
  S.activeSystemDamagedUntil = 0;
  S.primeSystem = opts.activePrime ? { objectKey: 'blackHole', objectName: 'Чёрная дыра', bonus: { dustMult: 0.25 } } : null;
  S.otherSystems = [null, system('A', 10), system('B', 20), system('C', 30), system('D', 40)];
  if (opts.primes) {
    for (const idx of opts.primes) {
      S.otherSystems[idx].isPrime = true;
      S.otherSystems[idx].primeData = { objectKey: 'blackHole', objectName: 'Чёрная дыра', bonus: {} };
    }
  }
  S.planets = [planet(1), planet(2), planet(3)];
  S.planets[0].type = 'lava'; // источник металлов для проверки кражи ⚙
  S.starType = 'G';
  S.systemType = 'single';
  S.dust = 1e9; S.dustTotal = 1e9;
  S.energy = 1e9; S.civLevel = 1e9; S.metalAmount = 1e9;
  S.storageLevels = { dust: 7, energy: 7, civ: 7 };
  S.storageProgress = { dust: 0, energy: 0, civ: 0 };
  S.invasionDebuff = { pct: 0, until: 0 };
  S.invasionWaveApplied = null;
  S.shieldUntil = 0;
  S.lastTick = Date.now() - 8 * 3600 * 1000;
  S.nightConfig = { mode: 'balanced', defenseEnabled: true, cometHours: 0, expeditionPercent: 0 };
  S.nightDefenseLevel = 0;
  S.nightDefenseExpiresAt = 0;
  S.activeTrophyEffects = [];
  S.fleet = { interceptor: 0, cruiser: 0, dreadnought: 0 };
  S.fleetActive = false;
  S.invasions = [];
  return S;
}

function makeOut() {
  return {
    seconds: 8 * 3600, dustEarned: 0, energyEarned: 0, civEarned: 0, metalsEarned: 0,
    cometEarned: 0, expEarned: 0, nightEnded: false,
    invasionAttacks: 0, invasionDefended: 0, invasionLost: 0,
    invasionDrainE: 0, invasionDrainC: 0, invasionLostDust: 0, invasionLostMetals: 0,
    invasionSystemsDamaged: 0, neglectLevel: 0, awayHours: 0, shieldProtected: false,
  };
}

function withRandom(g, value, fn) {
  const original = g.Math.random;
  g.Math.random = () => value;
  try { fn(); } finally { g.Math.random = original; }
}

function testLevels() {
  const g = createGame();
  const L = g.invasionNeglectLevel;
  assert('Запустение: 24 ч — ещё 0', L(24) === 0);
  assert('Запустение: 72 ч (3 сут) — порог, 0', L(72) === 0);
  assert('Запустение: 73 ч — ур.1', L(73) === 1);
  assert('Запустение: 96 ч (4 сут) — ур.2', L(96) === 2);
  assert('Запустение: 120 ч (5 сут) — ур.3', L(120) === 3);
  assert('Запустение: 168 ч (7 сут) — ур.5', L(168) === 5);
}

function testShortAbsence() {
  const g = createGame();
  const S = prepare(g);
  const beforeDust = S.dust;
  withRandom(g, 0.99, () => {
    const out = makeOut();
    g.simulateOfflineInvasions(3 * 3600, out);
    assert('3 ч: без запустения', out.neglectLevel === 0);
    assert('3 ч: системы не повреждаются', out.invasionSystemsDamaged === 0);
    // 3 ч / 3 ч = 1 волна; урон может быть, но кап прежний.
    assert('3 ч: не больше 1 волны', out.invasionAttacks <= 1);
    assert('3 ч: пыль не уходит в минус', S.dust >= 0 && S.dust <= beforeDust);
  });
}

function testLongAbsence() {
  const g = createGame();
  const S = prepare(g);
  withRandom(g, 0.99, () => {
    const out = makeOut();
    g.simulateOfflineInvasions(96 * 3600, out);
    assert('96 ч: запустение ур.2', out.neglectLevel === 2);
    assert('96 ч: волн по потолку', out.invasionAttacks === 12);
    assert('96 ч: украдена пыль', out.invasionLostDust > 0);
    assert('96 ч: украдена энергия', out.invasionDrainE > 0);
    assert('96 ч: украдена цивилизация', out.invasionDrainC > 0);
    assert('96 ч: украдены металлы', out.invasionLostMetals > 0);
    assert('96 ч: есть выведенные из строя системы', out.invasionSystemsDamaged > 0);
    const damaged = S.otherSystems.slice(1).filter((s) => s && s.damagedUntil > Date.now()).length;
    assert('96 ч: damagedUntil выставлен обычным системам', damaged > 0);
    assert('96 ч: штраф к доходу наложен', S.invasionDebuff && S.invasionDebuff.pct > 0);
  });
}

function testDeepNeglect() {
  const g = createGame();
  const S = prepare(g);
  withRandom(g, 0.99, () => {
    const out = makeOut();
    g.simulateOfflineInvasions(168 * 3600, out);
    assert('168 ч: запустение ур.5', out.neglectLevel === 5);
    assert('168 ч: волн максимум', out.invasionAttacks === 12);
    assert('168 ч: повреждено несколько систем', out.invasionSystemsDamaged >= 3);
    assert('168 ч: планет в простое больше', out.invasionLost > 0);
    assert('168 ч: кап потерь усилен', out.invasionLostDust > 0);
  });
}

function testPrimeActiveProtected() {
  const g = createGame();
  const S = prepare(g, { activePrime: true });
  const primeSeeds = S.planets.map((p) => p.seed);
  withRandom(g, 0.99, () => {
    const out = makeOut();
    g.simulateOfflineInvasions(96 * 3600, out);
    assert('Активный Прайм: его планеты не простаивают', S.planets.every((p) => !(p.disabledUntil > Date.now())));
    assert('Активный Прайм: но обычные системы получают урон', out.invasionSystemsDamaged > 0);
    assert('Активный Прайм: его seed не тронут', S.planets.map((p) => p.seed).join() === primeSeeds.join());
  });
}

function testAllPrime() {
  const g = createGame();
  const S = prepare(g, { activePrime: true, primes: [1, 2, 3, 4] });
  const beforeDust = S.dust;
  withRandom(g, 0.99, () => {
    const out = makeOut();
    g.simulateOfflineInvasions(24 * 3600, out);
    assert('Все Прайм: урона нет', out.invasionLostDust === 0 && out.invasionSystemsDamaged === 0 && out.invasionLost === 0);
    assert('Все Прайм: атак не засчитано', out.invasionAttacks === 0);
    assert('Все Прайм: пыль не тронута', S.dust === beforeDust);
  });
}

function testPartialShield() {
  const g = createGame();
  const S = prepare(g);
  // Щит истёк 6 часов назад; из 12 часов отсутствия 6 были под щитом.
  S.shieldUntil = Date.now() - 6 * 3600 * 1000;
  withRandom(g, 0.99, () => {
    const out = makeOut();
    g.simulateOfflineInvasions(12 * 3600, out);
    assert('Частичный щит: помечен', out.shieldProtected === true);
    assert('Частичный щит: атаки всё равно есть', out.invasionAttacks > 0);
    assert('Частичный щит: считаем только открытые часы', Math.abs(out.awayHours - 6) < 0.1);
  });
}

function testFullShield() {
  const g = createGame();
  const S = prepare(g);
  S.shieldUntil = Date.now() + 5 * 3600 * 1000;
  withRandom(g, 0.99, () => {
    const out = makeOut();
    g.simulateOfflineInvasions(8 * 3600, out);
    assert('Полный щит: атак нет', out.invasionAttacks === 0);
    assert('Полный щит: помечен', out.shieldProtected === true);
  });
}

function testTargetSystemDamage() {
  const g = createGame();
  const S = prepare(g);
  const activeSeeds = S.planets.map((p) => p.seed);
  withRandom(g, 0.99, () => {
    const hit = g.applyInvasionHit('siege', { dust: 1e9, energy: 1e9, civ: 1e9, metals: 1e9 }, 2);
    assert('Удар по чужой системе: ресурсы крадутся', hit.dust > 0);
    assert('Удар по чужой системе: её планеты простаивают', S.otherSystems[2].planets.some((p) => p.disabledUntil > Date.now()));
    assert('Удар по чужой системе: активная не тронута', S.planets.map((p) => p.seed).join() === activeSeeds.join());
  });
}

function testApplyOfflineProgressOnce() {
  const g = createGame();
  const S = prepare(g);
  const before = Date.now() - 8 * 3600 * 1000;
  S.lastTick = before;
  withRandom(g, 0.99, () => {
    const out = g.applyOfflineProgress();
    assert('applyOfflineProgress: вернул отчёт', !!out && out.seconds >= 8 * 3600 - 5);
    assert('applyOfflineProgress: lastTick сдвинут', S.lastTick > before);
    const second = g.applyOfflineProgress();
    assert('applyOfflineProgress: повторно не начисляет', second === null);
  });
}

// Регресс B1: saveGame() мог обнулить lastTick до офлайн-расчёта.
function testBootAwaySnapshot() {
  const g = createGame();
  const S = prepare(g);
  const away = Date.now() - 96 * 3600 * 1000;
  S.lastTick = Date.now(); // как будто saveGame() уже перезаписал время
  withRandom(g, 0.99, () => {
    const out = g.applyOfflineProgress(away);
    assert('Boot snapshot: отчёт не потерян', !!out && out.neglectLevel > 0);
  });
}

// Регресс M1: сохранение не должно двигать lastTick (иначе автосейв съедает ночь).
function testSaveDoesNotMoveLastTick() {
  const g = createGame();
  const S = prepare(g);
  const away = Date.now() - 8 * 3600 * 1000;
  S.lastTick = away;
  g.saveGame();
  assert('saveGame: lastTick не перезаписан', S.lastTick === away);
}

// Регресс M3: повреждение системы не должно исчезать при входе в неё.
function testActiveDamagePersists() {
  const g = createGame();
  const S = prepare(g);
  const until = Date.now() + 3600 * 1000;
  S.otherSystems[2].damagedUntil = until;
  g.switchToSystem(2);
  assert('Повреждение: применяется к активной системе', S.activeSystemDamagedUntil > Date.now());
  let activeDamaged = false;
  g.forEachOwnedSystem((idx, planets, star, type, bonus, prime, damaged, isActive) => {
    if (isActive) activeDamaged = damaged;
  });
  assert('Повреждение: активная система не даёт дохода', activeDamaged === true);
  g.switchToSystem(0);
  assert('Повреждение: пережило переключение', S.otherSystems[2].damagedUntil > Date.now());
}

// Регресс M2: короткий возврат на вкладку не должен закрывать ночь.
function testNightMissionNotEndedEarly() {
  const g = createGame();
  const S = prepare(g);
  S.nightConfig.cometHours = 3;
  g.MISS = {
    comets: [{ startAt: Date.now() - 2 * 60 * 1000, flightTime: 60 * 60 * 1000, isNight: true, reward: 1000, fail: false }],
    expeditions: [],
  };
  S.lastTick = Date.now() - 2 * 60 * 1000;
  withRandom(g, 0.99, () => {
    const out = g.applyOfflineProgress();
    assert('Ночная миссия: не закрывается через 2 мин', !!out && !out.nightEnded && g.MISS.comets.length === 1);
    assert('Ночной бюджет: не сброшен', Number(S.nightConfig.cometHours) === 3);
  });
}

function testDebuffHitsAllIncome() {
  const g = createGame();
  const S = prepare(g);
  S.invasionDebuff = { pct: 0.5, until: Date.now() + 3600 * 1000 };
  const withDebuff = {
    dust: g.dustPerSec(), energy: g.energyPerSec(), civ: g.civPerSec(), metals: g.metalsPerSec(),
  };
  S.invasionDebuff = { pct: 0, until: 0 };
  const withoutDebuff = {
    dust: g.dustPerSec(), energy: g.energyPerSec(), civ: g.civPerSec(), metals: g.metalsPerSec(),
  };
  assert('Оккупация: пыль −50%', Math.abs(withDebuff.dust - withoutDebuff.dust * 0.5) < 1e-6);
  assert('Оккупация: энергия −50%', Math.abs(withDebuff.energy - withoutDebuff.energy * 0.5) < 1e-6);
  assert('Оккупация: цивилизация −50%', Math.abs(withDebuff.civ - withoutDebuff.civ * 0.5) < 1e-6);
  assert('Оккупация: металлы −50%', Math.abs(withDebuff.metals - withoutDebuff.metals * 0.5) < 1e-6);
}

(function run() {
  console.log('========================================');
  console.log('🧪 ТЕСТЫ ЗАПУСТЕНИЯ ГАЛАКТИКИ');
  console.log('========================================');
  try {
    testLevels();
    testShortAbsence();
    testLongAbsence();
    testDeepNeglect();
    testPrimeActiveProtected();
    testAllPrime();
    testPartialShield();
    testFullShield();
    testTargetSystemDamage();
    testApplyOfflineProgressOnce();
    testBootAwaySnapshot();
    testSaveDoesNotMoveLastTick();
    testActiveDamagePersists();
    testNightMissionNotEndedEarly();
    testDebuffHitsAllIncome();
  } catch (e) {
    console.error('💥 Упало:', e);
    failed++;
  }
  console.log('========================================');
  console.log('ИТОГО: Пройдено ' + passed + ', Провалено ' + failed);
  console.log('========================================');
  process.exit(failed > 0 ? 1 : 0);
})();
