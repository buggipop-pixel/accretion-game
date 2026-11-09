// ═══════════════════════════════════════════════════════════════
//  SMOKE TEST — быстрая проверка ключевых механик игры в Node.js
//  Запуск:  node tests/smoke-test.js   (или: npm test)
//  Скрипт не требует браузера: DOM/Canvas/Telegram мокаются.
// ═══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ─── 1. Мокаем браузерное окружение ────────────────────────────
const noop = () => {};

// localStorage с запоминанием записей — нужен для проверки сейва
const storage = Object.create(null);
const saveWrites = [];
const localStorageMock = {
  getItem: (key) => (key in storage ? storage[key] : null),
  setItem: (key, value) => {
    storage[key] = String(value);
    saveWrites.push({ key, value: String(value) });
  },
  removeItem: (key) => { delete storage[key]; },
  clear: () => { for (const k in storage) delete storage[k]; },
};

function makeElement() {
  const el = {
    style: {},
    dataset: {},
    classList: {
      add: noop, remove: noop, toggle: noop, contains: () => false,
    },
    innerHTML: '',
    textContent: '',
    value: '',
    children: [],
    appendChild: noop,
    removeChild: noop,
    remove: noop,
    setAttribute: noop,
    getAttribute: () => null,
    addEventListener: noop,
    removeEventListener: noop,
    querySelector: () => makeElement(),
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }),
    focus: noop,
    blur: noop,
    play: noop,
    pause: noop,
  };
  return el;
}

function makeContext2d() {
  return {
    canvas: { width: 800, height: 600 },
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createLinearGradient: () => ({ addColorStop: noop }),
    putImageData: noop,
    drawImage: noop,
    fillRect: noop,
    clearRect: noop,
    beginPath: noop,
    closePath: noop,
    arc: noop,
    ellipse: noop,
    fill: noop,
    stroke: noop,
    moveTo: noop,
    lineTo: noop,
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    setTransform: noop,
    fillText: noop,
    strokeText: noop,
    measureText: () => ({ width: 0 }),
    setLineDash: noop,
  };
}

const mockDocument = {
  getElementById: () => makeElement(),
  querySelector: () => makeElement(),
  querySelectorAll: () => [],
  getElementsByClassName: () => [],
  addEventListener: noop,
  removeEventListener: noop,
  createElement: (tag) => {
    const el = makeElement();
    if (String(tag).toLowerCase() === 'canvas') {
      el.width = 800;
      el.height = 600;
      el.getContext = () => makeContext2d();
    }
    return el;
  },
  body: makeElement(),
  documentElement: makeElement(),
  visibilityState: 'visible',
  hidden: false,
  cookie: '',
};

// Сам context делаем и «глобальным объектом», и `window`.
// Игра вешает публичное API на window (window.S, window.dustPerSec и т.д.),
// поэтому window ОБЯЗАН быть тем же объектом, что и глобальный контекст.
const context = {
  console,
  document: mockDocument,
  localStorage: localStorageMock,
  sessionStorage: localStorageMock,
};

context.window = context;
context.self = context;
context.globalThis = context;
context.top = context;
context.parent = context;

context.addEventListener = noop;
context.removeEventListener = noop;
context.dispatchEvent = noop;

context.performance = { now: () => Date.now() };
context.requestAnimationFrame = () => 0;
context.cancelAnimationFrame = noop;
// Таймеры в смоук-тесте не нужны: отключаем, чтобы процесс завершился сразу
context.setTimeout = () => 0;
context.clearTimeout = noop;
context.setInterval = () => 0;
context.clearInterval = noop;

context.fetch = () => Promise.reject(new Error('network disabled in smoke test'));
context.navigator = { userAgent: 'node-smoke-test', language: 'ru-RU', languages: ['ru-RU'] };
context.location = {
  href: 'http://localhost/',
  origin: 'http://localhost',
  reload: noop,
  assign: noop,
  replace: noop,
};

