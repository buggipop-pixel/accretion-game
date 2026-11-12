// ═══════════════════════════════════════════════════════════════
//  TUTORIAL TEST — проверка поэтапного обучения (js/tutorial.js)
//  Запуск: node tests/tutorial-test.js
//  Без браузера: DOM/Canvas мокаются, проверяется логика шагов.
// ═══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const noop = () => {};

const storage = Object.create(null);
const localStorageMock = {
  getItem: (k) => (k in storage ? storage[k] : null),
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; },
  clear: () => { for (const k in storage) delete storage[k]; },
};

function makeElement() {
  return {
    style: {},
    dataset: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    innerHTML: '', textContent: '', value: '', children: [],
    appendChild: noop, removeChild: noop, remove: noop,
    setAttribute: noop, getAttribute: () => null,
    addEventListener: noop, removeEventListener: noop,
    querySelector: () => makeElement(), querySelectorAll: () => [],
  };
}

const mockDocument = {
  getElementById: () => makeElement(),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: noop,
  removeEventListener: noop,
  createElement: () => makeElement(),
  body: makeElement(),
  documentElement: makeElement(),
};

const context = { console, document: mockDocument, localStorage: localStorageMock, sessionStorage: localStorageMock };
context.window = context;
context.self = context;
context.globalThis = context;
context.addEventListener = noop;
context.removeEventListener = noop;
context.setTimeout = () => 0;
context.clearTimeout = noop;
context.setInterval = () => 0;
context.clearInterval = noop;
context.performance = { now: () => Date.now() };
context.navigator = { userAgent: 'node-tutorial-test', language: 'ru-RU', languages: ['ru-RU'] };
context.location = { href: 'http://localhost/', reload: noop };
context.toast = noop;
context.saveGame = noop;

vm.createContext(context);

['config.js', 'state.js', 'tutorial.js'].forEach((f) => {
  const code = fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
  vm.runInContext(code, context, { filename: f });
});

const S = context.S;
const Tutorial = context.Tutorial;

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log('✅ ' + name); }
  else { failed++; console.log('❌ ' + name); }
}

console.log('========================================');
console.log('🧪 ТЕСТЫ ПОЭТАПНОГО ОБУЧЕНИЯ');
console.log('========================================');

check('Tutorial загружен', !!Tutorial && typeof Tutorial.status === 'function');

const st = Tutorial.status();
check('Есть шаги обучения (>= 30)', st.total >= 30);
check('Стартовый шаг — цель облака', st.current && st.current.id === 'cloud_goal');

const ids = Tutorial.steps.map((s) => s.id);
check('ID шагов уникальны', new Set(ids).size === ids.length);
const chapters = new Set(Tutorial.chapters.map((c) => c.id));
check('У каждого шага корректная глава', Tutorial.steps.every((s) => chapters.has(s.ch)));
check('Info-шаги имеют autoNext', Tutorial.steps.filter((s) => s.mode === 'info').every((s) => (s.autoNext || 0) > 0));
check('Action-шаги имеют done()', Tutorial.steps.filter((s) => s.mode === 'action').every((s) => typeof s.done === 'function'));

// Прогресс: первый info-шаг закрывается, дальше — действие по сбору пыли.
Tutorial.markDone('cloud_goal', true);
let cur = Tutorial.status().current;
check('После цели — сбор пыли (action)', cur && cur.id === 'cloud_drag');

S.dust = 500;
cur = Tutorial.status().current;
const doneNow = Tutorial.done('cloud_drag');
check('Сбор пыли засчитывается при dust >= 300', doneNow === true);
check('Дальше — хранилища', cur && cur.id === 'start_storage');

// Переход фазы: всё пройденное в облаке закрывается автоматически.
S.stage = 'system';
S.planets = Array.from({ length: 8 }, (_, i) => ({ type: 'rocky', baseOrbitR: 170 + i * 40, moons: [], forming: false }));
cur = Tutorial.status().current;
check('В системе первым идёт шаг системы', cur && cur.id === 'sys_goal');
check('Шаги облака закрыты автоматически', Tutorial.done('cloud_drag') && Tutorial.done('cloud_goal'));

S.stage = 'galaxy';
cur = Tutorial.status().current;
check('В галактике первым идёт шаг галактики', cur && cur.id === 'gal_intro');
check('Шаги системы закрыты автоматически', Tutorial.done('sys_goal'));

// Макро-фазы галактики VI–IX.
Tutorial.markDone('gal_intro', true);
S.systems = 12;
cur = Tutorial.status().current;
check('На 12 системах — макро-масштаб (Фаза VI)', cur && cur.id === 'gal_lod');
Tutorial.markDone('gal_lod', true);
S.systems = 60;
cur = Tutorial.status().current;
check('На 60 системах — туманность (Фаза VII)', cur && cur.id === 'gal_phase7');
S.systems = 160;
cur = Tutorial.status().current;
check('На 160 системах — скопление (Фаза VIII)', cur && cur.id === 'gal_phase8');
S.systems = 460;
cur = Tutorial.status().current;
check('На 460 системах — сверхскопление (Фаза IX)', cur && cur.id === 'gal_phase9');
check('Главы VI–IX присутствуют', ['galaxy', 'nebula', 'cluster', 'supercluster'].every((id) => Tutorial.chapters.some((c) => c.id === id)));

// Сброс.
S.systems = 1;
S.stage = 'cloud';
Tutorial.reset();
cur = Tutorial.status().current;
check('Сброс возвращает к первому шагу', cur && cur.id === 'cloud_goal' && Tutorial.status().done === 0);

// Защита от битого состояния.
S.tut = null;
cur = Tutorial.status();
check('Битое состояние S.tut восстанавливается', !!S.tut && cur.total >= 30);

console.log('========================================');
console.log(`ИТОГО: Пройдено ${passed}, Провалено ${failed}`);
if (failed > 0) process.exit(1);
