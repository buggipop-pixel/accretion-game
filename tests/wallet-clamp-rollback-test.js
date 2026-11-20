// ═══════════════════════════════════════════════════════════════
//  Тест «нерфа откатов» при сверке кошелька.
//
//  Симптом (баг): при крупных тратах сервер присылал `clamped` + `data`,
//  клиент вызывал applyCloudSaveInternal() и ЦЕЛИКОМ заменял локальный
//  сейв снимком, отправленным ДО запроса. Покупки, миссии и события,
//  случившиеся за время запроса, откатывались.
//
//  Новый контракт:
//   • при `clamped` применяются ТОЛЬКО валютные поля, прогресс живёт;
//   • при 409 «локальный прогресс впереди» сейв не откатывается;
//   • недополученная награда не прощается, а переносится в точку отчёта.
// ═══════════════════════════════════════════════════════════════
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const SAVE_KEY = 'accretion_v17';
const BASELINE_KEY = 'accretion_reward_baseline';
const cloudsaveCode = fs.readFileSync(path.join(__dirname, '../js/cloudsave.js'), 'utf8');

let passed = 0;
let failed = 0;
function assert(name, cond, extra) {
  if (cond) { console.log('✅ ' + name); passed++; }
  else {
    console.error('❌ ' + name + (extra !== undefined ? ' → ' + extra : ''));
    failed++;
  }
}

function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

function makeServer() {
  return {
    data: null,
    saved_at: 1700000000000,
    version: 0,
    clampNext: null,
    rewardCredit: null,
    onSave: null,
    socket: null,
    handle(url, body) {
      if (url.endsWith('/api/save')) {
        const base = Number(body.baseVersion);
        if (this.data && (!Number.isFinite(base) || base !== this.version)) {
          return {
            __status: 409, ok: false, conflict: true,
            data: this.data, saved_at: this.saved_at, version: this.version,
          };
        }
        // ★ Действие игрока «во время запроса»: сейв уже собран.
        if (typeof this.onSave === 'function') this.onSave(body);
        this.data = body.saveData;
        this.version++;
        this.saved_at += 1;
        if (this.clampNext) {
          const patch = Object.assign({}, body.saveData, this.clampNext);
          this.clampNext = null;
          return {
            ok: true, saved_at: this.saved_at, version: this.version,
            clamped: Object.keys(patch), data: patch,
          };
        }
        return { ok: true, saved_at: this.saved_at, version: this.version };
      }
      if (url.endsWith('/api/reward')) {
        return { ok: true, authoritative: true, credited: this.rewardCredit };
      }
      throw new Error('unexpected url ' + url);
    },
  };
}

function makeDevice(server, opts) {
  const cfg = opts || {};
  const localStorage = makeStorage();
  const sessionStorage = makeStorage();
  const timers = [];
  const toasts = [];
  const S = { stage: 'system', lastTick: 111, dust: 0, dustTotal: 0, planets: [], systems: [1] };

  if (cfg.initialSave) {
    localStorage.setItem(SAVE_KEY, JSON.stringify(cfg.initialSave));
    Object.assign(S, cfg.initialSave);
  }
  if (cfg.knownVersion !== undefined) {
    localStorage.setItem('accretion_cloud_version', String(cfg.knownVersion));
  }

  const fetchMock = async (url, init) => {
    const body = init && init.body ? JSON.parse(String(init.body)) : {};
    const result = server.handle(url, body, init);
    const status = result.__status || 200;
    return { ok: status === 200, status, json: async () => result };
  };

  const context = {
    console: { log() {}, warn() {}, error() {} },
    localStorage,
    sessionStorage,
    fetch: fetchMock,
    // Таймеры не нужны: все проверки дергают cloudSaveGame() напрямую.
    setTimeout: (fn, ms) => { timers.push(ms); return 0; },
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    document: { visibilityState: 'visible', addEventListener() {}, getElementById: () => null },
    window: {
      isResetting: false,
      addEventListener() {},
      confirm: () => true,
      location: { hash: '', search: '' },
      Telegram: { WebApp: { initData: 'mock-init-data' } },
    },
    Promise,
    JSON,
    Date,
    S,
    updateUI() {},
    toast(title, message) { toasts.push({ title, message }); },
    loadGame() { Object.assign(S, JSON.parse(localStorage.getItem(SAVE_KEY))); },
    dustPerSec: () => 0,
    energyPerSec: () => 0,
    civPerSec: () => 0,
  };
  context.globalThis = context;

  vm.createContext(context);
  vm.runInContext(cloudsaveCode, context, { filename: 'cloudsave.js' });
  vm.runInContext(`
    function saveGame() {
      localStorage.setItem(getSaveKey(), JSON.stringify(S));
      if (typeof autoSaveToCloud === 'function') autoSaveToCloud(true);
    }
  `, context, { filename: 'test-state-bridge.js' });

  return { S, localStorage, context, toasts, timers };
}

