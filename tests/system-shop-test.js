// ═══════════════════════════════════════════════════════════════
//  Тесты магазина новых систем (js/shop.js): цены должны быть
//  заморожены на всю покупку, иначе вливание цивилизации меняет
//  energyPerSec() и цена энергии «скачет» (issue #6).
// ═══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

function assert(name, cond, extra) {
  if (cond) { console.log('✅ ' + name); passed++; }
  else {
    console.error('❌ ' + name + (extra ? ' → ' + extra : ''));
    failed++;
  }
}

function makeClientContext() {
  const noop = () => {};
  const elements = {};
  const el = () => ({
    style: {}, dataset: {}, classList: { add: noop, remove: noop, contains: () => false },
    innerHTML: '', appendChild: noop, addEventListener: noop,
    querySelector: () => el(), querySelectorAll: () => [],
    getContext: () => null, getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
    getAttribute: () => null, setAttribute: noop,
  });
  const storage = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop };
  const context = {
    console: { log: noop, warn: noop, error: noop },
    document: {
      getElementById: (id) => { if (!elements[id]) elements[id] = el(); return elements[id]; },
      querySelector: () => el(), querySelectorAll: () => [],
      createElement: () => el(), addEventListener: noop, body: el(), visibilityState: 'visible',
    },
    localStorage: storage,
    sessionStorage: storage,
    performance: { now: () => Date.now() },
    navigator: { userAgent: 'node' },
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    requestAnimationFrame: () => 0, cancelAnimationFrame: noop,
    addEventListener: noop, removeEventListener: noop,
    alert: noop, confirm: () => false, prompt: () => '',
    fetch: () => Promise.reject(new Error('offline')),
    Audio: function Audio() { return { play: noop, pause: noop }; },
    Image: function Image() { return el(); },
  };
  context.window = context;
  context.self = context;
  context.globalThis = context;
  vm.createContext(context);

  for (const file of ['config.js', 'state.js', 'economy.js', 'shop.js']) {
    const code = fs.readFileSync(path.join(__dirname, '../js', file), 'utf8');
    vm.runInContext(code, context, { filename: file });
  }

  // Заглушки UI/генерации: тест проверяет только цены, прогресс и возврат.
  vm.runInContext(`
    function fmt(n) { return String(n); }
    function toast() {}
    function updateUI() {}
    function saveGame() { globalThis.__saveCount = (globalThis.__saveCount || 0) + 1; }
    function switchToSystem() {}
    function generateShopSystem(flavor, outcome) {
      return { name: 'Test', starType: 'G', systemType: 'single', planets: [], incomeBonus: outcome ? outcome.incomeBonus : 0 };
    }
    globalThis.__api = {
      S: S,
      systemShopCosts: systemShopCosts,
      systemShopActiveCosts: systemShopActiveCosts,
      systemShopFill: systemShopFill,
      systemShopOutcome: systemShopOutcome,
      pourSystemShop: pourSystemShop,
      openSystemShop: openSystemShop,
      cancelSystemCreation: cancelSystemCreation,
      createSystemFromShop: createSystemFromShop,
      energyPerSec: energyPerSec,
    };
  `, context, { filename: 'test-bridge.js' });
  return vm.runInContext('__api', context);
}

function setupGame(api, overrides) {
  const S = api.S;
  S.stage = 'galaxy';
  S.systems = 3;
  S.totalSystemsCreated = 3;
  S.systemCostFloor = 2;
  S.systemShopProgress = { dust: 0, energy: 0, civ: 0 };
  S.systemShopCost = null;
  S.dust = 1e15;
  S.energy = 1e12;
  S.civLevel = 40;
  S.starType = 'G';
  S.systemType = 'single';
  S.activeSystemIdx = 0;
  S.otherSystems = [];
  S.primeSystem = null;
  S.storageLevels = { dust: 1, energy: 1, civ: 1 };
  S.techLevels = { eng: 0, quantum: 0, cyber: 0 };
  S.planets = [{ type: 'rocky', baseOrbitR: 1.1, orbitR: 110 }, { type: 'rocky', baseOrbitR: 1.8, orbitR: 180 }];
  if (overrides) Object.assign(S, overrides);
}

function sameCosts(a, b) {
  return !!a && !!b && a.dust === b.dust && a.energy === b.energy && a.civ === b.civ;
}

const api = makeClientContext();

console.log('========================================');
console.log('🧪 ТЕСТЫ МАГАЗИНА СИСТЕМ (заморозка цен)');
console.log('========================================');

// ─── 1. Открытие магазина создаёт снимок и цены не плывут ───────
setupGame(api);
const costsBefore = api.systemShopCosts();
api.openSystemShop();
const snap = api.S.systemShopCost;

