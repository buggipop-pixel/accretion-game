// ═══════════════════════════════════════════════════════════════
//  NOTIFY LIFECYCLE TEST — сообщения не должны теряться при уходе
//  со страницы и при временно недоступной отправке.
//  Запуск: node tests/notify-lifecycle-test.js
// ═══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;
function assert(name, cond, extra) {
  if (cond) { console.log('✅ ' + name); passed++; }
  else { console.error('❌ ' + name + (extra ? ' → ' + extra : '')); failed++; }
}

const code = fs.readFileSync(path.join(__dirname, '../js/notifications.js'), 'utf8');

function makeGame() {
  const sent = [];
  const timers = [];
  const winListeners = {};
  const docListeners = {};

  const context = {
    console: console,
    JSON, Math, Date, String, Number, Array, Object, Set,
    setTimeout: function (fn, ms) {
      const t = { fn: fn, ms: ms, cancelled: false };
      timers.push(t);
      return t;
    },
    clearTimeout: function (t) { if (t) t.cancelled = true; },
    document: {
      visibilityState: 'visible',
      addEventListener: function (type, fn) {
        (docListeners[type] = docListeners[type] || []).push(fn);
      },
    },
    S: { settings: { pushEnabled: true } },
    fmt: function (n) { return String(Math.round(Number(n) || 0)); },
    sendPushNotification: function (message, type) { sent.push({ message: message, type: type }); },
  };
  context.window = context;
  context.addEventListener = function (type, fn) {
    (winListeners[type] = winListeners[type] || []).push(fn);
  };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: 'notifications.js' });

  function fire(type) {
    const list = winListeners[type] || [];
    for (let i = 0; i < list.length; i++) list[i]({ type: type });
  }
  function runTimers() {
    const list = timers.splice(0, timers.length);
    for (let i = 0; i < list.length; i++) {
      if (!list[i].cancelled) list[i].fn();
    }
  }
  return { context, sent, timers, fire, runTimers, winListeners, docListeners };
}

(function run() {
  console.log('🧪 ТЕСТЫ ЖИЗНЕННОГО ЦИКЛА ОПОВЕЩЕНИЙ');

  // 1. Обычная очередь: событие уходит после flushMs.
  {
    const g = makeGame();
    g.context.notifyEvent('fleet', 'Флот завершил действие', ['строка'], { key: 'f1' });
    assert('1. До flush ничего не отправлено', g.sent.length === 0);
    assert('1. Таймер flush запланирован', g.timers.length === 1);
    g.runTimers();
    assert('1. После flush сообщение отправлено', g.sent.length === 1);
  }

  // 2. pagehide сбрасывает очередь сразу — ничего не теряется.
  {
    const g = makeGame();
    g.context.notifyEvent('invasion', 'Вторжение!', ['цель'], { key: 'i1' });
    assert('2. Событие в очереди, но ещё не отправлено', g.sent.length === 0);
    g.fire('pagehide');
    assert('2. pagehide: пуш отправлен немедленно', g.sent.length === 1);
    assert('2. Очередь не продублирована таймером', g.timers.every((t) => t.cancelled));
  }

  // 3. Скрытие вкладки тоже сбрасывает очередь.
  {
    const g = makeGame();
    g.context.notifyEvent('event', 'Событие', ['x'], { key: 'e1' });
    g.context.document.visibilityState = 'hidden';
    const list = g.docListeners['visibilitychange'] || [];
    for (let i = 0; i < list.length; i++) list[i]({ type: 'visibilitychange' });
    assert('3. visibilitychange=hidden: пуш отправлен', g.sent.length === 1);
  }

  // 4. Если отправка временно недоступна — очередь НЕ выбрасывается.
  {
    const g = makeGame();
    const original = g.context.sendPushNotification;
    g.context.notifyEvent('fleet', 'Флот', ['x'], { key: 'f4' });
    g.context.sendPushNotification = undefined;
    g.context.notifyFlushNow();
    assert('4. Без sendPushNotification пуш не ушёл', g.sent.length === 0);
    g.context.sendPushNotification = original;
    g.context.notifyFlushNow();
    assert('4. Очередь сохранена и ушла после восстановления', g.sent.length === 1);
  }

  // 5. Потолок очереди: сотни строк не копятся.
  {
    const g = makeGame();
    for (let i = 0; i < 50; i++) {
      g.context.notifyEvent('fleet', 'Событие ' + i, ['x']);
    }
    g.runTimers();
    assert('5. Отправлено не больше лимита очереди за один flush', g.sent.length <= 8,
      'sent=' + g.sent.length);
  }

  // 6. pushEnabled=false: очередь очищается, пуши не идут.
  {
    const g = makeGame();
    g.context.S.settings.pushEnabled = false;
    g.context.notifyEvent('fleet', 'Флот', ['x']);
    g.runTimers();
    assert('6. pushEnabled=false: пуш не отправлен', g.sent.length === 0);
  }

  console.log('========================================');
  console.log('ИТОГО: Пройдено ' + passed + ', Провалено ' + failed);
  console.log('========================================');
  if (failed > 0) process.exit(1);
})();
