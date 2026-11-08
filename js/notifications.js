// ═══════════════════════════════════════════════════════════════
//  NOTIFICATIONS.JS — единая точка отправки событий в Telegram.
//
//  Раньше каждый модуль дёргал sendPushNotification() сам, из-за чего
//  события терялись: сервер резал их по «1 в минуту на категорию»,
//  а отправка вообще не работала без серверного кошелька.
//
//  Здесь:
//   • rich-сообщения (заголовок + строки) для вторжений, флота, хранилищ;
//   • дедупликация по ключу (одно и то же событие не улетит дважды);
//   • клиентская очередь и склейка всплесков (несколько кораблей = одно
//     сообщение, а не десять);
//   • безопасная деградация: если sendPushNotification недоступен — молчим.
// ═══════════════════════════════════════════════════════════════

const NOTIFY_ICONS = {
  invasion: '⚔️',
  invasion_end: '🏁',
  fleet: '🚀',
  storage: '📦',
  defense: '🛡',
  event: '🌌',
  info: 'ℹ️',
};

const NOTIFY_CFG = {
  flushMs: 900,
  dedupeMs: 15 * 1000,
  maxTextLen: 950,
  categoryCooldownMs: {
    storage: 60 * 1000,
    fleet: 20 * 1000,
    invasion: 5 * 1000,
    invasion_end: 5 * 1000,
    event: 10 * 1000,
    defense: 30 * 1000,
    info: 10 * 1000,
  },
};

const NOTIFY_STATE = {
  queue: [],
  timer: null,
  lastKeyAt: Object.create(null),
  lastCategoryAt: Object.create(null),
};

function _notifyFmt(n) {
  const v = Number(n) || 0;
  if (typeof fmt === 'function') return fmt(v);
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return Math.round(v).toString();
}

// Экранируем только пользовательские имена: HTML-теги в сообщении
// мы строим сами, поэтому <b> должен остаться.
function _notifyEsc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function _notifyEnabled() {
  if (typeof S === 'undefined' || !S) return false;
  if (S.settings && S.settings.pushEnabled === false) return false;
  return true;
}

function _notifyCanSend() {
  return typeof sendPushNotification === 'function';
}

// Собирает сообщение: заголовок + строки, обрезает до лимита Telegram/сервера.
function notifyBuildMessage(category, title, lines) {
  const icon = NOTIFY_ICONS[category] || NOTIFY_ICONS.info;
  let text = icon + ' <b>' + title + '</b>';
  const rows = Array.isArray(lines) ? lines : (lines ? [lines] : []);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row === undefined || row === null || row === '') continue;
    text += '\n' + row;
  }
  if (text.length > NOTIFY_CFG.maxTextLen) text = text.slice(0, NOTIFY_CFG.maxTextLen - 1) + '…';
  return text;
}

// Проверка «не спамим»: одинаковый ключ не чаще dedupeMs, категория — свой кулдаун.
function _notifyAllowed(category, key, opts) {
  opts = opts || {};
  if (opts.force) return true;
  const now = Date.now();
  if (key) {
    const last = NOTIFY_STATE.lastKeyAt[key] || 0;
    if (now - last < NOTIFY_CFG.dedupeMs) return false;
    NOTIFY_STATE.lastKeyAt[key] = now;
  }
  if (opts.ignoreCooldown) return true;
  const cd = NOTIFY_CFG.categoryCooldownMs[category] || 0;
  if (cd > 0) {
    const last = NOTIFY_STATE.lastCategoryAt[category] || 0;
    if (now - last < cd) return false;
    NOTIFY_STATE.lastCategoryAt[category] = now;
  }
  return true;
}

// Ставит сообщение в очередь. Всплеск событий склеивается в один flush.
function notifyEnqueue(category, message) {
  NOTIFY_STATE.queue.push({ category: category || 'info', message: message });
  if (NOTIFY_STATE.timer) return;
  const type = (typeof setTimeout === 'function') ? setTimeout : null;
  if (!type) { notifyFlush(); return; }
  NOTIFY_STATE.timer = type(function () {
    NOTIFY_STATE.timer = null;
    notifyFlush();
  }, NOTIFY_CFG.flushMs);
}