assert('Открытие магазина сохраняет снимок цен',
  sameCosts(snap, costsBefore), `snap=${JSON.stringify(snap)} costs=${JSON.stringify(costsBefore)}`);

api.S.civLevel = 12;
api.S.energy = 5000;

const activeCosts = api.systemShopActiveCosts();
assert('Цены не меняются после вливания цивилизации',
  sameCosts(activeCosts, costsBefore), `active=${JSON.stringify(activeCosts)}`);

const recalculated = api.systemShopCosts();
assert('systemShopCosts() без снимка реально меняет цену (воспроизведение бага)',
  recalculated.energy !== costsBefore.energy,
  `before=${costsBefore.energy} after=${recalculated.energy}`);

api.openSystemShop();
assert('Повторное открытие использует замороженную цену',
  sameCosts(api.systemShopActiveCosts(), costsBefore));

// ─── 2. Процент заполнения считается от замороженной цены ──────
setupGame(api);
api.openSystemShop();
const frozen = api.S.systemShopCost;
const energyBeforePour = api.S.energy;
api.pourSystemShop('energy', 0.25);

assert('Залив 25% энергии даёт заполнение 0.25',
  Math.abs(api.systemShopFill('energy') - 0.25) < 1e-9,
  'fill=' + api.systemShopFill('energy'));
assert('Списывается ровно 25% замороженной цены',
  energyBeforePour - api.S.energy === Math.floor(frozen.energy * 0.25),
  `spent=${energyBeforePour - api.S.energy} expected=${Math.floor(frozen.energy * 0.25)}`);

api.S.civLevel = 4;
assert('Заполнение остаётся 0.25 после изменения civLevel',
  Math.abs(api.systemShopFill('energy') - 0.25) < 1e-9,
  'fill=' + api.systemShopFill('energy'));

api.S.systemShopProgress.energy = frozen.energy * 2;
assert('Прогресс больше снимка цены клампится до 100%',
  api.systemShopFill('energy') === 1);

// ─── 3. Отмена возвращает ресурсы и очищает снимок ─────────────
setupGame(api);
api.openSystemShop();
const beforeCancel = { dust: api.S.dust, energy: api.S.energy, civ: api.S.civLevel };
api.pourSystemShop('energy', 0.25);
api.pourSystemShop('civ', 0.25);

assert('Ресурсы реально списаны до отмены',
  api.S.energy < beforeCancel.energy && api.S.civLevel < beforeCancel.civ,
  `energy=${api.S.energy}/${beforeCancel.energy} civ=${api.S.civLevel}/${beforeCancel.civ}`);

api.cancelSystemCreation();
assert('Отмена возвращает энергию', api.S.energy === beforeCancel.energy,
  `${api.S.energy} != ${beforeCancel.energy}`);
assert('Отмена возвращает цивилизацию', api.S.civLevel === beforeCancel.civ,
  `${api.S.civLevel} != ${beforeCancel.civ}`);
assert('Отмена возвращает пыль', api.S.dust === beforeCancel.dust);
assert('Отмена очищает снимок цен', api.S.systemShopCost === null);
assert('Отмена обнуляет прогресс',
  api.S.systemShopProgress.dust === 0 &&
  api.S.systemShopProgress.energy === 0 &&
  api.S.systemShopProgress.civ === 0);

// ─── 4. Старый сейв: прогресс есть, снимка нет ─────────────────
setupGame(api);
api.S.systemShopProgress = { dust: 0, energy: 0, civ: 0 };
api.S.systemShopCost = null;
const oldSaveCosts = api.systemShopCosts();
api.openSystemShop();
assert('Старый сейв без снимка: снимок создаётся при открытии',
  sameCosts(api.S.systemShopCost, oldSaveCosts));

// ─── 5. Создание без снимка не падает и очищает снимок ─────────
setupGame(api);
api.openSystemShop();
const createCosts = api.S.systemShopCost;
api.S.systemShopProgress = {
  dust: createCosts.dust,
  energy: createCosts.energy,
  civ: createCosts.civ,
};
api.S.systemShopCost = null;
const created = api.createSystemFromShop();
assert('Создание системы без снимка не падает', created === true);
assert('Снимок очищается после успешного создания', api.S.systemShopCost === null);
assert('Прогресс обнуляется после создания',
  api.S.systemShopProgress.dust === 0 &&
  api.S.systemShopProgress.energy === 0 &&
  api.S.systemShopProgress.civ === 0);

console.log('========================================');
console.log(`ИТОГО: Пройдено ${passed}, Провалено ${failed}`);
if (failed > 0) process.exitCode = 1;
