// ═══════════════════════════════════════════════════════════════
//  DAILY REWARD TEST — ежедневная награда и единый игровой день
//  Проверяем: кулдаун считается по serverDayIndex, а не по локальным
//  24 часам; награду нельзя забрать дважды за день; серия не откатывается
//  назад; пропущенный день сбрасывает серию; часы назад не фармят день.
//  Запуск: node tests/daily-reward-test.js
// ═══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const noop = () => {};

function makeElement() {
  return {
    style: {}, dataset: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    innerHTML: '', textContent: '', value: '', children: [],
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
    createElement: () => makeElement(),
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
    Image: function () {
      const i = makeElement();
      i.src = ''; i.width = 0; i.height = 0; i.complete = true; i.onload = null; i.onerror = null;
      return i;
    },
    toast: noop, updateUI: noop, playSFX: noop, addEvent: noop,
    setTimeout, clearTimeout, Date, Math, JSON, Set, Array, Object, Number, String,
  });
  vm.createContext(context);

  ['config.js', 'state.js', 'economy.js', 'ui.js'].forEach((f) => {
    const code = fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');
    vm.runInContext(code, context, { filename: f });
  });
  return context;
}

let passed = 0;
let failed = 0;
function assert(name, condition, extra) {
  if (condition) { console.log('✅ ' + name); passed++; }
  else { console.error('❌ ' + name + (extra !== undefined ? ' → ' + extra : '')); failed++; }
}

const g = createGame();
const S = g.S;
const DAY_MS = 86400000;
const dayIdx = (ts) => g.serverDayIndex(ts);
const now = Date.now();
const today = dayIdx(now);

function setSave(rw) {
  S.dailyReward = Object.assign({ day: 0, lastClaimed: 0, lastClaimedDay: 0 }, rw || {});
}
function status(ts) {
  return g.dailyRewardStatus(ts === undefined ? now : ts);
}

// ─── 1. Формула награды (одна для клиента и сервера) ─────────────
{
  const rates = { dust: 10, energy: 2, civ: 0.001 };
  const d0 = g.dailyRewardFor(0, rates, 3);
  assert('День 1: пыль = 4 часа дохода', d0.type === 'dust' && d0.amount === 10 * 3600 * 4, d0.amount);
  const d1 = g.dailyRewardFor(1, rates, 3);
  assert('День 2: энергия = 4 часа дохода', d1.type === 'energy' && d1.amount === 2 * 3600 * 4);
  const d3 = g.dailyRewardFor(3, rates, 3);
  assert('День 4: металлы = 1000 × систем', d3.type === 'metal' && d3.amount === 3000, d3.amount);
  assert('День 5: автооборона', g.dailyRewardFor(4, rates, 1).type === 'defense');
  assert('День 6: щит', g.dailyRewardFor(5, rates, 1).type === 'shield');
  assert('День 7: трофей', g.dailyRewardFor(6, rates, 1).type === 'trophy');
  assert('День за пределами цикла зажимается', g.dailyRewardFor(99, rates, 1).type === 'trophy');
  const min = g.dailyRewardFor(0, { dust: 0, energy: 0, civ: 0 }, 1);
  assert('Нулевой доход: минимум 50 000 пыли', min.amount === 50000, min.amount);
}

// ─── 2. Новый игрок ─────────────────────────────────────────────
{
  setSave({});
  const st = status();
  assert('Новый сейв: награда доступна', st.canClaim === true);
  assert('Новый сейв: начинаем с 1-го дня', st.day === 0);
  assert('Новый сейв: день не забран', st.claimedDay === 0);
}

// ─── 3. Один раз за игровой день (главный баг) ──────────────────
{
  setSave({});
  const first = g.claimDailyReward();
  assert('Забор награды: успех', first === true);
  assert('После забора: серия = день 2', S.dailyReward.day === 1, S.dailyReward.day);
  assert('После забора: записан номер дня', S.dailyReward.lastClaimedDay === today, S.dailyReward.lastClaimedDay);
  const second = g.claimDailyReward();
  assert('Повторный забор в тот же день запрещён', second === false);
  assert('Повтор не сдвинул серию', S.dailyReward.day === 1, S.dailyReward.day);
  const st = status();
  assert('Статус: сегодня уже забрано', st.canClaim === false);
}

