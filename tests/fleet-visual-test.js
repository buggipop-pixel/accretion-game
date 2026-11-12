// ═══════════════════════════════════════════════════════════════
//  FLEET VISUAL / ECONOMY TEST
//  Проверяем: перелёт флагмана, бой только по прибытии, возврат,
//  цены кораблей (⚙/⚡/🧬), кражу всех 4 ресурсов и 10 ч обороны.
//  Запуск: node tests/fleet-visual-test.js
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

function makeCtx() {
  return {
    canvas: { width: 800, height: 600 },
    globalAlpha: 1, globalCompositeOperation: 'source-over',
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '',
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createLinearGradient: () => ({ addColorStop: noop }),
    putImageData: noop, drawImage: noop, fillRect: noop, clearRect: noop, strokeRect: noop,
    beginPath: noop, closePath: noop, arc: noop, ellipse: noop, fill: noop, stroke: noop,
    moveTo: noop, lineTo: noop, quadraticCurveTo: noop, bezierCurveTo: noop, save: noop, restore: noop, translate: noop, rotate: noop,
    scale: noop, setTransform: noop, fillText: noop, strokeText: noop,
    measureText: () => ({ width: 20 }), setLineDash: noop,
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
  const modalCard = makeElement();
  const documentMock = {
    getElementById: (id) => (id === 'modalCard' ? modalCard : makeElement()),
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
    toast: noop, updateUI: noop, playSFX: noop, addEvent: noop, saveGame: noop,
    fmt: (n) => String(n),
    W: 800, H: 600, cx: 400, cy: 300,
    worldToScreen: (x, y) => ({ x: 400 + x, y: 300 + y * 0.5 }),
    getPlanetWorldPos: (p) => ({ x: p.orbitR || 100, y: 0 }),
    galaxySystemPos: (i) => ({ x: 200 + i * 60, y: 200 }),
    setTimeout, clearTimeout, Date, Math, JSON, Set, Array, Object, Number, String,
  });
  vm.createContext(context);

  ['config.js', 'state.js', 'economy.js', 'planets.js', 'prime.js', 'invasions.js', 'fleet.js', 'ui.js', 'premium.js'].forEach((f) => {
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

function planet(type, seed) {
  return {
    type: type || 'superEarth', baseOrbitR: 100, orbitR: 100, mass: 1, diameter: 1,
    forming: false, seed: seed || 1, civLevel: 0, angle: 0, speed: 0.1,
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
  S.planets = [planet('superEarth', 1), planet('lava', 2), planet('iceGiant', 3)];
  S.dust = 1e9; S.energy = 1e9; S.civLevel = 1e9; S.metalAmount = 1e9;
  S.dustTotal = 1e9;
  S.invasionDebuff = { pct: 0, until: 0 };
  S.invasionWaveApplied = null;
  S.fleet = { interceptor: 0, cruiser: 0, dreadnought: 0 };
  S.fleetActive = false;
  S.invasions = [];
  S.lastInvasionCheck = Date.now();
  S.metalCap = 1e9;
  return S;
}

function setDefense(S, lvl, expired) {
  S.nightDefenseLevel = lvl;
  S.nightDefenseExpiresAt = Date.now() + (expired ? -1000 : 3600 * 1000);
  S.nightConfig.defenseEnabled = true;
}

function makeInvasion(g, count) {
  const now = Date.now();
  const ships = g.makeShips(count);
  return {
    id: 'inv-' + Math.random().toString(36).slice(2),
    tierKey: 'raid', targetType: 'system', systemIdx: 0,
    ships, spawnedAt: now,
    robberyEndsAt: now + 45 * 60 * 1000,
    destructionEndsAt: now + 60 * 60 * 1000,
    hp: 200, maxHp: 200, stolen: 0, drainedEnergy: 0, drainedCiv: 0,
    defenseBroken: false, notified: false,
  };
}

function testFleetTravelAndCombat() {
  const g = createGame();
  const S = prepare(g);
  setDefense(S, 5);
  S.fleet = { interceptor: 10, cruiser: 0, dreadnought: 0 };
  S.fleetActive = true;
  S.invasions = [makeInvasion(g, 3)];
  // Детерминированный бой: случайная сила эскадры не должна делать тест флаки.
  for (const sh of S.invasions[0].ships) { sh.hp = 50; sh.maxHp = 50; }

  const t = 1;
  g.tickFleet(1, t);
  assert('Флот: получил цель и начал перелёт', g.FLEET_VIS.phase === 'travel' && g.FLEET_VIS.targetId === S.invasions[0].id);
  assert('Флот: до прибытия не воюет', g.fleetEngaged(S.invasions[0]) === false);

  const shipsBefore = S.invasions[0].ships.filter((s) => !s.destroyed).length;
  g.tickInvasions(5);
  const shipsAfter = S.invasions[0].ships.filter((s) => !s.destroyed).length;
  assert('Флот: во время перелёта корабли врага целы', shipsAfter === shipsBefore);

  // Принудительно завершаем перелёт
  g.FLEET_VIS.startedAt = Date.now() - g.FLEET_VIS.durationMs - 10;
  g.tickFleet(1, t + 6);
  assert('Флот: по прибытии переходит в бой', g.FLEET_VIS.phase === 'fight' && g.fleetEngaged(S.invasions[0]) === true);

  g.tickInvasions(10);
  assert('Флот: в бою уничтожает эскадру', S.invasions.length === 0);

  g.tickFleet(1, t + 20);
  assert('Флот: после победы возвращается домой', g.FLEET_VIS.phase === 'return');

  g.FLEET_VIS.startedAt = Date.now() - g.FLEET_VIS.durationMs - 10;
  g.tickFleet(1, t + 40);
  assert('Флот: вернулся в патруль', g.FLEET_VIS.phase === 'idle');

  const ctx = makeCtx();
  g.drawFleet(ctx, t + 45);
  assert('Отрисовка флота: drawFleet не падает', true);
}

function testFleetDeactivatesWithDefense() {
  const g = createGame();
  const S = prepare(g);
  setDefense(S, 5, true); // истекла
  S.fleetActive = true;
  S.fleet = { interceptor: 5, cruiser: 0, dreadnought: 0 };
  g.tickFleet(1, 1);
  assert('Флот: при истёкшей обороне не летит и не воюет', g.FLEET_VIS.phase === 'idle');
}

function testShipCosts() {
  const g = createGame();
  const S = prepare(g);
  S.metalAmount = 10000; S.energy = 10000; S.civLevel = 100;

  g.buyShip('interceptor', 1);
  assert('Верфь: перехватчик стоит металлы', S.metalAmount === 9500);
  assert('Верфь: перехватчик стоит энергию', S.energy === 9000);
  assert('Верфь: перехватчик стоит цив', S.civLevel === 95);
  assert('Верфь: корабль куплен', g.shipCount ? g.shipCount('interceptor') : S.fleet.interceptor === 1);

  S.civLevel = 0;
  g.buyShip('interceptor', 1);
  assert('Верфь: без цив покупка блокируется', S.fleet.interceptor === 1 && S.metalAmount === 9500);
}

function testAllResourceTheft() {
  const g = createGame();
  const S = prepare(g);
  const inv = makeInvasion(g, 1);
  const tier = g.INVASION_CFG.tiers.scout;

  const before = { dust: S.dust, energy: S.energy, civ: S.civLevel, metals: S.metalAmount };
  g.applyLiveRobbery(inv, tier, 2700, 1);

  assert('Живой грабёж: крадёт пыль', S.dust < before.dust && inv.stolen > 0);
  assert('Живой грабёж: крадёт энергию', S.energy < before.energy && inv.drainedEnergy > 0);
  assert('Живой грабёж: крадёт цив', S.civLevel < before.civ && inv.drainedCiv > 0);
  assert('Живой грабёж: крадёт металлы', S.metalAmount < before.metals && inv.stolenMetals > 0);

  // Офлайн-удар тоже тянет все четыре.
  prepare(g);
  const caps = { dust: 1e9, energy: 1e9, civ: 1e9, metals: 1e9 };
  const hit = g.applyInvasionHit('scout', caps);
  assert('Офлайн-удар: крадёт все 4 ресурса', hit.dust > 0 && hit.energy > 0 && hit.civ > 0 && hit.metals > 0);
}

function testDefenseTenHours() {
  const g = createGame();
  assert('Конфиг: активная оборона 10 ч', g.INVASION_CFG.defenseHours === 10);
}

function testIncomeDebuffCap() {
  const g = createGame();
  prepare(g);
  const caps = { dust: 1e9, energy: 1e9, civ: 1e9, metals: 1e9 };
  for (let i = 0; i < 10; i++) g.applyInvasionHit('siege', caps);
  assert('Штраф к доходу: кап 80%', g.S.invasionDebuff.pct <= 0.8000001 && g.S.invasionDebuff.pct > 0.7);
}

function testDefenseCostDeferred() {
  const g = createGame();
  const S = prepare(g);
  S.metalAmount = 10000;
  // ★ Реалистичный цив: в prepare() стоит 1e9, а он даёт бонус к металлам
  //   (1 + floor(civ/1000)*0.1) и раздувает цену обороны через динамику.
  S.civLevel = 50;
  S.systems = 1;
  S.nightDefenseLevel = 0;
  S.nightDefenseExpiresAt = 0;

  g.openNightMode();
  const card = g.document.getElementById('modalCard');
  assert('Окно: кнопка флота вместо ВКЛ', card.innerHTML.includes("toggleFleet('night')") && card.innerHTML.includes('Флот на службе постоянно') && !card.innerHTML.includes('✓ ВКЛ'));
  const opens = (card.innerHTML.match(/<div/g) || []).length;
  const closes = (card.innerHTML.match(/<\/div>/g) || []).length;
  assert('Окно: HTML div сбалансирован', opens === closes);
  assert('Окно: переименовано в «Активную оборону»', card.innerHTML.includes('Активная оборона') && !card.innerHTML.includes('Ночной режим'));
  g.selectDefenseLevel(3);
  assert('Выбор уровня НЕ списывает металл', S.metalAmount === 10000);
  assert('Выбор уровня показывает «к активации»', g.document.getElementById('modalCard').innerHTML.includes('к активации'));

  g.saveNightConfig();
  const cost = (typeof g.defenseActivationCost === 'function')
    ? g.defenseActivationCost(3)
    : Math.floor(g.INVASION_CFG.defenseCost[3]);
  assert('«Готово» списывает металл', S.metalAmount === 10000 - cost);
  assert('«Готово» применяет уровень', S.nightDefenseLevel === 3);
  const hours = g.INVASION_CFG.defenseHours;
  assert('Активация на 10 ч', S.nightDefenseExpiresAt > Date.now() + (hours * 3600 * 1000 - 5000));
}

// Регресс: «Готово» молча не срабатывало при 100% экспедиции — она съедала
// весь металл, и проверка суммы не могла оплатить уже выбранную оборону.
function testInsaneNightComboAffordable() {
  const g = createGame();
  const S = prepare(g);
  S.metalAmount = 26e6;
  S.energy = 500000;
  S.civLevel = 500;
  S.dust = 1e9;
  S.nightConfig = { mode: 'insane', defenseEnabled: true, cometHours: 8, expeditionPercent: 100 };
  g.openNightMode();
  g.selectDefenseLevel(5);
  g.saveNightConfig();
  assert('Комбо 100%: «Готово» активирует оборону', S.nightDefenseLevel === 5);
  assert('Комбо 100%: настройки сохранены', S.nightConfig.cometHours === 8 && S.nightConfig.expeditionPercent === 100);
  assert('Комбо 100%: металл не ушёл в минус', S.metalAmount === 0);

  const g2 = createGame();
  const S2 = prepare(g2);
  S2.metalAmount = 100000;
  S2.energy = 10000;
  S2.civLevel = 100;
  S2.nightConfig = { mode: 'aggressive', defenseEnabled: true, cometHours: 3, expeditionPercent: 30 };
  g2.openNightMode();
  g2.selectDefenseLevel(2);
  const def2 = g2.defenseActivationCost(2);
  g2.saveNightConfig();
  const exp2 = Math.floor((100000 - def2 - 300) * 0.3);
  assert('Экспедиция 30%: цена от остатка после обороны и кометы', 100000 - S2.metalAmount === def2 + 300 + exp2);
}
function testDefenseSurvivesReturn() {
  const g = createGame();
  const S = prepare(g);
  setDefense(S, 5);
  const until = S.nightDefenseExpiresAt;
  S.lastTick = Date.now() - 4 * 3600 * 1000;
  g.applyOfflineProgress();
  assert('Оборона не обнуляется при возврате игрока', S.nightDefenseExpiresAt === until);
}

function testFleetShotVisuals() {
  const g = createGame();
  const S = prepare(g);
  setDefense(S, 5);
  S.fleet = { interceptor: 1, cruiser: 0, dreadnought: 0 };
  S.fleetActive = true;
  S.invasions = [makeInvasion(g, 3)];
  g.FLEET_VIS.phase = 'fight';
  g.FLEET_VIS.targetId = S.invasions[0].id;

  const inv = S.invasions[0];
  g.tickInvasions(0.1);
  assert('Бой: флот оставляет трассеры выстрелов', Array.isArray(inv.fleetShots) && inv.fleetShots.length > 0);
  assert('Бой: выстрелы нацелены на вражеский корабль', inv.fleetShots.every(function (sh) { return sh.targetIdx >= 0 && sh.targetIdx < inv.ships.length; }));

  const ctx = makeCtx();
  g.drawInvasions(ctx, 1);
  assert('Отрисовка: лазеры флота не падают', true);

  inv.fleetShots = [{ startAt: Date.now() - 5000, targetIdx: 0 }];
  g.tickInvasions(0.001);
  assert('Бой: устаревшие трассеры чистятся', inv.fleetShots.length === 0);
}

(function run() {
  console.log('========================================');
  console.log('🧪 ТЕСТЫ ФЛОТА: ВИЗУАЛ, ЦЕНЫ, КРАЖА');
  console.log('========================================');
  try {
    testFleetTravelAndCombat();
    testFleetShotVisuals();
    testFleetDeactivatesWithDefense();
    testShipCosts();
    testAllResourceTheft();
    testDefenseTenHours();
    testIncomeDebuffCap();
    testDefenseCostDeferred();
    testInsaneNightComboAffordable();
    testDefenseSurvivesReturn();
  } catch (e) {
    console.error('❌ Исключение в тестах: ' + (e && e.stack || e));
    failed++;
  }
  console.log('========================================');
  console.log(`ИТОГО: Пройдено ${passed}, Провалено ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
})();
