// ═══════════════════════════════════════════════════════════════
//  CLOUDSAVE.JS — Облачные сохранения (Render + Telegram initData)
//
//  Принципы:
//   1. Облако — единственный источник правды. Время и версию сейва
//      выдаёт СЕРВЕР (saved_at / version). Часы телефона, ПК и планшета
//      не сравниваются между собой — именно это раньше заставляло
//      устройства затирать прогресс друг друга.
//   2. Без Telegram облако полностью отключено: ни загрузки, ни
//      сохранения, ни «фантомных» сейвов из обычного браузера.
//   3. При старте, если на сервере есть сейв, он применяется всегда.
// ═══════════════════════════════════════════════════════════════

// Адрес сервера (Render)
const CLOUD_API = 'https://accretion-game.onrender.com';

// Автосинхронизация при старте и автосохранение в облако
const CLOUD_AUTOSYNC = true;
const CLOUD_AUTOSAVE_MS = 60 * 1000;
// Сервер принимает не чаще 1 save / 5 c и не больше 300 в час.
// 12.5 c — максимум 288 сохранений в час, поэтому 429 не появляется.
const CLOUD_SAVE_MIN_INTERVAL_MS = 12500;
const CLOUD_SYNC_FLAG = 'accretion_cloud_synced';
const CLOUD_RESET_FLAG = 'accretion_reset_pending';
const CLOUD_VER_KEY = 'accretion_cloud_version';
const CLOUD_BACKUP_KEY = 'accretion_local_backup';
// ★ После «Сброса» облако нельзя восстанавливать, пока чистый сейв не уйдёт
// на сервер. Флаг живёт в sessionStorage и переживает location.reload().
const CLOUD_RESET_SKIP_KEY = 'accretion_reset_skip_cloud';
// ★ Есть локальные изменения, которые ещё не подтверждены сервером.
// Если save вернул 400/500/сеть, при следующем старте НЕ перетираем
// этот прогресс старым облаком, а сначала пробуем отправить его.
const CLOUD_DIRTY_KEY = 'accretion_cloud_dirty';
// Сколько запросов сохранения сейчас в полёте (чтобы опрос не принял
// свой же сейв за чужой и чтобы saveGame() не ушёл в рекурсию).
let _cloudSaveInFlight = 0;
// true только на время внутреннего saveGame() внутри cloudSaveGame(),
// чтобы он не запускал бесконечную цепочку ретраев.
let _cloudSaveInternal = false;

// ★ Версия облачного сейва — общий монотонный счётчик сервера.
function getCloudVersion() {
  try { return Number(localStorage.getItem(CLOUD_VER_KEY)) || 0; } catch (e) { return 0; }
}
function setCloudVersion(v) {
  try { localStorage.setItem(CLOUD_VER_KEY, String(Number(v) || 0)); } catch (e) { /* ignore */ }
}

function markCloudDirty() {
  try {
    // В обычном браузере облака нет — не создаём «грязный» флаг.
    if (!hasTelegramLaunchContext()) return;
    localStorage.setItem(CLOUD_DIRTY_KEY, '1');
  } catch (e) { /* ignore */ }
}

function clearCloudDirty() {
  try { localStorage.removeItem(CLOUD_DIRTY_KEY); } catch (e) { /* ignore */ }
}

function isCloudDirty() {
  try { return localStorage.getItem(CLOUD_DIRTY_KEY) === '1'; } catch (e) { return false; }
}

// ─── Вспомогательные функции ────────────────────────────────────
function getSaveKey() {
  try {
    return SAVE_KEY; // из state.js
  } catch (e) {
    return 'accretion_v17'; // запасной ключ, если state.js ещё не загружен
  }
}

// ★ Мы внутри Telegram, даже если SDK ещё не успел загрузиться?
// Telegram добавляет tgWebAppData в hash — это надёжный признак мини-приложения.
function hasTelegramLaunchContext() {
  try {
    // initData уже есть — мы точно в Telegram.
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) return true;
    const loc = window.location || {};
    const haystack = String(loc.hash || '') + '&' + String(loc.search || '');
    return haystack.indexOf('tgWebAppData') !== -1;
  } catch (e) {
    return false;
  }
}

// SDK может быть загружен и в обычном браузере — сам по себе он не доказывает,
// что игра открыта внутри Telegram.
function hasTelegramSdk() {
  try {
    return !!(window.Telegram && window.Telegram.WebApp);
  } catch (e) {
    return false;
  }
}

// ★ Запасной путь: если CDN с Telegram SDK не загрузился (например, блокировка),
// initData можно достать прямо из URL мини-приложения. Подпись всё равно
// проверяет сервер, поэтому подменить её нельзя.
function getInitDataFromUrl() {
  try {
    const loc = window.location || {};
    const sources = [String(loc.hash || ''), String(loc.search || '')];
    for (let i = 0; i < sources.length; i++) {
      let s = sources[i];
      if (s.charAt(0) === '#' || s.charAt(0) === '?') s = s.slice(1);
      const parts = s.split('&');
      for (let j = 0; j < parts.length; j++) {
        const eq = parts[j].indexOf('=');
        if (eq === -1) continue;
        if (parts[j].slice(0, eq) !== 'tgWebAppData') continue;
        return decodeURIComponent(parts[j].slice(eq + 1));
      }
    }
  } catch (e) { /* ignore */ }
  return '';
}

function getTgInitData() {
  try {
    const tg = window.Telegram;
    if (tg && tg.WebApp && tg.WebApp.initData) {
      return String(tg.WebApp.initData);
    }
  } catch (e) { /* ignore */ }

  // SDK мог быть заблокирован — пробуем данные из URL.
  return getInitDataFromUrl();
}

function isTelegramEnvironment() {
  return hasTelegramLaunchContext() && !!getTgInitData();
}

function isCloudAvailable() {
  return isTelegramEnvironment();
}

// Ждём, пока Telegram внедрит initData (обычно 100–500 мс, но бывает дольше).
function waitForTgInitData(timeoutMs) {
  const limit = typeof timeoutMs === 'number' ? timeoutMs : 2000;
  return new Promise(function(resolve) {
    const started = Date.now();
    (function poll() {
      const data = getTgInitData();
      if (data) return resolve(data);
      if (Date.now() - started >= limit) return resolve('');
      setTimeout(poll, 200);
    })();
  });
}

