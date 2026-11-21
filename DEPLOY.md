# Выкат и мониторинг

Чек-лист для включения серверного кошелька (`SERVER_AUTHORITATIVE`) и аудита
возможностей. Сервер не откатывает ресурсы и покупки: расхождения видны в
админке в разделе «🚨 Оповещения».

## 0. Перед деплоем

- [ ] `npm run test:all` — 9 наборов зелёные (smoke, cloud-sync, validation,
      game-core, economy-actions, wallet, chest, reward, capability).
- [ ] В репозитории есть `lib/` (7 модулей) — без неё сервер запустится, но без
      серверных формул (в логе будет `[game-core] не удалось загрузить формулы`).
- [ ] `server.js` поднимается локально: `node server.js` при заданных `BOT_TOKEN`,
      `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
- [ ] Задан `WEBHOOK_SECRET` (иначе вебхук оплаты отклоняет все callback'и,
      см. раздел 7).

## 1. Деплой (флаги выключены)

- [ ] Залить коммит, дождаться сборки Render, проверить `GET /` →
      `{"ok":true,"service":"accretion-server"}`.
- [ ] В логе старта: `[OK] Игровые формулы загружены: офлайн-доход считает сервер`.
- [ ] Дать клиентам обновиться (Telegram WebView кэширует JS). Старый клиент
      не знает про кошелёк — включать флаг раньше нельзя.

## 2. Включение кошелька

- [ ] `SERVER_AUTHORITATIVE=1`, остальное по умолчанию
      (`WALLET_ALLOWANCE_SHARE=0.05`, `REWARD_EXTRA_SHARE=2.0`,
      `MAX_CLICKS_PER_SEC=30`). Передеплой.
- [ ] Сутки смотреть в админке «🚨 Оповещения»:
      - `wallet_unearned_gain` — прирост выше серверного допуска: поднять
        `WALLET_ALLOWANCE_SHARE` (0.1) или `REWARD_EXTRA_SHARE` (3), если это
        честные награды;
      - `phantom_capability` — сигнал подмены планет/систем (или слишком узкие
        конверсии `ENERGY_TO_DUST`/`CIV_TO_DUST`);
      - `booster_forged`, `shield_forged` — подделка платного контента.
- [ ] Баланс клиента больше не обрезается: даже при срабатывании проверки
      игрок не теряет ресурсы. Решение о блокировке — вручную.
- [ ] Учесть при включении: бустеры, купленные локально до флага, закончатся
      при первом сохранении — права `entitlement:booster` в Redis ещё нет.
      Щит сохраняется — он накладывается только «вверх».

## 3. Включение проверки возможностей

- [ ] Убедиться, что `phantom_capability` не появляется у честных игроков
      (смотреть `delta`/`uncovered` в записи `save_flag:{id}`).
- [ ] ⚠️ `CAPABILITY_ENFORCE` больше НЕ отклоняет сейв (ответ 409 откатывал
      только что купленные планеты/системы у честных игроков). Решение
      записывается только как флаг `phantom_capability` в `save_flag:{id}`.

## 4. Что считается нормой

| Событие в логе | Норма | Реакция |
|---|---|---|
| `[Sync] Облако пусто` | да, новый игрок | — |
| `wallet_unearned_gain` | редко, после долгого офлайна | оповещение в админке; много — поднять allowance |
| `phantom_capability` | единицы | оповещение + `delta`/`uncovered`, сейв не меняется |
| `booster_forged` / `shield_forged` | единицы | — |
| 429 `Too frequent` | единицы | не спамить клиентом |

## 5. Откат

- Кошелёк: убрать `SERVER_AUTHORITATIVE` → сейвы и прогресс не меняются,
  `wallet:{id}` и `entitlement:*` просто перестают использоваться.
- Проверка возможностей: она теперь всегда мягкая (только флаг), откатывать нечего.
- Полный откат кода: `git revert <commit>` (см. `git log --oneline`) + деплой.

## 6. Переменные окружения

Полный шаблон — в `.env.example`. Ниже краткая справка.

| Переменная | По умолчанию | Зачем |
|---|---|---|
| `BOT_TOKEN` | — (обязательна) | токен бота Telegram (валидация initData, уведомления) |
| `UPSTASH_REDIS_REST_URL` | — (обязательна) | REST-адрес Upstash Redis |
| `UPSTASH_REDIS_REST_TOKEN` | — (обязательна) | токен Upstash Redis |
| `WEBHOOK_SECRET` | — (нужна для оплаты) | секрет вебхука Telegram; без неё оплата fail-closed |
| `PORT` | 10000 | порт (на Render обычно задаёт хостинг) |
| `ADMIN_TOKEN` | — | доступ к `/admin`; без неё админка отключена |
| `ALLOWED_ORIGIN` | не задано (`*`) | CORS для сайта игры |
| `SERVER_AUTHORITATIVE` | выкл | серверный кошелёк (пыль/энергия/цив/металлы) |
| `WALLET_ALLOWANCE_SHARE` | 0.05 | допуск аудита наград (не обрезка баланса) |
| `REWARD_EXTRA_SHARE` | 2.0 | предел «прочего» дохода от пассивки |
| `MAX_CLICKS_PER_SEC` | 30 | античит по кликам |
| `REWARD_BANK_SHARE` | 0.5 | потолок копилки разовых наград (доля лимита хранилища) |
| `CAPABILITY_TOLERANCE_SHARE` | 0.02 | допуск аудита возможностей (доля лимита пыли) |
| `CAPABILITY_ENFORCE` | — | **устарело**: 409 больше не возвращается, всегда только флаг |
| `ENERGY_TO_DUST` / `CIV_TO_DUST` | 1e6 / 1e9 | пересчёт трат энергии/цив в пыль |
| `PUSH_CRON_SECRET` | — | секрет для `POST /internal/push-scan`; без него внешний cron отключён (503) |
| `PUBLIC_BASE_URL` | `RENDER_EXTERNAL_URL` | публичный адрес сервера для авторегистрации Telegram-вебхука |

## 6.1. Оповещения в простое (Render free tier)

★ Render засыпает без трафика, поэтому `node-cron` внутри процесса не
тикает. Без внешнего триггера пуши приходят только после входа в игру.

- [ ] Задать `WEBHOOK_SECRET` **и** `PUSH_CRON_SECRET` в Render → Environment.
- [ ] В Cloudflare Worker (`cloudflare-worker/README.md`) задать тот же
      `PUSH_CRON_SECRET` и включить Cron Trigger `*/5 * * * *`.
- [ ] Убедиться, что в логе старта Render есть
      `[OK] Вебхук Telegram зарегистрирован: …` (иначе `/start` не дошёт).
- [ ] Проверить вручную:
      `curl -X POST https://accretion-game.onrender.com/internal/push-scan -H "X-Push-Secret: …"`
      → `202 {"ok":true,"started":true}`, в логах — `[push-scan] …`.

