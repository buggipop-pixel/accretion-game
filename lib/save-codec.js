// ═══════════════════════════════════════════════════════════════
//  SAVE-CODEC — сжатие облачных сейвов для Upstash
//
//  Зачем:
//    Сейв — это JSON на десятки/сотни КБ (галактика с тысячами
//    систем). Каждый /api/save читает старую версию и пишет новую,
//    а poll версии читал полный сейв каждые полминуты. На free-тарифе
//    Upstash (10 ГБ трафика) это выжигало квоту за неделю.
//
//  Что делаем:
//    Храним в Redis конверт { version, z }, где z — gzip+base64
//    исходного JSON. Поле version остаётся на верхнем уровне, чтобы
//    Lua-скрипт CAS (redisSetIfVersion) читал его без распаковки.
//    JSON жмётся в 5–15 раз, поэтому трафик Upstash падает во столько же.
//
//  Совместимость:
//    Старые несжатые сейвы (обычный JSON с .data) читаются как есть —
//    миграция не нужна, достаточно того, что новые записи сжаты.
// ═══════════════════════════════════════════════════════════════

import zlib from 'node:zlib';
import { promisify } from 'node:util';

const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

export const SAVE_KEY_PREFIX = 'cloudsave:';

// Признак того, что значение в Redis — наш конверт.
// Проверяем и наличие z, и отсутствие data: старый сейв содержит data.
function isEnvelope(parsed) {
  return !!parsed && typeof parsed === 'object' &&
    typeof parsed.z === 'string' && parsed.z.length > 0 &&
    parsed.data === undefined;
}

export function isSaveKey(key) {
  return typeof key === 'string' && key.startsWith(SAVE_KEY_PREFIX);
}

// Сжимает JSON-строку сейва в конверт. При любой проблеме (не JSON,
// ошибка zlib) возвращает исходное значение без изменений: сжатие —
// оптимизация, она не должна ломать сохранение.
export async function encodeSaveValue(value) {
  if (typeof value !== 'string' || value.length === 0) return value;
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (e) {
    return value;
  }
  if (!parsed || typeof parsed !== 'object' || isEnvelope(parsed)) return value;
  try {
    const packed = await gzipAsync(Buffer.from(value, 'utf8'), { level: 6 });
    return JSON.stringify({
      // Верхний уровень — только version: его читает Lua-скрипт CAS.
      version: Number(parsed.version) || 0,
      saved_at: Number(parsed.saved_at) || 0,
      z: packed.toString('base64'),
    });
  } catch (e) {
    return value;
  }
}

// Разворачивает конверт обратно в исходную JSON-строку. Обычные
// (несжатые) значения и не-JSON отдаёт как есть.
export async function decodeSaveValue(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return raw;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return raw;
  }
  if (!isEnvelope(parsed)) return raw;
  try {
    const json = await gunzipAsync(Buffer.from(parsed.z, 'base64'));
    return json.toString('utf8');
  } catch (e) {
    // Битый конверт: не глотаем молча — пусть вызывающий увидит проблему.
    throw new Error('Corrupted compressed cloud save');
  }
}
