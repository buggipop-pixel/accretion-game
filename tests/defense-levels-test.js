// ═══════════════════════════════════════════════════════════════
//  DEFENSE / FLEET REPEL TEST
//  Уровни 1–5 дают +10% к шансу отбития (макс 50%), флот — до +30%
//  от вложенных металлов, общий кап 80%, премиум-щит — 100%.
//  Уровни больше НЕ снижают урон: провалил бросок — получил полный урон.
//  Запуск: node tests/defense-levels-test.js
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

const close = (a, b, eps) => Math.abs(a - b) <= (eps == null ? 1e-9 : eps);

function planet(seed) {
  return {
    type: 'superEarth', baseOrbitR: 100, orbitR: 100, mass: 1, diameter: 1,
    forming: false, seed: seed || 1, civLevel: 0,
  };
}

function prepare(g) {
  const S = g.S;
  S.nightConfig = { mode: 'balanced', defenseEnabled: true, cometHours: 0, expeditionPercent: 0 };
  S.nightDefenseLevel = 0;
  S.nightDefenseExpiresAt = 0;
  S.activeTrophyEffects = [];
  S.stage = 'system';
  S.systems = 1;
  S.activeSystemIdx = 0;
  S.primeSystem = null;
  S.otherSystems = [];
  S.shieldUntil = 0;
  S.starType = 'G';
  S.systemType = 'single';
  S.planets = [planet(1), planet(2)];
  S.dust = 1e9; S.energy = 1e9; S.civLevel = 1e9;
  S.dustTotal = 1e9;
  S.invasionDebuff = { pct: 0, until: 0 };
  S.invasionWaveApplied = null;
  S.fleet = { interceptor: 0, cruiser: 0, dreadnought: 0 };
  S.fleetActive = false;
  S.invasions = [];
  S.lastInvasionCheck = Date.now();
  return S;
}

function setDefense(S, lvl, opts) {
  opts = opts || {};
  S.nightDefenseLevel = lvl;
  S.nightDefenseExpiresAt = Date.now() + (opts.expired ? -1000 : 3600 * 1000);
  S.nightConfig.defenseEnabled = opts.enabled !== false;
}

function activateFleet(S, interceptorCount) {
  S.fleet = { interceptor: interceptorCount || 30, cruiser: 0, dreadnought: 0 };
  S.fleetActive = true;
}

function makeOut() {
  return {
    seconds: 4 * 3600, dustEarned: 0, energyEarned: 0, civEarned: 0,
    cometEarned: 0, expEarned: 0, nightEnded: false,
    invasionAttacks: 0, invasionDefended: 0, invasionLost: 0,
    invasionDrainE: 0, invasionDrainC: 0, invasionLostDust: 0, shieldProtected: false,
  };
}

function withRandom(g, value, fn) {
  const original = g.Math.random;
  g.Math.random = () => value;
  try { fn(); } finally { g.Math.random = original; }
}

function testFreshState() {
  const g = createGame();
  const S = prepare(g);
  assert('Свежий сейв: уровни не дают шанс', g.defenseRepelChance() === 0);
  assert('Свежий сейв: флот не даёт шанс', g.fleetRepelChance() === 0);
  assert('Свежий сейв: итоговый шанс 0', g.invasionRepelChance() === 0);
}

function testDefenseLevels() {
  const g = createGame();
  const S = prepare(g);
  const expected = [0, 0.10, 0.20, 0.30, 0.40, 0.50];

  for (let lvl = 1; lvl <= 5; lvl++) {
    setDefense(S, lvl);
    assert('Ур.' + lvl + ': +' + (lvl * 10) + '% к отбитию', close(g.defenseRepelChance(), expected[lvl]));
    assert('Ур.' + lvl + ': итоговый шанс без флота', close(g.invasionRepelChance(), expected[lvl]));
  }

  setDefense(S, 5, { expired: true });
  assert('Истекла: шанс 0', g.defenseRepelChance() === 0);

  setDefense(S, 5, { enabled: false });
  assert('Тумблер ВЫКЛ: шанс 0', g.defenseRepelChance() === 0);

  // Регресс: старое поле S.defenseLevel больше не влияет.
  prepare(g);
  S.defenseLevel = 5;
  assert('Чужое поле S.defenseLevel игнорируется', g.invasionRepelChance() === 0);
}

function testFleetInvestment() {
  const g = createGame();
  const S = prepare(g);

  S.fleet = { interceptor: 1, cruiser: 0, dreadnought: 0 };
  assert('Стоимость флота: 1 перехватчик = 500 ⚙', g.fleetMetalValue() === 500);
  S.fleet = { interceptor: 3, cruiser: 1, dreadnought: 1 };
  assert('Стоимость флота: сумма по всем кораблям', g.fleetMetalValue() === 3 * 500 + 2000 + 8000);

  setDefense(S, 5);
  S.fleet = { interceptor: 10, cruiser: 0, dreadnought: 0 };
  S.fleetActive = false;
  assert('Флот в резерве: бонуса нет', g.fleetRepelChance() === 0);

  S.fleetActive = true;
  assert('10 перехватчиков (5000 ⚙): +10%', close(g.fleetRepelChance(), 0.10));

  S.fleet = { interceptor: 60, cruiser: 0, dreadnought: 0 };
  assert('Флот за 30 000 ⚙: кап +30%', close(g.fleetRepelChance(), 0.30));

  setDefense(S, 4);
  assert('Флот не активен без обороны ур.5', g.fleetRepelChance() === 0);
}