Что теперь отправляется сервером без входа в игру: старт офлайн-волн
вторжений, предупреждение о запустении, переполнение хранилища, конец
щита/автобороны и «давно не виделись» (одно сообщение за отлучку).

## 7. Вебхук оплаты (обязательно перед прод-оплатой)

После фикса безопасности вебхук работает **fail-closed**:

- Если `WEBHOOK_SECRET` **не задан** — `/webhook` отклоняет все запросы (`403`),
  оплата не выдаётся (безопасно, но покупки не работают).
- Если задан — сверяется заголовок `X-Telegram-Bot-API-Secret-Token`, и
  дополнительно `invoice_payload.user_id === from.id`.

**Как задать:**
1. Сгенерируйте длинную случайную строку (например `openssl rand -hex 32`).
2. Задайте `WEBHOOK_SECRET` в окружении Render.
3. При регистрации вебхука у Telegram укажите тот же секрет в поле
   `secret_token` (bot.setWebhook / BotFather / API).
4. Проверьте лог старта: не должно быть `[WARN] WEBHOOK_SECRET не задан…`.


## 8. Если облачные сохранения не работают у части игроков

Диагностика по логам (Настройки → 📄 Логи):

```
[net] POST https://accretion-game.onrender.com/api/save → ERROR Load failed 80ms
```

- `Load failed` за десятки миллисекунд, статус 0, `network: true` — это **обрыв на уровне
  соединения**, а не ответ сервера. HTTP-код и CORS тут ни при чём.
- Если сервер при этом **снаружи доступен** (проверка сторонним сервисом,
  например `api.hackertarget.com/httpheaders/?q=...` возвращает `200 OK`),
  значит сервер жив, а **домен `onrender.com` заблокирован в сети игрока**
  (частая ситуация в РФ).
- В таком случае игра играбельна (локальный сейв в localStorage), но облако
  не синхронизируется.

### Как чинить

0. **Готовый прокси на Cloudflare Worker (уже стоит по умолчанию).**
   - Адрес: `https://accretion-api-proxy.buggipop.workers.dev`.
   - Он прописан адресом по умолчанию в `js/cloudsave.js`; исходник и инструкция —
     `cloudflare-worker/worker.js` и `cloudflare-worker/README.md`.
   - Прокси не только обходит блокировку `onrender.com`, но и **сам выставляет CORS**
     и отвечает на preflight `OPTIONS`. Поэтому ошибки `Failed to fetch` из-за
     настроек `ALLOWED_ORIGIN` на Render исчезают.
   - Проверка:
     ```bash
     node -e "fetch('https://accretion-api-proxy.buggipop.workers.dev/api/load',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://buggipop-pixel.github.io'},body:JSON.stringify({initData:'x'})}).then(async r=>console.log(r.status, r.headers.get('access-control-allow-origin'), await r.text()))"
     ```
     Ожидаемо: `401 * {"error":"Invalid initData"}` — CORS есть, запрос дошёл до сервера.
   - Если меняете код воркера — после Deploy прогоните `node tests/worker-proxy-test.js`.

1. **Свой домен через Cloudflare (если не хотите Workers).**
   - Домен на Cloudflare → CNAME `api.ваш-домен` → `accretion-game.onrender.com`,
     **Proxy status: Proxied** (оранжевое облако).
   - В Render → Settings → Custom Domain добавить `api.ваш-домен`.
   - В `js/cloudsave.js` заменить адрес по умолчанию на новый, либо задать игрокам
     без правки кода: `localStorage.setItem('accretion_cloud_api','https://api.ваш-домен')`
     (адрес читается из `accretion_cloud_api` / `window.__CLOUD_API__`).
   - Не забудьте CORS: в Render → Environment `ALLOWED_ORIGIN` должен содержать
     точный origin игры (например `https://buggipop-pixel.github.io`, без слэша на конце).
     Если переменная задана неверно, Render отвечает без `Access-Control-Allow-Origin`,
     и браузер блокирует ответы даже через прокси-домен.

2. **Перенести API на хост, доступный в регионе** (Deno Deploy,
   Vercel, VPS). Сервер — обычный Node/Express, переносится почти без изменений.

3. После смены адреса — проверить в логе строку
   `[CloudSave] API base: https://...` и успешный `POST /api/save → 200`.
