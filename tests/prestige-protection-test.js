// ═══════════════════════════════════════════════════════════════
//  PRESTIGE PROTECTION TEST
//  Вспышка сверхновой (prestige) не должна переносить накопленные
//  металлы: иначе после сброса дохода (1300 → 300 систем) старый
//  запас покупал флот сотнями, т.к. цена корабля масштабируется от
//  текущей металлодобычи. Флот тоже сбрасывается.
//  Запуск: node tests/prestige-protection-test.js
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
    showModal: noop, hideModal: noop, updateSystemSwitcher: noop,
    playEventCinematic: noop, logPrestige: noop, initParticles: noop,
    triggerSupernovaFlash: noop, updateEventUI: noop,
    setTimeout, clearTimeout, Date, Math, JSON, Set, Array, Object, Number, String,
  });
  vm.createContext(context);

  const files = ['config.js', 'state.js', 'economy.js', 'random-events.js', 'prestige.js'];
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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function testPrestigeResetsMetalsAndFleet() {
  const g = createGame();
  const S = g.S;

  S.prestigeLevel = 0;
  S.galaxies = 1;
  S.galaxyMultiplier = 1;
  S.systems = 6;
  S.otherSystems = [null];
  S.activeSystemIdx = 0;
  S.stage = 'system';
  S.planets = [];
  S.primeSystem = null;
  S.vis = { collapse: 0 };
  // Игрок пришёл к Вспышке с огромным запасом металлов и флотом.
  S.metalAmount = 5e9;
  S.fleet = { interceptor: 40, cruiser: 12, dreadnought: 3 };
  S.fleetActive = true;

  g.performSupernova(1);
  await wait(1700);

  assert('Вспышка: металлы НЕ переносятся (0)', S.metalAmount === 0, S.metalAmount);
  assert('Вспышка: флот сброшен', !!S.fleet &&
    !Number(S.fleet.interceptor) && !Number(S.fleet.cruiser) && !Number(S.fleet.dreadnought),
    JSON.stringify(S.fleet));
  assert('Вспышка: галактика инкрементирована', S.galaxies === 2, S.galaxies);
  assert('Вспышка: уровень престижа выставлен', S.prestigeLevel === 1, S.prestigeLevel);
  assert('Вспышка: доход-множитель перенесён', Number(S.galaxyMultiplier) > 1, S.galaxyMultiplier);
  assert('Вспышка: системы пересобраны', S.systems >= 1, S.systems);
}

testPrestigeResetsMetalsAndFleet().then(() => {
  console.log('\n' + (failed === 0 ? '✅ Все тесты пройдены' : '❌ Провалов: ' + failed) + ' (' + passed + ' проверок)');
  process.exit(failed === 0 ? 0 : 1);
}).catch((err) => {
  console.error('💥 Ошибка теста:', err);
  process.exit(1);
});