// ─── 4. Баг «день 3 → день 2» на втором устройстве ──────────────
{
  setSave({ day: 2, lastClaimed: now - 5 * 60000, lastClaimedDay: today });
  const st = status();
  assert('Второе устройство: день 3 уже забран сегодня', st.canClaim === false);
  assert('Второе устройство: серия остаётся днём 3', st.day === 2, st.day);
  const res = g.claimDailyReward();
  assert('Второе устройство не может забрать «день 2»', res === false);
  assert('Серия не откатилась назад', S.dailyReward.day === 2, S.dailyReward.day);
}

// ─── 5. Следующий игровой день ──────────────────────────────────
{
  setSave({ day: 1, lastClaimed: now - DAY_MS, lastClaimedDay: today - 1 });
  const st = status();
  assert('Новый день: награда доступна', st.canClaim === true);
  assert('Новый день: серия продолжается', st.day === 1, st.day);
  assert('Новый день: серия не сброшена', st.streakBroken === false);
}

// ─── 6. Пропущенный день сбрасывает серию ───────────────────────
{
  setSave({ day: 4, lastClaimed: now - 3 * DAY_MS, lastClaimedDay: today - 3 });
  const st = status();
  assert('Пропуск: награда доступна', st.canClaim === true);
  assert('Пропуск: серия сброшена', st.streakBroken === true);
  assert('Пропуск: начинаем с 1-го дня', st.day === 0);
  g.checkDailyRewards();
  assert('checkDailyRewards сбрасывает day в сейве', S.dailyReward.day === 0, S.dailyReward.day);
}

// ─── 7. Часы назад — день не фармится ───────────────────────────
{
  setSave({ day: 2, lastClaimed: now, lastClaimedDay: today + 1 });
  const st = status();
  assert('Часы назад: забор запрещён', st.canClaim === false);
  assert('Часы назад: серия сохранена', st.day === 2, st.day);
  assert('Часы назад: claimDailyReward отказывает', g.claimDailyReward() === false);
}

// ─── 8. Переход недели ──────────────────────────────────────────
{
  setSave({ day: 6, lastClaimed: now - DAY_MS, lastClaimedDay: today - 1 });
  const res = g.claimDailyReward();
  assert('7-й день забран', res === true);
  assert('После 7-го дня цикл начинается заново', S.dailyReward.day === 0, S.dailyReward.day);
}

// ─── 9. Старый сейв без lastClaimedDay ──────────────────────────
{
  setSave({ day: 2, lastClaimed: now - 60000 });
  const st = status();
  assert('Старый сейв: день выводится из timestamp', st.claimedDay === today, st.claimedDay);
  assert('Старый сейв: повторный забор запрещён', st.canClaim === false);
}

// ─── 10. Кулдаун не зависит от произвольных 24 ч ────────────────
{
  // Вчерашний забор 25 часов назад: с точки зрения «24 ч» — доступно,
  // с точки зрения игрового дня — тоже доступно (день сменился).
  setSave({ day: 1, lastClaimed: now - 25 * 3600 * 1000, lastClaimedDay: today - 1 });
  assert('25 ч назад (прошлый игровой день): доступно', status().canClaim === true);
  // Забор 23 часа назад, но вчерашним игровым днём: новый день уже наступил.
  setSave({ day: 1, lastClaimed: now - 23 * 3600 * 1000, lastClaimedDay: today - 1 });
  assert('23 ч назад, но вчера: доступно по игровому дню', status().canClaim === true);
}

console.log('\n' + (failed === 0 ? '✅' : '❌') + ' ИТОГО: ' + passed + ' пройдено, ' + failed + ' провалено');
process.exit(failed === 0 ? 0 : 1);
