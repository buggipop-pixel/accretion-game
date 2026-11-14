// ═══════════════════════════════════════════════════════════════
//  PUSH-NOTICES — серверные поводы для Telegram-оповещений
//
//  Проблема: клиент генерирует пуши о переполнении хранилища и об
//  окончании щита/автобороны только внутри rAF-цикла. Когда мини-апп
//  закрыт (или вкладка спит), цикл не тикает — и игрок узнаёт обо всём
//  лишь после входа в игру. Сервер же видит сейв и умеет посчитать то
//  же самое, поэтому эти поводы перенесены сюда.
//
//  Модуль чистый: никаких Redis/сети/таймеров — всё тестируется.
//  Возвращаемые notices содержат строку текста и стабильный id, а
//  nextState нужно сохранить ТОЛЬКО после успешной доставки, чтобы
//  сбой Telegram не «съел» уведомление навсегда.
// ═══════════════════════════════════════════════════════════════

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;
// Насколько после истечения щита/автобороны ещё имеет смысл писать:
// сервер мог спать, но по прошествии недели спамить старый сейв нельзя.
const EXPIRY_GRACE_MS = 12 * HOUR_MS;

// Ресурсы и поля сейва. Порядок важен: так строки в сообщении стабильны.
export const STORAGE_RESOURCES = [
  { key: 'dust', label: 'Пыль', field: 'dust' },
  { key: 'energy', label: 'Энергия', field: 'energy' },
  { key: 'civ', label: 'Цивилизация', field: 'civLevel' },
  { key: 'metals', label: 'Металлы', field: 'metalAmount' },
];

// Компактный формат чисел — как в игре (fmt), но без зависимости от клиента.
export function formatNumber(value) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(Math.round(n));
}

function cloneState(prev) {
  try {
    return JSON.parse(JSON.stringify(prev || {}));
  } catch (e) {
    return {};
  }
}

function sameJson(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (e) {
    return false;
  }
}

function hoursLeft(ms) {
  const h = Math.max(0, Number(ms) || 0) / HOUR_MS;
  if (h >= 1) return Math.max(1, Math.round(h)) + ' ч';
  return Math.max(1, Math.round(h * 60)) + ' мин';
}

/**
 * Собирает поводы для пуша, которые видны по сейву прямо сейчас.
 *
 * @param {object} save — объект data из cloudsave:<id>
 * @param {object} caps — { dust, energy, civ, metals } лимиты хранилищ
 * @param {number} now — серверное время, мс
 * @param {object} prev — прошлое сохранённое состояние уведомлений игрока
 * @returns {{notices: Array<{id:string,line:string}>, next: object, changed: boolean}}
 */
export function collectNotices(save, caps, now, prev) {
  save = (save && typeof save === 'object') ? save : {};
  caps = (caps && typeof caps === 'object') ? caps : {};
  now = Number(now) || Date.now();

  const previous = cloneState(prev);
  const next = cloneState(prev);
  if (!next.storage || typeof next.storage !== 'object') next.storage = {};
  const notices = [];

  // 1. Переполнение хранилища: одно уведомление на «эпизод» filled → empty.
  for (let i = 0; i < STORAGE_RESOURCES.length; i++) {
    const res = STORAGE_RESOURCES[i];
    const cap = Number(caps[res.key]);
    const value = Math.max(0, Number(save[res.field]) || 0);
    const hasCap = isFinite(cap) && cap > 0;
    const full = hasCap && value >= cap - 1e-9;
    const wasFull = !!next.storage[res.key];

    if (full && !wasFull) {
      notices.push({
        id: 'storage:' + res.key,
        line: '📦 <b>' + res.label + '</b>: ' + formatNumber(value) + ' / ' + formatNumber(cap) +
          ' — добыча остановлена. Потратьте ресурсы, чтобы продолжить.',
      });
    }
    next.storage[res.key] = full;
  }

  // 2. Щит: предупреждаем за час до конца и один раз — если он уже истёк
  //    (сервер мог спать и пропустить окно «скоро»).
  const shieldUntil = Math.max(0, Number(save.shieldUntil) || 0);
  if (shieldUntil > 0 && now >= shieldUntil - HOUR_MS && now <= shieldUntil + EXPIRY_GRACE_MS && Number(next.shield) !== shieldUntil) {
    const active = shieldUntil > now;
    notices.push({
      id: 'shield',
      line: active
        ? '🛡 <b>Щит отключится</b> примерно через ' + hoursLeft(shieldUntil - now) + '. Продлите защиту, чтобы не потерять ресурсы.'
        : '🛡 <b>Щит отключился.</b> Продлите защиту, чтобы не потерять ресурсы.',
    });
    next.shield = shieldUntil;
  }

  // 3. Автоборона: та же логика. Учитываем только если она вообще была включена.
  const defLevel = Number(save.nightDefenseLevel) || 0;
  const defUntil = Math.max(0, Number(save.nightDefenseExpiresAt) || 0);
  if (defLevel > 0 && defUntil > 0 && now >= defUntil - HOUR_MS && now <= defUntil + EXPIRY_GRACE_MS && Number(next.defense) !== defUntil) {
    const active = defUntil > now;
    notices.push({
      id: 'defense',
      line: active
        ? '🛡 <b>Автоборона закончится</b> примерно через ' + hoursLeft(defUntil - now) + '. Активируйте снова, иначе флот будет отведён.'
        : '🛡 <b>Автоборона закончилась.</b> Активируйте её снова, чтобы защитить флот.',
    });
    next.defense = defUntil;
  }

  return { notices, next, changed: !sameJson(next, previous) };
}

/**
 * «Давно не виделись»: одно сообщение на одну отлучку.
 * Якорь — момент, с которого сервер считает отсутствие (lastActive).
 *
 * @returns {{id:string, anchor:string, line:string}|null}
 */
export function sleepNotice(save, lastActive, now, prev, opts) {
  const options = opts || {};
  const minAwayMs = Number(options.minAwayMs) || DAY_MS;
  const at = Number(lastActive) || 0;
  const current = Number(now) || Date.now();
  if (!at || current - at <= minAwayMs) return null;

  const anchor = String(at);
  const state = (prev && typeof prev === 'object') ? prev : {};
  if (String(state.sleep || '') === anchor) return null;

  return {
    id: 'sleep',
    anchor: anchor,
    line: '💤 <b>Давно не виделись!</b> Ваша галактика ждёт вас. Заберите ежедневную награду и проверьте хранилища.',
  };
}

/**
 * Одно сообщение из набора поводов: несколько событий за один проход
 * не должны превращаться в поток отдельных сообщений.
 */
export function buildDigest(notices, title) {
  const list = Array.isArray(notices) ? notices : [];
  const rows = [];
  for (let i = 0; i < list.length; i++) {
    if (list[i] && list[i].line) rows.push(list[i].line);
  }
  if (!rows.length) return '';
  return '🔔 <b>' + (title || 'Требует внимания') + '</b>\n' + rows.join('\n');
}
