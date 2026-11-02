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
// Сколько запросов сохранения сейчас в полёте (чтобы опрос не принял свой же сейв за чужой)
let _cloudSaveInFlight = 0;

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

// ═══════════════════════════════════════════════════════════════
//  SERVER-AUTHORITATIVE: единственный критерий «кто новее» —
//  номер версии и время, выданные СЕРВЕРОМ. Локальные Date.now()
//  (lastTick) с облаком больше не сравниваются: часы телефона, ПК и
//  планшета расходятся, и именно это заставляло устройства затирать
//  друг друга.
// ═══════════════════════════════════════════════════════════════
const CLOUD_BACKUP_KEY = 'accretion_local_backup';

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

// Telegram WebApp не умеет блокирующий confirm(): используем showConfirm (callback),
// а в обычном браузере — window.confirm.
function askCloudConfirm(message) {
  return new Promise(function(resolve) {
    try {
      const tg = window.Telegram && window.Telegram.WebApp;
      if (tg && typeof tg.showConfirm === 'function') {
        tg.showConfirm(message, function(ok) { resolve(!!ok); });
        return;
      }
    } catch (e) { /* ignore */ }
    try { resolve(window.confirm(message) === true); }
    catch (e) { resolve(false); }
  });
}

// ─── Описание облачного сейва для диалога ───────────────────────
function cloudFmtNum(n) {
  try { if (typeof fmt === 'function') return fmt(n); } catch (e) { /* ignore */ }
  return String(Math.round(Number(n) || 0));
}

function formatCloudSavedAt(ts) {
  const t = Number(ts);
  if (!t || !isFinite(t)) return '';
  const d = new Date(t);
  if (isNaN(d.getTime())) return '';
  const p = function(n) { return (n < 10 ? '0' : '') + n; };
  return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() +
         ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

// ★ Краткое описание стадии игры из облачного сейва:
// «ФАЗА V · Формирование системы · цивилизация 4 ур. · систем: 3 · пыль: 12.5К»
function buildCloudSaveDescription(data) {
  if (!data || typeof data !== 'object') return 'Прогресс не распознан';

  const parts = [];
  const stages = (typeof STAGES !== 'undefined') ? STAGES : (window.STAGES || {});
  const st = data.stage ? stages[data.stage] : null;

  if (st) parts.push(st.tag + ' · ' + st.name);
  else if (data.stage) parts.push('фаза: ' + data.stage);

  if (st && st.goal && Number(data.phaseProgress) > 0) {
    const pct = Math.max(0, Math.min(100, Math.round((Number(data.phaseProgress) / st.goal) * 100)));
    parts.push('прогресс ' + pct + '%');
  }
  if (Number(data.civLevel) > 0) parts.push('цивилизация ' + data.civLevel + ' ур.');
  if (Number(data.totalSystemsCreated) > 0) parts.push('систем: ' + data.totalSystemsCreated);
  if (Number(data.prestigeLevel) > 0) parts.push('престиж ' + data.prestigeLevel);
  if (Number(data.dust) > 0) parts.push('пыль: ' + cloudFmtNum(data.dust));

  return parts.length ? parts.join(' · ') : 'Прогресс без деталей';
}

// ★ Диалог «Обнаружено более новое сохранение».
// Возвращает 'cloud' (грузить облако), 'local' (оставить текущее) или 'dismiss'.
function showCloudSavePrompt(cloudData, savedAt) {
  const desc = buildCloudSaveDescription(cloudData);
  const when = formatCloudSavedAt(savedAt);
  const title = '☁️ Обнаружено более новое сохранение';
  // Строка для сравнения: что сейчас на этом устройстве
  const localRaw = readLocalSave();
  const localDesc = (localRaw && typeof localRaw === 'object')
    ? buildCloudSaveDescription(localRaw)
    : '';

  let card = null;
  let modal = null;
  try {
    card = document.getElementById('modalCard');
    modal = document.getElementById('modal');
  } catch (e) { /* DOM недоступен — ниже сработает текстовый вариант */ }

  if (!card || !modal) {
    return askCloudConfirm(title + '\nСейчас у вас: ' + (localDesc || 'нет сохранения') +
      '\nВ облаке: ' + desc + (when ? ' (' + when + ')' : '') +
      '\n\nЗагрузить облачное? Если отказаться — текущий прогресс будет записан в облако.')
      .then(function(ok) { return ok ? 'cloud' : 'local'; });
  }

  return new Promise(function(resolve) {
    let done = false;
    let watch = null;

    function finish(choice) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (watch) clearInterval(watch);
      try { modal.classList.remove('show'); } catch (e) { /* ignore */ }
      resolve(choice);
    }

    const timer = setTimeout(function() { finish('dismiss'); }, 120000);

    card.innerHTML =
      '<div class="modal-title">' + title + '</div>' +
      '<div class="modal-sub">' + desc +
        (when ? '<br><span style="opacity:0.65;font-size:11px;">Сохранено: ' + when + '</span>' : '') +
      '</div>' +
      (localDesc ? '<div class="modal-sub" style="opacity:0.75;font-size:11px;margin-top:6px;">Сейчас у вас: ' + localDesc + '</div>' : '') +
      '<button class="pour-btn" id="cloudLoadNewBtn" style="width:100%;margin-top:12px;">Загрузить это сохранение</button>' +
      '<button class="pour-btn" id="cloudKeepLocalBtn" style="width:100%;margin-top:8px;">Оставить текущее</button>';

    const loadBtn = document.getElementById('cloudLoadNewBtn');
    const keepBtn = document.getElementById('cloudKeepLocalBtn');
    if (loadBtn) loadBtn.onclick = function() { finish('cloud'); };
    if (keepBtn) keepBtn.onclick = function() { finish('local'); };

    modal.classList.add('show');

    // Закрыли крестиком / по фону / Esc без выбора — считаем, что игрок ничего не выбрал
    watch = setInterval(function() {
      if (!modal.classList.contains('show')) finish('dismiss');
    }, 250);
  });
}

