// ═══════════════════════════════════════════════════════════════
//  INVASION-REWORK TEST — сложности 1/2/3, типы кораблей,
//  случайная сила эскадры, награда за ручное уничтожение
//  и rich-уведомления о начале/конце вторжения.
//  Запуск: node tests/invasion-rework-test.js
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
  context.__sent = [];
  context.sendPushNotification = function (message, type) {
    context.__sent.push({ message: message, type: type });
  };
  vm.createContext(context);

  const files = ['config.js', 'state.js', 'economy.js', 'planets.js', 'prime.js', 'invasions.js', 'notifications.js'];
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

function prepareGame(g) {
  const S = g.S;
  S.stage = 'system';
  S.systems = 1;
  S.totalSystemsCreated = 1;
  S.activeSystemIdx = 0;
  S.primeSystem = null;
  S.otherSystems = [];
  S.planets = [{ type: 'lava', baseOrbitR: 100, orbitR: 100, mass: 1, diameter: 1, forming: false, seed: 42 }];
  S.dust = 100000;
  S.dustTotal = 100000;
  S.energy = 100000;
  S.civLevel = 100;
  S.metalAmount = 100000;
  S.invasions = [];
  S.lastInvasionCheck = Date.now();
  S.stats = { comets: 0, expeditions: 0, invasionsDefeated: 0, clicks: 0, planets: 0, dailyClaims: 0 };
  S.fleet = { interceptor: 0, cruiser: 0, dreadnought: 0 };
  S.fleetActive = false;
  S.shieldUntil = 0;
  S.settings = { brightness: 1, sound: true, pushEnabled: true };
  S.nightConfig = { mode: 'balanced', defenseEnabled: false, cometHours: 0, expeditionPercent: 0 };
  S.nightDefenseLevel = 0;
  S.nightDefenseExpiresAt = 0;
  return S;
}

const seenDifficulties = Object.create(null);
const seenShipTypes = Object.create(null);

function testTierConfig() {
  const g = createGame();
  const tiers = g.INVASION_CFG.tiers;
  assert('Конфиг: есть 3 сложности', Object.keys(tiers).length >= 3);
  assert('Конфиг: у сложности 1 есть difficulty=1', tiers.scout.difficulty === 1);
  assert('Конфиг: у сложности 2 есть difficulty=2', tiers.raid.difficulty === 2);
  assert('Конфиг: у сложности 3 есть difficulty=3', tiers.siege.difficulty === 3);
  assert('Конфиг: есть типы кораблей вторжения', Object.keys(g.INVASION_CFG.shipTypes).length >= 3);
  assert('Конфиг: у кораблей есть награда', Object.values(g.INVASION_CFG.shipTypes).every((t) => t.bounty && t.bounty.metals > 0));
}

function testRandomShips() {
  const g = createGame();
  const S = prepareGame(g);

  for (let i = 0; i < 30; i++) {
    const rolled = g.rollInvasionShips('siege');
    const tier = g.INVASION_CFG.tiers.siege;
    assert('Спавн: число кораблей в границах сложности', rolled.count >= tier.shipsMin && rolled.count <= tier.shipsMax, rolled.count);
    const ok = rolled.ships.every((s) => s.hp > 0 && s.maxHp === s.hp && s.type && s.power > 0 && s.bounty.metals > 0);
    assert('Спавн: у каждого корабля тип, HP и сила', ok);
    rolled.ships.forEach((s) => { seenShipTypes[s.type] = true; });
  }
  assert('Спавн: встречается больше одного типа корабля', Object.keys(seenShipTypes).length > 1, Object.keys(seenShipTypes).join(','));
}

function testSpawnInvasionDifficulty() {
  const g = createGame();
  const S = prepareGame(g);
  let got = { 1: 0, 2: 0, 3: 0 };

  for (let i = 0; i < 60; i++) {
    S.invasions = [];
    g.spawnInvasion();
    const inv = S.invasions[0];
    if (!inv) continue;
    got[inv.difficulty] = (got[inv.difficulty] || 0) + 1;
    seenDifficulties[inv.difficulty] = true;
    assert('Спавн: shipsTotal совпадает с числом кораблей', inv.shipsTotal === inv.ships.length);
    assert('Спавн: у вторжения есть сложность 1..3', inv.difficulty >= 1 && inv.difficulty <= 3);
  }
  assert('Спавн: встретились разные сложности', Object.keys(seenDifficulties).length > 1, JSON.stringify(got));
}