function testTotalAndCap() {
  const g = createGame();
  const S = prepare(g);

  setDefense(S, 5);
  S.fleet = { interceptor: 60, cruiser: 0, dreadnought: 0 };
  S.fleetActive = true;
  assert('Ур.5 + флот: общий кап 80%', close(g.invasionRepelChance(), 0.80));

  setDefense(S, 3);
  S.fleet = { interceptor: 10, cruiser: 0, dreadnought: 0 };
  S.fleetActive = true;
  assert('Ур.3 без флота: 30%', close(g.invasionRepelChance(), 0.30));
}

function testShieldAndExpedition() {
  const g = createGame();
  const S = prepare(g);

  S.shieldUntil = Date.now() + 3600 * 1000;
  assert('Премиум-щит: 100% отбития без обороны', g.invasionRepelChance() === 1);
  S.shieldUntil = 0;

  setDefense(S, 5);
  S.nightConfig.expeditionPercent = 30;
  assert('Экспедиция 30%: −9 п.п. к шансу', close(g.invasionRepelChance(), 0.41));
  S.nightConfig.expeditionPercent = 100;
  assert('Экспедиция 100%: −30 п.п. к шансу', close(g.invasionRepelChance(), 0.20));
}

function testTrophyLevel() {
  const g = createGame();
  const S = prepare(g);

  S.activeTrophyEffects = [{ type: 'defense_level', value: 5, expiresAt: Date.now() + 3600 * 1000 }];
  assert('Трофей ур.5: +50% к отбитию', close(g.defenseRepelChance(), 0.50));

  S.fleet = { interceptor: 30, cruiser: 0, dreadnought: 0 };
  S.fleetActive = true;
  assert('Трофей ур.5 + флот: 80%', close(g.invasionRepelChance(), 0.80));

  S.nightConfig.defenseEnabled = false;
  assert('Трофей при выключенной Автобороне не работает', g.invasionRepelChance() === 0);
}

function testNoDamageReduction() {
  const g = createGame();
  const S = prepare(g);

  setDefense(S, 5);
  const caps = { dust: S.dust * 0.4, energy: S.energy * 0.4, civ: S.civLevel * 0.4 };
  const before = S.dust;
  const hit = g.applyInvasionHit('scout', caps);
  assert('Ур.5 не снижает урон: провал броса = полная кража', hit.dust > 0 && S.dust < before);
  assert('Ур.5 не отменяет простой планет', hit.disabled === 1);
}

function testOfflineRepel() {
  const g = createGame();
  const S = prepare(g);

  setDefense(S, 5);
  activateFleet(S, 60); // 30 000 ⚙ → +30%, итого 80%

  withRandom(g, 0.79, () => {
    const out = makeOut();
    const before = S.dust;
    g.simulateOfflineInvasions(4 * 3600, out);
    assert('Офлайн 80%: все атаки отбиты (0.79 < 0.80)', out.invasionDefended === out.invasionAttacks && out.invasionAttacks > 0);
    assert('Офлайн 80%: пыль не украдена', out.invasionLostDust === 0 && S.dust === before);
  });

  withRandom(g, 0.99, () => {
    const out = makeOut();
    const before = S.dust;
    g.simulateOfflineInvasions(4 * 3600, out);
    assert('Офлайн 80%: при провале броса урон проходит', out.invasionLostDust > 0 && S.dust < before);
  });
}

function testOfflineShield() {
  const g = createGame();
  const S = prepare(g);
  S.shieldUntil = Date.now() + 3600 * 1000;
  const out = makeOut();
  g.simulateOfflineInvasions(4 * 3600, out);
  assert('Офлайн: щит помечает защиту', out.shieldProtected === true && out.invasionAttacks === 0);
}

function testLiveSpawnRepel() {
  const g = createGame();
  const S = prepare(g);

  setDefense(S, 5);
  activateFleet(S, 60);
  S.lastInvasionCheck = Date.now() - 10 * 3600 * 1000;

  withRandom(g, 0.0, () => {
    g.tickInvasions(1);
    assert('Живой спавн: 80% отбивает атаку (random 0)', S.invasions.length === 0);
  });

  S.lastInvasionCheck = Date.now() - 10 * 3600 * 1000;
  withRandom(g, 0.99, () => {
    g.tickInvasions(1);
    assert('Живой спавн: провал броса создаёт вторжение', S.invasions.length > 0);
  });
}

function testShieldBlocksSpawn() {
  const g = createGame();
  const S = prepare(g);
  S.shieldUntil = Date.now() + 3600 * 1000;
  g.spawnInvasion();
  assert('Живой спавн: премиум-щит не создаёт вторжение', S.invasions.length === 0);
}

(function run() {
  console.log('========================================');
  console.log('🧪 ТЕСТЫ ОТБИТИЯ: УРОВНИ + ФЛОТ');
  console.log('========================================');
  try {
    testFreshState();
    testDefenseLevels();
    testFleetInvestment();
    testTotalAndCap();
    testShieldAndExpedition();
    testTrophyLevel();
    testNoDamageReduction();
    testOfflineRepel();
    testOfflineShield();
    testLiveSpawnRepel();
    testShieldBlocksSpawn();
  } catch (e) {
    console.error('❌ Исключение в тестах: ' + (e && e.stack || e));
    failed++;
  }
  console.log('========================================');
  console.log(`ИТОГО: Пройдено ${passed}, Провалено ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
})();
