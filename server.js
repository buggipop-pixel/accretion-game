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
import fs from 'node:fs';
import TelegramBot from 'node-telegram-bot-api';
console.log("[START] Инициализация сервера...");
console.log("BOT_TOKEN задан:", !!process.env.BOT_TOKEN);
console.log("UPSTASH_URL задан:", !!process.env.UPSTASH_REDIS_REST_URL);
const {
  BOT_TOKEN,
  WEBAPP_URL,
  UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN,
  WEBHOOK_SECRET,
  PORT = 10000,
} = process.env;

if (!BOT_TOKEN || !UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
  console.error('[FATAL] Не хватает переменных окружения');
  process.exit(1);
}

// ─── Товары ─────────────────────────────────────────────────────
const PRODUCTS = {
  chest:  { label: 'Космический сундук', stars: 100 },
  shield: { label: 'Премиум Щит (24ч)',  stars: 50  },
};

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

// ─── Upstash Redis (REST) ───────────────────────────────────────
async function redisSet(key, value) {
  const url = `${UPSTASH_REDIS_REST_URL}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` } });
  return r.ok;
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
  return w;
}

async function readWallet(userId) {
  const wallet = parseRedisJson(await redisGet(`wallet:${userId}`));
  return (wallet && typeof wallet === 'object') ? wallet : null;
}

async function writeWallet(userId, wallet) {
  await redisSet(`wallet:${userId}`, JSON.stringify(wallet));
}

