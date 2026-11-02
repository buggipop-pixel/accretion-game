// ═══════════════════════════════════════════════════════════════
//  Тест server-authoritative синхронизации облачных сейвов.
//  Главная проверка: устройство с «уехавшими» часами НЕ может
//  затереть прогресс другого устройства, потому что сравнение идёт
//  по версии сервера, а не по локальному Date.now().
// ═══════════════════════════════════════════════════════════════
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const SAVE_KEY = 'accretion_v17';
const cloudsaveCode = fs.readFileSync(path.join(__dirname, '../js/cloudsave.js'), 'utf8');

function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

// ─── Мок сервера: единственный источник версии и времени ────────
function makeServer() {
  return {
    data: null,
    saved_at: 0,
    version: 0,
    writes: 0,
    conflicts: 0,
    handle(url, body) {
      if (url.endsWith('/api/load')) {
        return { ok: true, data: this.data, saved_at: this.saved_at, version: this.version };
      }
      if (url.endsWith('/api/save')) {
        const base = Number(body.baseVersion);
        if (this.data && (!Number.isFinite(base) || base !== this.version)) {
          this.conflicts++;
          return { __status: 409, ok: false, conflict: true, data: this.data, saved_at: this.saved_at, version: this.version };
        }
        this.data = body.saveData;
        this.saved_at = 1700000000000 + this.writes; // серверное время
        this.version++;
        this.writes++;
        return { ok: true, saved_at: this.saved_at, version: this.version };
      }
      throw new Error('unexpected url ' + url);
    },
  };
}

// ─── Мок устройства (браузера/Telegram) ────────────────────────
function makeDevice(server, opts) {
  const cfg = opts || {};
  const clockSkew = cfg.clockSkew || 0; // «уехавшие» часы устройства

  const localStorage = makeStorage();
  const sessionStorage = makeStorage();
  const S = { stage: 'star', lastTick: Date.now() + clockSkew, dust: 0 };

  if (cfg.initialSave) {
    localStorage.setItem(SAVE_KEY, JSON.stringify(cfg.initialSave));
    Object.assign(S, cfg.initialSave);
  }
  if (cfg.knownVersion) localStorage.setItem('accretion_cloud_version', String(cfg.knownVersion));

  const fetchMock = async (url, init) => {
    const body = init && init.body ? JSON.parse(init.body) : {};
    const result = server.handle(url, body);
    const status = result.__status || 200;
    return { ok: status === 200, status, json: async () => result };
  };

  const context = {
    console: { log() {}, warn() {}, error() {} },
    localStorage,
    sessionStorage,
    fetch: fetchMock,
    setTimeout,
    clearTimeout,
    setInterval: () => 0, // интервалы в тесте запускаем вручную
    clearInterval: () => {},
    document: { visibilityState: 'visible', addEventListener() {} },
    window: {
      isResetting: false,
      addEventListener() {},
      confirm: () => true,
    },
    Promise,
    JSON,
    Date: class extends Date {
      static now() { return Date.prototype.constructor.now.call(Date) + clockSkew; }
    },
    S,
    updateUI() {},
    toast() {},
    loadGame() { Object.assign(S, JSON.parse(localStorage.getItem(SAVE_KEY))); },
    saveGame() { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); },
  };
  context.__lastPrompt = null;
  context.window.Telegram = {
    WebApp: {
      initData: 'mock-init-data',
      showConfirm: (msg, cb) => {
        context.__lastPrompt = msg;
        cb(cfg.confirmAnswer !== false);
      },
    },
  };
  context.globalThis = context;

  vm.createContext(context);
  vm.runInContext(cloudsaveCode, context, { filename: 'cloudsave.js' });

  return { S, localStorage, context, cloudsave: context };
}

function assert(name, cond) {
  if (cond) console.log('✅ ' + name);
  else { console.error('❌ ' + name); process.exitCode = 1; }
}

