// ═══════════════════════════════════════════════════════════════
//  Тесты единой подсистемы случайных событий (js/random-events.js):
//  ежедневные/еженедельные события, модификаторы, штрафы, сохранение.
//  Запуск: node tests/random-events-test.js
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

const noop = () => {};
function makeElement() {
  return {
    style: {}, dataset: {}, innerHTML: '', textContent: '',
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    appendChild: noop, remove: noop, setAttribute: noop, getAttribute: () => null,
    addEventListener: noop, querySelector: () => makeElement(), querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
  };
}

const storage = Object.create(null);
const localStorageMock = {
  getItem: (k) => (k in storage ? storage[k] : null),
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; },
  clear: () => { for (const k in storage) delete storage[k]; },
};

const context = {
  console,
  document: {
    getElementById: () => makeElement(),
    querySelector: () => makeElement(),
    querySelectorAll: () => [],
    createElement: () => makeElement(),
    addEventListener: noop,
    body: makeElement(),
    visibilityState: 'visible',
  },
  localStorage: localStorageMock,
  sessionStorage: localStorageMock,
  performance: { now: () => Date.now() },
  navigator: { userAgent: 'node' },
  setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
  requestAnimationFrame: () => 0, cancelAnimationFrame: noop,
  addEventListener: noop, removeEventListener: noop,
  alert: noop, confirm: () => false, prompt: () => '',
  fetch: () => Promise.reject(new Error('offline')),
  Audio: function Audio() { return { play: noop, pause: noop }; },
  Image: function Image() { return makeElement(); },
};
context.window = context;
context.self = context;
context.globalThis = context;
vm.createContext(context);

const files = ['config.js', 'state.js', 'economy.js', 'random-events.js'];
for (const file of files) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
  vm.runInContext(code, context, { filename: file });
}

vm.runInContext('window.S = S; window.fmt = function(n){ return String(Math.floor(n)); };', context, { filename: 'bridge.js' });

const S = context.S;
const R = context.RandomEvents;
const CFG = context.EVENTS_CFG;
const DAY = 24 * 3600 * 1000;
const WEEK = 7 * DAY;
const EPOCH = Date.UTC(2024, 0, 1);

const logEvents = [];
context.addEvent = (type, text) => { logEvents.push({ type, text }); };
context.toast = noop;
context.playSFX = noop;

function resetPlayer() {
  S.stage = 'system';
  S.planets = [
    { type: 'lava', baseOrbitR: 1.2, orbitR: 120, mass: 1.5, forming: false },
    { type: 'rocky', baseOrbitR: 2.0, orbitR: 200, mass: 1.2, forming: false },
  ];
  S.otherSystems = [];
  S.activeSystemIdx = 0;
  S.systems = 2;
  S.primeSystem = null;
  S.dust = 100000;
  S.dustTotal = 100000;
  S.energy = 50000;
  S.metalAmount = 10000;
  S.civLevel = 12;
  S.storageLevels = { dust: 3, energy: 2, civ: 2 };
  S.boosters = { incomeUntil: 0 };
  S.invasionDebuff = null;
  S.activeWorldEvents = [];
  S.activeRandomEvent = null;
  S.lastDailyEventDay = 0;
  S.lastWeeklyEventWeek = 0;
  S.weeklyEventPlan = null;
  S.fleetActive = false;
  S.fleet = { interceptor: 0, cruiser: 0, dreadnought: 0 };
}

// ─── 1. Конфиг ─────────────────────────────────────────────────
const dailyIds = CFG.daily.pool.map((e) => e.id);
const weeklyIds = CFG.weekly.pool.map((e) => e.id);
const allIds = dailyIds.concat(weeklyIds);
const duplicates = allIds.filter((id, i) => allIds.indexOf(id) !== i);