function testManualKillReward() {
  const g = createGame();
  const S = prepareGame(g);

  S.invasions = [];
  g.spawnInvasion();
  const inv = S.invasions[0];
  assert('Ручное уничтожение: вторжение создано', !!inv);
  const ship = inv.ships[0];
  const before = { metals: S.metalAmount, dust: S.dust, energy: S.energy, civ: S.civLevel };
  const reward = g.grantManualKillReward(inv, ship);
  assert('Ручное уничтожение: награда положительная', reward.metals > 0 || reward.dust > 0 || reward.energy > 0);
  assert('Ручное уничтожение: металл начислен', S.metalAmount > before.metals);
  assert('Ручное уничтожение: пыль начислена', S.dust > before.dust);
  assert('Ручное уничтожение: счётчик убийств вырос', inv.shipsKilledByPlayer === 1);
  assert('Ручное уничтожение: урон клика > 0', g.invasionClickDamage() > 0);
}

function testManualKillNotifiesEnd() {
  const g = createGame();
  const S = prepareGame(g);
  S.fleet = { interceptor: 0, cruiser: 0, dreadnought: 0 };
  S.invasions = [];
  g.spawnInvasion();
  const inv = S.invasions[0];
  // Сбиваем все корабли вручную и прокручиваем тик: вторжение должно уйти с итоговым пушем.
  inv.ships.forEach((s) => { s.destroyed = true; });
  g.tickInvasions(0.1);
  assert('Ручной бой: вторжение снято после уничтожения всех кораблей', S.invasions.length === 0);
}

function testRichNotifications() {
  const g = createGame();
  const S = prepareGame(g);
  g.__sent.length = 0;

  S.invasions = [];
  g.spawnInvasion();
  const inv = S.invasions[0];
  const startMsg = g.__sent.map((m) => m.message).join('\n');
  assert('Уведомление: старт вторжения ушло', g.__sent.length > 0);
  assert('Уведомление: указана сложность', startMsg.includes('Сложность'));
  assert('Уведомление: указан состав кораблей', startMsg.includes('Корабли'));
  assert('Уведомление: указана прочность', startMsg.includes('прочность'));

  g.__sent.length = 0;
  inv.stolen = 5000;
  inv.drainedEnergy = 1000;
  inv.debuffPct = 0.2;
  inv.debuffHours = 3;
  inv.disabledPlanets = 2;
  inv.bountyMetals = 300;
  g.notifyInvasionEnd(inv, 'defeated');
  const endMsg = g.__sent.map((m) => m.message).join('\n');
  assert('Уведомление: итог вторжения ушло', g.__sent.length > 0);
  assert('Уведомление: указаны потери ресурсов', endMsg.includes('Потеряно ресурсов'));
  assert('Уведомление: указан дебаф', endMsg.includes('Штраф к доходу'));
  assert('Уведомление: указаны трофеи', endMsg.includes('Трофеи'));
}

function testFleetAlwaysOn() {
  const g = createGame();
  const S = prepareGame(g);
  S.fleet = { interceptor: 2, cruiser: 0, dreadnought: 0 };
  S.fleetActive = false;
  assert('Флот: активен без активации', g.isFleetActive() === true);
  assert('Флот: готов без Автобороны', g.fleetDefenseReady() === true);
}

(function run() {
  console.log('========================================');
  console.log('🧪 ТЕСТЫ ВТОРЖЕНИЙ И УВЕДОМЛЕНИЙ');
  console.log('========================================');
  try {
    testTierConfig();
    testRandomShips();
    testSpawnInvasionDifficulty();
    testManualKillReward();
    testManualKillNotifiesEnd();
    testRichNotifications();
    testFleetAlwaysOn();
  } catch (e) {
    console.error('❌ Исключение в тестах: ' + (e && e.stack || e));
    failed++;
  }
  console.log('========================================');
  console.log(`ИТОГО: Пройдено ${passed}, Провалено ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
})();
