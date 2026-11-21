// ═══════════════════════════════════════════════════════════════
//  SERVER.JS — Telegram-бот для приёма Stars и облачных сейвов
// ═══════════════════════════════════════════════════════════════

import express from 'express';
import {
  validateInitData as validateInitDataCore,
  validateSaveData,
  detectSaveAnomalies,
} from './lib/save-validation.js';
import { createGameCore } from './lib/game-core.js';
import { buildInvasionNotice, offlineSystemName, offlineWaveTargetLabel } from './lib/attack-notices.js';
import { collectNotices, sleepNotice, buildDigest, formatNumber } from './lib/push-notices.js';
import {
  nextShieldEntitlement, overlayShieldEntitlement, isShieldSuspicious,
  clampShield,
  nextBoosterUntil, overlayBoosterEntitlement, clampBooster,
} from './lib/economy-actions.js';
import {
  walletFromSave,
  walletToSavePatch,
  accruePassive,
  creditClicks,
  auditWallet,
  rewardAllowance,
} from './lib/wallet.js';
import { rollChestReward } from './lib/chest.js';
import {
  clampReward, hasReward, maxExtraReward,
  accrueRewardBank, rewardBudget, spendRewardBank,
} from './lib/reward.js';
import { capabilityAudit, remainingCapabilityBudget, chestCapabilityValue } from './lib/capability.js';
import { applyAdminWallet, adminCapabilityBonus, adminEntitlementPlan } from './lib/admin-trust.js';
import { summarizeSave } from './lib/admin-summary.js';
import { createFraudAlert, mergeFraudAlerts, alertsFromRecord, summarizeFraudAlerts } from './lib/fraud-alerts.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import TelegramBot from 'node-telegram-bot-api';
import cron from 'node-cron';
console.log("[START] Инициализация сервера...");
console.log("BOT_TOKEN задан:", !!process.env.BOT_TOKEN);
console.log("UPSTASH_URL задан:", !!process.env.UPSTASH_REDIS_REST_URL);
const {
  BOT_TOKEN,
  UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN,
  WEBHOOK_SECRET,
  PUSH_CRON_SECRET,
  PUBLIC_BASE_URL,
  RENDER_EXTERNAL_URL,
  PORT = 10000,
} = process.env;

if (!BOT_TOKEN || !UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
  console.error('[FATAL] Не хватает переменных окружения');
  process.exit(1);
}
if (!WEBHOOK_SECRET) {
  console.warn('[WARN] WEBHOOK_SECRET не задан — вебхук оплаты будет отклонять все запросы (fail-closed)');
}

// ─── Товары ─────────────────────────────────────────────────────
const PRODUCTS = {
  chest:  { label: 'Космический сундук', stars: 200 },
  shield: { label: 'Премиум Щит (24ч)',  stars: 250 },
  booster: { label: 'Бустер дохода (2ч ×2)', stars: 75 },
};

// Единый игровой день: 01:00 UTC = 04:00 МСК. Совпадает с клиентом (config.js).
const GAME_DAY_EPOCH_SERVER = Date.UTC(2024, 0, 1) + 3600000;
function serverDayIndex(ts) {
  return Math.floor(((Number(ts) || Date.now()) - GAME_DAY_EPOCH_SERVER) / 86400000);
}

// ─── Игровые формулы (для серверного офлайн-дохода) ─────────────
// Загружаем те же js/*.js в vm-контекст: сервер считает доход по
// настоящим правилам игры, а не по константам, скопированным руками.
let gameCore = null;
try {
  gameCore = createGameCore();
  console.log('[OK] Игровые формулы загружены: офлайн-доход считает сервер');
} catch (e) {
  console.error('[game-core] не удалось загрузить формулы игры:', e.message);
  console.error('[game-core] сервер будет работать без серверного офлайн-расчёта');
}
const bot = new TelegramBot(BOT_TOKEN, { polling: false });

// ─── Меню команд бота ───────────────────────────────────────────
// Регистрируем подсказки в интерфейсе Telegram (кнопка «Меню»).
// Ошибку только логируем: без меню бот продолжает работать.
bot.setMyCommands([
  { command: 'start', description: '🚀 Запустить игру и подписаться на уведомления' },
  { command: 'stop',  description: '🔕 Отключить уведомления от бота' }
]).then(() => console.log('[OK] Меню команд успешно зарегистрировано'))
  .catch((err) => console.error('[ERROR] Ошибка регистрации меню:', err.message));

// ─── Кнопка «Play» у поля ввода (Telegram Mini App) ─────────────
// Одна кнопка в чате открывает саму игру, рядом — меню команд /start, /stop.
// Адрес игры можно переопределить без правки кода: env GAME_URL.
const GAME_URL = process.env.GAME_URL || 'https://buggipop-pixel.github.io/accretion-game/';
bot.setChatMenuButton({
  menu_button: JSON.stringify({ type: 'web_app', text: '▶️ Play', web_app: { url: GAME_URL } }),
}).then(() => console.log('[OK] Кнопка Play зарегистрирована'))
  .catch((err) => console.error('[ERROR] Ошибка регистрации кнопки Play:', err.message));

// ─── Автоматическая регистрация вебхука ─────────────────────────
// ★ Без setWebhook Telegram НЕ присылает /start на сервер: подписка
//   tg_chat:<id> не создаётся, и все пуши молча отбрасываются как
//   «нет подписки». Раньше вебхук регистрировали руками — забывали.
//   Регистрируем сами (Render отдаёт RENDER_EXTERNAL_URL автоматически).
//   Вебхук включаем только вместе с WEBHOOK_SECRET: /webhook fail-closed.
const WEBHOOK_BASE = String(PUBLIC_BASE_URL || RENDER_EXTERNAL_URL || '').trim().replace(/\/+$/, '');
// Диагностика для GET /: видно, настроен ли вебхук и нет ли ошибок.
const webhookState = { configured: false, url: '', pendingUpdates: 0, lastError: '' };
function registerTelegramWebhook() {
  if (!WEBHOOK_BASE) {
    console.warn('[webhook] PUBLIC_BASE_URL/RENDER_EXTERNAL_URL не задан — автоматическая регистрация вебхука пропущена');
    return;
  }
  if (!WEBHOOK_SECRET) {
    console.warn('[webhook] WEBHOOK_SECRET не задан — вебхук не регистрируем (иначе /start и оплата будут отклонены 403)');
    return;
  }
  const url = WEBHOOK_BASE + '/webhook';
  const options = { allowed_updates: ['message', 'pre_checkout_query'], secret_token: WEBHOOK_SECRET };
  // Один повтор: сеть до Telegram иногда сбоит на старте.
  let attempt = 0;
  function tryRegister() {
    attempt++;
    try {
      // ★ В node-telegram-bot-api методы пишутся как setWebHook/getWebHookInfo
      //   (большая H). Опечатка раньше роняла весь сервер на старте.
      bot.setWebHook(url, options)
        .then(() => {
          console.log('[OK] Вебхук Telegram зарегистрирован: ' + url);
          webhookState.configured = true;
          webhookState.url = url;
          return bot.getWebHookInfo();
        })
        .then((info) => {
          if (!info) return;
          const pending = Number(info.pending_update_count) || 0;
          webhookState.pendingUpdates = pending;
          webhookState.lastError = info.last_error_message || '';
          if (info.last_error_message) {
            console.warn('[webhook] Telegram сообщает об ошибке: ' + info.last_error_message);
          } else {
            console.log('[OK] Вебхук активен, в очереди обновлений: ' + pending);
          }
        })
        .catch((err) => {
          console.error('[ERROR] Не удалось зарегистрировать вебхук (попытка ' + attempt + '):', err && err.message);
          if (attempt < 2) setTimeout(tryRegister, 15000);
        });
    } catch (err) {
      // Вебхук важнее всего, но падать из-за него сервер не должен.
      console.error('[ERROR] setWebHook недоступен:', err && err.message);
    }
  }
  tryRegister();
}
try {
  registerTelegramWebhook();
} catch (e) {
  console.error('[ERROR] Инициализация вебхука:', e && e.message);
}
// ─── Разбор команд Telegram ────────────────────────────────────
// Меню команд, клавиатура и deep-link присылают текст по-разному:
// "/start", "/Start", "/start@AccretionBot", "/start ref123".
// Дальше в коде сравниваем только каноническую форму "/start".
function parseBotCommand(text) {
  const first = String(text || '').trim().split(/\s+/)[0];
  if (!first.startsWith('/')) return '';
  return first.split('@')[0].toLowerCase();
}

// Кнопка «Открыть игру» под приветствием. web_app разрешён только в
// личных чатах; в группах Telegram примет обычную url-кнопку.
function playKeyboard(chatType) {
  const button = chatType === 'private'
    ? { text: '▶️ Play', web_app: { url: GAME_URL } }
    : { text: '▶️ Играть', url: GAME_URL };
  return { inline_keyboard: [[button]] };
}

// ─── Upstash Redis (REST) ───────────────────────────────────────
// ★ Запись через командный API (POST-тело), а не через URL-путь /set/{key}/{value}:
//   сейвы в сотни КБ/МБ (тысячи систем) не влезают в URL и молча терялись.
async function redisSet(key, value) {
  // Один ретрай: сеть до Upstash иногда сбрасывает соединение (ECONNRESET).
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await redisCommand('SET', key, value);
      return true;
    } catch (e) {
      if (attempt === 0) { console.warn('[redisSet] повтор после ошибки:', e.message); continue; }
      console.warn('[redisSet] ошибка записи:', e.message);
      return false;
    }
  }
  return false;
}

// ★ Атомарная запись с проверкой версии (CAS через Lua EVAL):
//   пишем только если текущая версия сейва в Redis ещё равна expectedVersion.
//   Устраняет TOCTOU-гонку: два конкурентных /api/save с одинаковым
//   baseVersion больше не затирают друг друга (второй получит 409).
async function redisSetIfVersion(key, newValue, expectedVersion) {
  const script = [
    'local current = redis.call("GET", KEYS[1])',
    'local curVersion = 0',
    'if current then',
    '  local ok, decoded = pcall(cjson.decode, current)',
    '  if ok and type(decoded) == "table" and type(decoded.version) == "number" then',
    '    curVersion = decoded.version',
    '  end',
    'end',
    'if curVersion ~= tonumber(ARGV[1]) then',
    '  return {0, tostring(curVersion), current or ""}',
    'end',
    'redis.call("SET", KEYS[1], ARGV[2])',
    'return {1, tostring(curVersion + 1)}',
  ].join('\n');

  try {
    const r = await redisCommand('EVAL', script, '1', key, String(expectedVersion), newValue);
    const arr = Array.isArray(r) ? r : [r];
    if (Number(arr[0]) === 1) {
      return { ok: true, conflict: false, failed: false, version: Number(arr[1]) || 0, currentRaw: null };
    }
    return { ok: false, conflict: true, failed: false, version: Number(arr[1]) || 0, currentRaw: arr[2] || null };
  } catch (e) {
    // EVAL может быть недоступен в старых окружениях — неатомарный откат:
    // перечитываем версию и пишем, только если она не изменилась.
    console.warn('[redisSetIfVersion] EVAL недоступен, неатомарный откат:', e.message);
    try {
      const current = parseRedisJson(await redisGet(key));
      const curVer = (current && typeof current.version === 'number') ? current.version : 0;
      if (curVer !== expectedVersion) {
        return { ok: false, conflict: true, failed: false, version: curVer, currentRaw: JSON.stringify(current) };
      }
      const saved = await redisSet(key, newValue);
      return { ok: saved, conflict: false, failed: !saved, version: expectedVersion + 1, currentRaw: null };
    } catch (e2) {
      console.warn('[redisSetIfVersion] откат не удался:', e2.message);
      return { ok: false, conflict: false, failed: true, version: 0, currentRaw: null };
    }
  }
}

// ─── Присутствие игрока ─────────────────────────────────────────
// saved_at двигается только успешным сейвом. Игрок мог зайти на минуту,
// не успеть сохраниться и выйти — а cron продолжал считать его отсутствующим
// и присылал «Галактика под атакой» / отчёты о вторжениях. Поэтому каждый
// /api/load и /api/save отмечает last_seen, а cron смотрит на него.
const PRESENCE_TTL_SEC = 45 * 24 * 3600;

async function touchPresence(userId) {
  if (!userId) return;
  try {
    const key = `seen:${userId}`;
    // Одна команда вместо SET+EXPIRE: /api/load опрашивается каждые ~30 с.
    await redisCommand('SET', key, String(Date.now()), 'EX', PRESENCE_TTL_SEC);
  } catch (e) {
    console.warn('[presence] не удалось отметить заход:', e.message);
  }
}

async function lastSeenAt(userId) {
  if (!userId) return 0;
  try { return Number(await redisGet(`seen:${userId}`)) || 0; } catch (e) { return 0; }
}

// ─── Статус присутствия (онлайн/офлайн) для админки ─────────────
// ★ Это внутренняя информация: игрок её не видит, админка показывает
//   статус рядом с ником. Клиент сам решает, когда он «в игре»
//   (видимость + фокус + 10 минут бездействия — js/cloudsave.js)
//   и присылает статус в /api/presence.
//   ★ Храним последний отчёт СУТКИ для любого статуса, а «онлайн» считаем
//   только пока отчёт свежий. Иначе у спящего вкладка/WebView игра «зависает»:
//   новый отчёт не приходит, ключ с TTL 5 мин истекает — и админка показывала
//   «нет данных» вместо честного «офлайн».
const PRESENCE_STATUS_TTL_SEC = 24 * 3600;
// Отчёт «online» старше этого возраста считаем устаревшим.
// Клиент пингует раз в минуту, так что 2.5 минуты — два пропущенных пинга.
const PRESENCE_ONLINE_STALE_SEC = 150;

async function readUserPresence(userId) {
  if (!userId) return null;
  try {
    const p = parseRedisJson(await redisGet(`presence:${userId}`));
    return (p && typeof p === 'object') ? p : null;
  } catch (e) {
    return null;
  }
}

// Форма для админки: компактно и без клиентских полей.
function toAdminPresence(raw) {
  if (!raw || typeof raw !== 'object') {
    return { status: 'unknown', reason: 'no-data', idleSec: 0, at: 0 };
  }
  const at = Number(raw.at) || 0;
  const reportedOnline = raw.status === 'online';
  const stale = reportedOnline && (!at || Date.now() - at > PRESENCE_ONLINE_STALE_SEC * 1000);
  return {
    status: (reportedOnline && !stale) ? 'online' : 'offline',
    reason: stale ? 'no-report' : (typeof raw.reason === 'string' ? raw.reason.slice(0, 32) : 'unknown'),
    idleSec: Math.max(0, Math.round(Number(raw.idleSec) || 0)),
    at: at,
  };
}

// ─── Push-уведомления в Telegram ────────────────────────────────
// Подписка живёт в tg_chat:<userId> и хранит РОВНО userId: уведомления
// уходят только в личный чат самого игрока. Пустое значение (или
// отсутствие ключа) — игрок отписался /stop либо заблокировал бота.
// ★ Возвращает true только если Telegram реально принял сообщение.
//   На 429 — один повтор с retry_after; на 403 — снимаем подписку.
async function sendNotification(userId, text) {
  let chatId;
  try {
    chatId = await redisGet(`tg_chat:${userId}`);
  } catch (e) { return false; }
  if (!chatId || chatId === 'null') return false; // нет подписки
  // ★ Страховка от «чужих» уведомлений: старый групповой chat_id или
  //   любое значение, не равное userId, не шлём — подписку сбрасываем.
  if (String(chatId) !== String(userId)) {
    console.warn(`[notify] ${userId}: сохранён чужой chatId ${chatId} — подписка сброшена`);
    try { await redisSet(`tg_chat:${userId}`, ''); } catch (e) { /* ignore */ }
    return false;
  }

  // ★ Доставка должна переживать временные сбои. Раньше был один повтор
  //   только на 429, а сетевая ошибка/5xx/таймаут теряли уведомление навсегда.
  //   Теперь — до 3 попыток с нарастающей паузой; 403 снимает подписку.
  const MAX_ATTEMPTS = 3;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      await bot.sendMessage(String(userId), text, { parse_mode: 'HTML' });
      return true;
    } catch (e) {
      const status = e && e.response && e.response.statusCode;
      console.warn(`[notify] Не удалось отправить ${userId} (попытка ${attempt + 1}/${MAX_ATTEMPTS}):`, e.message);
      if (status === 403 || status === 400) {
        // 403 — игрок заблокировал бота. 400 — Telegram не принял разметку
        // (повтор не поможет). Снимаем подписку только на 403.
        if (status === 403) {
          try { await redisSet(`tg_chat:${userId}`, ''); } catch (e2) { /* ignore */ }
        }
        return false;
      }

      const lastAttempt = attempt === MAX_ATTEMPTS - 1;
      if (lastAttempt) return false;

      let waitMs = 1500 * (attempt + 1);
      if (status === 429) {
        const retry = Number(e.response && e.response.body && e.response.body.parameters && e.response.body.parameters.retry_after) || 2;
        waitMs = Math.min(15, Math.max(1, retry)) * 1000;
      } else if (typeof status === 'number' && status >= 400 && status < 500 && status !== 429) {
        return false; // прочие 4xx повторять бессмысленно
      }
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  return false;
}

