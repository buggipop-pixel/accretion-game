// ═══════════════════════════════════════════════════════════════
//  Тесты lib/wallet.js — серверный кошелёк (вариант C, этап 1).
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
    walletFromSave,
    walletToSavePatch,
    accruePassive,
    creditClicks,
    reconcileWallet,
    rewardAllowance,
  } = await import('../lib/wallet.js');

  console.log('========================================');
  console.log('🧪 ТЕСТЫ СЕРВЕРНОГО КОШЕЛЬКА');
  console.log('========================================');

  const now = 1700000000000;

  // ── Инициализация ──────────────────────────────────────────
  const w = walletFromSave({ dust: 100, dustTotal: 500, energy: 10, civLevel: 3 }, now);
  assert('Кошелёк берёт баланс из сейва',
    w.dust === 100 && w.energy === 10 && w.civLevel === 3 && w.dustTotal === 500);
  assert('Кошелёк помнит время', w.updatedAt === now);
  assert('Кошелёк не берёт мусор', walletFromSave({ dust: 'abc', energy: null }, now).dust === 0);

  const patch = walletToSavePatch(w);
  assert('Патч содержит все валютные поля',
    patch.dust === 100 && patch.dustTotal === 500 && patch.energy === 10 && patch.civLevel === 3);

  // ── Пассивное начисление ──────────────────────────────────
  const w2 = walletFromSave({ dust: 0, energy: 0, civLevel: 0 }, now);
  const earned = accruePassive(w2, 60, { dust: 10, energy: 2, civ: 0.5 }, { dust: 1e9, energy: 1e9, civ: 1e9 }, 1);
  assert('Пассивка считается по ставке', w2.dust === 600 && w2.energy === 120);
  assert('Цив начисляется дробно', Math.abs(w2.civLevel - 30) < 1e-9);
  assert('Возвращает сколько начислено', earned.dust === 600);

  const w3 = walletFromSave({ dust: 0 }, now);
  accruePassive(w3, 60, { dust: 10 }, { dust: 50 }, 1);
  assert('Пассивка не пробивает лимит', w3.dust === 50);

  const w4 = walletFromSave({ dust: 0 }, now);
  accruePassive(w4, 60, { dust: 10 }, { dust: 1e9 }, 0.6);
  assert('Офлайн-эффективность применяется', Math.abs(w4.dust - 360) < 1e-9);

  // ── Клики ─────────────────────────────────────────────────
  const w5 = walletFromSave({ dust: 0, dustTotal: 0 }, now);
  const credited = creditClicks(w5, 5, 10, 1e9, now);
  assert('Клики начисляются по формуле', credited === 50 && w5.dust === 50 && w5.dustTotal === 50);

  const w6 = walletFromSave({ dust: 0 }, now);
  assert('Клики не пробивают лимит',
    creditClicks(w6, 5, 10, 20, now) === 20 && w6.dust === 20);

  assert('Ноль кликов — ноль начисления', creditClicks(w5, 5, 0, 1e9, now) === 0);

  // ── Сверка сейва ──────────────────────────────────────────
  const allowance = { dust: 100, energy: 10, civ: 1 };

  const walletA = { dust: 1000, dustTotal: 5000, energy: 100, civLevel: 5, updatedAt: now };
  const ok = reconcileWallet(walletA, { dust: 1050, dustTotal: 5050, energy: 100, civLevel: 5 }, allowance);
  assert('Небольшой честный прирост принимается', ok.clamped.length === 0 && walletA.dust === 1050);

  const walletB = { dust: 1000, dustTotal: 5000, energy: 100, civLevel: 5, updatedAt: now };
  const cheat = reconcileWallet(walletB, { dust: 1e9, dustTotal: 1e9, energy: 100, civLevel: 5 }, allowance);
  assert('Нарисованный баланс обрезается',
    cheat.clamped.indexOf('dust') >= 0 && walletB.dust === 1100);
  assert('В сейв попадает обрезанное значение', cheat.data.dust === 1100);

  const walletC = { dust: 1000, dustTotal: 5000, energy: 100, civLevel: 5, updatedAt: now };
  const spend = reconcileWallet(walletC, { dust: 200, dustTotal: 5000, energy: 10, civLevel: 5 }, allowance);
  assert('Траты принимаются как есть',
    spend.clamped.length === 0 && walletC.dust === 200 && spend.spent.indexOf('dust') >= 0);

  const walletD = { dust: 1000, dustTotal: 5000, energy: 100, civLevel: 5, updatedAt: now };
  const bad = reconcileWallet(walletD, { dust: -50, dustTotal: 4000, energy: 100, civLevel: 5 }, allowance);
  assert('Отрицательный баланс заменяется серверным',
    bad.clamped.indexOf('dust') >= 0 && bad.data.dust === 1000);
  assert('dustTotal не уменьшается', bad.data.dustTotal === 5000);

  const walletE = { dust: 1000, dustTotal: 5000, energy: 100, civLevel: 5, updatedAt: now };
  const totalCheat = reconcileWallet(walletE, { dust: 1000, dustTotal: 1e12, energy: 100, civLevel: 5 }, allowance);
  assert('dustTotal обрезается по допуску',
    totalCheat.data.dustTotal === 5100 && totalCheat.clamped.indexOf('dustTotal') >= 0);

  // ── Допуск на награды ─────────────────────────────────────
  const allow = rewardAllowance({ dust: 10000, energy: 2000, civ: 100 }, 0.05);
  assert('Допуск считается от лимита',
    allow.dust === 500 && allow.energy === 100 && Math.abs(allow.civ - 5) < 1e-9);
  assert('Нулевая доля — нулевой допуск', rewardAllowance({ dust: 1e9 }, 0).dust === 0);

  console.log('========================================');
  console.log(`ИТОГО: Пройдено ${passed}, Провалено ${failed}`);
  if (failed > 0) process.exitCode = 1;
})();
