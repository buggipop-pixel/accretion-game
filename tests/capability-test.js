// ═══════════════════════════════════════════════════════════════
//  Тесты lib/capability.js — «планеты должны быть оплачены».
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
  const {
    capabilityAudit,
    remainingCapabilityBudget,
    chestCapabilityValue,
  } = await import('../lib/capability.js');

  console.log('========================================');
  console.log('🧪 ТЕСТЫ ПРОВЕРКИ ВОЗМОЖНОСТЕЙ');
  console.log('========================================');

  // ── Прирост не проверяем без прироста ─────────────────────
  const flat = capabilityAudit({ prevCost: 1000, nextCost: 1000, spentValue: 0, budget: 0 });
  assert('Нет прироста — всё оплачено', flat.funded === true && flat.delta === 0);

  const shrink = capabilityAudit({ prevCost: 5000, nextCost: 1000, spentValue: 0, budget: 0 });
  assert('Уменьшение возможностей не блокируется', shrink.funded === true);

  // ── Прирост, оплаченный тратами ───────────────────────────
  const paid = capabilityAudit({ prevCost: 1000, nextCost: 4000, spentValue: 5000, budget: 0 });
  assert('Прирост за счёт трат проходит',
    paid.funded === true && paid.delta === 3000 && paid.uncovered === 0);

  const partial = capabilityAudit({ prevCost: 1000, nextCost: 4000, spentValue: 1000, budget: 0 });
  assert('Недостаточно трат — прирост не обоснован',
    partial.funded === false && partial.uncovered === 2000);

  // ── Бюджет на бесплатные выдачи (сундуки) ─────────────────
  const withBudget = capabilityAudit({ prevCost: 1000, nextCost: 4000, spentValue: 1000, budget: 3000 });
  assert('Бюджет покрывает бесплатную выдачу', withBudget.funded === true);

  const budgetShort = capabilityAudit({ prevCost: 1000, nextCost: 9000, spentValue: 0, budget: 3000 });
  assert('Бюджета может не хватить', budgetShort.funded === false && budgetShort.uncovered === 5000);

  // ── Мусор на входе ────────────────────────────────────────
  const garbage = capabilityAudit({ prevCost: 'abc', nextCost: null, spentValue: undefined, budget: NaN });
  assert('Мусор не ломает проверку', garbage.delta === 0 && garbage.funded === true);

  const negative = capabilityAudit({ prevCost: 1000, nextCost: 2000, spentValue: -100, budget: -5 });
  assert('Отрицательные значения не помогают читеру',
    negative.covered === 0 && negative.funded === false);

  // ── Остаток бюджета ───────────────────────────────────────
  const remain = remainingCapabilityBudget(5000, 3000, 5000);
  assert('Бюджет не тратится, если прирост покрыт тратами', remain === 5000);

  const remain2 = remainingCapabilityBudget(5000, 4000, 2000);
  assert('Бюджет покрывает разницу', remain2 === 3000);

  const remain3 = remainingCapabilityBudget(5000, 6000, 0);
  assert('Бюджета не хватило — обнуляется', remain3 === 0);

  // ── Ценность сундука ──────────────────────────────────────
  assert('Сундук = скидка 50% (4 планеты + полсистемы)', chestCapabilityValue(1000, 50000) === 29000);
  assert('Мусор в цене сундука — ноль', chestCapabilityValue(null, undefined) === 0);
  assert('Отрицательные цены не идут в минус', chestCapabilityValue(-100, -5) === 0);

  console.log('========================================');
  console.log(`ИТОГО: Пройдено ${passed}, Провалено ${failed}`);
  if (failed > 0) process.exitCode = 1;
})();
