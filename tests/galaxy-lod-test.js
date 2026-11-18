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
assert('LOD: 10 систем → уровень 3 (созвездие)', lod(10) === 3);
assert('LOD: 49 систем → уровень 3', lod(49) === 3);
assert('LOD: 50 систем → уровень 2 (туманность)', lod(50) === 2);
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
assert('Престиж: ступени 10, 22, 35, 50… (шаг 1.5)',
  req[0] === 10 && req[1] === 22 && req[2] === 35 && req[3] === 50);
assert('Престиж: 1-я вспышка с 10 систем', context.prestigeRequirementFor(0) === 10);
assert('Престиж: 2-я вспышка с 22 систем', context.prestigeRequirementFor(1) === 22);
assert('Престиж: 3-я вспышка с 35 систем', context.prestigeRequirementFor(2) === 35);
assert('Престиж: лестница растёт дальше', req[5] > req[4] && req[6] > req[5]);
assert('Престиж: 6-я вспышка по ступени', context.prestigeRequirementFor(5) === req[5]);

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

// ─── Регрессия: вспышка на 225 не оставляет бесплатную догоняющую на 150 ───
// Игроки жаловались: после вспышки на 225 систем следующая вспышка
// приходит почти сразу — потому что рубеж 150 оставался неотмеченным
// и после сброса выживало ≥150 систем.
async function testNoDoubleFlareAfter225() {
  const S = context.S;
  S.stage = 'galaxy';
  S.prestigeLevel = 7;
  S.prestigeCatchupCount = 0;
  S.prestigeCatchupMilestone = 0;
  S.galaxies = 8;
  S.galaxyMultiplier = context.prestigeMultiplierFor(7);
  S.systems = 225; S.totalSystemsCreated = 225;
  S.singularities = 0; S.primeSystem = null; S.activeSystemIdx = 0;
  S.planets = []; S.systemName = 'Родная';
  S.otherSystems = [null];
  for (let i = 0; i < 225; i++) {
    S.otherSystems.push({ name: 'R' + i, starType: 'G', systemType: 'single', planets: [] });
  }

  assert('Вспышка@225: доступна 8-я по лестнице',
    context.checkPrestigeAvailability() === 8 && context.nextPrestigeRequirement() === 225);

  const origRandom = Math.random;
  Math.random = () => 0.65; // выживает 154 обычных → 155 систем с родной
  try {
    context.performSupernova(8);
    await wait(1800);
  } finally {
    Math.random = origRandom;
  }

  assert('Вспышка@225: рубеж 150 закрыт обычной вспышкой',
    S.prestigeCatchupMilestone === 150, String(S.prestigeCatchupMilestone));
  assert('Вспышка@225: выжило 155 систем (≥ рубежа 150)',
    S.systems === 155, String(S.systems));
  assert('Вспышка@225: догоняющей на 150 больше нет',
    context.prestigeCatchupNeed() === 0 && context.checkPrestigeAvailability() === 0,
    'need=' + context.prestigeCatchupNeed() + ' avail=' + context.checkPrestigeAvailability());
  assert('Вспышка@225: следующий порог — 337, а не 150',
    context.nextPrestigeRequirement() === 337, String(context.nextPrestigeRequirement()));
}

