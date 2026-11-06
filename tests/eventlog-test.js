// ═══════════════════════════════════════════════════════════════
//  EVENTLOG TEST — разворачиваемый подробный отчёт журнала
//  Запуск: node tests/eventlog-test.js
// ═══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const noop = () => {};

function makeEl(tag) {
  const handlers = {};
  return {
    tagName: tag || 'div',
    style: {}, dataset: {}, classList: {
      add: noop, remove: noop,
      toggle: noop,
      contains: () => false,
    },
    innerHTML: '', textContent: '', value: '', children: [],
    parentElement: null,
    appendChild: noop, removeChild: noop, remove: noop,
    setAttribute: noop, getAttribute: () => null,
    addEventListener: (name, fn) => { handlers[name] = fn; },
    removeEventListener: noop,
    querySelector: () => makeEl(), querySelectorAll: () => [],
    closest: () => null,
    __handlers: handlers,
  };
}

function createGame() {
  const body = makeEl('div');
  const badge = makeEl('div');
  const eventBtn = makeEl('button');
  const modal = makeEl('div');
  const modalBody = makeEl('div');
  const documentMock = {
    getElementById: (id) => {
      if (id === 'eventLogBody') return body;
      if (id === 'eventBadge') return badge;
      if (id === 'eventBtn') return eventBtn;
      if (id === 'eventLogModal') return modal;
      if (id === 'modal') return modalBody;
      return makeEl();
    },
    querySelector: () => makeEl(),
    querySelectorAll: () => [],
    createElement: (tag) => makeEl(tag),
    addEventListener: noop,
    removeEventListener: noop,
    body: makeEl('body'),
    documentElement: makeEl('html'),
    visibilityState: 'visible',
    hidden: false,
  };
  const context = {
    console, document: documentMock,
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop, clear: noop },
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop, clear: noop },
    setTimeout, clearTimeout, Date, Math, JSON, Set, Array, Object, Number, String, isFinite, parseInt,
    fmt: (n) => String(n),
    saveGame: noop, playSFX: noop, toast: noop,
    S: {
      eventLog: [], eventLogUnread: 0,
      activeSystemIdx: 0, systemName: 'Родная',
      otherSystems: [null, { name: '<b>Система</b>', planets: [] }],
      planets: [],
    },
    INVASION_CFG: { tiers: { raid: { label: 'Рейд' } } },
    PLANET_TYPES: { superEarth: { name: 'Земля' } },
    primeSystem: null,
  };
  context.window = context;
  context.self = context;
  context.globalThis = context;
  vm.createContext(context);
  const code = fs.readFileSync(path.join(__dirname, '../js/eventlog.js'), 'utf8');
  vm.runInContext(code, context, { filename: 'eventlog.js' });
  return { context, body, badge, eventBtn, modal };
}

let passed = 0;
let failed = 0;
function assert(name, condition) {
  if (condition) { console.log('✅ ' + name); passed++; }
  else { console.error('❌ ' + name); failed++; }
}

function testRenderExpandable() {
  const g = createGame();
  const S = g.context.S;
  g.context.addEvent('galaxy_neglect', 'Галактика в запустении ур.2', {
    meta: {
      systemIdx: 1, neglectLevel: 2, awayHours: 10, attacks: 5, defended: 1,
      lostDust: 281000000, lostEnergy: 72600, lostCiv: 12100, lostMetals: 0,
      systemsDamaged: 2, planetsDisabled: 8, shieldProtected: true,
    },
  });
  g.context.renderEventLog();
  const html = g.body.innerHTML;
  assert('Событие сохранено в журнал', S.eventLog.length === 1);
  assert('Есть разворачиваемый элемент', html.indexOf('event-item') >= 0 && html.indexOf('event-summary') >= 0);
  assert('Есть скрытый блок подробностей', html.indexOf('event-details') >= 0);
  assert('Есть шеврон раскрытия', html.indexOf('event-chevron') >= 0);
  assert('Подробности содержат уровень запустения', html.indexOf('Запустение галактики') >= 0);
  assert('Подробности содержат число атак', html.indexOf('Атак') >= 0 && html.indexOf('5') >= 0);
  assert('Подробности содержат украденную пыль', html.indexOf('Украдено пыли') >= 0);
  assert('Подробности содержат системы', html.indexOf('Повреждено систем') >= 0);
  assert('Есть кнопка перехода к событию', html.indexOf('event-nav-btn') >= 0);
}

function testLegacyEvent() {
  const g = createGame();
  const S = g.context.S;
  S.eventLog = [{ ts: Date.now(), type: 'system_formed', text: 'Основана система', icon: '🌌', color: '#b9a8ff', meta: null }];
  g.context.renderEventLog();
  const html = g.body.innerHTML;
  assert('Старое событие тоже раскрывается', html.indexOf('event-details') >= 0);
  assert('Старое событие показывает время и тип', html.indexOf('Время') >= 0 && html.indexOf('Основана система') >= 0);
}

function testOfflineDetails() {
  const g = createGame();
  g.context.addEvent('offline_income', 'Отсутствовали 8 ч', {
    meta: { awaySeconds: 8 * 3600, dustEarned: 1000, energyEarned: 200, civEarned: 5, metalsEarned: 7, lostDust: 50 },
  });
  g.context.renderEventLog();
  const html = g.body.innerHTML;
  assert('Офлайн: показано отсутствие', html.indexOf('Отсутствие') >= 0);
  assert('Офлайн: показана пыль', html.indexOf('Пыль') >= 0);
  assert('Офлайн: показана энергия', html.indexOf('Энергия') >= 0);
  assert('Офлайн: показаны потери пыли', html.indexOf('Украдено пыли') >= 0);
}

function testEscaping() {
  const g = createGame();
  g.context.addEvent('invasion_spawn', 'Атака', { meta: { systemIdx: 1, tierKey: 'raid', ships: 3 } });
  g.context.renderEventLog();
  const html = g.body.innerHTML;
  assert('Название системы экранировано в подробностях', html.indexOf('&lt;b&gt;Система&lt;/b&gt;') >= 0);
  assert('Тип атаки расшифрован', html.indexOf('Рейд') >= 0);
}

function testTierMeta() {
  const g = createGame();
  g.context.addEvent('defense_active', 'Автоборона включена', { meta: { defenseLevel: 4, hours: 10, repelPercent: 40 } });
  g.context.renderEventLog();
  const html = g.body.innerHTML;
  assert('Уровень обороны в подробностях', html.indexOf('Уровень Автобороны') >= 0);
  assert('Шанс отбития в подробностях', html.indexOf('Шанс отбития') >= 0);
}

(function run() {
  console.log('========================================');
  console.log('🧪 ТЕСТЫ ЖУРНАЛА СОБЫТИЙ');
  console.log('========================================');
  try {
    testRenderExpandable();
    testLegacyEvent();
    testOfflineDetails();
    testEscaping();
    testTierMeta();
  } catch (e) {
    console.error('💥 Упало:', e);
    failed++;
  }
  console.log('========================================');
  console.log('ИТОГО: Пройдено ' + passed + ', Провалено ' + failed);
  console.log('========================================');
  process.exit(failed > 0 ? 1 : 0);
})();
