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
  reconcileWallet,
  rewardAllowance,
} from './lib/wallet.js';
import { rollChestReward } from './lib/chest.js';
import { clampReward, hasReward, maxExtraReward } from './lib/reward.js';
import { capabilityAudit, remainingCapabilityBudget, chestCapabilityValue } from './lib/capability.js';
import { applyAdminWallet, adminCapabilityBonus, adminEntitlementPlan } from './lib/admin-trust.js';
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

// ─── Push-уведомления в Telegram ────────────────────────────────
// Подписка живёт в tg_chat:<userId> и хранит РОВНО userId: уведомления
// уходят только в личный чат самого игрока. Пустое значение (или
// отсутствие ключа) — игрок отписался /stop либо заблокировал бота.
async function sendNotification(userId, text) {
  try {
    const chatId = await redisGet(`tg_chat:${userId}`);
    if (!chatId || chatId === 'null') return;
    // ★ Страховка от «чужих» уведомлений: старый групповой chat_id или
    //   любое значение, не равное userId, не шлём — подписку сбрасываем.
    if (String(chatId) !== String(userId)) {
      console.warn(`[notify] ${userId}: сохранён чужой chatId ${chatId} — подписка сброшена`);
      await redisSet(`tg_chat:${userId}`, '');
      return;
    }
    await bot.sendMessage(String(userId), text, { parse_mode: 'HTML' });
  } catch (e) {
    console.warn(`[notify] Не удалось отправить ${userId}:`, e.message);
    if (e.response && e.response.statusCode === 403) {
      await redisSet(`tg_chat:${userId}`, ''); // Игрок заблокировал бота
    }
  }
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
  const keys = [];
  let cursor = '0';
  do {
    const [next, batch] = await redisCommand('SCAN', cursor, 'MATCH', match, 'COUNT', '200');
    cursor = String(next);
    if (Array.isArray(batch)) {
      for (const k of batch) if (!keys.includes(k)) keys.push(k);
    }
  } while (cursor !== '0' && keys.length < maxKeys);
  return keys.slice(0, maxKeys);
}

// ─── Валидация initData ─────────────────────────────────────────
// Реализация — lib/save-validation.js: HMAC-подпись, сравнение постоянным
// временем (=== утекает по таймингам), проверка свежести auth_date и user.id.
function validateInitData(initData) {
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

// Проверка «оплаченных возможностей» (планеты/системы).
// По умолчанию только флаг; при CAPABILITY_ENFORCE=1 сейв отклоняется.
const CAPABILITY_ENFORCE = process.env.CAPABILITY_ENFORCE === '1';
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
    // Чужому сайту не отдаём заголовки — браузер не покажет ему ответ
    console.warn(`[cors] чужой origin=${origin} path=${req.path}`);
    if (req.method === 'OPTIONS') return res.sendStatus(403);
  }
  // Запросы без Origin (нативные WebView Telegram) не блокируем

  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─── 1. Создание инвойса ────────────────────────────────────────
