// ═══════════════════════════════════════════════════════════════
//  DEBUG-LOG.JS — локальный диагностический лог игры.
//
//  Зачем: на телефоне (Telegram WebView) нельзя открыть консоль,
//  поэтому пишем полный лог сюда:
//    • все console.log/warn/error;
//    • необработанные ошибки и promise-отклонения;
//    • ВСЕ сетевые запросы (URL, метод, код ответа, тело при ошибке);
//    • окружение (версия Telegram, стадия игры, состояние синка).
//
//  Лог живёт в localStorage и переживает перезагрузку. При новом
//  входе прошлая сессия сохраняется отдельно (accretion_debug_log_prev_v1),
//  так что причину «сломалось после перезапуска» тоже видно.
//
//  Доступ в игре: Настройки → 📄 Логи и диагностика.
//  Из консоли: getGameLog() / copyGameLog() / downloadGameLog().
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';
  if (window.__debugLogInstalled) return;
  window.__debugLogInstalled = true;

  const LOG_KEY = 'accretion_debug_log_v1';
  const PREV_KEY = 'accretion_debug_log_prev_v1';
  const MAX_CHARS = 300 * 1024;
  const SESSION_MAX_LINES = 4000;

  const buf = [];
  let dirty = false;
  let persistTimer = null;
  let _startedAt = Date.now();

  function iso() { try { return new Date().toISOString(); } catch (e) { return String(Date.now()); } }

  function safeStr(a) {
    try {
      if (a instanceof Error) return (a.stack || a.message || String(a));
      if (typeof a === 'object' && a !== null) {
        const s = JSON.stringify(a);
        return s.length > 2000 ? s.slice(0, 2000) + '…' : s;
      }
      const s = String(a);
      return s.length > 2000 ? s.slice(0, 2000) + '…' : s;
    } catch (e) { return '[unserializable]'; }
  }

  function push(level, args) {
    let msg;
    try { msg = Array.prototype.map.call(args, safeStr).join(' '); }
    catch (e) { msg = '[log error]'; }
    buf.push(iso() + ' [' + level + '] ' + msg);
    if (buf.length > SESSION_MAX_LINES) buf.splice(0, buf.length - SESSION_MAX_LINES);
    dirty = true;
    schedulePersist();
  }

  function schedulePersist() {
    if (persistTimer) return;
    persistTimer = setTimeout(function () { persistTimer = null; persist(); }, 1500);
  }

  function persist() {
    if (!dirty) return;
    dirty = false;
    try {
      let text = buf.join('\n');
      if (text.length > MAX_CHARS) text = '…[обрезано начало]…\n' + text.slice(text.length - MAX_CHARS);
      localStorage.setItem(LOG_KEY, text);
    } catch (e) { /* квота/недоступно — не мешаем игре */ }
  }

  // ── 0. Ротация: прошлую сессию сохраняем отдельно ─────────────
  try {
    const existing = localStorage.getItem(LOG_KEY);
    if (existing) localStorage.setItem(PREV_KEY, existing);
  } catch (e) { /* ignore */ }

  // ── 1. Перехват console ──────────────────────────────────────
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (lvl) {
    const orig = (console[lvl] && console[lvl].bind(console)) || function () {};
    console[lvl] = function () {
      try { push(lvl, arguments); } catch (e) { /* ignore */ }
      return orig.apply(null, arguments);
    };
  });

  // ── 2. Глобальные ошибки ─────────────────────────────────────
  window.addEventListener('error', function (e) {
    push('uncaught', [
      (e && e.message) || 'error',
      '@', (e && e.filename) || '?', ':', (e && e.lineno) || '?', ':', (e && e.colno) || '?'
    ]);
  });
  window.addEventListener('unhandledrejection', function (e) {
    const r = e && e.reason;
    push('unhandledrejection', [r && (r.stack || r.message) || String(r)]);
  });

  // ── 3. Перехват fetch (все запросы к серверу) ────────────────
  if (typeof window.fetch === 'function') {
    const origFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      const url = (typeof input === 'string') ? input : ((input && input.url) || '');
      const method = String(((init && init.method) || (input && input.method) || 'GET')).toUpperCase();
      const t0 = Date.now();
      const p = origFetch(input, init);
      p.then(function (res) {
        const dt = Date.now() - t0;
        // тело читаем только для важных/ошибочных ответов и всегда обрезаем
        const wantBody = !res.ok || /\/api\/(save|load|action|reward|claim|buy-booster|reset-ack|notify|leaderboard)/.test(url);
        if (wantBody) {
          try {
            res.clone().text().then(function (txt) {
              push('net', [method, url, '→', res.status, dt + 'ms', String(txt || '').slice(0, 400)]);
            }).catch(function () {
              push('net', [method, url, '→', res.status, dt + 'ms', '[body unreadable]']);
            });
          } catch (e) {
            push('net', [method, url, '→', res.status, dt + 'ms']);
          }
        } else {
          push('net', [method, url, '→', res.status, dt + 'ms']);
        }
      }, function (err) {
        push('net', [method, url, '→ ERROR', (err && err.message) || String(err), (Date.now() - t0) + 'ms']);
      });
      return p;
    };
  }

  // ── 4. Сохранение при уходе/скрытии ──────────────────────────
  window.addEventListener('pagehide', persist);
  window.addEventListener('beforeunload', persist);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') persist();
  });
  setInterval(function () { if (dirty) persist(); }, 5000);

  // ── 5. Окружение ─────────────────────────────────────────────
  try {
    const tg = window.Telegram && window.Telegram.WebApp;
    push('env', [
      'ua=' + navigator.userAgent,
      'tg=' + (tg ? (tg.version || '?') : 'no'),
      'platform=' + (tg ? (tg.platform || '?') : '?'),
      'href=' + String(location.href).slice(0, 200),
      'ver=' + (typeof GAME_VERSION === 'string' ? GAME_VERSION + ' (' + GAME_BUILD + ')' : '?')
    ]);
  } catch (e) { /* ignore */ }

  // ── 6. Публичный API ─────────────────────────────────────────
  function getCombinedLog() {
    persist();
    let cur = '';
    let prev = '';
    try { cur = localStorage.getItem(LOG_KEY) || ''; } catch (e) { cur = ''; }
    try { prev = localStorage.getItem(PREV_KEY) || ''; } catch (e) { prev = ''; }
    if (!cur) cur = buf.join('\n');
    return '===== ТЕКУЩАЯ СЕССИЯ =====\n' + cur +
      '\n\n===== ПРЕДЫДУЩАЯ СЕССИЯ =====\n' + (prev || '(нет)');
  }

  function copyLog() {
    const text = getCombinedLog();
    function done() { if (typeof toast === 'function') toast('📋 Логи скопированы', 'Вставьте в чат или заметки'); }
    function fallback() {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
        done();
      } catch (e) {
        if (typeof toast === 'function') toast('⚠️ Не удалось скопировать', 'Нажмите «Файл»');
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else { fallback(); }
  }

  function downloadLog() {
    const text = getCombinedLog();
    try {
      const blob = new Blob([text], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'accretion-log-' + iso().replace(/[:.]/g, '-') + '.txt';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { try { URL.revokeObjectURL(a.href); } catch (e) {} }, 5000);
      if (typeof toast === 'function') toast('💾 Файл лога', 'Если не сохранился — используйте «Копировать»');
    } catch (e) { copyLog(); }
  }

  function openDebugLog() {
    const modal = document.getElementById('debugLogModal');
    const pre = document.getElementById('debugLogText');
    if (!modal || !pre) { copyLog(); return; }
    pre.value = getCombinedLog();
    modal.classList.add('show');
    try { pre.scrollTop = pre.scrollHeight; } catch (e) {}
  }

  window.getGameLog = getCombinedLog;
  window.copyGameLog = copyLog;
  window.downloadGameLog = downloadLog;
  window.openDebugLog = openDebugLog;
  window.__debugLog = { push: push, persist: persist, get: getCombinedLog };
})();
