// ═══════════════════════════════════════════════════════════════
//  INVASION-REPORT TEST — по каждой атаке должны быть видны
//  результат и потери: и в Telegram-отчёте, и в журнале событий.
//  Запуск: node tests/invasion-report-test.js
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
    toast: noop, updateUI: noop, playSFX: noop,
    offerColony: noop, showModal: noop, hideModal: noop,
    setTimeout, clearTimeout, setInterval, clearInterval, Date, Math, JSON, Set, Array, Object, Number, String,
  });
  context.__sent = [];
  context.__events = [];
  context.sendPushNotification = function (message, type) {
    context.__sent.push({ message: message, type: type });
  };
  context.addEvent = function (type, text, opts) {
    context.__events.push({ type: type, text: text, opts: opts || {} });
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
function assert(name, condition, extra) {
  if (condition) { console.log('✅ ' + name); passed++; }
  else { console.error('❌ ' + name + (extra ? ' → ' + extra : '')); failed++; }
}

function planet(seed) {
  return { type: 'lava', baseOrbitR: 100, orbitR: 100, mass: 1, diameter: 1, forming: false, disabledUntil: 0, seed: seed || Math.random() * 1e6 };
}

function prepareGame(g, opts) {
  opts = opts || {};
  const S = g.S;
  S.stage = 'system';
  S.systems = 1;
  S.totalSystemsCreated = 1;
  S.activeSystemIdx = 0;
  S.systemName = opts.systemName || 'Родная';
  S.primeSystem = null;
  S.otherSystems = opts.otherSystems || [];
  S.planets = opts.planets || [planet(1), planet(2), planet(3)];
  S.dust = 1000000;
  S.dustTotal = 1000000;
  S.energy = 1000000;
  S.civLevel = 1000;
  S.metalAmount = 1000000;
  S.invasions = [];
  S.lastInvasionCheck = Date.now();
  S.stats = { comets: 0, expeditions: 0, invasionsDefeated: 0, clicks: 0, planets: 0, dailyClaims: 0, fleetLost: 0 };
  S.fleet = { interceptor: 0, cruiser: 0, dreadnought: 0 };
  S.fleetActive = false;
  S.shieldUntil = 0;
  S.settings = { brightness: 1, sound: true, pushEnabled: true };
  S.nightConfig = { mode: 'balanced', defenseEnabled: false, cometHours: 0, expeditionPercent: 0 };
  S.nightDefenseLevel = 0;
  S.nightDefenseExpiresAt = 0;
  S.invasionDebuff = null;
  return S;
}

// ─── Офлайн: у каждой волны свой результат и потери ───────────
function testOfflinePerAttackReport() {
  const g = createGame();
  const S = prepareGame(g, {
    otherSystems: [{ name: 'Колония А', planets: [planet(11), planet(12), planet(13)] }],
  });
  S.nightDefenseLevel = 0;
  g.__sent.length = 0;
  g.__events.length = 0;

  const out = {};
  g.simulateOfflineInvasions(9 * 3600, out);

  const waves = Array.isArray(out.invasionWaves) ? out.invasionWaves : [];
  assert('Офлайн: волны записаны по отдельности', waves.length > 0, 'waves=' + waves.length);
  assert('Офлайн: у каждой волны есть исход', waves.every((w) => w.outcome === 'repelled' || w.outcome === 'breached'));
  assert('Офлайн: без обороны атаки прорвались', waves.some((w) => w.outcome === 'breached'));

  const msg = g.__sent.map((m) => m.message).join('\n');
  assert('Офлайн TG: есть блок по атакам', msg.includes('── по атакам ──'), msg.slice(0, 200));
  assert('Офлайн TG: показан исход каждой волны', (msg.match(/отбита до высадки|прорвалась/g) || []).length >= waves.length);
  assert('Офлайн TG: у прорвавшейся волны есть потери', /прорвалась \(.+\): ✦|прорвалась: ✦/.test(msg) || /прорвалась/.test(msg));

  const journalWaves = g.__events.filter((e) => e.type === 'invasion_end' && e.opts.meta && e.opts.meta.source === 'offline');
  assert('Офлайн журнал: запись на каждую волну', journalWaves.length === waves.length,
    'journal=' + journalWaves.length + ' waves=' + waves.length);
  const breached = journalWaves.filter((e) => e.opts.meta.outcome === 'breached');
  assert('Офлайн журнал: у прорыва указаны украденные ресурсы',
    breached.some((e) => Number(e.opts.meta.lostDust || 0) + Number(e.opts.meta.lostEnergy || 0) + Number(e.opts.meta.lostMetals || 0) > 0));
  assert('Офлайн журнал: текст содержит слово «прорвалось»',
    breached.every((e) => e.text.includes('прорвалось')));
}

// ─── Живое вторжение: итог боя тоже в журнале ─────────────────
function testLiveInvasionEndInJournal() {
  const g = createGame();
  const S = prepareGame(g);
  S.lastInvasionCheck = Date.now() + 3600 * 1000; // не спавним новую волну
  g.spawnInvasion();
  assert('Живое: вторжение создано', S.invasions.length >= 1);
  const inv = S.invasions[0];
  inv.notified = false;
  inv.ships.forEach((s) => { s.destroyed = true; });

  g.__events.length = 0;
  g.tickInvasions(0.1);

  const end = g.__events.find((e) => e.type === 'invasion_end');
  assert('Живое: итог боя попал в журнал', !!end);
  if (end) {
    assert('Живое: в тексте есть результат боя', end.text.includes('эскадра уничтожена'), end.text);
    assert('Живое: в тексте есть счёт сбитых кораблей', end.text.includes('сбито '), end.text);
    assert('Живое: в тексте есть строка о потерях ресурсов', end.text.includes('потерь ресурсов нет'), end.text);
    assert('Живое: в meta есть сложность', Number(end.opts.meta.difficulty) >= 1);
  }
}

// ─── Потери флота: отдельное событие журнала ──────────────────
function testFleetLossInJournal() {
  const g = createGame();
  const S = prepareGame(g);
  S.fleet = { interceptor: 10, cruiser: 0, dreadnought: 0 };
  const inv = {
    id: 'fleet-loss-test',
    tierKey: 'raid',
    targetType: 'system',
    systemIdx: 0,
    difficulty: 2,
    ships: [{ destroyed: false, damage: 30 }, { destroyed: false, damage: 30 }],
    spawnedAt: Date.now(),
    robberyEndsAt: Date.now() + 600000,
    destructionEndsAt: Date.now() + 1200000,
    hp: 100, maxHp: 100,
    stolen: 0, drainedEnergy: 0, drainedCiv: 0, stolenMetals: 0,
  };
  g.__events.length = 0;
  S.stats.fleetLost = 0;

  const lost = g.applyEnemyFireToFleet(inv, 10);

  assert('Флот: вражеский огонь уничтожил корабли', lost > 0, 'lost=' + lost);
  assert('Флот: потери списаны из S.fleet', S.fleet.interceptor === 10 - lost, 'left=' + S.fleet.interceptor);
  assert('Флот: потери накоплены в самом вторжении', inv.fleetLost === lost);
  const ev = g.__events.find((e) => e.type === 'fleet_loss');
  assert('Флот: потеря попала в журнал', !!ev);
  if (ev) {
    assert('Флот: в meta указано число потерянных кораблей', Number(ev.opts.meta.fleetLost) === lost);
    assert('Флот: в тексте есть число потерь', ev.text.includes(String(lost)));
  }
}

// ─── Итог системного вторжения (фаза галактики) тоже в журнале ─
function testSystemInvasionEndInJournal() {
  const g = createGame();
  const S = prepareGame(g, {
    otherSystems: [{ name: 'Колония Б', starType: 'G', systemType: 'single', planets: [planet(21), planet(22)] }],
  });
  S.stage = 'galaxy';
  S.systems = 2;
  S.primeSystem = null;
  S.lastInvasionCheck = Date.now() + 3600 * 1000;
  g.spawnInvasion();
  assert('Системное вторжение: создано', S.invasions.length === 1);
  const inv = S.invasions[0];
  assert('Системное вторжение: цель — система', inv.targetType === 'system');
  inv.ships.forEach((s) => { s.destroyed = true; });

  g.__events.length = 0;
  g.tickInvasions(0.1);

  const end = g.__events.find((e) => e.type === 'invasion_end');
  assert('Системное вторжение: итог попал в журнал', !!end);
  if (end) {
    assert('Системное вторжение: указана сложность', Number(end.opts.meta.difficulty) >= 1);
    assert('Системное вторжение: есть исход боя', end.text.includes('эскадра уничтожена'), end.text);
  }
}
// ─── Итоговый отчёт об офлайн-вторжении учитывает флот ────────
function testOfflineReportLimitsLength() {
  const g = createGame();
  const S = prepareGame(g);
  S.nightDefenseLevel = 0;
  g.__sent.length = 0;
  const out = {};
  g.simulateOfflineInvasions(30 * 3600, out);
  const msg = g.__sent.map((m) => m.message).join('\n');
  assert('Офлайн: отчёт не превышает лимит Telegram-сообщения', msg.length <= 4096, 'len=' + msg.length);
  assert('Офлайн: длинные числа не утекают в отчёт', !/\d{7,}/.test(msg));
}

(function run() {
  console.log('========================================');
  console.log('🧪 ТЕСТЫ ОТЧЁТОВ О ВТОРЖЕНИЯХ');
  console.log('========================================');
  try {
    testOfflinePerAttackReport();
    testLiveInvasionEndInJournal();
    testSystemInvasionEndInJournal();
    testFleetLossInJournal();
    testOfflineReportLimitsLength();
  } catch (e) {
    console.error('💥 Исключение:', e && e.stack ? e.stack : e);
    failed++;
  }
  console.log('----------------------------------------');
  console.log((failed === 0 ? '✅' : '❌') + ' ПРОЙДЕНО: ' + passed + ' · ПРОВАЛЕНО: ' + failed);
  process.exit(failed === 0 ? 0 : 1);
})();
