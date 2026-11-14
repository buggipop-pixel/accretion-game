// ═══════════════════════════════════════════════════════════════
//  ANTICHEAT.JS — логирование подозрительной активности
//  Сейчас — только сбор данных. Бан — после появления сервера.
// ═══════════════════════════════════════════════════════════════

const AC = {
  clickTimes: [],
  lastMouseMove: 0,
  lastClickWithoutMove: 0,
  flags: 0,
  warningsShown: 0,
  initialized: false,
  // ★ Один и тот же признак не набивает счётчик каждым кликом:
  // иначе автокликер за секунду «набирал» десятки флагов.
  lastReasonAt: {},
  reasonCooldownMs: 10000,
};

// ★ Тап-фазы (босс / «сбей осколки» / ручное отбитие вторжения) — это
// штатная механика: игрок обязан быстро и ритмично бить по экрану.
// Такие клики НЕ участвуют в общем анализе интервалов и «клика без
// движения мыши» (иначе первый же босс помечает игрока читером),
// но проверяются на физически невозможный темп.
const AC_TAP = {
  times: [],
  windowMs: 2000,
  maxTaps: 52,        // ~26 тапов/с — быстрее человек стабильно не бьёт
  flaggedAt: 0,
  cooldownMs: 15000,
};

function acInit() {
  if (AC.initialized) return;
  AC.initialized = true;

  document.addEventListener('mousemove', function() {
    AC.lastMouseMove = performance.now();
  }, { passive: true });

  document.addEventListener('touchstart', function() {
    AC.lastMouseMove = performance.now();
  }, { passive: true });

  document.addEventListener('click', function(e) {
    acOnClick(e);
  }, { passive: true });

  // Периодический вывод в консоль
  setInterval(function() {
    if (AC.flags > 0 || AC.lastClickWithoutMove > 5) {
      console.log('[ANTICHEAT] flags=' + AC.flags +
        ' clicksWithoutMove=' + AC.lastClickWithoutMove);
    }
  }, 5 * 60 * 1000);
}

// Активна ли сейчас тап-фаза. Главный признак — eventTapLockActive()
// из event-visuals.js, но файл грузится позже, поэтому есть fallback.
function acTapPhaseActive() {
  if (typeof window.eventTapLockActive === 'function') {
    try {
      if (window.eventTapLockActive()) return true;
    } catch (err) { /* игнорируем: решаем по состоянию ниже */ }
  }
  if (typeof S === 'undefined' || !S) return false;
  const ar = S.activeRandomEvent;
  if (ar && (ar.kind === 'boss' || ar.kind === 'tap')) return true;
  // ★ Вторжение: корабли сбиваются тапами руками — это тоже механика.
  if (S.invasions && S.invasions.length > 0) return true;
  return false;
}

// Анализ тап-фазы: только грубый предел темпа, без «ровных интервалов».
function acOnTapPhaseClick(now) {
  AC_TAP.times.push(now);
  while (AC_TAP.times.length > 0 && now - AC_TAP.times[0] > AC_TAP.windowMs) {
    AC_TAP.times.shift();
  }
  // Ритмичные тапы — норма, а вот 26+ в секунду две секунды подряд — нет.
  if (AC_TAP.times.length > AC_TAP.maxTaps && now - AC_TAP.flaggedAt > AC_TAP.cooldownMs) {
    AC_TAP.flaggedAt = now;
    acFlag('tap_rate_inhuman');
  }
  // Долбёжка по цели не должна накапливать «клики без движения мыши».
  AC.lastClickWithoutMove = 0;
}