// Upstash REST отдаёт result как строку, но если значение записали
// через JSON.SET / другой клиент — как уже готовый объект.
// Поэтому JSON.parse нельзя вызывать вслепую: только через этот хелпер.
function parseRedisJson(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

// ★ Обрезка текста без разрыва HTML: Telegram отвергает ВСЁ сообщение,
//   если разрезать тег или сущность (&lt;). Режем по границе строки
//   и закрываем оставшиеся теги.
function trimNotifyText(raw, maxLen) {
  let text = String(raw == null ? '' : raw);
  const limit = Math.max(32, Number(maxLen) || 1000);
  if (text.length <= limit) return text;

  let cut = text.slice(0, limit - 1);
  const nl = cut.lastIndexOf('\n');
  if (nl > limit * 0.5) cut = cut.slice(0, nl);
  // Не обрываем сущность и незакрытый тег.
  cut = cut.replace(/&[a-zA-Z#0-9]*$/, '').replace(/<[^>]*$/, '');

  const tags = ['b', 'strong', 'i', 'em', 'u', 's', 'code', 'pre'];
  for (const tag of tags) {
    const open = (cut.match(new RegExp('<' + tag + '>', 'gi')) || []).length;
    const close = (cut.match(new RegExp('</' + tag + '>', 'gi')) || []).length;
    for (let k = close; k < open; k++) cut += '</' + tag + '>';
  }
  return cut + '…';
}

async function redisGet(key) {
  const url = `${UPSTASH_REDIS_REST_URL}/get/${encodeURIComponent(key)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` } });
  if (!r.ok) {
    console.warn(`[redis] GET ${key} → HTTP ${r.status}`);
    return null;
  }
  const data = await r.json();
  if (data && data.error) {
    console.warn(`[redis] GET ${key} → ${data.error}`);
    return null;
  }
  const result = data ? data.result : null;
  if (result != null && typeof result !== 'string') {
    console.log(`[redis] GET ${key} вернул ${typeof result} — отдаю как есть`);
  }
  return result;
}