// Начисляет кошельку пассивный доход за прошедшее время:
// до 30 с — обычный онлайн-тик (100%), больше — офлайн-правило игры.
function accrueWalletPassive(wallet, save, now) {
  const since = Number(wallet.updatedAt) || now;
  const elapsedSec = Math.max(0, (now - since) / 1000);
  const earned = { dust: 0, energy: 0, civ: 0 };

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
app.use(express.json({ limit: '1mb' })); // 1mb для облачных сейвов

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
                  return chestCapabilityValue(gameCore.planetCost(0), gameCore.systemCost(systems));
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
const MAX_SAVE_SIZE = 800 * 1024; // 800 КБ
const SAVE_RATE_LIMIT_MS = 5000;

app.post('/api/save', async (req, res) => {
  try {
    const { initData, saveData, baseVersion } = req.body || {};
    const user = validateInitData(initData);
    if (!user) return res.status(401).json({ error: 'Invalid initData' });
    // ★ Сейв приходит с чужой машины: проверяем форму, типы и метку времени.
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

    // ★ Скачок ресурсов за секунды — это не игра, а подмена сейва.
    // Не блокируем (можно и ошибиться), но фиксируем для админки.
    if (existing && existing.data) {
      const anomalies = detectSaveAnomalies(existing.data, safeSave, existing.saved_at);
      if (anomalies.length) {
        console.warn(`[save] подозрительный прогресс user=${user.id}: ${anomalies.join(',')}`);
        redisSet(`save_flag:${user.id}`, JSON.stringify({ flags: anomalies, at: Date.now() }))
          .catch(function() { /* некритично */ });
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
    if (SERVER_AUTHORITATIVE && gameCore) {
      try {
        const wallet = ensureWallet(await readWallet(user.id), safeSave, Date.now());

        const now = Date.now();
        accrueWalletPassive(wallet, safeSave, now);

        // ★ Возможности (планеты/системы) должны быть оплачены.
        // Потраченное считаем по своим балансам, а не по словам клиента.
        const capPrev = withCoreState(existing && existing.data ? existing.data : safeSave,
          function() { return gameCore.capability(); }) || 0;
        const capNext = withCoreState(safeSave, function() { return gameCore.capability(); }) || 0;

        const spentValue =
          Math.max(0, wallet.dust - Number(safeSave.dust)) +
          Math.max(0, wallet.energy - Number(safeSave.energy)) * ENERGY_TO_DUST +
          Math.max(0, wallet.civLevel - Number(safeSave.civLevel)) * CIV_TO_DUST;

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
        await writeWallet(user.id, wallet);

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
    await redisSet(cloudKey, JSON.stringify(payload));
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

        if (earned.dust || earned.energy || earned.civ) {
          offline = {
            seconds: Math.max(0, Math.floor((now - beforeUpdate) / 1000)),
            dustEarned: earned.dust,
            energyEarned: earned.energy,
            civEarned: earned.civ,
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

// ─── 3б. Клики: сервер сам начисляет доход за тап ─────────────
// Клиент присылает пачки кликов, сервер ограничивает частоту и считает
// сумму игровой формулой clickGain() из game-core.
app.post('/api/action', async (req, res) => {
  try {
    const { initData, clicks } = req.body || {};
    const user = validateInitData(initData);
    if (!user) return res.status(401).json({ error: 'Invalid initData' });

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
    const { initData } = req.body || {};
    const user = validateInitData(initData);
    if (!user) return res.status(401).json({ error: 'Invalid initData' });

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

    const metals = Number(payload.data.metalAmount) || 0;
    if (metals < cfg.costMetals) {
      return res.status(400).json({ error: 'Not enough metals', required: cfg.costMetals });
    }

    const entKey = `entitlement:booster:${user.id}`;
    const prevUntil = Number(await redisGet(entKey)) || 0;
    const incomeUntil = nextBoosterUntil(prevUntil, now, cfg.hours * 3600 * 1000);
    await redisSet(entKey, String(incomeUntil));

    const data = Object.assign({}, payload.data);
    data.metalAmount = metals - cfg.costMetals;
    data.boosters = Object.assign({}, payload.data.boosters || {}, { incomeUntil });

    payload.data = data;
    payload.saved_at = now;
    payload.version = (Number(payload.version) || 0) + 1;
    await redisSet(`cloudsave:${user.id}`, JSON.stringify(payload));

    res.json({
      ok: true, authoritative: true,
      incomeUntil, cost: cfg.costMetals, hours: cfg.hours,
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
    if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) return res.sendStatus(403);

    const update = req.body;

    if (update.pre_checkout_query) {
      await bot.answerPreCheckoutQuery(update.pre_checkout_query.id, true);
      return res.sendStatus(200);
    }

    if (update.message && update.message.successful_payment) {
      const sp = update.message.successful_payment;
      const userId = update.message.from.id;

      let payload = {};
      try { payload = JSON.parse(sp.invoice_payload || '{}'); } catch {}
      const product = payload.product;
      if (!product || !PRODUCTS[product]) return res.sendStatus(200);

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
app.get('/', (req, res) => res.json({ ok: true, service: 'accretion-server' }));

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
    name: d.systemName || '—',
    stage: d.stage || '—',
    dust: Number(d.dust) || 0,
    metals: Number(d.metalAmount) || 0,
    systems: Number(d.systems) || 1,
    savedAt: (payload && payload.saved_at) || 0,
  };
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
    if (SERVER_AUTHORITATIVE) {
      try {
        const wallet = ensureWallet(await readWallet(id), payload.data, Date.now());
        wallet.dust = Number(payload.data.dust) || 0;
        wallet.dustTotal = Number(payload.data.dustTotal) || 0;
        wallet.energy = Number(payload.data.energy) || 0;
        wallet.civLevel = Number(payload.data.civLevel) || 0;
        wallet.updatedAt = Date.now();
        await writeWallet(id, wallet);
      } catch (e) {
        console.warn('[admin] кошелёк не обновлён:', e.message);
      }
    }

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
    await redisSet(key, JSON.stringify(payload));
    console.log(`[admin] игроку ${id} установлено ${field} = ${JSON.stringify(payload.data[field])}`);
    res.json({ ok: true, field, value: payload.data[field] });
  } catch (e) {
    console.error('[admin] /admin/api/player/set', e);
    res.status(500).json({ error: e.message });
  }
});

const server = app.listen(PORT, () => {
  console.log(`[OK] Сервер успешно запущен на порту ${PORT}`);
});

server.on('error', (err) => {
  console.error("[ERROR] Ошибка сервера:", err);
});