(async () => {
  console.log('========================================');
  console.log('🧪 ТЕСТЫ НЕРФА ОТКАТОВ (кошелёк)');
  console.log('========================================');

  // ── 1. clamp больше не откатывает прогресс ──────────────────
  {
    const server = makeServer();
    const dev = makeDevice(server, {
      initialSave: { stage: 'system', lastTick: 111, dust: 1000, dustTotal: 5000, planets: [{ id: 1 }], systems: [1] },
    });

    dev.S.dust = 400;                     // крупная трата
    dev.S.planets = [{ id: 1 }, { id: 2 }];
    server.clampNext = { dust: 700, dustTotal: 5000 };

    // Покупки, которые clamped-патч трогать не имеет права.
    dev.S.fleet = { interceptor: 4, cruiser: 2, dreadnought: 1 };
    dev.S.boosters = { incomeUntil: 123456789 };
    dev.S.nightDefenseLevel = 3;
    dev.S.nightDefenseExpiresAt = 987654321;
    dev.S.settings = { sound: false, brightness: 0.5, pushEnabled: true };

    // Действие во время запроса: игрок покупает ещё одну планету.
    server.onSave = function() { dev.S.planets.push({ id: 3 }); dev.S.totalSystemsCreated = 9; };

    const res = await dev.context.window.cloudSaveGame();
    server.onSave = null;

    assert('Сейв принят, баланс сверен', res.ok === true && Array.isArray(res.clamped));
    assert('Баланс приведён к серверному', dev.S.dust === 700, dev.S.dust);
    assert('Планета, купленная во время запроса, НЕ откатилась',
      dev.S.planets.length === 3, JSON.stringify(dev.S.planets));
    assert('Прочие поля прогресса не откатились', dev.S.totalSystemsCreated === 9);
    assert('Clamped-патч не трогает флот',
      dev.S.fleet.interceptor === 4 && dev.S.fleet.cruiser === 2 && dev.S.fleet.dreadnought === 1,
      JSON.stringify(dev.S.fleet));
    assert('Clamped-патч не трогает автоборону',
      dev.S.nightDefenseLevel === 3 && dev.S.nightDefenseExpiresAt === 987654321,
      dev.S.nightDefenseLevel + '/' + dev.S.nightDefenseExpiresAt);
    assert('Clamped-патч не трогает бустер',
      dev.S.boosters && dev.S.boosters.incomeUntil === 123456789,
      JSON.stringify(dev.S.boosters));
    assert('Clamped-патч не трогает настройки',
      dev.S.settings && dev.S.settings.sound === false && dev.S.settings.brightness === 0.5,
      JSON.stringify(dev.S.settings));
    assert('Показан тост «Баланс сверен»',
      dev.toasts.some((t) => String(t.title).indexOf('Баланс сверен') >= 0));
    assert('Локальный сейв переписан (ресурсы серверные, прогресс свой)', (() => {
      const local = JSON.parse(dev.localStorage.getItem(SAVE_KEY));
      return local.dust === 700 && local.planets.length === 3;
    })());
  }

  // ── 2. 409 «локальный прогресс впереди» не откатывает сейв ──
  {
    const server = makeServer();
    server.data = { stage: 'system', lastTick: 100, dust: 10, dustTotal: 100, systems: [1], totalSystemsCreated: 1 };
    server.version = 5;

    const dev = makeDevice(server, {
      knownVersion: 0, // версия «потерялась» (ответ на нашу же запись не дошёл)
      initialSave: {
        stage: 'system', lastTick: 200, dust: 777, dustTotal: 9000000,
        systems: [1, 2, 3], totalSystemsCreated: 3,
      },
    });

    const res = await dev.context.window.cloudSaveGame();
    assert('Конфликт обнаружен', res.ok === false);
    assert('Конфликт распознан как «локальный впереди»', res.conflict === 'local-ahead', res.conflict);
    assert('Локальный прогресс сохранён', dev.S.systems.length === 3 && dev.S.dust === 777);
    assert('Досылка запланирована', dev.timers.length > 0);
  }

  // ── 3. 409 с чужого устройства по-прежнему применяется ──────
  {
    const server = makeServer();
    server.data = { stage: 'system', lastTick: 100, dust: 10, dustTotal: 99999999, systems: [1, 2, 3, 4], totalSystemsCreated: 4 };
    server.version = 5;

    const dev = makeDevice(server, {
      knownVersion: 0,
      initialSave: { stage: 'system', lastTick: 200, dust: 50, dustTotal: 100, systems: [1], totalSystemsCreated: 1 },
    });

    const res = await dev.context.window.cloudSaveGame();
    assert('Сервер главнее при чужом прогрессе',
      res.conflict === 'cloud-newer' && dev.S.systems.length === 4, res.conflict);
  }

  // ── 4. Недополученная награда не прощается ──────────────────
  {
    const server = makeServer();
    const dev = makeDevice(server, { initialSave: { stage: 'system', lastTick: 111, dust: 0, dustTotal: 0 } });

    dev.localStorage.setItem(BASELINE_KEY, JSON.stringify({
      dust: 0, energy: 0, civ: 0, at: Date.now() - 60000,
    }));
    dev.S.dust = 1000; // награда босса «dustHours» пришла разом

    // Сервер зачёл только часть (100) — как при переполненной копилке.
    server.rewardCredit = { dust: 100, energy: 0, civ: 0 };
    dev.context.window.__serverWallet = true;

    await dev.context.window.reportRewards();

    const base = JSON.parse(dev.localStorage.getItem(BASELINE_KEY));
    assert('Точка отчёта сдвинута на зачтённую часть, а не на весь баланс',
      Number(base.dust) === 100, JSON.stringify(base));

    // Второй отчёт должен увидеть остаток 900 и дослать его.
    server.rewardCredit = { dust: 900, energy: 0, civ: 0 };
    dev.S.dust = 1000;
    dev.localStorage.setItem(BASELINE_KEY, JSON.stringify({
      dust: 100, energy: 0, civ: 0, at: Date.now() - 60000,
    }));
    const second = await dev.context.window.reportRewards();
    assert('Остаток дослан вторым отчётом',
      !!(second && second.credited && second.credited.dust === 900), JSON.stringify(second));
  }

  // ── 5. Прямой сценарий из жалобы: много трат + откат ────────
  {
    const server = makeServer();
    const dev = makeDevice(server, {
      initialSave: { stage: 'system', lastTick: 111, dust: 5000000, dustTotal: 5000000, planets: [{ id: 1 }], systems: [1] },
    });

    // Игрок скупает планеты и системы, баланс падает.
    dev.S.dust = 100000;
    dev.S.planets = [{ id: 1 }, { id: 2 }, { id: 3 }];
    dev.S.systems = [1, 2, 3];
    dev.S.totalSystemsCreated = 3;

    // Сервер обрезал баланс (допуск кошелька) — раньше это был полный откат.
    server.clampNext = { dust: 120000 };
    server.onSave = function() { dev.S.planets.push({ id: 4 }); };

    const res = await dev.context.window.cloudSaveGame();
    server.onSave = null;

    assert('После большой закупки действие во время запроса сохранено',
      res.ok === true && dev.S.planets.length === 4, JSON.stringify(dev.S.planets.map((p) => p.id)));
    assert('Системы не откатились', dev.S.systems.length === 3);
    assert('Баланс сверен с сервером', dev.S.dust === 120000);
  }

  console.log('========================================');
  console.log(`ИТОГО: Пройдено ${passed}, Провалено ${failed}`);
  if (failed > 0) process.exitCode = 1;
})();