// Удаление ключа (админке нужно сносить сейв и кошелёк игрока).
// Upstash REST: одиночную команду можно отправить путём /del/{key}.
async function redisDel(key) {
  const url = `${UPSTASH_REDIS_REST_URL}/del/${encodeURIComponent(key)}`;
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` } });
    if (!r.ok) {
      console.warn(`[redis] DEL ${key} → HTTP ${r.status}`);
      return false;
    }
    const data = await r.json().catch(function() { return null; });
    if (data && data.error) {
      console.warn(`[redis] DEL ${key} → ${data.error}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[redis] DEL ${key} → ${e.message}`);
    return false;
  }
}

// ★ Метка сброса аккаунта. Ставится при удалении: пока клиент не подтвердит
// сброс (POST /api/reset-ack), сервер не принимает сейв — иначе старый
// локальный прогресс «воскресил» бы удалённый аккаунт. После подтверждения
// метка снимается, и игрок спокойно начинает новую игру.
const RESET_PREFIX = 'reset:';
// Метка старой схемы (вечная блокировка). Больше не используется, но чистим её,
// чтобы ранее «удалённые» игроки тоже смогли начать заново.
const LEGACY_DELETED_PREFIX = 'deleted:';

async function isResetPending(userId) {
  try {
    return (await redisGet(RESET_PREFIX + userId)) != null;
  } catch (e) {
    // Redis недоступен — не блокируем игру, сохранение всё равно упадёт позже.
    console.warn('[account] проверка сброса не удалась:', e.message);
    return false;
  }
}

function accountResetResponse(res) {
  return res.status(410).json({ error: 'Account reset required', code: 'account_reset' });
}

// Произвольная команда через REST (нужна для SCAN в админке).
async function redisCommand(...args) {
  const r = await fetch(UPSTASH_REDIS_REST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`Upstash HTTP ${r.status}`);
  const data = await r.json();
  if (data && data.error) throw new Error(data.error);
  return data ? data.result : null;
}

async function redisScanAll(match, maxKeys = 500) {
  // ★ Set вместо includes: на большом количестве ключей O(n²) заметно
  //   замедлял проход, а дубликаты SCAN всё равно отсекаются.
  const seen = new Set();
  let cursor = '0';
  do {
    const [next, batch] = await redisCommand('SCAN', cursor, 'MATCH', match, 'COUNT', '200');
    cursor = String(next);
    if (Array.isArray(batch)) {
      for (const k of batch) {
        if (typeof k !== 'string') continue;
        if (seen.has(k)) continue;
        seen.add(k);
        if (seen.size >= maxKeys) break;
      }
    }
    if (seen.size >= maxKeys) break;
  } while (cursor !== '0');
  return Array.from(seen).slice(0, maxKeys);
}

// ─── Валидация initData ─────────────────────────────────────────
// Реализация — lib/save-validation.js: HMAC-подпись, сравнение постоянным
// временем (=== утекает по таймингам), проверка свежести auth_date и user.id.
// ★ Мини-апп может быть открыт сутками: для игры принимаем initData до 7 суток,
//   иначе после 24 ч молча отваливаются сейвы, присутствие и пуши (401).
//   Для платежей остаётся строгий 24-часовой режим.
const INIT_DATA_MAX_AGE_SEC = 7 * 24 * 3600;
function validateInitData(initData) {
  return validateInitDataCore(initData, BOT_TOKEN, { maxAgeSec: INIT_DATA_MAX_AGE_SEC });
}
function validateInitDataStrict(initData) {
  return validateInitDataCore(initData, BOT_TOKEN);
}

// Атомарный счётчик с TTL для лимитов. 0 — если Redis недоступен
// (лимит тогда не сработает, но сейвы продолжат работать).
async function bumpCounter(key, ttlSec) {
  try {
    const n = Number(await redisCommand('INCR', key));
    if (n === 1) await redisCommand('EXPIRE', key, ttlSec);
    return Number.isFinite(n) ? n : 0;
  } catch (e) {
    console.warn(`[redis] INCR ${key} → ${e.message}`);
    return 0;
  }
}

// То же, но с суммой за раз (для пачек кликов)
async function bumpCounterBy(key, amount, ttlSec) {
  try {
    const n = Number(await redisCommand('INCRBY', key, amount));
    if (n === Number(amount)) await redisCommand('EXPIRE', key, ttlSec);
    return Number.isFinite(n) ? n : 0;
  } catch (e) {
    console.warn(`[redis] INCRBY ${key} → ${e.message}`);
    return 0;
  }
}

// ─── Серверный кошелёк (вариант C, этап 1) ──────────────────────
// Выключен по умолчанию: включается SERVER_AUTHORITATIVE=1.
// Пока флаг выключен, сервер ведёт себя как раньше.
const SERVER_AUTHORITATIVE = process.env.SERVER_AUTHORITATIVE === '1';
// Доля лимита ресурса, которую можно «добрать» за одну сверку (награды,
// которые пока выдаёт клиент: миссии, сундуки, ежедневные).
const DEFAULT_ALLOWANCE_SHARE = 0.05;
const WALLET_ALLOWANCE_SHARE = Number.isFinite(Number(process.env.WALLET_ALLOWANCE_SHARE))
  ? Math.max(0, Number(process.env.WALLET_ALLOWANCE_SHARE))
  : DEFAULT_ALLOWANCE_SHARE;
const MAX_CLICKS_PER_SEC = Number(process.env.MAX_CLICKS_PER_SEC || 30);
// Во сколько раз «прочий» доход (миссии, кометы, частицы, ежедневные)
// может превысить пассивный за тот же интервал.
const REWARD_EXTRA_SHARE = Number.isFinite(Number(process.env.REWARD_EXTRA_SHARE))
  ? Math.max(0, Number(process.env.REWARD_EXTRA_SHARE))
  : 2.0;
const REWARD_MAX_SECONDS = 3600;
// Потолок копилки разовых наград — доля лимита хранилища (см. lib/reward.js).
// 0.5 покрывает награды боссов/миссий (2–3 часа дохода), не ломая баланс.
const REWARD_BANK_SHARE = Number.isFinite(Number(process.env.REWARD_BANK_SHARE))
  ? Math.max(0, Number(process.env.REWARD_BANK_SHARE))
  : 0.5;

// Проверка «оплаченных возможностей» (планеты/системы).
// По умолчанию только флаг; при CAPABILITY_ENFORCE=1 сейв отклоняется.
const CAPABILITY_ENFORCE = process.env.CAPABILITY_ENFORCE === '1';
// Допуск аудита «оплаченных возможностей» (доля лимита пыли): доход,
// который сервер ещё не успел зачислить (клики/награды в пути), не должен
// выглядеть как подмена планет.
const CAPABILITY_TOLERANCE_SHARE = Number.isFinite(Number(process.env.CAPABILITY_TOLERANCE_SHARE))
  ? Math.max(0, Number(process.env.CAPABILITY_TOLERANCE_SHARE))
  : 0.02;
if (CAPABILITY_ENFORCE) {
  console.warn('[config] CAPABILITY_ENFORCE=1 игнорируется: ответ 409 откатывал только что совершённые действия. Остаётся флаг phantom_capability.');
}
const ENERGY_TO_DUST = Number(process.env.ENERGY_TO_DUST || 1e6);
const CIV_TO_DUST = Number(process.env.CIV_TO_DUST || 1e9);

// ★ Выполнить функцию на игровом состоянии из сейва.
// game-core — один общий vm-контекст, поэтому перед каждым вызовом
// выставляем нужный сейв. При ошибке возвращаем null, чтобы вызывающий
// код мог безопасно продолжить без серверных формул.
function withCoreState(save, fn) {
  if (!gameCore || !save || typeof save !== 'object') return null;
  try {
    gameCore.setState(save);
    return fn();
  } catch (e) {
    console.warn('[game-core] withCoreState:', e.message);
    return null;
  }
}

// Кошелёк со всеми служебными метками
function ensureWallet(wallet, save, now) {
  const w = wallet || walletFromSave(save, now);
  if (!Number.isFinite(Number(w.lastRewardAt))) w.lastRewardAt = Number(now) || Date.now();
  // Миграция: старые кошельки без металлов — инициализируем из сейва один раз.
  if (!Number.isFinite(Number(w.metalAmount))) w.metalAmount = Number(save && save.metalAmount) || 0;
  return w;
}

async function readWallet(userId) {
  const wallet = parseRedisJson(await redisGet(`wallet:${userId}`));
  return (wallet && typeof wallet === 'object') ? wallet : null;
}

async function writeWallet(userId, wallet) {
  const ok = await redisSet(`wallet:${userId}`, JSON.stringify(wallet));
  if (!ok) console.warn('[writeWallet] не удалось записать кошелёк', userId);
  return ok;
}

// Начисляет кошельку пассивный доход за прошедшее время:
// до 30 с — обычный онлайн-тик (100%), больше — офлайн-правило игры.
function accrueWalletPassive(wallet, save, now) {
  const since = Number(wallet.updatedAt) || now;
  const elapsedSec = Math.max(0, (now - since) / 1000);
  const earned = { dust: 0, energy: 0, civ: 0, metals: 0 };

  if (!gameCore || elapsedSec <= 0) {
    wallet.updatedAt = now;
    return earned;
  }

  try {
    if (elapsedSec >= 30) {
      const base = Object.assign({}, save, walletToSavePatch(wallet));
      const acc = gameCore.accrueOffline(base, Math.min(elapsedSec, 30 * 24 * 3600));
      earned.dust = acc.earned.dust;
      earned.energy = acc.earned.energy;
      earned.civ = acc.earned.civ;
      earned.metals = acc.earned.metals || 0;
      Object.assign(wallet, walletFromSave(acc.data, now));
      return earned;
    }

    gameCore.setState(save);
    const rates = gameCore.rates();
    const caps = gameCore.caps();
    Object.assign(earned, accruePassive(wallet, elapsedSec, rates, caps, 1));
    wallet.updatedAt = now;
  } catch (e) {
    console.warn('[wallet] начисление не удалось:', e.message);
    wallet.updatedAt = now;
  }
  return earned;
}

// ─── Оповещения админки (без отката прогресса) ─────────────────
// Сервер больше не обрезает ресурсы: любые расхождения превращаются
// в структурированные alert'ы. Админка показывает причину, способ
// получения и числа-доказательства, а игрок продолжает играть.
const WALLET_FIELD_LABELS = {
  dust: 'пыль',
  dustTotal: 'всего добыто пыли',
  energy: 'энергия',
  civLevel: 'цивилизация',
  metalAmount: 'металлы',
};

function saveProgressSnapshot(save) {
  const s = (save && typeof save === 'object') ? save : {};
  const other = Array.isArray(s.otherSystems) ? s.otherSystems : [];
  let totalPlanets = Array.isArray(s.planets) ? s.planets.length : 0;
  let otherSystems = 0;
  for (let i = 0; i < other.length; i++) {
    if (!other[i] || typeof other[i] !== 'object') continue;
    otherSystems++;
    if (Array.isArray(other[i].planets)) totalPlanets += other[i].planets.length;
  }
  return {
    stage: String(s.stage || ''),
    systems: Math.max(0, Math.floor(Number(s.systems) || 0)),
    otherSystems: otherSystems,
    activePlanets: Array.isArray(s.planets) ? s.planets.length : 0,
    totalPlanets: totalPlanets,
    lastTick: Math.max(0, Number(s.lastTick) || 0),
  };
}

async function recordFraudAlerts(userId, alerts) {
  const list = (Array.isArray(alerts) ? alerts : [alerts]).filter(Boolean);
  if (!list.length) return false;
  const key = `save_flag:${userId}`;
  try {
    const prev = parseRedisJson(await redisGet(key));
    const merged = mergeFraudAlerts(prev, list, Date.now());
    await redisSet(key, JSON.stringify(merged));
    return true;
  } catch (e) {
    console.warn(`[fraud] user=${userId} не удалось записать оповещение:`, e.message);
    return false;
  }
}

function walletAlertsFromFindings(findings, ctx) {
  const context = ctx || {};
  return (Array.isArray(findings) ? findings : []).map(function(f) {
    const field = String(f.field || 'dust');
    const label = WALLET_FIELD_LABELS[field] || field;
    const before = Number(f.wallet) || 0;
    const after = Number(f.client) || 0;
    if (f.code === 'wallet_invalid_value') {
      return createFraudAlert({
        code: 'wallet_invalid_value',
        severity: 'medium',
        title: '🧾 Некорректное значение в сейве',
        reason: `Клиент прислал ${field} = ${JSON.stringify(f.client)} (${label}). Сервер принял 0, но прогресс не откатывал.`,
        method: 'Повреждённый сейв, ручная правка localStorage или баг клиентской формулы.',
        fields: [{ field: field, label: label, wallet: before, client: f.client, accepted: 0 }],
        evidence: context,
        at: Date.now(),
      });
    }

    const extra = Math.max(0, Number(f.extra) || (after - (Number(f.maxValue) || 0)));
    return createFraudAlert({
      code: f.code === 'wallet_dust_total_rewind' ? 'wallet_dust_total_rewind' : 'wallet_unearned_gain',
      severity: 'high',
      title: f.code === 'wallet_dust_total_rewind'
        ? '💰 Счётчик добытой пыли уменьшился'
        : '💰 Необоснованный прирост ресурса',
      reason: f.code === 'wallet_dust_total_rewind'
        ? `dustTotal в сейве меньше серверного: ${Math.round(after)} против ${Math.round(before)}. Баланс принят без отката.`
        : `Клиент прислал ${label} = ${Math.round(after)}, сервер допускал не больше ${Math.round(Number(f.maxValue) || 0)} ` +
          `(кошелёк ${Math.round(before)} + допуск ${Math.round(Number(f.allowance) || 0)}). ` +
          `Сверх допуска: ${Math.round(extra)}. Баланс принят без отката.`,
      method: 'POST /api/save: клиент сохранил баланс после покупки, награды или пассивного дохода. ' +
        'Возможные способы: подмена localStorage/облачного сейва, повторное начисление награды, рассинхрон устройств.',
      fields: [{
        field: field, label: label, wallet: before, client: after,
        maxValue: Number(f.maxValue) || 0, allowance: Number(f.allowance) || 0, extra: extra,
      }],
      evidence: context,
      at: Date.now(),
    });
  });
}

// ─── Express ────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '16mb' })); // 16mb: поздняя игра с тысячами систем

// CORS: если задан ALLOWED_ORIGIN (через запятую), отдаём только этим сайтам.
// Пока переменная не задана — ведём себя как раньше ("*"), чтобы не
// сломать уже работающий Web-клиент при деплое.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGIN || '')
  .split(',')
  .map(function(s) { return s.trim(); })
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.get('origin');

  if (!ALLOWED_ORIGINS.length) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && ALLOWED_ORIGINS.indexOf(origin) !== -1) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else if (origin) {
    // ★ Публичный API должен отвечать любому origin: аутентификация идёт
    // подписью initData, а не cookie. Иначе игроки, у которых прокси-домен
    // заблокирован, не могут переключиться на Render напрямую (Load failed).
    if (String(req.path || '').startsWith('/api/')) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    } else {
      // Админка и служебные страницы — прежняя строгая политика.
      console.warn(`[cors] чужой origin=${origin} path=${req.path}`);
      if (req.method === 'OPTIONS') return res.sendStatus(403);
    }
  }
  // Запросы без Origin (нативные WebView Telegram) не блокируем

  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
  // ★ Кэшируем preflight: иначе keepalive-запрос при pagehide может
  //   не успеть пройти холодный OPTIONS и «офлайн» не доедет.
  res.setHeader('Access-Control-Max-Age', '7200');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─── 1. Создание инвойса ────────────────────────────────────────
app.post('/api/create-invoice', async (req, res) => {
  try {
    const { initData, product } = req.body || {};
    const user = validateInitDataStrict(initData); // плятежи — строго 24 ч
    if (!user) return res.status(401).json({ error: 'Invalid initData' });
    if (await isResetPending(user.id)) return accountResetResponse(res);

    const prod = PRODUCTS[product];
    if (!prod) return res.status(400).json({ error: 'Unknown product' });

    const link = await bot.createInvoiceLink(
      prod.label,
      `Покупка в игре «Аккреция»`,
      JSON.stringify({ user_id: user.id, product }),
      '',
      'XTR',
      [{ label: prod.label, amount: prod.stars }]
    );

    await redisSet(`pending:${user.id}:${product}`, JSON.stringify({ created_at: Date.now(), invoice_link: link }));
    res.json({ ok: true, invoiceLink: link });
  } catch (e) {
    console.error('[create-invoice]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── 2. Подтверждение выдачи ───────────────────────────────────
app.post('/api/claim', async (req, res) => {
  try {
    const { initData, product } = req.body || {};
    const user = validateInitDataStrict(initData); // плятежи — строго 24 ч
    if (!user) return res.status(401).json({ error: 'Invalid initData' });
    if (await isResetPending(user.id)) {
      console.warn(`[claim] отказ: для user=${user.id} нужен сброс аккаунта`);
      return accountResetResponse(res);
    }
    if (!Object.prototype.hasOwnProperty.call(PRODUCTS, product)) {
      return res.status(400).json({ error: 'Unknown product' });
    }

    const key = `purchase:${user.id}:${product}`;
    const raw = await redisGet(key);
    if (!raw) return res.status(404).json({ error: 'No paid purchase' });

    const purchase = parseRedisJson(raw);
    if (!purchase || typeof purchase !== 'object') return res.status(500).json({ error: 'Corrupted purchase record' });
    if (purchase.granted) return res.status(409).json({ error: 'Already granted' });
    if (Date.now() - purchase.paid_at > 24 * 3600 * 1000) return res.status(410).json({ error: 'Expired' });

    // ★ Атомарная защита от двойной выдачи: SET NX пропускает только первый
    // параллельный запрос /api/claim. Без этого два одновременных запроса
    // оба прошли бы проверку purchase.granted и выдали бы награду дважды.
    const claimLockKey = `claim:${user.id}:${product}`;
    const locked = await redisCommand('SET', claimLockKey, '1', 'NX', 'EX', '3600');
    if (locked !== 'OK') {
      return res.status(409).json({ error: 'Already granted' });
    }

    purchase.granted = true;
    purchase.granted_at = Date.now();
    await redisSet(key, JSON.stringify(purchase));

    // ★ Право на платный контент храним на СЕРВЕРЕ. Сейв пишет клиент,
    // поэтому щит в сейве — не доказательство оплаты, а запись в Redis — да.
    // Право живёт по абсолютной метке и восстанавливается на любом устройстве.
    let entitlement = null;
    if (product === 'shield') {
      const entKey = `entitlement:shield:${user.id}`;
      const prevUntil = Number(await redisGet(entKey)) || 0;
      const shieldUntil = nextShieldEntitlement(prevUntil, Date.now());
      await redisSet(entKey, String(shieldUntil));
      entitlement = { shieldUntil };
    }
    if (product === 'booster') {
      const b = gameCore ? gameCore.boosterConfig() : { hours: 2 };
      const entKey = `entitlement:booster:${user.id}`;
      const prevUntil = Number(await redisGet(entKey)) || 0;
      const boosterUntil = nextBoosterUntil(prevUntil, Date.now(), (Number(b.hours) || 2) * 3600 * 1000);
      await redisSet(entKey, String(boosterUntil));
      entitlement = { boosterUntil };
    }
    // ★ Награду платного сундука выбирает СЕРВЕР, а не клиент.
    // Игрок оплатил Stars — сервер кидает лут и отдаёт ключ предмета.
    // Клиент только крутит рулетку до уже выбранного предмета.
    let reward = null;
    if (product === 'chest') {
      try {
        const loot = gameCore ? gameCore.chestLoot() : null;
        reward = rollChestReward(loot);
        if (reward) {
          purchase.reward = reward;
          await redisSet(key, JSON.stringify(purchase));

          // ★ Сундук даёт систему с планетами «бесплатно» (оплачено Stars).
          // Выдаём бюджет возможностей, иначе проверка сочтёт это подделкой.
          if (SERVER_AUTHORITATIVE && gameCore) {
            try {
              const savePayload = parseRedisJson(await redisGet(`cloudsave:${user.id}`));
              if (savePayload && savePayload.data && typeof savePayload.data === 'object') {
                const systems = Math.max(1, Number(savePayload.data.systems) || 1);
                const value = withCoreState(savePayload.data, function() {
                  // ★ Покрываем ПОЛНУЮ стоимость выдачи: 8 орбит (Σ planetCost)
                  // + система. Раньше было 8·planetCost(0) — в 25.5 раза меньше
                  // реального прироста capability().
                  return chestCapabilityValue(gameCore.planetCostSum(8), gameCore.systemCost(systems));
                });
                if (value && value > 0) {
                  const wallet = ensureWallet(await readWallet(user.id), savePayload.data, Date.now());
                  wallet.capBudget = (Number(wallet.capBudget) || 0) + value;
                  await writeWallet(user.id, wallet);
                }
              }
            } catch (e) {
              console.warn('[claim] бюджет возможностей не выдан:', e.message);
            }
          }
        }
      } catch (e) {
        console.warn('[claim] не удалось выбрать награду:', e.message);
      }
    }

    res.json({ ok: true, product, granted_at: purchase.granted_at, entitlement, reward });
  } catch (e) {
    console.error('[claim]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── 3. Облачные сохранения ────────────────────────────────────
const MAX_SAVE_SIZE = 12 * 1024 * 1024; // 12 МБ: галактики с тысячами звёзд
const SAVE_RATE_LIMIT_MS = 5000;

// ─── Публичный топ игроков ─────────────────────────────────────
// Сортировка: престиж → системы → пыль. Кэш на 60 секунд, чтобы не
// сканировать Redis на каждый запрос.
let _leaderboardCache = { at: 0, top: [] };
const LEADERBOARD_CACHE_MS = 60 * 1000;
const LEADERBOARD_LIMIT = 50;

app.get('/api/leaderboard', async (req, res) => {
  // ★ Публичный рейтинг не должен зависеть от CORS-настроек Render:
  // у части игроков прокси-домен недоступен, и клиент пробует Render напрямую.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Vary', 'Accept-Encoding');
  res.setHeader('Cache-Control', 'public, max-age=30');
  try {
    const nowMs = Date.now();
    if (_leaderboardCache.top.length && nowMs - _leaderboardCache.at < LEADERBOARD_CACHE_MS) {
      return res.json({ ok: true, top: _leaderboardCache.top, cached: true });
    }

    const keys = await redisScanAll('cloudsave:*', 500);
    const players = [];
    for (const key of keys) {
      const raw = await redisGet(key);
      if (raw == null) continue;
      const payload = parseRedisJson(raw);
      if (!payload || !payload.data || typeof payload.data !== 'object') continue;
      const data = payload.data;
      const rawName = (typeof data.playerName === 'string') ? data.playerName.trim() : '';
      // ★ Прайм-системы не идут в зачёт лидерборда (ни системы, ни планеты).
      const sysArr = Array.isArray(data.otherSystems) ? data.otherSystems : [];
      let primeSystems = data.primeSystem ? 1 : 0;
      for (const s of sysArr) {
        if (s && (s.primeData || s.isPrime || s.primeSystem)) primeSystems++;
      }
      const totalSystems = Math.max(1, Math.floor(Number(data.systems) || 1));
      const plainSystems = Math.max(1, totalSystems - primeSystems);
      const activePlanets = Array.isArray(data.planets) ? data.planets.length : 0;
      const plainPlanets = data.primeSystem ? 0 : activePlanets;
      players.push({
        id: key.slice('cloudsave:'.length),
        name: rawName ? rawName.slice(0, 32) : 'Пилот',
        dustTotal: Math.max(0, Number(data.dustTotal) || 0),
        systems: plainSystems,
        planets: plainPlanets,
        prestigeLevel: Math.max(0, Math.floor(Number(data.prestigeLevel) || 0)),
      });
    }

    // Сортируем: сначала по престижу, потом по системам, потом по пыли
    players.sort((a, b) => {
      if (b.prestigeLevel !== a.prestigeLevel) return b.prestigeLevel - a.prestigeLevel;
      if (b.systems !== a.systems) return b.systems - a.systems;
      return b.dustTotal - a.dustTotal;
    });

    const top = players.slice(0, LEADERBOARD_LIMIT);
    _leaderboardCache = { at: nowMs, top };
    res.json({ ok: true, count: players.length, top });
  } catch (e) {
    console.error('[leaderboard]', e);
    // Отдаём последний удачный снимок вместо ошибки: рейтинг не критичен,
    // а игроки не должны видеть «Load failed» из-за одного сбоя Redis.
    if (_leaderboardCache.top.length) {
      return res.json({ ok: true, top: _leaderboardCache.top, cached: true, stale: true });
    }
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/save', async (req, res) => {
  try {
    const { initData, saveData, baseVersion } = req.body || {};
    const user = validateInitData(initData);
    if (!user) return res.status(401).json({ error: 'Invalid initData' });
    // Игрок сейчас в игре — фиксируем присутствие даже если сейв придёт позже.
    await touchPresence(user.id);
    // ★ Пока клиент не подтвердил сброс, сейв не принимаем — иначе старый
    // локальный прогресс вернёт удалённый аккаунт.
    if (await isResetPending(user.id)) {
      console.warn(`[save] отказ: для user=${user.id} нужен сброс аккаунта`);
      return accountResetResponse(res);
    }
    // Без этого клиент мог прислать строку вместо числа (NaN ломает
    // сравнения цен), __proto__ (отравление прототипа) или 10 МБ мусора.
    const checked = validateSaveData(saveData);
    if (!checked.ok) {
      console.warn(`[save] отклонён сейв user=${user.id}: ${checked.error}`);
      return res.status(400).json({ error: 'Invalid save data: ' + checked.error });
    }
    let safeSave = checked.data;
    if (checked.flags.length) console.warn(`[save] user=${user.id} flags: ${checked.flags.join(',')}`);

    const json = JSON.stringify(safeSave);
    if (json.length > MAX_SAVE_SIZE) return res.status(413).json({ error: 'Save too large', size: json.length });

    // Грубая квота: сейвами нельзя забивать Redis и бюджет Upstash
    const hourKey = `save_q:${user.id}:${Math.floor(Date.now() / 3600000)}`;
    // ★ Квоту только читаем — счётчик растёт после успешной записи,
    //   иначе 409/429 сами съедали бы лимит 300/час.
    const savesThisHour = Number(await redisGet(hourKey)) || 0;
    if (savesThisHour >= 300) {
      console.warn(`[save] user=${user.id} превысил квоту сохранений`);
      return res.status(429).json({ error: 'Too many saves per hour' });
    }
    const rlKey = `save_rl:${user.id}`;
    const last = await redisGet(rlKey);
    if (last && Date.now() - Number(last) < SAVE_RATE_LIMIT_MS) return res.status(429).json({ error: 'Too frequent' });

    // ★ Оптимистическая блокировка: клиент присылает версию, которую он видел.
    // Если на сервере уже новее — отдаём 409 + актуальный сейв, чтобы клиент
    // не затёр прогресс с другого устройства «вслепую».
    const cloudKey = `cloudsave:${user.id}`;
    const existingRaw = await redisGet(cloudKey);
    const existing = parseRedisJson(existingRaw);
    const curVersion = (existing && typeof existing.version === 'number') ? existing.version : 0;

    // ★ Сразу после правки админа не проверяем сейв на «скачок»: клиент
    // мог ещё не принять админский срез, и разница была бы ложной.
    let adminTrust = false;
    try {
      adminTrust = (await redisGet(`admin_trust:${user.id}`)) != null;
      if (adminTrust) await redisDel(`admin_trust:${user.id}`);
    } catch (e) { /* некритично */ }

    // ★ Скачок ресурсов за секунды — это не игра, а подмена сейва.
    // Не блокируем (можно и ошибиться), но фиксируем для админки.
    if (existing && existing.data && !adminTrust) {
      try {
        const anomalies = detectSaveAnomalies(existing.data, safeSave, existing.saved_at);
        if (anomalies.length) {
          console.warn(`[save] подозрительный прогресс user=${user.id}: ${anomalies.join(',')}`);
          await recordFraudAlerts(user.id, alertsFromRecord({ flags: anomalies, at: Date.now() }));
        }
      } catch (e) {
        console.warn('[save] проверка аномалий не удалась:', e.message);
      }
    }

    // ★ Щит в сейве: настоящий предел — серверное право или 8-часовой
    // игровой щит. Всё, что дальше, — нарисовано вручную (флаг для админки).
    try {
      const shieldRight = Number(await redisGet(`entitlement:shield:${user.id}`)) || 0;
      if (isShieldSuspicious(safeSave, Date.now(), shieldRight)) {
        console.warn(`[save] подозрительный shieldUntil user=${user.id}`);
        await recordFraudAlerts(user.id, [createFraudAlert({
          code: 'shield_forged',
          severity: 'high',
          title: '🛡 Подозрительный щит',
          reason: `shieldUntil = ${new Date(Number(safeSave.shieldUntil) || 0).toISOString()}, ` +
            `а серверное право/игровой лимит допускают не дальше ${new Date(shieldRight || Date.now()).toISOString()}.`,
          method: 'Поле shieldUntil в сейве больше серверного права. Возможные способы: правка localStorage, подмена облачного сейва, повторная выдача щита.',
          evidence: { shieldUntil: Number(safeSave.shieldUntil) || 0, serverRight: shieldRight, now: Date.now() },
        })]);
      }
      // ★ Детектор без обрезки оставлял читеру «вечный» щит. Обрезаем
      // нарисованный щит так же, как бустер: потолок — серверное право
      // или 9 часов игрового щита.
      const shieldBefore = Number(safeSave.shieldUntil) || 0;
      safeSave = clampShield(safeSave, shieldRight, Date.now());
      const shieldAfter = Number(safeSave.shieldUntil) || 0;
      if (shieldAfter < shieldBefore) {
        console.warn(`[save] user=${user.id} обрезан щит: ${shieldBefore} → ${shieldAfter}`);
      }
    } catch (e) {
      console.warn('[save] проверка щита не удалась:', e.message);
    }

    // ★ Бустер: единственный источник — серверное право (покупка за металлы).
    // Работает только в режиме кошелька: при выключенном флаге бустеры,
    // купленные локально, не трогаем.
    if (SERVER_AUTHORITATIVE) {
      try {
        const boosterRight = Number(await redisGet(`entitlement:booster:${user.id}`)) || 0;
        const before = Number(safeSave.boosters && safeSave.boosters.incomeUntil) || 0;
        safeSave = clampBooster(safeSave, boosterRight);
        const after = Number(safeSave.boosters && safeSave.boosters.incomeUntil) || 0;
        if (after < before) {
          console.warn(`[save] user=${user.id} обрезан бустер: ${before} → ${after}`);
          await recordFraudAlerts(user.id, [createFraudAlert({
            code: 'booster_forged',
            severity: 'high',
            title: '⚡ Подозрительный бустер',
            reason: `boosters.incomeUntil = ${new Date(before).toISOString()}, а серверное право — ${new Date(boosterRight || 0).toISOString()}.`,
            method: 'Бустер в сейве дольше серверного права. Возможные способы: правка boosters.incomeUntil, повторная покупка/выдача.',
            evidence: { before: before, after: after, serverRight: boosterRight, now: Date.now() },
          })]);
        }
      } catch (e) {
        console.warn('[save] проверка бустера не удалась:', e.message);
      }
    }

    // ★ СЕРВЕР — ЕДИНСТВЕННЫЙ ИСТОЧНИК ПРАВДЫ.
    // Писать можно только поверх той версии, которую клиент реально видел.
    // Клиент без версии (0/undefined) не имеет права затирать чужой прогресс → 409.
    const baseVer = Number(baseVersion);
    if (existing && existing.data && (!Number.isFinite(baseVer) || baseVer !== curVersion)) {
      return res.status(409).json({
        ok: false, conflict: true,
        data: existing.data, saved_at: existing.saved_at, version: curVersion,
      });
    }
    // ★ Живой мир: если клиент «проснулся» после долгой заморозки,
    //   его lastTick мог отстать на часы. Досчитываем реальное время
    //   сами, прежде чем ставить новый серверный якорь. События не
    //   трогаем: их разыгрывает cron/load, чтобы не плодить пуши.
    if (gameCore && typeof gameCore.worldTick === 'function') {
      const existingTick = (existing && existing.data) ? Number(existing.data.worldTickAt) || 0 : 0;
      // ★ Якорь — последний КЛИЕНТСКИЙ тик, а не прошлый серверный сейв:
      //   живой клиент двигает lastTick каждый кадр, поэтому дельта ≈ 0
      //   (доход уже начислен игровым циклом). worldTickAt тут не годится —
      //   он отстаёт на интервал автосейва и давал двойное начисление.
      const lastClientTick = Number(safeSave.lastTick) || 0;
      const fromMs = Math.max(existingTick, lastClientTick);
      if (fromMs > 0) {
        const tick = gameCore.worldTick(safeSave, {
          now: Date.now(),
          fromMs: fromMs,
          skipEvents: true,
        });
        if (tick && tick.data) {
          safeSave = tick.data;
          appendOfflineWaveEvents(safeSave, tick.out, Date.now());
        } else {
          // ★ Тик упал (баг в формулах) — не теряем сейв клиента, но
          //   пишем в лог; якорь ниже сдвигается, т.к. состояние живого
          //   клиента уже актуально.
          console.warn('[save] живой досчёт не удался user=' + user.id);
        }
      }
    }
    // ★ СВЕРКА С СЕРВЕРНЫМ КОШЕЛЬКОМ — ТОЛЬКО АУДИТ (без откатов).
    // Баланс клиента принимается как есть: крупная покупка/награда больше
    // не откатывается из-за гонки автосейва. Все расхождения уходят
    // в админку как структурированные оповещения с причиной и способом.
    let walletToWrite = null;
    if (SERVER_AUTHORITATIVE && gameCore) {
      try {
        const wallet = ensureWallet(await readWallet(user.id), safeSave, Date.now());

        const now = Date.now();
        const earned = accrueWalletPassive(wallet, safeSave, now);

        // ★ Возможности (планеты/системы) должны быть оплачены.
        // Потраченное считаем по своим балансам, а не по словам клиента.
        const capPrevSave = existing && existing.data ? existing.data : safeSave;
        const capPrev = withCoreState(capPrevSave,
          function() { return gameCore.capability(); }) || 0;
        const nextInfo = withCoreState(safeSave, function() {
          return { cap: gameCore.capability(), caps: gameCore.caps() };
        }) || null;
        const capNext = nextInfo ? nextInfo.cap : 0;

        const spentValue =
          Math.max(0, (wallet.dust - earned.dust) - Number(safeSave.dust)) +
          Math.max(0, (wallet.energy - earned.energy) - Number(safeSave.energy)) * ENERGY_TO_DUST +
          Math.max(0, (wallet.civLevel - earned.civ) - Number(safeSave.civLevel)) * CIV_TO_DUST;

        const capAudit = capabilityAudit({
          prevCost: capPrev, nextCost: capNext,
          spentValue: spentValue, budget: Number(wallet.capBudget) || 0,
        });

        // Допуск: доход, который сервер ещё не успел зачислить (клики и
        // награды в пути), не должен выглядеть подменой планет.
        const capTolerance = nextInfo && nextInfo.caps
          ? Math.max(0, Number(nextInfo.caps.dust) || 0) * CAPABILITY_TOLERANCE_SHARE
          : 0;
        const hardUncovered = Math.max(0, capAudit.uncovered - capTolerance);
        const alerts = [];

        if (hardUncovered > 0) {
          console.warn(`[save] user=${user.id} необоснованный прирост возможностей: ` +
            `${Math.round(hardUncovered)} (delta=${Math.round(capAudit.delta)})`);
          alerts.push(createFraudAlert({
            code: 'phantom_capability',
            severity: hardUncovered > capAudit.delta * 0.5 ? 'high' : 'medium',
            title: '🏗 Неоплаченный прирост возможностей',
            reason: `Стоимость планет/систем выросла на ${Math.round(capAudit.delta)}, ` +
              `подтверждено тратами ${Math.round(spentValue)}, бюджет ${Math.round(Number(wallet.capBudget) || 0)}, ` +
              `допуск ${Math.round(capTolerance)}. Не покрыто: ${Math.round(hardUncovered)}.`,
            method: 'Сейв содержит больше систем/планет, чем оплачено. ' +
              'Возможные способы: правка localStorage/облачного сейва, бесплатное основание системы, дубликат планет/систем.',
            fields: [],
            evidence: {
              progressBefore: saveProgressSnapshot(capPrevSave),
              progressAfter: saveProgressSnapshot(safeSave),
              capability: {
                before: Math.round(capPrev), after: Math.round(capNext), delta: Math.round(capAudit.delta),
              },
              spentValue: Math.round(spentValue),
              budget: Math.round(Number(wallet.capBudget) || 0),
              tolerance: Math.round(capTolerance),
              uncovered: Math.round(hardUncovered),
              caps: nextInfo ? nextInfo.caps : null,
            },
            at: now,
          }));
        }
        // ★ Бюджет не обнуляем: откат/обнуление больше не наказывает игрока.
        // При подозрении оставляем бюджет как есть — решает админ, а не автомат.
        if (hardUncovered <= 0) {
          wallet.capBudget = remainingCapabilityBudget(wallet.capBudget, capAudit.delta, spentValue);
        }

        gameCore.setState(safeSave);
        const caps = gameCore.caps();
        const allowance = rewardAllowance(caps, WALLET_ALLOWANCE_SHARE);

        // ★ Копилка разовых наград входит в допуск аудита: если отчёт
        // /api/reward не успел (сеть), честная награда не должна
        // выглядеть подозрительной.
        const bank = accrueRewardBank(wallet, gameCore.rates(), caps, REWARD_BANK_SHARE, now);
        for (const field of ['dust', 'energy', 'civ', 'metals']) {
          allowance[field] = Math.max(0, Number(allowance[field]) || 0) +
            Math.max(0, Number(bank[field]) || 0);
        }

        const beforeAudit = {
          dust: wallet.dust, energy: wallet.energy,
          civLevel: wallet.civLevel, metalAmount: wallet.metalAmount,
        };
        const audit = auditWallet(wallet, safeSave, allowance);
        safeSave = audit.data;

        if (audit.findings.length) {
          alerts.push.apply(alerts, walletAlertsFromFindings(audit.findings, {
            progress: saveProgressSnapshot(safeSave),
            walletBefore: beforeAudit,
            walletAfter: {
              dust: wallet.dust, energy: wallet.energy,
              civLevel: wallet.civLevel, metalAmount: wallet.metalAmount, dustTotal: wallet.dustTotal,
            },
            earned: earned,
            caps: caps,
          }));
        }

        // Списываем с копилки только то, что клиент реально добрал сверх
        // серверного баланса (иначе бакет не пополнялся бы вообще).
        spendRewardBank(wallet, {
          dust: Math.max(0, wallet.dust - beforeAudit.dust),
          energy: Math.max(0, wallet.energy - beforeAudit.energy),
          civ: Math.max(0, wallet.civLevel - beforeAudit.civLevel),
        }, {});
        walletToWrite = wallet;

        if (alerts.length) await recordFraudAlerts(user.id, alerts);
      } catch (e) {
        console.warn('[save] аудит кошелька не удался:', e.message);
      }
    }

    // ★ Живой мир: сейв пришёл от активного клиента — время прожито
    //   до этого момента. Ставим серверный якорь, чтобы следующий
    //   серверный тик (когда игрок уйдёт) не начислил то же время снова.
    safeSave.worldTickAt = Date.now();
    safeSave.lastTick = safeSave.worldTickAt;

    // ★ Метку времени и номер версии ставит только СЕРВЕР.
    // Клиентским часам (Date.now() на телефоне/ПК/планшете) доверять нельзя —
    // они расходятся, и именно из-за этого устройства затирали друг друга.
    const payload = {
      data: safeSave,
      saved_at: Date.now(), // ★ Серверное время! Оно точное.
      user_id: user.id,
      version: curVersion + 1, // ★ Монотонный номер: по нему, а не по часам, сравниваем сейвы
    };
    const cas = await redisSetIfVersion(cloudKey, JSON.stringify(payload), curVersion);
    if (cas.failed) {
      return res.status(503).json({ error: 'Не удалось сохранить на сервер (хранилище недоступно)' });
    }
    if (cas.conflict) {
      // Кто-то успел записать раньше — отдаём актуальный сейв, чтобы клиент не затёр прогресс.
      const latest = cas.currentRaw ? parseRedisJson(cas.currentRaw) : null;
      return res.status(409).json({
        ok: false, conflict: true,
        data: latest && latest.data, saved_at: latest && latest.saved_at, version: cas.version,
      });
    }
    // ★ Кошелёк пишем только после успешного CAS. Иначе при 409 (конфликт
    // версий) клиентский срез затирал бы кошелёк, включая выдачу админа.
    if (walletToWrite) await writeWallet(user.id, walletToWrite);

    // ★ Лимиты фиксируем только после реальной записи: неудачный CAS (409)
    //   не должен блокировать следующий корректный save и жечь квоту.
    await redisSet(rlKey, String(Date.now()));
    try { await bumpCounter(hourKey, 3600); } catch (e) { /* квота не критична */ }

    res.json({
      ok: true, saved_at: payload.saved_at, version: payload.version,
      authoritative: SERVER_AUTHORITATIVE,
    });
  } catch (e) {
    console.error('[save]', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/load', async (req, res) => {
  try {
    const { initData, peek } = req.body || {};
    const user = validateInitData(initData);
    if (!user) return res.status(401).json({ error: 'Invalid initData' });
    // ★ Игрок открыл игру — фиксируем присутствие. Именно на last_seen,
    // а не на saved_at, опирается cron офлайн-вторжений.
    await touchPresence(user.id);
    // ★ Удалённый аккаунт: отдаём пустое облако с флагом reset. Клиент
    // сотрёт локальный прогресс, подтвердит сброс и начнёт заново.
    if (await isResetPending(user.id)) {
      console.log(`[load] user=${user.id}: ожидает подтверждения сброса`);
      return res.json({ ok: true, data: null, saved_at: 0, reset: true });
    }

    // Миграция со старой схемы: ранее «удалённые» игроки тоже начинают заново.
    const legacyRaw = await redisGet(LEGACY_DELETED_PREFIX + user.id);
    if (legacyRaw != null) {
      // Старую метку переводим в новую схему: клиент так же подтвердит сброс.
      await redisSet(RESET_PREFIX + user.id, JSON.stringify({ at: Date.now(), by: 'legacy' }));
      await redisDel(LEGACY_DELETED_PREFIX + user.id);
      console.log(`[load] user=${user.id}: старая метка удаления переведена в reset`);
      return res.json({ ok: true, data: null, saved_at: 0, reset: true });
    }
    // Лимит на загрузки: без него можно долбить сервер/перебирать initData
    const minuteKey = `load_q:${user.id}:${Math.floor(Date.now() / 60000)}`;
    if (await bumpCounter(minuteKey, 120) > 120) {
      return res.status(429).json({ error: 'Too frequent' });
    }

    const raw = await redisGet(`cloudsave:${user.id}`);
    if (!raw) return res.json({ ok: true, data: null, saved_at: 0 });

    let payload = parseRedisJson(raw);
    if (!payload || typeof payload !== 'object') return res.status(500).json({ error: 'Corrupted cloud save' });
    // ★ 30-секундный poll клиента — только чтение версии. Раньше он тоже
    //   прогонял живой тик и бампал version, из-за чего живой игрок каждые
    //   30 с откатывался к последнему автосейву. peek = без записи.
    if (peek === true) {
      return res.json({
        ok: true, data: payload.data, saved_at: payload.saved_at,
        version: Number(payload.version) || 0, offline: null,
        authoritative: !!SERVER_AUTHORITATIVE, wallet: null,
      });
    }
    // ★ ЖИВОЙ МИР: сейв не «догоняет» игрока при входе — его всё это
    // время проживал сервер. Тик применяем и здесь (последний проход
    // cron мог быть до 10 минут назад) и сразу закрепляем в Redis,
    // иначе возвращение снова превращалось бы в «симуляцию офлайна».
    const nowLoad = Date.now();
    let data = payload.data;
    let offline = null;
    let authoritative = false;
    let walletView = null;
    let loadVersion = Number(payload.version) || 0;

    if (gameCore && data && typeof data === 'object' && typeof data.stage === 'string' && payload.saved_at) {
      let tick = null;
      if (typeof gameCore.worldTick === 'function') {
        try {
          tick = gameCore.worldTick(data, {
            now: nowLoad,
            fromMs: Number(data.worldTickAt) || Number(payload.saved_at) || 0,
          });
        } catch (e) {
          console.warn('[load] живой тик не удался:', e.message);
          tick = null;
        }
      }
      if (tick && tick.data) {
        const world = tick.world || {};
        const waveCount = (tick.out && Array.isArray(tick.out.invasionWaves))
          ? tick.out.invasionWaves.length : 0;
        // ★ Пишем в Redis только когда время реально прожито или случилось
        //   событие. Иначе любой короткий load бампал бы version.
        const meaningful = Number(tick.elapsedSec) >= 30 || !!world.daily ||
          !!world.weekly || !!world.missed || waveCount > 0;
        if (meaningful) {
          data = tick.data;
          appendOfflineWaveEvents(data, tick.out, nowLoad);
          appendWorldTickEvents(data, tick, nowLoad);
          payload.data = data;
          payload.saved_at = nowLoad;
          payload.version = loadVersion + 1;
          const loadCas = await redisSetIfVersion(`cloudsave:${user.id}`,
            JSON.stringify(payload), loadVersion);
          loadVersion = payload.version;
          if (!loadCas.ok) {
            // ★ Пока читали/тикали, клиент успел сохраниться — его сейв новее.
            const fresh = parseRedisJson(loadCas.currentRaw);
            if (fresh && fresh.data) {
              payload = fresh;
              data = fresh.data;
              loadVersion = Number(fresh.version) || 0;
            }
            offline = null;
          } else if (tick.out && Number(tick.elapsedSec) >= 30) {
            offline = {
              seconds: Number(tick.elapsedSec) || 0,
              dustEarned: Number(tick.out.dustEarned) || 0,
              energyEarned: Number(tick.out.energyEarned) || 0,
              civEarned: Number(tick.out.civEarned) || 0,
              metalsEarned: Number(tick.out.metalsEarned) || 0,
            };
          }
        }
      }
    }
    // ★ СЕРВЕРНЫЙ КОШЕЛЁК (вариант C, за флагом SERVER_AUTHORITATIVE=1).
    // Баланс ресурсов хранится на сервере и начисляется им же. Из сейва
    // берём только не-валютное состояние, ресурсы подменяем на свои.
    if (SERVER_AUTHORITATIVE && gameCore && data && typeof data === 'object' && typeof data.stage === 'string') {
      authoritative = true;
      try {
        const wallet = ensureWallet(await readWallet(user.id), data, Date.now());

        const now = Date.now();
        const beforeUpdate = Number(wallet.updatedAt) || now;
        const earned = accrueWalletPassive(wallet, data, now);
        await writeWallet(user.id, wallet);

        if (earned.dust || earned.energy || earned.civ || earned.metals) {
          offline = {
            seconds: Math.max(0, Math.floor((now - beforeUpdate) / 1000)),
            dustEarned: earned.dust,
            energyEarned: earned.energy,
            civEarned: earned.civ,
            metalsEarned: earned.metals || 0,
          };
        }

        data = Object.assign({}, data, walletToSavePatch(wallet), { lastTick: now });
        walletView = walletToSavePatch(wallet);
      } catch (e) {
        console.warn('[load] кошелёк не посчитан:', e.message);
        authoritative = false;
      }
    }

    // ★ Платное право на щит/бустер берём из Redis, а не из сейва: клиент
    // мог их нарисовать. Щит накладываем только «вверх»; бустер — строго
    // по праву (он покупается только за металлы).
    let entitlement = null;
    try {
      const shieldUntil = Number(await redisGet(`entitlement:shield:${user.id}`)) || 0;
      if (shieldUntil > 0) {
        data = overlayShieldEntitlement(data, shieldUntil);
        entitlement = { shieldUntil };
      }

      // Бустер имеет смысл только в режиме кошелька (покупка на сервере);
      // иначе у игрока могут быть локально купленные бустеры.
      if (SERVER_AUTHORITATIVE) {
        const boosterUntil = Number(await redisGet(`entitlement:booster:${user.id}`)) || 0;
        data = overlayBoosterEntitlement(data, boosterUntil, Date.now());
        entitlement = Object.assign({}, entitlement || {}, {
          boosterUntil: boosterUntil > Date.now() ? boosterUntil : 0,
        });
      }
    } catch (e) {
      console.warn('[load] entitlement не прочитан:', e.message);
    }

    res.json({
      ok: true, data, saved_at: payload.saved_at, version: payload.version || 0,
      offline, entitlement, authoritative, wallet: walletView,
    });
  } catch (e) {
    console.error('[load]', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/reset-ack — клиент подтверждает, что стёр локальный прогресс.
// Только после этого снимается метка сброса и разрешается сейв.
app.post('/api/reset-ack', async (req, res) => {
  try {
    const { initData } = req.body || {};
    const user = validateInitData(initData);
    if (!user) return res.status(401).json({ error: 'Invalid initData' });

    const key = RESET_PREFIX + user.id;
    const wasPending = (await redisGet(key)) != null;
    if (wasPending) await redisDel(key);

    console.log(`[reset-ack] user=${user.id}: сброс подтверждён (метка была: ${wasPending ? 'да' : 'нет'})`);
    res.json({ ok: true, reset: wasPending });
  } catch (e) {
    console.error('[reset-ack]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── 3б. Клики: сервер сам начисляет доход за тап ─────────────
// Клиент присылает пачки кликов, сервер ограничивает частоту и считает
// сумму игровой формулой clickGain() из game-core.
app.post('/api/action', async (req, res) => {
  try {
    const { initData, clicks } = req.body || {};
    const user = validateInitData(initData);
    if (!user) return res.status(401).json({ error: 'Invalid initData' });
    if (await isResetPending(user.id)) return accountResetResponse(res);

    // Пока флаг выключен — клики учитываются только клиентом
    if (!SERVER_AUTHORITATIVE || !gameCore) {
      return res.json({ ok: true, authoritative: false, credited: 0 });
    }

    const n = Math.floor(Number(clicks) || 0);
    if (n <= 0 || n > 500) return res.status(400).json({ error: 'Bad clicks' });

    // Не больше MAX_CLICKS_PER_SEC в секунду на игрока
    const secKey = `click_q:${user.id}:${Math.floor(Date.now() / 1000)}`;
    const used = await bumpCounterBy(secKey, n, 5);
    const allowLimit = Number.isFinite(MAX_CLICKS_PER_SEC) && MAX_CLICKS_PER_SEC > 0 ? MAX_CLICKS_PER_SEC : 30;
    const over = Math.max(0, used - allowLimit);
    const allowed = Math.max(0, n - over);

    if (allowed === 0) {
      return res.json({ ok: true, authoritative: true, credited: 0, throttled: true });
    }

    const payload = parseRedisJson(await redisGet(`cloudsave:${user.id}`));
    if (!payload || !payload.data || typeof payload.data !== 'object') {
      return res.json({ ok: true, authoritative: true, credited: 0 });
    }

    const info = withCoreState(payload.data, function() {
      return { gain: gameCore.clickGain(), caps: gameCore.caps() };
    });
    if (!info) return res.json({ ok: true, authoritative: true, credited: 0 });

    const wallet = ensureWallet(await readWallet(user.id), payload.data, Date.now());

    const credited = creditClicks(wallet, info.gain, allowed, info.caps.dust, Date.now());
    await writeWallet(user.id, wallet);

    res.json({
      ok: true, authoritative: true, credited,
      wallet: walletToSavePatch(wallet),
    });
  } catch (e) {
    console.error('[action]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── 3в. Отчёты о «прочем» доходе ──────────────────────────
// Клиент присылает: «с прошлого отчёта я заработал сверх пассивки столько-то»
// (миссии, кометы, частицы, ежедневные). Сервер знает доход в секунду
// из game-core и разрешает максимум rate * seconds * K.
app.post('/api/reward', async (req, res) => {
  try {
    const { initData, report } = req.body || {};
    const user = validateInitData(initData);
    if (!user) return res.status(401).json({ error: 'Invalid initData' });
    if (await isResetPending(user.id)) return accountResetResponse(res);

    if (!SERVER_AUTHORITATIVE || !gameCore) {
      return res.json({ ok: true, authoritative: false, credited: null });
    }

    const now = Date.now();
    const hourKey = `reward_q:${user.id}:${Math.floor(now / 3600000)}`;
    if (await bumpCounter(hourKey, 3600) > 120) {
      return res.status(429).json({ error: 'Too frequent' });
    }

    const payload = parseRedisJson(await redisGet(`cloudsave:${user.id}`));
    if (!payload || !payload.data || typeof payload.data !== 'object') {
      return res.json({ ok: true, authoritative: true, credited: null });
    }

    const wallet = ensureWallet(await readWallet(user.id), payload.data, now);
    const since = Number(wallet.lastRewardAt) || now;

    // Верим только своему времени: клиент не может «растянуть» интервал
    const serverSeconds = Math.max(0, Math.min(REWARD_MAX_SECONDS, (now - since) / 1000));
    const clientSeconds = Number(report && report.seconds);
    const seconds = Number.isFinite(clientSeconds) && clientSeconds >= 0
      ? Math.min(serverSeconds, clientSeconds)
      : serverSeconds;

    const info = withCoreState(payload.data, function() {
      return { rates: gameCore.rates(), caps: gameCore.caps() };
    });
    if (!info) return res.json({ ok: true, authoritative: true, credited: null });

    const maxExtra = maxExtraReward(info.rates, seconds, REWARD_EXTRA_SHARE);
    // ★ Копилка разовых наград: босс/миссия/событие дают часы дохода
    // разом, а лимит считается за интервал между отчётами (~60 с).
    // Без копилки защита съедала такую награду, а следующий сейв
    // обрезал баланс — теперь крупный разовый доход проходит.
    const bank = accrueRewardBank(wallet, info.rates, info.caps, REWARD_BANK_SHARE, now);
    const budget = rewardBudget(maxExtra, bank);
    const credit = clampReward(report, budget);

    wallet.lastRewardAt = now;
    if (hasReward(credit)) {
      wallet.dust = Math.min(info.caps.dust, wallet.dust + credit.dust);
      wallet.energy = Math.min(info.caps.energy, wallet.energy + credit.energy);
      wallet.civLevel = Math.min(info.caps.civ, wallet.civLevel + credit.civ);
      wallet.dustTotal += credit.dust;
      spendRewardBank(wallet, credit, maxExtra);
    }
    await writeWallet(user.id, wallet);

    res.json({
      ok: true, authoritative: true,
      credited: hasReward(credit) ? credit : null,
      wallet: walletToSavePatch(wallet),
    });
  } catch (e) {
    console.error('[reward]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── 3г. Покупка бустера дохода (за металлы) ─────────────────
// Металлы списываются из серверного сейва, метку ставит сервер.
app.post('/api/buy-booster', async (req, res) => {
  try {
    const { initData, cost } = req.body || {};
    const user = validateInitData(initData);
    if (!user) return res.status(401).json({ error: 'Invalid initData' });
    if (await isResetPending(user.id)) return accountResetResponse(res);

    if (!SERVER_AUTHORITATIVE || !gameCore) {
      return res.json({ ok: true, authoritative: false });
    }

    const now = Date.now();
    const hourKey = `buy_q:${user.id}:${Math.floor(now / 3600000)}`;
    if (await bumpCounter(hourKey, 3600) > 60) {
      return res.status(429).json({ error: 'Too frequent' });
    }

    const payload = parseRedisJson(await redisGet(`cloudsave:${user.id}`));
    if (!payload || !payload.data || typeof payload.data !== 'object') {
      return res.status(404).json({ error: 'No cloud save' });
    }

    const cfg = gameCore.boosterConfig();
    if (!(cfg.costMetals > 0) || !(cfg.hours > 0)) {
      return res.status(503).json({ error: 'Booster is not configured' });
    }

    // ★ Одна покупка за металл в игровой день (единый серверный день).
    const dayKey = `booster_day:${user.id}:${serverDayIndex(now)}`;
    if (await redisGet(dayKey)) {
      return res.status(409).json({ error: 'Booster already bought today' });
    }
    // Цена = 2 часа добычи (клиент), но не меньше базовой и не больше ×20.
    const requested = Math.max(0, Math.floor(Number(cost) || 0));
    const pay = Math.min(cfg.costMetals * 20, Math.max(cfg.costMetals, requested));

    // ★ Металлы списываем из СЕРВЕРНОГО кошелька, а не из клиентского сейва —
    // иначе читер подделывает metalAmount и покупает бустеры бесконечно.
    const wallet = ensureWallet(await readWallet(user.id), payload.data, now);
    const metals = Number(wallet.metalAmount) || 0;
    if (metals < pay) {
      return res.status(400).json({ error: 'Not enough metals', required: pay, have: metals });
    }

    const entKey = `entitlement:booster:${user.id}`;
    const prevUntil = Number(await redisGet(entKey)) || 0;
    const incomeUntil = nextBoosterUntil(prevUntil, now, cfg.hours * 3600 * 1000);

    wallet.metalAmount = metals - pay;
    wallet.updatedAt = now;

    const data = Object.assign({}, payload.data);
    data.metalAmount = wallet.metalAmount;
    data.boosters = Object.assign({}, payload.data.boosters || {}, { incomeUntil });

    const baseVersion = Number(payload.version) || 0;
    payload.data = data;
    payload.saved_at = now;
    payload.version = baseVersion + 1;

    // ★ CAS: покупка не должна затирать сейв, который успело записать
    // другое устройство между чтением и записью (например, после Вспышки).
    const cas = await redisSetIfVersion(`cloudsave:${user.id}`, JSON.stringify(payload), baseVersion);
    if (cas.failed) {
      return res.status(503).json({ error: 'Не удалось сохранить на сервер (хранилище недоступно)' });
    }
    if (cas.conflict) {
      const latest = cas.currentRaw ? parseRedisJson(cas.currentRaw) : null;
      return res.status(409).json({
        ok: false, conflict: true,
        data: latest && latest.data, saved_at: latest && latest.saved_at, version: cas.version,
      });
    }

    // ★ Кошелёк и право на бустер фиксируем ТОЛЬКО после успешного CAS:
    // иначе при конфликте металлы списывались бы без покупки.
    await writeWallet(user.id, wallet);
    await redisSet(entKey, String(incomeUntil));
    await redisCommand('SET', dayKey, '1', 'EX', '172800');

    res.json({
      ok: true, authoritative: true,
      incomeUntil, cost: pay, hours: cfg.hours,
      version: payload.version, data,
    });
  } catch (e) {
    console.error('[buy-booster]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── 4. Webhook от Telegram ────────────────────────────────────
// Сравнение секретов постоянным временем (=== утекает по таймингам).
function secretEquals(provided, expected) {
  const a = Buffer.from(String(provided || ''), 'utf8');
  const b = Buffer.from(String(expected || ''), 'utf8');
  if (!a.length || a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch (e) { return false; }
}

app.post('/webhook', async (req, res) => {
  try {
    const secret = req.headers['x-telegram-bot-api-secret-token'];
    if (!WEBHOOK_SECRET || !secretEquals(secret, WEBHOOK_SECRET)) {
      console.warn('[webhook] отклонён: WEBHOOK_SECRET не задан или не совпал');
      return res.sendStatus(403);
    }

    const update = req.body;

    // ★ Идемпотентность: Telegram повторяет доставку при таймауте
    //   (а Render free tier на холодном старте легко превышает его).
    //   Без этого игрок получал повторные приветствия, а оплата
    //   могла обрабатываться дважды.
    if (update && update.update_id != null) {
      const updateKey = `tg_update:${update.update_id}`;
      try {
        const first = await redisCommand('SET', updateKey, '1', 'NX', 'EX', 24 * 3600);
        if (first !== 'OK') return res.sendStatus(200);
      } catch (e) { /* Redis недоступен — обрабатываем как раньше */ }
    }


    if (update.pre_checkout_query) {
      await bot.answerPreCheckoutQuery(update.pre_checkout_query.id, true);
      return res.sendStatus(200);
    }

    // ─── Текстовые команды игрока: подписка/отписка от уведомлений ───
    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const userId = update.message.from.id;
      const chatType = update.message.chat.type;
      const command = parseBotCommand(update.message.text);

      // ★ Подписка — только в личном чате с ботом. В группах и каналах
      //   chat_id не сохраняем: иначе пуши уходили бы в общий чат, то есть
      //   чужим людям, и игрок видел бы не свои уведомления.
      if (command === '/start' || command === '/stop') {
        if (chatType !== 'private' || String(chatId) !== String(userId)) {
          try {
            await bot.sendMessage(
              chatId,
              'Уведомления приходят только в личные сообщения. Откройте чат с ботом и отправьте /start там.'
            );
          } catch (e) {
            console.warn('[webhook] не удалось ответить в общий чат:', e.message);
          }
          return res.sendStatus(200);
        }

        if (command === '/start') {
          // Подписка включается сразу: следующее уведомление уйдёт уже сюда.
          await redisSet(`tg_chat:${userId}`, String(userId));
          await bot.sendMessage(
            userId,
            'Привет! Я буду присылать тебе важные уведомления из игры «Аккреция». Чтобы отключить их, напиши /stop.',
            { reply_markup: playKeyboard('private') }
          );
        } else {
          await redisSet(`tg_chat:${userId}`, '');
          await bot.sendMessage(userId, 'Уведомления отключены. Чтобы включить снова, напиши /start.');
        }
      }
      return res.sendStatus(200); // Завершаем обработку
    }

    if (update.message && update.message.successful_payment) {
      const sp = update.message.successful_payment;
      const userId = update.message.from.id;

      let payload = {};
      try { payload = JSON.parse(sp.invoice_payload || '{}'); } catch {}
      const product = payload.product;
      if (!product || !PRODUCTS[product]) return res.sendStatus(200);
      if (payload.user_id !== userId) {
        console.warn('[webhook] несоответствие user_id: payload=', payload.user_id, 'from=', userId);
        return res.sendStatus(200);
      }

      if (sp.currency !== 'XTR' || sp.total_amount !== PRODUCTS[product].stars) {
        console.warn('[webhook] Сумма/валюта не совпали', sp);
        return res.sendStatus(200);
      }

      const purchase = {
        user_id: userId, product,
        charge_id: sp.telegram_payment_charge_id,
        stars: sp.total_amount, paid_at: Date.now(), granted: false,
      };
      await redisSet(`purchase:${userId}:${product}`, JSON.stringify(purchase));
      return res.sendStatus(200);
    }

    res.sendStatus(200);
  } catch (e) {
    console.error('[webhook]', e);
    res.sendStatus(500);
  }
});

// ─── 5. Health-check ───────────────────────────────────────────
app.get('/', (req, res) => res.json({
  ok: true,
  service: 'accretion-server',
  commit: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || null,
  // ★ Диагностика доставки: без вебхука /start не доходит и
  //   tg_chat не создаётся — пуши молча теряются.
  pushCronConfigured: !!PUSH_CRON_SECRET,
  webhook: {
    configured: webhookState.configured,
    url: webhookState.url,
    pendingUpdates: webhookState.pendingUpdates,
    lastError: webhookState.lastError,
  },
}));

// ─── 6. Админ-панель ───────────────────────────────────────────
// Токен задаётся в env ADMIN_TOKEN и приходит заголовком X-Admin-Token
// (именно так его шлёт admin.html). ?token= — для curl/отладки.
// Если ADMIN_TOKEN не задан — API отвечает 503: открытая админка на проде опасна.
const ADMIN_RESOURCES = new Set(['dust', 'dustTotal', 'metalAmount', 'energy', 'civLevel']);

function adminGuard(req, res, next) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    console.error('[admin] ADMIN_TOKEN не задан в env — админ-API заблокировано');
    return res.status(503).json({ error: 'ADMIN_TOKEN не задан на сервере' });
  }
  const provided = req.get('x-admin-token') || req.query.token;
  if (provided !== expected) {
    console.warn(`[admin] 401 — неверный токен, ip=${req.ip}`);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ★ Мягкое чтение для админских карточек: сбой Redis не должен
// ронять весь ответ — показываем то, что успели прочитать.
async function adminSafeRead(label, fn, fallback) {
  try {
    return await fn();
  } catch (e) {
    console.warn(`[admin] ${label}:`, e.message);
    return fallback;
  }
}

// Права на щит/бустер: читаем тоже мягко — админка важнее сбоя Redis.
async function readAdminEntitlements(userId) {
  const [shieldRaw, boosterRaw] = await Promise.all([
    adminSafeRead('право щита', () => redisGet(`entitlement:shield:${userId}`), null),
    adminSafeRead('право бустера', () => redisGet(`entitlement:booster:${userId}`), null),
  ]);
  return {
    shieldUntil: Math.max(0, Number(shieldRaw) || 0),
    boosterUntil: Math.max(0, Number(boosterRaw) || 0),
  };
}

app.get('/admin', (req, res) => {
  console.log(`[admin] GET /admin — ip=${req.ip} ua="${req.get('user-agent') || ''}"`);
  const file = process.cwd() + '/admin.html';
  try {
    const size = fs.statSync(file).size;
    if (size === 0) {
      console.error(`[admin] admin.html найден, но ПУСТ (0 байт): ${file}`);
      return res.status(503).type('html').send(
        '<h1>admin.html пуст</h1><p>Файл найден, но содержит 0 байт. ' +
        'Заполните <code>admin.html</code> или удалите его и задеплойте заново.</p>'
      );
    }
  } catch (e) {
    console.error(`[admin] не могу прочитать admin.html: ${e.message}`);
    return res.status(404).type('html').send('<h1>admin.html не найден</h1>');
  }
  res.sendFile(file);
});

// Форма игрока — ровно те поля, которые рисует admin.html.
// В сейве игры они называются иначе: systemName / metalAmount.
function toAdminPlayer(userId, payload) {
  const d = payload && typeof payload === 'object' &&
    payload.data && typeof payload.data === 'object' ? payload.data : {};
  return {
    id: userId,
    // Ник игрока и имя системы — разные поля: панель рисует их отдельными
    // колонками, поэтому отдаём оба.
    name: d.playerName || '—',
    systemName: d.systemName || '—',
    stage: d.stage || '—',
    dust: Number(d.dust) || 0,
    metals: Number(d.metalAmount) || 0,
    systems: Number(d.systems) || 1,
    savedAt: (payload && payload.saved_at) || 0,
  };
}

// ★ Любая правка админа должна попасть в серверные «источники правды»
// (кошелёк и бюджет возможностей), иначе /api/load и /api/save обрежут
// её как читерский прирост. prevCapability — стоимость возможностей ДО
// правки; по разнице выдаём capBudget, как это делает платный сундук.
async function syncAdminWallet(userId, data, prevCapability) {
  if (!SERVER_AUTHORITATIVE) return false;
  try {
    const wallet = ensureWallet(await readWallet(userId), data, Date.now());
    applyAdminWallet(wallet, data, Date.now());

    if (gameCore && Number.isFinite(Number(prevCapability))) {
      const nextCapability = withCoreState(data, function () { return gameCore.capability(); });
      const bonus = adminCapabilityBonus(prevCapability, nextCapability);
      if (bonus > 0) wallet.capBudget = (Number(wallet.capBudget) || 0) + bonus;
    }

    await writeWallet(userId, wallet);
    return true;
  } catch (e) {
    console.warn('[admin] кошелёк не обновлён:', e.message);
    return false;
  }
}

// ★ Право на щит/бустер: без записи в entitlement админский щит
// обрежется до 9 часов, а бустер исчезнет при загрузке.
async function syncAdminEntitlement(userId, data, field) {
  const plan = adminEntitlementPlan(field, data);
  if (!plan) return false;
  const key = `entitlement:${plan.type}:${userId}`;
  try {
    if (plan.until > 0) {
      const prev = Number(await redisGet(key)) || 0;
      await redisSet(key, String(Math.max(prev, plan.until)));
    } else {
      await redisDel(key);
    }
    return true;
  } catch (e) {
    console.warn('[admin] право не обновлено:', e.message);
    return false;
  }
}

// ★ Первый сейв после правки админа не проверяем на «скачок»:
// сравнивать его с админским срезом бессмысленно. Заодно снимаем старый флаг.
async function markAdminTrust(userId) {
  try {
    await redisDel(`save_flag:${userId}`);
    await redisSet(`admin_trust:${userId}`, String(Date.now()));
    await redisCommand('EXPIRE', `admin_trust:${userId}`, 600);
  } catch (e) { /* некритично */ }
}

// Параметры вторжений берём из настоящего js/config.js (через game-core),
// с запасными значениями — чтобы админка работала и без игровых файлов.
const ADMIN_INVASION_FALLBACK = {
  shipsBase: 3, shipsMax: 5,
  robberyDuration: 45 * 60 * 1000,
  destructionDuration: 15 * 60 * 1000,
  totalDuration: 60 * 60 * 1000,
  planetMaxHP: 100,
  tiers: {
    scout: { label: 'Разведка', weight: 0.55 },
    raid: { label: 'Рейд', weight: 0.30 },
    siege: { label: 'Осада', weight: 0.15 },
  },
};
// Для вторжения на систему игра использует фиксированные 200 HP.
const ADMIN_INVASION_SYSTEM_HP = 200;

function adminInvasionConfig() {
  const cfg = gameCore && typeof gameCore.invasionConfig === 'function'
    ? gameCore.invasionConfig() : null;
  if (!cfg || !cfg.tiers || !Object.keys(cfg.tiers).length) return ADMIN_INVASION_FALLBACK;
  return cfg;
}

// Корабли — ровно как makeShips() в js/invasions.js: клиент читает
// angle/dist/speed/destroyed и рисует вторжение по этим полям.
function makeAdminInvasionShips(count) {
  const total = Math.max(1, Math.min(12, Number(count) || 1));
  const ships = [];
  for (let i = 0; i < total; i++) {
    ships.push({
      angle: (i / total) * Math.PI * 2 + Math.random() * 0.5,
      dist: 1.2 + Math.random() * 0.6,
      speed: 0.8 + Math.random() * 0.6,
      destroyed: false,
    });
  }
  return ships;
}

app.get('/admin/api/players', adminGuard, async (req, res) => {
  console.log(`[admin] GET /admin/api/players — ip=${req.ip} ua="${req.get('user-agent') || ''}"`);
  try {
    const keys = await redisScanAll('cloudsave:*', 500);
    console.log(`[admin] найдено облачных сейвов: ${keys.length}`);

    const players = [];
    for (const key of keys) {
      const userId = key.slice('cloudsave:'.length);
      const raw = await redisGet(key);
      if (raw == null) continue;
      players.push(toAdminPlayer(userId, parseRedisJson(raw)));
    }

    // Статус присутствия — рядом с ником в админке.
    // Пачками по 25: не устраиваем лавину из сотен запросов к Redis.
    for (let i = 0; i < players.length; i += 25) {
      const chunk = players.slice(i, i + 25);
      await Promise.all(chunk.map(async (p) => {
        p.presence = toAdminPresence(await readUserPresence(p.id));
      }));
    }
    // ★ Сводка оповещений: один scan по save_flag, затем чтение только
    // реально помеченных игроков (их обычно единицы, не сотни).
    const alertKeys = await redisScanAll('save_flag:*', 500);
    const alertMap = {};
    await Promise.all(alertKeys.map(async function(key) {
      const userId = key.slice('save_flag:'.length);
      const record = parseRedisJson(await redisGet(key));
      alertMap[userId] = summarizeFraudAlerts(record);
    }));
    for (const p of players) {
      p.alertSummary = alertMap[p.id] || { count: 0, lastAt: 0, flags: [] };
    }

    players.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));

    console.log(`[admin] отдаю игроков: ${players.length}`);
    res.json({ ok: true, count: players.length, players });
  } catch (e) {
    console.error('[admin] /admin/api/players', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /admin/api/alerts — все серверные оповещения о подозрительном прогрессе.
// Отдаём последние события с причиной, способом и числами-доказательствами.
app.get('/admin/api/alerts', adminGuard, async (req, res) => {
  console.log(`[admin] GET /admin/api/alerts — ip=${req.ip}`);
  try {
    const limit = Math.max(1, Math.min(200, Math.floor(Number(req.query && req.query.limit) || 100)));
    const keys = await redisScanAll('save_flag:*', 500);
    const rows = [];

    // Пачками, чтобы не устраивать лавину параллельных запросов к Redis.
    for (let i = 0; i < keys.length; i += 25) {
      const chunk = keys.slice(i, i + 25);
      const part = await Promise.all(chunk.map(async function(key) {
        const userId = key.slice('save_flag:'.length);
        const record = parseRedisJson(await redisGet(key));
        const alerts = alertsFromRecord(record);
        if (!alerts.length) return [];
        const cloudRaw = await redisGet(`cloudsave:${userId}`);
        const cloud = parseRedisJson(cloudRaw);
        const data = (cloud && cloud.data && typeof cloud.data === 'object') ? cloud.data : {};
        const snapshot = saveProgressSnapshot(data);
        return alerts.map(function(alert) {
          return Object.assign({}, alert, {
            playerId: userId,
            playerName: data.playerName || '—',
            stage: snapshot.stage || '—',
            systems: snapshot.systems,
            savedAt: (cloud && cloud.saved_at) || 0,
          });
        });
      }));
      for (const item of part) rows.push.apply(rows, item);
    }

    rows.sort(function(a, b) { return (b.at || 0) - (a.at || 0); });
    const alerts = rows.slice(0, limit);
    res.json({ ok: true, count: rows.length, alerts: alerts, flags: rows.length });
  } catch (e) {
    console.error('[admin] /admin/api/alerts', e);
    res.status(500).json({ error: e.message });
  }
});

// Подписи для типов операций из Bot API 8.x (StarTransaction.source.transaction_type).
const STAR_TX_TYPE_LABELS = {
  invoice_payment: 'Оплата счёта',
  paid_media_payment: 'Платный контент',
  gift_purchase: 'Подарок',
  premium_purchase: 'Telegram Premium',
  business_account_transfer: 'Перевод бизнес-аккаунта',
};

// Bot API не отдаёт готовое имя товара в транзакции. Свой товар узнаём по
// invoice_payload — при создании счёта туда кладётся {"user_id":…,"product":"chest|shield"}.
function starsProductName(tx) {
  const partners = [tx.source, tx.receiver].filter(function(p) {
    return p && typeof p === 'object';
  });

  // 1. Наш инвойс — самый точный источник.
  for (const p of partners) {
    if (typeof p.invoice_payload !== 'string' || !p.invoice_payload) continue;
    try {
      const parsed = JSON.parse(p.invoice_payload);
      const prod = parsed && PRODUCTS[parsed.product];
      if (prod) return prod.label;
    } catch (e) { /* payload не JSON — не наш инвойс */ }
  }

  // 2. Тип операции (подарки, платный контент, Premium и т.п.).
  for (const p of partners) {
    const label = p.transaction_type && STAR_TX_TYPE_LABELS[p.transaction_type];
    if (label) return label;
  }

  // 3. Старые транзакции без payload: узнаём товар по цене в звёздах.
  if (tx.amount > 0) {
    for (const key in PRODUCTS) {
      if (PRODUCTS[key].stars === tx.amount) return PRODUCTS[key].label;
    }
  }

  return '—';
}

// GET /admin/api/stars — баланс звёзд бота и последние транзакции.
// В node-telegram-bot-api нет обёрток для звёзд, поэтому дёргаем Bot API напрямую.
app.get('/admin/api/stars', adminGuard, async (req, res) => {
  console.log(`[admin] GET /admin/api/stars — ip=${req.ip}`);
  try {
    const api = `https://api.telegram.org/bot${BOT_TOKEN}`;

    const balRes = await fetch(`${api}/getMyStarBalance`);
    const balJson = await balRes.json();
    if (!balJson.ok) {
      throw new Error(balJson.description || 'getMyStarBalance failed');
    }

    const txRes = await fetch(`${api}/getStarTransactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 50 }),
    });
    const txJson = await txRes.json();
    if (!txJson.ok) {
      throw new Error(txJson.description || 'getStarTransactions failed');
    }

    res.json({
      ok: true,
      balance: Number(balJson.result && balJson.result.balance) || 0,
      transactions: ((txJson.result && txJson.result.transactions) || []).map(function(t) {
        return Object.assign({}, t, { productName: starsProductName(t) });
      }),
    });
  } catch (e) {
    console.error('[admin] /admin/api/stars', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /admin/api/player/:id/give  { resource, amount }
app.post('/admin/api/player/:id/give', adminGuard, async (req, res) => {
  const { id } = req.params;
  const { resource, amount } = req.body || {};
  console.log(`[admin] POST /admin/api/player/${id}/give resource=${resource} amount=${amount} — ip=${req.ip}`);

  if (!ADMIN_RESOURCES.has(resource)) {
    return res.status(400).json({ error: `Неизвестный ресурс: ${resource}` });
  }
  const delta = Number(amount);
  if (!Number.isFinite(delta) || delta === 0) {
    return res.status(400).json({ error: 'amount должен быть ненулевым числом' });
  }

  try {
    const key = `cloudsave:${id}`;
    const raw = await redisGet(key);
    const payload = parseRedisJson(raw);
    if (!payload || typeof payload !== 'object' ||
        !payload.data || typeof payload.data !== 'object') {
      return res.status(404).json({ error: 'У игрока нет облачного сейва' });
    }

    payload.data[resource] = (Number(payload.data[resource]) || 0) + delta;
    // Поднимаем saved_at и версию, иначе клиент сочтёт локальный сейв новее
    // и молча затрёт администраторскую выдачу при следующем сохранении.
    payload.saved_at = Date.now();
    payload.version = (Number(payload.version) || 0) + 1;

    // ★ В режиме кошелька выдача админа должна попасть и в кошелёк,
    // иначе следующая сверка обрежет её как необоснованный прирост.
    await syncAdminWallet(id, payload.data);
    await markAdminTrust(id);

    await redisSet(key, JSON.stringify(payload));
    console.log(`[admin] игроку ${id} выдано ${resource} +${delta} → ${payload.data[resource]}`);
    res.json({ ok: true, id, resource, amount: delta, value: payload.data[resource] });
  } catch (e) {
    console.error('[admin] /admin/api/player/give', e);
    res.status(500).json({ error: e.message });
  }
});
// GET /admin/api/player/:id — полный сейв игрока для JSON-редактора admin.html
app.get('/admin/api/player/:id', adminGuard, async (req, res) => {
  const { id } = req.params;
  console.log(`[admin] GET /admin/api/player/${id} — ip=${req.ip}`);
  try {
    const raw = await redisGet(`cloudsave:${id}`);
    const payload = parseRedisJson(raw);
    if (!payload || typeof payload !== 'object' ||
        !payload.data || typeof payload.data !== 'object') {
      return res.status(404).json({ error: 'У игрока нет облачного сейва' });
    }
    // Присутствие — внутренняя информация, показываем рядом с ником.
    const presence = toAdminPresence(await readUserPresence(id));

    // ★ Всё «мягкое» читаем параллельно и с защитой: сбой Redis
    // (кошелёк, права, покупки) не должен ломать редактор сейва.
    const [wallet, shieldRaw, boosterRaw, chestRaw, shieldPurchaseRaw, boosterPurchaseRaw, fraudRaw] = await Promise.all([
      adminSafeRead('кошелёк', () => readWallet(id), null),
      adminSafeRead('право щита', () => redisGet(`entitlement:shield:${id}`), null),
      adminSafeRead('право бустера', () => redisGet(`entitlement:booster:${id}`), null),
      adminSafeRead('покупка сундука', () => redisGet(`purchase:${id}:chest`), null),
      adminSafeRead('покупка щита', () => redisGet(`purchase:${id}:shield`), null),
      adminSafeRead('покупка бустера', () => redisGet(`purchase:${id}:booster`), null),
      adminSafeRead('оповещения', () => redisGet(`save_flag:${id}`), null),
    ]);

    const entitlements = {
      shieldUntil: Math.max(0, Number(shieldRaw) || 0),
      boosterUntil: Math.max(0, Number(boosterRaw) || 0),
    };

    // Покупки: сырой ключ purchase:<id>:<product>, подпись — из PRODUCTS.
    const purchases = [];
    const purchaseDefs = [
      { product: 'chest', raw: chestRaw },
      { product: 'shield', raw: shieldPurchaseRaw },
      { product: 'booster', raw: boosterPurchaseRaw },
    ];
    for (const def of purchaseDefs) {
      const p = parseRedisJson(def.raw);
      if (!p || typeof p !== 'object') continue;
      purchases.push({
        product: def.product,
        label: (PRODUCTS[def.product] && PRODUCTS[def.product].label) || def.product,
        stars: Math.max(0, Number(p.stars) || 0),
        paid_at: Math.max(0, Number(p.paid_at) || 0),
        granted: !!p.granted,
        reward: p.reward || null,
      });
    }

    const now = Date.now();
    res.json({
      ok: true,
      id,
      version: Number(payload.version) || 0,
      savedAt: payload.saved_at || 0,
      data: payload.data,
      presence,
      wallet,
      entitlements,
      purchases,
      alerts: alertsFromRecord(parseRedisJson(fraudRaw)),
      alertSummary: summarizeFraudAlerts(parseRedisJson(fraudRaw)),
      summary: summarizeSave(payload.data, { now }),
      now,
    });
  } catch (e) {
    console.error('[admin] /admin/api/player/:id', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /admin/api/player/:id/set  { field, value }
// Прямая запись ЛЮБОГО поля сейва (число, строка или вложенный объект).
// Роут максимально мощный, поэтому живёт только за adminGuard.
const ADMIN_FORBIDDEN_FIELDS = new Set(['__proto__', 'constructor', 'prototype']);

app.post('/admin/api/player/:id/set', adminGuard, async (req, res) => {
  const { id } = req.params;
  const { field, value } = req.body || {};
  console.log(`[admin] POST /admin/api/player/${id}/set field=${field} — ip=${req.ip}`);

  if (typeof field !== 'string' || !field.trim() || ADMIN_FORBIDDEN_FIELDS.has(field)) {
    return res.status(400).json({ error: `Недопустимое имя поля: ${field}` });
  }

  try {
    const key = `cloudsave:${id}`;
    const raw = await redisGet(key);
    const payload = parseRedisJson(raw);
    if (!payload || typeof payload !== 'object' ||
        !payload.data || typeof payload.data !== 'object') {
      return res.status(404).json({ error: 'У игрока нет облачного сейва' });
    }
    // Стоимость «возможностей» до правки: разницу покроем бюджетом,
    // иначе проверка сочтёт добавленные системы/планеты подделкой.
    const prevCapability = (SERVER_AUTHORITATIVE && gameCore)
      ? withCoreState(payload.data, function () { return gameCore.capability(); })
      : null;

    // Если меняем вложенный объект (например, primeSystem)
    if (typeof value === 'object' && value !== null) {
      payload.data[field] = value;
    } else if (typeof value === 'number') {
      payload.data[field] = Number(value);
    } else {
      payload.data[field] = value;
    }

    // Поднимаем saved_at и версию, чтобы клиенты приняли правку
    payload.saved_at = Date.now();
    payload.version = (Number(payload.version) || 0) + 1;

    // Правка ресурсов должна попасть и в серверный кошелёк, а щит/бустер —
    // в entitlement; иначе /api/load и /api/save обрежут её как читерство.
    await syncAdminWallet(id, payload.data, prevCapability);
    await syncAdminEntitlement(id, payload.data, field);
    await markAdminTrust(id);
    await redisSet(key, JSON.stringify(payload));
    console.log(`[admin] игроку ${id} установлено ${field} = ${JSON.stringify(payload.data[field])}`);
    res.json({ ok: true, field, value: payload.data[field] });
  } catch (e) {
    console.error('[admin] /admin/api/player/set', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /admin/api/player/:id/patch  { fields: { ... } }
// Атомарная правка сразу нескольких полей: одна проверка, одна запись
// кошелька/прав и один bump версии — вместо серии запросов /set.
app.post('/admin/api/player/:id/patch', adminGuard, async (req, res) => {
  const { id } = req.params;
  const fields = req.body && req.body.fields;
  const fieldCount = (fields && typeof fields === 'object' && !Array.isArray(fields))
    ? Object.keys(fields).length : 0;
  console.log(`[admin] POST /admin/api/player/${id}/patch fields=${fieldCount} — ip=${req.ip}`);

  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    return res.status(400).json({ error: 'fields должен быть объектом { имя_поля: значение }' });
  }
  const names = Object.keys(fields);
  if (names.length === 0) {
    return res.status(400).json({ error: 'Пустой объект fields — нечего менять' });
  }
  if (names.length > 100) {
    return res.status(400).json({ error: 'Слишком много полей: максимум 100 за раз' });
  }
  for (const name of names) {
    if (ADMIN_FORBIDDEN_FIELDS.has(name) || !String(name).trim()) {
      return res.status(400).json({ error: `Недопустимое имя поля: ${name}` });
    }
  }

  try {
    const key = `cloudsave:${id}`;
    const payload = parseRedisJson(await redisGet(key));
    if (!payload || typeof payload !== 'object' ||
        !payload.data || typeof payload.data !== 'object') {
      return res.status(404).json({ error: 'У игрока нет облачного сейва' });
    }

    // Стоимость «возможностей» до правки считаем ОДИН раз:
    // по разнице syncAdminWallet выдаст бюджет, как платный сундук.
    const prevCapability = (SERVER_AUTHORITATIVE && gameCore)
      ? withCoreState(payload.data, function () { return gameCore.capability(); })
      : null;

    const changed = [];
    for (const name of names) {
      payload.data[name] = fields[name];
      changed.push(name);
    }

    // Один bump версии на всю пачку, иначе клиент увидит лишние ревизии.
    payload.saved_at = Date.now();
    payload.version = (Number(payload.version) || 0) + 1;

    // Кошелёк и права синхронизируем тоже один раз на пачку.
    await syncAdminWallet(id, payload.data, prevCapability);
    if (Object.prototype.hasOwnProperty.call(fields, 'shieldUntil')) {
      await syncAdminEntitlement(id, payload.data, 'shieldUntil');
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'boosters')) {
      await syncAdminEntitlement(id, payload.data, 'boosters');
    }
    await markAdminTrust(id);
    await redisSet(key, JSON.stringify(payload));

    // Сводка и кошелёк — «мягкие» чтения: правка уже записана.
    const wallet = await adminSafeRead('кошелёк', () => readWallet(id), null);
    const entitlements = await readAdminEntitlements(id);

    console.log(`[admin] игроку ${id} изменено полей: ${changed.join(', ')}`);
    res.json({
      ok: true,
      changed,
      summary: summarizeSave(payload.data, { now: Date.now() }),
      wallet,
      entitlements,
    });
  } catch (e) {
    console.error('[admin] /admin/api/player/patch', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /admin/api/player/:id/wallet  { capBudget }
// Ручная правка «бюджета возможностей»: без него сервер сочтёт
// админские системы/планеты неоплаченными и обрежет их.
app.post('/admin/api/player/:id/wallet', adminGuard, async (req, res) => {
  const { id } = req.params;
  const requested = req.body ? req.body.capBudget : undefined;
  console.log(`[admin] POST /admin/api/player/${id}/wallet capBudget=${requested} — ip=${req.ip}`);

  if (!id || !String(id).trim()) {
    return res.status(400).json({ error: 'Не указан id игрока' });
  }
  const cap = Math.max(0, Number(requested));
  if (!Number.isFinite(cap)) {
    return res.status(400).json({ error: 'capBudget должен быть числом' });
  }

  try {
    // Сейв нужен, только чтобы создать потерянный кошелёк (ensureWallet).
    const payload = parseRedisJson(await redisGet(`cloudsave:${id}`));
    const save = (payload && payload.data && typeof payload.data === 'object') ? payload.data : null;
    const existing = await readWallet(id);
    if (!existing && !save) {
      return res.status(404).json({ error: 'У игрока нет ни кошелька, ни облачного сейва' });
    }

    const wallet = ensureWallet(existing, save || {}, Date.now());
    wallet.capBudget = cap;
    const written = await writeWallet(id, wallet);
    if (!written) {
      return res.status(500).json({ error: 'Не удалось записать кошелёк' });
    }

    console.log(`[admin] игроку ${id} установлен capBudget = ${cap}`);
    res.json({ ok: true, wallet });
  } catch (e) {
    console.error('[admin] /admin/api/player/wallet', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /admin/api/player/:id/delete
// Простое удаление: стирает облачный сейв и серверный кошелёк.
// Дальше ставится метка reset:{id}. Клиент при следующем входе увидит пустое
// облако с reset:true, сотрёт локальный прогресс, подтвердит сброс и начнёт
// новую игру. Без метки старый локальный сейв «воскресил» бы аккаунт.
app.post('/admin/api/player/:id/delete', adminGuard, async (req, res) => {
  const { id } = req.params;
  console.log(`[admin] POST /admin/api/player/${id}/delete — ip=${req.ip}`);

  if (!id || !String(id).trim()) {
    return res.status(400).json({ error: 'Не указан id игрока' });
  }

  try {
    const saveKey = `cloudsave:${id}`;
    const walletKey = `wallet:${id}`;
    const resetKey = RESET_PREFIX + id;
    // ★ Вместе с аккаунтом убираем серверные права и служебные метки:
    // иначе щит/бустер от старой игры «протекут» в новый аккаунт.
    const extraKeys = [
      `entitlement:shield:${id}`,
      `entitlement:booster:${id}`,
      `save_flag:${id}`,
      `admin_trust:${id}`,
    ];

    const [saveRaw, walletRaw, resetRaw] = await Promise.all([
      redisGet(saveKey),
      redisGet(walletKey),
      redisGet(resetKey),
    ]);
    if (saveRaw == null && walletRaw == null) {
      // Повторное удаление: игрок уже сброшен, но ещё не заходил в игру.
      if (resetRaw != null) {
        return res.json({ ok: true, id, deleted: [], alreadyReset: true });
      }
      return res.status(404).json({ error: 'У игрока нет облачного сейва' });
    }


    const results = [];
    const deleted = [];
    for (const key of [saveKey, walletKey].concat(extraKeys)) {
      const ok = await redisDel(key);
      results.push({ key, ok });
      if (ok) deleted.push(key);
    }

    // Проверяем, что сейв действительно исчез: без этого админка покажет
    // «Аккаунт удалён», а игрок останется в списке.
    const stillThere = await redisGet(saveKey);
    if (stillThere != null) {
      console.error(`[admin] игрок ${id} не удалён: ключ ${saveKey} остался`);
      return res.status(500).json({ error: 'Не удалось удалить сейв игрока', results });
    }
    // ★ Метка сброса: клиент закроет её сам (POST /api/reset-ack), когда
    // сотрёт локальный прогресс. До этого сервер не принимает сейв.
    const marker = await redisSet(resetKey, JSON.stringify({ at: Date.now(), by: 'admin' }));
    if (!marker) {
      console.error(`[admin] игрок ${id} удалён, но метка ${resetKey} не записана`);
      return res.status(500).json({ error: 'Сейв удалён, но метка сброса не записана', results });
    }
    // Старая схема (deleted:*): убираем, чтобы не мешала.
    await redisDel(LEGACY_DELETED_PREFIX + id);

    console.log(`[admin] игрок ${id} удалён: ${deleted.join(', ') || '—'}, reset=${resetKey}`);
    res.json({ ok: true, id, deleted, reset: resetKey, results });
  } catch (e) {
    console.error('[admin] /admin/api/player/delete', e);
    res.status(500).json({ error: e.message });
  }
});


// POST /admin/api/player/:id/invasion  { tier? }
// Запускает вторжение руками админа. Объект строим ровно в той структуре,
// которую читает js/invasions.js, иначе клиент его проигнорирует.
app.post('/admin/api/player/:id/invasion', adminGuard, async (req, res) => {
  const { id } = req.params;
  const { tier } = req.body || {};
  console.log(`[admin] POST /admin/api/player/${id}/invasion tier=${tier || 'auto'} — ip=${req.ip}`);

  if (!id || !String(id).trim()) {
    return res.status(400).json({ error: 'Не указан id игрока' });
  }

  try {
    const key = `cloudsave:${id}`;
    const payload = parseRedisJson(await redisGet(key));
    if (!payload || typeof payload !== 'object' ||
        !payload.data || typeof payload.data !== 'object') {
      return res.status(404).json({ error: 'У игрока нет облачного сейва' });
    }

    const data = payload.data;
    if (data.stage !== 'system' && data.stage !== 'galaxy') {
      return res.status(400).json({
        error: 'Вторжение возможно только на фазе «Система» или «Галактика» (сейчас: ' + (data.stage || '—') + ')',
      });
    }

    if (!Array.isArray(data.invasions)) data.invasions = [];
    if (data.invasions.length >= 10) {
      return res.status(409).json({ error: 'У игрока уже 10 активных вторжений' });
    }

    const cfg = adminInvasionConfig();
    const tierKeys = Object.keys(cfg.tiers);
    // Явно указанный уровень проверяем строго: опечатка админа не должна
    // молча превращаться в «Рейд». Без параметра берём средний уровень.
    let tierKey = cfg.tiers.raid ? 'raid' : (tierKeys[0] || 'scout');
    if (typeof tier === 'string' && tier) {
      if (!cfg.tiers[tier]) {
        return res.status(400).json({
          error: 'Неизвестный уровень вторжения: ' + tier + '. Доступны: ' + tierKeys.join(', '),
        });
      }
      tierKey = tier;
    }

    const now = Date.now();
    const systemsTotal = Math.max(1, Number(data.systems) || 1);
    const otherSystems = Array.isArray(data.otherSystems) ? data.otherSystems : [];
    let systemIdx = Number(data.activeSystemIdx) || 0;
    systemIdx = Math.max(0, Math.min(systemIdx, Math.max(0, otherSystems.length - 1, systemsTotal - 1)));

    const shipCount = Math.min(cfg.shipsMax, cfg.shipsBase + 2);
    const inv = {
      id: Math.random().toString(36).slice(2) + now.toString(36),
      tierKey: tierKey,
      targetType: 'system',
      systemIdx: systemIdx,
      ships: makeAdminInvasionShips(shipCount),
      spawnedAt: now,
      robberyEndsAt: now + cfg.robberyDuration,
      destructionEndsAt: now + cfg.totalDuration,
      hp: ADMIN_INVASION_SYSTEM_HP,
      maxHp: ADMIN_INVASION_SYSTEM_HP,
      stolen: 0,
      drainedEnergy: 0,
      drainedCiv: 0,
      defenseBroken: false,
      notified: true,
    };

    data.invasions.push(inv);

    // Клиент принимает правку только по новой версии сейва.
    payload.saved_at = now;
    payload.version = (Number(payload.version) || 0) + 1;
    await redisSet(key, JSON.stringify(payload));

    const label = (cfg.tiers[tierKey] && cfg.tiers[tierKey].label) || tierKey;
    console.log(`[admin] игроку ${id} запущено вторжение «${label}» (${inv.id}, systemIdx=${systemIdx}, ships=${inv.ships.length})`);
    res.json({ ok: true, id, tier: tierKey, invasion: inv });
  } catch (e) {
    console.error('[admin] /admin/api/player/invasion', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Присутствие от клиента (для админки) ─────────────────────
// POST /api/presence { initData, status, reason, idleSec }
// Клиент шлёт при смене статуса, раз в минуту пока онлайн и при уходе.
app.post('/api/presence', async (req, res) => {
  try {
    const { initData, status, reason, idleSec } = req.body || {};
    const user = validateInitData(initData);
    if (!user) return res.status(401).json({ error: 'Invalid initData' });

    // Дешёвая защита от спама: не больше 30 отчётов в минуту на игрока.
    const minuteKey = `presence_q:${user.id}:${Math.floor(Date.now() / 60000)}`;
    if (await bumpCounter(minuteKey, 120) > 30) {
      return res.json({ ok: true, throttled: true });
    }

    const online = status === 'online';
    const payload = {
      status: online ? 'online' : 'offline',
      reason: typeof reason === 'string' && reason ? reason.slice(0, 32) : (online ? 'active' : 'unknown'),
      idleSec: Math.max(0, Math.round(Number(idleSec) || 0)),
      // ★ Момент смены статуса: с него считаем реальное отсутствие.
      //   Клампим клиентские часы: «из будущего» или из прошлого века
      //   значение иначе ломает окно отсутствия (и глушит все пуши).
      changedAt: (function (v) {
        const ts = Number(v) || 0;
        if (!ts) return 0;
        const nowMs = Date.now();
        return Math.min(nowMs, Math.max(nowMs - 30 * 24 * 3600 * 1000, ts));
      })(req.body && req.body.changedAt),
      at: Date.now(),
    };


    // ★ Окно отсутствия храним отдельно от presence: если сервер проспит
    //   всю отлучку, после возвращения lastActive уже другой — без якоря
    //   волны этой отлучки терялись бы навсегда.
    if (!online) {
      try {
        const from = payload.changedAt || Date.now();
        const absenceKey = `absence:${user.id}`;
        const prevAbsence = parseRedisJson(await redisGet(absenceKey));
        const sameWindow = prevAbsence && Number(prevAbsence.from) === from;
        await redisSet(absenceKey, JSON.stringify({
          from: sameWindow ? Number(prevAbsence.from) : from,
          at: Date.now(),
        }));
        await redisCommand('EXPIRE', absenceKey, 7 * 24 * 3600);
      } catch (e) { /* некритично */ }
    }

    const key = `presence:${user.id}`;
    await redisSet(key, JSON.stringify(payload));
    try {
      // ★ Держим последний отчёт сутки для любого статуса: «онлайн» отсекается
      //   по возрасту в toAdminPresence(), а не по TTL ключа.
      await redisCommand('EXPIRE', key, PRESENCE_STATUS_TTL_SEC);
    } catch (e) { /* некритично */ }

    // ★ seen:* двигаем только онлайн-отчётом. Иначе свёрнутый мини-апп
    //   автосейвом/офлайн-пингом держал seen свежим, и cron считал
    //   отсутствующего игрока активным (волны не пушились).
    if (online) await touchPresence(user.id);

    res.json({ ok: true, status: payload.status });
  } catch (e) {
    console.error('[presence]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Push-уведомления от клиента ────────────────────────────────
app.post('/api/notify', async (req, res) => {
  try {
    const { initData, type, message, messages } = req.body || {};
    const user = validateInitData(initData);
    if (!user) return res.status(401).json({ error: 'Invalid initData' });

    // Поддерживаем и одиночное сообщение, и пачку (клиент склеивает всплески).
    const batch = [];
    if (Array.isArray(messages)) {
      for (const item of messages.slice(0, 10)) {
        if (typeof item === 'string' && item.trim()) batch.push({ type: 'info', message: item });
        else if (item && typeof item.message === 'string' && item.message.trim()) {
          batch.push({ type: item.type || 'info', message: item.message });
        }
      }
    }
    if (typeof message === 'string' && message.trim()) {
      batch.push({ type: type || 'info', message: message });
    }
    if (!batch.length) return res.status(400).json({ error: 'Empty message' });

    // ★ Без подписки (/start у бота) пуши уйти не могут — пусть клиент
    //   узнает и покажет подсказку, а не будет их терять молча.
    const chatId = await redisGet(`tg_chat:${user.id}`);
    if (!chatId || chatId === 'null' || String(chatId) !== String(user.id)) {
      return res.json({ ok: true, sent: 0, subscribed: false });
    }

    // Защита от спама через API: не более 60 пушей в час на игрока.
    const hourKey = `notify_hour:${user.id}:${Math.floor(Date.now() / 3600000)}`;
    if (await bumpCounter(hourKey, 3700) > 60) {
      console.warn(`[notify] ${user.id}: превышен часовой лимит, сообщение не отправлено`);
      return res.json({ ok: true, throttled: true, subscribed: true });
    }

    let sent = 0;
    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      const rawType = (typeof item.type === 'string') ? item.type : 'info';
      const notifyType = /^[a-z0-9_]{1,32}$/.test(rawType) ? rawType : 'info';
      const text = trimNotifyText(item.message, 1000);

      // Дедупликация одинаковых сообщений (одно и то же событие не дважды).
      // ★ Штампуем ключ ТОЛЬКО после успешной отправки.
      let hash = 5381;
      for (let c = 0; c < text.length; c++) hash = ((hash * 33) ^ text.charCodeAt(c)) >>> 0;
      const seenKey = `notify_seen:${user.id}:${notifyType}:${hash.toString(36)}`;
      if (await redisGet(seenKey)) continue;

      const delivered = await sendNotification(user.id, text);
      if (!delivered) continue; // не дошло — не считаем отправленным
      sent++;
      await redisSet(seenKey, String(Date.now()));
      try { await redisCommand('EXPIRE', seenKey, 90); } catch (e) { /* некритично */ }

      // Telegram держит ~1 сообщение/сек в чат — не разгоняемся в пачке.
      if (i < batch.length - 1) await new Promise((r) => setTimeout(r, 350));
    }
    res.json({ ok: true, sent: sent, subscribed: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Предупреждение о запустении галактики ─────────────────────
// Запустение (INVASION_CFG.neglect) включается после thresholdHours
// отсутствия без учёта щита. Предупреждаем за NEGLECT_WARN_AHEAD_HOURS
// до этого и только один раз за одну отлучку: в ключе хранится saved_at,
// к которому относилось предупреждение. Вернулся и сохранился — saved_at
// сменился, следующая отлучка снова получит предупреждение.
const NEGLECT_WARN_AHEAD_HOURS = 2;

async function warnNeglectSoon(userId, payload, preview, lastActive) {
  try {
    if (!gameCore || typeof gameCore.neglectStatus !== 'function') return;
    const status = gameCore.neglectStatus(preview.awayHours);
    if (!status) return;
    if (status.level > 0) return;                            // запустение уже началось
    if (!(status.hoursToNeglect > 0)) return;
    if (status.hoursToNeglect > NEGLECT_WARN_AHEAD_HOURS) return; // ещё рано

    // Одно предупреждение на одну отлучку. Якорь — lastActive (как у tg_wave),
    // а не saved_at: вход без сейва не должен «съедать» следующее отсутствие.
    const anchor = String(Math.max(Number(lastActive) || 0, Number(payload.saved_at) || 0));
    const key = `neglect_warn:${userId}`;
    const warnedFor = await redisGet(key);
    if (warnedFor === anchor) return;

    const awayLabel = Math.round((Number(preview.awayHours) || 0) * 10) / 10;
    const leftLabel = Math.max(0.1, Math.round(status.hoursToNeglect * 10) / 10);
    const delivered = await sendNotification(userId,
      '⏳ <b>Галактика скоро начнёт приходить в запустение</b>\n' +
      'Вы отсутствуете ~' + awayLabel + ' ч. Примерно через ' + leftLabel + ' ч закончится льготный период: ' +
      'атаки станут жёстче, а планеты начнут уходить в простой.\n' +
      (preview.shieldProtected ? '🛡 Щит уже покрыл часть отсутствия — это учтено в расчёте.\n' : '') +
      'Зайдите в игру, чтобы обнулить таймер заброшенности.'
    );
    if (!delivered) return; // не дошло — повторим в следующий проход
    await redisSet(key, anchor);
    try { await redisCommand('EXPIRE', key, 45 * 24 * 3600); } catch (e) { /* некритично */ }
  } catch (e) {
    console.error('[cron] предупреждение о запустении:', e.message);
  }
}

// ─── Офлайн-волна: потери и журнал ─────────────────────────────
// ★ Уведомление и журнал должны говорить об одном и том же, поэтому
//   и подпись цели (lib/attack-notices.js), и события строятся из
//   результата gameCore.applyOfflineInvasions() — настоящей игровой логики.


function offlineWaveLossParts(wave) {
  const parts = [];
  if ((Number(wave.dust) || 0) > 0) parts.push('✦ ' + formatNumber(wave.dust));
  if ((Number(wave.energy) || 0) > 0) parts.push('⚡ ' + formatNumber(wave.energy));
  if ((Number(wave.civ) || 0) > 0) parts.push('🧬 ' + (Math.round(Number(wave.civ) * 100) / 100));
  if ((Number(wave.metals) || 0) > 0) parts.push('⚙ ' + formatNumber(wave.metals));
  if ((Number(wave.disabled) || 0) > 0) parts.push('🪐 ' + Number(wave.disabled));
  if ((Number(wave.fleetLost) || 0) > 0) parts.push('🚀 −' + Number(wave.fleetLost));
  return parts;
}

/** Дописывает в сейв те же события журнала, что клиент пишет при возврате. */
function appendOfflineWaveEvents(data, out, now) {
  if (!data || !out) return;
  const waves = Array.isArray(out.invasionWaves) ? out.invasionWaves : [];
  if (!Array.isArray(data.eventLog)) data.eventLog = [];
  const at = Number(now) || Date.now();

  function pushEvent(type, text, meta, icon, color) {
    data.eventLog.unshift({ ts: at, type: type, text: text, icon: icon, color: color, meta: meta || null });
    if (data.eventLog.length > 100) data.eventLog.length = 100;
    data.eventLogUnread = Math.max(0, Number(data.eventLogUnread) || 0) + 1;
  }

  for (let i = 0; i < waves.length; i++) {
    const wave = waves[i] || {};
    const meta = {
      source: 'offline',
      tierKey: wave.tierKey,
      difficulty: Number(wave.difficulty) || 1,
      outcome: wave.outcome,
    };
    if (Number(wave.systemIdx) >= 0) meta.systemIdx = Number(wave.systemIdx);
    if ((Number(wave.dust) || 0) > 0) meta.lostDust = Math.floor(wave.dust);
    if ((Number(wave.energy) || 0) > 0) meta.lostEnergy = Math.floor(wave.energy);
    if ((Number(wave.civ) || 0) > 0) meta.lostCiv = Math.floor(Number(wave.civ) * 100) / 100;
    if ((Number(wave.metals) || 0) > 0) meta.lostMetals = Math.floor(wave.metals);
    if ((Number(wave.disabled) || 0) > 0) meta.planetsDisabled = Number(wave.disabled);
    if ((Number(wave.fleetLost) || 0) > 0) meta.fleetLost = Number(wave.fleetLost);

    const label = wave.tierLabel || wave.tierKey || '';
    let text;
    if (wave.outcome === 'repelled') {
      text = 'вторжение «' + label + '» отбито до высадки · потерь нет';
    } else {
      const parts = offlineWaveLossParts(wave);
      text = 'вторжение «' + label + '» прорвалось · ' +
        (parts.length ? 'украдено: ' + parts.join(', ') : 'потерь ресурсов нет');
    }
    // Как в addEvent(): место атаки — префиксом к тексту.
    if (meta.systemIdx !== undefined) {
      text = 'В системе «' + offlineSystemName(data, meta.systemIdx) + '»: ' + text;
    }
    pushEvent('invasion_end', text, meta, '🏁', '#ff9944');
  }

  const disabled = Math.max(0, Number(out.invasionLost) || 0);
  if (disabled > 0) {
    pushEvent('invasion_destroy', 'Вторжения повредили ' + disabled + ' планет(ы)',
      { count: disabled, source: 'offline' }, '💀', '#ff2a2a');
  }
  const level = Math.max(0, Number(out.neglectLevel) || 0);
  const executed = Math.max(0, Number(out.invasionAttacks) || 0);
  if (level > 0 && executed > 0) {
    pushEvent('galaxy_neglect',
      'Галактика в запустении ур.' + level + ': ' + executed + ' атак, повреждено систем: ' +
      (Number(out.invasionSystemsDamaged) || 0) + ', планет: ' + disabled,
      {
        neglectLevel: level, awayHours: out.awayHours, attacks: executed,
        defended: Number(out.invasionDefended) || 0, lostDust: Math.floor(out.invasionLostDust || 0),
        lostEnergy: Math.floor(out.invasionDrainE || 0), lostCiv: Math.floor(out.invasionDrainC || 0),
        lostMetals: Math.floor(out.invasionLostMetals || 0),
        systemsDamaged: Number(out.invasionSystemsDamaged) || 0, planetsDisabled: disabled,
        shieldProtected: !!out.shieldProtected,
      }, '☠️', '#ff2a2a');
  }
}
// ─── Живой мир: журнал и текст пушей ──────────────────────────
// ★ Событие живёт по реальному времени и пишется в журнал сейва
//   в момент срабатывания, а не в момент входа игрока.
function appendWorldEventLog(data, cfg, kind, now) {
  if (!data || !cfg) return;
  if (!Array.isArray(data.eventLog)) data.eventLog = [];
  const at = Number(now) || Date.now();
  const icon = cfg.icon || (kind === 'weekly' ? '📅' : '🎲');
  const type = kind === 'weekly' ? 'weekly_event' : 'random_event';
  const text = icon + ' ' + String(cfg.title || 'Событие') +
    (cfg.desc ? ' — ' + String(cfg.desc) : '');
  data.eventLog.unshift({
    ts: at, type: type, text: text, icon: icon,
    color: cfg.color || '#b9a8ff',
    meta: { eventId: cfg.id || null, source: 'world', tier: kind },
  });
  if (data.eventLog.length > 100) data.eventLog.length = 100;
  data.eventLogUnread = Math.max(0, Number(data.eventLogUnread) || 0) + 1;
}

function appendWorldTickEvents(data, tick, now) {
  const world = (tick && tick.world) ? tick.world : {};
  appendWorldEventLog(data, world.daily, 'daily', now);
  appendWorldEventLog(data, world.weekly, 'weekly', now);
}

function worldEventNotice(cfg, kind) {
  if (!cfg) return '';
  const icon = cfg.icon ? cfg.icon + ' ' : (kind === 'weekly' ? '📅 ' : '🎲 ');
  const head = kind === 'weekly' ? '📅 <b>Событие недели!</b>' : '🎲 <b>Событие дня!</b>';
  const desc = String(cfg.desc || '').trim();
  let tail = '';
  const hours = Number(cfg.durationHours) || 0;
  if (hours > 0) tail = ' · ' + hours + ' ч';
  return head + '\n' + icon + '<b>' + String(cfg.title || 'Событие') + '</b>' +
    (desc ? ' — ' + desc : '') + tail;
}

function interactiveEventNotice(cfg) {
  if (!cfg) return '';
  const icon = cfg.icon ? cfg.icon + ' ' : '⚡ ';
  return '⚡ <b>Новое событие в игре!</b>\n' + icon + '<b>' + String(cfg.title || 'Событие') +
    '</b>' + (cfg.desc ? ' — ' + String(cfg.desc) : '') +
    '\nОно уже идёт — зайдите, пока таймер не вышел.';
}
// ─── Сканер серверных оповещений ─────────────────────────────────
// ★ Игрок закрыл игру — клиентский rAF-цикл не тикает, поэтому
//   переполнение хранилища, конец щита/автобороны и волны вторжений
//   раньше генерировались только после входа в игру. Теперь сервер
//   сам считает их по сейву и пишет в Telegram.
//
// Проход запускают три источника:
//   1) внутренний cron */10 (пока инстанс жив);
//   2) внешний Cloudflare Worker каждые 5 минут — на Render free tier
//      инстанс засыпает, и без внешнего пинга cron не работает;
//   3) один раз при старте (после пробуждения запросом).
//
// ★ Распределённая блокировка: проходы из cron и Worker не должны
//   накладываться и дублировать пуши.

const PUSH_SCAN_LOCK_KEY = 'push_scan:lock';
const PUSH_SCAN_LOCK_TTL_SEC = 600; // ★ проход может длиться >4 мин
const PUSH_STATE_PREFIX = 'push_state:';
const PUSH_STATE_TTL_SEC = 60 * 24 * 3600;
let _pushScanBusy = false;

async function acquirePushScanLock() {
  try {
    const r = await redisCommand('SET', PUSH_SCAN_LOCK_KEY, String(Date.now()), 'NX', 'EX', PUSH_SCAN_LOCK_TTL_SEC);
    return r === 'OK';
  } catch (e) {
    // Без Redis не блокируем доставку: лучше редкий дубль, чем тишина.
    console.warn('[push-scan] Redis-блокировка недоступна:', e.message);
    return true;
  }
}

async function releasePushScanLock() {
  try { await redisCommand('DEL', PUSH_SCAN_LOCK_KEY); } catch (e) { /* ignore */ }
  try { await redisCommand('DEL', PUSH_SCAN_LOCK_KEY); } catch (e) { /* ignore */ }
}

// ★ Продление блокировки: длинный проход не должен «истечь» и запустить
//   второй параллельный проход из 5-минутного Worker-cron.
async function renewPushScanLock() {
  try { await redisCommand('EXPIRE', PUSH_SCAN_LOCK_KEY, PUSH_SCAN_LOCK_TTL_SEC); }
  catch (e) { /* некритично */ }
}

async function readPushState(userId) {
  try {
    const raw = await redisGet(PUSH_STATE_PREFIX + userId);
    const parsed = parseRedisJson(raw);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (e) {
    return {};
  }
}

async function writePushState(userId, state) {
  try {
    await redisSet(PUSH_STATE_PREFIX + userId, JSON.stringify(state || {}));
    await redisCommand('EXPIRE', PUSH_STATE_PREFIX + userId, PUSH_STATE_TTL_SEC);
  } catch (e) { /* некритично */ }
}

// Лимиты хранилищ по тем же формулам, что и клиент.
function computeStorageCaps(data) {
  if (!gameCore) return null;
  return withCoreState(data, () => ({
    dust: gameCore.resourceCap('dust'),
    energy: gameCore.resourceCap('energy'),
    civ: gameCore.resourceCap('civ'),
    metals: gameCore.resourceCap('metals'),
  }));
}

/**
 * Один проход по сейвам. Возвращает статистику (для /internal/push-scan).
 * Никогда не бросает наружу: сбой одного игрока не рвёт весь проход.
 */
async function runPushScan(source) {
  const startedAt = Date.now();
  if (!gameCore) return { ok: false, skipped: 'no-game-core' };
  if (_pushScanBusy) return { ok: false, skipped: 'busy' };
  _pushScanBusy = true;
  const locked = await acquirePushScanLock();
  if (!locked) {
    _pushScanBusy = false;
    return { ok: false, skipped: 'locked' };
  }

  const stats = {
    ok: true, source: source || 'cron',
    scanned: 0, delivered: 0, failed: 0, skippedOnline: 0, errors: 0,
    worldTicked: 0, worldEvents: 0,
  };

  try {
    const keys = await redisScanAll('cloudsave:*', 5000);
    if (keys.length >= 5000) {
      console.warn('[push-scan] лимит 5000 ключей: часть игроков не проверена');
    }
    const now = Date.now();

    for (const key of keys) {
      const userId = key.split(':')[1];
      if (!userId) continue;

      try {
        const payload = parseRedisJson(await redisGet(key));
        if (!payload || !payload.data || !payload.saved_at) continue;
        const readVersion = Number(payload.version) || 0;
        let data = payload.data;
        if (!(data.stage === 'system' || data.stage === 'galaxy')) continue;
        const psettings = data.settings;
        // ★ Пуши выключены — не шлём, но офлайн-вторжения всё равно
        //   применяем к сейву: это геймплей, а не уведомления.
        const pushEnabled = !(psettings && psettings.pushEnabled === false);
        stats.scanned++;
        if (stats.scanned % 50 === 0) await renewPushScanLock();

        // ★ «Когда игрок реально ушёл» — presence, а НЕ lastSeen: открытая
        //   в фоне вкладка продолжает автосейв и /api/load, lastSeen свежий.
        const presence = await readUserPresence(userId);
        const presAt = presence ? Number(presence.at) || 0 : 0;
        const presChanged = presence ? Number(presence.changedAt) || presAt : 0;
        const presFresh = presAt > 0 && now - presAt < PRESENCE_ONLINE_STALE_SEC * 1000;
        // ★ Видимая, но «простаивающая» вкладка — игрок всё ещё в игре:
        //   клиент продолжает тикать и автосохраняться. Не трогаем его сейв.
        const idleButPlaying = !!(presence && presence.status === 'offline' &&
          String(presence.reason || '') === 'idle' && presFresh);
        const onlineNow = !!(presence && presFresh &&
          (presence.status === 'online' || idleButPlaying));

        // ★ Якорь последней отлучки пишет /api/presence. Он не даёт
        //   «съехать» окну отсутствия после возвращения игрока.
        const absence = parseRedisJson(await redisGet(`absence:${userId}`));
        const absenceFrom = absence ? Number(absence.from) || 0 : 0;

        let lastActive;
        if (presence && presAt > 0) {
          lastActive = presence.status === 'offline'
            ? (absenceFrom || presChanged || presAt)
            : (absenceFrom || presAt);
        } else {
          const lastSeen = await lastSeenAt(userId);
          lastActive = Math.max(Number(payload.saved_at) || 0, lastSeen, absenceFrom);
        }
        const elapsedSec = Math.max(0, (now - lastActive) / 1000);

        // ─── ЖИВОЙ МИР ──────────────────────────────────────────
        // ★ Игрок в игре — клиент ведёт состояние сам (иначе серверный тик
        //   перебивал бы живой прогресс и плодил 409-конфликты). Тихо
        //   фиксируем состояние уведомлений, чтобы не было запоздалых дублей.
        if (onlineNow) {
          const capsOnline = computeStorageCaps(data);
          if (capsOnline) {
            const onlineNotices = collectNotices(data, capsOnline, now, await readPushState(userId));
            if (onlineNotices.changed) await writePushState(userId, onlineNotices.next);
          }
          stats.skippedOnline++;
          continue;
        }

        // ★ Игрок не в сети — галактика продолжает жить на сервере.
        //   Один тик: доход, миссии, накопленные волны вторжений и
        //   дневные/недельные события. Результат сразу в Redis, поэтому
        //   возвращение в игру больше не запускает «симуляцию офлайна»:
        //   к приходу игрока галактика уже жила всё это время.
        let tick = null;
        if (typeof gameCore.worldTick === 'function') {
          try {
            tick = gameCore.worldTick(data, {
              now,
              fromMs: Number(data.worldTickAt) || Number(payload.saved_at) || 0,
            });
          } catch (e) {
            console.warn('[push-scan] worldTick ' + userId + ':', e.message);
            tick = null;
          }
        }
        if (tick && tick.data) {
          data = tick.data;
          appendOfflineWaveEvents(data, tick.out, now);
          appendWorldTickEvents(data, tick, now);
          // ★ Без этой строки в Redis уходили бы saved_at/version,
          //   но НЕ прожитое время: каждый проход тикал бы заново от
          //   старого worldTickAt и пуши о событиях повторялись бы.
          payload.data = data;
          payload.saved_at = now;
          payload.version = readVersion + 1;
          const scanCas = await redisSetIfVersion(key, JSON.stringify(payload), readVersion);
          if (!scanCas.ok) {
            // ★ Игрок сохранился, пока мы ждали Redis/присутствие — его
            //   сейв новее: не перезаписываем и не шлём пуши об этом тике.
            stats.conflicts = (stats.conflicts || 0) + 1;
            continue;
          }
          stats.worldTicked++;
        }

        // 1. События, случившиеся в этом тике — пуш в момент события.
        if (pushEnabled && tick && tick.world) {
          const fired = [];
          if (tick.world.daily) fired.push({ cfg: tick.world.daily, kind: 'daily' });
          if (tick.world.weekly) fired.push({ cfg: tick.world.weekly, kind: 'weekly' });
          for (let fi = 0; fi < fired.length; fi++) {
            const cfg = fired[fi].cfg;
            const interactive = cfg.kind === 'boss' || cfg.kind === 'tap' || cfg.kind === 'choice';
            const text = interactive ? interactiveEventNotice(cfg) : worldEventNotice(cfg, fired[fi].kind);
            const ok = await sendNotification(userId, text);
            if (ok) stats.delivered++; else stats.failed++;
            stats.worldEvents++;
            if (fi < fired.length - 1) await new Promise((r) => setTimeout(r, 400));
          }
        }

        // 2. Хранилище / щит / автоборона — уже по свежему сейву.
        let noticeState = await readPushState(userId);
        const caps = computeStorageCaps(data);
        if (caps) {
          const collected = collectNotices(data, caps, now, noticeState);
          noticeState = collected.next;
          if (pushEnabled && collected.notices.length) {
            const text = buildDigest(collected.notices);
            const ok = await sendNotification(userId, text);
            if (ok) { stats.delivered++; await writePushState(userId, noticeState); }
            else { stats.failed++; }
          } else if (collected.changed) {
            await writePushState(userId, noticeState);
          }
        }

        // 3. «Давно не виделись» — один раз за отлучку, по серверному времени.
        const sleep = sleepNotice(data, lastActive, now, noticeState);
        if (sleep && pushEnabled) {
          const ok = await sendNotification(userId, sleep.line);
          if (ok) {
            stats.delivered++;
            noticeState.sleep = sleep.anchor;
            await writePushState(userId, noticeState);
          } else {
            stats.failed++;
          }
        }

        // 4. Вторжения из этого тика — обычное уведомление, как при живом спавне.
        if (pushEnabled) {
          const invasionCfg = gameCore.invasionConfig() || {};
          const waves = (tick && tick.out && Array.isArray(tick.out.invasionWaves)) ? tick.out.invasionWaves : [];
          for (let wi = 0; wi < waves.length; wi++) {
            const wave = waves[wi] || {};
            const tier = (invasionCfg.tiers && invasionCfg.tiers[wave.tierKey]) || {};
            const rolled = gameCore.rollInvasionShips(wave.tierKey);
            const text = buildInvasionNotice({
              difficulty: Number(wave.difficulty) || Number(tier.difficulty) || 1,
              tierLabel: wave.tierLabel || tier.label || '',
              targetLabel: offlineWaveTargetLabel(data, wave.systemIdx),
              ships: (rolled && Array.isArray(rolled.ships)) ? rolled.ships : [],
              robberyMin: Math.round((Number(invasionCfg.robberyDuration) || 45 * 60 * 1000) / 60000),
              destructionMin: Math.round((Number(invasionCfg.destructionDuration) || 15 * 60 * 1000) / 60000),
            });
            const ok = await sendNotification(userId, text);
            if (ok) stats.delivered++; else stats.failed++;
            if (wi < waves.length - 1) await new Promise((r) => setTimeout(r, 400));
          }
          if (tick && tick.out && Number(tick.out.awayHours) > 0) {
            await warnNeglectSoon(userId, payload, {
              awayHours: Number(tick.out.awayHours) || 0,
              shieldProtected: !!tick.out.shieldProtected,
            }, lastActive);
          }
        }
      } catch (e) {
        stats.errors++;
        console.error('[push-scan] игрок ' + userId + ':', e.message);
      }
    }

    stats.ms = Date.now() - startedAt;
    console.log('[push-scan] ' + stats.source + ': проверено ' + stats.scanned +
      ', доставлено ' + stats.delivered +
      ', ошибок ' + (stats.failed + stats.errors) +
      ', в игре ' + stats.skippedOnline +
      ', мир тикнут ' + stats.worldTicked + ' (' + stats.worldEvents + ' событий)' +
      ', ' + stats.ms + ' мс');
    return stats;
  } catch (e) {
    console.error('[push-scan] проход:', e.message);
    return { ok: false, error: e.message };
  } finally {
    _pushScanBusy = false;
    await releasePushScanLock();
  }
}

// Внутренний cron (работает, пока инстанс не уснул).
cron.schedule('*/10 * * * *', () => { runPushScan('cron').catch(function () { /* ignore */ }); });

// ─── Внешний триггер прохода (Cloudflare Worker Cron) ────────────
// ★ Это главный фикс «оповещения только после входа в игру»:
//   на Render free tier инстанс засыпает и node-cron не тикает.
//   Worker присылает запрос каждые 5 минут — он будит инстанс и
//   запускает проход. Секрет обязателен (fail-closed).
function pushSecretMatches(provided) {
  if (!PUSH_CRON_SECRET) return false;
  const a = Buffer.from(String(provided || ''), 'utf8');
  const b = Buffer.from(String(PUSH_CRON_SECRET), 'utf8');
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch (e) { return false; }
}

app.post('/internal/push-scan', (req, res) => {
  if (!PUSH_CRON_SECRET) {
    return res.status(503).json({ ok: false, error: 'push_cron_disabled' });
  }
  if (!pushSecretMatches(req.headers['x-push-secret'])) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }
  // Отвечаем сразу: холодный старт Render не должен держать Worker
  // в ожидании, а проход продолжается в фоне.
  res.status(202).json({ ok: true, started: true });
  runPushScan('worker').catch((e) => console.error('[push-scan] worker:', e.message));
});

// ─── Стартовый проход ──────────────────────────────────────────
// ★ Render free tier засыпает, и первый запрос будит инстанс. Догоняем
//   уведомления, накопившиеся за время сна, сразу после старта.
setTimeout(() => { runPushScan('startup').catch(function () { /* ignore */ }); }, 15 * 1000);

const server = app.listen(PORT, () => {
  console.log(`[OK] Сервер успешно запущен на порту ${PORT}`);
});

server.on('error', (err) => {
  console.error("[ERROR] Ошибка сервера:", err);
});

// ★ Не даём одной асинхронной ошибке уронить процесс (иначе клиенты получают 502).
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason && reason.stack ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err && err.stack ? err.stack : err);
});