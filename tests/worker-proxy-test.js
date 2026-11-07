// ═══════════════════════════════════════════════════════════════
//  Тест Cloudflare Worker-прокси (cloudflare-worker/worker.js).
//  Сеть не нужна: глобальный fetch подменяется заглушкой.
//  Запуск: node tests/worker-proxy-test.js
//  (tests/package.json = commonjs, поэтому worker грузим динамическим import)
// ═══════════════════════════════════════════════════════════════
// (без assert — проверки через check(), чтобы видеть все результаты сразу)

(async function () {
  let passed = 0;
  let failed = 0;

  function check(name, cond, extra) {
    if (cond) { console.log('✅ ' + name); passed++; }
    else { console.error('❌ ' + name + (extra ? ' → ' + extra : '')); failed++; }
  }

  // Заглушка апстрима: запоминаем запрос и отдаём «грязные» заголовки Render.
  let captured = null;
  globalThis.fetch = async function (url, init) {
    captured = { url: String(url), init: init || {} };
    return new Response(JSON.stringify({ ok: true, service: 'accretion-server' }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': 'https://wrong.example',
        'content-encoding': 'gzip'
      }
    });
  };

  const worker = (await import('../cloudflare-worker/worker.js')).default;

  // ─── 1. Preflight отвечает сам, не ходит на Render ─────────────
  captured = null;
  let res = await worker.fetch(new Request('https://proxy.example/api/save', {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://buggipop-pixel.github.io',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type'
    }
  }));
  check('Preflight: 204 без похода на Render', res.status === 204 && captured === null);
  check('Preflight: CORS-заголовки', res.headers.get('access-control-allow-origin') === '*'
    && res.headers.get('access-control-allow-methods').includes('POST')
    && res.headers.get('access-control-allow-headers').includes('Content-Type'));

  // ─── 2. POST проксируется, Origin не уходит на Render ──────────
  captured = null;
  res = await worker.fetch(new Request('https://proxy.example/api/save?v=2', {
    method: 'POST',
    headers: {
      Origin: 'https://buggipop-pixel.github.io',
      'Content-Type': 'application/json',
      'X-Admin-Token': 'secret'
    },
    body: JSON.stringify({ initData: 'abc', saveData: { dust: 1 } })
  }));
  check('POST: статус апстрима', res.status === 200);
  check('POST: CORS от прокси, а не от Render', res.headers.get('access-control-allow-origin') === '*');
  check('POST: сжатие не врёт клиенту', res.headers.get('content-encoding') === null);
  check('POST: путь и query сохранены',
    captured && captured.url === 'https://accretion-game.onrender.com/api/save?v=2',
    captured && captured.url);
  check('POST: Origin не передан на Render',
    captured && !captured.init.headers.get('origin'));
  check('POST: Content-Type и X-Admin-Token переданы',
    captured && captured.init.headers.get('content-type') === 'application/json'
    && captured.init.headers.get('x-admin-token') === 'secret');
  check('POST: тело ответа не потерялось', (await res.text()).includes('accretion-server'));

  // ─── 3. GET и ошибка апстрима ──────────────────────────────────
  captured = null;
  res = await worker.fetch(new Request('https://proxy.example/', { method: 'GET' }));
  check('GET: проксируется и получает CORS',
    res.status === 200 && res.headers.get('access-control-allow-origin') === '*'
    && captured.url === 'https://accretion-game.onrender.com/');

  globalThis.fetch = async function () { throw new Error('boom'); };
  res = await worker.fetch(new Request('https://proxy.example/api/load', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: 'x' })
  }));
  check('Ошибка апстрима: 502 + CORS + JSON',
    res.status === 502 && res.headers.get('access-control-allow-origin') === '*'
    && (await res.text()).includes('proxy_upstream_failed'));

  console.log('========================================');
  console.log('ИТОГО: Пройдено ' + passed + ', Провалено ' + failed);
  if (failed > 0) process.exitCode = 1;
})().catch(function (e) {
  console.error('❌ Тест упал:', e && e.stack || e);
  process.exitCode = 1;
});
