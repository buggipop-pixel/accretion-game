// ═══════════════════════════════════════════════════════════════
//  ECONOMY-ACTIONS.JS — маленькие «серверные действия» над сейвом.
//
//  Покупки за Stars нельзя выдавать из сейва: сейв пишет клиент,
//  значит щит можно просто нарисовать. Поэтому право на щит живёт
//  в Redis (entitlement), а в сейв попадает только НА БОЛЬШЕЕ из
//  «серверного права» и того, что уже было.
//
//  Модуль чистый: никаких Redis/Express, только арифметика над
//  числами, чтобы его можно было протестировать.
// ═══════════════════════════════════════════════════════════════

export const HOUR_MS = 60 * 60 * 1000;

// Премиум-щит продаётся на 24 часа (PRODUCTS.shield)
export const SHIELD_PRODUCT_MS = 24 * HOUR_MS;

// Игровые механики (ночной щит, миссии) выдают не больше 8 часов.
// Даём запас, чтобы честный игрок не попал под подозрение.
export const MISSION_SHIELD_MAX_MS = 9 * HOUR_MS;

/**
 * Новое право на щит после оплаты: не короче уже выданного.
 * @param {number} prevUntil — текущее право (timestamp), 0 если не было
 * @param {number} now — серверное время
 */
export function nextShieldEntitlement(prevUntil, now) {
  const prev = Number(prevUntil) || 0;
  const base = Math.max(prev, Number(now) || Date.now());
  return base + SHIELD_PRODUCT_MS;
}

/**
 * Накладывает серверное право на сейв при загрузке.
 * Возвращает новый объект (входной не мутируется).
 */
export function overlayShieldEntitlement(save, entitlementUntil) {
  const right = Number(entitlementUntil) || 0;
  if (!save || typeof save !== 'object' || right <= 0) return save;

  const current = Number(save.shieldUntil) || 0;
  if (current >= right) return save;

  const data = Object.assign({}, save);
  data.shieldUntil = right;
  return data;
}

/**
 * Правдоподобен ли shieldUntil в сейве?
 * Максимум, что может быть без подмены: серверное право или 8-часовой
 * игровой щит. Всё, что дальше, — повод пометить сейв.
 */
export function isShieldSuspicious(save, now, entitlementUntil) {
  if (!save || typeof save !== 'object') return false;
  const until = Number(save.shieldUntil) || 0;
  if (until <= 0) return false;

  const cap = Math.max(
    Number(entitlementUntil) || 0,
    (Number(now) || Date.now()) + MISSION_SHIELD_MAX_MS
  );
  // Час запаса на расхождение часов
  return until > cap + HOUR_MS;
}