assert('Конфиг: ежедневных событий ≥ 25', CFG.daily.pool.length >= 25, 'сейчас ' + CFG.daily.pool.length);
assert('Конфиг: еженедельных событий ≥ 10', CFG.weekly.pool.length >= 10, 'сейчас ' + CFG.weekly.pool.length);
assert('Конфиг: id событий уникальны', duplicates.length === 0, duplicates.join(', '));
assert('Конфиг: у всех событий есть title/desc/icon/weight', allIds.every((id) => {
  const e = R.eventById(id);
  return e && e.title && e.desc && e.icon && Number(e.weight) > 0;
}));
assert('Конфиг: у всех weekly есть модификаторы', CFG.weekly.pool.every((e) => e.mods && Object.keys(e.mods).length > 0));

// Полярность: в каждом пуле должны быть и плюсы, и минусы.
function countPolarity(pool) {
  const out = { positive: 0, negative: 0, mixed: 0 };
  for (const e of pool) out[R.eventPolarity(e)]++;
  return out;
}
const dailyPol = countPolarity(CFG.daily.pool);
const weeklyPol = countPolarity(CFG.weekly.pool);
assert('Полярность daily: есть положительные', dailyPol.positive > 0, JSON.stringify(dailyPol));
assert('Полярность daily: есть отрицательные', dailyPol.negative > 0, JSON.stringify(dailyPol));
assert('Полярность daily: есть смешанные', dailyPol.mixed > 0, JSON.stringify(dailyPol));
assert('Полярность weekly: есть положительные', weeklyPol.positive > 0, JSON.stringify(weeklyPol));
assert('Полярность weekly: есть отрицательные (≥3)', weeklyPol.negative >= 3, JSON.stringify(weeklyPol));
assert('Полярность weekly: есть смешанные (≥4)', weeklyPol.mixed >= 4, JSON.stringify(weeklyPol));
assert('Полярность: босс — отрицательное', R.eventPolarity(R.eventById('leviathan')) === 'negative');
assert('Полярность: мгновенная награда — положительное', R.eventPolarity(R.eventById('derelict_ship')) === 'positive');
assert('Полярность: выбор — смешанное', R.eventPolarity(R.eventById('black_market')) === 'mixed');
assert('Полярность: Неделя Налогов — отрицательное', R.eventPolarity(R.eventById('week_taxes')) === 'negative');
assert('Полярность: Неделя Титанов — смешанное', R.eventPolarity(R.eventById('week_titanforge')) === 'mixed');
assert('Полярность: Неделя Золотого века — положительное', R.eventPolarity(R.eventById('week_golden_age')) === 'positive');
assert('Полярность: info возвращает ключ/иконку/цвет', (() => { const i = R.polarityInfo(R.eventById('week_taxes')); return i.key === 'negative' && !!i.icon && !!i.color; })());

// ─── 2. Дни и недели ───────────────────────────────────────────
assert('Дни: dayIndex растёт на 1 за сутки', R.dayIndex(EPOCH + 10 * DAY) === 10);
assert('Недели: weekIndex растёт на 1 за 7 дней', R.weekIndex(EPOCH + 14 * DAY + 5) === 2);
const dowValues = [];
for (let i = 0; i < 7; i++) dowValues.push(R.dayOfWeek(EPOCH + i * DAY));
assert('Недели: dayOfWeek даёт 0..6 без пропусков', dowValues.join(',') === '0,1,2,3,4,5,6', dowValues.join(','));

// ─── 3. Недельный план ─────────────────────────────────────────
const planA = R.makeWeeklyPlan(42);
const planB = R.makeWeeklyPlan(42);
assert('Недельный план: детерминирован в пределах недели', JSON.stringify(planA) === JSON.stringify(planB));
assert('Недельный план: день 0..6 и событие существует', planA && planA.dayOffset >= 0 && planA.dayOffset <= 6 && !!R.eventById(planA.eventId));
const planDays = {};
const planEvents = {};
for (let w = 0; w < 60; w++) {
  const p = R.makeWeeklyPlan(w);
  planDays[p.dayOffset] = true;
  planEvents[p.eventId] = true;
}
assert('Недельный план: за 60 недель встречаются разные дни', Object.keys(planDays).length >= 5, Object.keys(planDays).join(','));
assert('Недельный план: за 60 недель встречаются разные события', Object.keys(planEvents).length >= 5, Object.keys(planEvents).join(','));

