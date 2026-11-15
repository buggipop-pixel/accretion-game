// ═══════════════════════════════════════════════════════════════
//  LIVE WORLD TEST — «живой мир» без клиента.
//
//  Серверный тик (lib/game-core.js: worldTick) должен сам двигать
//  экономику, вторжения и ежедневные события, пока игрок офлайн:
//  доход с fromMs, идемпотентность по now, накопление волн и
//  детерминированное срабатывание дневного события.
//
//  Запуск: node tests/live-world-test.js
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

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
// Единый серверный день сдвинут на 01:00 UTC (04:00 МСК) — как в js/config.js.
const DEFAULT_EPOCH = Date.UTC(2024, 0, 1, 1);

// ─── Конфиг игры в vm: эпоха дней и id событий ─────────────────
const noop = () => {};
function makeElement() {
  return {
    style: {}, dataset: {},
    classList: { add: noop, remove: noop, contains: () => false },
    innerHTML: '', appendChild: noop, addEventListener: noop,
    querySelector: () => makeElement(), querySelectorAll: () => [],
    getContext: () => null,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
    getAttribute: () => null, setAttribute: noop,
  };
}

function loadConfig() {
  const storage = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop };
  const context = {
    console: { log: noop, warn: noop, error: noop },
    document: {
      getElementById: () => makeElement(), querySelector: () => makeElement(),
      querySelectorAll: () => [], createElement: () => makeElement(),
      addEventListener: noop, body: makeElement(), visibilityState: 'visible',
    },
    localStorage: storage,
    sessionStorage: storage,
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
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '../js/config.js'), 'utf8'),
    context,
    { filename: 'config.js' }
  );
  return {
    events: context.EVENTS_CFG,
    epoch: (typeof context.GAME_DAY_EPOCH === 'number') ? context.GAME_DAY_EPOCH : DEFAULT_EPOCH,
  };
}

const CONFIG = loadConfig();

function dayIndex(ts) { return Math.floor((ts - CONFIG.epoch) / DAY_MS); }
function weekIndex(ts) { return Math.floor((ts - CONFIG.epoch) / WEEK_MS); }

// Гарантированно «хорошее» событие с плоской наградой (не зависит от дохода).
function pickGoodEvent() {
  const pool = (CONFIG.events.daily && CONFIG.events.daily.pool) || [];
  const evt = pool.find((e) => e && e.kind === 'good' && e.reward &&
    (Number(e.reward.metals) > 0 || Number(e.reward.energy) > 0 || Number(e.reward.dust) > 0 ||
     Number(e.reward.civ) > 0));
  if (!evt) throw new Error('в EVENTS_CFG.daily.pool нет хорошего события с наградой');
  return evt;
}

function pickInteractiveEvent() {
  const pool = (CONFIG.events.daily && CONFIG.events.daily.pool) || [];
  const evt = pool.find((e) => e && (e.kind === 'boss' || e.kind === 'tap' || e.kind === 'choice'));
  if (!evt) throw new Error('в EVENTS_CFG.daily.pool нет интерактивного события');
  return evt;
}

// ─── Образец сейва: стадия «система», планеты не формируются ──
function planet(seed) {
  return {
    type: 'superEarth', baseOrbitR: 100, orbitR: 100, mass: 1, diameter: 1,
    forming: false, seed: seed || 1, civLevel: 0,
  };
}

function otherSystem(name, seed) {
  return {
    name: name, starType: 'G', systemType: 'single', incomeBonus: 0,
    planets: [planet(seed), planet(seed + 1), planet(seed + 2)],
  };
}

function makeSave(overrides) {
  const now = Date.now();
  const base = {
    stage: 'system',
    starType: 'G',
    systemType: 'single',
    systems: 3,
    totalSystemsCreated: 3,
    galaxyMultiplier: 1.2,
    prestigeLevel: 1,
    gammaDebuff: 0,
    systemIncomeBonus: 0.15,
    dust: 5000,
    dustTotal: 5000,
    energy: 200,
    metalAmount: 0,
    civLevel: 12,
    storageLevels: { dust: 3, energy: 2, civ: 2 },
    techLevels: { astro: 0, quantum: 0, cyber: 0, eng: 0 },
    primeSystem: null,
    activeSystemIdx: 0,
    otherSystems: [null, otherSystem('A', 10)],
    planets: [planet(1), planet(2), planet(3)],
    boosters: { incomeUntil: 0 },
    lastTick: now - HOUR_MS,
    worldTickAt: 0,
    worldAttackAccumSec: 0,
    lastDailyEventDay: 0,
    lastWeeklyEventWeek: 0,
    activeRandomEvent: null,
    activeWorldEvents: [],
    invasionDebuff: null,
    shieldUntil: 0,
    fleet: { interceptor: 0, cruiser: 0, dreadnought: 0 },
    fleetActive: false,
    invasions: [],
  };
  return Object.assign(base, overrides || {});
}

