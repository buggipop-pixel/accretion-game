// ═══════════════════════════════════════════════════════════════
//  SAVE-VALIDATION.JS — проверка initData и облачных сейвов.
//
//  Сервер не должен хранить «что прислали». Клиент — это чужая
//  машина: там можно подменить любые поля, поэтому сюда приходит
//  всё, что угодно. Здесь мы отбрасываем структуру, которая не
//  может быть настоящим сейвом.
//
//  Модуль сознательно не знает игровых формул: он проверяет
//  форму данных, а не их «честность». Проверка темпа прогресса —
//  в detectSaveAnomalies (только флаги, без блокировки).
// ═══════════════════════════════════════════════════════════════
import crypto from 'crypto';

export const LIMITS = {
  maxDepth: 8,
  maxNodes: 50000,
  maxArrayItems: 5000,
  maxStringLength: 2000,
  maxNumber: 1e18,
  maxTotalKeys: 5000,
  maxInitDataLength: 8192,
};

// Ключи, через которые можно испортить прототип объекта при десериализации
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// Стадии игры из config.js (STAGES)
export const KNOWN_STAGES = new Set(['cloud', 'condense', 'protostar', 'firstPlanet', 'system', 'galaxy']);

// Поля, которые обязаны быть числами, а не строками/объектами.
// Строка вида "1e999" или null в этих полях ломает экономику
// (NaN проходит через сравнения `cost > ...` как false).
const NUMERIC_FIELDS = new Set([
  'dust', 'dustTotal', 'energy', 'metalAmount', 'civLevel',
  'lastTick', 'prestigeLevel', 'galaxies', // phaseProgress — объект {cloud,condense,protostar}, не число
  'totalSystemsCreated', 'systems', 'systemIncomeBonus',
  'primeLastHealedAt', 'assemblyCooldownUntil', 'shieldUntil', 'sessionStart',
  'lastDailyReset', 'eventLogUnread', 'gammaDebuff', 'gasDensity',
  'offlineAttacksDone', 'lastInvasionCheck',
  'eventTimer', 'collisionTimer',
]);

const DAY_MS = 24 * 60 * 60 * 1000;

class SaveValidationError extends Error {}

function walk(value, depth, state) {
  if (state.nodes++ > LIMITS.maxNodes) throw new SaveValidationError('too many nodes');
  if (depth > LIMITS.maxDepth) throw new SaveValidationError('too deep');

  if (value === null) return null;

  const t = typeof value;
  if (t === 'number') {
    if (!Number.isFinite(value)) throw new SaveValidationError('non-finite number');
    if (Math.abs(value) > LIMITS.maxNumber) throw new SaveValidationError('number out of range');
    return value;
  }
  if (t === 'string') {
    if (value.length > LIMITS.maxStringLength) throw new SaveValidationError('string too long');
    return value;
  }
  if (t === 'boolean') return value;
  if (t !== 'object') throw new SaveValidationError('unsupported value type: ' + t);

  if (Array.isArray(value)) {
    if (value.length > LIMITS.maxArrayItems) throw new SaveValidationError('array too long');
    const out = new Array(value.length);
    for (let i = 0; i < value.length; i++) out[i] = walk(value[i], depth + 1, state);
    return out;
  }

  const keys = Object.keys(value);
  state.keys += keys.length;
  if (state.keys > LIMITS.maxTotalKeys) throw new SaveValidationError('too many keys');

  const out = {};
  for (const k of keys) {
    if (FORBIDDEN_KEYS.has(k)) throw new SaveValidationError('forbidden key: ' + k);
    if (k.length > 128) throw new SaveValidationError('key too long');
    out[k] = walk(value[k], depth + 1, state);
  }
  return out;
}

/**
 * Проверяет и нормализует сейв.
 * @returns {{ok:true, data:object, flags:string[]} | {ok:false, error:string}}
 */