context.alert = noop;
context.confirm = () => false;
context.prompt = () => '';
context.Audio = function Audio() {
  return { play: noop, pause: noop, currentTime: 0, volume: 1, loop: false, src: '' };
};
context.Image = function Image() {
  const img = makeElement();
  img.src = '';
  img.width = 0;
  img.height = 0;
  img.complete = true;
  img.onload = null;
  img.onerror = null;
  return img;
};

// Заглушки UI-функций из ui.js / audio.js / eventlog.js и т.п.
// Нужны, потому что часть механик вызывает их напрямую (например, spawnInvasion -> toast).
context.toast = noop;
context.updateUI = noop;
context.playSFX = noop;
context.addEvent = noop;
context.offerColony = noop;
context.showModal = noop;
context.hideModal = noop;

vm.createContext(context);

// ─── 2. Загружаем файлы игры ───────────────────────────────────
// prime.js добавлен в список: createPrimeSystem() живёт там, а не в premium.js.
const files = [
  'config.js',
  'state.js',
  'economy.js',
  'planets.js',
  'prime.js',
  'invasions.js',
  'premium.js',
  'cloudsave.js',
  'prestige.js',
  'random-events.js',
  'notifications.js',
  'fleet.js',
];

files.forEach((f) => {
  try {
    const code = fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
    vm.runInContext(code, context, { filename: f });
  } catch (e) {
    console.error(`❌ Ошибка при загрузке ${f}:`, e.message);
    process.exit(1);
  }
});

// ─── Мост: браузерные глобалы для лексических const ────────────
// В браузере `const FLEET_CFG` из config.js — глобальная переменная,
// но в vm.runInContext она остаётся лексической и не попадает в context.
// Экспортируем её в window (он же глобальный объект), чтобы проверки работали.
try {
  vm.runInContext(
    `
    window.S = S;
    window.FLEET_CFG = FLEET_CFG;
    window.createPrimeSystem = createPrimeSystem;
    window.generatePerfectPrimeSystem = generatePerfectPrimeSystem;
    window.saveGame = saveGame;
    `,
    context,
    { filename: 'smoke-bridge.js' }
  );
} catch (e) {
  console.error('❌ Ошибка при экспорте констант в window:', e.message);
  process.exit(1);
}

// ─── 3. ТЕСТЫ ──────────────────────────────────────────────────
console.log('========================================');
console.log('🧪 ЗАПУСК СМОУК-ТЕСТОВ');
console.log('========================================');
let passed = 0;
let failed = 0;

function assert(name, condition) {
  if (condition) {
    console.log(`✅ ${name}`);
    passed++;
  } else {
    console.error(`❌ ${name}`);
    failed++;
  }
}

// Тест 1: Экономика не выдает NaN
context.S.stage = 'system';
context.S.dust = 1000;
context.S.planets = [{ type: 'lava', baseOrbitR: 170, orbitR: 170, mass: 1.5, diameter: 0.9, forming: false }];

assert('Функция dustPerSec() возвращает число', !isNaN(context.dustPerSec()));
assert('Функция energyPerSec() возвращает число', !isNaN(context.energyPerSec()));
assert('Функция civPerSec() возвращает число', !isNaN(context.civPerSec()));
assert('Функция metalsPerSec() возвращает число > 0', context.metalsPerSec() > 0);

// Тест 2: Стоимость планет и систем
assert('Стоимость планеты > 0', context.planetCost(0) > 0);
assert('Стоимость системы > 0', context.systemCost(1) > 0);

