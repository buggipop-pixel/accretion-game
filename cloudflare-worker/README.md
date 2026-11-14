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

## Cron Trigger: серверные оповещения (обязательно)

★ Без этого пуши (вторжения, переполнение хранилища, конец щита,
«давно не виделись») приходят только после входа в игру: Render free
tier засыпает, и `node-cron` внутри сервера не тикает.

1. Render → Environment: добавить `PUSH_CRON_SECRET=<длинная случайная строка>`.
2. Worker → **Settings → Variables** → добавить ту же `PUSH_CRON_SECRET`
   (тип **Secret**).
3. Worker → **Settings → Triggers → Cron Triggers** → добавить `*/5 * * * *`.
4. Проверка: в логах Worker `[cron] push-scan → HTTP 202`, в логах Render —
   строка `[push-scan] worker: проверено …`.
5. Ручная проверка (нужен секрет):

```bash
curl -X POST https://accretion-game.onrender.com/internal/push-scan \
  -H "X-Push-Secret: $PUSH_CRON_SECRET"
# 202 {"ok":true,"started":true}
```

Без `PUSH_CRON_SECRET` эндпоинт отвечает `503` (fail-closed), без
правильного заголовка — `403`. Запуск защищён распределённой блокировкой
`push_scan:lock`, поэтому cron и Worker не дублируют пуши.

## Альтернатива без прокси

В Render → Environment задать `ALLOWED_ORIGIN=https://buggipop-pixel.github.io`
(ровно origin, без слэша в конце). Тогда CORS начнёт отдавать сам Render,
но блокировка `onrender.com` в РФ останется — прокси всё равно нужен.
