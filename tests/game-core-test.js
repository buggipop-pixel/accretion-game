// ═══════════════════════════════════════════════════════════════
//  Тесты lib/game-core.js — серверные формулы должны совпадать
//  с клиентскими до последней цифры, иначе игрок увидит один доход
//  в игре, а в офлайн-начислении другой.
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

const SAMPLE_SAVE = {
  stage: 'system',
  starType: 'G',
  systemType: 'single',
  systems: 4,
  totalSystemsCreated: 4,
  galaxyMultiplier: 1.2,
  prestigeLevel: 1,
  gammaDebuff: 0,
  systemIncomeBonus: 0.15,
  dust: 120000,
  dustTotal: 900000,
  energy: 400,
  civLevel: 12,
  storageLevels: { dust: 3, energy: 2, civ: 2 },
  primeSystem: { bonus: { dustMult: 0.25 } },
  boosters: { incomeUntil: 0 },
  lastTick: Date.now(),
  activeEvent: null,
  invasionDebuff: null,
  planets: [
    { type: 'rocky', baseOrbitR: 1.1, orbitR: 110, mass: 1.4, radius: 8, forming: false },
    { type: 'superEarth', baseOrbitR: 1.8, orbitR: 180, mass: 2.2, radius: 11, forming: false },
    { type: 'gasGiant', baseOrbitR: 3.2, orbitR: 320, mass: 5.0, radius: 18, forming: false },
  ],
};

// ─── Клиентская сторона: те же файлы в vm, как в браузере ──────
function makeClientContext() {
  const noop = () => {};
  const el = () => ({
    style: {}, dataset: {}, classList: { add: noop, remove: noop, contains: () => false },
    innerHTML: '', appendChild: noop, addEventListener: noop,
    querySelector: () => el(), querySelectorAll: () => [],
    getContext: () => null, getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
    getAttribute: () => null, setAttribute: noop,
  });
  const storage = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop };
  const context = {
    console: { log: noop, warn: noop, error: noop },
    document: {
      getElementById: () => el(), querySelector: () => el(), querySelectorAll: () => [],
      createElement: () => el(), addEventListener: noop, body: el(), visibilityState: 'visible',
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
    Image: function Image() { return el(); },
  };
  context.window = context;
  context.self = context;
  context.globalThis = context;
  vm.createContext(context);

  for (const file of ['config.js', 'physics.js', 'state.js', 'economy.js', 'invasions.js']) {
    const code = fs.readFileSync(path.join(__dirname, '../js', file), 'utf8');
    vm.runInContext(code, context, { filename: file });
  }

  vm.runInContext('globalThis.__bridge = { S: S, dustPerSec, energyPerSec, civPerSec, getResourceCap, STORAGE_CFG, CFG, planetCost, systemCost };', context);
  return vm.runInContext('__bridge', context);
}