// Показываем уведомление один раз, чтобы main.js + load не дублировали тосты.
function showCloudNotice(key, title, message) {
  try {
    if (window[key]) return;
    window[key] = true;
  } catch (e) { /* ignore */ }
  if (typeof toast === 'function') toast(title, message);
}

// ★ Сброс аккаунта администратором. Сервер отдаёт пустое облако с reset:true
// и не принимает сейв, пока клиент не подтвердит, что стёр локальный прогресс.
// Иначе старый локальный сейв «воскресил» бы удалённый аккаунт.
function wipeLocalProgress() {
  try {
    localStorage.removeItem(getSaveKey());
    localStorage.removeItem(CLOUD_VER_KEY);
    localStorage.removeItem(CLOUD_BACKUP_KEY);
    localStorage.removeItem(CLOUD_DIRTY_KEY);
    localStorage.removeItem(REWARD_BASELINE_KEY);
  } catch (e) { /* ignore */ }
}

async function ackAccountReset(initData) {
  try {
    const res = await fetch(CLOUD_API + '/api/reset-ack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
    });
    if (!res.ok) return false;
    const json = await res.json().catch(function() { return null; });
    return !!(json && json.ok);
  } catch (e) {
    console.warn('[cloudsave] reset-ack failed:', e.message);
    return false;
  }
}

// Чистим локальный прогресс, подтверждаем сброс на сервере и начинаем заново.
async function applyAccountReset(initData) {
  const acked = await ackAccountReset(initData);
  window.__resetHandled = true;

  wipeLocalProgress();
  showCloudNotice('__accountResetShown', '♻️ Аккаунт сброшен',
    'Администратор удалил прогресс. Начинаем новую игру.');

  // resetGame() чистит сейв, сбрасывает состояние и перезагружает страницу.
  try {
    if (typeof resetGame === 'function') {
      resetGame();
      return acked;
    }
  } catch (e) { /* ignore */ }

  try { window.location.reload(); } catch (e) { /* ignore */ }
  return acked;
}
// ★ Сброс прогресса в процессе? (флаг живёт в памяти и переживает перезагрузку в localStorage)
function isResetInProgress() {
  try {
    if (window.isResetting) return true;
    if (typeof S !== 'undefined' && S && S.isResetting) return true;
    if (window.S && window.S.isResetting) return true;
  } catch (e) { /* ignore */ }
  try {
    return localStorage.getItem(CLOUD_RESET_FLAG) === '1';
  } catch (e) {
    return false;
  }
}

