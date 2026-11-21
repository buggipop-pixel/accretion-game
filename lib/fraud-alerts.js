// ═══════════════════════════════════════════════════════════════
//  FRAUD-ALERTS.JS — оповещения админки без отката прогресса.
//
//  Смысл: сервер больше не обрезает ресурсы и не откатывает покупки.
//  Если баланс/возможности выглядят подозрительно, сервер только
//  пишет структурированное оповещение: что случилось, на сколько,
//  каким способом это можно было получить и какие числа это доказали.
//
//  Модуль чистый: без Redis, Express и игровых модулей.
// ═══════════════════════════════════════════════════════════════

export const FRAUD_ALERT_HISTORY_LIMIT = 50;
// Одинаковые находки в пределах минуты не плодим: сохраняем один alert
// с count и свежими числами, иначе автосейв заспамит админку.
export const FRAUD_ALERT_DEDUPE_MS = 60 * 1000;

const SEVERITIES = ['low', 'medium', 'high'];

function text(value, fallback) {
  const s = String(value == null ? '' : value).trim();
  return s || String(fallback || '');
}

function number(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : (Number.isFinite(Number(fallback)) ? Number(fallback) : 0);
}

function fieldsKey(fields) {
  return (Array.isArray(fields) ? fields : [])
    .map(function(f) { return String(f && f.field ? f.field : ''); })
    .filter(Boolean)
    .sort()
    .join(',');
}

/** Нормализует одно оповещение в стабильный формат для admin.html. */
export function createFraudAlert(input) {
  const src = input && typeof input === 'object' ? input : {};
  const at = number(src.at, Date.now()) || Date.now();
  const code = text(src.code, 'suspicious');
  const severity = SEVERITIES.indexOf(src.severity) >= 0 ? src.severity : 'medium';
  return {
    id: text(src.id, code + ':' + at),
    at,
    code,
    severity,
    title: text(src.title, 'Подозрительная активность'),
    reason: text(src.reason, 'Сервер заметил расхождение, но не стал откатывать прогресс.'),
    method: text(src.method, 'Неизвестно — проверьте сохранённый сейв и историю действий.'),
    fields: Array.isArray(src.fields) ? src.fields.filter(Boolean) : [],
    evidence: (src.evidence && typeof src.evidence === 'object') ? src.evidence : {},
    count: Math.max(1, Math.floor(number(src.count, 1))),
  };
}

function legacyAlert(flag, at) {
  const name = text(flag, 'suspicious');
  const code = name.split(':')[0];
  const reasons = {
    phantom_capability: {
      title: '🏗 Неоплаченный прирост возможностей',
      reason: 'Сейв содержит больше планет/систем, чем удалось подтвердить тратами и бюджетом.',
      method: 'Возможные способы: правка localStorage/сейва, бесплатное основание системы, дубликат планет.',
    },
    shield_forged: {
      title: '🛡 Подозрительный щит',
      reason: 'В сейве щит дольше серверного права и игрового лимита.',
      method: 'Возможные способы: правка поля shieldUntil в localStorage или подмена облачного сейва.',
    },
    booster_forged: {
      title: '⚡ Подозрительный бустер',
      reason: 'В сейве бустер дохода дольше серверного права.',
      method: 'Возможные способы: правка boosters.incomeUntil в сейве или повторная выдача.',
    },
    wallet_clamp: {
      title: '💰 Кошелёк не сошёлся',
      reason: 'Старое оповещение о расхождении баланса (до перехода на режим без откатов).',
      method: 'Проверьте историю /api/save и /api/reward за это время.',
    },
    jump: {
      title: '📈 Резкий скачок ресурсов',
      reason: 'Ресурс вырос на порядки за один интервал сохранения.',
      method: 'Возможные способы: накрутка наград, подмена сейва или ошибка клиента.',
    },
    last_tick_rewind: {
      title: '⏪ Откат игрового времени',
      reason: 'lastTick в сейве ушёл назад — возможна подмена часов или сейва.',
      method: 'Проверьте устройства игрока и рассинхрон часов.',
    },
    last_tick_clamped: {
      title: '⏩ Слишком далёкое будущее lastTick',
      reason: 'Клиент прислал игровое время далеко в будущем.',
      method: 'Проверьте часы устройства и локальный сейв.',
    },
  };
  const info = reasons[code] || {
    title: '⚠️ ' + name,
    reason: 'Сработала серверная проверка сейва.',
    method: 'Проверьте сейв и историю сохранений игрока.',
  };
  return createFraudAlert({
    id: code + ':' + at,
    at,
    code,
    severity: 'medium',
    title: info.title,
    reason: info.reason,
    method: info.method,
    evidence: { legacyFlag: name },
  });
}

/** Достаёт историю оповещений из записи save_flag, включая старый формат. */
export function alertsFromRecord(record) {
  const src = record && typeof record === 'object' ? record : {};
  const at = number(src.at, 0) || Date.now();
  if (Array.isArray(src.alerts) && src.alerts.length) {
    return src.alerts
      .map(createFraudAlert)
      .sort(function(a, b) { return b.at - a.at; });
  }
  const flags = Array.isArray(src.flags) ? src.flags : [];
  return flags.map(function(flag) { return legacyAlert(flag, at); })
    .sort(function(a, b) { return b.at - a.at; });
}

/**
 * Добавляет оповещения к записи save_flag.
 * Возвращает новую запись { flags, at, alerts }.
 */
export function mergeFraudAlerts(prev, incoming, now) {
  const base = prev && typeof prev === 'object' ? prev : {};
  const at = number(now, Date.now()) || Date.now();
  const history = alertsFromRecord(base).slice().sort(function(a, b) { return a.at - b.at; });
  const flags = new Set(Array.isArray(base.flags) ? base.flags.map(String) : []);

  const list = (Array.isArray(incoming) ? incoming : [incoming])
    .filter(function(a) { return a && typeof a === 'object'; })
    .map(function(a) { return createFraudAlert(a); });

  for (const alert of list) {
    flags.add(alert.code);
    const last = history[history.length - 1];
    const same = last &&
      last.code === alert.code &&
      fieldsKey(last.fields) === fieldsKey(alert.fields) &&
      Math.abs(alert.at - last.at) <= FRAUD_ALERT_DEDUPE_MS;
    if (same) {
      last.count = Math.max(1, Number(last.count) || 1) + 1;
      last.at = Math.max(last.at, alert.at);
      last.reason = alert.reason;
      last.method = alert.method;
      last.evidence = alert.evidence;
      last.severity = alert.severity;
    } else {
      history.push(alert);
    }
  }

  return {
    flags: Array.from(flags),
    at,
    alerts: history
      .sort(function(a, b) { return a.at - b.at; })
      .slice(-FRAUD_ALERT_HISTORY_LIMIT),
  };
}

/** Короткая сводка для списка игроков/бейджа админки. */
export function summarizeFraudAlerts(record) {
  const alerts = alertsFromRecord(record);
  return {
    count: alerts.length,
    lastAt: alerts.length ? alerts[0].at : 0,
    flags: alerts.map(function(a) { return a.code; }),
  };
}
