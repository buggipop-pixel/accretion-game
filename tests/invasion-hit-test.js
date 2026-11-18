// ═══════════════════════════════════════════════════════════════
//  INVASION-HIT TEST — тап по кораблям вторжения при сильном
//  отдалении галактики. Проверяет, что цель не сжимается в пиксель
//  вместе с зумом, попадание остаётся щедрым, а промах рядом с
//  кораблём можно распознать (чтобы не разворачивать камеру).
//  Запуск: node tests/invasion-hit-test.js
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
    putImageData: noop, drawImage: noop, fillRect: noop, strokeRect: noop, clearRect: noop,
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
    createElement: (tag) => {
      const el = makeElement();
      if (String(tag).toLowerCase() === 'canvas') { el.width = 800; el.height = 600; el.getContext = () => makeContext2d(); }
      return el;
    },
    addEventListener: noop, removeEventListener: noop,
    body: makeElement(), documentElement: makeElement(),
    visibilityState: 'hidden', hidden: true, cookie: '',
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
    setTimeout, clearTimeout, setInterval, clearInterval, Date, Math, JSON, Set, Array, Object, Number, String,
  });
  // ★ Координатные заглушки: система вторжения стоит в (460, 300),
  //   корабль на орбите 40px — в (500, 300).
  context.galaxySystemPos = function (idx) { return { x: 400 + Number(idx) * 20, y: 300 }; };
  context.worldToScreen = function (x, y) { return { x: 400 + x, y: 300 + y }; };
  context.getPlanetWorldPos = function (p) { return { x: p.orbitR || 100, y: 0 }; };

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
function assert(name, condition, extra) {
  if (condition) { console.log('✅ ' + name); passed++; }
  else { console.error('❌ ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra) : '')); failed++; }
}

function prepare(g) {
  const S = g.S;
  S.stage = 'galaxy';
  S.zoom = 0.04;              // сильное отдаление: 1000+ систем
  S.totalSystemsCreated = 1000;
  S.activeSystemIdx = 0;
  S.otherSystems = [];
  S.planets = [];
  S.dust = 100000; S.dustTotal = 100000;
  S.energy = 100000; S.metalAmount = 100000; S.civLevel = 100;
  S.stats = { clicks: 0, invasionsDefeated: 0 };
  S.explosions = [];
  S.invasions = [];
  return S;
}

function makeInvasion() {
  return {
    id: 'test-inv', targetType: 'system', systemIdx: 3, tierKey: 'raid',
    spawnedAt: Date.now(), notified: true, difficulty: 2,
    ships: [{ type: 'fighter', hp: 45, maxHp: 45, angle: 0, speed: 0, dist: 1, size: 0.8, destroyed: false }],
    fleetShots: [],
  };
}

function testHitRadiusAtFarZoom() {
  const g = createGame();
  const S = prepare(g);
  S.invasions = [makeInvasion()];
  const inv = S.invasions[0];
  inv.ships[0].hp = 45;

  const oldRadius = g.INVASION_CFG.hitRadius * S.zoom;
  assert('Старый расчёт радиуса действительно был микроскопическим', oldRadius < 1, oldRadius);

  const newRadius = g.invasionHitRadius(inv.ships[0], S.zoom);
  assert('Радиус попадания имеет экранный минимум', newRadius >= 26, newRadius);

  // Корабль в (500, 300), тап промахивается на 18px — раньше это был промах.
  const hit = g.tryHitInvasionShip(518, 300);
  assert('Тап рядом с кораблём засчитывается как попадание', hit === true);
  assert('Попадание сняло HP корабля', inv.ships[0].hp < 45, inv.ships[0].hp);
  assert('Взрыв-хит добавлен в список эффектов', S.explosions.length >= 1);

  // Далеко от корабля — не попадание.
  assert('Тап далеко от корабля — промах', g.tryHitInvasionShip(500, 380) === false);
}

function testTapGrace() {
  const g = createGame();
  const S = prepare(g);
  S.invasions = [makeInvasion()];
  // (535, 300) — 35px от корабля: шире нового радиуса, но внутри зоны прощения.
  assert('Промах рядом с кораблём распознаётся как тап по цели', g.invasionTapGrace(535, 300) === true);
  assert('Далеко от корабля зона прощения не срабатывает', g.invasionTapGrace(700, 300) === false);
  S.invasions = [];
  assert('Без вторжений зона прощения выключена', g.invasionTapGrace(535, 300) === false);
}

function testDrawKeepsShipsVisible() {
  const g = createGame();
  const S = prepare(g);
  S.invasions = [makeInvasion()];
  let seenZ = null;
  const orig = g.drawInvaderShip;
  g.drawInvaderShip = function (ctx, ship, z) { seenZ = z; return orig(ctx, ship, z); };
  let threw = null;
  try { g.drawInvasions(makeContext2d(), 1); } catch (e) { threw = e; }
  g.drawInvaderShip = orig;
  assert('Отрисовка вторжения не падает при дальнем зуме', threw === null, threw && String(threw));
  assert('Корабль рисуется не меньше экранного минимума', seenZ !== null && seenZ >= 0.95, seenZ);
}

(function run() {
  console.log('========================================');
  console.log('🧪 ТЕСТЫ ПОПАДАНИЯ ПО ВТОРЖЕНИЯМ');
  console.log('========================================');
  try {
    testHitRadiusAtFarZoom();
    testTapGrace();
    testDrawKeepsShipsVisible();
  } catch (e) {
    console.error('❌ Исключение в тестах: ' + (e && e.stack || e));
    failed++;
  }
  console.log('========================================');
  console.log(`ИТОГО: Пройдено ${passed}, Провалено ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
})();
