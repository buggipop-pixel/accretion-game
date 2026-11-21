// ═══════════════════════════════════════════════════════════════
//  Регресс: сохранения после «Вспышки» (prestige) между устройствами.
//
//  Симптом, который ловим:
//   • телефон с устаревшим сейвом после облачного сейва показывал
//     старые системы/планеты/флот (Вспышка их законно сбросила);
//   • старый локальный сейв затирал свежий облачный после Вспышки;
//   • при закрытии страницы сейв уходил без keepalive и терялся.
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

function makeServer() {
  return {
    data: null,
    saved_at: 0,
    version: 0,
    writes: 0,
    requests: [],
    handle(url, body, init) {
      this.requests.push({ url, body, init });
      if (url.endsWith('/api/load')) {
        return { ok: true, data: this.data, saved_at: this.saved_at, version: this.version };
      }
      if (url.endsWith('/api/save')) {
        const base = Number(body.baseVersion);
        if (this.data && (!Number.isFinite(base) || base !== this.version)) {
          return {
            __status: 409, ok: false, conflict: true,
            data: this.data, saved_at: this.saved_at, version: this.version,
          };
        }
        this.data = body.saveData;
        this.saved_at = 1700000000000 + this.writes;
        this.version++;
        this.writes++;
        return { ok: true, saved_at: this.saved_at, version: this.version };
      }
      return { ok: true, data: null, saved_at: 0, version: 0 };
    },
  };
}

function makeDevice(server, opts) {
  const cfg = opts || {};
  const localStorage = makeStorage();
  const sessionStorage = makeStorage();
  const toasts = [];
  const S = { stage: 'galaxy', lastTick: Date.now(), dust: 0 };
  if (cfg.initialSave) {
    localStorage.setItem(SAVE_KEY, JSON.stringify(cfg.initialSave));
    Object.assign(S, cfg.initialSave);
  }
  if (cfg.knownVersion) localStorage.setItem('accretion_cloud_version', String(cfg.knownVersion));

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
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
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
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(cloudsaveCode, context, { filename: 'cloudsave.js' });

  // Имитируем state.js: локальная запись + (если не skipCloud) отправка в облако.
  vm.runInContext(`
    function saveGame(opts) {
      localStorage.setItem(getSaveKey(), JSON.stringify(S));
      if (!(opts && opts.skipCloud) && typeof autoSaveToCloud === 'function') autoSaveToCloud(true);
      return true;
    }
  `, context, { filename: 'test-state-bridge.js' });
  return { S, localStorage, context, toasts, server };
}

function assert(name, cond, extra) {
  if (cond) console.log('✅ ' + name);
  else {
    console.log('❌ ' + name + (extra !== undefined ? ' → ' + extra : ''));
    process.exitCode = 1;
  }
}

function settle() {
  return new Promise((resolve) => setTimeout(resolve, 30));
}

