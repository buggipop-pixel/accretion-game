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

function acOnClick(e) {
  // ★ Тапы в фазе III (зажигание) — это игровая механика, а не читерство.
  // Также игнорируем клики во время активной миниигры.
  if (typeof S !== 'undefined' && S) {
    if (S.stage === 'protostar') return;
    if (S.activeMinigame) return;
  }

  const now = performance.now();
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
    if (sameCount >= 18) acFlag('uniform_intervals');
    // Слишком быстрые клики
    if (avg < 60) acFlag('too_fast_clicks');
  }

  // Клик без движения
  if (now - AC.lastMouseMove > 500) {
    AC.lastClickWithoutMove++;
    if (AC.lastClickWithoutMove > 15) acFlag('clicks_without_move');
  } else {
    AC.lastClickWithoutMove = Math.max(0, AC.lastClickWithoutMove - 1);
  }
}

function acFlag(reason) {
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