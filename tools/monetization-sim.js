#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  tools/monetization-sim.js — Симуляция монетизации игры «Аккреция»
//
//  Цель (Шаг 4 аудита):
//    1. Сколько дней нужно играть бесплатно до 1-го Престижа.
//    2. Сколько стоят Stars в рублях/долларах (условно).
//    3. Что выгоднее: Сундук (200★) или Щит (100★) по ресурсам.
//    4. Вывод: не слишком ли сильно донат ломает игру.
//
//  ⚠️ Это ОЦЕНОЧНАЯ модель. Реальная экономика сложнее (клики,
//  цивилизация, энергия, металлы, вторжения, события). Здесь мы
//  моделируем только пассивную пыль как главный двигатель прогресса.
//  Все допущения явно вынесены в PARAMS и помечены комментариями.
// ═══════════════════════════════════════════════════════════════

'use strict';

// ─── Параметры из config.js (актуальные значения) ──────────────
const PARAMS = {
  // Стадии (baseRate — пассивная пыль/сек на стадии)
  stageBaseRate: { system: 1200, galaxy: 2500 },

  // Звёзды (rateMult). G-звезда — типичная для старта.
  starMult: 1.8,

  // Доход с планет (средняя rate по типам)
  planetAvgRate: 700, // rocky 250 … lava 1400; средневзвешенное ~700

  // Цены (config.js)
  planetBaseCost: 3530000,   // 3.53M пыли за 1-ю планету
  planetCostGrowth: 2.0,     // ×2 за каждую следующую планету
  systemBaseCost: 71000000,  // 71M пыли за 1-ю систему
  systemGrowth: 1.5,         // ×1.5 за каждую следующую систему
  systemIncomeMultPerSystem: 1.0, // +100% дохода за каждую доп. систему

  // Престиж (config.js PRESTIGE_CFG)
  firstPrestigeSystems: 5,   // 1-й престиж = 5 систем

  // ★ Ранняя игра (клики): стадии «облако» (goal 2000) и «диск»
  //   (goal 25000) почти не дают пассивки (baseRate/clickRate 0) —
  //   игрок прокачивается тапами. Оценка активного кликанья до
  //   первой планеты: ~4 часа (при ~2–5 тапов/сек).
  earlyGameHours: 4,

  // Монетизация
  chestStars: 200,
  shieldStars: 100,
};

// ─── Цена Stars (условно, Telegram Stars) ───────────────────────
// Telegram продаёт Stars примерно по $0.013/шт (пакеты от $1.99).
// Задача предлагает «условно 2$ за 100★» — считаем оба варианта.
const USD_PER_STAR = 0.013;     // актуальный ориентир Telegram
const RUB_PER_USD = 100;        // условный курс (для отчёта)
const USD_PER_STAR_TASK = 0.02; // допущение из ТЗ: «100★ ≈ 2$»

function usd(stars) { return stars * USD_PER_STAR; }
function rub(stars) { return usd(stars) * RUB_PER_USD; }
function usdTask(stars) { return stars * USD_PER_STAR_TASK; }

// ─── Модель дохода пыли ─────────────────────────────────────────
// dustPerSec = (stageBase + planets*planetAvgRate) * starMult
//              * systemMult * (1 + primeBonus)
// systemMult = 1 + (systems-1) * systemIncomeMultPerSystem
function dustPerSec(systems, planets, primeBonus = 0) {
  const stageBase = PARAMS.stageBaseRate.system;
  const planetRate = planets * PARAMS.planetAvgRate;
  const systemMult = 1 + (systems - 1) * PARAMS.systemIncomeMultPerSystem;
  return (stageBase + planetRate) * PARAMS.starMult * systemMult * (1 + primeBonus);
}

