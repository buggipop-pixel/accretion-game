// ═══════════════════════════════════════════════════════════════
//  DEFENSE LEVELS TEST — уровни Автобороны 1–5 реально работают.
//  Проверяем эффективный уровень, бонус к отбитию, снижение урона
//  и слива ресурсов, а также отсутствие ReferenceError в офлайне.
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
  S.planets = [{
    type: 'superEarth', baseOrbitR: 100, orbitR: 100, mass: 1, diameter: 1,
    forming: false, seed: 1, civLevel: 0,
  }];
  S.dust = 1e9; S.energy = 1e9; S.civLevel = 1e9;
  S.dustTotal = 1e9;
  S.invasionDebuff = { pct: 0, until: 0 };
  S.invasionWaveApplied = null;
  return S;
}

function setDefense(S, lvl, opts) {
  opts = opts || {};
  S.nightDefenseLevel = lvl;
  S.nightDefenseExpiresAt = Date.now() + (opts.expired ? -1000 : 3600 * 1000);
  S.nightConfig.defenseEnabled = opts.enabled !== false;
}

function testFreshState() {
  const g = createGame();
  const S = prepare(g);
  assert('Свежий сейв: эффективный уровень 0', g.activeDefenseLevel() === 0);
  assert('Свежий сейв: бонус отбития 0', g.calcDefenseBonus() === 0);
  assert('Свежий сейв: урон без обороны не снижен', g.invasionDefK() === 1);
}

function testLevelsActuallyWork() {
  const g = createGame();
  const S = prepare(g);

  for (let lvl = 1; lvl <= 5; lvl++) {
    setDefense(S, lvl);
    assert('Ур.' + lvl + ': эффективный уровень совпадает', g.activeDefenseLevel() === lvl);
  }

  setDefense(S, 1);
  assert('Ур.1: урон снижен на 20%', close(g.invasionDefK(), 0.8));
  setDefense(S, 3);
  assert('Ур.3: урон снижен на 60%', close(g.invasionDefK(), 0.4));
  setDefense(S, 5);
  assert('Ур.5: полный иммунитет к урону', g.invasionDefK() === 0);

  setDefense(S, 1);
  assert('Ур.1: слив ⚡/🧬 снижен на 5%', close(g.defenseDrainReduction(), 0.05));
  setDefense(S, 2);
  assert('Ур.2: слив снижен на 10%', close(g.defenseDrainReduction(), 0.10));
  setDefense(S, 5);
  assert('Ур.5: слив снижен на 25% (кап)', close(g.defenseDrainReduction(), 0.25));

  setDefense(S, 1);
  assert('Ур.1: бонус к отбитию +6.0 п.п.', close(g.calcDefenseBonus(), 0.06));
  setDefense(S, 5);
  assert('Ур.5: бонус к отбитию +21.7 п.п.', close(g.calcDefenseBonus(), 0.2174, 0.001));
}

function testInactiveDefense() {
  const g = createGame();
  const S = prepare(g);

  setDefense(S, 5, { expired: true });
  assert('Истекла: бонусы пропадают', g.activeDefenseLevel() === 0 && g.calcDefenseBonus() === 0);

  setDefense(S, 5, { enabled: false });
  assert('Тумблер ВЫКЛ: бонусы пропадают', g.activeDefenseLevel() === 0);

  // Регресс: старые сейвы/код могли писать S.defenseLevel — он не должен влиять.
  prepare(g);
  S.defenseLevel = 5;
  assert('Чужое поле S.defenseLevel игнорируется', g.activeDefenseLevel() === 0);
}

function testTrophyLevels() {
  const g = createGame();
  const S = prepare(g);

  // Трофей даёт уровень 5 без платной активации на 24 ч.
  S.activeTrophyEffects = [{ type: 'defense_level', value: 5, expiresAt: Date.now() + 3600 * 1000 }];
  assert('Трофей ур.5: считается эффективным уровнем', g.activeDefenseLevel() === 5);
  assert('Трофей ур.5: открывает активацию флота', g.fleetDefenseReady() === true);
  assert('Трофей ур.5: даёт иммунитет к урону', g.invasionDefK() === 0);

  S.nightConfig.defenseEnabled = false;
  assert('Трофей при выключенной Автобороне не работает', g.activeDefenseLevel() === 0);

  prepare(g);
  S.activeTrophyEffects = [{ type: 'defense_level', value: 5, expiresAt: Date.now() - 1000 }];
  assert('Просроченный трофей не работает', g.activeDefenseLevel() === 0);
}

function testExpeditionPenalty() {
  const g = createGame();
  const S = prepare(g);
  setDefense(S, 5);
  S.nightConfig.expeditionPercent = 30;
  assert('Экспедиция 30%: штраф 9%', close(g.calcExpeditionPenalty(), 0.09));
  S.nightConfig.expeditionPercent = 100;
  assert('Экспедиция 100%: штраф 30%', close(g.calcExpeditionPenalty(), 0.30));
  S.nightConfig.expeditionPercent = 0;
  assert('Экспедиция 0%: штрафа нет', g.calcExpeditionPenalty() === 0);
}

function makeOut() {
  return {
    seconds: 4 * 3600, dustEarned: 0, energyEarned: 0, civEarned: 0,
    cometEarned: 0, expEarned: 0, nightEnded: false,
    invasionAttacks: 0, invasionDefended: 0, invasionLost: 0,
    invasionDrainE: 0, invasionDrainC: 0, invasionLostDust: 0, shieldProtected: false,
  };
}

function testOfflineNoCrashAndImmunity() {
  const g = createGame();
  const S = prepare(g);
  setDefense(S, 5);

  const out = makeOut();
  let crashed = false;
  try {
    g.simulateOfflineInvasions(4 * 3600, out);
  } catch (e) {
    crashed = true;
  }
  assert('Офлайн: simulateOfflineInvasions не падает с ReferenceError', crashed === false);
  assert('Офлайн: атаки посчитаны', out.invasionAttacks >= 1);
  assert('Офлайн: ур.5 не теряет пыль', out.invasionLostDust === 0);

  // Без обороны не должно быть исключения и урон может проходить.
  prepare(g);
  S.nightConfig.defenseEnabled = false;
  const out2 = makeOut();
  let crashed2 = false;
  try {
    g.simulateOfflineInvasions(4 * 3600, out2);
  } catch (e) {
    crashed2 = true;
  }
  assert('Офлайн: без обороны тоже без исключений', crashed2 === false);
}

(function run() {
  console.log('========================================');
  console.log('🧪 ТЕСТЫ УРОВНЕЙ АВТООБОРОНЫ');
  console.log('========================================');
  try {
    testFreshState();
    testLevelsActuallyWork();
    testInactiveDefense();
    testTrophyLevels();
    testExpeditionPenalty();
    testOfflineNoCrashAndImmunity();
  } catch (e) {
    console.error('❌ Исключение в тестах: ' + (e && e.stack || e));
    failed++;
  }
  console.log('========================================');
  console.log(`ИТОГО: Пройдено ${passed}, Провалено ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
})();
