// ═══════════════════════════════════════════════════════════════
//  Тест server-authoritative синхронизации облачных сейвов.
//
//  Новый контракт:
//   • сервер — единственный источник правды (saved_at + version);
//   • при старте облачный сейв применяется ВСЕГДА, если он есть;
//   • вне Telegram облако полностью отключено;
//   • saveGame() немедленно отправляет сейв в облако (keepalive);
//   • конфликт 409 не затирает чужой прогресс.
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
    requests: [],
    handle(url, body, init) {
      this.requests.push({ url, body, init });
      if (url.endsWith('/api/load')) {
        return { ok: true, data: this.data, saved_at: this.saved_at, version: this.version };
      }
      if (url.endsWith('/api/save')) {
        const base = Number(body.baseVersion);
        if (this.data && (!Number.isFinite(base) || base !== this.version)) {
          this.conflicts++;
          return {
            __status: 409,
            ok: false,
            conflict: true,
            data: this.data,
            saved_at: this.saved_at,
            version: this.version,
          };
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
  const toasts = [];
  const S = { stage: 'star', lastTick: Date.now() + clockSkew, dust: 0 };

  if (cfg.initialSave) {
    localStorage.setItem(SAVE_KEY, JSON.stringify(cfg.initialSave));
    Object.assign(S, cfg.initialSave);
  }
  if (cfg.knownVersion) localStorage.setItem('accretion_cloud_version', String(cfg.knownVersion));

  const fetchMock = async (url, init) => {
    const body = init && init.body ? JSON.parse(init.body) : {};
    const result = server.handle(url, body, init);
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
    document: {
      visibilityState: 'visible',
      addEventListener() {},
      getElementById: () => ({ classList: { contains: () => false } }),
    },
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
    toast(title, message) { toasts.push({ title, message }); },
    loadGame() { Object.assign(S, JSON.parse(localStorage.getItem(SAVE_KEY))); },
    // saveGame имитируем ниже ВНУТРИ vm-контекста (как настоящий state.js),
    // иначе он не увидит глобальный autoSaveToCloud().
  };
  context.globalThis = context;

  // ★ По умолчанию мы в Telegram; cfg.telegram=false — обычный браузер.
  if (cfg.telegram !== false) {
    context.window.Telegram = {
      WebApp: { initData: 'mock-init-data' },
    };
  }

  vm.createContext(context);
  vm.runInContext(cloudsaveCode, context, { filename: 'cloudsave.js' });

  // Имитируем state.js: локальный сейв + немедленная отправка в облако.
  vm.runInContext(`
    function saveGame() {
      localStorage.setItem(getSaveKey(), JSON.stringify(S));
      if (typeof autoSaveToCloud === 'function') autoSaveToCloud(true);
    }
  `, context, { filename: 'test-state-bridge.js' });
  return { S, localStorage, context, cloudsave: context, toasts, fetchMock };
}

function assert(name, cond) {
  if (cond) console.log('✅ ' + name);
  else { console.error('❌ ' + name); process.exitCode = 1; }
}

// Ждём завершения фонового автосохранения (autoSaveToCloud не возвращает промис)
function settle() {
  return new Promise((resolve) => setTimeout(resolve, 25));
}

(async () => {
  console.log('========================================');
  console.log('🧪 ТЕСТЫ SERVER-AUTHORITATIVE СИНХРОНИЗАЦИИ');
  console.log('========================================');

  // 1. ПК: сохранение в облако и запоминание версии сервера
  const server = makeServer();
  const A = makeDevice(server, { initialSave: { stage: 'star', lastTick: 111, dust: 100 } });
  A.context.S.dust = 100;
  const saveRes = await A.context.window.cloudSaveGame();
  assert('ПК: сейв ушёл в облако', saveRes.ok === true && server.version === 1);
  assert('ПК: версия сервера сохранена локально',
    A.localStorage.getItem('accretion_cloud_version') === '1');
  const saveReq = server.requests.filter((r) => r.url.endsWith('/api/save')).pop();
  assert('ПК: keepalive включён', !!(saveReq && saveReq.init && saveReq.init.keepalive === true));

  // 2. Телефон с часами на 2 часа вперёд: облако применяется всегда
  const B = makeDevice(server, {
    clockSkew: 2 * 3600 * 1000,
    initialSave: { stage: 'star', lastTick: 999, dust: 555 },
  });
  const startRes = await B.context.window.syncCloudOnStart();
  assert('Телефон: при старте принял облачный сейв', startRes === true && B.S.dust === 100);

  // 3. Конфликт 409: устаревшая version не затирает чужой прогресс
  B.S.dust = 555;
  B.localStorage.setItem('accretion_cloud_version', '0'); // устаревшая версия
  A.S.dust = 777;
  A.localStorage.setItem(SAVE_KEY, JSON.stringify(A.S));
  await A.context.window.cloudSaveGame(); // ПК пишет v2 (dust 777)

  const bSave = await B.context.window.cloudSaveGame();
  assert('Телефон: конфликт обнаружен (409)', bSave.ok === false && bSave.conflict === 'cloud-newer');
  assert('Телефон: чужой сейв НЕ затёрт сервером', server.data.dust === 777);
  assert('Телефон: получил серверную версию', B.S.dust === 777);
  assert('Сервер: версия выросла только от легитимной записи', server.version === 2);

  // 4. Даже при равной версии облако главнее (нет диалогов «оставить моё»)
  const server2 = makeServer();
  server2.data = { stage: 'star', lastTick: 9, dust: 600 };
  server2.saved_at = 1700000000000;
  server2.version = 1;
  const G = makeDevice(server2, {
    knownVersion: 1,
    initialSave: { stage: 'star', lastTick: 1, dust: 12345 },
  });
  const gSync = await G.context.window.syncCloudOnStart();
  assert('Равная версия: серверный сейв всё равно применяется',
    gSync === true && G.S.dust === 600);
  assert('Равная версия: локальные изменения не остаются',
    G.localStorage.getItem(SAVE_KEY).indexOf('12345') === -1);

  // 5. Пустое облако: локальный сейв не трогаем
  const emptyServer = makeServer();
  const E = makeDevice(emptyServer, { initialSave: { stage: 'star', lastTick: 42, dust: 1 } });
  const eSync = await E.context.window.syncCloudOnStart();
  assert('Пустое облако: локальный сейв остался', eSync === false && E.S.dust === 1);

  // 6. ★ Обычный браузер: облако полностью заблокировано
  const browserServer = makeServer();
  browserServer.data = { stage: 'star', lastTick: 9, dust: 999 };
  browserServer.saved_at = 1700000000000;
  browserServer.version = 5;
  const Browser = makeDevice(browserServer, {
    telegram: false,
    initialSave: { stage: 'star', lastTick: 1, dust: 42 },
  });
  const brSync = await Browser.context.window.syncCloudOnStart();
  assert('Браузер: синхронизация при старте возвращает false', brSync === false);
  assert('Браузер: локальный сейв не перетёрт облаком', Browser.S.dust === 42);
  assert('Браузер: ни одного запроса к серверу',
    browserServer.requests.length === 0);
  assert('Браузер: показано предупреждение',
    Browser.toasts.some((t) => String(t.message).indexOf('браузере') >= 0));

  const brAuto = Browser.context.window.autoSaveToCloud(true);
  Browser.context.saveGame();
  await settle();
  assert('Браузер: автосохранение в облако отключено', brAuto === false);
  assert('Браузер: saveGame() не создаёт фантомных сейвов',
    browserServer.requests.length === 0);

  // 6б. ★ После сброса два вызова syncCloudOnStart не должны вернуть старый сейв
  const resetServer = makeServer();
  resetServer.data = { stage: 'star', lastTick: 9, dust: 999 };
  resetServer.saved_at = 1700000000000;
  resetServer.version = 3;
  const R = makeDevice(resetServer, {
    knownVersion: 3,
    initialSave: { stage: 'star', lastTick: 1, dust: 0 },
  });
  R.localStorage.setItem('accretion_reset_pending', '1');
  const resetSync1 = await R.context.window.syncCloudOnStart();
  const resetSync2 = await R.context.window.syncCloudOnStart();
  assert('Сброс: облако не восстановлено ни разу',
    resetSync1 === false && resetSync2 === false && R.S.dust === 0);
  assert('Сброс: сервер не опрашивался', resetServer.requests.length === 0);
  assert('Сброс: флаг ожидания чистого сейва установлен',
    R.context.sessionStorage.getItem('accretion_reset_skip_cloud') === '1');

  // Чистый прогресс уходит на сервер — и только тогда синхронизация оживает
  R.S.dust = 7;
  R.context.saveGame();
  await settle();
  assert('Сброс: чистый сейв записан в облако',
    resetServer.data && resetServer.data.dust === 7 && resetServer.version === 4);
  assert('Сброс: защита снята после успешной записи',
    R.context.sessionStorage.getItem('accretion_reset_skip_cloud') === null);

  // 7. saveGame() сам отправляет сейв в облако (без ручного вызова)
  const liveServer = makeServer();
  const L = makeDevice(liveServer, { initialSave: { stage: 'star', lastTick: 1, dust: 5 } });
  L.S.dust = 333;
  L.context.saveGame();
  await settle();
  assert('saveGame(): сейв сразу ушёл в облако',
    liveServer.writes === 1 && liveServer.data && liveServer.data.dust === 333);
  assert('saveGame(): нет рекурсии и лишних записей', liveServer.writes === 1);

  // 8. Опрос: новая серверная версия применяется автоматически
  const Poll = makeDevice(server, {
    initialSave: { stage: 'star', lastTick: 5, dust: 10 },
    knownVersion: 1,
  });
  Poll.S.dust = 10;
  const polled = await Poll.context.window.pollCloudVersion();
  assert('ПК: опрос нашёл и применил обновление',
    polled === true && Poll.S.dust === 777);

  // 9. Опрос при той же версии ничего не делает
  Poll.localStorage.setItem('accretion_cloud_version', String(server.version));
  const polledAgain = await Poll.context.window.pollCloudVersion();
  assert('ПК: без новой версии опрос молчит', polledAgain === false);

  // 10. Устройство с часами в прошлом: облако побеждает
  const D = makeDevice(server, {
    clockSkew: -2 * 3600 * 1000,
    initialSave: { stage: 'star', lastTick: 1, dust: 1 },
  });
  const dSync = await D.context.window.syncCloudOnStart();
  assert('Часы в прошлом: облако побеждает', dSync === true && D.S.dust === 777);

  // 11. Режим серверного кошелька
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
  const W = makeDevice(walletServer, {
    knownVersion: 1,
    initialSave: { stage: 'star', lastTick: 1, dust: 100 },
  });
  const wSync = await W.context.window.syncCloudOnStart();
  assert('Кошелёк: при равной версии серверный баланс применяется',
    wSync === true && W.S.dust === 777);
  assert('Кошелёк: клиент запомнил режим', W.context.window.__serverWallet === true);

  console.log('========================================');
  console.log(process.exitCode === 1 ? '❌ Есть падения' : '✅ Все проверки пройдены');
})();
