// ═══════════════════════════════════════════════════════════════
//  WALLET.JS — серверный «кошелёк» ресурсов (вариант C, этап 1).
//
//  Идея: сервер ведёт собственный счёт пыли/энергии/цив. Клиент
//  по-прежнему считает игру локально, но при сохранении сервер
//  сверяет баланс:
//
//    • траты (баланс стал меньше) — принимаем всегда: испортить
//      баланс в меньшую сторону нельзя, это только потеря;
//    • прирост — только в пределах того, что сервер сам начислил
//      (пассивный доход + отчёты о кликах), плюс небольшой допуск
//      на награды, которые пока остаются клиентскими.
//
//  Всё чистое: без Redis, Express и игровых модулей — только числа,
//  чтобы это можно было протестировать отдельно.
// ═══════════════════════════════════════════════════════════════

export const WALLET_FIELDS = ['dust', 'dustTotal', 'energy', 'civLevel', 'metalAmount'];

// Поля, которые клиент может тратить (dustTotal только растёт)
export const SPENDABLE_FIELDS = ['dust', 'energy', 'civLevel', 'metalAmount'];

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Начальный кошелёк из сейва. Используется один раз — при первом
 * появлении пользователя (или если кошелёк потерялся).
 */
export function walletFromSave(save, now) {
  return {
    dust: num(save && save.dust),
    dustTotal: num(save && save.dustTotal),
    energy: num(save && save.energy),
    civLevel: num(save && save.civLevel),
    metalAmount: num(save && save.metalAmount),
    updatedAt: Number(now) || Date.now(),
  };
}

/** Значения кошелька для записи в сейв. */
export function walletToSavePatch(wallet) {
  return {
    dust: wallet.dust,
    dustTotal: wallet.dustTotal,
    energy: wallet.energy,
    civLevel: wallet.civLevel,
    metalAmount: wallet.metalAmount,
  };
}

/**
 * Пассивное начисление за прошедшее время.
 * @param {object} wallet
 * @param {number} elapsedSec
 * @param {{dust:number, energy:number, civ:number}} rates — доход в секунду
 * @param {{dust:number, energy:number, civ:number}} caps — лимиты
 * @param {number} efficiency — 1.0 онлайн, CFG.offlineEfficiency офлайн
 * @returns {{dust:number, energy:number, civ:number}} начислено
 */
export function accruePassive(wallet, elapsedSec, rates, caps, efficiency) {
  const sec = Math.max(0, Number(elapsedSec) || 0);
  const eff = Number.isFinite(Number(efficiency)) ? Math.max(0, Number(efficiency)) : 1;

  const add = function(field, rate, cap) {
    const r = Math.max(0, Number(rate) || 0);
    if (r === 0) return 0;
    const room = Math.max(0, (Number(cap) || 0) - wallet[field]);
    if (room === 0) return 0;
    const want = r * sec * eff;
    const got = Math.min(want, room);
    wallet[field] += got;
    return got;
  };

  return {
    dust: add('dust', rates && rates.dust, caps && caps.dust),
    energy: add('energy', rates && rates.energy, caps && caps.energy),
    civ: add('civLevel', rates && rates.civ, caps && caps.civ),
    metals: add('metalAmount', rates && rates.metals, caps && caps.metals),
  };
}

/**
 * Начисление за клики. Клиент присылает их пачками, сервер ограничивает
 * частоту отдельно (rate limit), а сумму считает по игровой формуле.
 */
export function creditClicks(wallet, gainPerClick, clicks, capDust, now) {
  const n = Math.max(0, Math.min(1000, Math.floor(Number(clicks) || 0)));
  const gain = Math.max(0, Number(gainPerClick) || 0);
  if (n === 0 || gain === 0) return 0;

  const room = Math.max(0, (Number(capDust) || 0) - wallet.dust);
  const credited = Math.min(gain * n, room);
  wallet.dust += credited;
  wallet.dustTotal += credited;
  wallet.updatedAt = Number(now) || wallet.updatedAt;
  return credited;
}

/**
 * Сверка клиентского сейва с кошельком.
 * Мутирует wallet (новый баланс) и возвращает исправленный сейв.
 *
 * @returns {{data:object, clamped:string[], spent:string[]}}
 */
export function reconcileWallet(wallet, save, allowance) {
  const data = Object.assign({}, save);
  const clamped = [];
  const spent = [];
  const allow = allowance || {};

  for (const field of SPENDABLE_FIELDS) {
    const client = Number(save[field]);
    const walletValue = wallet[field];

    if (!Number.isFinite(client) || client < 0) {
      // Не число/отрицательное — берём свой баланс
      data[field] = walletValue;
      clamped.push(field);
      continue;
    }

    if (client <= walletValue) {
      // Траты принимаем: баланс уменьшился — это не выгода
      if (client < walletValue) spent.push(field);
      wallet[field] = client;
      data[field] = client;
      continue;
    }

    // Прирост: не больше, чем сервер успел начислить + допуск на награды
    const share = Number(allow[field]);
    const maxValue = walletValue + (Number.isFinite(share) && share > 0 ? share : 0);

    if (client > maxValue) {
      wallet[field] = maxValue;
      data[field] = maxValue;
      clamped.push(field);
    } else {
      wallet[field] = client;
      data[field] = client;
    }
  }

  // dustTotal — счётчик «всего заработано», только растёт
  const clientTotal = Number(save.dustTotal);
  const totalAllow = Math.max(0, Number(allow.dust) || 0);
  const maxTotal = wallet.dustTotal + totalAllow;
  if (!Number.isFinite(clientTotal) || clientTotal < wallet.dustTotal) {
    data.dustTotal = wallet.dustTotal;
  } else if (clientTotal > maxTotal) {
    data.dustTotal = maxTotal;
    wallet.dustTotal = maxTotal;
    if (clamped.indexOf('dustTotal') === -1) clamped.push('dustTotal');
  } else {
    data.dustTotal = clientTotal;
    wallet.dustTotal = clientTotal;
  }

  return { data, clamped, spent };
}

/**
 * Допуск на награды, которые пока выдаёт клиент (миссии, сундуки, ежедневные).
 * Считается от лимита ресурса, чтобы не зависеть от масштаба баланса.
 */
export function rewardAllowance(caps, share) {
  const s = Number.isFinite(Number(share)) ? Math.max(0, Number(share)) : 0;
  return {
    dust: Math.max(0, (Number(caps && caps.dust) || 0) * s),
    energy: Math.max(0, (Number(caps && caps.energy) || 0) * s),
    civ: Math.max(0, (Number(caps && caps.civ) || 0) * s),
    metals: Math.max(0, (Number(caps && caps.metals) || 0) * s),
  };
}
