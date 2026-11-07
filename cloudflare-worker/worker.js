// ═══════════════════════════════════════════════════════════════
//  CLOUDFLARE WORKER — прокси к API «Аккреции»
//  Адрес: https://accretion-api-proxy.buggipop.workers.dev
//
//  Зачем нужен:
//   1. Домен *.onrender.com блокируется в сетях РФ — Cloudflare доступен.
//   2. Render отдаёт CORS-заголовки только доверенным origin, из-за чего
//      браузер (Telegram WebView / GitHub Pages) блокирует ответы API.
//      Прокси сам отвечает на preflight OPTIONS и добавляет CORS, поэтому
//      клиенту не важны настройки CORS на Render.
//
//  Как задеплоить:
//   Cloudflare Dashboard → Workers & Pages → accretion-api-proxy →
//   Edit code → вставить этот файл целиком → Deploy.
// ═══════════════════════════════════════════════════════════════

const UPSTREAM = 'https://accretion-game.onrender.com';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
  'Access-Control-Max-Age': '86400'
};

// Копируем заголовки ответа и заменяем CORS/транспортные на свои.
function outboundHeaders(source) {
  const out = new Headers(source || {});
  out.delete('access-control-allow-origin');
  out.delete('access-control-allow-methods');
  out.delete('access-control-allow-headers');
  // Body может быть распакован рантаймом — не врём клиенту о кодировке.
  out.delete('content-encoding');
  out.delete('content-length');
  out.delete('transfer-encoding');
  out.delete('connection');
  for (const name of Object.keys(CORS_HEADERS)) out.set(name, CORS_HEADERS[name]);
  return out;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Preflight отвечаем сами — на Render не ходим.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: outboundHeaders() });
    }

    // На Render не передаём Origin/Host/CF-заголовки: CORS решает прокси.
    const headers = new Headers();
    const contentType = request.headers.get('Content-Type');
    if (contentType) headers.set('Content-Type', contentType);
    const adminToken = request.headers.get('X-Admin-Token');
    if (adminToken) headers.set('X-Admin-Token', adminToken);
    headers.set('Accept-Encoding', 'identity');

    const init = { method: request.method, headers, redirect: 'manual' };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body;
    }

    let upstream;
    try {
      upstream = await fetch(UPSTREAM + url.pathname + url.search, init);
    } catch (e) {
      return new Response(JSON.stringify({ error: 'proxy_upstream_failed', detail: String(e) }), {
        status: 502,
        headers: outboundHeaders({ 'Content-Type': 'application/json' })
      });
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: outboundHeaders(upstream.headers)
    });
  }
};