// «Сейчас» внутри текущего игрового дня: сдвиг на +1 ч в тесте
// не должен пересекать границу дня (иначе дневной бросок законен).
function nowInsideGameDay() {
  let now = Date.now();
  const day = dayIndex(now);
  const nextBoundary = CONFIG.epoch + (day + 1) * DAY_MS;
  if (nextBoundary - now < 2 * HOUR_MS) now = nextBoundary - 3 * HOUR_MS;
  return now;
}

(async () => {
  const { createGameCore } = await import('../lib/game-core.js');
  const core = createGameCore();

  console.log('========================================');
  console.log('🧪 ТЕСТЫ ЖИВОГО МИРА (серверный тик без клиента)');
  console.log('========================================');
  let firstTickData = null;

  // ── 1. Доход от fromMs и якорь worldTickAt ──────────────────
  {
    const now = Date.now();
    const save = makeSave({ lastTick: now - HOUR_MS, worldTickAt: 0 });
    const beforeDust = save.dust;
    const res = core.worldTick(save, { now: now, fromMs: now - HOUR_MS, skipEvents: true });

    assert('Тик вернул результат', !!res, String(res));
    if (res) {
      assert('elapsedSec = 3600 (час от fromMs)', res.elapsedSec === 3600, String(res.elapsedSec));
      assert('Доход пыли начислен от fromMs', res.data.dust > beforeDust,
        `${beforeDust} → ${res.data.dust}`);
      assert('worldTickAt выставлен в now', res.data.worldTickAt === now,
        `${res.data.worldTickAt} !== ${now}`);
      firstTickData = res.data;
    }
  }

  // ── 2. Два тика с одинаковым now идемпотентны ───────────────
  if (firstTickData) {
    const now = firstTickData.worldTickAt;
    const second = core.worldTick(firstTickData, { now: now, skipEvents: true });

    assert('Повторный тик вернул результат', !!second, String(second));
    if (second) {
      assert('Повторный тик без времени не начисляет доход',
        second.data.dust === firstTickData.dust, `${firstTickData.dust} → ${second.data.dust}`);
      assert('Повторный тик: worldTickAt не сдвинулся',
        second.data.worldTickAt === now, String(second.data.worldTickAt));
      assert('Повторный тик: elapsedSec = 0', second.elapsedSec === 0, String(second.elapsedSec));
    }
  }

  // ── 3. skipEvents не трогает дневной счётчик ────────────────
  {
    const now = Date.now();
    const save = makeSave({ lastDailyEventDay: 0, worldTickAt: 0 });
    const res = core.worldTick(save, { now: now, fromMs: now - 60000, skipEvents: true });
    assert('skipEvents: тик вернул результат', !!res, String(res));
    if (res) {
      assert('skipEvents: дневное событие не бросалось', res.world.daily === null,
        JSON.stringify(res.world.daily));
      assert('skipEvents: lastDailyEventDay не изменён',
        res.data.lastDailyEventDay === 0, String(res.data.lastDailyEventDay));
    }
  }

  // ── 4. Живой тик сам бросает дневное событие ────────────────
  const dayNow = nowInsideGameDay();
  const expectedDay = dayIndex(dayNow);
  let liveData = null;
  {
    const save = makeSave({ lastDailyEventDay: 0, lastWeeklyEventWeek: weekIndex(dayNow) });
    const res = core.worldTick(save, { now: dayNow, fromMs: dayNow - 60000 });
    assert('Живой тик вернул результат', !!res, String(res));
    if (res) {
      assert('Живой тик бросает дневное событие без клиента',
        res.data.lastDailyEventDay === expectedDay,
        `${res.data.lastDailyEventDay} !== ${expectedDay}`);
      liveData = res.data;
    }
  }

  // ── 5. Дневной бросок — раз в игровой день + fireWorldEvent ─
  {
    assert('Есть данные после первого живого тика', !!liveData);
    if (liveData) {
      const beforeDay = liveData.lastDailyEventDay;
      const second = core.worldTick(liveData, { now: dayNow + HOUR_MS });
      assert('Второй тик через час вернул результат', !!second, String(second));
      if (second) {
        assert('Дневное событие не бросается второй раз за день',
          second.world.daily === null, JSON.stringify(second.world.daily));
        assert('lastDailyEventDay не изменился за тот же день',
          second.data.lastDailyEventDay === beforeDay,
          `${beforeDay} → ${second.data.lastDailyEventDay}`);

        // Детерминированно применяем «хорошее» дневное событие.
        const good = pickGoodEvent();
        const before = second.data;
        const fired = core.fireWorldEvent(before, good.id);
        assert('fireWorldEvent применил событие', !!(fired && fired.event), String(fired));
        if (fired) {
          assert('Сработавшее событие имеет id и заголовок',
            fired.event.id === good.id && typeof fired.event.title === 'string' &&
            fired.event.title.length > 0,
            `${fired.event.id} / ${fired.event.title}`);
          const gained = (fired.data.dust > before.dust) ||
            (fired.data.energy > before.energy) ||
            (fired.data.metalAmount > before.metalAmount) ||
            (fired.data.civLevel > before.civLevel);
          assert('Награда события увеличила ресурсы', gained,
            `dust ${before.dust}→${fired.data.dust}, ` +
            `energy ${before.energy}→${fired.data.energy}, ` +
            `metals ${before.metalAmount}→${fired.data.metalAmount}, ` +
            `civ ${before.civLevel}→${fired.data.civLevel}`);
        }
      }
    }
  }

  // ── 6. Накопитель волн вторжений ────────────────────────────
  {
    const base = Date.now();
    const stepSec = 300;
    const ticks = 36; // 36 × 5 мин = 3 ч = offlineAttackInterval
    let data = makeSave({
      dust: 1e6, dustTotal: 1e6, energy: 1e6, civLevel: 1e5, metalAmount: 1e6,
      storageLevels: { dust: 7, energy: 7, civ: 7 },
      worldAttackAccumSec: 0,
      lastTick: base,
      worldTickAt: 0,
    });
    const accumByTick = [];
    let wavesTotal = 0;
    let ok = true;

    for (let i = 0; i < ticks; i++) {
      const fromMs = base + i * stepSec * 1000;
      const now = fromMs + stepSec * 1000;
      const res = core.worldTick(data, { now: now, fromMs: fromMs, skipEvents: true });
      if (!res) { ok = false; break; }
      data = res.data;
      accumByTick.push(Number(data.worldAttackAccumSec) || 0);
      const waves = res.out && res.out.invasionWaves;
      if (Array.isArray(waves)) wavesTotal += waves.length;
    }

    assert('36 тиков по 5 мин отработали', ok && accumByTick.length === ticks,
      `ticks=${accumByTick.length}`);
    if (ok && accumByTick.length === ticks) {
      assert('Накопитель растёт между тиками',
        accumByTick[0] === stepSec && accumByTick[34] === 35 * stepSec,
        `[0]=${accumByTick[0]}, [34]=${accumByTick[34]}`);
      assert('Накопитель накапливается, а не сбрасывается каждый тик',
        accumByTick.slice(0, ticks - 1).every((v, i) => v === (i + 1) * stepSec),
        accumByTick.join(','));
      assert('После окна атаки накопитель меньше шага тика',
        accumByTick[ticks - 1] < stepSec, String(accumByTick[ticks - 1]));
      assert('Хотя бы один тик дал волны вторжений',
        wavesTotal > 0, `wavesTotal=${wavesTotal}`);
    }
  }

  // ── 7. Тик не мутирует входной сейв ─────────────────────────
  {
    const now = Date.now();
    const save = makeSave({ lastDailyEventDay: dayIndex(now), lastWeeklyEventWeek: weekIndex(now) });
    const snapshot = JSON.stringify(save);
    core.worldTick(save, { now: now, fromMs: now - HOUR_MS });
    assert('worldTick не мутирует входной сейв', JSON.stringify(save) === snapshot);
  }

  // ── 8. Просроченное активное событие закрывается без штрафа ─
  {
    const now = Date.now();
    const interactive = pickInteractiveEvent();
    const save = makeSave({
      lastDailyEventDay: dayIndex(now),
      lastWeeklyEventWeek: weekIndex(now),
      activeRandomEvent: {
        id: interactive.id, kind: interactive.kind,
        startedAt: now - 10000, endsAt: now - 1000,
        hp: Math.max(0, Number(interactive.hp) || 0),
        maxHp: Math.max(0, Number(interactive.hp) || 0),
        taps: 0,
      },
    });
    const res = core.worldTick(save, { now: now, fromMs: now - 60000 });
    assert('Тик с просроченным событием вернул результат', !!res, String(res));
    if (res) {
      assert('Просроченное событие закрыто', res.data.activeRandomEvent === null,
        JSON.stringify(res.data.activeRandomEvent));
      assert('Пропуск события отмечен в world.missed',
        !!(res.world.missed && res.world.missed.id === interactive.id),
        JSON.stringify(res.world.missed));
      assert('Пропуск события не оштрафовал ресурсы',
        res.data.dust >= save.dust &&
        res.data.energy >= save.energy &&
        res.data.civLevel >= save.civLevel &&
        res.data.metalAmount >= save.metalAmount,
        `dust ${save.dust}→${res.data.dust}, energy ${save.energy}→${res.data.energy}, ` +
        `civ ${save.civLevel}→${res.data.civLevel}, metals ${save.metalAmount}→${res.data.metalAmount}`);
    }
  }

  console.log('========================================');
  console.log(`ИТОГО: Пройдено ${passed}, Провалено ${failed}`);
  console.log('========================================');
  process.exit(failed > 0 ? 1 : 0);
})();
