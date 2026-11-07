# Cloudflare Worker — прокси к API «Аккреции»

Воркер: **https://accretion-api-proxy.buggipop.workers.dev**
Исходник: [`worker.js`](./worker.js) — один модуль, весь файл целиком.

## Зачем

1. `*.onrender.com` блокируется в сетях РФ, а `*.workers.dev` открывается.
2. Render отдаёт CORS-заголовки только доверенным origin (а с неверным
   `ALLOWED_ORIGIN` — никому), поэтому браузер блокирует ответы API.
   Прокси сам отвечает на preflight `OPTIONS` и добавляет CORS, так что
   клиенту не важны настройки CORS на Render.

## Как обновить

1. Cloudflare Dashboard → **Workers & Pages** → `accretion-api-proxy`.
2. **Edit code** → вставить содержимое `worker.js` целиком → **Deploy**.
3. Проверка: `https://accretion-api-proxy.buggipop.workers.dev/` должен
   вернуть `{"ok":true,"service":"accretion-server",...}`.

## Проверка CORS

```bash
node -e "fetch('https://accretion-api-proxy.buggipop.workers.dev/api/load',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://buggipop-pixel.github.io'},body:JSON.stringify({initData:'x'})}).then(async r=>console.log(r.status, r.headers.get('access-control-allow-origin'), await r.text()))"
```

Ожидаемо: `401 * {"error":"Invalid initData"}` — прокси работает, CORS есть,
а 401 означает, что запрос дошёл до сервера (initData фиктивный).

## Альтернатива без прокси

В Render → Environment задать `ALLOWED_ORIGIN=https://buggipop-pixel.github.io`
(ровно origin, без слэша в конце). Тогда CORS начнёт отдавать сам Render,
но блокировка `onrender.com` в РФ останется — прокси всё равно нужен.
