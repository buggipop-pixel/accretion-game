// ═══════════════════════════════════════════════════════════════
//  PUSH-PRESENCE TEST — TG-оповещения не должны теряться, пока игра
//  открыта, но игрок в неё не смотрит.
//
//  Реальный кейс: Telegram Desktop держит мини-апп отдельным окном.
//  Игрок уходит в чат — document.visibilityState остаётся 'visible',
//  и раньше игра считала его «онлайн», глуша пуши о вторжениях.
//
//  Запуск: node tests/push-presence-test.js
// ═══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const noop = () => {};
const cloudsaveCode = fs.readFileSync(path.join(__dirname, '../js/cloudsave.js'), 'utf8');

function makeStorage() {
  const data = Object.create(null);
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    clear: () => { for (const k in data) delete data[k]; },
  };
}

// «Устройство»: окно Telegram Desktop, где игру можно перекрыть чатом.
function makeDevice(opts) {
  const cfg = opts || {};
  const clock = { now: 1794243060000 };
  const windowListeners = Object.create(null);
  const requests = [];
  const focusState = { hasFocus: cfg.hasFocus !== false };

  class FakeDate extends Date {
    static now() { return clock.now; }
  }

  const documentMock = {
    visibilityState: cfg.visibilityState || 'visible',
    hidden: (cfg.visibilityState || 'visible') === 'hidden',
    addEventListener: noop,
    getElementById: () => ({ classList: { contains: () => false } }),
  };
  // Часть WebView вообще не умеет hasFocus(); часть — умеет.
  if (cfg.hasFocusApi !== false) documentMock.hasFocus = () => focusState.hasFocus;

  const windowMock = {
    Telegram: { WebApp: { initData: 'mock-init-data' } },
    location: { hash: '', search: '' },
    addEventListener(type, fn) {
      if (!windowListeners[type]) windowListeners[type] = [];
      windowListeners[type].push(fn);
    },
  };

  const context = {
    console: { log: noop, warn: noop, error: noop },
    document: documentMock,
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    fetch: async (url, init) => {
      requests.push({ url: String(url), body: init && init.body ? JSON.parse(String(init.body)) : null });
      return { ok: true, status: 200, json: async () => ({ ok: true, sent: 1 }) };
    },
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval: noop,
    AbortController: function () { this.signal = null; this.abort = noop; },
    Promise,
    JSON,
    Math,
    Date: FakeDate,
    S: { settings: { pushEnabled: true }, lastTick: clock.now },
    toast: noop,
    updateUI: noop,
    loadGame: noop,
  };
  context.window = windowMock;
  context.self = context;
  context.globalThis = context;

  vm.createContext(context);
  vm.runInContext(cloudsaveCode, context, { filename: 'cloudsave.js' });

  function fire(type) {
    const list = windowListeners[type] || [];
    for (let i = 0; i < list.length; i++) list[i]({ type: type });
  }

  return { context, clock, requests, fire, focusState };
}

let passed = 0;
let failed = 0;
function assert(name, condition, extra) {
  if (condition) { console.log('✅ ' + name); passed++; }
  else { console.error('❌ ' + name + (extra ? ' → ' + extra : '')); failed++; }
}

function presence(g) {
  return g.context.PlayerPresence || g.context.window.PlayerPresence;
}