function readLocalSave() {
  try {
    const raw = localStorage.getItem(getSaveKey());
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeLocalSave(data) {
  try {
    localStorage.setItem(getSaveKey(), JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn('[cloudsave] не удалось записать локальный сейв', e);
    return false;
  }
}

function localSavedAt() {
  const local = readLocalSave();
  return (local && typeof local.lastTick === 'number') ? local.lastTick : 0;
}

// Версия сейва, которую вернул сервер (0 — если её нет)
function cloudVersionFrom(json) {
  return (json && typeof json.version === 'number') ? json.version : 0;
}

// Битый/пустой облачный сейв не должен затирать прогресс
function isValidCloudSave(data) {
  return !!data && typeof data === 'object' && !!data.stage && !!data.lastTick;
}

// ★ Порядок фаз нужен только для одной защиты: если серверная версия
// не выросла, а локальный прогресс заметно выше облачного, значит локальный
// сейв не успел уйти на сервер (например, save падал с 400). Не откатываем его.
const CLOUD_STAGE_ORDER = ['cloud', 'condense', 'protostar', 'firstPlanet', 'system', 'galaxy'];

function cloudStageRank(stage) {
  const idx = CLOUD_STAGE_ORDER.indexOf(String(stage || ''));
  return idx < 0 ? 0 : idx;
}

function localProgressIsAhead(local, cloud) {
  if (!local || !cloud) return false;

  const localStage = cloudStageRank(local.stage);
  const cloudStage = cloudStageRank(cloud.stage);
  if (localStage !== cloudStage) return localStage > cloudStage;

  const localPrestige = Number(local.prestigeLevel) || 0;
  const cloudPrestige = Number(cloud.prestigeLevel) || 0;
  if (localPrestige !== cloudPrestige) return localPrestige > cloudPrestige;

  const localGalaxies = Number(local.galaxies) || 0;
  const cloudGalaxies = Number(cloud.galaxies) || 0;
  if (localGalaxies !== cloudGalaxies) return localGalaxies > cloudGalaxies;

  const localSystems = Number(local.totalSystemsCreated) || 0;
  const cloudSystems = Number(cloud.totalSystemsCreated) || 0;
  if (localSystems !== cloudSystems) return localSystems > cloudSystems;

  // dustTotal — накопленная пыль, её нельзя «потратить», поэтому она хорошо
  // показывает, что прогресс не откатился.
  const localTotal = Number(local.dustTotal) || 0;
  const cloudTotal = Number(cloud.dustTotal) || 0;
  return localTotal > cloudTotal * 2 + 1000000;
}

// Страховка: перед заменой локального сейва облачным сохраняем предыдущий
function backupLocalSave() {
  try {
    const prev = localStorage.getItem(getSaveKey());
    if (!prev) return;

    const existing = localStorage.getItem(CLOUD_BACKUP_KEY);
    // ★ Не затираем хороший бэкап более слабым сейвом: иначе после
    // нескольких запусков единственная копия старого прогресса исчезнет.
    if (existing) {
      try {
        const prevData = JSON.parse(prev);
        const oldData = JSON.parse(existing);
        if (oldData && !localProgressIsAhead(prevData, oldData)) return;
      } catch (e) { /* битый бэкап — заменяем */ }
    }

    localStorage.setItem(CLOUD_BACKUP_KEY, prev);
  } catch (e) { /* нет места — не критично */ }
}

// Сейв из облака — тоже недоверенные данные (его мог записать
// подменённый клиент). Чистим опасные ключи и ограничиваем глубину.
const CLOUD_BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function sanitizeCloudSave(value, depth) {
  const d = depth || 0;
  if (d > 12) return null;
  if (value === null) return null;

  const t = typeof value;
  if (t === 'number') return isFinite(value) ? value : 0;
  if (t === 'string' || t === 'boolean') return value;
  if (t !== 'object') return null;

  if (Array.isArray(value)) {
    const arr = [];
    const n = Math.min(value.length, 5000);
    for (let i = 0; i < n; i++) arr.push(sanitizeCloudSave(value[i], d + 1));
    return arr;
  }

  const out = {};
  const keys = Object.keys(value);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (CLOUD_BAD_KEYS.has(k)) continue;
    out[k] = sanitizeCloudSave(value[k], d + 1);
  }
  return out;
}

function applyCloudSaveAuthoritative(cloudData) {
  const safe = sanitizeCloudSave(cloudData);
  backupLocalSave();
  return applyCloudSaveToRuntime(safe || cloudData);
}

// ★ Применение серверного сейва ВНУТРИ cloudSaveGame(). loadGame() может
// вызвать checkAchievements() → saveGame(), и без этого флага мы бы
// запланировали ещё один save из самого процесса save.
function applyCloudSaveInternal(cloudData) {
  const prev = _cloudSaveInternal;
  _cloudSaveInternal = true;
  try {
    return applyCloudSaveAuthoritative(cloudData);
  } finally {
    _cloudSaveInternal = prev;
  }
}

// ─── Сетевой слой ───────────────────────────────────────────────
async function cloudApi(path, payload) {
  const res = await fetch(CLOUD_API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) {
    const msg = (data && data.error) ? data.error : ('HTTP ' + res.status);
    const err = new Error(msg);
    err.status = res.status;
    if (data && data.code) err.code = data.code;
    throw err;
  }
  return data;
}

// ─── keepalive: лимит 64 KiB и ретрай без keepalive ─────────────
// Chrome / Telegram WebView отклоняют keepalive-запрос с телом больше
// 64 KiB МГНОВЕННО: fetch реджектится TypeError, в Network видно
// status 0 / size 0. Поэтому большие сейвы шлём обычным fetch, а если
// keepalive всё-таки упал на сети — один раз повторяем без него.
const CLOUD_KEEPALIVE_MAX_BYTES = 60 * 1024; // запас до лимита 64 KiB

function utf8ByteLength(str) {
  const s = String(str == null ? '' : str);
  try {
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(s).length;
  } catch (e) { /* ниже фолбэк */ }
  // Фолбэк: UTF-16 code unit в UTF-8 занимает не больше 3 байт.
  return s.length * 3;
}

function canUseKeepalive(bodyBytes) {
  return bodyBytes > 0 && bodyBytes <= CLOUD_KEEPALIVE_MAX_BYTES;
}

async function postCloudSave(body, keepalive) {
  const bytes = utf8ByteLength(body);
  const url = CLOUD_API + '/api/save';
  function request(withKeepalive) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body,
      keepalive: !!withKeepalive,
    });
  }
  try {
    const res = await request(keepalive);
    console.log('[CloudSave] POST /api/save', { bytes: bytes, keepalive: !!keepalive, status: res.status });
    return res;
  } catch (e) {
    console.warn('[CloudSave] POST /api/save failed',
      { bytes: bytes, keepalive: !!keepalive, error: (e && e.message) || String(e) });
    if (!keepalive) throw e;
    // keepalive не должен ломать сохранение — один повтор обычным fetch.
    console.warn('[CloudSave] повтор POST /api/save без keepalive');
    const res = await request(false);
    console.log('[CloudSave] POST /api/save (retry)', { bytes: bytes, keepalive: false, status: res.status });
    return res;
  }
}

