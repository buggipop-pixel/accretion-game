// ═══════════════════════════════════════════════════════════════
//  ADMIN-TRUST.JS — правки из админки считаются доверенными.
//
//  Админ меняет сейв в обход экономики. Если после этого не обновить
//  серверные «источники правды», следующая же проверка обрежет выдачу:
//
//    • /api/load подменяет валюты значениями кошелька;
//    • /api/save обрезает ресурсы по кошельку, щит — по праву/9 часам,
//      бустер — строго по server entitlement;
//    • проверка возможностей считает новые системы/планеты
//      неоплаченными.
//
//  Модуль чистый: только числа и объекты, без Redis и Express.
// ═══════════════════════════════════════════════════════════════

export const ADMIN_WALLET_FIELDS = ['dust', 'dustTotal', 'energy', 'civLevel', 'metalAmount'];

/**
 * Приводит серверный кошелёк к тем значениям, которые записал админ.
 * Важно: металлы тоже, иначе /api/load вернёт старый metalAmount и
 * выдача «исчезнет» при следующем входе игрока.
 */
export function applyAdminWallet(wallet, save, now) {
  const w = (wallet && typeof wallet === 'object') ? wallet : {};
  for (let i = 0; i < ADMIN_WALLET_FIELDS.length; i++) {
    const field = ADMIN_WALLET_FIELDS[i];
    w[field] = Math.max(0, Number(save && save[field]) || 0);
  }
  w.updatedAt = Number(now) || Date.now();
  return w;
}

/**
 * Насколько админ увеличил «возможности» (планеты + системы).
 * Эту величину надо добавить в wallet.capBudget — так же, как это
 * делает платный сундук, иначе проверка сочтёт прирост подделкой.
 */
export function adminCapabilityBonus(prevCost, nextCost) {
  const prev = Number(prevCost);
  const next = Number(nextCost);
  return Math.max(0, (Number.isFinite(next) ? next : 0) - (Number.isFinite(prev) ? prev : 0));
}

/**
 * Какое серверное право нужно выдать/снять после правки поля.
 * shieldUntil и boosters.incomeUntil иначе обрезаются на сохранении.
 *
 * @returns {{type:'shield'|'booster', until:number}|null}
 */
export function adminEntitlementPlan(field, save) {
  if (field === 'shieldUntil') {
    return { type: 'shield', until: Math.max(0, Number(save && save.shieldUntil) || 0) };
  }
  if (field === 'boosters') {
    const until = Math.max(0, Number(save && save.boosters && save.boosters.incomeUntil) || 0);
    return { type: 'booster', until: until };
  }
  return null;
}
