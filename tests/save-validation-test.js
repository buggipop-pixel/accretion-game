// ═══════════════════════════════════════════════════════════════
//  Тесты lib/save-validation.js — то, чем сервер защищается от
//  подменённых сейвов и поддельного initData.
// ═══════════════════════════════════════════════════════════════
const crypto = require('crypto');

let passed = 0;
let failed = 0;

function assert(name, cond) {
  if (cond) { console.log('✅ ' + name); passed++; }
  else { console.error('❌ ' + name); failed++; }
}

const BASE_SAVE = {
  stage: 'system',
  lastTick: 1700000000000,
  dust: 1000,
  dustTotal: 5000,
  energy: 50,
  metalAmount: 20,
  civLevel: 3,
  planets: [{ type: 'rocky' }],
};

function makeInitData(token, user, authDate) {
  const params = new URLSearchParams();
  params.set('auth_date', String(authDate));
  params.set('query_id', 'AAHtest');
  params.set('user', JSON.stringify(user));

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

(async () => {
  const {
    validateSaveData,
    detectSaveAnomalies,
    validateInitData,
    LIMITS,
    KNOWN_STAGES,
  } = await import('../lib/save-validation.js');

  console.log('========================================');
  console.log('🧪 ТЕСТЫ ВАЛИДАЦИИ СЕЙВОВ И INITDATA');
  console.log('========================================');

  const now = 1700000000000;

  // ── Структура сейва ───────────────────────────────────────────
  const okSave = validateSaveData(BASE_SAVE, { now });
  assert('Нормальный сейв проходит', okSave.ok === true && okSave.data.dust === 1000);
  assert('Все стадии из config.js известны', KNOWN_STAGES.has('system') && KNOWN_STAGES.has('galaxy'));

  const badStage = validateSaveData({ ...BASE_SAVE, stage: 'hacked' }, { now });
  assert('Неизвестная стадия отклоняется', badStage.ok === false);

  // ★ Реальный сейв из state.js: вложенные объекты в числовых полях
  // (storageProgress/systemShopProgress — объекты, а не числа)
  const realistic = {
    ...BASE_SAVE,
    systems: 3,
    prestigeLevel: 0,
    galaxies: 1,
    // ★ Реальный клиент присылает объект, а не число — это не должно давать 400.
    phaseProgress: { cloud: 0, condense: 0, protostar: 0 },
    storageProgress: { dust: 0, energy: 0, civ: 0 },
    systemShopProgress: { dust: 0, energy: 0, civ: 0 },
    storageLevels: { dust: 2, energy: 1, civ: 0 },
    planets: [{ type: 'rocky', moons: [] }],
    otherSystems: [null, { name: 'Test', planets: [] }],
    settings: { brightness: 1, sound: true },
    boosters: { incomeUntil: 0 },
    primeSystem: null,
    eventLog: [],
    anticheat: { flags: 0, reasons: [], ts: 0 },
  };
  const realisticRes = validateSaveData(realistic, { now });
  assert('Реалистичный сейв с вложенными объектами проходит',
    realisticRes.ok === true && realisticRes.flags.length === 0);

  // ★ Регресс #7: реальный поздний сейв (~40 систем) не должен получать 400.
  // Ключи считаем так же, как walk() в lib/save-validation.js.
  function countKeys(value) {
    if (value === null || typeof value !== 'object') return 0;
    if (Array.isArray(value)) return value.reduce((sum, item) => sum + countKeys(item), 0);
    const keys = Object.keys(value);
    return keys.length + keys.reduce((sum, k) => sum + countKeys(value[k]), 0);
  }
  function makePlanet(seed) {
    return {
      type: 'rocky', angle: seed * 0.1, speed: 0.01, baseOrbitR: 90 + seed, orbitR: 90 + seed,
      driftPhase: 0.5, rotation: seed, seed: seed, forming: false, formUntil: 0,
      mass: 1.2, diameter: 9000, precession: 0.2, trueAnomaly: seed * 0.3,
      moons: [
        { type: 'rocky', angle: seed, seed: seed + 1 },
        { type: 'ice', angle: seed + 1, seed: seed + 2 },
      ],
    };
  }
  const lateGame = {
    stage: 'galaxy',
    lastTick: now - 60000,
    dust: 1e12, dustTotal: 1e15, energy: 1e5, metalAmount: 1e7, civLevel: 120,
    prestigeLevel: 4, galaxies: 2, systems: 1001, totalSystemsCreated: 1000,
    systemIncomeBonus: 0.5, systemCostFloor: 1,
    phaseProgress: { cloud: 1, condense: 1, protostar: 1 },
    storageProgress: { dust: 10, energy: 5, civ: 2 },
    systemShopProgress: { dust: 0, energy: 0, civ: 0 },
    storageLevels: { dust: 5, energy: 4, civ: 3 },
    activeSystemIdx: 0,
    planets: [makePlanet(1), makePlanet(2)],
    otherSystems: [null],
    settings: { brightness: 1, sound: true, music: false },
    boosters: { incomeUntil: 0 },
    primeSystem: null,
    anticheat: { flags: 0, reasons: [], ts: now },
    eventLogUnread: 0,
    eventLog: [],
  };
  for (let i = 1; i <= 1000; i++) {
    const planets = [];
    for (let p = 0; p < 6; p++) planets.push(makePlanet(i * 10 + p));
    lateGame.otherSystems.push({
      name: 'Система-' + i, type: 'G', starType: 'G', color: '#fff',
      seed: i, createdAt: now - i * 1000, planets: planets,
    });
  }
  for (let i = 0; i < 100; i++) {
    lateGame.eventLog.push({
      ts: now - i * 60000, type: 'invasion_spawn', text: 'Атака ' + i,
      icon: '⚔', color: '#f55', meta: { systemIdx: i % 41, tierKey: 'raid' },
    });
  }
  const keyCount = countKeys(lateGame);
  assert('Поздний сейв (1000 систем, ' + keyCount + ' ключей) проходит',
    validateSaveData(lateGame, { now }).ok === true);
  assert('Поздний сейв превышает старый лимит 5000 ключей', keyCount > 5000);
  assert('Лимит ключей вмещает галактику на 1000+ систем', LIMITS.maxTotalKeys >= 1000000);
  const lateGameBytes = Buffer.byteLength(JSON.stringify(lateGame));
  assert('Поздний сейв влезает в 12 МБ сервера (' + (lateGameBytes / 1024 / 1024).toFixed(1) + ' МБ)',
    lateGameBytes < 12 * 1024 * 1024);

  // ★ Защита не ослаблена: сейв с > maxTotalKeys ключей по-прежнему отклоняется.
  const bomb = { stage: 'system', lastTick: now, dust: 1 };
  for (let i = 0; i < 20; i++) bomb['k' + i] = i;
  // Инжектируем маленький лимит, чтобы не строить миллион ключей в тесте.
  const bombRes = validateSaveData(bomb, { now, limits: { maxTotalKeys: 5 } });
  assert('Сейв с > maxTotalKeys ключей отклоняется',
    bombRes.ok === false && bombRes.error === 'too many keys');

  const stringDust = validateSaveData({ ...BASE_SAVE, dust: '1e999' }, { now });
  assert('Строка вместо числа отклоняется', stringDust.ok === false);

  const hugeNumber = validateSaveData({ ...BASE_SAVE, dust: 1e300 }, { now });
  assert('Число за пределами диапазона отклоняется', hugeNumber.ok === false);

  const proto = JSON.parse('{"stage":"system","lastTick":1,"__proto__":{"polluted":true}}');
  const protoRes = validateSaveData(proto, { now });
  assert('Ключ __proto__ отклоняется', protoRes.ok === false);

  let deep = { value: 1 };
  for (let i = 0; i < 12; i++) deep = { nested: deep };
  const deepRes = validateSaveData({ ...BASE_SAVE, deep }, { now });
  assert('Слишком глубокая вложенность отклоняется', deepRes.ok === false);

  const bigArray = validateSaveData({ ...BASE_SAVE, planets: new Array(60000).fill(1) }, { now });
  assert('Слишком длинный массив отклоняется', bigArray.ok === false);

  const noStage = validateSaveData({ lastTick: 1, dust: 1 }, { now });
  assert('Сейв без stage отклоняется', noStage.ok === false);

  // ── Метка времени ────────────────────────────────────────────
  const futureTick = validateSaveData({ ...BASE_SAVE, lastTick: now + 30 * 86400000 }, { now });
  assert('lastTick из будущего зажимается',
    futureTick.ok === true && futureTick.data.lastTick <= now + 2 * 86400000 &&
    futureTick.flags.indexOf('last_tick_clamped') >= 0);

  const normalTick = validateSaveData({ ...BASE_SAVE, lastTick: now - 3600000 }, { now });
  assert('Обычный lastTick не трогаем', normalTick.ok === true && normalTick.flags.length === 0);

  // ── Аномалии прогресса ───────────────────────────────────────
  const prev = { ...BASE_SAVE, dust: 1000, energy: 50 };
  const jump = detectSaveAnomalies(prev, { ...BASE_SAVE, dust: 1e12 }, now - 5000, { now });
  assert('Скачок ресурсов помечается', jump.indexOf('jump:dust') >= 0);

  const honest = detectSaveAnomalies(prev, { ...BASE_SAVE, dust: 1100 }, now - 5000, { now });
  assert('Обычный прирост не помечается', honest.length === 0);

  const rewind = detectSaveAnomalies(
    { ...BASE_SAVE, lastTick: now },
    { ...BASE_SAVE, lastTick: now - 3 * 3600000 },
    now - 600000,
    { now }
  );
  assert('Откат lastTick назад помечается', rewind.indexOf('last_tick_rewind') >= 0);

  // ── initData ─────────────────────────────────────────────────
  const TOKEN = '123456:TEST-TOKEN';
  const USER = { id: 777000111, first_name: 'Тест' };
  const nowSec = Math.floor(now / 1000);

  const goodInit = makeInitData(TOKEN, USER, nowSec);
  const user = validateInitData(goodInit, TOKEN, { now });
  assert('Подписанный initData принимается', user && user.id === USER.id);

  const otherToken = validateInitData(goodInit, '999:ДРУГОЙ', { now });
  assert('initData с чужим ботом отклоняется', otherToken === null);

  const tampered = goodInit.replace('user=', 'user=x');
  assert('Подменённый initData отклоняется', validateInitData(tampered, TOKEN, { now }) === null);

  const expired = validateInitData(makeInitData(TOKEN, USER, nowSec - 2 * 86400), TOKEN, { now });
  assert('Просроченный initData отклоняется', expired === null);

  const fromFuture = validateInitData(makeInitData(TOKEN, USER, nowSec + 3600), TOKEN, { now });
  assert('initData из будущего отклоняется', fromFuture === null);

  const badUser = validateInitData(makeInitData(TOKEN, { id: 'abc' }, nowSec), TOKEN, { now });
  assert('initData с нечисловым user.id отклоняется', badUser === null);

  const tooLong = validateInitData('a'.repeat(9000), TOKEN, { now });
  assert('Слишком длинный initData отклоняется', tooLong === null);

  console.log('========================================');
  console.log(`ИТОГО: Пройдено ${passed}, Провалено ${failed}`);
  if (failed > 0) process.exitCode = 1;
})();