// ─── 1. Дни до 1-го Престижа (бесплатно) ────────────────────────
// Симуляция пассивного фарма от «стадии системы» до 5 систем.
// Каждые 60 сек начисляем пыль и покупаем самую дешёвую планету,
// затем самую дешёвую систему. К результату добавляем раннюю игру.
function daysToFirstPrestige() {
  let systems = 1;
  let planets = 0;
  let dust = 0;
  let systemsBought = 0;
  let planetsBought = 0;

  const planetCost = (p) => PARAMS.planetBaseCost * Math.pow(PARAMS.planetCostGrowth, p);
  const systemCost = (n) => PARAMS.systemBaseCost * Math.pow(PARAMS.systemGrowth, n);

  const tick = 60;
  let seconds = 0;
  const maxSeconds = 365 * 24 * 3600;

  while (systems < PARAMS.firstPrestigeSystems && seconds < maxSeconds) {
    seconds += tick;
    dust += dustPerSec(systems, planets) * tick;

    let bought = true;
    while (bought) {
      bought = false;
      if (planetsBought < systems * 8 && dust >= planetCost(planetsBought)) {
        dust -= planetCost(planetsBought); planetsBought++; planets++; bought = true;
      }
      if (systems < PARAMS.firstPrestigeSystems && dust >= systemCost(systemsBought)) {
        dust -= systemCost(systemsBought); systemsBought++; systems++; bought = true;
      }
    }
  }

  const passiveHours = seconds / 3600;
  const totalHours = passiveHours + PARAMS.earlyGameHours;

  return {
    systemsBought, planetsBought,
    passiveHours,
    totalHours,
    daysActive: totalHours / 24,          // «чистое» время игры
    daysCasual: totalHours / 1.5,         // при ~1.5 ч/день реального времени
    dustPerSecAtPrestige: dustPerSec(systems, planets),
  };
}

// ─── 2. Цена Stars ──────────────────────────────────────────────
function priceTable() {
  return [
    ['Щит (24ч)', PARAMS.shieldStars],
    ['Сундук', PARAMS.chestStars],
  ].map(([label, stars]) => ({
    label, stars,
    usd: usd(stars).toFixed(2),
    rub: Math.round(rub(stars)),
    usdTask: usdTask(stars).toFixed(2),
  }));
}

// ─── 3. Сундук vs Щит по ценности ───────────────────────────────
// Сундук (200★): бесплатная система + прайм-объект (постоянный бонус).
//   Экономия пыли = стоимость «следующей» системы (player должен был
//   бы её купить). Прайм-бонус дохода: blackHole +10% … superBH +40%
//   (primeBonusMult = 1 + min(1.5, raw*0.4)).
// Щит (100★): 24 часа 100% защиты (без ресурсов, только анти-потеря).
function chestVsShield() {
  // Точка, где игрок естественно покупал бы 2-ю систему (~6 планет).
  const incomeAt2ndSystem = dustPerSec(2, 6);
  const freeSystemDust = PARAMS.systemBaseCost * Math.pow(PARAMS.systemGrowth, 1); // 2-я система

  // Постоянный бонус Сундука (консервативно — минимальный прайм).
  const chestPrimeBoostMin = 0.05; // +5% (blackHole, после нерфа weight 0.20)
  const chestPrimeBoostMax = 0.20; // +20% (superBH, после нерфа weight 0.20)

  // «Ценность бонуса за неделю»: +5% от 168 ч пассивки.
  const weeklyIncomeValue = incomeAt2ndSystem * 3600 * 168; // пыль за неделю
  const weeklyBonusValueMin = weeklyIncomeValue * chestPrimeBoostMin;
  const weeklyBonusValueMax = weeklyIncomeValue * chestPrimeBoostMax;

  return {
    freeSystemDust,
    freeSystemHours: freeSystemDust / (incomeAt2ndSystem * 3600),
    incomeAt2ndSystem,
    chestPrimeBoostMin, chestPrimeBoostMax,
    weeklyBonusValueMin, weeklyBonusValueMax,
  };
}