// Тест 2b: цена системы не откатывается после престижа
context.S.systems = 23;
context.S.totalSystemsCreated = 23;
context.S.systemCostFloor = 0;
assert('Индекс цены системы растёт с числом систем', context.nextSystemCostIndex() === 22);
const priceBeforePrestige = context.systemCost(context.nextSystemCostIndex());
context.S.systems = 7; // имитация performSupernova: часть систем сгорела
context.S.totalSystemsCreated = 7;
context.S.systemCostFloor = 6; // keep престижа: индекс = выжившие - 1
assert('После престижа цена считается от выживших систем',
  context.nextSystemCostIndex() === 6 && context.systemCost(context.nextSystemCostIndex()) < priceBeforePrestige);
context.S.systems = 8; // купили новую систему после престижа
context.bumpSystemCostFloor();
assert('Новая система после престижа повышает цену', context.nextSystemCostIndex() === 7);
// Тест 3: Прайм-объекты
const prime = context.createPrimeSystem('blackHole');
assert('Создание Прайм-объекта работает', prime !== null && prime.objectKey === 'blackHole');
const perfectSys = context.generatePerfectPrimeSystem(prime);
assert('Генерация идеальной системы (8 планет)', perfectSys.planets.length === 8);
assert('Пулы планет Прайма корректны (есть Лава)', perfectSys.planets[0].type === 'lava');

// Тест 4: Флот (Верфь)
assert('Конфиг флота FLEET_CFG существует', context.FLEET_CFG !== undefined);
assert('Корабли в FLEET_CFG есть', context.FLEET_CFG.ships.interceptor !== undefined);

// Тест 5: Вторжения
context.S.invasions = [];
context.spawnInvasion();
assert('Вторжения спавнятся (массив не пуст)', context.S.invasions.length > 0);
assert(
  'У вторжения есть корабли',
  context.S.invasions[0].ships !== undefined && context.S.invasions[0].ships.length > 0
);

// Тест 5.1: Случайные события (единая подсистема)
assert('Движок случайных событий загружен', typeof context.RandomEvents === 'object' && typeof context.checkRandomEvents === 'function');
assert('Конфиг событий: есть daily и weekly пулы', !!(context.EVENTS_CFG && context.EVENTS_CFG.daily.pool.length && context.EVENTS_CFG.weekly.pool.length));
const allEventIds = context.EVENTS_CFG.daily.pool.concat(context.EVENTS_CFG.weekly.pool).map((e) => e.id);
assert('Конфиг событий: id уникальны', allEventIds.every((id, i) => allEventIds.indexOf(id) === i));
assert('Недельный план строится и детерминирован', JSON.stringify(context.RandomEvents.makeWeeklyPlan(7)) === JSON.stringify(context.RandomEvents.makeWeeklyPlan(7)));