(async () => {
  const { createGameCore } = await import('../lib/game-core.js');

  console.log('========================================');
  console.log('🧪 ТЕСТЫ СЕРВЕРНОЙ ЭКОНОМИКИ (game-core)');
  console.log('========================================');

  const core = createGameCore();
  const client = makeClientContext();

  assert('game-core загружает игровые скрипты', typeof core.rates === 'function');

  // Одинаковое состояние с обеих сторон
  core.setState(SAMPLE_SAVE);
  Object.assign(client.S, SAMPLE_SAVE);

  const serverRates = core.rates();
  const clientRates = {
    dust: client.dustPerSec(),
    energy: client.energyPerSec(),
    civ: client.civPerSec(),
  };

  assert('Доход пыли совпадает с клиентом',
    Math.abs(serverRates.dust - clientRates.dust) < 1e-9,
    `server=${serverRates.dust} client=${clientRates.dust}`);
  assert('Доход энергии совпадает с клиентом',
    Math.abs(serverRates.energy - clientRates.energy) < 1e-9,
    `server=${serverRates.energy} client=${clientRates.energy}`);
  assert('Доход цив совпадает с клиентом',
    Math.abs(serverRates.civ - clientRates.civ) < 1e-9,
    `server=${serverRates.civ} client=${clientRates.civ}`);
  assert('Доход пыли больше нуля', serverRates.dust > 0, String(serverRates.dust));

  assert('Лимит пыли совпадает с клиентом',
    core.resourceCap('dust') === client.getResourceCap('dust'),
    `server=${core.resourceCap('dust')} client=${client.getResourceCap('dust')}`);

  assert('Часы накопления из storageLevels совпадают',
    core.storageCapHours('dust', SAMPLE_SAVE.storageLevels) ===
      client.STORAGE_CFG.getDustCapHours(SAMPLE_SAVE.storageLevels.dust));

  // ── Офлайн-начисление ──────────────────────────────────────
  const HOUR = 3600;
  const res = core.accrueOffline(SAMPLE_SAVE, HOUR);
  const eff = client.CFG.offlineEfficiency;
  const dustCapSec = Math.min(HOUR, client.STORAGE_CFG.getDustCapHours(SAMPLE_SAVE.storageLevels.dust) * 3600);
  const expectedDust = Math.floor(clientRates.dust * dustCapSec * eff);
  const expectedCapped = Math.min(expectedDust, client.getResourceCap('dust') - SAMPLE_SAVE.dust);

  assert('Пыль начислена по той же формуле, что в игре',
    res.earned.dust === Math.max(0, expectedCapped),
    `server=${res.earned.dust} client=${expectedCapped}`);
  assert('dustTotal вырос на столько же',
    res.data.dustTotal === SAMPLE_SAVE.dustTotal + res.earned.dust);
  assert('Исходный сейв не мутирован',
    SAMPLE_SAVE.dust === 120000 && SAMPLE_SAVE.dustTotal === 900000);
  assert('Ресурсы не превышают лимит',
    res.data.dust <= Math.max(SAMPLE_SAVE.dust, client.getResourceCap('dust')) + 1);

  // ── Таблица лута сундука доступна серверу ──────────────
  const loot = core.chestLoot();
  assert('Таблица лута сундука загружена из config.js',
    Array.isArray(loot) && loot.length === 11 &&
    loot.some(function(i) { return i.key === 'primeBH'; }));
  assert('Веса лута — числа', loot.every(function(i) { return Number(i.weight) > 0; }));

  // ── Стоимость возможностей (планеты/системы) ──────────────
  const capSave = {
    ...SAMPLE_SAVE,
    techLevels: { astro: 0, quantum: 0, cyber: 0, eng: 0 },
    systems: 2,
    planets: [
      { type: 'rocky', baseOrbitR: 1.1, orbitR: 110, mass: 1.4, forming: false },
      { type: 'superEarth', baseOrbitR: 1.8, orbitR: 180, mass: 2.2, forming: false },
    ],
    otherSystems: [null, { name: 'Test', planets: [{ type: 'rocky', baseOrbitR: 1.1, orbitR: 110 }] }],
  };
  core.setState(capSave);
  Object.assign(client.S, {
    techLevels: capSave.techLevels,
    systems: capSave.systems,
    planets: capSave.planets,
    otherSystems: capSave.otherSystems,
  });

  const expectedCap = client.planetCost(0) + client.planetCost(1) +
    client.planetCost(0) + client.systemCost(0) + client.systemCost(1);
  assert('Стоимость возможностей совпадает с клиентом',
    Math.abs(core.capability() - expectedCap) < 1e-6,
    `server=${core.capability()} client=${expectedCap}`);
  assert('Стоимость возможностей больше нуля', core.capability() > 0);
  const zero = core.accrueOffline(SAMPLE_SAVE, 0);
  assert('Нулевой офлайн ничего не начисляет',
    zero.earned.dust === 0 && zero.earned.energy === 0 && zero.earned.civ === 0);

  const capped = core.accrueOffline(SAMPLE_SAVE, 365 * 24 * HOUR);
  const dustCapHours = client.STORAGE_CFG.getDustCapHours(SAMPLE_SAVE.storageLevels.dust);
  assert('Офлайн ограничен часами накопления хранилища',
    capped.earned.dust <=
      Math.floor(clientRates.dust * dustCapHours * HOUR * eff) + 1,
    `earned=${capped.earned.dust}`);

  // Повторный вызов с тем же elapsed даёт тот же результат (не копится)
  const again = core.accrueOffline(SAMPLE_SAVE, HOUR);
  assert('Повторный расчёт идемпотентен',
    again.earned.dust === res.earned.dust && again.data.dust === res.data.dust);

  console.log('========================================');
  console.log(`ИТОГО: Пройдено ${passed}, Провалено ${failed}`);
  if (failed > 0) process.exitCode = 1;
})();