function notifyFlush() {
  const queue = NOTIFY_STATE.queue;
  NOTIFY_STATE.queue = [];
  if (!queue.length) return;
  if (!_notifyEnabled() || !_notifyCanSend()) return;

  // Группируем по категории: несколько событий одной категории — одним сообщением.
  const groups = Object.create(null);
  const order = [];
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    if (!groups[item.category]) { groups[item.category] = []; order.push(item.category); }
    groups[item.category].push(item.message);
  }
  for (let i = 0; i < order.length; i++) {
    const category = order[i];
    const messages = groups[category];
    // Не больше 4 строк на категорию за один flush, остальное — следующей волной.
    const chunk = messages.splice(0, 4);
    try { sendPushNotification(chunk.join('\n\n'), category); } catch (e) { /* silent */ }
    if (messages.length) {
      for (let j = 0; j < messages.length; j++) NOTIFY_STATE.queue.push({ category: category, message: messages[j] });
    }
  }
  if (NOTIFY_STATE.queue.length && !NOTIFY_STATE.timer) {
    const type = (typeof setTimeout === 'function') ? setTimeout : null;
    if (type) NOTIFY_STATE.timer = type(function () { NOTIFY_STATE.timer = null; notifyFlush(); }, NOTIFY_CFG.flushMs);
  }
}

// Публичный вход: событие → rich-сообщение → очередь.
function notifyEvent(category, title, lines, opts) {
  opts = opts || {};
  if (!_notifyEnabled()) return false;
  if (!_notifyAllowed(category, opts.key, opts)) return false;
  const message = notifyBuildMessage(category, title, lines);
  if (opts.immediate) {
    if (!_notifyCanSend()) return false;
    try { sendPushNotification(message, category); } catch (e) { /* silent */ }
    return true;
  }
  notifyEnqueue(category, message);
  return true;
}

// ─── Вторжения ──────────────────────────────────────────────────
function invasionDifficulty(inv) {
  if (!inv) return 1;
  const tier = (typeof INVASION_CFG !== 'undefined' && INVASION_CFG.tiers) ? INVASION_CFG.tiers[inv.tierKey] : null;
  return Math.max(1, Math.min(3, Number(inv.difficulty || (tier && tier.difficulty) || 1)));
}

function invasionShipSummary(inv) {
  const names = Object.create(null);
  let total = 0;
  if (inv && Array.isArray(inv.ships)) {
    for (let i = 0; i < inv.ships.length; i++) {
      const ship = inv.ships[i];
      const typeKey = ship && ship.type ? ship.type : 'fighter';
      const typeCfg = (INVASION_CFG && INVASION_CFG.shipTypes) ? INVASION_CFG.shipTypes[typeKey] : null;
      const name = (typeCfg && typeCfg.name) || typeKey;
      names[name] = (names[name] || 0) + 1;
      total++;
    }
  }
  const parts = [];
  for (const name in names) parts.push(name + ' ×' + names[name]);
  return { total: total, text: parts.join(', ') };
}

function invasionTotalHp(inv) {
  let hp = 0;
  if (inv && Array.isArray(inv.ships)) {
    for (let i = 0; i < inv.ships.length; i++) {
      const ship = inv.ships[i];
      if (!ship || ship.destroyed) continue;
      hp += Math.max(0, Number(ship.hp) || 0);
    }
  }
  return hp;
}

function invasionTargetLabel(inv) {
  if (!inv) return 'галактика';
  if (inv.targetType === 'planet') {
    const name = inv.planetName || 'планета';
    return 'планета «' + name + '»';
  }
  return 'система «' + (inv.systemName || 'Родная') + '»';
}

function notifyInvasionStart(inv, extraLines) {
  if (!inv) return false;
  const tier = (INVASION_CFG.tiers && INVASION_CFG.tiers[inv.tierKey]) || { label: 'Вторжение' };
  const diff = invasionDifficulty(inv);
  const summary = invasionShipSummary(inv);
  const hp = invasionTotalHp(inv);
  const lines = [
    '🎯 Цель: ' + invasionTargetLabel(inv),
    '💀 Сложность: ' + diff + '/3 · ' + _notifyEsc(tier.label),
    '🛸 Корабли: ' + _notifyEsc(summary.text || 'неизвестно') + ' (' + summary.total + ')',
    '❤️ Суммарная прочность: ' + _notifyFmt(hp) + ' HP',
  ];
  lines.push('⏱ Ограбление: ' + Math.round(INVASION_CFG.robberyDuration / 60000) + ' мин · Разрушение: ' + Math.round(INVASION_CFG.destructionDuration / 60000) + ' мин');
  if (Array.isArray(extraLines)) for (let i = 0; i < extraLines.length; i++) lines.push(extraLines[i]);
  return notifyEvent('invasion', 'Вторжение! Сложность ' + diff + '/3', lines, { key: 'inv_start:' + inv.id, immediate: true, ignoreCooldown: true });
}

