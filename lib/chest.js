// ═══════════════════════════════════════════════════════════════
//  CHEST.JS — серверный выбор награды за платный сундук.
//
//  Раньше предмет выбирал клиент (Math.random + CHEST_CFG), значит
//  платную награду можно было выдать себе бесплатно. Теперь ключ
//  выбирает сервер при подтверждении оплаты, а клиент только
//  прокручивает рулетку до уже выбранного предмета.
//
//  Функция чистая (RNG инжектируется) — легко тестировать.
// ═══════════════════════════════════════════════════════════════

/**
 * Выбирает предмет из таблицы лута по весам.
 * @param {Array<{key:string, weight:number}>} lootTable
 * @param {() => number} random — RNG в [0,1), по умолчанию Math.random
 * @returns {string|null} ключ предмета
 */
export function rollChestReward(lootTable, random) {
  if (!Array.isArray(lootTable) || lootTable.length === 0) return null;

  const items = lootTable.filter(function(item) {
    return item && typeof item.key === 'string' && item.key.length > 0 &&
      Number.isFinite(Number(item.weight)) && Number(item.weight) > 0;
  });
  if (items.length === 0) return null;

  const rnd = (typeof random === 'function') ? random : Math.random;
  let value;
  try { value = Number(rnd()); } catch (e) { value = 0; }
  if (!Number.isFinite(value) || value < 0) value = 0;

  const total = items.reduce(function(sum, item) { return sum + Number(item.weight); }, 0);
  let roll = value * total;

  for (let i = 0; i < items.length; i++) {
    roll -= Number(items[i].weight);
    if (roll <= 0) return items[i].key;
  }
  // Погрешность округления — отдаём последний предмет
  return items[items.length - 1].key;
}
