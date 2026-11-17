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

// ═══════════════════════════════════════════════════════════════
//  КОПИЛКА РАЗОВЫХ НАГРАД (reward bank)
//
//  Проблема: раньше «прочий» доход разрешался только как
//  rate * seconds * share за ОДИН отчёт. Отчёты идут каждые ~60 с,
//  поэтому лимит выходил ~2 минуты пассивки, а награда босса
//  (dustHours: 2–3) — это часы дохода. Защита молча съедала её,
//  а на следующем сейве ещё и обрезала баланс.
//
//  Решение: бакет, который пополняется с той же скоростью, но
//  копится между отчётами и выдаётся крупной порцией. Потолок
//  бакета — доля лимита хранилища, поэтому «печатать» деньги
//  быстрее пассивки всё равно нельзя, а баланс всё равно не
//  может превысить лимит хранилища.
// ═══════════════════════════════════════════════════════════════

// Сколько максимум секунд пассивки копится в бакет за один раз.
export const REWARD_BANK_MAX_SECONDS = 3600;

/** Потолок бакета: доля лимита хранилища по каждому полю. */
export function rewardBankMax(caps, share) {
  const s = Number.isFinite(Number(share)) ? Math.max(0, Number(share)) : 0;
  return {
    dust: Math.max(0, Number(caps && caps.dust) || 0) * s,
    energy: Math.max(0, Number(caps && caps.energy) || 0) * s,
    civ: Math.max(0, Number(caps && caps.civ) || 0) * s,
  };
}

/**
 * Текущий бакет кошелька (создаёт его при первом обращении).
 * Новая копилка стартует ПОЛНОЙ: иначе самая первая честная
 * крупная награда (босс/миссия/сундук) снова была бы обрезана.
 */
export function ensureRewardBank(wallet, caps, share) {
  const max = rewardBankMax(caps, share);
  let bank = wallet.rewardBank;

  if (!bank || typeof bank !== 'object') {
    bank = {};
    for (const field of REWARD_FIELDS) bank[field] = max[field];
    wallet.rewardBankAt = Number(wallet.rewardBankAt) || Date.now();
  }

  for (const field of REWARD_FIELDS) {
    const value = Number(bank[field]);
    const cap = max[field];
    const clean = Number.isFinite(value) && value > 0 ? value : 0;
    bank[field] = cap > 0 ? Math.min(clean, cap) : clean;
  }

  wallet.rewardBank = bank;
  return bank;
}

/**
 * Пополняет бакет за прошедшее с прошлого раза время.
 * Скорость = rate * share (та же, что у обычного лимита «прочего»).
 */
export function accrueRewardBank(wallet, rates, caps, share, now) {
  const bank = ensureRewardBank(wallet, caps, share);
  const max = rewardBankMax(caps, share);
  const k = Number.isFinite(Number(share)) ? Math.max(0, Number(share)) : 0;

  const t = Number(now);
  const since = Number(wallet.rewardBankAt);
  const dt = (Number.isFinite(t) && Number.isFinite(since))
    ? Math.max(0, (t - since) / 1000)
    : 0;
  const sec = Math.min(REWARD_BANK_MAX_SECONDS, dt);

  for (const field of REWARD_FIELDS) {
    const cap = max[field];
    if (!(cap > 0)) continue;
    const add = Math.max(0, Number(rates && rates[field]) || 0) * sec * k;
    if (add > 0) bank[field] = Math.min(cap, bank[field] + add);
  }

  if (Number.isFinite(t)) wallet.rewardBankAt = t;
  return bank;
}

/** Сколько «прочего» дохода сервер готов зачесть: начисленное + копилка. */
export function rewardBudget(accrued, bank) {
  const out = {};
  for (const field of REWARD_FIELDS) {
    out[field] = Math.max(0, Number(accrued && accrued[field]) || 0) +
      Math.max(0, Number(bank && bank[field]) || 0);
  }
  return out;
}

/**
 * Списывает из копилки ту часть награды, которую не покрыло
 * начисление за интервал.
 */
export function spendRewardBank(wallet, credit, accrued) {
  const bank = wallet && wallet.rewardBank;
  if (!bank || typeof bank !== 'object') return;

  for (const field of REWARD_FIELDS) {
    const used = Math.max(0,
      (Number(credit && credit[field]) || 0) - (Number(accrued && accrued[field]) || 0));
    if (used > 0) bank[field] = Math.max(0, (Number(bank[field]) || 0) - used);
  }
}
