// ═══════════════════════════════════════════════════════════════
//  SAVE-CODEC TEST — сжатие облачных сейвов (lib/save-codec.js)
//  Запуск: node tests/save-codec-test.js
// ═══════════════════════════════════════════════════════════════
let passed = 0;
let failed = 0;

function assert(name, cond, extra) {
  if (cond) { console.log('✅ ' + name); passed++; }
  else {
    console.error('❌ ' + name + (extra ? ' → ' + extra : ''));
    failed++;
  }
}

(async () => {
  const { isSaveKey, encodeSaveValue, decodeSaveValue, SAVE_KEY_PREFIX } =
    await import('../lib/save-codec.js');

  console.log('========================================');
  console.log('🧪 ТЕСТЫ СЖАТИЯ ОБЛАЧНЫХ СЕЙВОВ');
  console.log('========================================');

  // ── Импорт ──────────────────────────────────────────────────
  assert('Импорт: encodeSaveValue — функция', typeof encodeSaveValue === 'function');
  assert('Импорт: decodeSaveValue — функция', typeof decodeSaveValue === 'function');
  assert('Префикс ключа сейва', SAVE_KEY_PREFIX === 'cloudsave:');
  assert('isSaveKey: сейв', isSaveKey('cloudsave:42') === true);
  assert('isSaveKey: не сейв', isSaveKey('wallet:42') === false);
  assert('isSaveKey: не строка', isSaveKey(null) === false);

  // ── Сжимаем реалистичный сейв ───────────────────────────────
  const systems = [];
  for (let i = 0; i < 400; i++) {
    systems.push({
      idx: i, star: 'g2v', type: 'home', destroyed: false,
      planets: [{ id: i * 10 + 1, type: 'terran', level: 3, buildings: [1, 2, 1] }],
    });
  }
  const payload = {
    version: 7,
    saved_at: 1700000000000,
    data: { stage: 'galaxy', systems, dust: '1.5e12', settings: { pushEnabled: true } },
  };
  const raw = JSON.stringify(payload);

  const envelope = await encodeSaveValue(raw);
  const parsedEnv = JSON.parse(envelope);

  assert('Сжатие: получился конверт', typeof envelope === 'string' && envelope !== raw);
  assert('Сжатие: version на верхнем уровне (для Lua CAS)', parsedEnv.version === 7);
  assert('Сжатие: saved_at сохранён', parsedEnv.saved_at === 1700000000000);
  assert('Сжатие: есть z и нет data', typeof parsedEnv.z === 'string' && parsedEnv.data === undefined);
  assert('Сжатие: размер меньше исходного минимум в 3 раза',
    envelope.length * 3 < raw.length,
    'raw=' + raw.length + ' env=' + envelope.length);

  // ── Разворачиваем обратно ───────────────────────────────────
  const restored = await decodeSaveValue(envelope);
  assert('Распаковка: строка вернулась точь-в-точь', restored === raw);
  assert('Распаковка: JSON эквивалентен',
    JSON.stringify(JSON.parse(restored)) === JSON.stringify(payload));

  // ── Совместимость и краевые случаи ──────────────────────────
  assert('Старый несжатый сейв проходит как есть',
    (await decodeSaveValue(raw)) === raw);

  const unicode = JSON.stringify({ version: 1, data: { name: 'Галактика «Млечный Путь» 🚀' } });
  const uniEnv = await encodeSaveValue(unicode);
  assert('Unicode: переживает сжатие',
    (await decodeSaveValue(uniEnv)) === unicode);

  assert('Не-JSON строка проходит как есть',
    (await decodeSaveValue('PONG')) === 'PONG');
  assert('Пустая строка проходит как есть',
    (await decodeSaveValue('')) === '');
  assert('Пустое значение при сжатии не меняется',
    (await encodeSaveValue('')) === '');
  assert('Невалидный JSON при сжатии не меняется',
    (await encodeSaveValue('{oops')) === '{oops');

  // Повторное сжатие уже сжатого конверта не должно «заворачивать» его ещё раз.
  const twice = await encodeSaveValue(envelope);
  assert('Повторное сжатие конверта идемпотентно', twice === envelope);

  // Повреждённый конверт — явная ошибка, а не тихий мусор.
  let corrupted = null;
  try {
    const bad = JSON.stringify({ version: 1, saved_at: 0, z: 'AAAA' });
    await decodeSaveValue(bad);
  } catch (e) {
    corrupted = e.message;
  }
  assert('Битый конверт → ошибка', corrupted === 'Corrupted compressed cloud save', String(corrupted));

  // ── Итог ────────────────────────────────────────────────────
  console.log('========================================');
  console.log('ИТОГО: Пройдено ' + passed + ', Провалено ' + failed);
  console.log('========================================');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('💥 Тест упал:', e);
  process.exit(1);
});