// ─── Сохранить в облако ─────────────────────────────────────────
async function cloudSaveGame(options) {
  if (isResetInProgress()) return { ok: false, error: 'resetting' }; // ★ не сохраняем во время сброса
  const initData = getTgInitData();
  if (!initData) return { ok: false, error: 'not-telegram' };
  // Параллельные сохранения не нужны: сервер всё равно ответит 409/429.
  if (_cloudSaveInFlight > 0) return { ok: false, error: 'in-flight' };

  // ★ keepalive ТОЛЬКО при явном запросе (beforeunload / закрытие вкладки).
  // Обычное автосохранение идёт без keepalive, чтобы не падать на лимите 64 KiB.
  const wantKeepalive = !!(options && options.keepalive === true);
  _cloudSaveInFlight++;
  try {
    // ★ saveGame() сам вызовет autoSaveToCloud(true); защита от рекурсии —
    // проверка _cloudSaveInFlight в autoSaveToCloud().
    _cloudSaveInternal = true;
    try {
      if (typeof saveGame === 'function') saveGame();
    } finally {
      _cloudSaveInternal = false;
    }

    // ★ В режиме кошелька сначала сообщаем серверу о «прочем» доходе.
    if (window.__serverWallet) {
      try { await reportRewards(); } catch (e) { /* отчёт не критичен */ }
    }

    const saveData = readLocalSave();
    if (!saveData) return { ok: false, error: 'no-save' };

    const baseVersion = getCloudVersion();
    // ★ Тело собираем ОДИН раз: размер нужен, чтобы решить про keepalive.
    const body = JSON.stringify({ initData, saveData, baseVersion });
    const bodyBytes = utf8ByteLength(body);
    const keepalive = wantKeepalive && canUseKeepalive(bodyBytes);
    if (wantKeepalive && !keepalive) {
      console.log('[CloudSave] сейв большой (' + bodyBytes + ' B > ' +
        CLOUD_KEEPALIVE_MAX_BYTES + ' B): keepalive выключен');
    }
    const response = await postCloudSave(body, keepalive);
    // ★ КОНФЛИКТ: на сервере уже новее (играли с другого устройства).
    if (response.status === 409) {
      const conflict = await response.json().catch(function() { return null; });
      const cloud = conflict && conflict.data;
      if (conflict && conflict.authoritative) window.__serverWallet = true;

      const serverVersion = cloudVersionFrom(conflict);
      setCloudVersion(serverVersion);

      // Сервер главнее: принимаем его сейв и не перезаписываем чужой прогресс.
      if (isValidCloudSave(cloud)) {
        applyCloudSaveInternal(cloud);
        clearCloudDirty(); // приняли серверную версию — локальные изменения больше не висят
        if (typeof toast === 'function') toast('☁️ Прогресс обновлён', 'Сейв новее с другого устройства');
        return { ok: false, conflict: 'cloud-newer', saved_at: conflict.saved_at, version: serverVersion };
      }

      return { ok: false, conflict: 'unresolved', version: serverVersion };
    }

    if (response.status === 401) {
      console.warn('[CloudSave] Сервер отклонил initData (401). Сохранение отключено.');
      return { ok: false, error: 'unauthorized', status: 401 };
    }

    // ★ Аккаунт сброшен администратором: пока не подтверждён сброс, сейв не
    // принимается (иначе старый локальный прогресс вернул бы аккаунт).
    if (response.status === 410) {
      const resetData = await response.json().catch(function() { return null; });
      if (resetData && resetData.code === 'account_reset') {
        console.warn('[CloudSave] save rejected: нужен сброс аккаунта');
        if (window.__resetHandled !== true) {
          // Админ удалил аккаунт, пока игрок был в игре — сбрасываемся.
          await applyAccountReset(initData);
        } else {
          // Локальный прогресс уже очищен — просто подтверждаем сброс.
          await ackAccountReset(initData);
          scheduleCloudRetry(1500);
        }
        return { ok: false, error: 'account-reset', status: 410 };
      }
    }

    // ★ 429 — не ошибка данных, а лимит частоты. Не пугаем игрока тостом,
    // просто повторим отправку позже.
    if (response.status === 429) {
      let errData = null;
      try { errData = await response.json(); } catch (e) { errData = null; }
      const msg = (errData && errData.error) ? errData.error : 'Too frequent';
      const retryAfter = /hour/i.test(msg) ? 60000 : CLOUD_SAVE_MIN_INTERVAL_MS;
      console.warn('[CloudSave] save throttled:', msg, 'retry in', retryAfter, 'ms');
      return { ok: false, error: 'rate-limited', status: 429, retryAfter: retryAfter };
    }

    // ★ Любой не-2xx — это НЕ успешное сохранение. Раньше 400/500
    // попадали в ветку success и клиент думал, что сейв ушёл.
    if (!response.ok) {
      let errData = null;
      try { errData = await response.json(); } catch (e) { errData = null; }
      const errMsg = (errData && errData.error) ? errData.error : ('HTTP ' + response.status);
      console.warn('[CloudSave] save rejected:', response.status, errMsg);
      // 5xx — временный сбой сервера/хостинга: не пугаем игрока, повторяем тихо.
      const transient = response.status >= 500 && response.status <= 599;
      return { ok: false, error: errMsg, status: response.status, network: transient };
    }

    const r = await response.json();
    if (r && r.authoritative) window.__serverWallet = true;

    // Сервер сверил баланс и что-то обрезал — принимаем его данные.
    if (r && r.clamped && r.data) {
      applyCloudSaveInternal(r.data);
      if (typeof toast === 'function') toast('⚖️ Баланс сверен', 'Ресурсы приведены к серверным');
    }

    if (r && typeof r.version === 'number') setCloudVersion(r.version);
    clearCloudDirty(); // сервер подтвердил локальный прогресс
    _cloudNetworkFailStreak = 0; // успешная запись — ретраи больше не нужны
    // Чистый сейв после сброса успешно записан — снова разрешаем синхронизацию.
    try { sessionStorage.removeItem(CLOUD_RESET_SKIP_KEY); } catch (e) { /* ignore */ }
    return { ok: true, saved_at: r && r.saved_at, clamped: r && r.clamped };
  } catch (e) {
    const isNetwork = !e || typeof e.status !== 'number';
    const status = isNetwork ? 0 : e.status;
    console.warn('[cloudSave] save failed:', (e && e.message) || String(e),
      '| status:', status, '| network:', isNetwork);
    if (isNetwork) {
      // Прогресс не ушёл в облако — dirty-флаг обязан остаться, чтобы
      // autoSaveToCloud() повторил отправку позже.
      try { markCloudDirty(); } catch (markErr) { /* ignore */ }
    }
    return { ok: false, error: (e && e.message) || 'network error', status: status, network: isNetwork };
  } finally {
    _cloudSaveInFlight--;
  }
}

// ★ Единая точка автосохранения в облако для игровых модулей.
// force=true — сохраняем немедленно (критичные действия: покупки, сборка планет).
let _autoCloudLastAt = 0;
let _autoCloudRetryTimer = null;

function scheduleCloudRetry(delayMs) {
  if (_autoCloudRetryTimer) return;
  const delay = Math.max(500, Math.floor(Number(delayMs) || CLOUD_SAVE_MIN_INTERVAL_MS));
  _autoCloudRetryTimer = setTimeout(function() {
    _autoCloudRetryTimer = null;
    autoSaveToCloud(true);
  }, delay);
  // В Node-тестах таймер не должен держать процесс живым.
  if (_autoCloudRetryTimer && typeof _autoCloudRetryTimer.unref === 'function') {
    _autoCloudRetryTimer.unref();
  }
}

// ★ Сетевые ошибки повторяем ограниченное число раз с нарастающей паузой,
// чтобы не зациклить ретраи и не заспамить сервер.
let _cloudNetworkFailStreak = 0;
const CLOUD_MAX_NETWORK_RETRIES = 5;

function scheduleNetworkRetry() {
  _cloudNetworkFailStreak++;
  if (_cloudNetworkFailStreak > CLOUD_MAX_NETWORK_RETRIES) {
    console.warn('[CloudSave] сеть недоступна: ретраи приостановлены до следующего действия');
    return;
  }
  const delay = Math.min(60000,
    CLOUD_SAVE_MIN_INTERVAL_MS * Math.pow(2, _cloudNetworkFailStreak - 1));
  console.log('[CloudSave] повтор сохранения через', delay, 'мс (попытка', _cloudNetworkFailStreak + ')');
  scheduleCloudRetry(delay);
}

