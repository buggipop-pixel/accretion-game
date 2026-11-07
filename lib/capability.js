// ═══════════════════════════════════════════════════════════════
//  CAPABILITY.JS — проверка, что планеты и системы оплачены.
//
//  От «возможностей» зависит доход в секунду, поэтому читер рисует
//  себе планеты, чтобы сервер начислял быстрее. Логика простая:
//
//    прирост стоимости возможностей  ≤  сколько игрок реально потратил
//                                     + бюджет на бесплатные выдачи
//                                       (платные сундуки)
//
//  «Потратил» сервер считает сам: разница между своим балансом
//  и присланным, а не по словам клиента. Чистая функция — тестируется
//  без Redis и без игровых модулей.
// ═══════════════════════════════════════════════════════════════

/**
 * @param {{prevCost:number, nextCost:number, spentValue:number, budget:number}} input
 * @returns {{delta:number, covered:number, uncovered:number, funded:boolean}}
 */
export function capabilityAudit(input) {
  const prev = Number(input && input.prevCost);
  const next = Number(input && input.nextCost);
  const spent = Number(input && input.spentValue);
  const budget = Number(input && input.budget);

  const delta = Math.max(0, (Number.isFinite(next) ? next : 0) - (Number.isFinite(prev) ? prev : 0));
  const covered = Math.max(0, Number.isFinite(spent) ? spent : 0) +
    Math.max(0, Number.isFinite(budget) ? budget : 0);
  const uncovered = Math.max(0, delta - covered);

  return { delta, covered, uncovered, funded: uncovered <= 0 };
}

/**
 * Сколько бюджета осталось после проверки.
 * Бюджет расходуется только на ту часть прироста, которую не покрыли траты.
 */
export function remainingCapabilityBudget(budget, delta, spentValue) {
  const current = Math.max(0, Number(budget) || 0);
  const growth = Math.max(0, Number(delta) || 0);
  const spent = Math.max(0, Number(spentValue) || 0);
  const used = Math.max(0, growth - spent);
  return Math.max(0, current - used);
}
/**
 * Ценность одной платной выдачи (сундук): система из 8 планет + сама система.
 *
 * Раньше бюджет считался как 8·planetCost(0), а capability() суммирует
 * Σ planetCost(i) по орбитам. При planetCostExp = 2 это 204·P₀ против 8·P₀ —
 * в 25.5 раза меньше, поэтому ЧЕСТНАЯ покупка сундука помечалась
 * phantom_capability (а при CAPABILITY_ENFORCE=1 сейв отклонялся).
 *
 * Скидка пылью (клиент платит половину systemCost) — игровой сток, а не
 * граница безопасности: бюджет покрывает полную стоимость выдачи. Иначе
 * игрок без пыли на счету уходил бы в «неоплаченный» прирост.
 * Сумму по орбитам считает game-core (planetCostSum), чтобы формулы не
 * дублировались.
 */
export function chestCapabilityValue(planetCostSum8, systemCostNext) {
  const planets = Math.max(0, Number(planetCostSum8) || 0);
  const system = Math.max(0, Number(systemCostNext) || 0);
  return Math.floor(planets + system);
}