// ─── Вывод ──────────────────────────────────────────────────────
function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  СИМУЛЯЦИЯ МОНЕТИЗАЦИИ — ИГРА «АККРЕЦИЯ»');
  console.log('  (оценочная модель, допущения см. в PARAMS)');
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  const p = daysToFirstPrestige();
  console.log('1) ДНИ ДО 1-ГО ПРЕСТИЖА (бесплатно)');
  console.log('   Систем куплено до престижа :', p.systemsBought);
  console.log('   Планет куплено до престижа :', p.planetsBought);
  console.log('   Пассивный фарм (системы)    :', p.passiveHours.toFixed(1), 'ч');
  console.log('   Ранняя игра (клики, оценка) :', PARAMS.earlyGameHours.toFixed(1), 'ч');
  console.log('   ИТОГО активной игры         :', p.totalHours.toFixed(1), 'ч (~', p.daysActive.toFixed(1), 'дня)');
  console.log('   Реально (при ~1.5 ч/день)   : ~', p.daysCasual.toFixed(1), 'дней');
  console.log('   Доход на момент престижа    :', Math.round(p.dustPerSecAtPrestige), 'пыли/сек');
  console.log('');

  console.log('2) ЦЕНА STARS');
  console.log('   Курс Telegram (ориентир)    : $' + USD_PER_STAR.toFixed(3) + ' / 1★');
  console.log('   Курс по ТЗ («100★≈2$»)      : $' + USD_PER_STAR_TASK.toFixed(3) + ' / 1★');
  for (const r of priceTable()) {
    console.log('   ' + r.label.padEnd(14) + r.stars + '★  =  $' + r.usd +
      ' (~' + r.rub + ' ₽)   [по ТЗ: $' + r.usdTask + ']');
  }
  console.log('');

  const c = chestVsShield();
  console.log('3) СУНДУК (200★) vs ЩИТ (100★)');
  console.log('   СУНДУК даёт:');
  console.log('     • бесплатную систему    ≈ ' + (c.freeSystemDust / 1e6).toFixed(1) + 'M пыли экономии');
  console.log('       = ~' + c.freeSystemHours.toFixed(1) + ' ч пассивного фарма');
  console.log('     • постоянный бонус      = +' + (c.chestPrimeBoostMin * 100).toFixed(0) +
    '…+' + (c.chestPrimeBoostMax * 100).toFixed(0) + '% дохода НАВСЕГДА');
  console.log('       за неделю это ещё     = ' + (c.weeklyBonusValueMin / 1e6).toFixed(1) +
    '…' + (c.weeklyBonusValueMax / 1e6).toFixed(1) + 'M пыли');
  console.log('   ЩИТ даёт:');
  console.log('     • 24 часа 100% защиты (без ресурсов, только анти-потеря)');
  console.log('   → Сундук по ресурсной ценности радикально выгоднее Щита.');
  console.log('');

  console.log('4) ВЫВОД — ЛОМАЕТ ЛИ ДОНАТ ИГРУ?');
  const chestUsd = usd(PARAMS.chestStars);
  console.log('   За 200★ ($' + chestUsd.toFixed(2) + ') игрок получает:')
  console.log('     • ~' + c.freeSystemHours.toFixed(1) + ' ч фарма сразу;');
  console.log('     • +' + (c.chestPrimeBoostMin * 100).toFixed(0) + '…+' +
    (c.chestPrimeBoostMax * 100).toFixed(0) + '% дохода навсегда.');
  console.log('   Постоянный бонус — главный риск: за неделю игры он');
  console.log('   эквивалентен +' + (c.weeklyBonusValueMin / 1e6).toFixed(1) +
    '…' + (c.weeklyBonusValueMax / 1e6).toFixed(1) + 'M пыли и растёт бесконечно.');
  console.log('   Это ~день-два фри-ту-плей прогресса, а не «неделя», НО');
  console.log('   постоянный множитель со временем перевешивает любую разовую');
  console.log('   награду. ИТОГ ПРИМЕНЁННЫХ ПРАВОК:');
  console.log('   СТАТУС: цена поднята (Сундук 200★, Щит 100★) И прайм-бонус');
  console.log('   урезан на -50% (primeBonusWeight 0.40 → 0.20) И система из сундука');
  console.log('   теперь со скидкой 50% вместо бесплатной (chestCapabilityValue).');
  console.log('   Итог: все три меры баланса применены.');
  console.log('═══════════════════════════════════════════════════');
}

main();
