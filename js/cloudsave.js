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
const CLOUD_SYNC_FLAG = 'accretion_cloud_synced';
const CLOUD_RESET_FLAG = 'accretion_reset_pending';
const CLOUD_VER_KEY = 'accretion_cloud_version';
const CLOUD_BACKUP_KEY = 'accretion_local_backup';
// ★ После «Сброса» облако нельзя восстанавливать, пока чистый сейв не уйдёт
// на сервер. Флаг живёт в sessionStorage и переживает location.reload().
const CLOUD_RESET_SKIP_KEY = 'accretion_reset_skip_cloud';
// Сколько запросов сохранения сейчас в полёте (чтобы опрос не принял
// свой же сейв за чужой и чтобы saveGame() не ушёл в рекурсию).
let _cloudSaveInFlight = 0;

// ★ Версия облачного сейва — общий монотонный счётчик сервера.
function getCloudVersion() {
  try { return Number(localStorage.getItem(CLOUD_VER_KEY)) || 0; } catch (e) { return 0; }
}

function setCloudVersion(v) {
  try { localStorage.setItem(CLOUD_VER_KEY, String(Number(v) || 0)); } catch (e) { /* ignore */ }
}

// ─── Вспомогательные функции ────────────────────────────────────
function getSaveKey() {
  try {
    return SAVE_KEY; // из state.js
  } catch (e) {
    return 'accretion_v17'; // запасной ключ, если state.js ещё не загружен
  }
}

// ★ Единственная проверка «мы действительно в Telegram?».
// В обычном браузере window.Telegram отсутствует (или initData пуст),
// поэтому облако должно молчать — иначе сервер отвечает 401.
function isTelegramEnvironment() {
  try {
    return !!(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData);
  } catch (e) {
    return false;
  }
}

function getTgInitData() {
  try {
    const tg = window.Telegram;
    if (tg && tg.WebApp && tg.WebApp.initData) {
      return String(tg.WebApp.initData);
    }
  } catch (e) { /* ignore */ }

  // Предупреждаем один раз, а не на каждый вызов — и НЕ идём на сервер.
  if (!window.__cloudNoTgWarned) {
    window.__cloudNoTgWarned = true;
    console.warn('[CloudSave] Telegram initData недоступен. Облачные сохранения отключены.');
  }
  return '';
}

function isCloudAvailable() {
  return isTelegramEnvironment() && !!getTgInitData();
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

// Страховка: перед заменой локального сейва облачным сохраняем предыдущий
function backupLocalSave() {
  try {
    const prev = localStorage.getItem(getSaveKey());
    if (prev) localStorage.setItem(CLOUD_BACKUP_KEY, prev);
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
    throw err;
  }
  return data;
}

// ─── Сохранить в облако ─────────────────────────────────────────
async function cloudSaveGame(options) {
  if (isResetInProgress()) return { ok: false, error: 'resetting' }; // ★ не сохраняем во время сброса
  const initData = getTgInitData();
  if (!initData) return { ok: false, error: 'not-telegram' };
  // Параллельные сохранения не нужны: сервер всё равно ответит 409/429.
  if (_cloudSaveInFlight > 0) return { ok: false, error: 'in-flight' };

  // ★ keepalive по умолчанию: запрос дойдёт, даже если вкладку закрывают.
  const keepalive = !options || options.keepalive !== false;

  _cloudSaveInFlight++;
  try {
    // ★ saveGame() сам вызовет autoSaveToCloud(true); защита от рекурсии —
    // проверка _cloudSaveInFlight в autoSaveToCloud().
    if (typeof saveGame === 'function') saveGame();

    // ★ В режиме кошелька сначала сообщаем серверу о «прочем» доходе.
    if (window.__serverWallet) {
      try { await reportRewards(); } catch (e) { /* отчёт не критичен */ }
    }

    const saveData = readLocalSave();
    if (!saveData) return { ok: false, error: 'no-save' };

    // ★ keepalive: запрос дойдёт, даже если вкладку закрывают.
    const baseVersion = getCloudVersion();
    const response = await fetch(CLOUD_API + '/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, saveData, baseVersion }),
      keepalive: keepalive,
    });

    // ★ КОНФЛИКТ: на сервере уже новее (играли с другого устройства).
    if (response.status === 409) {
      const conflict = await response.json().catch(function() { return null; });
      const cloud = conflict && conflict.data;
      if (conflict && conflict.authoritative) window.__serverWallet = true;

      const serverVersion = cloudVersionFrom(conflict);
      setCloudVersion(serverVersion);

      // Сервер главнее: принимаем его сейв и не перезаписываем чужой прогресс.
      if (isValidCloudSave(cloud)) {
        applyCloudSaveAuthoritative(cloud);
        if (typeof toast === 'function') toast('☁️ Прогресс обновлён', 'Сейв новее с другого устройства');
        return { ok: false, conflict: 'cloud-newer', saved_at: conflict.saved_at, version: serverVersion };
      }

      return { ok: false, conflict: 'unresolved', version: serverVersion };
    }

    if (response.status === 401) {
      console.warn('[CloudSave] Сервер отклонил initData (401). Сохранение отключено.');
      return { ok: false, error: 'unauthorized', status: 401 };
    }

    const r = await response.json();
    if (r && r.authoritative) window.__serverWallet = true;

    // Сервер сверил баланс и что-то обрезал — принимаем его данные.
    if (r && r.clamped && r.data) {
      applyCloudSaveAuthoritative(r.data);
      if (typeof toast === 'function') toast('⚖️ Баланс сверен', 'Ресурсы приведены к серверным');
    }

    if (r && typeof r.version === 'number') setCloudVersion(r.version);
    // Чистый сейв после сброса успешно записан — снова разрешаем синхронизацию.
    try { sessionStorage.removeItem(CLOUD_RESET_SKIP_KEY); } catch (e) { /* ignore */ }
    return { ok: true, saved_at: r && r.saved_at, clamped: r && r.clamped };
  } catch (e) {
    console.warn('[cloudSave] save failed:', e.message);
    return { ok: false, error: e.message, status: e.status };
  } finally {
    _cloudSaveInFlight--;
  }
}

