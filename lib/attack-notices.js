// ═══════════════════════════════════════════════════════════════
//  ATTACK-NOTICES — расписание офлайн-волн для пушей «Вторжение!»
//
//  Проблема: пока игрок офлайн, волны вторжений существуют только
//  как математика в сейве. Клиент не работает (вкладка спит), поэтому
//  пуш о СТАРТЕ атаки отправить было некому — приходил только итоговый
//  отчёт при возвращении. Сервер теперь сам считает расписание волн
//  (по тем же формулам, что и js/economy.js) и пишет игроку, когда
//  очередная волна «должна была начаться».
//
//  Модуль чистый: никаких обращений к Redis/сети, всё тестируется.
// ═══════════════════════════════════════════════════════════════

/**
 * Расписание волн по предпросмотру gameCore.previewOfflineInvasions().
 * Возвращает null, если предпросмотр пропущен или волн нет.
 *
 * @param {object} preview — результат previewOfflineInvasions()
 * @returns {{attacks:number, times:number[]}|null}
 */
export function waveSchedule(preview) {
  if (!preview || typeof preview !== 'object' || preview.skipped) return null;
  const attacks = Math.max(0, Math.floor(Number(preview.attacks) || 0));
  const start = Number(preview.attackWindowStartMs) || 0;
  const step = Number(preview.attackStepMs) || 0;
  if (attacks <= 0 || start <= 0 || step <= 0) return null;

  const times = [];
  for (let i = 0; i < attacks; i++) {
    // Та же середина интервала, что и в клиенте: windowStart + (i + 0.5) * step.
    times.push(Math.round(start + (i + 0.5) * step));
  }
  return { attacks: attacks, times: times };
}

/**
 * Текст пуша об одной волне. Пишется в HTML-разметке Telegram.
 * @param {object} preview — результат previewOfflineInvasions()
 * @param {number} waveIndex — индекс волны (0…attacks-1)
 */
export function buildWaveNotice(preview, waveIndex) {
  const p = preview || {};
  const total = Math.max(1, Math.floor(Number(p.attacks) || 1));
  const idx = Math.max(0, Math.min(total - 1, Math.floor(Number(waveIndex) || 0)));
  const num = idx + 1;
  const diff = Math.max(1, Math.min(3, Number(p.maxDifficulty) || 1));
  const hours = Math.max(0, Number(p.awayHours) || 0);
  const away = hours >= 1
    ? (Math.round(hours * 10) / 10) + ' ч'
    : Math.max(1, Math.round(hours * 60)) + ' мин';

  const lines = [
    '🌌 Волна <b>' + num + '</b> из <b>' + total + '</b> · сложность до <b>' + diff + '/3</b>',
    '⏳ Вас нет ~' + away + '. Галактика осталась без присмотра — атаки идут одна за другой.',
  ];
  if (p.shieldProtected) lines.push('🛡 Щит покрыл часть отсутствия — это учтено в расчёте.');
  lines.push('Зайдите в игру, чтобы отбить атаку и увидеть точные потери.');

  return '⚔️ <b>Вторжение!</b>\n' + lines.join('\n');
}
