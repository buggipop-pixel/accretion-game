// ═══════════════════════════════════════════════════════════════
//  SYSTEM CURVE — сколько времени копится на следующую систему
//  Запуск:  node tools/system-curve.cjs [экспонента]
//  Пример:  node tools/system-curve.cjs 1.3
//  Без аргумента берёт CFG.systemCostExp из js/config.js.
//  Считает на «средней» империи: 8 планет в каждой системе, звёзды
//  по STAR_WEIGHTS, типы систем по их шансам, без прайм-бонусов.
// ═══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const noop = () => {};

function makeContext() {
  const el = () => ({
    style: {}, dataset: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    innerHTML: '', textContent: '', appendChild: noop, removeChild: noop,
    addEventListener: noop, removeEventListener: noop,
    querySelector: () => el(), querySelectorAll: () => [],
    getContext: () => null,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
    getAttribute: () => null, setAttribute: noop,
  });
  const storage = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop };
  const ctx = {
    console: { log: noop, warn: noop, error: noop },
    document: { getElementById: () => el(), querySelector: () => el(), querySelectorAll: () => [], createElement: () => el(), addEventListener: noop, body: el(), visibilityState: 'visible' },
    localStorage: storage, sessionStorage: storage,
    performance: { now: () => Date.now() }, navigator: { userAgent: 'node' },
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    requestAnimationFrame: () => 0, cancelAnimationFrame: noop,
    addEventListener: noop, removeEventListener: noop,
    alert: noop, confirm: () => false, prompt: () => '',
    fetch: () => Promise.reject(new Error('offline')),
    Audio: function () { return { play: noop, pause: noop }; },
    Image: function () { return el(); },
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['config.js', 'state.js', 'economy.js', 'shop.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
  }
  vm.runInContext(
    'function updateUI(){} function saveGame(){} function eventMult(){return 1;} ' +
    'globalThis.__x = { ORBIT_PLANET_MATRIX, PLANET_TYPES, STAR_WEIGHTS, CFG, getS: () => S };',
    ctx
  );
  return ctx;
}

const vmCtx = makeContext();
const X = vmCtx.__x;
const S = X.getS();

function planetList(starType, count) {
  const matrix = X.ORBIT_PLANET_MATRIX[starType] || X.ORBIT_PLANET_MATRIX.G;
  const out = [];
  for (let i = 0; i < count && i < matrix.length; i++) {
    const opts = matrix[i];
    out.push({
      type: opts[Math.floor(Math.random() * opts.length)],
      mass: 1,
      orbitR: 170 * Math.pow(1.22, i),
      baseOrbitR: 170 * Math.pow(1.22, i),
      forming: false,
    });
  }
  return out;
}

function rollStar() {
  const w = X.STAR_WEIGHTS;
  let r = Math.random() * 100, acc = 0;
  for (const k of ['M', 'K', 'G', 'A', 'B']) { acc += w[k] || 0; if (r < acc) return k; }
  return 'G';
}
function rollSystemType() {
  const r = Math.random();
  return r < 0.50 ? 'single' : r < 0.88 ? 'binary' : 'trinary';
}

function buildEmpire(systems, planetsPerSystem, galaxyMult) {
  S.stage = 'galaxy';
  S.systems = systems;
  S.activeSystemIdx = 0;
  S.otherSystems = [];
  S.planets = planetList(rollStar(), planetsPerSystem);
  S.starType = rollStar();
  S.systemType = rollSystemType();
  S.primeSystem = null;
  S.systemIncomeBonus = 0;
  S.galaxyMultiplier = galaxyMult || 1;
  S.techLevels = { astro: 0, quantum: 0, cyber: 0, eng: 0 };
  S.civLevel = 10;
  S.systemCostFloor = Math.max(0, systems - 1);
  for (let i = 1; i < systems; i++) {
    const star = rollStar();
    S.otherSystems.push({
      starType: star,
      systemType: rollSystemType(),
      planets: planetList(star, planetsPerSystem),
      incomeBonus: 0,
      primeData: null,
    });
  }
}

function hoursToNext(systems, planetsPerSystem, galaxyMult) {
  buildEmpire(systems, planetsPerSystem, galaxyMult);
  const dps = vmCtx.dustPerSec();
  const cost = vmCtx.systemCost(vmCtx.nextSystemCostIndex());
  return dps > 0 ? cost / dps / 3600 : Infinity;
}

function avgHours(systems, planetsPerSystem, galaxyMult, runs) {
  let sum = 0;
  for (let i = 0; i < (runs || 25); i++) sum += hoursToNext(systems, planetsPerSystem, galaxyMult);
  return sum / (runs || 25);
}

function fmtHours(h) {
  if (!isFinite(h)) return '∞';
  if (h < 1) return Math.round(h * 60) + ' мин';
  return h.toFixed(1) + ' ч';
}

const argExp = process.argv[2];
if (argExp) X.CFG.systemCostExp = Number(argExp);

const exp = X.CFG.systemCostExp;
const SYS_LIST = [1, 5, 10, 25, 50, 75, 100, 125, 150, 200, 300, 500];

console.log('════════════════════════════════════════════════════════════════');
console.log(' Время до следующей системы · systemCostExp = ' + exp +
            ' · base = ' + X.CFG.systemBaseCost.toExponential(2));
console.log(' Средняя империя: 8 планет в системе, tech=0, без прайм/престижа');
console.log('════════════════════════════════════════════════════════════════');
console.log(' систем │  доход/с   │   цена      │  ждать');
console.log('────────┼────────────┼─────────────┼─────────');
for (const n of SYS_LIST) {
  const h = avgHours(n, 8, 1);
  buildEmpire(n, 8, 1);
  const dps = vmCtx.dustPerSec();
  const cost = vmCtx.systemCost(vmCtx.nextSystemCostIndex());
  console.log(
    String(n).padStart(7) + ' │ ' +
    dps.toExponential(2).padStart(10) + ' │ ' +
    cost.toExponential(2).padStart(11) + ' │ ' +
    fmtHours(h).padStart(8)
  );
}
console.log('════════════════════════════════════════════════════════════════');
