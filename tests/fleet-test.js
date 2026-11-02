// ═══════════════════════════════════════════════════════════════
//  FLEET TEST — флот как автооборона.
//  Активация флота возможна только при активной Автобороне ур.5,
//  а старая «магическая» автооборона без кораблей убрана.
//  Запуск: node tests/fleet-test.js
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

// Свежий vm-контекст с игровыми скриптами (как в prime-protection-test.js).
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

  const files = ['config.js', 'state.js', 'economy.js', 'planets.js', 'prime.js', 'invasions.js'];
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

function planet() {
  return { type: 'lava', baseOrbitR: 100, orbitR: 100, mass: 1, diameter: 1, forming: false, seed: Math.random() * 1e6 };
}

// Готовит игру к тесту тика вторжений без случайного спавна новых атак.
function prepareGame(g, opts) {
  opts = opts || {};
  const S = g.S;
  S.stage = 'system';
  S.systems = 1;
  S.activeSystemIdx = 0;
  S.primeSystem = null;
  S.otherSystems = [];
  S.planets = opts.planets || [];
  S.dust = 0;
  S.energy = 0;
  S.civLevel = 0;
  S.metalAmount = 1e12;
  S.invasions = [];
  S.lastInvasionCheck = Date.now();
  S.stats = { comets: 0, expeditions: 0, invasionsDefeated: 0, clicks: 0, planets: 0, dailyClaims: 0 };
  S.fleet = { interceptor: 0, cruiser: 0, dreadnought: 0 };
  S.fleetActive = false;
  S.nightConfig = { mode: 'balanced', defenseEnabled: true, cometHours: 0, expeditionPercent: 0 };
  S.nightDefenseLevel = 0;
  S.nightDefenseExpiresAt = 0;
  return S;
}

function activateDefense(S, level, hours) {
  S.nightDefenseLevel = level;
  S.nightDefenseExpiresAt = Date.now() + (hours == null ? 24 : hours) * 3600 * 1000;
  S.nightConfig.defenseEnabled = true;
}

function makeInvasion(g, shipCount) {
  const now = Date.now();
  return {
    id: 'test-' + Math.random().toString(36).slice(2),
    tierKey: 'raid',
    targetType: 'system',
    systemIdx: 0,
    ships: g.makeShips(shipCount),
    spawnedAt: now,
    robberyEndsAt: now + 45 * 60 * 1000,
    destructionEndsAt: now + 60 * 60 * 1000,
    hp: 200, maxHp: 200,
    stolen: 0, drainedEnergy: 0, drainedCiv: 0,
    defenseBroken: false,
    notified: false,
  };
}

function testDefenseGating() {
  const g = createGame();
  const S = prepareGame(g);

  S.fleet = { interceptor: 3, cruiser: 0, dreadnought: 0 };
  activateDefense(S, 4);
  assert('Активация: ур.4 не даёт допуск флоту', g.fleetDefenseReady() === false);

  activateDefense(S, 5);
  assert('Активация: активная Автоборона ур.5 даёт допуск', g.fleetDefenseReady() === true);

  S.nightDefenseExpiresAt = Date.now() - 1000;
  assert('Активация: истёкшая Автоборона ур.5 не даёт допуск', g.fleetDefenseReady() === false);

  activateDefense(S, 5);
  S.nightConfig.defenseEnabled = false;
  assert('Активация: выключенный тумблер Автобороны блокирует флот', g.fleetDefenseReady() === false);
}

function testFleetActiveNeedsToggleAndShips() {
  const g = createGame();
  const S = prepareGame(g);

  S.fleet = { interceptor: 3, cruiser: 0, dreadnought: 0 };
  activateDefense(S, 5);
  assert('Флот: без тумблера не активен', g.isFleetActive() === false);

  S.fleetActive = true;
  assert('Флот: при ур.5 и кораблях активен', g.isFleetActive() === true);

  S.fleet = { interceptor: 0, cruiser: 0, dreadnought: 0 };
  assert('Флот: без кораблей не активен даже с тумблером', g.isFleetActive() === false);
}

function testShipsHaveHp() {
  const g = createGame();
  const ships = g.makeShips(3);
  assert('Спавн: у каждого корабля вторжения есть HP', ships.every((s) => s.hp > 0 && s.maxHp === s.hp));
}

function testNoFreeAutoDefense() {
  const g = createGame();
  const S = prepareGame(g);
  S.fleet = { interceptor: 3, cruiser: 0, dreadnought: 0 };
  activateDefense(S, 5);
  S.fleetActive = false;
  S.invasions = [makeInvasion(g, 3)];

  g.tickInvasions(600);

  const alive = S.invasions.length === 1 ? S.invasions[0].ships.filter((s) => !s.destroyed).length : 0;
  assert('Автоборона: без активации флота корабли врага целы', alive === 3);
  assert('Автоборона: флот не включился сам', S.fleetActive === false);
}

function testFleetDestroysInvasion() {
  const g = createGame();
  const S = prepareGame(g);
  S.fleet = { interceptor: 10, cruiser: 0, dreadnought: 0 };
  activateDefense(S, 5);
  S.fleetActive = true;
  S.invasions = [makeInvasion(g, 3)];

  assert('Бой: урон флота считается', g.fleetDps() > 0);
  g.tickInvasions(10);

  assert('Бой: флот уничтожил эскадру и снял вторжение', S.invasions.length === 0);
  assert('Бой: победа засчитана в статистику', S.stats.invasionsDefeated === 1);
}

function testFleetDeactivatesWhenDefenseLapses() {
  const g = createGame();
  const S = prepareGame(g);
  S.fleet = { interceptor: 3, cruiser: 0, dreadnought: 0 };
  activateDefense(S, 5, -1); // уже истекла
  S.fleetActive = true;

  g.tickInvasions(1);
  assert('Срок: флот отключается, когда Автоборона истекла', S.fleetActive === false);
}

function testSpawnedInvasionHasHp() {
  const g = createGame();
  const S = prepareGame(g, { planets: [planet()] });
  g.spawnInvasion();

  const ships = S.invasions.length ? S.invasions[0].ships : [];
  assert('Спавн: новое вторжение получило корабли с HP', ships.length > 0 && ships.every((s) => s.hp > 0));
}

(function run() {
  console.log('========================================');
  console.log('🧪 ТЕСТЫ ФЛОТА (автооборона)');
  console.log('========================================');
  try {
    testDefenseGating();
    testFleetActiveNeedsToggleAndShips();
    testShipsHaveHp();
    testNoFreeAutoDefense();
    testFleetDestroysInvasion();
    testFleetDeactivatesWhenDefenseLapses();
    testSpawnedInvasionHasHp();
  } catch (e) {
    console.error('❌ Исключение в тестах: ' + (e && e.stack || e));
    failed++;
  }
  console.log('========================================');
  console.log(`ИТОГО: Пройдено ${passed}, Провалено ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
})();