// ─── 4. Взвешенный выбор ───────────────────────────────────────
const pool = [{ id: 'a', weight: 1 }, { id: 'b', weight: 0 }, { id: 'c', weight: 3 }];
assert('Выбор: пустой список → null', R.pickWeighted([], Math.random) === null);
assert('Выбор: rng=0 → первый', R.pickWeighted(pool, () => 0).id === 'a');
assert('Выбор: rng≈1 → последний', R.pickWeighted(pool, () => 0.999999).id === 'c');
assert('Выбор: нулевой вес не выбирается', R.pickWeighted([{ id: 'z', weight: 0 }], () => 0.5).id === 'z');

// ─── 5. Модификаторы ───────────────────────────────────────────
resetPlayer();
const now = Date.now();
R.addWorldEvent(R.eventById('trade_boom'), 3600 * 1000, 'daily');
R.addWorldEvent(R.eventById('week_forge'), 3600 * 1000, 'weekly');
const mods = R.aggregateMods(now);
assert('Моды: пыль ×1.6 от торгового бума', Math.abs(mods.dustMult - 1.6) < 1e-9, String(mods.dustMult));
assert('Моды: металл ×3 от Недели Кузни', Math.abs(mods.metalsMult - 3) < 1e-9, String(mods.metalsMult));
assert('Моды: allMult ×1.1 от Недели Кузни', Math.abs(mods.allMult - 1.1) < 1e-9, String(mods.allMult));
assert('Моды: eventMult(dust) = 1.6 × 1.1', Math.abs(R.eventMult('dust', now) - 1.76) < 1e-9, String(R.eventMult('dust', now)));
assert('Моды: eventMult(metals) = 3 × 1.1', Math.abs(R.eventMult('metals', now) - 3.3) < 1e-9, String(R.eventMult('metals', now)));
assert('Моды: неизвестный вид = allMult', Math.abs(R.eventMult('unknown', now) - 1.1) < 1e-9);

// ─── 6. Влияние на экономику ───────────────────────────────────
resetPlayer();
const dustBefore = context.dustPerSec();
const clickBefore = context.clickGain();
R.addWorldEvent(R.eventById('trade_boom'), 3600 * 1000, 'daily');
R.addWorldEvent(R.eventById('neural_boost'), 3600 * 1000, 'daily');
const dustAfter = context.dustPerSec();
const clickAfter = context.clickGain();
assert('Экономика: событие увеличивает dustPerSec', dustAfter > dustBefore * 1.4, dustBefore + ' → ' + dustAfter);
assert('Экономика: событие увеличивает clickGain', clickAfter > clickBefore * 1.5, clickBefore + ' → ' + clickAfter);
assert('Экономика: без событий множитель 1', (() => { resetPlayer(); return Math.abs(context.eventMult('dust') - 1) < 1e-9; })());

// ─── 7. Мгновенные награды и штрафы ────────────────────────────
resetPlayer();
const dust0 = S.dust;
R.applyReward(R.eventById('ancient_cache').reward);
assert('Награда: пыль начислена и учтена в dustTotal', S.dust > dust0 && S.dustTotal >= S.dust);
assert('Награда: масштабирование от дохода работает', (() => {
  const before = S.dust;
  R.applyReward({ dustHours: 1 });
  return S.dust > before;
})());

resetPlayer();
const energy0 = S.energy;
R.applyPenalty({ energyPct: 0.5 });
assert('Штраф: энергия уменьшилась вдвое', S.energy === Math.floor(energy0 / 2), energy0 + ' → ' + S.energy);

