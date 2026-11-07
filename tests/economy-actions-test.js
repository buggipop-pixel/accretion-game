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
    nextBoosterUntil,
    clampShield,
    MISSION_SHIELD_MAX_MS,
    overlayBoosterEntitlement,
    clampBooster,
    SHIELD_PRODUCT_MS,
    HOUR_MS,
  } = await import('../lib/economy-actions.js');

  console.log('========================================');
  console.log('🧪 ТЕСТЫ СЕРВЕРНЫХ ПОКУПОК (щит и бустер)');

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

  // ── Бустер дохода ──────────────────────────────────────────
  const BOOST_MS = 2 * HOUR_MS;

  assert('Бустер отсчитывается от «сейчас»',
    nextBoosterUntil(0, now, BOOST_MS) === now + BOOST_MS);
  assert('Повторная покупка продлевает бустер',
    nextBoosterUntil(now + BOOST_MS, now, BOOST_MS) === now + 2 * BOOST_MS);
  assert('Просроченный бустер не даёт меньше двух часов',
    nextBoosterUntil(now - 5 * HOUR_MS, now, BOOST_MS) === now + BOOST_MS);

  const forgedBooster = { stage: 'system', boosters: { incomeUntil: now + 30 * 24 * HOUR_MS } };
  const overlaid = overlayBoosterEntitlement(forgedBooster, now + BOOST_MS, now);
  assert('На загрузке бустер = серверное право',
    overlaid.boosters.incomeUntil === now + BOOST_MS);
  assert('Исходный сейв не мутирован',
    forgedBooster.boosters.incomeUntil === now + 30 * 24 * HOUR_MS);

  const expired = overlayBoosterEntitlement({ boosters: { incomeUntil: now + HOUR_MS } }, now - HOUR_MS, now);
  assert('Истёкшее право обнуляет бустер', expired.boosters.incomeUntil === 0);

  const clamped = clampBooster({ boosters: { incomeUntil: now + 30 * 24 * HOUR_MS } }, now + BOOST_MS);
  assert('На сохранении подделённый бустер обрезается',
    clamped.boosters.incomeUntil === now + BOOST_MS);

  const legitBooster = { boosters: { incomeUntil: now + HOUR_MS } };
  assert('Легальный бустер не меняется',
    clampBooster(legitBooster, now + BOOST_MS) === legitBooster);
  assert('Без права бустер обнуляется',
    clampBooster({ boosters: { incomeUntil: now + HOUR_MS } }, 0).boosters.incomeUntil === 0);
  // ── Обрезка нарисованного щита ──────────────────────────
  const forgedShield = { stage: 'system', shieldUntil: now + 30 * 24 * HOUR_MS };
  const shieldClamped = clampShield(forgedShield, 0, now);
  assert('Нарисованный щит обрезается до игрового максимума',
    shieldClamped.shieldUntil === now + MISSION_SHIELD_MAX_MS);
  assert('Щит: исходный сейв не мутирован',
    forgedShield.shieldUntil === now + 30 * 24 * HOUR_MS);

  const paidShield = { shieldUntil: now + 24 * HOUR_MS };
  assert('Оплаченный щит не обрезается',
    clampShield(paidShield, now + 24 * HOUR_MS, now) === paidShield);

  const missionShield = { shieldUntil: now + 8 * HOUR_MS };
  assert('Игровой 8-часовой щит не обрезается',
    clampShield(missionShield, 0, now) === missionShield);

  assert('Щит без метки не трогается',
    clampShield({ stage: 'system' }, 0, now).shieldUntil === undefined);
  assert('Нет сейва — нет обрезки', clampShield(null, now, now) === null);

  console.log('========================================');
  console.log(`ИТОГО: Пройдено ${passed}, Провалено ${failed}`);
  if (failed > 0) process.exitCode = 1;
})();
