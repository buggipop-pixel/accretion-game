// ═══════════════════════════════════════════════════════════════
//  PRESTIGE × WORLD EVENTS TEST
//  Вспышка сверхновой не должна обнулять/обновлять таймеры мировых
//  событий (ежедневных и еженедельных), т.к. они живут по реальному
//  времени, а не по прогрессу игрока.
//  Запуск: node tests/prestige-world-events-test.js
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

async function testSupernovaKeepsWorldEvents() {
  const g = createGame();
  const S = g.S;
  const R = g.RandomEvents;

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

  const now = Date.now();
  const week = R.weekIndex(now);
  const today = R.dayIndex(now);
  const weekEndsAt = now + 6 * 3600 * 1000;
  const dailyEndsAt = now + 2 * 3600 * 1000;

  // Активное «День Раздора» + ежедневный баф + уже истёкшее событие.
  S.activeWorldEvents = [
    { id: 'week_discord', tier: 'weekly', startedAt: now - 3600 * 1000, endsAt: weekEndsAt },
    { id: 'trade_boom', tier: 'daily', startedAt: now - 3600 * 1000, endsAt: dailyEndsAt },
    { id: 'golden_hour', tier: 'daily', startedAt: now - 10 * 3600 * 1000, endsAt: now - 1000 },
  ];
  S.lastWeeklyEventWeek = week;
  S.weeklyEventPlan = { week: week, dayOffset: 0, eventId: 'week_discord' };
  S.lastDailyEventDay = today;

  g.performSupernova(1);
  await wait(1700);

  const weekly = S.activeWorldEvents.filter((e) => e && e.tier === 'weekly');
  assert('Вспышка: недельное событие не потеряно',
    weekly.length === 1 && weekly[0].id === 'week_discord',
    JSON.stringify(S.activeWorldEvents));
  assert('Вспышка: таймер «Дня Раздора» НЕ обновлён',
    weekly.length === 1 && weekly[0].endsAt === weekEndsAt,
    weekly.length ? String(weekly[0].endsAt - weekEndsAt) : 'нет события');

  const daily = S.activeWorldEvents.find((e) => e && e.id === 'trade_boom');
  assert('Вспышка: ежедневное событие не потеряно', !!daily);
  assert('Вспышка: таймер ежедневного события НЕ обновлён',
    !!daily && daily.endsAt === dailyEndsAt);

  assert('Вспышка: истёкшее событие отброшено',
    !S.activeWorldEvents.some((e) => e && e.id === 'golden_hour'));

  assert('Вспышка: маркер недели сохранён',
    S.lastWeeklyEventWeek === week, String(S.lastWeeklyEventWeek));
  assert('Вспышка: маркер дня сохранён',
    S.lastDailyEventDay === today, String(S.lastDailyEventDay));
  assert('Вспышка: план недели сохранён',
    !!S.weeklyEventPlan && S.weeklyEventPlan.week === week && S.weeklyEventPlan.eventId === 'week_discord');

  // Планировщик на том же тике не должен переиздать событие заново.
  R.checkWeekly(now);
  const weeklyAfter = S.activeWorldEvents.filter((e) => e && e.tier === 'weekly');
  assert('checkWeekly: событие не переиздано и таймер не сброшен',
    weeklyAfter.length === 1 && weeklyAfter[0].endsAt === weekEndsAt,
    JSON.stringify(weeklyAfter));

  R.checkDaily(now);
  const dailyAfter = S.activeWorldEvents.find((e) => e && e.id === 'trade_boom');
  assert('checkDaily: таймер события дня не сброшен',
    !!dailyAfter && dailyAfter.endsAt === dailyEndsAt);
}

testSupernovaKeepsWorldEvents().then(() => {
  console.log('\n' + (failed === 0 ? '✅ Все тесты пройдены' : '❌ Провалов: ' + failed) + ' (' + passed + ' проверок)');
  process.exit(failed === 0 ? 0 : 1);
}).catch((err) => {
  console.error('💥 Ошибка теста:', err);
  process.exit(1);
});