function autoSaveToCloud(force, useKeepalive) {
  try {
    if (isResetInProgress()) return false;
    // Вне Telegram ничего не сохраняем — никаких 401 и «фантомных» сейвов.
    if (!isCloudAvailable()) return false;

    // ★ Защита от рекурсии: cloudSaveGame() вызывает saveGame(), а saveGame()
    // снова зовёт autoSaveToCloud(true). Внутренний вызов не должен планировать
    // ретрай, иначе получится бесконечное сохранение раз в 12 секунд.
    if (_cloudSaveInFlight > 0) {
      if (!_cloudSaveInternal && force) scheduleCloudRetry(1000);
      return false;
    }

    const now = Date.now();
    const minGap = force ? CLOUD_SAVE_MIN_INTERVAL_MS : 20000;
    if (now - _autoCloudLastAt < minGap) {
      // Действие важное, но сервер ещё в лимите — отправим последнее состояние позже.
      if (force) scheduleCloudRetry(minGap - (now - _autoCloudLastAt) + 100);
      return false;
    }
    _autoCloudLastAt = now;

    // ★ keepalive только при закрытии вкладки (beforeunload). Обычный автосейв — без него.
    const p = cloudSaveGame({ keepalive: !!useKeepalive });
    if (p && typeof p.then === 'function') {
      p.then(function(res) {
        if (!res) return;
        if (res.ok) {
          _cloudNetworkFailStreak = 0; // успех — счётчик ретраев сброшен
          return;
        }
        if (res.status === 429) {
          scheduleCloudRetry(res.retryAfter || CLOUD_SAVE_MIN_INTERVAL_MS);
        } else if (res.status === 0 || res.network === true) {
          // Сеть / отказ keepalive: прогресс остаётся локально, повторим.
          scheduleNetworkRetry();
        }
      }).catch(function() { /* сеть недоступна */ });
    }
    return true;
  } catch (e) {
    console.warn('[CloudSave] autoSaveToCloud error:', e);
    return false;
  }
}

// ─── Загрузить из облака (ручная/внутренняя загрузка) ───────────
async function cloudLoadGame(force) {
  const initData = getTgInitData();
  if (!initData) return { ok: false, error: 'not-telegram' };

  try {
    const r = await cloudApi('/api/load', { initData });
    if (!r || !r.data) return { ok: false, error: 'no-cloud-save' };

    const serverVersion = cloudVersionFrom(r);
    if (!force && serverVersion > 0 && serverVersion <= getCloudVersion()) {
      setCloudVersion(serverVersion);
      return { ok: false, error: 'local-newer', saved_at: r.saved_at };
    }

    setCloudVersion(serverVersion);
    if (r.authoritative === true) window.__serverWallet = true;
    applyCloudSaveAuthoritative(r.data);
    return { ok: true, saved_at: r.saved_at, applied: true };
  } catch (e) {
    if (e && e.status === 410 && e.code === 'account_reset') {
      console.warn('[cloudsave] аккаунт сброшен администратором — начинаем заново');
      await applyAccountReset(initData);
      return { ok: false, error: 'account-reset', status: 410 };
    }
    console.warn('[cloudsave] load failed:', e.message);
    return { ok: false, error: e.message, status: e.status };
  }
}

// ─── Синхронизация при старте ───────────────────────────────────
async function cloudSync() {
  if (isResetInProgress()) return { ok: false, error: 'resetting' };
  if (!CLOUD_AUTOSYNC || !isCloudAvailable()) return { ok: false, error: 'unavailable' };

  try {
    if (sessionStorage.getItem(CLOUD_SYNC_FLAG)) return { ok: false, error: 'already-synced' };
    sessionStorage.setItem(CLOUD_SYNC_FLAG, '1');
  } catch (e) { /* sessionStorage может быть недоступен */ }

  return cloudLoadGame(false);
}

// ★ Применяет облачный сейв к уже запущенной игре БЕЗ location.reload():
// в Telegram WebApp перезагрузка может блокироваться, и данные «теряются».
function applyCloudSaveToRuntime(cloudData) {
  if (!cloudData || typeof cloudData !== 'object') return false;

  // 1. Фиксируем сейв локально, чтобы loadGame() прочитал именно его
  writeLocalSave(cloudData);

  // 2. Применяем штатным путём: loadGame() делает Object.assign(S, data)
  //    и всю валидацию (MISS, планеты, фазы, vis.collapse и т.д.)
  try {
    if (typeof loadGame === 'function') loadGame();
    else Object.assign(S, cloudData);
  } catch (e) {
    console.warn('[CloudSave] loadGame упал, применяем сейв напрямую:', e);
    try { Object.assign(S, cloudData); } catch (e2) { return false; }
  }

  // 3. Обновляем интерфейс и визуал под новые данные
  try {
    S.activeMinigame = null;
    // ★ Мы только что приняли состояние от сервера: локальный офлайн-расчёт
    // от этой точки не нужен (иначе уехавшие часы доначислили бы доход повторно).
    S.lastTick = Date.now();
    resetRewardBaseline();
    if (typeof resize === 'function') resize();
    if (typeof initParticles === 'function') initParticles();
    if (typeof updateUI === 'function') updateUI();
    if (typeof updateSystemSwitcher === 'function') updateSystemSwitcher();
    if (typeof checkAchievements === 'function') checkAchievements();
  } catch (e) {
    console.warn('[CloudSave] ошибка обновления UI после применения сейва:', e);
  }
  return true;
}