export function validateSaveData(data, opts = {}) {
  const now = Number(opts.now) || Date.now();

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: 'saveData must be an object' };
  }

  let clean;
  try {
    clean = walk(data, 0, { nodes: 0, keys: 0 });
  } catch (e) {
    if (e instanceof SaveValidationError) return { ok: false, error: e.message };
    return { ok: false, error: 'invalid save structure' };
  }

  if (typeof clean.stage !== 'string' || !KNOWN_STAGES.has(clean.stage)) {
    return { ok: false, error: 'unknown stage' };
  }

  for (const field of NUMERIC_FIELDS) {
    if (clean[field] !== undefined && typeof clean[field] !== 'number') {
      return { ok: false, error: 'field "' + field + '" must be a number' };
    }
  }

  const flags = [];

  // Часы устройства могут врать куда сильнее, чем хотелось бы.
  // Не блокируем игрока с «уехавшими» часами, а зажимаем метку:
  // иначе она ломает офлайн-начисления (и позволяет их фармить).
  if (clean.lastTick !== undefined) {
    const minTick = now - 400 * DAY_MS;
    const maxTick = now + 2 * DAY_MS;
    if (clean.lastTick < minTick || clean.lastTick > maxTick) {
      clean.lastTick = Math.min(maxTick, Math.max(minTick, clean.lastTick));
      flags.push('last_tick_clamped');
    }
  }

  return { ok: true, data: clean, flags };
}

// Ресурсы, «скачок» которых в одном сохранении невозможно объяснить игрой
const JUMP_FIELDS = ['dust', 'dustTotal', 'energy', 'metalAmount', 'civLevel'];

/**
 * Ищет неправдоподобный прирост относительно предыдущего сейва.
 * Возвращает только флаги — решение (бан/откат) за администратором.
 */
export function detectSaveAnomalies(prevData, nextData, prevSavedAt, opts = {}) {
  const flags = [];
  if (!prevData || typeof prevData !== 'object' || !nextData || typeof nextData !== 'object') {
    return flags;
  }

  const now = Number(opts.now) || Date.now();
  const prevAt = Number(prevSavedAt) || 0;
  if (!prevAt) return flags;

  const elapsedSec = Math.max(0, (now - prevAt) / 1000);
  // Быстрее 2 минут прогресс не может вырасти в 1000 раз честно
  if (elapsedSec < 120) {
    for (const field of JUMP_FIELDS) {
      const before = Number(prevData[field]) || 0;
      const after = Number(nextData[field]) || 0;
      if (after > before * 1000 + 1e6) flags.push('jump:' + field);
    }
  }

  // Устройство «отыграло назад»: lastTick ушёл заметно раньше прошлого сейва
  const prevTick = Number(prevData.lastTick) || 0;
  const nextTick = Number(nextData.lastTick) || 0;
  if (prevTick && nextTick && nextTick + 30 * 60 * 1000 < prevTick) {
    flags.push('last_tick_rewind');
  }

  return flags;
}

/**
 * Проверка initData из Telegram WebApp.
 * @returns {object|null} user (с числовым id) или null
 */
export function validateInitData(initData, botToken, opts = {}) {
  if (!botToken || typeof initData !== 'string' || !initData) return null;
  if (initData.length > LIMITS.maxInitDataLength) return null;

  let params;
  try { params = new URLSearchParams(initData); } catch { return null; }

  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return null;
  params.delete('hash');

  // Строка проверки: все поля (кроме hash) в алфавитном порядке
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculated = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest();
  const provided = Buffer.from(hash, 'hex');

  // Сравнение постоянным временем: обычный === утекает по таймингам
  if (provided.length !== calculated.length || !crypto.timingSafeEqual(provided, calculated)) {
    return null;
  }

  const authDate = parseInt(params.get('auth_date') || '0', 10);
  if (!authDate) return null;

  const nowSec = Math.floor((Number(opts.now) || Date.now()) / 1000);
  if (authDate > nowSec + 300) return null; // время из будущего
  if (nowSec - authDate > (opts.maxAgeSec || 86400)) return null; // протухло

  let user;
  try { user = JSON.parse(params.get('user') || 'null'); } catch { return null; }
  if (!user || typeof user !== 'object') return null;
  if (!Number.isSafeInteger(user.id) || user.id <= 0) return null;

  return user;
}