// ─── Регрессия: после Вспышки нельзя сразу следующую на остатках ───
// Симптом: игрок сделал Вспышку на 1000 систем, осталось 500 — и следующая
// Вспышка сразу доступна (уровни прокручиваются подряд). Плюс в статистике
// «уничтожено 385», хотя сохранилось 500 — числа не сходились.
async function testNoChainFlareAfterBigPrestige() {
  const S = context.S;
  S.stage = 'galaxy';
  S.prestigeLevel = 8;
  S.prestigeCatchupCount = 0;
  S.prestigeCatchupMilestone = 0;
  S.prestigeRequirementFloor = 0;
  S.galaxies = 8;
  S.galaxyMultiplier = context.prestigeMultiplierFor(8);
  S.systems = 1000; S.totalSystemsCreated = 1000;
  S.singularities = 0; S.primeSystem = null; S.activeSystemIdx = 0;
  S.planets = []; S.systemName = 'Родная';
  S.otherSystems = [null];
  for (let i = 0; i < 1000; i++) {
    S.otherSystems.push({ name: 'R' + i, starType: 'G', systemType: 'single', planets: [] });
  }

  assert('Вспышка@1000: доступна следующая ступень',
    context.checkPrestigeAvailability() === 9);

  const origRandom = Math.random;
  Math.random = () => 0.4999; // выживает примерно половина
  try {
    context.performSupernova(9);
    await wait(1800);
  } finally {
    Math.random = origRandom;
  }

  assert('Вспышка@1000: сохранилось около половины',
    S.systems > 400 && S.systems < 600, String(S.systems));
  assert('Вспышка@1000: требование-пол = 1200 (рост ×1.2)',
    context.prestigeRequirementFloor() === 1200, String(context.prestigeRequirementFloor()));
  assert('Вспышка@1000: следующая Вспышка НЕ доступна сразу',
    context.checkPrestigeAvailability() === 0,
    'need=' + context.nextPrestigeRequirement() + ' systems=' + S.systems);
  assert('Вспышка@1000: порог выше остатка',
    context.nextPrestigeRequirement() > S.systems);

  // ── Статистика: «уничтожено» = было − осталось ──
  assert('Статистика: 1000 → 500 = уничтожено 500',
    context.prestigeDestroyedTotal(1000, 500) === 500);
  assert('Статистика: пол/нули/мусор без отрицательных',
    context.prestigeDestroyedTotal(500, 500) === 0 &&
    context.prestigeDestroyedTotal(400, 500) === 0 &&
    context.prestigeDestroyedTotal('abc', 100) === 0);

  // ── Поля престижа обязаны переживать сейв/загрузку ──
  // Иначе после релоада/облака использованные рубежи снова «бесплатные».
  const prevSet = context.localStorage.setItem;
  const prevGet = context.localStorage.getItem;
  let savedRaw = '';
  context.localStorage.setItem = (k, v) => { savedRaw = v; };
  S.prestigeCatchupMilestone = 900;
  S.prestigeCatchupCount = 2;
  S.prestigeRequirementFloor = 1200;
  context.saveGame();
  context.localStorage.setItem = prevSet;

  const parsed = JSON.parse(savedRaw);
  assert('Сейв: рубеж/счётчик/пол попадают в сейв',
    parsed.prestigeCatchupMilestone === 900 &&
    parsed.prestigeCatchupCount === 2 &&
    parsed.prestigeRequirementFloor === 1200,
    JSON.stringify({
      m: parsed.prestigeCatchupMilestone,
      c: parsed.prestigeCatchupCount,
      f: parsed.prestigeRequirementFloor,
    }));

  context.localStorage.getItem = () => JSON.stringify(parsed);
  vm.runInContext('loadGame()', context);
  context.localStorage.getItem = prevGet;
  assert('Загрузка: рубеж догоняющей не сбрасывается',
    S.prestigeCatchupMilestone === 900, String(S.prestigeCatchupMilestone));
  assert('Загрузка: требование-пол сохраняется',
    S.prestigeRequirementFloor === 1200, String(S.prestigeRequirementFloor));
}

testPrestigeRewards().then(testNoDoubleFlareAfter225).then(testNoChainFlareAfterBigPrestige).then(function() {
  console.log('\n' + (failed === 0 ? '✅ Все тесты пройдены' : '❌ Провалов: ' + failed) + ' (' + passed + ' проверок)');
  process.exit(failed === 0 ? 0 : 1);
}).catch(function(err) {
  console.error('💥 Ошибка теста:', err);
  process.exit(1);
});