// ★ Точка входа синхронизации при старте (вызывается из main.js start()).
// Логика серверная и жёсткая: если в облаке есть сейв — применяем его всегда.
async function syncCloudOnStart() {
  if (window.isResetting) return false;

  // Сброс прогресса: гасим возможное восстановление облака и убираем
  // временный флаг, иначе он навсегда заблокирует синхронизацию.
  if (isResetInProgress()) {
    try { localStorage.removeItem(CLOUD_RESET_FLAG); } catch (e) { /* ignore */ }
    // ★ Не даём второму вызову (main.js + load) сразу вернуть старый сейв.
    try { sessionStorage.setItem(CLOUD_RESET_SKIP_KEY, '1'); } catch (e) { /* ignore */ }
    try { sessionStorage.setItem(CLOUD_SYNC_FLAG, '1'); } catch (e) { /* ignore */ }
    console.log('[Sync] После сброса облачный сейв не восстанавливаем — сначала уйдёт чистый.');
    return false;
  }

  // ★ Сброс уже был обработан: не тянем старое облако, пока новый сейв
  // не уйдёт на сервер (cloudSaveGame() снимет этот флаг после успеха).
  try {
    if (sessionStorage.getItem(CLOUD_RESET_SKIP_KEY) === '1') {
      console.log('[Sync] Ожидаем загрузку чистого сейва после сброса.');
      return false;
    }
  } catch (e) { /* sessionStorage недоступен */ }

  // Защита от двойного запуска (main.js + событие load) — ставим ДО ожидания,
  // иначе два вызова могут одновременно ждать initData и дублировать тосты.
  if (syncCloudOnStart._running) return false;
  syncCloudOnStart._running = true;

  try {
    // ★ Внутри Telegram SDK может быть ещё не готов, но tgWebAppData уже в URL.
    const launchedFromTelegram = hasTelegramLaunchContext();
    const sdkLoaded = hasTelegramSdk();
    let initData = getTgInitData();

    // Если SDK загружен, но initData пуст — даём Telegram время его внедрить.
    if (!initData && (launchedFromTelegram || sdkLoaded)) {
      console.log('[Sync] initData пуст. Ждём инициализации Telegram SDK...');
      initData = await waitForTgInitData(launchedFromTelegram ? 2000 : 1200);
    }

    if (!initData) {
      if (launchedFromTelegram) {
        console.warn('[Sync] Все еще нет initData. Возможно, скрипт Telegram не загрузился (блокировка РКН).');
        showCloudNotice('__cloudTgErrorShown', '⚠️ Ошибка сети',
          'Не удалось получить данные от Telegram. Проверьте VPN.');
      } else {
        console.warn('[Sync] Игра запущена вне Telegram. Облачная синхронизация отключена.');
        showCloudNotice('__cloudBrowserWarned', '⚠️ Внимание',
          'Вы играете в браузере. Прогресс не будет синхронизирован!');
      }
      return false;
    }

    // ★ Защита от потери прогресса: если предыдущий save не дошёл до сервера
    // (400/500/сеть), сначала отправляем локальный сейв, а не грузим старое облако.
    if (isCloudDirty()) {
      if (!readLocalSave()) {
        clearCloudDirty();
      } else {
        console.log('[Sync] Есть несохранённый локальный прогресс — сначала отправляем его в облако.');
        const pushed = await cloudSaveGame();
        if (pushed && pushed.ok) {
          if (typeof toast === 'function') toast('💾 Сохранено', 'Локальный прогресс отправлен в облако');
          return true;
        }
        if (pushed && pushed.conflict === 'cloud-newer') return true;
        if (pushed && (pushed.status === 429 || pushed.error === 'in-flight')) {
          // Это не потеря данных: локальный сейв остался, повторим позже без пугающего тоста.
          console.warn('[Sync] save отложен (лимит/в полёте), повторяем позже.');
          scheduleCloudRetry((pushed && pushed.retryAfter) || 1500);
          return false;
        }
        if (pushed && (pushed.network === true || pushed.status === 0 || (pushed.status >= 500 && pushed.status <= 599))) {
          // Сеть/сервер недоступен: локальный сейв остаётся, повторяем тихо.
          console.warn('[Sync] сохранение отложено (сеть/сервер ' + (pushed.status || 0) + '), повторяем позже.');
          scheduleNetworkRetry();
          return false;
        }
        if (pushed && pushed.status === 401) {
          // Может протухнуть initData при очень долгой сессии — просим перезапуск.
          showCloudNotice('__cloudAuthErrorShown', '⛔ Ошибка входа',
            'Telegram отклонил данные. Перезапустите мини-приложение.');
          return false;
        }
        showCloudNotice('__cloudPushErrorShown', '⚠️ Синхронизация',
          'Не удалось сохранить прогресс' + (pushed && pushed.status ? ' (' + pushed.status + ')' : '') + '. Попробуйте ещё раз.');
        return false;
      }
    }

    console.log('[Sync] initData получен, длина:', initData.length);
    console.log('[Sync] Запрос облачного сейва...');
    const res = await fetch(CLOUD_API + '/api/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: initData }),
    });

    if (res.status === 401) {
      console.warn('[Sync] Сервер отклонил initData (401). Играем локально.');
      showCloudNotice('__cloudAuthErrorShown', '⛔ Ошибка входа',
        'Telegram отклонил данные. Перезапустите мини-приложение.');
      return false;
    }

    const json = await res.json();

    // ★ Аккаунт сброшен администратором: стираем локальный прогресс,
    // подтверждаем сброс и начинаем новую игру.
    if (json && json.reset === true) {
      console.log('[Sync] Сервер сообщил о сбросе аккаунта — очищаем локальный прогресс.');
      await applyAccountReset(initData);
      return false;
    }

    // Облако пустое: играем локально, сейв уйдёт при следующем сохранении.
    if (!json || !json.ok || !json.data) {
      console.log('[Sync] В облаке пусто. Играем локально, отправим сейв позже.');
      return false;
    }

    const cloudData = json.data;
    if (!cloudData || typeof cloudData !== 'object') {
      console.warn('[Sync] Облачный сейв повреждён, применяем локальный.');
      return false;
    }

    // ★ Время и версию выдал сервер — это единственный критерий.
    const cloudTime = json.saved_at || 0;
    console.log('[Sync] Облачный сейв получен. Время сервера:', cloudTime);
    console.log('[Sync] Данные в облаке:', cloudData.stage, cloudData.playerName);

    const localData = readLocalSave();
    const knownVersion = getCloudVersion();
    const serverVersion = cloudVersionFrom(json);

    // ★ Миграционная защита: save долго падал с 400, локальный прогресс ушёл
    // вперёд, но версия сервера та же. Не откатываем игрока — отправляем локальный.
    if (serverVersion > 0 && serverVersion === knownVersion &&
        localData && localProgressIsAhead(localData, cloudData)) {
      console.log('[Sync] Локальный прогресс выше облачного при той же версии — сохраняем локальный.');
      const pushed = await cloudSaveGame();
      if (pushed && pushed.ok) {
        if (typeof toast === 'function') toast('💾 Сохранено', 'Локальный прогресс выше облачного и записан на сервер');
        return true;
      }
      if (pushed && pushed.conflict === 'cloud-newer') return true;
      if (pushed && (pushed.network === true || pushed.status === 0)) {
        scheduleNetworkRetry();
      }
      console.warn('[Sync] Локальный прогресс отправить не удалось — облако не применяем.');
      return false;
    }

    if (json.authoritative === true) window.__serverWallet = true;
    if (typeof json.version === 'number') setCloudVersion(json.version);

    // ★ ГЛАВНОЕ: всегда применяем облачный сейв, если он есть.
    // Мы доверяем серверу: если играли на телефоне и сохранились, сервер
    // обновил saved_at/version — ПК просто берёт этот сейв.
    localStorage.setItem(getSaveKey(), JSON.stringify(cloudData));

    if (typeof applyCloudSaveToRuntime === 'function') {
      applyCloudSaveToRuntime(cloudData);
    } else {
      Object.assign(S, cloudData);
      if (typeof updateUI === 'function') updateUI();
    }

    if (typeof toast === 'function') toast('☁️ Синхронизация', 'Прогресс загружен из облака');
    return true;
  } catch (e) {
    console.warn('[CloudSave] Ошибка сети при загрузке:', e);
    showCloudNotice('__cloudServerErrorShown', '⚠️ Ошибка', 'Сервер Render недоступен');
  } finally {
    syncCloudOnStart._running = false;
  }
  return false;
}