app.post('/api/create-invoice', async (req, res) => {
  try {
    const { initData, product } = req.body || {};
    const user = validateInitData(initData);
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
    const user = validateInitData(initData);
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
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/save', async (req, res) => {
  try {
    const { initData, saveData, baseVersion } = req.body || {};
    const user = validateInitData(initData);
    if (!user) return res.status(401).json({ error: 'Invalid initData' });
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
    if (await bumpCounter(hourKey, 3600) > 300) {
      console.warn(`[save] user=${user.id} превысил квоту сохранений`);
      return res.status(429).json({ error: 'Too many saves per hour' });
    }
    const rlKey = `save_rl:${user.id}`;
    const last = await redisGet(rlKey);
    if (last && Date.now() - Number(last) < SAVE_RATE_LIMIT_MS) return res.status(429).json({ error: 'Too frequent' });
    await redisSet(rlKey, String(Date.now()));

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
          redisSet(`save_flag:${user.id}`, JSON.stringify({ flags: anomalies, at: Date.now() }))
            .catch(function() { /* некритично */ });
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
        redisSet(`save_flag:${user.id}`, JSON.stringify({ flags: ['shield_forged'], at: Date.now() }))
          .catch(function() { /* некритично */ });
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
          redisSet(`save_flag:${user.id}`, JSON.stringify({ flags: ['booster_forged'], at: Date.now() }))
            .catch(function() { /* некритично */ });
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

    // ★ СВЕРКА С СЕРВЕРНЫМ КОШЕЛЬКОМ (только при SERVER_AUTHORITATIVE=1).
    // Клиент мог нарисовать баланс — его прирост принимается только в пределах
    // серверного начисления. Траты принимаются как есть.
    let clampedFields = [];
    let walletToWrite = null;
    if (SERVER_AUTHORITATIVE && gameCore) {
      try {
        const wallet = ensureWallet(await readWallet(user.id), safeSave, Date.now());

        const now = Date.now();
        const earned = accrueWalletPassive(wallet, safeSave, now);

        // ★ Возможности (планеты/системы) должны быть оплачены.
        // Потраченное считаем по своим балансам, а не по словам клиента.
        const capPrev = withCoreState(existing && existing.data ? existing.data : safeSave,
          function() { return gameCore.capability(); }) || 0;
        const capNext = withCoreState(safeSave, function() { return gameCore.capability(); }) || 0;

        const spentValue =
          Math.max(0, (wallet.dust - earned.dust) - Number(safeSave.dust)) +
          Math.max(0, (wallet.energy - earned.energy) - Number(safeSave.energy)) * ENERGY_TO_DUST +
          Math.max(0, (wallet.civLevel - earned.civ) - Number(safeSave.civLevel)) * CIV_TO_DUST;

        const capAudit = capabilityAudit({
          prevCost: capPrev, nextCost: capNext,
          spentValue: spentValue, budget: Number(wallet.capBudget) || 0,
        });

        if (!capAudit.funded) {
          console.warn(`[save] user=${user.id} необоснованный прирост возможностей: ` +
            `${Math.round(capAudit.uncovered)} (delta=${Math.round(capAudit.delta)})`);
          redisSet(`save_flag:${user.id}`, JSON.stringify({
            flags: ['phantom_capability'], at: now,
            delta: Math.round(capAudit.delta), uncovered: Math.round(capAudit.uncovered),
          })).catch(function() { /* некритично */ });

          if (CAPABILITY_ENFORCE && existing && existing.data) {
            return res.status(409).json({
              ok: false, conflict: true, reason: 'capability',
              data: existing.data, saved_at: existing.saved_at, version: curVersion,
            });
          }
          wallet.capBudget = 0;
        } else {
          wallet.capBudget = remainingCapabilityBudget(wallet.capBudget, capAudit.delta, spentValue);
        }

        gameCore.setState(safeSave);
        const caps = gameCore.caps();
        const allowance = rewardAllowance(caps, WALLET_ALLOWANCE_SHARE);
        const rec = reconcileWallet(wallet, safeSave, allowance);
        safeSave = rec.data;
        clampedFields = rec.clamped;
        walletToWrite = wallet;

        if (clampedFields.length) {
          console.warn(`[save] user=${user.id} обрезаны ресурсы: ${clampedFields.join(',')}`);
          redisSet(`save_flag:${user.id}`, JSON.stringify({
            flags: clampedFields.map(function(f) { return 'wallet_clamp:' + f; }), at: now,
          })).catch(function() { /* некритично */ });
        }
      } catch (e) {
        console.warn('[save] сверка с кошельком не удалась:', e.message);
      }
    }

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

    res.json({
      ok: true, saved_at: payload.saved_at, version: payload.version,
      authoritative: SERVER_AUTHORITATIVE,
      clamped: clampedFields.length ? clampedFields : undefined,
      data: clampedFields.length ? safeSave : undefined,
    });
  } catch (e) {
    console.error('[save]', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/load', async (req, res) => {
  try {
    const { initData } = req.body || {};
    const user = validateInitData(initData);
    if (!user) return res.status(401).json({ error: 'Invalid initData' });
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

    const payload = parseRedisJson(raw);
    if (!payload || typeof payload !== 'object') return res.status(500).json({ error: 'Corrupted cloud save' });
    // ★ ОФЛАЙН-ДОХОД СЧИТАЕТ СЕРВЕР — по серверному времени сохранения.
    // Клиентские часы и lastTick больше не участвуют: перевести часы назад
    // или откатить lastTick, чтобы «доначислить» 8 часов, больше не работает.
    // Сейв в Redis не меняем: начисление живёт в ответе и закрепится
    // ближайшим сохранением клиента.
    let data = payload.data;
    let offline = null;
    let authoritative = false;
    let walletView = null;

    if (gameCore && data && typeof data === 'object' && typeof data.stage === 'string' && payload.saved_at) {
      try {
        const elapsedSec = Math.max(0, (Date.now() - Number(payload.saved_at)) / 1000);
        if (elapsedSec >= 30) {
          const acc = gameCore.accrueOffline(data, Math.min(elapsedSec, 30 * 24 * 3600));
          data = acc.data;
          data.lastTick = Date.now();
          offline = {
            seconds: Math.floor(elapsedSec),
            dustEarned: acc.earned.dust,
            energyEarned: acc.earned.energy,
            civEarned: acc.earned.civ,
            metalsEarned: acc.earned.metals || 0,
          };
        }
      } catch (e) {
        console.warn('[load] офлайн-расчёт не удался:', e.message);
        data = payload.data;
        offline = null;
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
    const credit = clampReward(report, maxExtra);

    wallet.lastRewardAt = now;
    if (hasReward(credit)) {
      wallet.dust = Math.min(info.caps.dust, wallet.dust + credit.dust);
      wallet.energy = Math.min(info.caps.energy, wallet.energy + credit.energy);
      wallet.civLevel = Math.min(info.caps.civ, wallet.civLevel + credit.civ);
      wallet.dustTotal += credit.dust;
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
    await redisSet(entKey, String(incomeUntil));

    wallet.metalAmount = metals - pay;
    wallet.updatedAt = now;
    await writeWallet(user.id, wallet);

    const data = Object.assign({}, payload.data);
    data.metalAmount = wallet.metalAmount;
    data.boosters = Object.assign({}, payload.data.boosters || {}, { incomeUntil });

    payload.data = data;
    payload.saved_at = now;
    payload.version = (Number(payload.version) || 0) + 1;
    await redisSet(`cloudsave:${user.id}`, JSON.stringify(payload));
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
app.post('/webhook', async (req, res) => {
  try {
    const secret = req.headers['x-telegram-bot-api-secret-token'];
    if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
      console.warn('[webhook] отклонён: WEBHOOK_SECRET не задан или не совпал');
      return res.sendStatus(403);
    }

    const update = req.body;

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
    players.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));

    console.log(`[admin] отдаю игроков: ${players.length}`);
    res.json({ ok: true, count: players.length, players });
  } catch (e) {
    console.error('[admin] /admin/api/players', e);
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
    res.json({ ok: true, id, savedAt: payload.saved_at || 0, data: payload.data });
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

    // Защита от спама через API: не более 40 пушей в час на игрока.
    const hourKey = `notify_hour:${user.id}:${Math.floor(Date.now() / 3600000)}`;
    if (await bumpCounter(hourKey, 3700) > 40) {
      return res.json({ ok: true, throttled: true });
    }

    let sent = 0;
    for (const item of batch) {
      const rawType = (typeof item.type === 'string') ? item.type : 'info';
      const notifyType = /^[a-z0-9_]{1,32}$/.test(rawType) ? rawType : 'info';
      const text = String(item.message).slice(0, 1000);

      // Дедупликация одинаковых сообщений в течение 5 минут
      // (одно и то же событие не должно приходить дважды).
      let hash = 5381;
      for (let i = 0; i < text.length; i++) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
      const seenKey = `notify_seen:${user.id}:${notifyType}:${hash.toString(36)}`;
      const seen = await redisGet(seenKey);
      if (seen) continue;
      await redisSet(seenKey, String(Date.now()));
      try { await redisCommand('EXPIRE', seenKey, 300); } catch (e) { /* некритично */ }

      await sendNotification(user.id, text);
      sent++;
    }
    res.json({ ok: true, sent: sent });
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

async function warnNeglectSoon(userId, payload, preview) {
  try {
    if (!gameCore || typeof gameCore.neglectStatus !== 'function') return;
    const status = gameCore.neglectStatus(preview.awayHours);
    if (!status) return;
    if (status.level > 0) return;                            // запустение уже началось
    if (!(status.hoursToNeglect > 0)) return;
    if (status.hoursToNeglect > NEGLECT_WARN_AHEAD_HOURS) return; // ещё рано

    // Одно предупреждение на одну отлучку.
    const key = `neglect_warn:${userId}`;
    const warnedFor = await redisGet(key);
    if (warnedFor === String(payload.saved_at)) return;
    await redisSet(key, String(payload.saved_at));
    try { await redisCommand('EXPIRE', key, 45 * 24 * 3600); } catch (e) { /* некритично */ }

    const awayLabel = Math.round((Number(preview.awayHours) || 0) * 10) / 10;
    const leftLabel = Math.max(0.1, Math.round(status.hoursToNeglect * 10) / 10);
    await sendNotification(userId,
      '⏳ <b>Галактика скоро начнёт приходить в запустение</b>\n' +
      'Вы отсутствуете ~' + awayLabel + ' ч. Примерно через ' + leftLabel + ' ч закончится льготный период: ' +
      'атаки станут жёстче, а планеты начнут уходить в простой.\n' +
      (preview.shieldProtected ? '🛡 Щит уже покрыл часть отсутствия — это учтено в расчёте.\n' : '') +
      'Зайдите в игру, чтобы обнулить таймер заброшенности.'
    );
  } catch (e) {
    console.error('[cron] предупреждение о запустении:', e.message);
  }
}

// ─── Cron: пуш об офлайн-вторжениях ─────────────────────────────
// Игрок закрыл игру — клиент не может оповестить. Раз в 10 минут
// смотрим сейвы: кто отсутствует > 2 ч и по кому набегают волны
// вторжений, шлём одно предупреждение (не чаще раза в 3 часа).
cron.schedule('*/10 * * * *', async () => {
  if (!gameCore) return;
  try {
    const keys = await redisScanAll('cloudsave:*', 500);
    const now = Date.now();
    for (const key of keys) {
      const userId = key.split(':')[1];
      if (!userId) continue;
      const payload = parseRedisJson(await redisGet(key));
      if (!payload || !payload.data || !payload.saved_at) continue;
      const data = payload.data;
      if (!(data.stage === 'system' || data.stage === 'galaxy')) continue;
      const psettings = data.settings;
      if (psettings && psettings.pushEnabled === false) continue;

      const elapsedSec = Math.max(0, (now - Number(payload.saved_at)) / 1000);
      if (elapsedSec < 2 * 3600) continue;

      const preview = gameCore.previewOfflineInvasions(data, Math.min(elapsedSec, 30 * 24 * 3600));
      if (!preview || preview.skipped) continue;

      // Предупреждение за пару часов до запустения галактики.
      await warnNeglectSoon(userId, payload, preview);
      const lockKey = `tg_attack_notice:${userId}`;
      const last = await redisGet(lockKey);
      if (last && now - Number(last) < 3 * 3600 * 1000) continue;
      await redisSet(lockKey, String(now));
      try { await redisCommand('EXPIRE', lockKey, 3 * 3600); } catch (e) { /* некритично */ }

      const lines = [
        '⏳ Вас не было ' + (Math.round(Number(preview.awayHours || 0) * 10) / 10) + ' ч — зафиксировано ~' + preview.attacks + ' волн вторжений.',
        '💀 Максимальная сложность: ' + preview.maxDifficulty + '/3.',
      ];
      if (preview.shieldProtected) lines.push('🛡 Щит покрыл часть отсутствия.');
      lines.push('Зайдите в игру, чтобы увидеть точные потери и отбить атаку.');
      await sendNotification(userId, '⚠️ <b>Галактика под атакой!</b>\n' + lines.join('\n'));
    }
  } catch (e) {
    console.error('[cron] офлайн-вторжения:', e.message);
  }
});

// ─── Cron: напоминание «спящим» игрокам (раз в день в 12:00) ────
cron.schedule('0 12 * * *', async () => {
  console.log('[cron] Проверка спящих игроков...');
  try {
    const keys = await redisScanAll('cloudsave:*', 500);
    for (const key of keys) {
      const userId = key.split(':')[1];
      const raw = await redisGet(key);
      const payload = parseRedisJson(raw);
      if (!payload || !payload.data) continue;

      // Уважаем переключатель уведомлений в настройках игры.
      const psettings = payload.data.settings;
      if (psettings && psettings.pushEnabled === false) continue;

      const lastTick = payload.data.lastTick || 0;
      // Если игрок не заходил больше 24 часов
      if (Date.now() - lastTick > 24 * 3600 * 1000) {
        await sendNotification(userId, '💤 Давно не виделись! Ваша галактика ждет вас. Заберите ежедневную награду и проверьте хранилища.');
      }
    }
  } catch (e) { console.error('[cron] Ошибка:', e.message); }
});

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