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
const CLOUD_VER_KEY = 'accretion_cloud_version';

// ★ Версия облачного сейва — общий монотонный счётчик сервера.
// Без него два устройства затирали друг друга «вслепую».
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
    
    // ★ Прямой fetch с keepalive: true + версия, которую клиент видел
    const baseVersion = getCloudVersion();
    const response = await fetch(CLOUD_API + '/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, saveData, baseVersion }),
      keepalive: true // Позволяет отправить запрос даже при закрытии окна
    });

    // ★ КОНФЛИКТ: облако уже новее (играли с другого устройства)
    if (response.status === 409) {
      const conflict = await response.json().catch(function() { return null; });
      const cloud = conflict && conflict.data;
      setCloudVersion(conflict && conflict.version);

      const localTs = Number(saveData.lastTick) || 0;
      const cloudTs = Number(cloud && cloud.lastTick) || 0;

      if (cloud && cloudTs > localTs + 60000) {
        // Облако действительно новее — принимаем его, не затираем
        applyCloudSaveToRuntime(cloud);
        if (typeof toast === 'function') toast('☁️ Прогресс обновлён', 'Сейв новее с другого устройства');
        return { ok: false, conflict: 'cloud-newer', saved_at: conflict.saved_at };
      }

      // Локальный новее — форсируем запись поверх актуальной версии
      const retry = await fetch(CLOUD_API + '/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, saveData, baseVersion: (conflict && conflict.version) || 0 }),
        keepalive: true
      });
      if (retry.ok) {
        const rr = await retry.json();
        setCloudVersion(rr && rr.version);
        return { ok: true, saved_at: rr && rr.saved_at };
      }
      return { ok: false, conflict: 'unresolved' };
    }

    const r = await response.json();
    if (r && typeof r.version === 'number') setCloudVersion(r.version);
    return { ok: true, saved_at: r && r.saved_at };
  } catch (e) {
    console.warn('[cloudSave] save failed:', e.message);
    return { ok: false, error: e.message, status: e.status };
  }
}

// ★ Единая точка автосохранения в облако для игровых модулей.
// force=true — сохраняем немедленно (критичные действия: покупки, сборка планет).
let _autoCloudLastAt = 0;
function autoSaveToCloud(force) {
  try {
    if (isResetInProgress()) return false;
    if (!isCloudAvailable()) return false;

    const now = Date.now();
    // Без force не чаще раза в 20 секунд, чтобы не спамить сервер
    if (!force && now - _autoCloudLastAt < 20000) return false;
    _autoCloudLastAt = now;

    // cloudSaveGame() сам вызывает saveGame() и отправляет сейв с keepalive
    const p = cloudSaveGame();
    if (p && typeof p.catch === 'function') p.catch(function() { /* сеть недоступна */ });
    return true;
  } catch (e) {
    console.warn('[CloudSave] autoSaveToCloud error:', e);
    return false;
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
    if (typeof r.version === 'number') setCloudVersion(r.version);

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
  if (window.isResetting) return false;
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
    syncCloudOnStart._running = false;
    return false;
  }

  try {
    const res = await fetch(CLOUD_API + '/api/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: initData })
    });
    const json = await res.json();
    if (json && typeof json.version === 'number') setCloudVersion(json.version);

    // ★ КРИТИЧЕСКАЯ ЗАЩИТА: сервер ответил ok, но данных нет — локальный сейв не трогаем
    if (!json.ok || !json.data) return false;

    const cloudData = json.data;

    // ★ КРИТИЧЕСКАЯ ЗАЩИТА: если в облаке нет stage или lastTick, это битый/пустой сейв
    if (!cloudData || !cloudData.lastTick || !cloudData.stage) {
      console.warn('[CloudSave] Облачный сейв пуст или поврежден, пропускаем загрузку.');
      return false;
    }

    const localRaw = localStorage.getItem(getSaveKey());
    let localData = null;
    try { localData = localRaw ? JSON.parse(localRaw) : null; } catch (e) { localData = null; }

    // Если локального сейва нет вообще
    if (!localData || !localData.lastTick) {
      // Если облако есть и валидно — грузим его
      localStorage.setItem(getSaveKey(), JSON.stringify(cloudData));
      Object.assign(S, cloudData);
      if (typeof updateUI === 'function') updateUI();
      if (typeof toast === 'function') toast('☁️ Сейв загружен', 'Восстановлен из облака');
      return true;
    }

    // Если локальный сейв есть, но в нем тоже пустота — грузим облако
    if (localData.stage === 'cloud' && cloudData.stage !== 'cloud') {
        localStorage.setItem(getSaveKey(), JSON.stringify(cloudData));
        Object.assign(S, cloudData);
        if (typeof updateUI === 'function') updateUI();
        if (typeof toast === 'function') toast('☁️ Сейв загружен', 'Восстановлен более новый прогресс');
        return true;
    }

    // Сравниваем время (разница должна быть существенной)
    const cloudTime = cloudData.lastTick || 0;
    const localTime = localData.lastTick || 0;

    if (cloudTime > localTime + 60000) { // Если облако новее на 1 минуту
      localStorage.setItem(getSaveKey(), JSON.stringify(cloudData));
      Object.assign(S, cloudData);
      if (typeof updateUI === 'function') updateUI();
      if (typeof toast === 'function') toast('☁️ Сейв обновлен', 'Загружена версия из облака');
      return true;
    }
  } catch (e) {
    console.warn('[CloudSave] Ошибка загрузки:', e);
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
window.autoSaveToCloud = autoSaveToCloud;

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
    if (typeof saveGame === 'function') saveGame();
    if (typeof autoSaveToCloud === 'function') autoSaveToCloud(true);
  }
});
window.addEventListener('beforeunload', function() {
  if (typeof saveGame === 'function') saveGame();
  if (typeof autoSaveToCloud === 'function') autoSaveToCloud(true);
});