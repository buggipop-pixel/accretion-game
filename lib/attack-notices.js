// ═══════════════════════════════════════════════════════════════
//  ATTACK-NOTICES — текст пуша о вторжении.
//
//  ★ Офлайн-волны больше не имеют собственного «волнового» шаблона
//  («Волна N из M · сложность до 3/3 · Вас нет ~3 ч»): сервер сам
//  разыгрывает волну настоящими функциями игры и применяет её к сейву,
//  поэтому игроку уходит ОБЫЧНОЕ уведомление о вторжении — ровно такое
//  же, какое клиент шлёт при живом спавне (js/notifications.js:
//  notifyInvasionStart).
//
//  Модуль чистый: никаких обращений к Redis/сети, всё тестируется.
// ═══════════════════════════════════════════════════════════════

/** Экранируем только пользовательские имена: теги <b> строим сами. */
export function escapeNoticeText(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Короткие числа — как _notifyFmt в js/notifications.js. */
export function formatNoticeNumber(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return Math.round(v).toString();
}

/** Сводка состава эскадры: «Корвет ×3, Истребитель ×1». */
export function shipsSummary(ships) {
  const counts = Object.create(null);
  const order = [];
  let total = 0;
  if (Array.isArray(ships)) {
    for (let i = 0; i < ships.length; i++) {
      const ship = ships[i] || {};
      const name = String(ship.name || ship.type || 'корабль');
      if (!counts[name]) { counts[name] = 0; order.push(name); }
      counts[name]++;
      total++;
    }
  }
  return {
    total: total,
    text: order.map(function (name) { return name + ' ×' + counts[name]; }).join(', '),
  };
}

/**
 * Текст обычного уведомления о начале вторжения.
 *
 * @param {object} wave
 * @param {number} wave.difficulty — 1..3
 * @param {string} [wave.tierLabel] — «Среднее (2)» из INVASION_CFG.tiers
 * @param {string} [wave.targetLabel] — «система «Родная»»
 * @param {Array}  [wave.ships] — [{name, hp}] из rollInvasionShips()
 * @param {number} [wave.robberyMin] — длительность ограбления, мин
 * @param {number} [wave.destructionMin] — длительность разрушения, мин
 * @returns {string} HTML для Telegram
 */
export function buildInvasionNotice(wave) {
  const w = wave || {};
  const diff = Math.max(1, Math.min(3, Number(w.difficulty) || 1));
  const tierLabel = w.tierLabel ? escapeNoticeText(w.tierLabel) : '';
  const target = w.targetLabel ? escapeNoticeText(w.targetLabel) : 'галактика';
  const summary = shipsSummary(w.ships);
  let hp = 0;
  if (Array.isArray(w.ships)) {
    for (let i = 0; i < w.ships.length; i++) {
      const ship = w.ships[i] || {};
      if (ship.destroyed) continue;
      hp += Math.max(0, Number(ship.hp) || Number(ship.maxHp) || 0);
    }
  }
  const robbery = Math.max(1, Math.round(Number(w.robberyMin) || 45));
  const destruction = Math.max(1, Math.round(Number(w.destructionMin) || 15));

  const lines = [
    '🎯 Цель: ' + target,
    '💀 Сложность: ' + diff + '/3' + (tierLabel ? ' · ' + tierLabel : ''),
    '🛸 Корабли: ' + escapeNoticeText(summary.text || 'неизвестно') + ' (' + summary.total + ')',
    '❤️ Суммарная прочность: ' + formatNoticeNumber(hp) + ' HP',
    '⏱ Ограбление: ' + robbery + ' мин · Разрушение: ' + destruction + ' мин',
  ];

  return '⚔️ <b>Вторжение! Сложность ' + diff + '/3</b>\n' + lines.join('\n');
}

/** Имя системы по индексу — то же правило, что в js/economy.js. */
export function offlineSystemName(save, systemIdx) {
  const idx = Number(systemIdx);
  if (!isFinite(idx) || idx < 0) return '';
  const active = Number(save && save.activeSystemIdx) || 0;
  if (idx === active) return (save && save.systemName) || 'Родная';
  const list = (save && Array.isArray(save.otherSystems)) ? save.otherSystems : [];
  return (list[idx] && list[idx].name) || 'Колония';
}

/** Подпись цели для обычного уведомления о вторжении. */
export function offlineWaveTargetLabel(save, systemIdx) {
  const name = offlineSystemName(save, systemIdx);
  return name ? 'система «' + name + '»' : 'границы галактики';
}
