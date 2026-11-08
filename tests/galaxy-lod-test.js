// ═══════════════════════════════════════════════════════════════
//  GALAXY LOD / PRESTIGE CURVE TEST
//  Проверяет, что 1000 систем на LOD 0 рендерятся как 3 макро-
//  объекта, а пороги престижа соответствуют новому патчу.
//  Запуск: node tests/galaxy-lod-test.js
// ═══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const noop = () => {};

function makeElement() {
  return {
    style: {}, dataset: {}, value: '',
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    innerHTML: '', textContent: '', children: [],
    appendChild: noop, removeChild: noop, remove: noop,
    setAttribute: noop, getAttribute: () => null,
    addEventListener: noop, removeEventListener: noop,
    querySelector: () => makeElement(), querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }),
  };
}

const context = { console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval: noop, Date, Math, JSON };
context.window = context;
context.self = context;
context.globalThis = context;
context.localStorage = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop };
context.sessionStorage = context.localStorage;
context.document = {
  getElementById: () => makeElement(), querySelector: () => makeElement(),
  querySelectorAll: () => [], createElement: () => makeElement(),
  addEventListener: noop, body: makeElement(), documentElement: makeElement(),
};
context.performance = { now: () => Date.now() };
context.requestAnimationFrame = () => 0;
context.cancelAnimationFrame = noop;
context.addEventListener = noop;
context.location = { href: 'http://localhost/', origin: 'http://localhost', reload: noop };
context.toast = noop;
context.updateUI = noop;
context.updateSystemSwitcher = noop;
context.closeEvolutionModal = noop;
vm.createContext(context);

['config.js', 'state.js', 'prime.js', 'prestige.js'].forEach((f) => {
  const code = fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
  vm.runInContext(code, context, { filename: f });
});

let passed = 0;
let failed = 0;
function assert(name, cond, extra) {
  if (cond) { console.log('✅ ' + name); passed++; }
  else { console.error('❌ ' + name + (extra ? ' → ' + extra : '')); failed++; }
}

// ─── LOD thresholds ───
const lod = context.galaxyLodForTotal;
assert('LOD: 1 система → уровень 4 (звёзды)', lod(1) === 4);
assert('LOD: 9 систем → уровень 4', lod(9) === 4);
assert('LOD: 10 систем → уровень 3 (туманность)', lod(10) === 3);
assert('LOD: 49 систем → уровень 3', lod(49) === 3);
assert('LOD: 50 систем → уровень 2 (созвездие)', lod(50) === 2);
assert('LOD: 150 систем → уровень 1 (скопление)', lod(150) === 1);
assert('LOD: 450 систем → уровень 0 (сверхскопление)', lod(450) === 0);
assert('LOD: 1000 систем → уровень 0', lod(1000) === 0);

const groupSize = context.galaxyGroupSizeForLevel;
assert('LOD: размер группы ур.0 = 450', groupSize(0) === 450);
assert('LOD: размер группы ур.1 = 150', groupSize(1) === 150);
assert('LOD: размер группы ур.2 = 50', groupSize(2) === 50);
assert('LOD: размер группы ур.3 = 10', groupSize(3) === 10);
assert('LOD: размер группы ур.4 = 1', groupSize(4) === 1);

const count = context.galaxyMacroGroupCount;
assert('LOD: 1000 систем на ур.0 = 3 макро-объекта', count(1000, 0) === 3);
assert('LOD: 1000 систем на ур.1 = 7 макро-объектов', count(1000, 1) === 7);
assert('LOD: 1000 систем на ур.3 = 100 макро-объектов', count(1000, 3) === 100);

// ─── Престиж ───
const req = context.prestigeRequirements();
assert('Престиж: требования [10,50,150,450,1350,4050]',
  JSON.stringify(req.slice(0, 6)) === JSON.stringify([10, 50, 150, 450, 1350, 4050]));
