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

  const fetchStats = { keepaliveRejected: 0 };
  // Имитация жёсткого лимита Chrome/Telegram WebView на keepalive-тело.
  const keepaliveBodyLimit = typeof cfg.keepaliveBodyLimit === 'number'
    ? cfg.keepaliveBodyLimit : null;

  const fetchMock = async (url, init) => {
    const rawBody = init && init.body ? String(init.body) : '';
    if (keepaliveBodyLimit !== null && init && init.keepalive === true &&
        rawBody.length > keepaliveBodyLimit) {
      fetchStats.keepaliveRejected++;
      // Как в браузере: такой keepalive-запрос реджектится мгновенно (status 0).
      throw new TypeError('keepalive body exceeds ' + keepaliveBodyLimit + ' bytes');
    }
    const body = rawBody ? JSON.parse(rawBody) : {};
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
      location: { hash: cfg.hash || '', search: cfg.search || '' },
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
      WebApp: { initData: cfg.initData === undefined ? 'mock-init-data' : cfg.initData },
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
  return { S, localStorage, context, cloudsave: context, toasts, fetchMock, fetchStats };
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
  assert('ПК: keepalive выключен при обычном автосейве', !!(saveReq && saveReq.init && saveReq.init.keepalive === false));

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

  assert('Браузер: предупреждение показано один раз',
    Browser.toasts.filter((t) => String(t.message).indexOf('браузере') >= 0).length === 1);

  // 6в. initData появляется с задержкой — sync должен дождаться
  const delayedServer = makeServer();
  delayedServer.data = { stage: 'star', lastTick: 9, dust: 321 };
  delayedServer.saved_at = 1700000000000;
  delayedServer.version = 2;
  const Delayed = makeDevice(delayedServer, {
    initData: '',
    knownVersion: 2,
    initialSave: { stage: 'star', lastTick: 1, dust: 0 },
  });
  setTimeout(function() {
    Delayed.context.window.Telegram.WebApp.initData = 'mock-init-data';
  }, 100);
  const delayedSync = await Delayed.context.window.syncCloudOnStart();
  assert('Telegram: initData с задержкой — дождались и применили',
    delayedSync === true && Delayed.S.dust === 321);

  // 6г. Telegram SDK не загрузился, но tgWebAppData есть в URL
  const urlServer = makeServer();
  urlServer.data = { stage: 'star', lastTick: 9, dust: 654 };
  urlServer.saved_at = 1700000000000;
  urlServer.version = 2;
  const Url = makeDevice(urlServer, {
    telegram: false,
    hash: '#tgWebAppData=mock-init-data&tgWebAppVersion=7.0',
    initialSave: { stage: 'star', lastTick: 1, dust: 0 },
  });
  const urlSync = await Url.context.window.syncCloudOnStart();
  assert('Telegram SDK заблокирован: initData взят из URL',
    urlSync === true && Url.S.dust === 654);
  assert('Telegram SDK заблокирован: нет ложного тоста про браузер',
    !Url.toasts.some((t) => String(t.message).indexOf('браузере') >= 0));

  // 6д. SDK загружен в обычном браузере, но initData пуст — это всё ещё браузер
  const browserSdkServer = makeServer();
  browserSdkServer.data = { stage: 'star', lastTick: 9, dust: 777 };
  browserSdkServer.version = 1;
  const BrowserSdk = makeDevice(browserSdkServer, {
    telegram: true,
    initData: '',
    initialSave: { stage: 'star', lastTick: 1, dust: 42 },
  });
  const brSdkSync = await BrowserSdk.context.window.syncCloudOnStart();
  assert('Браузер с загруженным SDK: облако не тронуто',
    brSdkSync === false && BrowserSdk.S.dust === 42 && browserSdkServer.requests.length === 0);
  assert('Браузер с загруженным SDK: тост про браузер, а не VPN',
    BrowserSdk.toasts.some((t) => String(t.message).indexOf('браузере') >= 0));

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

  // 6е. ★ save вернул 400: это ошибка, а не успех; dirty-флаг остаётся
  const rejectServer = makeServer();
  rejectServer.handle = function(url, body, init) {
    this.requests.push({ url, body, init });
    if (url.endsWith('/api/save')) {
      return { __status: 400, ok: false, error: 'field "phaseProgress" must be a number' };
    }
    return { ok: true, data: null, saved_at: 0, version: 0 };
  };
  const Reject = makeDevice(rejectServer, {
    initialSave: { stage: 'star', lastTick: 1, dust: 10 },
  });
  Reject.localStorage.setItem('accretion_cloud_dirty', '1');
  const rejSave = await Reject.context.window.cloudSaveGame();
  assert('save 400: клиент видит ошибку',
    rejSave.ok === false && rejSave.status === 400 && /phaseProgress/.test(rejSave.error));
  assert('save 400: dirty-флаг не сброшен',
    Reject.localStorage.getItem('accretion_cloud_dirty') === '1');

  // 6е2. ★ 429 — лимит частоты, dirty сохраняется, клиент не считает это успехом
  const rateServer = makeServer();
  rateServer.handle = function(url, body, init) {
    this.requests.push({ url, body, init });
    if (url.endsWith('/api/save')) {
      return { __status: 429, ok: false, error: 'Too frequent' };
    }
    return { ok: true, data: null, saved_at: 0, version: 0 };
  };
  const Rate = makeDevice(rateServer, {
    initialSave: { stage: 'star', lastTick: 1, dust: 10 },
  });
  Rate.localStorage.setItem('accretion_cloud_dirty', '1');
  const rateRes = await Rate.context.window.cloudSaveGame();
  assert('save 429: клиент видит лимит, а не ошибку данных',
    rateRes.ok === false && rateRes.status === 429 && rateRes.retryAfter > 0);
  assert('save 429: dirty-флаг не сброшен',
    Rate.localStorage.getItem('accretion_cloud_dirty') === '1');

  // 6е3. ★ Троттлинг: два действия подряд не могут дать два save за секунду
  const throttleServer = makeServer();
  const Throttle = makeDevice(throttleServer, {
    initialSave: { stage: 'star', lastTick: 1, dust: 5 },
  });
  Throttle.S.dust = 10;
  Throttle.context.saveGame();
  Throttle.S.dust = 11;
  Throttle.context.saveGame();
  await settle();
  assert('Троттлинг: два действия за секунду дают один save',
    throttleServer.writes === 1);

  // 6ж. ★ Есть несохранённый локальный прогресс — старое облако не применяем
  const dirtyServer = makeServer();
  dirtyServer.data = { stage: 'system', lastTick: 9, dust: 100 };
  dirtyServer.saved_at = 1700000000000;
  dirtyServer.version = 2;
  const Dirty = makeDevice(dirtyServer, {
    knownVersion: 2,
    initialSave: { stage: 'system', lastTick: 1, dust: 9999 },
  });
  Dirty.S.dust = 9999;
  Dirty.localStorage.setItem('accretion_cloud_dirty', '1');
  const dirtySync = await Dirty.context.window.syncCloudOnStart();
  assert('Dirty: локальный прогресс не перетёрт старым облаком',
    dirtySync === true && Dirty.S.dust === 9999);
  assert('Dirty: локальный прогресс отправлен на сервер',
    dirtyServer.data.dust === 9999 && dirtyServer.version === 3);
  assert('Dirty: флаг снят после успешного save',
    Dirty.localStorage.getItem('accretion_cloud_dirty') === null);

  // 6з. ★ Dirty + облако реально новее — сервер побеждает, прогресс не теряется молча
  const conflictServer = makeServer();
  conflictServer.data = { stage: 'system', lastTick: 9, dust: 100 };
  conflictServer.saved_at = 1700000000000;
  conflictServer.version = 3;
  const Conf = makeDevice(conflictServer, {
    knownVersion: 2,
    initialSave: { stage: 'system', lastTick: 1, dust: 9999 },
  });
  Conf.S.dust = 9999;
  Conf.localStorage.setItem('accretion_cloud_dirty', '1');
  const confSync = await Conf.context.window.syncCloudOnStart();
  assert('Dirty + новая версия: принято облако',
    confSync === true && Conf.S.dust === 100 && conflictServer.version === 3);
  assert('Dirty + новая версия: флаг снят',
    Conf.localStorage.getItem('accretion_cloud_dirty') === null);

  // 6и. ★ Аварийное восстановление локального бэкапа
  const backupServer = makeServer();
  const Backup = makeDevice(backupServer, {
    initialSave: { stage: 'star', lastTick: 1, dust: 5 },
  });
  Backup.localStorage.setItem('accretion_local_backup', JSON.stringify({
    stage: 'galaxy', lastTick: 2, dust: 12345, playerName: 'BackupPlayer',
  }));
  const restored = Backup.context.window.restoreLocalBackup();
  await settle();
  assert('Бэкап: локальный сейв восстановлен',
    restored === true && Backup.S.stage === 'galaxy' && Backup.S.dust === 12345);
  assert('Бэкап: восстановленный прогресс ушёл в облако',
    backupServer.data && backupServer.data.dust === 12345);

  // 6к. ★ Миграция: save падал, версия та же, локальный прогресс выше облака
  const aheadServer = makeServer();
  aheadServer.data = { stage: 'system', lastTick: 9, dust: 100, dustTotal: 100 };
  aheadServer.saved_at = 1700000000000;
  aheadServer.version = 2;
  const Ahead = makeDevice(aheadServer, {
    knownVersion: 2,
    initialSave: { stage: 'galaxy', lastTick: 1, dust: 5000, dustTotal: 5000 },
  });
  const aheadSync = await Ahead.context.window.syncCloudOnStart();
  assert('Миграция: локальный прогресс выше облака сохранён',
    aheadSync === true && Ahead.S.stage === 'galaxy');
  assert('Миграция: локальный прогресс записан на сервер',
    aheadServer.data.stage === 'galaxy' && aheadServer.data.dust === 5000 && aheadServer.version === 3);

  // 6л. ★ Хороший бэкап не затирается более слабым сейвом при следующих запусках
  const keepBackupServer = makeServer();
  keepBackupServer.data = { stage: 'system', lastTick: 9, dust: 100, dustTotal: 100 };
  keepBackupServer.saved_at = 1700000000000;
  keepBackupServer.version = 3;
  const Keep = makeDevice(keepBackupServer, {
    knownVersion: 2,
    initialSave: { stage: 'system', lastTick: 1, dust: 50, dustTotal: 50 },
  });
  Keep.localStorage.setItem('accretion_local_backup', JSON.stringify({
    stage: 'galaxy', lastTick: 2, dust: 99999, dustTotal: 99999,
  }));
  await Keep.context.window.syncCloudOnStart();
  const keptBackup = JSON.parse(Keep.localStorage.getItem('accretion_local_backup'));
  assert('Бэкап: сильный бэкап не затёрт слабым сейвом',
    keptBackup && keptBackup.stage === 'galaxy' && keptBackup.dust === 99999);

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

  // 12. ★ Большой сейв (>64 KiB): keepalive выключается, save проходит
  const bigServer = makeServer();
  const Big = makeDevice(bigServer, {
    keepaliveBodyLimit: 64 * 1024,
    initialSave: {
      stage: 'star', lastTick: 1, dust: 100,
      longField: 'x'.repeat(70000), // тело сейва заведомо больше лимита keepalive
    },
  });
  Big.S.dust = 250;
  const bigRes = await Big.context.window.cloudSaveGame();
  const bigSaveReqs = bigServer.requests.filter((r) => r.url.endsWith('/api/save'));
  const bigReq = bigSaveReqs[bigSaveReqs.length - 1];
  assert('Большой сейв: ушёл без keepalive',
    !!(bigReq && bigReq.init && bigReq.init.keepalive === false));
  assert('Большой сейв: успешно сохранён',
    bigRes.ok === true && !!bigServer.data && bigServer.data.dust === 250);
  assert('Большой сейв: keepalive-запрос не отклонялся',
    Big.fetchStats.keepaliveRejected === 0);

  // 12б. ★ keepalive падает на сети — один повтор без keepalive спасает save
  const fallbackServer = makeServer();
  const Fallback = makeDevice(fallbackServer, {
    keepaliveBodyLimit: 0, // любая keepalive-попытка реджектится как TypeError
    initialSave: { stage: 'star', lastTick: 1, dust: 5 },
  });
  Fallback.S.dust = 11;
  const fbRes = await Fallback.context.window.cloudSaveGame({ keepalive: true });
  const fbSaveReqs = fallbackServer.requests.filter((r) => r.url.endsWith('/api/save'));
  assert('Fallback: keepalive-попытка отклонена', Fallback.fetchStats.keepaliveRejected === 1);
  assert('Fallback: повтор без keepalive сохранён',
    fbRes.ok === true && fbSaveReqs.length === 1 &&
    fbSaveReqs[0].init.keepalive === false && fallbackServer.data.dust === 11);

  console.log('========================================');
  console.log(process.exitCode === 1 ? '❌ Есть падения' : '✅ Все проверки пройдены');
})();
