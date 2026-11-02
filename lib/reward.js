// ═══════════════════════════════════════════════════════════════
//  REWARD.JS — сверка «прочего» дохода (миссии, кометы, частицы,
//  ежедневные награды).
//
//  Пассивный доход и клики сервер считает сам. Всё остальное клиент
//  делает локально, поэтому он периодически присылает отчёт:
//  «с прошлого отчёта я заработал столько-то сверх пассивки».
//
//  Сервер не верит числу на слово: он знает доход в секунду из
//  game-core и разрешает «сверх пассивки» не больше, чем
//  rate * elapsed * K. Всё, что выше, не зачисляется в кошелёк.
//
//  Функции чистые — тестируются без Redis.
// ═══════════════════════════════════════════════════════════════

export const REWARD_FIELDS = ['dust', 'energy', 'civ'];

function nonNegative(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Ограничивает запрошенную награду тем, что сервер готов зачислить.
 * @param {{dust:number, energy:number, civ:number}} reported — что прислал клиент
 * @param {{dust:number, energy:number, civ:number}} maxExtra — предел по правилам игры
 * @returns {{dust:number, energy:number, civ:number}} зачисляется
 */
export function clampReward(reported, maxExtra) {
  const credit = { dust: 0, energy: 0, civ: 0 };
  for (const field of REWARD_FIELDS) {
    credit[field] = Math.min(
      nonNegative(reported && reported[field]),
      nonNegative(maxExtra && maxExtra[field])
    );
  }
  return credit;
}

/** Есть ли что зачислять (чтобы не писать в Redis зря). */
export function hasReward(credit) {
  if (!credit || typeof credit !== 'object') return false;
  return REWARD_FIELDS.some(function(field) { return nonNegative(credit[field]) > 0; });
}

/**
 * Предел «прочего» дохода за интервал.
 * @param {{dust:number, energy:number, civ:number}} rates — доход в секунду
 * @param {number} seconds — сколько секунд прошло (уже ограничено сервером)
 * @param {number} share — во сколько раз «прочее» может превышать пассивку
 */
export function maxExtraReward(rates, seconds, share) {
  const sec = Math.max(0, Number(seconds) || 0);
  const k = Number.isFinite(Number(share)) ? Math.max(0, Number(share)) : 0;
  return {
    dust: Math.max(0, Number(rates && rates.dust) || 0) * sec * k,
    energy: Math.max(0, Number(rates && rates.energy) || 0) * sec * k,
    civ: Math.max(0, Number(rates && rates.civ) || 0) * sec * k,
  };
}
