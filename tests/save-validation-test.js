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

  const bigArray = validateSaveData({ ...BASE_SAVE, planets: new Array(6000).fill(1) }, { now });
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
