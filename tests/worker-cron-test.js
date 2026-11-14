// ═══════════════════════════════════════════════════════════════
//  WORKER CRON TEST — Cloudflare Worker должен будить Render
//  и запускать серверный сканер оповещений.
//
//  Без этого на Render free tier node-cron не тикает, и пуши
//  приходят только после входа в игру.
//  Запуск: node tests/worker-cron-test.js
// ═══════════════════════════════════════════════════════════════

(async function () {
  let passed = 0;
  let failed = 0;
  function check(name, cond, extra) {
    if (cond) { console.log('✅ ' + name); passed++; }
    else { console.error('❌ ' + name + (extra ? ' → ' + extra : '')); failed++; }
  }
  // Заголовки могут быть как Headers, так и plain-объектом.
  function hdr(name) {
    const h = captured && captured.init && captured.init.headers;
    if (!h) return null;
    if (typeof h.get === 'function') return h.get(name);
    const want = String(name).toLowerCase();
    for (const k of Object.keys(h)) if (k.toLowerCase() === want) return h[k];
    return null;
  }
  let captured = null;
  globalThis.fetch = async function (url, init) {
    captured = { url: String(url), init: init || {} };
    return new Response(JSON.stringify({ ok: true, started: true }), { status: 202 });
  };

  const worker = (await import('../cloudflare-worker/worker.js')).default;

  // 1. Без секрета cron ничего не делает (fail-closed).
  {
    captured = null;
    await worker.scheduled({ cron: '*/5 * * * *' }, {}, {});
    check('1. Без PUSH_CRON_SECRET запрос не уходит', captured === null);
  }

  // 2. С секретом — POST на /internal/push-scan с заголовком.
  {
    captured = null;
    await worker.scheduled({ cron: '*/5 * * * *' }, { PUSH_CRON_SECRET: 's3cret' }, {});
    check('2. Запрос ушёл на апстрим', !!captured);
    check('2. Путь /internal/push-scan',
      captured && captured.url === 'https://accretion-game.onrender.com/internal/push-scan',
      captured && captured.url);
    check('2. Метод POST', captured && captured.init.method === 'POST');
    check('2. Секрет передан в X-Push-Secret', hdr('X-Push-Secret') === 's3cret');
  }

  // 3. Обычный fetch проксирует секрет Telegram-вебхука.
  {
    captured = null;
    await worker.fetch(new Request('https://proxy.example/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'tg-secret',
      },
      body: JSON.stringify({ update_id: 1 }),
    }));
    check('3. Прокси передаёт X-Telegram-Bot-Api-Secret-Token',
      hdr('X-Telegram-Bot-Api-Secret-Token') === 'tg-secret');
    check('3. Прокси не передаёт Origin', hdr('Origin') === null);
  }

  // 4. Ошибка сети не бросает наружу (cron не должен падать).
  {
    globalThis.fetch = async function () { throw new Error('boom'); };
    let threw = false;
    try {
      await worker.scheduled({}, { PUSH_CRON_SECRET: 's3cret' }, {});
    } catch (e) { threw = true; }
    check('4. Ошибка сети в cron не выбрасывается', threw === false);
  }

  console.log('========================================');
  console.log('ИТОГО: Пройдено ' + passed + ', Провалено ' + failed);
  console.log('========================================');
  if (failed > 0) process.exit(1);
})();
