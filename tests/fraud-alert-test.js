// ═══════════════════════════════════════════════════════════════
//  Тесты мягкого аудита кошелька и оповещений админки.
//
//  Контракт: сервер НЕ откатывает ресурсы и покупки. Подозрительный
//  прирост только описывается (причина, способ, доказательства) и
//  уходит в админку.
// ═══════════════════════════════════════════════════════════════
let passed = 0;
let failed = 0;

function assert(name, cond, extra) {
  if (cond) { console.log('✅ ' + name); passed++; }
  else {
    console.error('❌ ' + name + (extra !== undefined ? ' → ' + extra : ''));
    failed++;
  }
}

(async () => {
  const { auditWallet } = await import('../lib/wallet.js');
  const {
    createFraudAlert, mergeFraudAlerts, alertsFromRecord, summarizeFraudAlerts,
    FRAUD_ALERT_HISTORY_LIMIT,
  } = await import('../lib/fraud-alerts.js');

  console.log('========================================');
  console.log('🧪 ТЕСТЫ ОПОВЕЩЕНИЙ АНТИЧИТА');
  console.log('========================================');

  // ── 1. Крупный прирост принимается, но попадает в findings ──
  {
    const wallet = { dust: 1000, dustTotal: 5000, energy: 100, civLevel: 5, metalAmount: 0 };
    const save = { dust: 1e9, dustTotal: 1e9, energy: 100, civLevel: 5, metalAmount: 0 };
    const res = auditWallet(wallet, save, { dust: 100, energy: 10, civ: 1, metals: 1 });

    assert('Аудит не возвращает clamped', res.clamped === undefined);
    assert('Сейв получает клиентский баланс без обрезки', res.data.dust === 1e9, res.data.dust);
    assert('Кошелёк принимает клиентский баланс', wallet.dust === 1e9, wallet.dust);
    assert('Крупный прирост отмечен finding-ом',
      res.findings.some((f) => f.code === 'wallet_unearned_gain' && f.field === 'dust' && f.extra > 0));
    assert('dustTotal тоже проверяется',
      res.findings.some((f) => f.code === 'wallet_unearned_gain' && f.field === 'dustTotal'));
  }

  // ── 2. Честная трата не считается нарушением ───────────────
  {
    const wallet = { dust: 5000000, dustTotal: 5000000, energy: 100, civLevel: 5, metalAmount: 0 };
    const save = { dust: 100000, dustTotal: 5000000, energy: 100, civLevel: 5, metalAmount: 0 };
    const res = auditWallet(wallet, save, { dust: 100, energy: 10, civ: 1, metals: 1 });

    assert('Трата принимается без findings', res.findings.length === 0, JSON.stringify(res.findings));
    assert('Трата видна в spent', res.spent.indexOf('dust') >= 0);
    assert('Баланс после покупки сохранён', res.data.dust === 100000 && wallet.dust === 100000);
  }

  // ── 3. Некорректное значение не ломает сейв ─────────────────
  {
    const wallet = { dust: 1000, dustTotal: 5000, energy: 100, civLevel: 5, metalAmount: 0 };
    const res = auditWallet(wallet, { dust: -50, dustTotal: -1, energy: 100, civLevel: 5, metalAmount: 0 }, {});
    assert('Отрицательная пыль санитизируется в 0', res.data.dust === 0, res.data.dust);
    assert('Отрицательный dustTotal санитизируется в 0', res.data.dustTotal === 0, res.data.dustTotal);
    assert('Некорректные значения дают findings',
      res.findings.filter((f) => f.code === 'wallet_invalid_value').length >= 2);
  }

  // ── 4. История оповещений и дедупликация ────────────────────
  {
    const first = mergeFraudAlerts(null, createFraudAlert({
      code: 'wallet_unearned_gain', at: 1000000, title: 'Прирост',
      reason: 'причина', method: 'способ', fields: [{ field: 'dust' }],
    }), 1000000);
    assert('Первое оповещение записано', first.alerts.length === 1 && first.flags.indexOf('wallet_unearned_gain') >= 0);

    const second = mergeFraudAlerts(first, createFraudAlert({
      code: 'wallet_unearned_gain', at: 1030000, title: 'Прирост',
      reason: 'новая причина', method: 'новый способ', fields: [{ field: 'dust' }],
    }), 1030000);
    assert('Повтор в пределах минуты не плодит запись',
      second.alerts.length === 1 && second.alerts[0].count === 2, JSON.stringify(second.alerts));
    assert('Свежая причина сохраняется', second.alerts[0].reason === 'новая причина');

    const third = mergeFraudAlerts(second, createFraudAlert({
      code: 'wallet_unearned_gain', at: 1200000, title: 'Прирост',
      reason: 'позже', method: 'позже', fields: [{ field: 'dust' }],
    }), 1200000);
    assert('Повтор позже минуты — новая запись', third.alerts.length === 2, third.alerts.length);
  }

  // ── 5. Старые save_flag читаются как оповещения ─────────────
  {
    const legacy = alertsFromRecord({ flags: ['phantom_capability', 'jump:dust'], at: 123456 });
    assert('Старые флаги превращаются в alert-ы', legacy.length === 2);
    assert('У старого флага есть причина и способ',
      !!legacy[0].reason && !!legacy[0].method && legacy[0].title.indexOf('прирост') >= 0);
    const summary = summarizeFraudAlerts({ flags: ['phantom_capability'] });
    assert('Сводка считает флаги', summary.count === 1 && summary.flags[0] === 'phantom_capability');
  }

  // ── 6. История не растёт бесконечно ─────────────────────────
  {
    let rec = null;
    for (let i = 0; i < FRAUD_ALERT_HISTORY_LIMIT + 10; i++) {
      rec = mergeFraudAlerts(rec, createFraudAlert({
        code: 'jump:dust', at: 1000000 + i * 120000, title: 'Скачок',
        reason: 'r', method: 'm', fields: [{ field: 'dust' }],
      }), 1000000 + i * 120000);
    }
    assert('История ограничена лимитом', rec.alerts.length === FRAUD_ALERT_HISTORY_LIMIT, rec.alerts.length);
  }

  console.log('========================================');
  console.log(`ИТОГО: Пройдено ${passed}, Провалено ${failed}`);
  if (failed > 0) process.exitCode = 1;
})();
