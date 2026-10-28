// ═══════════════════════════════════════════════════════════════
//  CLOUDSAVE.JS — Облачные сохранения (Render + Telegram initData)
// ═══════════════════════════════════════════════════════════════

// Адрес сервера (Render)
const CLOUD_API = 'https://accretion-game.onrender.com';

// Автосинхронизация при старте и автосохранение в облако
const CLOUD_AUTOSYNC = true;
const CLOUD_AUTOSAVE_MS = 60 * 1000;
const CLOUD_SYNC_FLAG = 'accretion_cloud_synced';
const CLOUD_RESET_FLAG = 'accretion_reset_pending';

// ─── Вспомогательные функции ────────────────────────────────────
function getSaveKey() {
  try {
    return SAVE_KEY; // из state.js
  } catch (e) {
    return 'accretion_v17'; // запасной ключ, если state.js ещё не загружен
  }
}

function getTgInitData() {
  console.log('TG InitData check:', window.Telegram ? 'TG exists' : 'NO TG');
  if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) {
    console.log('InitData length:', window.Telegram.WebApp.initData.length);
    return window.Telegram.WebApp.initData;
  }
  return '';
}

function isCloudAvailable() {
  return !!getTgInitData();
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
async function cloudSaveGame() {
  if (isResetInProgress()) return { ok: false, error: 'resetting' }; // ★ не сохраняем во время сброса
  const initData = getTgInitData();
  if (!initData) return { ok: false, error: 'not-telegram' };

  try {
    if (typeof saveGame === 'function') saveGame(); // актуализируем локальный сейв
    const saveData = readLocalSave();
    if (!saveData) return { ok: false, error: 'no-save' };
    
    // ★ Прямой fetch с keepalive: true
    const response = await fetch(CLOUD_API + '/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, saveData }),
      keepalive: true // Позволяет отправить запрос даже при закрытии окна
    });
    
    const r = await response.json();
    return { ok: true, saved_at: r && r.saved_at };
  } catch (e) {
    console.warn('[cloudSave] save failed:', e.message);
    return { ok: false, error: e.message, status: e.status };
  }
}

// ─── Загрузить из облака ────────────────────────────────────────
// force=false: облако применяется только если оно новее локального сейва.
async function cloudLoadGame(force) {
  const initData = getTgInitData();
  if (!initData) return { ok: false, error: 'not-telegram' };

  try {
    const r = await cloudApi('/api/load', { initData });
    if (!r || !r.data) return { ok: false, error: 'no-cloud-save' };

    if (!force && r.saved_at && r.saved_at <= localSavedAt()) {
      return { ok: false, error: 'local-newer', saved_at: r.saved_at };
    }

    // ★ Применяем сразу, без перезагрузки страницы
    applyCloudSaveToRuntime(r.data);
    return { ok: true, saved_at: r.saved_at, applied: true };
  } catch (e) {
    console.warn('[cloudsave] load failed:', e.message);
    return { ok: false, error: e.message, status: e.status };
  }
}

// ─── Синхронизация при старте ───────────────────────────────────
async function cloudSync() {
  if (isResetInProgress()) return { ok: false, error: 'resetting' }; // ★ не восстанавливаем сейв во время сброса
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

// ★ Точка входа синхронизации при старте (вызывается из main.js start())
async function syncCloudOnStart() {
  if (window.isResetting) return false; // ★ Защита от перезаписи при сбросе
  if (isResetInProgress()) {
    // Сброс прогресса: гасим возможное восстановление облака и убираем временный флаг,
    // иначе accretion_reset_pending навсегда заблокирует облачную синхронизацию
    try { localStorage.removeItem(CLOUD_RESET_FLAG); } catch (e) { /* ignore */ }
    try { sessionStorage.setItem(CLOUD_SYNC_FLAG, '1'); } catch (e) { /* ignore */ }
    return false;
  }

  // Защита от двойного запуска (main.js + событие load)
  if (syncCloudOnStart._running) return false;
  syncCloudOnStart._running = true;

  const initData = getTgInitData();
  if (!initData) {
    console.warn('[CloudSave] initData пуст — синхронизация пропущена (не Telegram?)');
    syncCloudOnStart._running = false;
    return false;
  }

  try {
    console.log('[CloudSave] POST', CLOUD_API + '/api/load', 'initData.length =', initData.length);

    const res = await fetch(CLOUD_API + '/api/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: initData })
    });
    console.log('[CloudSave] /api/load HTTP', res.status, res.statusText);

    const json = await res.json();
    console.log('[CloudSave] /api/load payload:', json);

    if (!json || !json.ok || !json.data) {
      if (typeof toast === 'function') toast('☁️ Облако пустое', 'Заливаем локальный сейв');
      await cloudSaveGame();
      return false;
    }

    const cloudData = json.data;
    const localData = readLocalSave();
    const cloudTime = cloudData.lastTick || 0;
    const localTime = (localData && localData.lastTick) || 0;

    // Локального прогресса нет вообще — применяем облачный сейв
    if (!localData || !localTime) {
      // Пустой облачный сейв (без lastTick) не применяем, чтобы не затереть игру
      if (cloudTime <= 0) {
        await cloudSaveGame();
        return false;
      }
      applyCloudSaveToRuntime(cloudData);
      if (typeof toast === 'function') toast('☁️ Сейв загружен', 'Прогресс восстановлен из облака');
      return true;
    }

    // Облачный сейв заметно новее локального — применяем на лету
    if (cloudTime > localTime + 10000) {
      applyCloudSaveToRuntime(cloudData);
      if (typeof toast === 'function') toast('☁️ Сейв обновлён', 'Загружена более новая версия');
      return true;
    }

    // Локальный не старше — заливаем его в облако
    await cloudSaveGame();
  } catch (e) {
    console.warn('[CloudSave] Ошибка загрузки:', e);
    if (typeof toast === 'function') toast('⚠️ Ошибка сети', e.message);
  } finally {
    syncCloudOnStart._running = false;
  }
  return false;
}

// ─── Автосохранение в облако ────────────────────────────────────
let cloudAutosaveTimer = null;

function startCloudAutosave(intervalMs) {
  if (cloudAutosaveTimer) return cloudAutosaveTimer;
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

// Запуск: сначала подтягиваем более свежий облачный сейв, затем автосейв
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
    if (typeof cloudSaveGame === 'function') cloudSaveGame();
  }
});
window.addEventListener('beforeunload', function() {
  if (typeof cloudSaveGame === 'function') cloudSaveGame();
});