function acOnClick(e) {
  // ★ Тапы в фазе III (зажигание) — это игровая механика, а не читерство.
  // Также игнорируем клики во время активной миниигры.
  if (typeof S !== 'undefined' && S) {
    if (S.stage === 'protostar') return;
    if (S.activeMinigame) return;
  }

  const now = performance.now();

  // ★ Тап-события и вторжения идут отдельным, «человеческим» каналом.
  if (acTapPhaseActive()) {
    acOnTapPhaseClick(now);
    return;
  }

  // Вернулись из тап-фазы — не смешиваем её клики с обычной статистикой.
  if (AC_TAP.times.length) AC_TAP.times.length = 0;

  AC.clickTimes.push(now);
  if (AC.clickTimes.length > 30) AC.clickTimes.shift();

  // Проверка интервалов
  if (AC.clickTimes.length >= 20) {
    const intervals = [];
    for (let i = 1; i < AC.clickTimes.length; i++) {
      intervals.push(AC.clickTimes[i] - AC.clickTimes[i-1]);
    }
    const avg = intervals.reduce(function(a,b){return a+b;}, 0) / intervals.length;
    let sameCount = 0;
    for (let i = 0; i < intervals.length; i++) {
      if (Math.abs(intervals[i] - avg) < 3) sameCount++;
    }
    // Идеально ровные интервалы на 30 кликах — почерк скрипта, не руки.
    if (sameCount >= 18) acFlag('uniform_intervals');
    // Слишком быстрые клики вне тап-фазы
    if (avg < 60) acFlag('too_fast_clicks');
  }

  // Клик без движения. Порог заведомо выше человеческой «долбёжки»
  // по одной точке экрана: автокликеры дают сотни кликов, а не 40.
  if (now - AC.lastMouseMove > 800) {
    AC.lastClickWithoutMove++;
    if (AC.lastClickWithoutMove > 45) acFlag('clicks_without_move');
  } else {
    AC.lastClickWithoutMove = Math.max(0, AC.lastClickWithoutMove - 1);
  }
}

function acFlag(reason) {
  // Один клик — максимум один флаг на признак в 10 секунд:
  // нам нужен сам факт, а не количество повторов.
  const nowMs = Date.now();
  const lastAt = AC.lastReasonAt[reason] || 0;
  if (nowMs - lastAt < AC.reasonCooldownMs) return;
  AC.lastReasonAt[reason] = nowMs;
  AC.flags++;
  if (AC.warningsShown < 1 && AC.flags >= 5) {
    AC.warningsShown++;
    if (typeof toast === 'function') {
      toast('⚠️ Активность записана', 'Сессия помечена как подозрительная');
    }
  }
  if (!S.anticheat) S.anticheat = { flags: 0, reasons: [], ts: 0 };
  S.anticheat.flags = AC.flags;
  S.anticheat.reasons.push({ r: reason, t: Date.now() });
  if (S.anticheat.reasons.length > 50) S.anticheat.reasons.shift();
  S.anticheat.ts = Date.now();
}

// Хук на престиж — проверка времени
function acOnPrestige(systemsBefore, systemsAfter) {
  if (!S.anticheat) S.anticheat = { flags: 0, reasons: [], ts: 0, prestiges: [] };
  if (!S.anticheat.prestiges) S.anticheat.prestiges = [];
  S.anticheat.prestiges.push({
    t: Date.now(),
    before: systemsBefore,
    after: systemsAfter,
    timeSinceStart: Date.now() - (S.sessionStart || Date.now()),
  });
  if (S.anticheat.prestiges.length > 20) S.anticheat.prestiges.shift();

  // Аномалии
  if (systemsAfter > systemsBefore) acFlag('systems_gained');
  if (S.anticheat.prestiges.length >= 2) {
    const last = S.anticheat.prestiges[S.anticheat.prestiges.length - 2];
    const cur = S.anticheat.prestiges[S.anticheat.prestiges.length - 1];
    if (cur.t - last.t < 60000) acFlag('prestige_too_fast');
  }
}

window.acInit = acInit;
window.acFlag = acFlag;
window.acOnPrestige = acOnPrestige;
window.acTapPhaseActive = acTapPhaseActive;
