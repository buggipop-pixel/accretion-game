// ═══════════════════════════════════════════════════════════════
//  SERVER.JS — Telegram-бот для приёма Stars и облачных сейвов
// ═══════════════════════════════════════════════════════════════

import express from 'express';
import crypto from 'crypto';
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
function validateInitData(initData) {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const calcHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (calcHash !== hash) return null;

  const authDate = parseInt(params.get('auth_date') || '0', 10);
  if (!authDate || (Date.now() / 1000 - authDate) > 86400) return null;

  try { return JSON.parse(params.get('user')); } catch { return null; }
}

// ─── Express ────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '1mb' })); // 1mb для облачных сейвов

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // TODO: временно для отладки — сузить до WEBAPP_URL после починки сети
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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

    res.json({ ok: true, product, granted_at: purchase.granted_at });
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
    const { initData, saveData } = req.body || {};
    const user = validateInitData(initData);
    if (!user) return res.status(401).json({ error: 'Invalid initData' });
    if (!saveData || typeof saveData !== 'object') return res.status(400).json({ error: 'No saveData' });

    const json = JSON.stringify(saveData);
    if (json.length > MAX_SAVE_SIZE) return res.status(413).json({ error: 'Save too large', size: json.length });

    const rlKey = `save_rl:${user.id}`;
    const last = await redisGet(rlKey);
    if (last && Date.now() - Number(last) < SAVE_RATE_LIMIT_MS) return res.status(429).json({ error: 'Too frequent' });
    await redisSet(rlKey, String(Date.now()));

    const payload = { data: saveData, saved_at: Date.now(), user_id: user.id };
    await redisSet(`cloudsave:${user.id}`, JSON.stringify(payload));

    res.json({ ok: true, saved_at: payload.saved_at });
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

    const raw = await redisGet(`cloudsave:${user.id}`);
    if (!raw) return res.json({ ok: true, data: null, saved_at: 0 });

    const payload = parseRedisJson(raw);
    if (!payload || typeof payload !== 'object') return res.status(500).json({ error: 'Corrupted cloud save' });
    res.json({ ok: true, data: payload.data, saved_at: payload.saved_at });
  } catch (e) {
    console.error('[load]', e);
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
    // Поднимаем saved_at, иначе клиент сочтёт локальный сейв новее и не примет выдачу.
    payload.saved_at = Date.now();

    await redisSet(key, JSON.stringify(payload));
    console.log(`[admin] игроку ${id} выдано ${resource} +${delta} → ${payload.data[resource]}`);
    res.json({ ok: true, id, resource, amount: delta, value: payload.data[resource] });
  } catch (e) {
    console.error('[admin] /admin/api/player/give', e);
    res.status(500).json({ error: e.message });
  }
});

const server = app.listen(PORT, () => {
  console.log(`[OK] Сервер успешно запущен на порту ${PORT}`);
});

server.on('error', (err) => {
  console.error("[ERROR] Ошибка сервера:", err);
});