// ═══════════════════════════════════════════════════════════════
//  Тесты lib/economy-actions.js — серверное право на премиум-щит.
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
    nextShieldEntitlement,
    overlayShieldEntitlement,
    isShieldSuspicious,
    SHIELD_PRODUCT_MS,
    HOUR_MS,
  } = await import('../lib/economy-actions.js');

  console.log('========================================');
  console.log('🧪 ТЕСТЫ СЕРВЕРНЫХ ПОКУПОК (щит)');
  console.log('========================================');

  const now = 1700000000000;

  // ── Право после оплаты ─────────────────────────────────────
  assert('Покупка даёт 24 часа', nextShieldEntitlement(0, now) === now + SHIELD_PRODUCT_MS);
  assert('Повторная покупка продлевает право',
    nextShieldEntitlement(now + SHIELD_PRODUCT_MS, now) === now + 2 * SHIELD_PRODUCT_MS);
  assert('Просроченное право не короче «сейчас + 24ч»',
    nextShieldEntitlement(now - 5 * 24 * HOUR_MS, now) === now + SHIELD_PRODUCT_MS);

  // ── Наложение на сейв ──────────────────────────────────────
  const save = { stage: 'system', shieldUntil: 0, dust: 1 };
  const withRight = overlayShieldEntitlement(save, now + 24 * HOUR_MS);
  assert('Право поднимает shieldUntil в сейве',
    withRight.shieldUntil === now + 24 * HOUR_MS);
  assert('Исходный сейв не мутирован', save.shieldUntil === 0);

  const higherLocal = { stage: 'system', shieldUntil: now + 48 * HOUR_MS };
  assert('Больший shieldUntil в сейве не занижается',
    overlayShieldEntitlement(higherLocal, now + 24 * HOUR_MS).shieldUntil === now + 48 * HOUR_MS);

  assert('Без права сейв не меняется', overlayShieldEntitlement(save, 0) === save);
  assert('Нет сейва — нет наложения', overlayShieldEntitlement(null, now) === null);

  // ── Детектор подделки ──────────────────────────────────────
  assert('24-часовой оплаченный щит не подозрителен',
    isShieldSuspicious({ shieldUntil: now + 24 * HOUR_MS }, now, now + 24 * HOUR_MS) === false);
  assert('8-часовой игровой щит не подозрителен',
    isShieldSuspicious({ shieldUntil: now + 8 * HOUR_MS }, now, 0) === false);
  assert('Щит на 30 дней подозрителен',
    isShieldSuspicious({ shieldUntil: now + 30 * 24 * HOUR_MS }, now, 0) === true);
  assert('Щит в прошлом не подозрителен',
    isShieldSuspicious({ shieldUntil: now - 5 * HOUR_MS }, now, 0) === false);
  assert('Без shieldUntil не подозрителен',
    isShieldSuspicious({ stage: 'system' }, now, 0) === false);

  console.log('========================================');
  console.log(`ИТОГО: Пройдено ${passed}, Провалено ${failed}`);
  if (failed > 0) process.exitCode = 1;
})();