assert('Престиж: 1-я вспышка с 10 систем', context.prestigeRequirementFor(0) === 10);
assert('Престиж: 2-я вспышка с 50 систем', context.prestigeRequirementFor(1) === 50);
assert('Престиж: 3-я вспышка с 150 систем', context.prestigeRequirementFor(2) === 150);
assert('Престиж: 4-я вспышка с 450 систем', context.prestigeRequirementFor(3) === 450);
assert('Престиж: 5-я вспышка с 1350 систем', context.prestigeRequirementFor(4) === 1350);
assert('Престиж: 6-я вспышка с 4050 систем', context.prestigeRequirementFor(5) === 4050);

// ─── Редкость Прайма ───
assert('Прайм: primeBH > superBH', context.primeObjectRank('primeBH') > context.primeObjectRank('superBH'));
assert('Прайм: superBH > blackHole', context.primeObjectRank('superBH') > context.primeObjectRank('blackHole'));

// ─── Название макро-объекта ───
context.S.totalSystemsCreated = 10;
const macroName = vm.runInContext('currentMacroObjectName()', context);
assert('Макро-имя: при 10 системах — Созвездие Ориона', /Созвездие Ориона/.test(macroName) && !/№/.test(macroName), macroName);
context.S.totalSystemsCreated = 60;
const macroName2 = vm.runInContext('currentMacroObjectName()', context);
assert('Макро-имя: при 60 системах — Туманность Ориона', /Туманность Ориона/.test(macroName2) && !/№/.test(macroName2), macroName2);
const uniqueNames = [];
for (let i = 0; i < 120; i++) uniqueNames.push(context.galaxyMacroName(2, i));
assert('Макро-имена: без повторов на 120 объектах', new Set(uniqueNames).size === uniqueNames.length, uniqueNames.join(', '));

function wait(ms) { return new Promise(function(resolve) { setTimeout(resolve, ms); }); }

async function testPrestigeRewards() {
  const S = context.S;
  S.stage = 'galaxy';
  S.prestigeLevel = 0; S.galaxies = 1; S.galaxyMultiplier = 1;
  S.systems = 60; S.totalSystemsCreated = 60;
  S.singularities = 3;
  S.primeSystem = context.createPrimeSystem('primeBH');
  S.activeSystemIdx = 0;
  S.planets = [];
  S.systemName = 'Родная';
  S.otherSystems = [null];
  for (let i = 0; i < 59; i++) {
    S.otherSystems.push({ name: 'R' + i, starType: 'G', systemType: 'single', planets: [] });
  }
  S.otherSystems[10] = {
    name: 'SuperPrime', starType: 'G', systemType: 'single', planets: [],
    isPrime: true, primeData: context.createPrimeSystem('superBH')
  };
  context.performSupernova(1);
  await wait(1700);
  assert('Вспышка: +6 Сингулярностей (3→9)', S.singularities === 9, String(S.singularities));
  assert('Вспышка: лучший primeBH в otherSystems[1]',
    !!(S.otherSystems[1] && S.otherSystems[1].primeData &&
      S.otherSystems[1].primeData.objectKey === 'primeBH'));
  assert('Вспышка: космический след 10 минут',
    !!(S.cosmicTrail && S.cosmicTrail.duration === 600000));
  const expectedLod = context.galaxyLodForTotal(S.totalSystemsCreated);
  assert('Вспышка: LOD пересчитан по числу систем',
    S.galaxyZoomLevel === expectedLod,
    S.galaxyZoomLevel + '/' + expectedLod);
}

testPrestigeRewards().then(function() {
  console.log('\n' + (failed === 0 ? '✅ Все тесты пройдены' : '❌ Провалов: ' + failed) + ' (' + passed + ' проверок)');
  process.exit(failed === 0 ? 0 : 1);
}).catch(function(err) {
  console.error('💥 Ошибка теста:', err);
  process.exit(1);
});