// Тест 6: Сохранение (сериализация состояния в JSON)
try {
  saveWrites.length = 0;
  context.saveGame();
  const lastWrite = saveWrites[saveWrites.length - 1];
  const json = lastWrite ? lastWrite.value : '';
  const parsed = JSON.parse(json);
  assert('Сейв успешно сериализуется в JSON', json.length > 10 && parsed.stage === context.S.stage);
} catch (e) {
  assert('Сейв успешно сериализуется в JSON', false);
}
// Тест 7: Престиж (Вспышка Сверхновой) — окно строится при 6 системах
try {
  context.buildModal = (title, sub) =>
    '<div class="modal-title">' + title + '</div><div class="modal-sub">' + sub + '</div><div class="choices"></div>';
  context.setModal = (html) => { context.__prestigeModalHtml = html; };
  context.closeEvolutionModal = noop;

  const S = context.S;
  S.systems = 10; S.prestigeLevel = 0; S.galaxies = 1; S.galaxyMultiplier = 1;
  S.primeSystem = null; S.activeSystemIdx = 0;
  S.otherSystems = [null,
    { name: 'A', starType: 'G', systemType: 'single', planets: [] },
    { name: 'B', starType: 'K', systemType: 'single', planets: [] },
    { name: 'C', starType: 'A', systemType: 'single', planets: [] },
    { name: 'D', starType: 'M', systemType: 'single', planets: [] },
    { name: 'E', starType: 'G', systemType: 'single', planets: [] }];

  context.__prestigeModalHtml = '';
  context.activateSupernova();
  const html = String(context.__prestigeModalHtml);
  assert(
    'Престиж: при 10 системах открывается окно Вспышки',
    html.indexOf('ВСПЫШКА СВЕРХНОВОЙ') !== -1 &&
    html.indexOf('Систем после') !== -1 &&
    html.indexOf('undefined') === -1 &&
    html.indexOf('NaN') === -1
  );
} catch (e) {
  console.error('   престиж: ' + e.message);
  assert('Престиж: при 10 системах открывается окно Вспышки', false);
}
// Тест 9: лестница престижа продолжается после 5-й вспышки
// (раньше требования заканчивались, и квест «До престижа» пропадал)
try {
  const S = context.S;
  const reqs = context.prestigeRequirements();
  assert(
    'Престиж: лестница продолжается и растёт шагом 1.6',
    reqs.length > 5 && reqs[0] === 10 && reqs[1] === 16 &&
    reqs[5] > reqs[4] && reqs[6] > reqs[5]
  );
  S.prestigeLevel = 5;
  S.systems = reqs[5] - 1;
  assert('Престиж: 6-я вспышка требует больше систем', context.checkPrestigeAvailability() === 0);
  S.systems = reqs[5];
  assert('Престиж: 6-я вспышка доступна на пороге', context.checkPrestigeAvailability() === 6);
  S.prestigeLevel = 6;
  S.systems = reqs[6] - 1;
  assert(
    'Престиж: 7-я вспышка требует больше, чем 6-я',
    context.checkPrestigeAvailability() === 0 && context.prestigeRequirementFor(6) === reqs[6]
  );
} catch (e) {
  console.error('   prestige ladder: ' + e.message);
  assert('Престиж: лестница продолжается после 5-й вспышки', false);
}
// Тест 10: кривая множителя престижа шагом ×1.6.
try {
  const fn = context.prestigeMultiplierFor;
  assert('Престиж: множитель начинается с ×1', Math.abs(fn(0) - 1) < 1e-9);
  assert(
    'Престиж: на 12-й галактике множитель ×100–×400',
    fn(11) > 100 && fn(11) < 400
  );
  assert(
    'Престиж: множитель растёт и упирается в потолок',
    fn(20) > fn(11) && fn(500) <= 1e6 && fn(500) > fn(20)
  );
} catch (e) {
  console.error('   prestige multiplier: ' + e.message);
  assert('Престиж: мягкая кривая множителя', false);
}
// Тест 8: кнопка полного экрана присутствует и подключена
try {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const uiCode = fs.readFileSync(path.join(__dirname, '..', 'js/ui.js'), 'utf8');
  const mainCode = fs.readFileSync(path.join(__dirname, '..', 'js/main.js'), 'utf8');
  assert('Полный экран: кнопка ⛶ есть в верхнем HUD', /id="fullscreenBtn"/.test(html));
  assert('Полный экран: SDK Telegram загружается по верному пути', /@twa-dev\/sdk@8\.0\.2\/dist\/telegram-web-apps\.js/.test(html) && !/telegram-web-app\.js/.test(html));
  assert('Полный экран: кнопка подключена в ui.js', /getElementById\('fullscreenBtn'\)/.test(uiCode));
  assert('Полный экран: в main.js есть нативный Fullscreen API', /_nativeFullscreen/.test(mainCode) && /requestFullscreen\(/.test(mainCode));
} catch (e) {
  console.error('   fullscreen: ' + e.message);
  assert('Полный экран: кнопка ⛶ есть в верхнем HUD', false);
}

console.log('========================================');
console.log(`ИТОГО: Пройдено ${passed}, Провалено ${failed}`);
if (failed > 0) process.exit(1); // Возвращаем ошибку, если есть провалы