// ★ Общее разрешение конфликта «в облаке новее»: спрашиваем игрока
async function resolveCloudDivergence(cloudData, serverVersion, savedAt) {
  const choice = await showCloudSavePrompt(cloudData, savedAt);

  if (choice === 'cloud') {
    setCloudVersion(serverVersion);
    applyCloudSaveAuthoritative(cloudData);
    if (typeof toast === 'function') toast('☁️ Синхронизация', 'Загружено сохранение с другого устройства');
    return true;
  }

  if (choice === 'local') {
    const pushed = await pushLocalSaveOverCloud(serverVersion);
    if (typeof toast === 'function') {
      if (pushed) toast('💾 Сохранено', 'Текущий прогресс записан в облако');
      else toast('⚠️ Синхронизация', 'Не удалось записать прогресс в облако');
    }
    return false;
  }

  return false;
}

// ★ Игрок выбрал «оставить текущее» → переписываем облако текущим сейвом.
// Проставляем известную серверную версию, чтобы сервер принял запись
// (иначе он справедливо ответит 409 и защитит чужой прогресс).
async function pushLocalSaveOverCloud(serverVersion) {
  setCloudVersion(serverVersion);
  try {
    const r = await cloudSaveGame();
    return !!(r && r.ok);
  } catch (e) {
    return false;
  }
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

  _cloudSaveInFlight++;
  try {
    if (typeof saveGame === 'function') saveGame(); // актуализируем локальный сейв

    // ★ В режиме кошелька сначала сообщаем серверу о «прочем» доходе.
    // Иначе сверка посчитает его подменой и обрежет.
    if (window.__serverWallet) {
      try { await reportRewards(); } catch (e) { /* отчёт не критичен */ }
    }

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
      if (conflict && conflict.authoritative) window.__serverWallet = true;

      // ★ Сервер главнее: на сервере уже другая версия, значит играли на другом
      // устройстве. Принимаем облако (локальная копия уйдёт в бэкап) и НЕ
      // перезаписываем чужой сейв вслепую, как это было раньше.
      const serverVersion = cloudVersionFrom(conflict);
      setCloudVersion(serverVersion);

      if (isValidCloudSave(cloud)) {
        applyCloudSaveAuthoritative(cloud);
        if (typeof toast === 'function') toast('☁️ Прогресс обновлён', 'Сейв новее с другого устройства');
        return { ok: false, conflict: 'cloud-newer', saved_at: conflict.saved_at, version: serverVersion };
      }

      return { ok: false, conflict: 'unresolved', version: serverVersion };
    }

    const r = await response.json();
    if (r && r.authoritative) window.__serverWallet = true;

    // ★ Сервер сверил баланс с кошельком и что-то обрезал — принимаем его
    // данные, иначе клиент будет жить с балансом, которого нет в облаке.
    if (r && r.clamped && r.data) {
      applyCloudSaveAuthoritative(r.data);
      if (typeof toast === 'function') toast('⚖️ Баланс сверен', 'Ресурсы приведены к серверным');
    }

    if (r && typeof r.version === 'number') setCloudVersion(r.version);
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

    // ★ Сравниваем только версии с сервера (никаких локальных часов).
    const knownVersion = getCloudVersion();
    const serverVersion = cloudVersionFrom(r);
    if (typeof r.version === 'number') setCloudVersion(r.version);

    if (!force && serverVersion > 0 && serverVersion <= knownVersion) {
      return { ok: false, error: 'local-newer', saved_at: r.saved_at };
    }

    // ★ Применяем сразу, без перезагрузки страницы
    applyCloudSaveAuthoritative(r.data);
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
    // ★ Мы онлайн и только что приняли состояние от сервера: локальный
    // офлайн-расчёт от этой точки не нужен (иначе уехавшие часы устройства
    // доначислили бы доход повторно).
    S.lastTick = Date.now();
    // Серверный баланс применён — сбрасываем точку отчёта о доходе
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

    // Если облако пустое — ничего не делаем, локальный сейв останется,
    // и уйдёт в облако при следующем сохранении
    if (!json || !json.ok || !json.data) {
      console.log('[Sync] Облако пусто, используем локальный сейв');
      return false;
    }

    const cloudData = json.data;

    // ★ Кошелёк включён: сервер владеет балансом ресурсов
    if (json.authoritative === true) window.__serverWallet = true;

    // ★ Битый/пустой облачный сейв не затирает локальный прогресс
    if (!isValidCloudSave(cloudData)) {
      console.warn('[CloudSave] Облачный сейв пуст или поврежден, пропускаем загрузку.');
      return false;
    }

    // ★ ГЛАВНОЕ ПРАВИЛО: сравниваем ВЕРСИИ С СЕРВЕРА, а не Date.now() с устройств.
    const serverVersion = cloudVersionFrom(json);
    const knownVersion = getCloudVersion();
    const localData = readLocalSave();

    console.log('[Sync] Облако: v' + serverVersion + ', последняя известная локально: v' + knownVersion);

    // 1. Локального сейва нет — берём облако
    if (!localData || !localData.lastTick) {
      setCloudVersion(serverVersion);
      applyCloudSaveAuthoritative(cloudData);
      if (typeof toast === 'function') toast('☁️ Сейв загружен', 'Восстановлен из облака');
      return true;
    }

    // 2. Сервер выдал версию новее → на другом устройстве есть сейв новее.
    //    ★ Спрашиваем игрока: загрузить облако или оставить текущее.
    //    Если оставить — текущий сейв сразу перезапишет облако.
    if (serverVersion > knownVersion) {
      return await resolveCloudDivergence(cloudData, serverVersion, json.saved_at);
    }

    // 2б. Версия та же, но СЕРВЕР начислил офлайн-доход по своим часам.
    //     Принимаем данные сервера: локальный офлайн-расчёт всё равно
    //     будет перезаписан, а считать по часам устройства нельзя.
    const granted = json.offline &&
      ((json.offline.dustEarned || 0) > 0 || (json.offline.energyEarned || 0) > 0 || (json.offline.civEarned || 0) > 0);

    // 2в. Кошелёк включён (SERVER_AUTHORITATIVE): баланс сверяет сервер.
    //     При равной версии НЕ затираем локальный прогресс: в нём лежит
    //     офлайн-работа клиента (миссии, кометы), которую отчёт /api/reward
    //     зачтёт в кошелёк. Баланс всё равно проверяется при сохранении.
    const walletMode = json.authoritative === true && json.wallet;

    if (walletMode) return false;

    if (granted) {
      setCloudVersion(serverVersion);
      applyCloudSaveAuthoritative(cloudData);
      console.log('[Sync] Серверное офлайн-начисление: пыль ' + (json.offline.dustEarned || 0) +
        ', энергия ' + (json.offline.energyEarned || 0) + ', цив ' + (json.offline.civEarned || 0));
      return true;
    }

    // 3. Версии совпали — локальный сейв это продолжение последнего облачного.
    //    Ничего не грузим; прогресс уйдёт в облако при следующем сохранении.
    setCloudVersion(serverVersion);
    console.log('[Sync] Локальный сейв актуален, загружать нечего');
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

// ─── Отчёты о кликах серверу (режим серверного кошелька) ────────
// Клики копятся и уходят пачкой раз в 3 секунды. Сервер сам считает
// доход по clickGain() и ограничивает частоту — клиент только сообщает.
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
// Пассивку и клики сервер считает сам, поэтому клиент присылает только
// разницу сверх ожидаемой пассивки. Сервер ограничивает её своей ставкой.
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

// Вызывается после применения серверного сейва: баланс сброшен — сбросим и точку
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

// ═══════════════════════════════════════════════════════════════
//  ЖИВАЯ ПРОВЕРКА ОБЛАКА (второе устройство, раз в 30 секунд)
//  Сравниваем только серверные версии — время устройств не используется,
//  потому что именно рассинхрон часов и вызывал потерю сейвов.
// ═══════════════════════════════════════════════════════════════
let _cloudPollBusy = false;
let _cloudPromptSkippedVersion = 0; // версия, грузить которую игрок уже отказался

async function pollCloudVersion() {
  if (_cloudPollBusy) return false;
  // Проверяем только если игрок в Telegram и вкладка активна
  if (document.visibilityState !== 'visible') return false;
  if (isResetInProgress()) return false;
  if (!isCloudAvailable()) return false;
  // Не применяем сейв посреди активной мини-игры
  if (typeof S !== 'undefined' && S && S.activeMinigame) return false;
  // Своё сохранение ещё летит на сервер — его версия пока не подтверждена
  if (_cloudSaveInFlight > 0) return false;
  // Не перебиваем уже открытое окно (эволюция, магазин и т.п.) — спросим в следующий раз
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
    // Игрок уже отказался грузить именно эту версию — второй раз не пристаём
    if (serverVersion <= _cloudPromptSkippedVersion) return false;

    console.log('[Sync] Обнаружено обновление с другого устройства! v' + serverVersion);

    const applied = await resolveCloudDivergence(json.data, serverVersion, json.saved_at);
    if (!applied) _cloudPromptSkippedVersion = serverVersion;
    return applied;
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