// ─── Автосохранение в облако ────────────────────────────────────
let cloudAutosaveTimer = null;

function startCloudAutosave(intervalMs) {
  if (cloudAutosaveTimer) return cloudAutosaveTimer;
  // ★ Вне Telegram таймер не нужен — иначе только спам ошибок.
  if (!isCloudAvailable()) return null;
  const period = intervalMs || CLOUD_AUTOSAVE_MS;
  cloudAutosaveTimer = setInterval(function() {
    if (isCloudAvailable() && document.visibilityState === 'visible') cloudSaveGame();
  }, period);
  return cloudAutosaveTimer;
}

function stopCloudAutosave() {
  if (cloudAutosaveTimer) clearInterval(cloudAutosaveTimer);
  cloudAutosaveTimer = null;
}

// ★ Включает автосохранение при сворачивании/закрытии (идемпотентно)
function initCloudSave() {
  if (isResetInProgress()) return false;
  try {
    if (window.__cloudSaveInited) {
      if (CLOUD_AUTOSAVE_MS > 0) startCloudAutosave();
      return true;
    }
    window.__cloudSaveInited = true;
  } catch (e) { /* ignore */ }
  if (CLOUD_AUTOSAVE_MS > 0) startCloudAutosave();
  return true;
}

// ─── Отчёты о кликах серверу (режим серверного кошелька) ────────
let _clickBuffer = 0;
let _clickTimer = null;
let _clickFlushBusy = false;

function flushClicks() {
  _clickTimer = null;
  if (_clickFlushBusy) return;

  const clicks = _clickBuffer;
  if (clicks <= 0) return;

  const initData = getTgInitData();
  if (!initData) return;

  _clickBuffer = 0;
  _clickFlushBusy = true;

  cloudApi('/api/action', { initData: initData, clicks: clicks })
    .then(function(r) {
      if (r && r.authoritative) window.__serverWallet = true;
    })
    .catch(function() {
      // Сеть недоступна — вернём клики в буфер, отправим позже
      _clickBuffer += clicks;
    })
    .then(function() { _clickFlushBusy = false; });
}

function reportClickToServer(n) {
  if (!window.__serverWallet) return;
  _clickBuffer += Math.max(1, Math.floor(Number(n) || 1));
  if (_clickTimer) return;
  _clickTimer = setTimeout(flushClicks, 3000);
}
window.reportClickToServer = reportClickToServer;

// ─── Отчёты о «прочем» доходе (миссии, кометы, частицы, ежедневные) ──
const REWARD_BASELINE_KEY = 'accretion_reward_baseline';

