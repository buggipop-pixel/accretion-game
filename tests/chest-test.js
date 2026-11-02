// ═══════════════════════════════════════════════════════════════
//  Тесты lib/chest.js — серверный выбор награды за платный сундук.
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
  const { rollChestReward } = await import('../lib/chest.js');

  console.log('========================================');
  console.log('🧪 ТЕСТЫ СУНДУКА (серверный RNG)');
  console.log('========================================');

  // Таблица как в CHEST_CFG (сумма весов 100)
  const LOOT = [
    { key: 'blackHole', weight: 20 }, { key: 'pulsar', weight: 20 },
    { key: 'wormhole', weight: 20 }, { key: 'quasar', weight: 10 },
    { key: 'magnetar', weight: 10 }, { key: 'gravLens', weight: 10 },
    { key: 'massiveBH', weight: 4 }, { key: 'superBH', weight: 2 },
    { key: 'darkMatter', weight: 2 }, { key: 'quarkVoid', weight: 1 },
    { key: 'primeBH', weight: 1 },
  ];

  assert('RNG в начале диапазона → первый предмет',
    rollChestReward(LOOT, () => 0) === 'blackHole');
  assert('RNG 0.15 → blackHole', rollChestReward(LOOT, () => 0.15) === 'blackHole');
  assert('RNG 0.25 → pulsar', rollChestReward(LOOT, () => 0.25) === 'pulsar');
  assert('RNG 0.995 → primeBH (редкий)', rollChestReward(LOOT, () => 0.995) === 'primeBH');
  assert('RNG 1.0 (граница) → последний предмет',
    rollChestReward(LOOT, () => 1) === 'primeBH');

  // Свой маленький стол: проверяем точные границы
  const TWO = [{ key: 'a', weight: 1 }, { key: 'b', weight: 1 }];
  assert('Граница 0.5 попадает в первый', rollChestReward(TWO, () => 0.5) === 'a');
  assert('0.5001 попадает во второй', rollChestReward(TWO, () => 0.5001) === 'b');

  // Нулевые/битые веса не должны ломать распределение
  const DIRTY = [
    { key: 'zero', weight: 0 },
    { key: 'broken', weight: 'abc' },
    { key: 'good', weight: 5 },
  ];
  assert('Битые веса отбрасываются', rollChestReward(DIRTY, () => 0) === 'good');

  // Некорректный вход
  assert('null → null', rollChestReward(null) === null);
  assert('Пустая таблица → null', rollChestReward([]) === null);
  assert('Таблица без валидных предметов → null',
    rollChestReward([{ weight: 1 }]) === null);

  // Плохой RNG не должен ронять сервер
  assert('NaN от RNG → первый предмет', rollChestReward(LOOT, () => NaN) === 'blackHole');
  assert('Исключение в RNG → первый предмет',
    rollChestReward(LOOT, () => { throw new Error('boom'); }) === 'blackHole');
  assert('Отрицательный RNG → первый предмет', rollChestReward(LOOT, () => -1) === 'blackHole');

  // Распределение примерно соответствует весам (100k прогонов)
  const counts = {};
  for (let i = 0; i < 100000; i++) {
    const key = rollChestReward(LOOT, () => i / 100000);
    counts[key] = (counts[key] || 0) + 1;
  }
  assert('Каждый предмет из таблицы достижим',
    Object.keys(counts).length === LOOT.length);

  console.log('========================================');
  console.log(`ИТОГО: Пройдено ${passed}, Провалено ${failed}`);
  if (failed > 0) process.exitCode = 1;
})();