(async function run() {
  // 1. Слияние: облако уже на следующем уровне Вспышки — сброшенное не воскресает.
  const mergeServer = makeServer();
  const M = makeDevice(mergeServer);
  const merged = M.context.window.mergeOwnedProgress(
    {
      stage: 'galaxy', prestigeLevel: 0, galaxies: 1,
      systems: 80, totalSystemsCreated: 80, systemCostFloor: 60,
      planets: [{ type: 'terran' }, { type: 'gas' }, { type: 'ice' }],
      otherSystems: [{}, {}, {}, {}],
      fleet: { interceptor: 5, cruiser: 4, dreadnought: 3 },
      settings: { sound: false, brightness: 0.4 },
      dustTotal: 1e9,
    },
    {
      stage: 'galaxy', prestigeLevel: 1, galaxies: 2,
      systems: 1, totalSystemsCreated: 1, systemCostFloor: 0,
      planets: [], otherSystems: [{}],
      fleet: { interceptor: 0, cruiser: 0, dreadnought: 0 },
      settings: { sound: true, brightness: 1 },
    });
  assert('Вспышка: систем в слиянии не воскресают', merged.systems === 1, merged.systems);
  assert('Вспышка: totalSystemsCreated из облака',
    merged.totalSystemsCreated === 1, merged.totalSystemsCreated);
  assert('Вспышка: планеты не воскресают',
    Array.isArray(merged.planets) && merged.planets.length === 0,
    JSON.stringify(merged.planets));
  assert('Вспышка: otherSystems из облака',
    Array.isArray(merged.otherSystems) && merged.otherSystems.length === 1,
    merged.otherSystems && merged.otherSystems.length);
  assert('Вспышка: fleet сброшен',
    merged.fleet.interceptor === 0 && merged.fleet.dreadnought === 0,
    JSON.stringify(merged.fleet));
  assert('Вспышка: уровень престижа из облака', merged.prestigeLevel === 1, merged.prestigeLevel);
  assert('Вспышка: локальные настройки устройства сохранены',
    merged.settings.sound === false && merged.settings.brightness === 0.4,
    JSON.stringify(merged.settings));

  // 2. Без границы Вспышки слияние по-прежнему защищает покупки.
  const samePrestige = M.context.window.mergeOwnedProgress(
    { prestigeLevel: 1, galaxies: 2, planets: [{}, {}], systems: 10 },
    { prestigeLevel: 1, galaxies: 2, planets: [{}], systems: 3 });
  assert('Без Вспышки: локальные планеты сохраняются',
    samePrestige.planets.length === 2, samePrestige.planets.length);

  // 3. Холодный старт телефона: облако после Вспышки применяется, старьё не пушится.
  const syncServer = makeServer();
  syncServer.data = {
    stage: 'galaxy', lastTick: 1700000000000, dust: 100, dustTotal: 5000,
    prestigeLevel: 1, galaxies: 2, systems: 1, totalSystemsCreated: 1,
    planets: [], otherSystems: [{}], fleet: { interceptor: 0, cruiser: 0, dreadnought: 0 },
  };
  syncServer.version = 5;
  const Phone = makeDevice(syncServer, {
    knownVersion: 4,
    initialSave: {
      stage: 'galaxy', lastTick: 1600000000000, dust: 1e9, dustTotal: 1e10,
      prestigeLevel: 0, galaxies: 1, systems: 80, totalSystemsCreated: 80,
      planets: [{}, {}, {}], otherSystems: [{}, {}, {}],
      fleet: { interceptor: 9, cruiser: 9, dreadnought: 9 },
    },
  });
  const applied = await Phone.context.window.syncCloudOnStart();
  assert('Телефон: облако применено', applied === true);
  assert('Телефон: старые системы не вернулись', Phone.S.systems === 1, Phone.S.systems);
  assert('Телефон: старые планеты не вернулись',
    Array.isArray(Phone.S.planets) && Phone.S.planets.length === 0,
    Phone.S.planets && Phone.S.planets.length);
  assert('Телефон: старый флот не вернулся',
    Phone.S.fleet.interceptor === 0, JSON.stringify(Phone.S.fleet));
  assert('Телефон: чужой сейв не перезаписан старьём',
    syncServer.writes === 0 && syncServer.version === 5,
    'writes=' + syncServer.writes + ' version=' + syncServer.version);

  // 4. Dirty + облако новее: не пушим старый локальный сейв, применяем облако.
  const dirtyServer = makeServer();
  dirtyServer.data = {
    stage: 'galaxy', lastTick: 1700000000000, dust: 100,
    prestigeLevel: 1, galaxies: 2, systems: 1, totalSystemsCreated: 1, planets: [], otherSystems: [{}],
  };
  dirtyServer.version = 5;
  const DirtyPhone = makeDevice(dirtyServer, {
    knownVersion: 4,
    initialSave: {
      stage: 'galaxy', lastTick: 1600000000000, dust: 1e9,
      prestigeLevel: 0, galaxies: 1, systems: 80, totalSystemsCreated: 80,
      planets: [{}, {}, {}], otherSystems: [{}, {}],
    },
  });
  DirtyPhone.localStorage.setItem('accretion_cloud_dirty', '1');
  const dirtySync = await DirtyPhone.context.window.syncCloudOnStart();
  assert('Dirty + облако новее: принято облако', dirtySync === true && DirtyPhone.S.dust === 100, DirtyPhone.S.dust);
  assert('Dirty + облако новее: старьё не пушилось', dirtyServer.writes === 0, dirtyServer.writes);
  assert('Dirty снят после применения облака',
    DirtyPhone.localStorage.getItem('accretion_cloud_dirty') === null);

  // 5. Dirty + та же версия (сейв не дошёл): локальный прогресс досылается.
  const retryServer = makeServer();
  retryServer.data = { stage: 'galaxy', lastTick: 1700000000000, dust: 100 };
  retryServer.version = 5;
  const Retry = makeDevice(retryServer, {
    knownVersion: 5,
    initialSave: { stage: 'galaxy', lastTick: 1700000000000, dust: 9999 },
  });
  Retry.localStorage.setItem('accretion_cloud_dirty', '1');
  const retrySync = await Retry.context.window.syncCloudOnStart();
  assert('Dirty + та же версия: локальный сейв дослан',
    retrySync === true && retryServer.data.dust === 9999, retryServer.data.dust);
  assert('Dirty + та же версия: ровно один save', retryServer.writes === 1, retryServer.writes);

  // 6. Закрытие страницы: keepalive-запрос за свежим сейвом.
  const hideServer = makeServer();
  hideServer.data = { stage: 'galaxy', lastTick: 1700000000000, dust: 1 };
  hideServer.version = 5;
  const Hide = makeDevice(hideServer, {
    knownVersion: 5,
    initialSave: { stage: 'galaxy', lastTick: 1700000000000, dust: 2 },
  });
  Hide.localStorage.setItem('accretion_cloud_dirty', '1');
  const flushed = Hide.context.window.flushCloudOnHide();
  await settle();
  const saveReq = hideServer.requests.filter((r) => r.url.endsWith('/api/save')).pop();
  assert('Закрытие: keepalive-пуш отправлен', flushed === true && !!saveReq);
  assert('Закрытие: запрос с keepalive',
    !!(saveReq && saveReq.init && saveReq.init.keepalive === true),
    JSON.stringify(saveReq && saveReq.init && saveReq.init.keepalive));

  console.log('========================================');
  console.log(process.exitCode === 1 ? '❌ Есть падения' : '✅ Все проверки пройдены');
})();
