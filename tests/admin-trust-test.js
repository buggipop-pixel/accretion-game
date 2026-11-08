// ═══════════════════════════════════════════════════════════════
//  ADMIN-TRUST TEST — выдача админки не должна считаться читерством.
//  Запуск: node tests/admin-trust-test.js
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
    ADMIN_WALLET_FIELDS,
    applyAdminWallet,
    adminCapabilityBonus,
    adminEntitlementPlan,
  } = await import('../lib/admin-trust.js');
  const { walletFromSave, reconcileWallet } = await import('../lib/wallet.js');

  console.log('========================================');
  console.log('🧪 ТЕСТЫ ДОВЕРИЯ К ПРАВКАМ АДМИНКИ');
  console.log('========================================');

  const now = 1700000000000;

  // ── Кошелёк ────────────────────────────────────────────────
  const oldSave = { dust: 100, dustTotal: 500, energy: 10, civLevel: 3, metalAmount: 42 };
  const adminSave = { dust: 1e9, dustTotal: 1e9, energy: 5e7, civLevel: 900, metalAmount: 123456 };

  const wallet = walletFromSave(oldSave, now);
  wallet.capBudget = 777;
  applyAdminWallet(wallet, adminSave, now);

  assert('Админ-кошелёк: все валютные поля, включая металлы',
    ADMIN_WALLET_FIELDS.every((f) => wallet[f] === adminSave[f]),
    JSON.stringify(wallet));
  assert('Админ-кошелёк: бюджет возможностей не потерян', wallet.capBudget === 777);
  assert('Админ-кошелёк: время обновлено', wallet.updatedAt === now);

  // Главное: после синхронизации кошелька сверка не обрезает выдачу.
  const rec = reconcileWallet(wallet, adminSave, { dust: 0, energy: 0, civ: 0, metals: 0 });
  assert('Сверка: админская выдача не обрезается', rec.clamped.length === 0, rec.clamped.join(','));
  assert('Сверка: металлы остаются админскими', rec.data.metalAmount === adminSave.metalAmount);

  // ── Возможности ────────────────────────────────────────────
  assert('Возможности: прирост считается', adminCapabilityBonus(1000, 5000) === 4000);
  assert('Возможности: уменьшение не даёт бюджет', adminCapabilityBonus(5000, 1000) === 0);
  assert('Возможности: мусор не ломает', adminCapabilityBonus(undefined, NaN) === 0);

  // ── Права на щит/бустер ────────────────────────────────────
  const shield = adminEntitlementPlan('shieldUntil', { shieldUntil: now + 72 * 3600 * 1000 });
  assert('Право: админский щит попадает в entitlement',
    shield && shield.type === 'shield' && shield.until === now + 72 * 3600 * 1000);

  const booster = adminEntitlementPlan('boosters', { boosters: { incomeUntil: now + 5 * 3600 * 1000 } });
  assert('Право: админский бустер попадает в entitlement',
    booster && booster.type === 'booster' && booster.until === now + 5 * 3600 * 1000);

  const cleared = adminEntitlementPlan('shieldUntil', { shieldUntil: 0 });
  assert('Право: снятие щита даёт until=0', cleared && cleared.until === 0);

  assert('Право: обычное поле не трогает entitlement',
    adminEntitlementPlan('dust', { dust: 1 }) === null);

  console.log('========================================');
  console.log(`ИТОГО: Пройдено ${passed}, Провалено ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
})();