// ★ Единая точка автосохранения в облако для игровых модулей.
// force=true — сохраняем немедленно (критичные действия: покупки, сборка планет).
let _autoCloudLastAt = 0;
function autoSaveToCloud(force) {
  try {
    if (isResetInProgress()) return false;
    // Вне Telegram ничего не сохраняем — никаких 401 и «фантомных» сейвов.
    if (!isCloudAvailable()) return false;

    // ★ Защита от рекурсии: cloudSaveGame() вызывает saveGame(), а saveGame()
    // снова зовёт autoSaveToCloud(true). Если запрос уже в полёте — выходим.
    if (_cloudSaveInFlight > 0) return false;

    const now = Date.now();
    // Без force не чаще раза в 20 секунд, чтобы не спамить сервер
    if (!force && now - _autoCloudLastAt < 20000) return false;
    _autoCloudLastAt = now;

    // ★ Принудительное сохранение с keepalive: true — переживает закрытие вкладки.
    const p = cloudSaveGame({ keepalive: true });
    if (p && typeof p.catch === 'function') p.catch(function() { /* сеть недоступна */ });
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

  // ★ ЖЁСТКАЯ БЛОКИРОВКА БЕЗ TELEGRAM:
  // в обычном браузере не грузим и не сохраняем облако вообще.
  if (!window.Telegram || !window.Telegram.WebApp || !window.Telegram.WebApp.initData) {
    console.warn('[Sync] Игра запущена вне Telegram. Облачная синхронизация отключена.');
    if (typeof toast === 'function') {
      toast('⚠️ Внимание', 'Вы играете в браузере. Прогресс не будет синхронизирован!');
    }
    return false;
  }

  const initData = getTgInitData();
  if (!initData) return false;

  // Защита от двойного запуска (main.js + событие load)
  if (syncCloudOnStart._running) return false;
  syncCloudOnStart._running = true;

  try {
    console.log('[Sync] Запрос облачного сейва...');
    const res = await fetch(CLOUD_API + '/api/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: initData }),
    });

    if (res.status === 401) {
      console.warn('[Sync] Сервер отклонил initData (401). Играем локально.');
      return false;
    }

    const json = await res.json();

    // Облако пустое: играем локально, сейв уйдёт при следующем сохранении.
    if (!json || !json.ok || !json.data) {
      console.log('[Sync] В облаке пусто. Играем локально, отправим сейв позже.');
      return false;
    }

    const cloudData = json.data;
    if (typeof cloudData !== 'object') {
      console.warn('[Sync] Облачный сейв повреждён, применяем локальный.');
      return false;
    }

    // ★ Время и версию выдал сервер — это единственный критерий.
    const cloudTime = json.saved_at || 0;
    console.log('[Sync] Облачный сейв получен. Время сервера:', cloudTime);
    console.log('[Sync] Данные в облаке:', cloudData.stage, cloudData.playerName);

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
  if (typeof autoSaveToCloud === 'function') autoSaveToCloud(true);
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