function notifyInvasionEnd(inv, outcome, extraLines) {
  if (!inv) return false;
  const diff = invasionDifficulty(inv);
  const lines = [
    '🎯 Цель: ' + invasionTargetLabel(inv),
    '💀 Сложность: ' + diff + '/3',
  ];
  if (outcome === 'defeated') {
    lines.push('✅ Итог: эскадра уничтожена');
  } else if (outcome === 'repelled') {
    lines.push('🛡 Итог: атака отбита обороной');
  } else {
    lines.push('⚠️ Итог: вторжение прорвалось');
  }
  const stolenDust = Number(inv.stolen) || 0;
  const stolenEnergy = Number(inv.drainedEnergy) || 0;
  const stolenCiv = Number(inv.drainedCiv) || 0;
  const stolenMetals = Number(inv.stolenMetals) || 0;
  if (stolenDust + stolenEnergy + stolenCiv + stolenMetals > 0) {
    const parts = [];
    if (stolenDust > 0) parts.push('✦ ' + _notifyFmt(stolenDust));
    if (stolenEnergy > 0) parts.push('⚡ ' + _notifyFmt(stolenEnergy));
    if (stolenCiv > 0) parts.push('🧬 ' + (Math.round(stolenCiv * 100) / 100));
    if (stolenMetals > 0) parts.push('⚙ ' + _notifyFmt(stolenMetals));
    lines.push('💸 Потеряно ресурсов: ' + parts.join(', '));
  }
  if (Number(inv.disabledPlanets) > 0) lines.push('🪐 Планет в простое: ' + Number(inv.disabledPlanets));
  if (Number(inv.systemsDamaged) > 0) lines.push('🌐 Повреждено систем: ' + Number(inv.systemsDamaged));
  if (Number(inv.debuffPct) > 0) {
    lines.push('📉 Штраф к доходу: −' + Math.round(Number(inv.debuffPct) * 100) + '% на ' + (Math.round((Number(inv.debuffHours) || 0) * 10) / 10) + ' ч');
  }
  if ((Number(inv.bountyMetals) || 0) + (Number(inv.bountyDust) || 0) + (Number(inv.bountyEnergy) || 0) + (Number(inv.bountyCiv) || 0) > 0) {
    const b = [];
    if (Number(inv.bountyMetals) > 0) b.push('⚙ ' + _notifyFmt(inv.bountyMetals));
    if (Number(inv.bountyDust) > 0) b.push('✦ ' + _notifyFmt(inv.bountyDust));
    if (Number(inv.bountyEnergy) > 0) b.push('⚡ ' + _notifyFmt(inv.bountyEnergy));
    if (Number(inv.bountyCiv) > 0) b.push('🧬 ' + (Math.round(Number(inv.bountyCiv) * 100) / 100));
    lines.push('🏆 Трофеи за ручное уничтожение: ' + b.join(', '));
  }
  if (Array.isArray(extraLines)) for (let i = 0; i < extraLines.length; i++) lines.push(extraLines[i]);
  return notifyEvent('invasion_end', 'Вторжение завершено', lines, { key: 'inv_end:' + inv.id, immediate: true, ignoreCooldown: true });
}

// ─── Флот ───────────────────────────────────────────────────────
function notifyFleetEvent(title, lines, key) {
  return notifyEvent('fleet', title, lines, { key: key });
}

function notifyStorageFull(name, value, cap, text) {
  const lines = [
    '📦 ' + _notifyEsc(name) + ': ' + _notifyFmt(value) + ' / ' + _notifyFmt(cap),
    '⏸ ' + _notifyEsc(text || 'Производство остановлено.'),
    '💡 Потратьте ресурсы, чтобы добыча продолжилась.',
  ];
  return notifyEvent('storage', 'Хранилище заполнено: ' + _notifyEsc(name), lines, { key: 'storage:' + name, immediate: true });
}

window.notifyFmt = _notifyFmt;
window.notifyEvent = notifyEvent;
window.notifyBuildMessage = notifyBuildMessage;
window.notifyInvasionStart = notifyInvasionStart;
window.notifyInvasionEnd = notifyInvasionEnd;
window.notifyFleetEvent = notifyFleetEvent;
window.notifyStorageFull = notifyStorageFull;
window.invasionDifficulty = invasionDifficulty;
window.invasionShipSummary = invasionShipSummary;
window.notifyFlush = notifyFlush;
