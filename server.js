// ═══════════════════════════════════════════════════════════════
//  SERVER.JS — Telegram-бот для приёма Stars и облачных сейвов
// ═══════════════════════════════════════════════════════════════

import express from 'express';
import crypto from 'crypto';
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

async function redisGet(key) {
  const url = `${UPSTASH_REDIS_REST_URL}/get/${encodeURIComponent(key)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` } });
  if (!r.ok) return null;
  const data = await r.json();
  return data.result;
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

    const purchase = JSON.parse(raw);
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

    const payload = JSON.parse(raw);
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

const server = app.listen(PORT, () => {
  console.log(`[OK] Сервер успешно запущен на порту ${PORT}`);
});

server.on('error', (err) => {
  console.error("[ERROR] Ошибка сервера:", err);
});