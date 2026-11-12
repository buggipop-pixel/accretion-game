// ═══════════════════════════════════════════════════════════════
//  GALAXY PHASES / FLARE SYNC TEST
//  Проверяет фазы VI–IX (Созвездие → Туманность → Скопление →
//  Сверхскопление) и то, что рубежи фаз всегда являются вспышками.
//  Запуск: node tests/galaxy-phases-test.js
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

const phaseFor = context.galaxyPhaseFor;

// ─── Фазы ───
let p = phaseFor(0);
assert('Фаза VI: 0 систем → Созвездие', p.key === 'constellation' && p.num === 6 && p.roman === 'VI', JSON.stringify(p));
assert('Фаза VI: квест «Собери созвездие» 0/10', /созвездие/i.test(p.questTitle) && p.count === 0 && p.countMax === 10, JSON.stringify(p));

p = phaseFor(9);
assert('Фаза VI: 9 систем → 9/10 звёзд', p.num === 6 && p.count === 9 && p.countMax === 10, JSON.stringify(p));

p = phaseFor(10);
assert('Фаза VII: 10 систем → Туманность', p.key === 'nebula' && p.num === 7 && p.roman === 'VII', JSON.stringify(p));
assert('Фаза VII: 1/5 созвездий', p.count === 1 && p.countMax === 5, JSON.stringify(p));

p = phaseFor(49);
assert('Фаза VII: 49 систем → 4/5 созвездий', p.num === 7 && p.count === 4, JSON.stringify(p));

p = phaseFor(50);
assert('Фаза VIII: 50 систем → Скопление', p.key === 'cluster' && p.num === 8 && p.roman === 'VIII', JSON.stringify(p));
assert('Фаза VIII: 1/3 туманностей', p.count === 1 && p.countMax === 3, JSON.stringify(p));

p = phaseFor(149);
assert('Фаза VIII: 149 систем → 2/3 туманностей', p.num === 8 && p.count === 2, JSON.stringify(p));

p = phaseFor(150);
assert('Фаза IX: 150 систем → Сверхскопление', p.key === 'supercluster' && p.num === 9 && p.roman === 'IX', JSON.stringify(p));
assert('Фаза IX: 1/3 скоплений, первый оборот', p.count === 1 && p.countMax === 3 && p.round === 1, JSON.stringify(p));

p = phaseFor(449);
assert('Фаза IX: 449 систем → 2/3 скоплений', p.num === 9 && p.count === 2 && p.round === 1, JSON.stringify(p));

p = phaseFor(450);
assert('Фаза IX: 450 систем → 2-е сверхскопление, 0/3', p.round === 2 && p.count === 0 && p.countMax === 3, JSON.stringify(p));

p = phaseFor(600);
assert('Фаза IX: 600 систем → 1/3 скоплений второго оборота', p.round === 2 && p.count === 1, JSON.stringify(p));

p = phaseFor(900);
assert('Фаза IX: 900 систем → 3-е сверхскопление', p.round === 3 && p.count === 0, JSON.stringify(p));

// ─── Прогресс кольца ───
assert('Кольцо: 5 систем → 0.5 фазы VI', Math.abs(phaseFor(5).progress - 0.5) < 1e-9, String(phaseFor(5).progress));
assert('Кольцо: 50 систем → 0 фазы VIII', Math.abs(phaseFor(50).progress) < 1e-9, String(phaseFor(50).progress));
assert('Кольцо: 300 систем → 2/3 фазы IX', Math.abs(phaseFor(300).progress - 2 / 3) < 1e-9, String(phaseFor(300).progress));

// ─── Синхронизация с вспышками ───
const req = context.prestigeRequirements();
function indexOfReq(n) { return req.indexOf(n); }
assert('Вспышки: 10 — рубеж фазы VI', indexOfReq(10) === 0, String(indexOfReq(10)));
assert('Вспышки: 50 — рубеж фазы VII', indexOfReq(50) === 3, String(indexOfReq(50)));
assert('Вспышки: 150 — рубеж фазы VIII', indexOfReq(150) === 6, String(indexOfReq(150)));
assert('Вспышки: 450 — рубеж фазы IX', indexOfReq(450) === 9, String(indexOfReq(450)));
assert('Вспышки: между 150 и 450 есть 2 промежуточные (225, 337)',
  indexOfReq(225) === 7 && indexOfReq(337) === 8);
assert('Вспышки: между 10 и 50 есть 2 промежуточные (22, 35)',
  indexOfReq(22) === 1 && indexOfReq(35) === 2);
assert('Вспышки: между 50 и 150 есть 2 промежуточные (75, 112)',
  indexOfReq(75) === 4 && indexOfReq(112) === 5);

let monotonic = true;
for (let i = 1; i < 30; i++) if (!(req[i] > req[i - 1])) monotonic = false;
assert('Вспышки: лестница строго растёт', monotonic);

// ─── Миграция множителя старого сейва ───
const target11 = context.prestigeMultiplierFor(11);
const staleMultiplier = Math.pow(1.3, 11);
context.localStorage.getItem = function () {
  return JSON.stringify({
    prestigeLevel: 11, galaxies: 12, galaxyMultiplier: staleMultiplier,
    stage: 'galaxy', systems: 187, seenLore: [],
  });
};
vm.runInContext('loadGame()', context);
assert('Сейв ×1.3: множитель поднят до кривой ×1.6',
  Math.abs(context.S.galaxyMultiplier - target11) < 1e-6, String(context.S.galaxyMultiplier));

context.localStorage.getItem = function () {
  return JSON.stringify({
    prestigeLevel: 11, galaxies: 12, galaxyMultiplier: 2048,
    stage: 'galaxy', systems: 187, seenLore: [],
  });
};
vm.runInContext('loadGame()', context);
assert('Сейв с завышенным ×: срезан до кривой',
  Math.abs(context.S.galaxyMultiplier - target11) < 1e-6, String(context.S.galaxyMultiplier));

console.log('\n' + (failed === 0 ? '✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ' : '❌ ЕСТЬ ОШИБКИ') + ': ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
