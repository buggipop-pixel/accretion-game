// ═══════════════════════════════════════════════════════════════
//  Тесты lib/reward.js — ограничение «прочего» дохода.
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
  const { clampReward, hasReward, maxExtraReward } = await import('../lib/reward.js');

  console.log('========================================');
  console.log('🧪 ТЕСТЫ ОТЧЁТОВ О ДОХОДЕ (reward)');
  console.log('========================================');

  // ── Предел «прочего» дохода ────────────────────────────────
  const max = maxExtraReward({ dust: 100, energy: 2, civ: 0.5 }, 60, 2);
  assert('Предел пыли = rate * sec * K', max.dust === 12000);
  assert('Предел энергии считается так же', max.energy === 240);
  assert('Цив тоже', Math.abs(max.civ - 60) < 1e-9);

  const zero = maxExtraReward({ dust: 100 }, 0, 2);
  assert('Нулевой интервал — нулевой предел', zero.dust === 0 && zero.energy === 0);

  const noRates = maxExtraReward(null, 60, 2);
  assert('Без ставок предел нулевой', noRates.dust === 0 && noRates.civ === 0);

  // ── Ограничение заявки ─────────────────────────────────────
  const small = clampReward({ dust: 100, energy: 5, civ: 1 }, { dust: 1000, energy: 10, civ: 1 });
  assert('Малая заявка проходит целиком',
    small.dust === 100 && small.energy === 5 && small.civ === 1);

  const big = clampReward({ dust: 1e12, energy: 1e9, civ: 1e6 }, { dust: 1000, energy: 10, civ: 1 });
  assert('Большая заявка обрезается до предела',
    big.dust === 1000 && big.energy === 10 && big.civ === 1);

  const negative = clampReward({ dust: -500, energy: -1, civ: -2 }, { dust: 1000, energy: 10, civ: 1 });
  assert('Отрицательные значения не превращаются в доход',
    negative.dust === 0 && negative.energy === 0 && negative.civ === 0);

  const garbage = clampReward({ dust: 'abc', energy: null, civ: NaN }, { dust: 1000, energy: 10, civ: 1 });
  assert('Мусор вместо чисел даёт ноль',
    garbage.dust === 0 && garbage.energy === 0 && garbage.civ === 0);

  const noReport = clampReward(null, { dust: 1000 });
  assert('Нет отчёта — нет начисления', noReport.dust === 0);

  const noMax = clampReward({ dust: 500 }, null);
  assert('Нет предела — доход не зачисляется', noMax.dust === 0);

  const partial = clampReward({ dust: 5000 }, { dust: 1000, energy: 10 });
  assert('Поля независимы', partial.dust === 1000 && partial.energy === 0);

  // ── hasReward ──────────────────────────────────────────────
  assert('Есть доход — true', hasReward({ dust: 1 }) === true);
  assert('Нулевой доход — false', hasReward({ dust: 0, energy: 0, civ: 0 }) === false);
  assert('null — false', hasReward(null) === false);
  assert('Отрицательный — false', hasReward({ dust: -1 }) === false);

  console.log('========================================');
  console.log(`ИТОГО: Пройдено ${passed}, Провалено ${failed}`);
  if (failed > 0) process.exitCode = 1;
})();