async function push(g, text) {
  const before = g.requests.length;
  g.context.S.lastTick = g.clock.now;
  await g.context.sendPushNotification(text || '⚔️ <b>Вторжение!</b>', 'invasion');
  return g.requests.length > before;
}
(async () => {
  // 1. Игра в фокусе, игрок только что действовал → пуш не нужен.
  {
    const g = makeDevice({ visibilityState: 'visible' });
    g.fire('focus');
    g.clock.now += 5000;
    g.fire('pointermove');
    const sent = await push(g);
    assert('1. Фокус + свежая активность: пуш не отправляется', sent === false);
    assert('1. Игрок считается онлайн', g.context.isPlayerOnlineForPush() === true);
  }

  // 2. Игра видима, но окно потеряло фокус (игрок ушёл в чат Telegram) → пуш!
  {
    const g = makeDevice({ visibilityState: 'visible' });
    g.fire('focus');
    g.clock.now += 5000;
    g.fire('mousemove');
    g.clock.now += 10 * 1000;
    g.fire('blur');                       // клик по окну Telegram
    assert('2. Потеря фокуса: игрок НЕ онлайн', g.context.isPlayerOnlineForPush() === false);
    const sent = await push(g);
    assert('2. Потеря фокуса: пуш о вторжении отправлен', sent === true);
    assert('2. Запрос ушёл в /api/notify',
      g.requests.some((r) => r.url.indexOf('/api/notify') !== -1));
  }

  // 3. Окно в фокусе, но игрок отошёл (нет действий дольше 10 минут) → пуш!
  {
    const g = makeDevice({ visibilityState: 'visible' });
    g.fire('focus');
    g.clock.now += 11 * 60 * 1000;        // 11 минут без действий
    const sent = await push(g);
    assert('3. Простой дольше 10 минут: пуш отправлен', sent === true);
  }

  // 4. Вернулся и подействовал — снова «онлайн», пуш не шлём.
  {
    const g = makeDevice({ visibilityState: 'visible' });
    g.fire('focus');
    g.clock.now += 11 * 60 * 1000;
    g.fire('pointerdown');
    g.clock.now += 5 * 1000;
    const sent = await push(g);
    assert('4. Активность после простоя: пуш не отправляется', sent === false);
  }

  // 5. Вкладка скрыта — пуш всегда (поведение не изменилось).
  {
    const g = makeDevice({ visibilityState: 'hidden' });
    g.fire('focus');
    g.clock.now += 1000;
    g.fire('keydown');
    const sent = await push(g);
    assert('5. Скрытая вкладка: пуш отправлен', sent === true);
  }

  // 6. WebView без событий focus/blur, hasFocus() = false → не онлайн.
  {
    const g = makeDevice({ visibilityState: 'visible' });
    g.focusState.hasFocus = false;
    assert('6. hasFocus()=false: игрок НЕ онлайн', g.context.isPlayerOnlineForPush() === false);
    const sent = await push(g);
    assert('6. hasFocus()=false: пуш отправлен', sent === true);
  }

  // 7. hasFocus() недоступен + свежая активность → онлайн (без ложных пушей).
  {
    const g = makeDevice({ visibilityState: 'visible', hasFocusApi: false });
    g.clock.now += 5000;
    g.context.window.__markPushActivity();
    g.clock.now += 1000;
    const sent = await push(g);
    assert('7. Нет hasFocus(): активный игрок онлайн, пуша нет', sent === false);
  }

  // 8. Пуш всё ещё уважает выключенные уведомления в настройках.
  {
    const g = makeDevice({ visibilityState: 'hidden' });
    g.context.S.settings.pushEnabled = false;
    const sent = await push(g);
    assert('8. pushEnabled=false: пуш не отправляется', sent === false);
  }

  // 9. Статус присутствия: публичный API и лимит простоя 10 минут.
  {
    const g = makeDevice({ visibilityState: 'visible' });
    const P = presence(g);
    assert('9. PlayerPresence доступен', P && typeof P.state === 'function');
    assert('9. Лимит простоя = 10 минут', P.idleLimitMs === 10 * 60 * 1000);
    assert('9. Свежий игрок: статус online', P.status() === 'online' && P.isOnline() === true);
  }

  // 10. Через 10 минут бездействия статус становится offline с причиной.
  {
    const g = makeDevice({ visibilityState: 'visible' });
    g.fire('focus');
    g.clock.now += 10 * 60 * 1000 + 1000;
    const st = presence(g).state();
    assert('10. Простой: статус offline', st.online === false && st.status === 'offline');
    assert('10. Причина — нет действий', st.reason === 'idle', st.reason);
    assert('10. Подпись содержит «Офлайн»', presence(g).label().indexOf('Офлайн') === 0);
  }

  // 11. Смена статуса шлёт подписчикам ровно один переход online→offline.
  {
    const g = makeDevice({ visibilityState: 'visible' });
    g.fire('focus');
    const events = [];
    const off = presence(g).onChange(function (st) { events.push(st.status); });
    presence(g).state();
    assert('11. Онлайн не шлёт событие без смены статуса', events.length === 0);
    g.clock.now += 11 * 60 * 1000;
    presence(g).state();
    presence(g).state();
    assert('11. Переход online→offline ровно один раз', events.length === 1 && events[0] === 'offline',
      JSON.stringify(events));
    g.clock.now += 5000;
    g.context.S.lastTick = g.clock.now;   // в игре цикл снова тикает
    g.context.window.__markPushActivity();
    presence(g).state();
    assert('11. Активность возвращает online', events.length === 2 && events[1] === 'online',
      JSON.stringify(events));
    if (typeof off === 'function') off();
    g.clock.now += 11 * 60 * 1000;
    presence(g).state();
    assert('11. После отписки событий нет', events.length === 2);
  }

  // 12. Скрытое окно/потеря фокуса — сразу offline, без ожидания 10 минут.
  {
    const g = makeDevice({ visibilityState: 'visible' });
    g.fire('focus');
    g.clock.now += 1000;
    g.fire('blur');
    const st = presence(g).state();
    assert('12. Потеря фокуса: статус offline', st.online === false && st.reason === 'blur');
  }

  // 13. Скрытая вкладка даёт причину hidden.
  {
    const g = makeDevice({ visibilityState: 'hidden' });
    const st = presence(g).state();
    assert('13. Скрытая вкладка: причина hidden', st.online === false && st.reason === 'hidden');
  }

  // 14. Отчёт о присутствии уходит на сервер (его читает админка).
  {
    const g = makeDevice({ visibilityState: 'visible' });
    g.fire('focus');
    g.clock.now += 5000;
    g.fire('pointermove');
    await g.context.reportPresence(true);
    const onlineReq = g.requests.filter((r) => r.url.indexOf('/api/presence') !== -1).pop();
    assert('14. Отчёт online уходит в /api/presence',
      !!onlineReq && onlineReq.body.status === 'online', onlineReq && JSON.stringify(onlineReq.body));
    assert('14. В отчёте есть причина и idleSec',
      !!onlineReq && onlineReq.body.reason === 'active' && typeof onlineReq.body.idleSec === 'number');

    g.clock.now += 10 * 1000;
    g.fire('blur');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const offlineReq = g.requests.filter((r) => r.url.indexOf('/api/presence') !== -1).pop();
    assert('14. При blur уходит offline с причиной',
      !!offlineReq && offlineReq.body.status === 'offline' && offlineReq.body.reason === 'blur',
      offlineReq && JSON.stringify(offlineReq.body));
  }

  // 15. Вне Telegram отчёт не отправляется (некуда — нет initData).
  {
    const g = makeDevice({ visibilityState: 'visible', hasFocus: false });
    g.context.window.Telegram = undefined;
    const sent = await g.context.reportPresence(true);
    assert('15. Без initData отчёт не уходит', sent === false &&
      !g.requests.some((r) => r.url.indexOf('/api/presence') !== -1));
  }

  console.log('\n' + (failed === 0 ? 'Все проверки пройдены' : 'Провалено: ' + failed) +
    ' (' + passed + '/' + (passed + failed) + ')');
  if (failed > 0) process.exitCode = 1;
})();