function readRewardBaseline() {
  try {
    const raw = localStorage.getItem(REWARD_BASELINE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function writeRewardBaseline() {
  try {
    localStorage.setItem(REWARD_BASELINE_KEY, JSON.stringify({
      dust: Number(S && S.dust) || 0,
      energy: Number(S && S.energy) || 0,
      civ: Number(S && S.civLevel) || 0,
      at: Date.now(),
    }));
  } catch (e) { /* ignore */ }
}

function resetRewardBaseline() {
  if (!window.__serverWallet) return;
  writeRewardBaseline();
}

async function reportRewards() {
  if (!window.__serverWallet) return null;
  const initData = getTgInitData();
  if (!initData || typeof S === 'undefined' || !S) return null;

  const base = readRewardBaseline();
  if (!base || !base.at) { writeRewardBaseline(); return null; }

  const now = Date.now();
  const seconds = Math.min(3600, Math.max(0, (now - Number(base.at)) / 1000));
  if (seconds < 1) return null;

  const passive = { dust: 0, energy: 0, civ: 0 };
  try {
    if (typeof dustPerSec === 'function') passive.dust = dustPerSec() * seconds;
    if (typeof energyPerSec === 'function') passive.energy = energyPerSec() * seconds;
    if (typeof civPerSec === 'function') passive.civ = civPerSec() * seconds;
  } catch (e) { /* ignore */ }

  const report = {
    dust: Math.max(0, (Number(S.dust) || 0) - (Number(base.dust) || 0) - passive.dust),
    energy: Math.max(0, (Number(S.energy) || 0) - (Number(base.energy) || 0) - passive.energy),
    civ: Math.max(0, (Number(S.civLevel) || 0) - (Number(base.civ) || 0) - passive.civ),
    seconds: Math.round(seconds),
  };

  if (!(report.dust > 0 || report.energy > 0 || report.civ > 0)) {
    writeRewardBaseline();
    return null;
  }

  try {
    const r = await cloudApi('/api/reward', { initData: initData, report: report });
    writeRewardBaseline(); // точку двигаем только после успешного отчёта
    return r;
  } catch (e) {
    return null; // точка не сдвинута — повторим в следующий раз
  }
}
window.reportRewards = reportRewards;
window.resetRewardBaseline = resetRewardBaseline;

// ─── Push-уведомления ───────────────────────────────────────────
async function sendPushNotification(message, type) {
  const initData = getTgInitData();
  if (!initData || !window.__serverWallet) return; // Только в Telegram и в режиме кошелька
  if (typeof S !== 'undefined' && S && S.settings && S.settings.pushEnabled === false) return; // Если игрок отключил

  try {
    await fetch(CLOUD_API + '/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, type: type || 'info', message: message })
    });
  } catch (e) { /* silent */ }
}
window.sendPushNotification = sendPushNotification;

// ★ Аварийное восстановление: перед применением облака мы сохраняли
// предыдущий локальный сейв. Если облако оказалось старым — вернуть его.
function getLocalBackupInfo() {
  try {
    const raw = localStorage.getItem(CLOUD_BACKUP_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && typeof d === 'object'
      ? { stage: d.stage, playerName: d.playerName, dust: d.dust, lastTick: d.lastTick }
      : null;
  } catch (e) {
    return null;
  }
}

function restoreLocalBackup() {
  let data = null;
  try {
    const raw = localStorage.getItem(CLOUD_BACKUP_KEY);
    if (!raw) return false;
    data = JSON.parse(raw);
  } catch (e) {
    return false;
  }
  if (!data || typeof data !== 'object') return false;

  console.log('[CloudSave] Восстанавливаем локальный бэкап:', data.stage, data.playerName);
  if (typeof applyCloudSaveToRuntime === 'function') applyCloudSaveToRuntime(data);
  else writeLocalSave(data);

  markCloudDirty();
  if (typeof autoSaveToCloud === 'function') autoSaveToCloud(true);
  return true;
}

window.getLocalBackupInfo = getLocalBackupInfo;
window.restoreLocalBackup = restoreLocalBackup;

// ─── Экспорт ────────────────────────────────────────────────────
window.CLOUD_API = CLOUD_API;
window.cloudSaveGame = cloudSaveGame;
window.cloudLoadGame = cloudLoadGame;
window.cloudSync = cloudSync;
window.syncCloudOnStart = syncCloudOnStart;
window.applyCloudSaveToRuntime = applyCloudSaveToRuntime;
window.initCloudSave = initCloudSave;
window.isCloudAvailable = isCloudAvailable;
window.startCloudAutosave = startCloudAutosave;
window.stopCloudAutosave = stopCloudAutosave;
window.autoSaveToCloud = autoSaveToCloud;

// Запуск: сначала подтягиваем облачный сейв, затем автосейв
window.addEventListener('load', function() {
  // ★ Задержка: SDK Telegram должен успеть создать window.Telegram.WebApp
  setTimeout(function() {
    syncCloudOnStart().catch(function() {});
  }, 1000);
  if (CLOUD_AUTOSAVE_MS > 0) startCloudAutosave();
});

// ─── Автосохранение при сворачивании/закрытии ───
document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'hidden') {
    if (typeof saveGame === 'function') saveGame();
    if (typeof autoSaveToCloud === 'function') autoSaveToCloud(true);
  }
});
window.addEventListener('beforeunload', function() {
  if (typeof saveGame === 'function') saveGame();
  if (typeof autoSaveToCloud === 'function') autoSaveToCloud(true, true);
});

// ═══════════════════════════════════════════════════════════════
//  ЖИВАЯ ПРОВЕРКА ОБЛАКА (второе устройство, раз в 30 секунд)
//  Сервер — источник правды: если его версия больше локальной,
//  сразу применяем серверный сейв (без диалогов и «а может, моё?»).
// ═══════════════════════════════════════════════════════════════
let _cloudPollBusy = false;

async function pollCloudVersion() {
  if (_cloudPollBusy) return false;
  // Проверяем только если игрок в Telegram и вкладка активна
  if (document.visibilityState !== 'visible') return false;
  if (isResetInProgress()) return false;
  // После сброса не тянем старое облако, пока чистый сейв не ушёл на сервер.
  try {
    if (sessionStorage.getItem(CLOUD_RESET_SKIP_KEY) === '1') return false;
  } catch (e) { /* sessionStorage недоступен */ }
  if (!isCloudAvailable()) return false;
  // Не применяем сейв посреди активной мини-игры
  if (typeof S !== 'undefined' && S && S.activeMinigame) return false;
  // Своё сохранение ещё летит на сервер — его версия пока не подтверждена
  if (_cloudSaveInFlight > 0) return false;
  // Не перебиваем уже открытое окно (эволюция, магазин и т.п.)
  try {
    const openModal = document.getElementById('modal');
    if (openModal && openModal.classList.contains('show')) return false;
  } catch (e) { /* DOM недоступен */ }

  const initData = getTgInitData();
  if (!initData) return false;

  _cloudPollBusy = true;
  try {
    const res = await fetch(CLOUD_API + '/api/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData })
    });
    const json = await res.json();
    if (!json || !json.ok || !isValidCloudSave(json.data)) return false;

    const serverVersion = cloudVersionFrom(json);
    const knownVersion = getCloudVersion();

    // Облако не ушло вперёд — на этом устройстве всё актуально
    if (serverVersion <= knownVersion) return false;

    console.log('[Sync] Обнаружено обновление с другого устройства! v' + serverVersion);

    if (json.authoritative === true) window.__serverWallet = true;
    setCloudVersion(serverVersion);
    applyCloudSaveAuthoritative(json.data);
    if (typeof toast === 'function') toast('☁️ Синхронизация', 'Прогресс обновлён с другого устройства');
    return true;
  } catch (e) {
    return false;
  } finally {
    _cloudPollBusy = false;
  }
}

setInterval(function() {
  pollCloudVersion().catch(function() { /* сеть недоступна */ });
}, 30000);

// Вернулись в игру (переключили вкладку / свернули-развернули Telegram) —
// сразу проверяем, не поиграли ли на другом устройстве.
document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'visible') {
    pollCloudVersion().catch(function() { /* сеть недоступна */ });
  }
});

window.pollCloudVersion = pollCloudVersion;