(async () => {
  console.log('========================================');
  console.log('🧪 ТЕСТЫ SERVER-AUTHORITATIVE СИНХРОНИЗАЦИИ');
  console.log('========================================');

  // Устройство A (ПК): сохраняет прогресс в облако → версия 1
  const server = makeServer();
  const A = makeDevice(server, { initialSave: { stage: 'star', lastTick: 111, dust: 100 } });
  A.context.S.dust = 100;
  const saveRes = await A.context.window.cloudSaveGame();
  assert('ПК: сейв ушёл в облако', saveRes.ok === true && server.version === 1);
  assert('ПК: версия сервера сохранена локально',
    A.localStorage.getItem('accretion_cloud_version') === '1');

  // Устройство B (телефон) с часами на 2 часа вперёд. Облако уже v1.
  // Оно не видело облако (knownVersion = 0) и имеет свой локальный сейв.
  const B = makeDevice(server, { clockSkew: 2 * 3600 * 1000, initialSave: { stage: 'star', lastTick: 999, dust: 555 } });
  const startRes = await B.context.window.syncCloudOnStart();
  assert('Телефон: облако новее по версии → принял облако', startRes === true && B.S.dust === 100);

  // Телефон «поиграл» и пытается сохраниться, но его baseVersion устарел
  // (обновился с другого устройства). Раньше такой сейв затирал чужой прогресс.
  B.S.dust = 555;
  B.localStorage.setItem('accretion_cloud_version', '0'); // имитируем устаревшую версию
  A.S.dust = 777;
  A.localStorage.setItem(SAVE_KEY, JSON.stringify(A.S));
  await A.context.window.cloudSaveGame(); // ПК пишет v2 (dust 777)

  const bSave = await B.context.window.cloudSaveGame();
  assert('Телефон: конфликт обнаружен (409)', bSave.ok === false && bSave.conflict === 'cloud-newer');
  assert('Телефон: чужой сейв НЕ затёрт сервером', server.data.dust === 777);
  assert('Телефон: получил серверную версию', B.S.dust === 777);
  assert('Сервер: версия выросла только от легитимной записи', server.version === 2);

  // ★ Версия та же, но сервер сам начислил офлайн-доход — данные сервера
  //   должны примениться, даже если версия не выросла.
  const server2 = makeServer();
  server2.data = { stage: 'star', lastTick: 1, dust: 100 };
  server2.version = 1;
  const G = makeDevice(server2, { knownVersion: 1, initialSave: { stage: 'star', lastTick: 1, dust: 100 } });
  server2.handle = function(url) {
    if (url.endsWith('/api/load')) {
      return {
        ok: true,
        data: { stage: 'star', lastTick: 9, dust: 600 },
        saved_at: 1700000000000,
        version: 1,
        offline: { seconds: 3600, dustEarned: 500, energyEarned: 0, civEarned: 0 },
      };
    }
    return { ok: true };
  };
  const gSync = await G.context.window.syncCloudOnStart();
  assert('Серверное офлайн-начисление применяется при той же версии',
    gSync === true && G.S.dust === 600);

  // Без начисления и при той же версии локальный сейв не трогаем
  server2.handle = function(url) {
    if (url.endsWith('/api/load')) {
      return { ok: true, data: { stage: 'star', lastTick: 9, dust: 100 }, saved_at: 1, version: 1, offline: null };
    }
    return { ok: true };
  };
  const H = makeDevice(server2, { knownVersion: 1, initialSave: { stage: 'star', lastTick: 1, dust: 100 } });
  H.S.dust = 12345; // локальные изменения
  const hSync = await H.context.window.syncCloudOnStart();
  assert('Без начисления локальный сейв остаётся', hSync === false && H.S.dust === 12345);
  // Проверка опроса: ПК с известной версией 1 видит v2 и подтягивает изменения
  const C = makeDevice(server, { initialSave: { stage: 'star', lastTick: 5, dust: 10 }, knownVersion: 1 });
  C.S.dust = 10;
  const before = C.S.dust;
  const polled = await C.context.window.pollCloudVersion();
  assert('ПК: опрос нашёл обновление с другого устройства', polled === true);
  assert('ПК: применил серверные данные', C.S.dust === 777 && C.S.dust !== before);

  // Часы устройства не влияют на решение: телефон с часами на 2 часа НАЗАД
  const D = makeDevice(server, { clockSkew: -2 * 3600 * 1000, initialSave: { stage: 'star', lastTick: 1, dust: 1 } });
  const dSync = await D.context.window.syncCloudOnStart();
  assert('Устройство с часами в прошлом: облако побеждает по версии', dSync === true && D.S.dust === 777);

  // Пустое облако: локальный сейв не трогаем
  const emptyServer = makeServer();
  const E = makeDevice(emptyServer, { initialSave: { stage: 'star', lastTick: 42, dust: 1 } });
  const eSync = await E.context.window.syncCloudOnStart();
  assert('Пустое облако: локальный сейв остался', eSync === false && E.S.dust === 1);

  // ★ Игрок отказался грузить облако → текущий сейв перезаписывает облако
  const F = makeDevice(server, {
    confirmAnswer: false,
    initialSave: { stage: 'system', lastTick: 3, dust: 42, civLevel: 2, totalSystemsCreated: 3 },
  });
  const fSync = await F.context.window.syncCloudOnStart();
  assert('Отказ: текущий сейв остался', fSync === false && F.S.dust === 42);
  assert('Отказ: облако перезаписано текущим', server.data.dust === 42);
  assert('Отказ: версия сервера выросла', server.version === 3);
  assert('Диалог: заголовок про новое сохранение',
    String(F.context.__lastPrompt).indexOf('Обнаружено более новое сохранение') >= 0);
  // Описание относится к ОБЛАЧНОМУ сейву (там пыль 777 с ПК)
  assert('Диалог: есть краткое описание стадии',
    String(F.context.__lastPrompt).indexOf('пыль: 777') >= 0);

  // ★ Режим серверного кошелька: баланс с сервера главнее локального
  const walletServer = makeServer();
  walletServer.handle = function(url) {
    if (url.endsWith('/api/load')) {
      return {
        ok: true,
        data: { stage: 'star', lastTick: 9, dust: 777 },
        saved_at: 1,
        version: 1,
        offline: null,
        authoritative: true,
        wallet: { dust: 777, dustTotal: 777, energy: 0, civLevel: 0 },
      };
    }
    return { ok: true };
  };
  const W = makeDevice(walletServer, { knownVersion: 1, initialSave: { stage: 'star', lastTick: 1, dust: 100 } });
  const wSync = await W.context.window.syncCloudOnStart();
  assert('Кошелёк: при равной версии локальный прогресс не затирается',
    wSync === false && W.S.dust === 100);
  assert('Кошелёк: клиент запомнил режим', W.context.window.__serverWallet === true);

  // При новой версии (другое устройство) серверные данные всё равно применяются
  walletServer.handle = function(url) {
    if (url.endsWith('/api/load')) {
      return {
        ok: true,
        data: { stage: 'star', lastTick: 9, dust: 888 },
        saved_at: 1,
        version: 2,
        offline: null,
        authoritative: true,
        wallet: { dust: 888, dustTotal: 888, energy: 0, civLevel: 0 },
      };
    }
    return { ok: true };
  };
  const W2 = makeDevice(walletServer, { knownVersion: 1, initialSave: { stage: 'star', lastTick: 1, dust: 100 } });
  const w2Sync = await W2.context.window.syncCloudOnStart();
  assert('Кошелёк: новая версия применяется', w2Sync === true && W2.S.dust === 888);
  console.log('========================================');
  console.log(process.exitCode === 1 ? '❌ Есть падения' : '✅ Все проверки пройдены');
})();