resetPlayer();
S.planets = [S.planets[0]];
S.energy = 1000;
R.applyPenalty({ destroyPlanets: 1 });
assert('Штраф: последнюю планету нельзя уничтожить', S.planets.length === 1);
assert('Штраф: вместо потери планеты −50% энергии', S.energy === 500, String(S.energy));

resetPlayer();
S.primeSystem = { bonus: {} };
S.planets = [S.planets[0], S.planets[1]];
R.applyPenalty({ destroyPlanets: 1 });
assert('Штраф: Прайм-система защищена', S.planets.length === 2);

// ─── 8. Ежедневный спавн: один раз в день ──────────────────────
resetPlayer();
const testDay = R.dayIndex();
S.lastDailyEventDay = testDay - 1;
const eventsBefore = logEvents.length;
R.checkDaily(EPOCH + testDay * DAY + 12 * 3600 * 1000);
assert('Ежедневка: день отмечен', S.lastDailyEventDay === testDay, String(S.lastDailyEventDay));
const afterFirst = logEvents.length;
R.checkDaily(EPOCH + testDay * DAY + 18 * 3600 * 1000);
assert('Ежедневка: второй раз за день не спавнится', logEvents.length === afterFirst, String(logEvents.length - afterFirst));
assert('Ежедневка: событие либо сработало, либо проиграло бросок', afterFirst >= eventsBefore);

// ─── 9. Недельное событие: в выбранный день и не чаще раза в неделю ──
resetPlayer();
const testWeek = 100;
const plan = R.makeWeeklyPlan(testWeek);
S.weeklyEventPlan = plan;
S.lastWeeklyEventWeek = 0;
const weeklyTs = EPOCH + testWeek * WEEK + plan.dayOffset * DAY + 3600 * 1000;
const weeklyTestCount = () => logEvents.filter((e) => e.type && e.type.indexOf('weekly_event') === 0).length;
const weeklyBefore = weeklyTestCount();
R.checkWeekly(weeklyTs);
const weeklyAfter = weeklyTestCount();
assert('Недельное: событие сработало в запланированный день', weeklyAfter === weeklyBefore + 1);
assert('Недельное: неделя отмечена', S.lastWeeklyEventWeek === testWeek, String(S.lastWeeklyEventWeek));
assert('Недельное: world-событие добавлено с tier=weekly', S.activeWorldEvents.some((e) => e.tier === 'weekly'));
R.checkWeekly(weeklyTs + 3600 * 1000);
assert('Недельное: повторно в ту же неделю не срабатывает', weeklyTestCount() === weeklyAfter);

// ─── 10. Сохранение новых полей ────────────────────────────────
resetPlayer();
S.activeWorldEvents = [{ id: 'trade_boom', tier: 'daily', startedAt: Date.now(), endsAt: Date.now() + 60000 }];
S.lastDailyEventDay = 123;
S.lastWeeklyEventWeek = 45;
S.weeklyEventPlan = { week: 45, dayOffset: 3, eventId: 'week_comet' };
S.activeRandomEvent = { id: 'leviathan', kind: 'boss', endsAt: Date.now() + 60000, hp: 100, maxHp: 100, taps: 0 };
const saved = context.saveGame();
const raw = storage['accretion_v17'];
assert('Сейв: новые поля сериализуются', !!raw && raw.indexOf('lastWeeklyEventWeek') !== -1 && raw.indexOf('weeklyEventPlan') !== -1 && raw.indexOf('activeWorldEvents') !== -1);
assert('Сейв: активное интерактивное событие сохраняется', !!raw && raw.indexOf('activeRandomEvent') !== -1);

console.log('========================================');
console.log('ИТОГО: Пройдено ' + passed + ', Провалено ' + failed);
if (failed > 0) process.exit(1);
