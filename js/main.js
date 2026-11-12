// ═══════════════════════════════════════════════════════════════
//  MAIN.JS — цикл, canvas, ввод, зум, панорама, галактика
// ═══════════════════════════════════════════════════════════════

// Защита от незагруженных глобальных переменных состояния
if (typeof window.S === 'undefined') window.S = { stage: 'galaxy', zoom: 1, panX: 0, panY: 0, rotation: 0, tiltX: 0, tiltY: 0, totalSystemsCreated: 1, activeSystemIdx: 0, otherSystems: {} };
if (typeof window.PART === 'undefined') window.PART = { dragActive: false, dragX: 0, dragY: 0 };

const canvas = document.getElementById('sky');
const ctx = canvas.getContext('2d');
let W, H, cx, cy, dpr;
let cachedBgGradient = null; // Оптимизация: кэш градиента фона

// ─── Fullscreen ─────────────────────────────────────────────────
// ★ Полноэкранный режим — это ЦЕПОЧКА фолбэков, а не один вызов:
//   1) Telegram WebApp API (Bot API 8.0+), 2) нативный Fullscreen API,
//   3) webkit-фолбэк, 4) расширение вьюпорта (expand).
// Раньше стоял латч-флаг: первый неудачный вызов (например, iframe без
// allowfullscreen или Telegram < 8.0) навсегда блокировал повтор — поэтому
// режим «перестал работать». Теперь флаг ставится только по факту успеха,
// а вход/выход выполняет явная кнопка ⛶ в HUD (и Telegram при старте).
let fullscreenRequested = false;

function _fsActive() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

function _afterFullscreenEnter() {
  fullscreenRequested = true;
  window._fsWarned = false;
  document.body.classList.add('fs-active');
  if (typeof resize === 'function') setTimeout(resize, 60);
  setTimeout(function() {
    if (typeof resize === 'function') resize();
    if (typeof syncTelegramLayout === 'function') syncTelegramLayout();
  }, 350);
}

function _tgFullscreenAvailable(tg) {
  // ★ Ориентируемся на наличие метода, а не только на строку версии:
  // клиент может сообщать устаревшую версию через старый SDK, но сам
  // полноэкранный режим уже поддерживать. Если метода нет — её и не будет.
  return !!(tg && typeof tg.requestFullscreen === 'function');
}

// Нативный Fullscreen API + webkit-фолбэк. Вызывать только по жесту.
function _nativeFullscreen(tg, manual) {
  const el = document.documentElement;
  const done = function() { _afterFullscreenEnter(); };
  const fail = function() {
    // 3) webkit-фолбэк
    if (el.webkitRequestFullscreen) {
      try { el.webkitRequestFullscreen(); return; } catch (e2) { /* ниже */ }
    }
    // 4) хотя бы развернуть вьюпорт Telegram
    try { if (tg && tg.expand) tg.expand(); } catch (e3) { /* ignore */ }
    // 5) один раз объясняем, почему полного экрана нет
    if (manual && !window._fsWarned) {
      window._fsWarned = true;
      if (typeof toast === 'function') {
        const tgModern = !!(tg && typeof tg.isVersionAtLeast === 'function' && tg.isVersionAtLeast('8.0'));
        if (tg && !tgModern) {
          toast('Обновите Telegram', 'Встроенный полный экран появился в Bot API 8.0 — обновите приложение');
        } else {
          toast('Полный экран недоступен', 'Браузер не разрешил полноэкранный режим');
        }
      }
    }
  };
  try {
    if (el.requestFullscreen) {
      const p = el.requestFullscreen({ navigationUI: 'hide' });
      if (p && typeof p.then === 'function') p.then(done).catch(fail);
      else done();
      return true;
    }
    if (el.webkitRequestFullscreen) {
      const w = el.webkitRequestFullscreen();
      if (w && typeof w.then === 'function') w.then(done).catch(fail);
      else done();
      return true;
    }
  } catch (e) { /* ignore */ }
  fail();
  return false;
}

function requestFullscreen(manual) {
  if (fullscreenRequested || _fsActive()) return;

  const tg = window.Telegram && window.Telegram.WebApp;

  // 1) Telegram native fullscreen (Bot API 8.0+). Метод может существовать,
  //    но не переключать клиент (десктоп/старая сборка), поэтому проверяем факт.
  if (_tgFullscreenAvailable(tg)) {
    let called = false;
    try { tg.requestFullscreen(); called = true; } catch (e) { called = false; }
    if (called) {
      setTimeout(function() {
        if (fullscreenRequested || _fsActive()) return;
        if (tg && tg.isFullscreen === true) { _afterFullscreenEnter(); return; }
        // Нативный Fullscreen API пробуем только там, где он реально есть.
        // На iOS его нет: там ждём событие Telegram и не пугаем игрока тостом.
        if (document.fullscreenEnabled || document.webkitFullscreenEnabled) {
          _nativeFullscreen(tg, manual);
        } else if (manual && !window._fsWarned) {
          window._fsWarned = true;
          if (typeof toast === 'function') {
            toast('Полный экран недоступен', 'Обновите Telegram: встроенный полный экран требует Bot API 8.0');
          }
        }
      }, 600);
      return;
    }
  }

  // 2) Нативный Fullscreen API (вызов из клика по кнопке — жест есть)
  _nativeFullscreen(tg, manual);
}

// Telegram сообщил, что войти в полный экран не удалось (Bot API 8.0+).
function _tgFullscreenFailed(err) {
  fullscreenRequested = false;
  document.body.classList.remove('fs-active');
  if (typeof resize === 'function') setTimeout(resize, 60);
  if (err === 'ALREADY_FULLSCREEN') { _afterFullscreenEnter(); return; }
  if (typeof toast !== 'function') return;
  window._fsWarned = true;
  if (err === 'UNSUPPORTED') {
    toast('Полный экран недоступен', 'Обновите Telegram: встроенный полный экран требует Bot API 8.0');
  } else {
    toast('Не удалось включить полный экран', 'Попробуйте ещё раз');
  }
}

// Ручной тумблер из окна настроек: вход/выход из полного экрана.
function toggleFullscreen() {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (_fsActive()) {
    try {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch (e) { /* ignore */ }
    return;
  }
  if (tg && tg.isFullscreen === true && typeof tg.exitFullscreen === 'function') {
    try { tg.exitFullscreen(); } catch (e) { /* ignore */ }
    return;
  }
  // Сбрасываем возможный залипший флаг, чтобы попытка точно произошла.
  fullscreenRequested = false;
  requestFullscreen(true);
}

// События входа/выхода: синхронизируем состояние и размеры канваса
(function initFullscreenEvents() {
  const onEnter = function() { _afterFullscreenEnter(); };
  const onExit = function() {
    fullscreenRequested = false;
    document.body.classList.remove('fs-active');
    if (typeof resize === 'function') setTimeout(resize, 60);
  };
  if (document.addEventListener) {
    document.addEventListener('fullscreenchange', function() {
      if (_fsActive()) onEnter(); else onExit();
    });
    document.addEventListener('webkitfullscreenchange', function() {
      if (_fsActive()) onEnter(); else onExit();
    });
    document.addEventListener('fullscreenerror', function() { fullscreenRequested = false; });

    // ★ Автовход по касанию убран: он перехватывал первый клик и мешал
    // кнопке полного экрана (pointerdown входил, click сразу выходил).
    // Теперь режимом управляет только кнопка ⛶ в HUD (и Telegram при старте).
  }
})();

// ─── Защита от жестов (скролл страницы и т.д.) ───────────────────
document.addEventListener('touchmove', function(e) {
  const target = e.target;
  if (target && target.closest && target.closest('input[type="range"], .modal-card, .lore-content, .guide-panel, .quests-panel')) return;
  if (e.touches.length > 1) { e.preventDefault(); return; }
  e.preventDefault();
}, { passive: false });

document.addEventListener('gesturestart', function(e) { e.preventDefault(); }, { passive: false });
document.addEventListener('gesturechange', function(e) { e.preventDefault(); }, { passive: false });

// ─── Resize ─────────────────────────────────────────────────────
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  let realW = canvas.clientWidth, realH = canvas.clientHeight;
  if (!realW || realW < 10) realW = window.innerWidth;
  if (!realH || realH < 10) realH = window.innerHeight;

  if (realW === W && realH === H && canvas.width > 0) return;

  W = realW; H = realH;
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cx = W / 2; cy = H / 2;
  window.CANVAS_CX = cx; window.CANVAS_CY = cy;
  window.CANVAS_W = W; window.CANVAS_H = H;

  // Пересчитываем градиент только при изменении размеров экрана
  cachedBgGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.9);
  cachedBgGradient.addColorStop(0, '#0a0620');
  cachedBgGradient.addColorStop(1, '#02010a');
}
window.addEventListener('resize', resize);

let orientationTimeout = null;
window.addEventListener('orientationchange', function() {
  if (orientationTimeout) clearTimeout(orientationTimeout);
  orientationTimeout = setTimeout(function() {
    resize();
    setTimeout(resize, 250);
  }, 150);
});

// ─── Камера ─────────────────────────────────────────────────────
function applyZoom(factor) {
  S.zoom = clampZoom((S.zoom || 1) * factor);
}
window.applyZoom = applyZoom;

// ★ Пределы зума зависят от фазы. В галактике нужно увидеть ВСЮ карту,
// поэтому минимальный зум считается по реальному радиусу скопления.
let _galaxyRadiusCache = { key: '', value: 0 };
function maxGalaxyRadius() {
  const total = Math.max(1, Number(S.totalSystemsCreated) || 1);
  const form = S.galaxyForm || 'spiral';
  const cacheKey = total + '|' + form;
  if (_galaxyRadiusCache.key === cacheKey) return _galaxyRadiusCache.value;
  let maxR = 0;
  for (let i = 0; i < total; i++) {
    let bx = 0, by = 0;
    if (form === 'ring') {
      const angle = (i / total) * Math.PI * 2;
      const dist = 90 + Math.min(8, Math.floor(i / 10)) * 60;
      bx = Math.cos(angle) * dist; by = Math.sin(angle) * dist * 0.6;
    } else if (form === 'elliptical') {
      const angle = i * 2.399963;
      const r = 45 + Math.sqrt(i) * 28;
      bx = Math.cos(angle) * r * 1.5; by = Math.sin(angle) * r * 0.75;
    } else if (form === 'irregular') {
      const angle = i * 2.399963 + Math.sin(i * 3.7) * 0.9;
      const r = 35 + ((i * 47) % 140) + Math.sin(i * 1.7) * 30;
      bx = Math.cos(angle) * r * 1.3; by = Math.sin(angle) * r * 0.8;
    } else {
      const arm = Math.floor(i / 3), idx = i % 3;
      const angle = arm * Math.PI / 2 + idx * 0.5;
      const dist = 60 + arm * 80 + idx * 25;
      bx = Math.cos(angle) * dist; by = Math.sin(angle) * dist * 0.5;
    }
    const r = Math.hypot(bx, by);
    if (r > maxR) maxR = r;
  }
  _galaxyRadiusCache = { key: total + '|' + form, value: maxR };
  return maxR;
}
function galaxyFitZoom() {
  if (S.stage !== 'galaxy') return 1;
  const vw = (typeof W === 'number' && W > 0) ? W : (window.innerWidth || 360);
  const vh = (typeof H === 'number' && H > 0) ? H : (window.innerHeight || 640);
  const viewport = Math.min(vw, vh);
  const radius = Math.max(160, maxGalaxyRadius());
  return Math.max(0.00002, Math.min(0.9, (viewport * 0.44) / (radius + 70)));
}
// ★ «Почти бесконечное» отдаление: можно уйти далеко за границу карты,
// чтобы увидеть галактику с тысячами (и более) систем.
function minZoomForStage() {
  if (S.stage !== 'galaxy') return 0.4;
  return Math.max(0.00001, galaxyFitZoom() * 0.01);
}
function clampZoom(value) {
  const z = Number(value);
  if (!isFinite(z) || z <= 0) return 1;
  return Math.max(minZoomForStage(), Math.min(3.0, z));
}
window.minZoomForStage = minZoomForStage;
window.galaxyFitZoom = galaxyFitZoom;
window.clampZoom = clampZoom;
window.requestFullscreen = requestFullscreen;
window.toggleFullscreen = toggleFullscreen;

function sanitizeView() {
  if (!isFinite(S.zoom) || S.zoom <= 0) S.zoom = 1;
  S.zoom = clampZoom(S.zoom);
  if (!isFinite(S.panX)) S.panX = 0;
  if (!isFinite(S.panY)) S.panY = 0;
  if (!isFinite(S.rotation)) S.rotation = 0;
  if (!isFinite(S.tiltX)) S.tiltX = 0;
  if (!isFinite(S.tiltY)) S.tiltY = 0;

  // Ограничиваем панораму, чтобы не улететь в пустоту
  // ★ В галактике панорама должна покрывать всю карту на любом зуме.
  const maxPan = (S.stage === 'galaxy')
    ? Math.max(2000, maxGalaxyRadius() * Math.max(1, S.zoom || 1) + 3000)
    : 2000;
  S.panX = Math.max(-maxPan, Math.min(maxPan, S.panX));
  S.panY = Math.max(-maxPan, Math.min(maxPan, S.panY));
}

function rotateCamera(delta) {
  S.rotation = (S.rotation || 0) + delta;
  while (S.rotation > Math.PI) S.rotation -= Math.PI * 2;
  while (S.rotation < -Math.PI) S.rotation += Math.PI * 2;
}
window.rotateCamera = rotateCamera;

// ─── Wheel (зум колесиком) ──────────────────────────────────────
canvas.addEventListener('wheel', function(e) {
  e.preventDefault();
  const isMouseWheel = e.ctrlKey || e.deltaMode !== 0 ||
    (Math.abs(e.deltaY) >= 90 && Math.abs(e.deltaX) < 1);

  if (isMouseWheel) {
    applyZoom(e.ctrlKey ? Math.exp(-e.deltaY * 0.01) : (e.deltaY > 0 ? 0.90 : 1.11));
    return;
  }

  if (Math.abs(e.deltaX) > 0 || Math.abs(e.deltaY) > 0) {
    if (S.stage !== 'galaxy') {
      S.panX = (S.panX || 0) - e.deltaX;
      S.panY = (S.panY || 0) - e.deltaY;
    } else {
      applyZoom(e.deltaY > 0 ? 0.92 : 1.08);
    }
  }
}, { passive: false });

// ─── Ввод (Pointer Events) ──────────────────────────────────────
function getPointerPos(e) {
  const rect = canvas.getBoundingClientRect();
  const t = e.touches ? e.touches[0] : e;
  return { x: t.clientX - rect.left, y: t.clientY - rect.top };
}

const pointers = new Map();
let pinchStartDist = 0;
let pinchZoomOutDetected = false;
let pinchStartZoom = 1;
let pinchStartAngle = 0;
let pinchStartRotation = 0;
let panStartX = 0, panStartY = 0;
let panStartPanX = 0, panStartPanY = 0;
let isPanning = false;

canvas.addEventListener('pointerdown', function(e) {
  e.preventDefault();

  if (S.activeMinigame) {
    if (typeof MG !== 'undefined' && MG.type) {
      const pos = getPointerPos(e);
      if (typeof mgPointerDown === 'function') mgPointerDown(pos.x, pos.y);
      return;
    }
    S.activeMinigame = null;
  }

  // Полный экран — только по явной кнопке ⛶, без автовхода по тапу.
  if (typeof unlockAudio === 'function') unlockAudio();
  if (typeof trackDaily === 'function') trackDaily('d_click', 1);
  if (!S.stats) S.stats = {};
  S.stats.clicks = (S.stats.clicks || 0) + 1;
  
  if (typeof tryHitInvasionShip === 'function') {
    const pos = getPointerPos(e);
    if (tryHitInvasionShip(pos.x, pos.y)) return;
  }
  // Анимированные ежедневные события: сначала тап по событию,
  // и только потом обычная логика кликов/панорамирования.
  if (typeof tryHitEventVisual === 'function') {
    const evtPos = getPointerPos(e);
    if (tryHitEventVisual(evtPos.x, evtPos.y)) return;
  }

  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size === 2) {
    const pts = Array.from(pointers.values());
    pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    pinchZoomOutDetected = false;
    pinchStartZoom = S.zoom || 1;
    pinchStartAngle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
    pinchStartRotation = S.rotation || 0;
    handleParticleDrag(0, 0, false);
    isPanning = false;
    return;
  }

  if (pointers.size === 1) {
    const pos = getPointerPos(e);

    if (S.viewMode === 'free') {
      isPanning = true;
      panStartX = pos.x;
      panStartY = pos.y;
      panStartPanX = S.tiltX || 0;
      panStartPanY = S.tiltY || 0;
      return;
    }

    if (S.stage === 'galaxy') {
      const lod = galaxyLodLevel();
      const nowTap = performance.now();
      if (lod < 4) {
        const macroHit = galaxyMacroAt(pos.x, pos.y);
        if (macroHit >= 0) {
          // Двойной тап раскрывает объект: камера подлетает, затем LOD становится детальнее.
          if (galaxyTap.macro === macroHit && nowTap - galaxyTap.at <= GALAXY_DOUBLE_TAP_MS) {
            galaxyTap.macro = -1;
            galaxyTap.idx = -1;
            galaxyTap.at = 0;
            startGalaxyMacroDrill(macroHit);
            galaxySelectedMacro = -1;
            S.galaxySelectedIdx = -1;
            if (typeof playSFX === 'function') playSFX('ui_click');
            return;
          }
          S.galaxySelectedIdx = -1;
          galaxySelectedMacro = macroHit;
          galaxyTap.macro = macroHit;
          galaxyTap.idx = -1;
          galaxyTap.at = nowTap;
          if (typeof playSFX === 'function') playSFX('ui_click');
        } else {
          S.galaxySelectedIdx = -1;
          galaxySelectedMacro = -1;
          galaxyTap.macro = -1;
          galaxyTap.idx = -1;
        }
        isPanning = true;
        panStartX = pos.x;
        panStartY = pos.y;
        panStartPanX = S.panX || 0;
        panStartPanY = S.panY || 0;
        return;
      }
      const hit = galaxySystemAt(pos.x, pos.y);
      if (hit >= 0) {
        // ★ Двойной тап по системе — вход. Одиночный — только выбор.
        if (galaxyTap.idx === hit && nowTap - galaxyTap.at <= GALAXY_DOUBLE_TAP_MS) {
          galaxyTap.idx = -1;
          galaxyTap.at = 0;
          openGalaxySystem(hit);
          return;
        }
        S.galaxySelectedIdx = hit;
        galaxyTap.idx = hit;
        galaxyTap.at = nowTap;
        if (typeof playSFX === 'function') playSFX('ui_click');
      } else {
        S.galaxySelectedIdx = -1;
        galaxyTap.idx = -1;
      }
      // Свайп от звезды тоже панорамирует — одиночный тап не захватывает жест.
      isPanning = true;
      panStartX = pos.x;
      panStartY = pos.y;
      panStartPanX = S.panX || 0;
      panStartPanY = S.panY || 0;
      return;
    }

    // ★ ТАПЫ И ДРАГ В 1-3 ФАЗЕ
    if (S.stage === 'cloud' || S.stage === 'condense' || S.stage === 'protostar') {
      if (typeof handleParticleDrag === 'function') handleParticleDrag(pos.x, pos.y, true);
      if (S.stage === 'protostar' && typeof registerProtostarTap === 'function') {
        registerProtostarTap(pos.x, pos.y);
      }
      return;
    }

    // ★ ПАНОРАМИРОВАНИЕ (если есть звезда)
    if (S.starType) {
      isPanning = true;
      panStartX = pos.x;
      panStartY = pos.y;
      panStartPanX = S.panX || 0;
      panStartPanY = S.panY || 0;
      return;
    }

    if (typeof handleParticleDrag === 'function') handleParticleDrag(pos.x, pos.y, true);
  }
});

canvas.addEventListener('pointermove', function(e) {
  if (S.activeMinigame) {
    const pos = getPointerPos(e);
    if (typeof mgPointerMove === 'function') mgPointerMove(pos.x, pos.y);
    return;
  }

  if (pointers.has(e.pointerId)) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  if (pointers.size === 2 && pinchStartDist > 0) {
    e.preventDefault();
    const pts = Array.from(pointers.values());
    const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    S.zoom = clampZoom(pinchStartZoom * (d / pinchStartDist));
    if (d < pinchStartDist * 0.98) pinchZoomOutDetected = true;
    const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
    S.rotation = (pinchStartRotation || 0) + (angle - pinchStartAngle);
    return;
  }

  if (pointers.size === 1) {
    const pos = getPointerPos(e);
    if (isPanning) {
      if (S.viewMode === 'free') {
        S.tiltX = (panStartPanX || 0) + (pos.y - panStartY) * 0.005;
        S.tiltY = (panStartPanY || 0) + (pos.x - panStartX) * 0.005;
        while (S.tiltX > Math.PI) S.tiltX -= Math.PI * 2;
        while (S.tiltX < -Math.PI) S.tiltX += Math.PI * 2;
        while (S.tiltY > Math.PI) S.tiltY -= Math.PI * 2;
        while (S.tiltY < -Math.PI) S.tiltY += Math.PI * 2;
      } else {
        S.panX = panStartPanX + (pos.x - panStartX);
        S.panY = panStartPanY + (pos.y - panStartY);
      }
      return;
    }
    if (PART.dragActive) {
      e.preventDefault();
      handleParticleDrag(pos.x, pos.y, true);
    }
  }
});

function onPointerRelease(e) {
  if (S.activeMinigame) {
    if (typeof mgPointerUp === 'function') mgPointerUp();
    return;
  }
  pointers.delete(e.pointerId);
  if (pointers.size < 2) {
    if (pinchZoomOutDetected && S.stage === 'galaxy' && (S.zoom || 1) < 0.3) {
      const nextLevel = Math.max(0, galaxyLodLevel() - 1);
      if (nextLevel !== galaxyLodLevel()) {
        S.galaxyZoomLevel = nextLevel;
        S.galaxyManualLod = true;
        if (nextLevel < 4) S.galaxyFocus = null;
        galaxySelectedMacro = -1;
        S.galaxySelectedIdx = -1;
        galaxyTap.idx = -1;
        galaxyTap.macro = -1;
        galaxyTap.at = 0;
      }
    }
    pinchZoomOutDetected = false;
    pinchStartDist = 0;
  }
  if (pointers.size === 0) {
    isPanning = false;
    if (PART.dragActive) handleParticleDrag(PART.dragX, PART.dragY, false);
  }
}
canvas.addEventListener('pointerup', onPointerRelease);
canvas.addEventListener('pointercancel', onPointerRelease);
canvas.addEventListener('pointerleave', onPointerRelease);
canvas.addEventListener('contextmenu', function(e) { e.preventDefault(); });

// ═══════════════════════════════════════════════════════════════
//  ГАЛАКТИКА (Позиции и отрисовка)
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
//  ГАЛАКТИКА: созвездия
//  Каждая группа из CONSTELLATION_SIZE систем — отдельное созвездие.
//  Связи рисуются только внутри группы, поэтому карта читается как
//  набор фигур, а не как одна длинная нить.
// ═══════════════════════════════════════════════════════════════
const CONSTELLATION_SIZE = 7;

// ─── Реальные созвездия для LOD-уровня 2 ────────────────────────
// Координаты нормализованы в диапазон [-1, 1]: рисуются внутри
// макро-объекта «Созвездие» вместо отдельных звёзд.
const REAL_CONSTELLATIONS = [
  {
    name: 'Ориона',
    stars: [
      { x: -0.52, y: -0.46 }, { x: 0.34, y: -0.55 },
      { x: -0.18, y: 0.02 }, { x: 0.04, y: 0.22 }, { x: 0.26, y: 0.42 },
      { x: 0.42, y: 0.86 }, { x: -0.34, y: 0.80 }
    ],
    edges: [[0, 2], [1, 4], [2, 3], [3, 4], [2, 6], [4, 5]]
  },
  {
    name: 'Кассиопеи',
    stars: [
      { x: -0.92, y: 0.28 }, { x: -0.46, y: -0.38 },
      { x: 0.0, y: 0.18 }, { x: 0.46, y: -0.38 }, { x: 0.92, y: 0.28 }
    ],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4]]
  },
  {
    name: 'Большой Медведицы',
    stars: [
      { x: -0.92, y: -0.25 }, { x: -0.62, y: -0.55 },
      { x: -0.28, y: -0.48 }, { x: -0.06, y: -0.16 },
      { x: 0.22, y: -0.30 }, { x: 0.58, y: -0.12 }, { x: 0.86, y: 0.18 }
    ],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]]
  }
];

// Проекция мировой точки галактики в экран (камера: поворот, наклон, пан, зум).
function galaxyProjectWorld(bx, by) {
  const rot = S.rotation || 0;
  const cosR = Math.cos(rot), sinR = Math.sin(rot);
  const x1 = bx * cosR - by * sinR;
  const y1 = bx * sinR + by * cosR;
  const yaw = S.tiltY || 0;
  const pitch = S.tiltX || 0;
  const cyw = Math.cos(yaw), syw = Math.sin(yaw);
  const cpi = Math.cos(pitch), spi = Math.sin(pitch);
  const x3 = x1 * cyw;
  const y3 = y1 * cpi - x1 * syw * spi;
  const z = S.zoom || 1;
  return {
    x: cx + (S.panX || 0) + x3 * z,
    y: cy + (S.panY || 0) + y3 * z
  };
}

// Базовые координаты системы в плоскости галактики (до камеры).
function galaxyLayoutPos(i, total, t) {
  const form = S.galaxyForm || 'spiral';
  if (form === 'ring') {
    const angle = (i / Math.max(1, total)) * Math.PI * 2 + t * 0.02;
    const dist = 90 + Math.min(8, Math.floor(i / 10)) * 60;
    return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist * 0.6 };
  }
  if (form === 'elliptical') {
    const angle = i * 2.399963 + t * 0.01;
    const r = 45 + Math.sqrt(i) * 28;
    return { x: Math.cos(angle) * r * 1.5, y: Math.sin(angle) * r * 0.75 };
  }
  if (form === 'irregular') {
    const angle = i * 2.399963 + Math.sin(i * 3.7) * 0.9 + t * 0.005;
    const r = 35 + ((i * 47) % 140) + Math.sin(i * 1.7) * 30;
    return { x: Math.cos(angle) * r * 1.3, y: Math.sin(angle) * r * 0.8 };
  }
  // Спиральная
  const arm = Math.floor(i / 3), idx = i % 3;
  const angle = arm * Math.PI / 2 + idx * 0.5 + t * 0.02;
  const dist = 60 + arm * 80 + idx * 25;
  return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist * 0.5 };
}

function galaxySystemPos(i, total, time) {
  const t = time || 0;
  const base = galaxyLayoutPos(i, total, t);
  let bx = base.x, by = base.y;
  // Анимация престижа
  if (S.vis && S.vis.prestigeAnim) {
    const el = performance.now() - S.vis.prestigeAnim.start;
    if (S.vis.prestigeAnim.phase === 'pull') {
      const p = Math.min(1, el / 1500);
      const ease = p * p * (3 - 2 * p);
      bx *= (1 - ease); by *= (1 - ease);
    } else if (S.vis.prestigeAnim.phase === 'explode') {
      bx = 0; by = 0;
    } else if (S.vis.prestigeAnim.phase === 'push') {
      const p = Math.min(1, (el - 2000) / 1500);
      const ease = p * p * (3 - 2 * p);
      bx *= ease; by *= ease;
    }
  }
  return galaxyProjectWorld(bx, by);
}

// ─── LOD: макро-объекты галактики ──────────────────────────────
// Кэш групп: пересобирается при смене total/level и не чаще 1 раза
// в секунду (прайм-флаги могут измениться без роста числа систем).
let _macroGroupCache = { key: '', at: 0, groups: [] };
let _galaxyFrameId = 0;
let _macroObjectsCache = { key: '', objects: [] };

function galaxyLodLevel() {
  let lvl = Math.floor(Number(S.galaxyZoomLevel));
  if (!isFinite(lvl)) {
    lvl = (typeof galaxyLodForTotal === 'function')
      ? galaxyLodForTotal(S.totalSystemsCreated || 1) : 4;
  }
  const total = Math.max(1, Number(S.totalSystemsCreated) || 1);
  if (S.galaxyFocus && lvl >= 4) return 4;
  const auto = (typeof galaxyLodForTotal === 'function')
    ? galaxyLodForTotal(total) : 4;
  // Без явного drill-а игра не должна открывать более детальный LOD,
  // чем безопасный для текущего числа систем. Иначе старый сейв с LOD 4
  // снова показывал бы все системы с подписями.
  if (!S.galaxyManualLod && lvl > auto) lvl = auto;
  // Полный звёздный вид — только для маленькой галактики или после
  // раскрытия конкретного созвездия.
  if (!S.galaxyFocus && lvl >= 4 && total > 9) lvl = 3;
  if (typeof clampGalaxyLodForTotal === 'function') {
    return clampGalaxyLodForTotal(lvl, total);
  }
  return Math.max(0, Math.min(4, lvl));
}
function galaxyMacroInFocus(o) {
  const f = S.galaxyFocus;
  if (!f) return true;
  return o.start >= f.start && o.start < f.end;
}

function galaxyMacroNearestIndex(x, y, level) {
  const total = Math.max(1, S.totalSystemsCreated || 1);
  const objects = galaxyMacroObjects(performance.now() / 1000, total, level);
  let best = -1, bestD = Infinity;
  for (let i = 0; i < objects.length; i++) {
    const o = objects[i];
    if (!galaxyMacroInFocus(o)) continue;
    const d = Math.hypot(o.x - x, o.y - y);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function fitGalaxyAutoFocus(parent, target) {
  const total = Math.max(1, S.totalSystemsCreated || 1);
  const now = performance.now() / 1000;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  if (target < 4) {
    const children = galaxyMacroObjects(now, total, target);
    for (let i = 0; i < children.length; i++) {
      const c = children[i];
      if (c.start < parent.start || c.start >= parent.end) continue;
      if (c.x < minX) minX = c.x;
      if (c.x > maxX) maxX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.y > maxY) maxY = c.y;
    }
  } else {
    for (let i = parent.start; i < parent.end; i++) {
      const p = galaxySystemPos(i, total, now);
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!isFinite(minX) || !isFinite(minY)) return;
  const vw = (typeof W === 'number' && W > 0) ? W : (window.innerWidth || 400);
  const vh = (typeof H === 'number' && H > 0) ? H : (window.innerHeight || 700);
  const bw = Math.max(60, maxX - minX);
  const bh = Math.max(60, maxY - minY);
  let factor = Math.min(1, (vw * 0.72) / bw, (vh * 0.55) / bh);
  factor = Math.max(0.35, factor);
  const bcx = (minX + maxX) / 2;
  const bcy = (minY + maxY) / 2;
  S.panX = (S.panX + cx - bcx) * factor;
  S.panY = (S.panY + cy - bcy) * factor;
  const z = (typeof clampZoom === 'function') ? clampZoom((Number(S.zoom) || 1) * factor) : (Number(S.zoom) || 1) * factor;
  S.zoom = z;
  if (S.galaxyFocus) S.galaxyFocus.zoom = z;
}

function applyGalaxyAutoLod(target, fromLevel) {
  if (target === fromLevel) return false;
  S.galaxyZoomLevel = target;
  S.galaxyManualLod = true;
  if (target > fromLevel) {
    let idx = galaxyMacroAt(cx, cy);
    if (idx < 0) idx = galaxyMacroNearestIndex(cx, cy, fromLevel);
    if (idx >= 0) {
      const objects = galaxyMacroObjects(performance.now() / 1000, S.totalSystemsCreated || 1, fromLevel);
      const o = objects[idx];
      if (o) {
        S.galaxyFocus = {
          start: o.start,
          end: o.end,
          name: (typeof galaxyMacroName === 'function' ? galaxyMacroName(fromLevel, o.index) : o.label),
          zoom: Number(S.zoom) || 1
        };
        fitGalaxyAutoFocus(o, target);
      }
    } else {
      S.galaxyFocus = null;
    }
  } else {
    S.galaxyFocus = null;
  }
  galaxySelectedMacro = -1;
  S.galaxySelectedIdx = -1;
  return true;
}

// Плавное «раскрытие/сворачивание» по зуму: приближение входит в объект
// под центром экрана, отдаление возвращает к более крупным макро-объектам.
function updateGalaxyZoomLod() {
  if (S.stage !== 'galaxy') return;
  if (S.vis && S.vis.macroDrill) return;
  const total = Math.max(1, S.totalSystemsCreated || 1);
  if (total <= 9) return;
  const base = (typeof galaxyLodForTotal === 'function') ? galaxyLodForTotal(total) : 4;
  const lvl = galaxyLodLevel();
  if (lvl < base) return;
  const fit = (typeof galaxyFitZoom === 'function') ? galaxyFitZoom() : 1;
  if (!isFinite(fit) || fit <= 0) return;
  const ratio = Math.max(0.01, (Number(S.zoom) || 1) / fit);
  const UP = [1.45, 2.4, 4.0, 6.4];
  let target = lvl;
  if (S.galaxyFocus) {
    const fz = Number(S.galaxyFocus.zoom) || fit;
    if (lvl > base && (Number(S.zoom) || 1) < fz * 0.72) target = lvl - 1;
    else if (lvl < 4 && (Number(S.zoom) || 1) > fz * 1.55) target = lvl + 1;
  } else if (lvl < 4 && ratio > UP[lvl]) {
    target = lvl + 1;
  } else if (lvl > base && ratio < UP[lvl - 1] * 0.8) {
    target = lvl - 1;
  }
  if (target !== lvl) applyGalaxyAutoLod(target, lvl);
}


function getGalaxyMacroGroups(total, level, now) {
  const n = Math.max(1, Number(total) || 1);
  const key = n + '|' + level;
  const stamp = Number(now) || (typeof performance !== 'undefined' ? performance.now() : Date.now());
  if (_macroGroupCache.key === key && stamp - _macroGroupCache.at < 1000) {
    return _macroGroupCache.groups;
  }
  const size = Math.max(1, Number(galaxyGroupSizeForLevel(level)) || 1);
  const count = Math.max(1, Math.ceil(n / size));
  const prime = new Uint8Array(n);
  const activeIdx = Math.max(0, Math.min(n - 1, Number(S.activeSystemIdx) || 0));
  if (S.primeSystem) prime[activeIdx] = 1;
  const list = Array.isArray(S.otherSystems) ? S.otherSystems : [];
  for (let i = 0; i < list.length && i < n; i++) {
    if (!list[i]) continue;
    if (list[i].isPrime || (typeof isPrimeSystemData === 'function' && isPrimeSystemData(list[i]))) {
      prime[i] = 1;
    }
  }
  const groups = [];
  for (let g = 0; g < count; g++) {
    const start = g * size;
    const end = Math.min(n, start + size);
    let primeCount = 0;
    const primeIndices = [];
    for (let i = start; i < end; i++) {
      if (!prime[i]) continue;
      primeCount++;
      primeIndices.push(i);
    }
    groups.push({ index: g, start: start, end: end, count: Math.max(0, end - start), primeCount: primeCount, primeIndices: primeIndices });
  }
  _macroGroupCache = { key: key, at: stamp, groups: groups };
  return groups;
}

function galaxyMacroLabel(obj, level) {
  const lvl = Math.max(0, Math.min(3, Math.floor(Number(level) || 0)));
  const base = (typeof galaxyMacroName === 'function')
    ? galaxyMacroName(lvl, obj.index)
    : (((typeof galaxyLodMeta === 'function' ? galaxyLodMeta(lvl) : null) || {}).label || 'Объект');
  return base + ' (' + obj.count + ' сист.' + (obj.primeCount > 0 ? ' 👑' + obj.primeCount : '') + ')';
}

function galaxyMacroObjects(time, total, level) {
  const camKey = [
    total, level, _galaxyFrameId,
    Math.round((S.panX || 0) * 10), Math.round((S.panY || 0) * 10),
    Math.round((S.zoom || 1) * 1000), Math.round((S.rotation || 0) * 1000),
    Math.round((S.tiltX || 0) * 1000), Math.round((S.tiltY || 0) * 1000),
    (typeof window !== 'undefined' && window.CANVAS_W) || W || 0,
    (typeof window !== 'undefined' && window.CANVAS_H) || H || 0
  ].join('|');
  if (_macroObjectsCache.key === camKey) return _macroObjectsCache.objects;
  const groups = getGalaxyMacroGroups(total, level, typeof performance !== 'undefined' ? performance.now() : Date.now());
  const count = groups.length;
  const objects = [];
  for (let i = 0; i < count; i++) {
    const g = groups[i];
    const rep = g.start + Math.floor(Math.max(1, g.count) / 2);
    const base = galaxyLayoutPos(rep, Math.max(1, total), time);
    const pos = galaxyProjectWorld(base.x, base.y);
    objects.push({
      index: g.index, start: g.start, end: g.end, count: g.count,
      primeCount: g.primeCount, x: pos.x, y: pos.y,
      worldX: base.x, worldY: base.y, r: 24,
      label: galaxyMacroLabel(g, level)
    });
  }
  const cw = (typeof window !== 'undefined' && window.CANVAS_W) || W || 400;
  const ch = (typeof window !== 'undefined' && window.CANVAS_H) || H || 700;
  const minDim = Math.max(120, Math.min(cw, ch));
  const fit = Math.max(0.00001, (typeof galaxyFitZoom === 'function' ? galaxyFitZoom() : 1));
  const zoomScale = Math.max(0.55, Math.min(2.2, (S.zoom || 1) / fit));
  for (let i = 0; i < count; i++) {
    const o = objects[i];
    let nearest = Infinity;
    for (let j = 0; j < count; j++) {
      if (j === i) continue;
      const dx = objects[j].x - o.x, dy = objects[j].y - o.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < nearest) nearest = d;
    }
    const baseR = (count === 1 || !isFinite(nearest))
      ? minDim * 0.30
      : Math.min(nearest * 0.42, minDim * 0.24);
    o.r = Math.max(18, Math.min(170, baseR * zoomScale));
  }
  _macroObjectsCache = { key: camKey, objects: objects };
  return objects;
}

function galaxyMacroAt(x, y) {
  const level = galaxyLodLevel();
  if (level >= 4) return -1;
  const total = Math.max(1, S.totalSystemsCreated || 1);
  const objects = galaxyMacroObjects(performance.now() / 1000, total, level);
  let best = -1, bestD = Infinity;
  for (let i = 0; i < objects.length; i++) {
    const o = objects[i];
    if (!galaxyMacroInFocus(o)) continue;
    const d = Math.hypot(o.x - x, o.y - y);
    if (d <= o.r * 0.95 + 8 && d < bestD) { bestD = d; best = o.index; }
  }
  return best;
}
// ─── Раскрытие макро-объекта ────────────────────────────────────
// Двойной тап по объекту не просто меняет LOD: камера плавно
// подлетает к нему, а затем раскрывается следующий уровень.
function startGalaxyMacroDrill(index) {
  const total = Math.max(1, S.totalSystemsCreated || 1);
  const level = galaxyLodLevel();
  if (level >= 4) return false;
  const objects = galaxyMacroObjects(performance.now() / 1000, total, level);
  const o = objects[index];
  if (!o) return false;
  const targetLevel = Math.min(4, level + 1);
  const focus = {
    start: o.start,
    end: o.end,
    name: (typeof galaxyMacroName === 'function' ? galaxyMacroName(level, o.index) : o.label)
  };
  const fromZoom = Math.max(0.00002, Number(S.zoom) || 1);
  const fromPanX = Number(S.panX) || 0;
  const fromPanY = Number(S.panY) || 0;
  let targetZoom = Math.min(3, Math.max(fromZoom * 2.0, fromZoom + 0.25, 0.55));
  let centerX = o.x, centerY = o.y;
  if (focus) {
    const now = performance.now() / 1000;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = focus.start; i < focus.end; i++) {
      const p = galaxySystemPos(i, total, now);
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    if (isFinite(minX)) {
      const bw = Math.max(60, maxX - minX);
      const bh = Math.max(60, maxY - minY);
      const vw = (typeof W === 'number' && W > 0) ? W : (window.innerWidth || 400);
      const vh = (typeof H === 'number' && H > 0) ? H : (window.innerHeight || 700);
      const fit = Math.min((vw * 0.72) / bw, (vh * 0.55) / bh);
      targetZoom = Math.min(2.0, Math.max(fromZoom * 1.05, fromZoom * fit));
      centerX = (minX + maxX) / 2;
      centerY = (minY + maxY) / 2;
    }
    focus.zoom = targetZoom;
  }
  const tx = (centerX - cx - fromPanX) / fromZoom;
  const ty = (centerY - cy - fromPanY) / fromZoom;
  const toPanX = -tx * targetZoom;
  const toPanY = -ty * targetZoom;
  if (!S.vis) S.vis = { collapse: 0, macroMergeAnims: {} };
  S.vis.macroDrill = {
    start: performance.now(),
    duration: 680,
    fromLevel: level,
    targetLevel: targetLevel,
    focus: focus,
    focusIndex: index,
    startX: o.x,
    startY: o.y,
    fromZoom: fromZoom,
    toZoom: targetZoom,
    fromPanX: fromPanX,
    fromPanY: fromPanY,
    toPanX: toPanX,
    toPanY: toPanY
  };
  return true;
}

function updateGalaxyMacroDrill(now) {
  const d = S.vis && S.vis.macroDrill;
  if (!d) return;
  const raw = (Number(now) - d.start) / d.duration;
  const p = Math.max(0, Math.min(1, raw));
  const ease = p * p * (3 - 2 * p);
  S.zoom = d.fromZoom + (d.toZoom - d.fromZoom) * ease;
  S.panX = d.fromPanX + (d.toPanX - d.fromPanX) * ease;
  S.panY = d.fromPanY + (d.toPanY - d.fromPanY) * ease;
  if (p >= 1) {
    if (d.targetLevel !== d.fromLevel) {
      S.galaxyZoomLevel = d.targetLevel;
      S.galaxyManualLod = true;
      S.galaxyFocus = d.focus || null;
      galaxySelectedMacro = -1;
      S.galaxySelectedIdx = -1;
    } else {
      galaxySelectedMacro = d.focusIndex;
    }
    S.vis.macroDrill = null;
  }
}

function drawGalaxyMacroDrillEffect() {
  const d = S.vis && S.vis.macroDrill;
  if (!d) return;
  const raw = (performance.now() - d.start) / d.duration;
  const p = Math.max(0, Math.min(1, raw));
  if (p >= 1) return;
  const ease = p * p * (3 - 2 * p);
  const x = d.startX + (cx - d.startX) * ease;
  const y = d.startY + (cy - d.startY) * ease;
  const radius = 18 + ease * 120;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
  glow.addColorStop(0, 'rgba(210, 195, 255, ' + (0.26 * (1 - p)) + ')');
  glow.addColorStop(0.55, 'rgba(150, 120, 255, ' + (0.10 * (1 - p)) + ')');
  glow.addColorStop(1, 'rgba(120, 90, 255, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(220, 210, 255, ' + (0.55 * (1 - p)) + ')';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.78, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}


// ─── Кэш созвездий ──────────────────────────────────────────────
// Группируем звёзды по близости на карте, а не по порядку индексов:
// так фигуры остаются компактными при любой форме галактики.
let _constellationCache = { key: '', groups: [] };

// Минимальное остовное дерево внутри группы: соединяем только близких
// соседей — без «паутины» через всю галактику.
function constellationMst(pts, members) {
  const n = members.length;
  const inTree = new Array(n).fill(false);
  const dist = new Array(n).fill(Infinity);
  const from = new Array(n).fill(-1);
  const edges = [];
  dist[0] = 0;
  for (let step = 0; step < n; step++) {
    let u = -1;
    for (let k = 0; k < n; k++) {
      if (!inTree[k] && (u < 0 || dist[k] < dist[u])) u = k;
    }
    if (u < 0) break;
    inTree[u] = true;
    if (from[u] >= 0) edges.push([from[u], u]);
    const pu = pts[members[u]];
    for (let v = 0; v < n; v++) {
      if (inTree[v]) continue;
      const pv = pts[members[v]];
      const d = (pv.x - pu.x) * (pv.x - pu.x) + (pv.y - pu.y) * (pv.y - pu.y);
      if (d < dist[v]) { dist[v] = d; from[v] = u; }
    }
  }
  return edges;
}

function galaxyConstellationGroups(total) {
  const form = S.galaxyForm || 'spiral';
  const key = total + '|' + form;
  if (_constellationCache.key === key) return _constellationCache.groups;

  const pts = [];
  for (let i = 0; i < total; i++) {
    const p = galaxyLayoutPos(i, total, 0);
    pts.push({ x: p.x, y: p.y });
  }

  const groups = [];
  if (total > 900) {
    // Очень большая галактика: не тратим кадр на поиск соседей.
    for (let start = 0; start < total; start += CONSTELLATION_SIZE) {
      const members = [];
      const stop = Math.min(total, start + CONSTELLATION_SIZE);
      for (let i = start; i < stop; i++) members.push(i);
      const edges = [];
      for (let k = 0; k + 1 < members.length; k++) edges.push([k, k + 1]);
      groups.push({ members: members, edges: edges });
    }
  } else {
    // ★ Масштаб созвездия: соединяем только звёзды, которые реально рядом.
    //   Среднее расстояние до ближайшего соседа не даёт «паутине» растянуться
    //   через всю галактику, когда систем много.
    let nnSum = 0, nnCount = 0;
    const nnSample = Math.min(total, 120);
    for (let i = 0; i < nnSample; i++) {
      let nearest = Infinity;
      for (let j = 0; j < total; j++) {
        if (j === i) continue;
        const dx = pts[j].x - pts[i].x, dy = pts[j].y - pts[i].y;
        const d = dx * dx + dy * dy;
        if (d < nearest) nearest = d;
      }
      if (isFinite(nearest)) { nnSum += Math.sqrt(nearest); nnCount++; }
    }
    const nnAvg = nnCount ? (nnSum / nnCount) : 0;
    const maxEdge = Math.max(60, nnAvg * 2.4); // предел длины связи
    const maxEdge2 = maxEdge * maxEdge;

    const used = new Array(total).fill(false);
    for (let seed = 0; seed < total; seed++) {
      if (used[seed]) continue;
      used[seed] = true;
      const members = [seed];
      while (members.length < CONSTELLATION_SIZE) {
        let best = -1, bestD = maxEdge2;
        for (let a = 0; a < members.length; a++) {
          const pa = pts[members[a]];
          for (let j = 0; j < total; j++) {
            if (used[j]) continue;
            const pj = pts[j];
            const d = (pj.x - pa.x) * (pj.x - pa.x) + (pj.y - pa.y) * (pj.y - pa.y);
            if (d < bestD) { bestD = d; best = j; }
          }
        }
        if (best < 0) break;
        used[best] = true;
        members.push(best);
      }
      const edges = constellationMst(pts, members).filter(function (e) {
        const a = pts[members[e[0]]], b = pts[members[e[1]]];
        return (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y) <= maxEdge2;
      });
      groups.push({ members: members, edges: edges });
    }
  }

  _constellationCache = { key: key, groups: groups };
  return groups;
}

// ─── Свечение звёзд ─────────────────────────────────────────────
// Один заранее отрисованный спрайт вместо createRadialGradient на
// каждую звезду: свечение получают ВСЕ системы, даже когда их сотни.
let _starGlowSprite = null;
function getStarGlowSprite() {
  if (_starGlowSprite) return _starGlowSprite;
  const SZ = 64;
  const off = document.createElement('canvas');
  off.width = SZ; off.height = SZ;
  const g = off.getContext('2d');
  const grad = g.createRadialGradient(SZ / 2, SZ / 2, 0, SZ / 2, SZ / 2, SZ / 2);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
  grad.addColorStop(0.22, 'rgba(214, 205, 255, 0.5)');
  grad.addColorStop(0.55, 'rgba(150, 140, 230, 0.16)');
  grad.addColorStop(1, 'rgba(130, 120, 210, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, SZ, SZ);
  _starGlowSprite = off;
  return off;
}

function drawStarGlow(x, y, size, isActive, total, alphaScale) {
  const sprite = getStarGlowSprite();
  const r = size * (isActive ? 3.6 : 3.2);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const twinkle = (typeof alphaScale === 'number') ? Math.max(0, alphaScale) : 1;
  ctx.globalAlpha = (isActive ? 0.85 : (total > 400 ? 0.42 : 0.6)) * twinkle;
  ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
//  СЛИЯНИЕ МАКРО-ОБЪЕКТОВ (10 / 50 / 150 / 450 систем)
// ═══════════════════════════════════════════════════════════════
function triggerGalaxyMerge(x, y, threshold) {
  if (!S.vis) S.vis = { collapse: 0, macroMergeAnims: {} };
  if (!S.vis.macroMergeAnims || typeof S.vis.macroMergeAnims !== 'object') S.vis.macroMergeAnims = {};
  const id = 'merge_' + threshold + '_' + Date.now();
  S.vis.macroMergeAnims[id] = {
    x: Number(x) || 0, y: Number(y) || 0,
    start: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    threshold: threshold
  };
  const keys = Object.keys(S.vis.macroMergeAnims);
  while (keys.length > 6) {
    delete S.vis.macroMergeAnims[keys.shift()];
  }
}

// Вызывается после покупки/основания систем. Сам решает, был ли переход порога.
function checkGalaxyMergeThresholds(prevTotal, newTotal) {
  const from = Math.max(0, Number(prevTotal) || 0);
  const to = Math.max(0, Number(newTotal) || 0);
  if (to <= from) return;
  const auto = (typeof galaxyLodForTotal === 'function')
    ? galaxyLodForTotal(to) : galaxyLodLevel();
  // На пороге переключаемся на более безопасный (крупный) LOD.
  if (galaxyLodLevel() > auto) { S.galaxyZoomLevel = auto; S.galaxyFocus = null; S.galaxyManualLod = false; }
  const thresholds = (typeof GALAXY_LOD_CFG !== 'undefined' && Array.isArray(GALAXY_LOD_CFG.mergeThresholds))
    ? GALAXY_LOD_CFG.mergeThresholds : [10, 50, 150, 450];
  for (let i = 0; i < thresholds.length; i++) {
    const t = thresholds[i];
    if (from < t && to >= t) {
      const size = Math.max(1, Number(galaxyGroupSizeForLevel(auto)) || 1);
      const count = Math.max(1, Math.ceil(to / size));
      const gi = Math.max(0, Math.min(count - 1, Math.floor((t - 1) / size)));
      const base = galaxyLayoutPos(gi, count, (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000);
      triggerGalaxyMerge(base.x, base.y, t);
    }
  }
}

function drawMacroMergeAnims(time) {
  if (!S.vis || !S.vis.macroMergeAnims) return;
  const keys = Object.keys(S.vis.macroMergeAnims);
  if (!keys.length) return;
  const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
  const fit = Math.max(0.00001, (typeof galaxyFitZoom === 'function' ? galaxyFitZoom() : 1));
  const zoomScale = Math.max(0.6, Math.min(2.2, (S.zoom || 1) / fit));
  const MERGE_FLASH_MS = 2000;
  const MERGE_LIFE_MS = 600000;
  for (let k = 0; k < keys.length; k++) {
    const id = keys[k];
    const a = S.vis.macroMergeAnims[id];
    if (!a) continue;
    const elapsed = now - (Number(a.start) || 0);
    if (elapsed < 0) { delete S.vis.macroMergeAnims[id]; continue; }
    if (elapsed >= MERGE_FLASH_MS + MERGE_LIFE_MS) {
      delete S.vis.macroMergeAnims[id];
      continue;
    }
    const pos = galaxyProjectWorld(Number(a.x) || 0, Number(a.y) || 0);
    if (elapsed < MERGE_FLASH_MS) {
      const p = elapsed / MERGE_FLASH_MS;
      const ease = p * p * (3 - 2 * p);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 28; i++) {
        const ang = i * 2.399963;
        const radius = (130 * (1 - ease) + 8) * zoomScale;
        const px = pos.x + Math.cos(ang) * radius;
        const py = pos.y + Math.sin(ang) * radius;
        const alpha = 0.15 + 0.7 * ease;
        ctx.fillStyle = 'rgba(200, 215, 255, ' + alpha + ')';
        ctx.beginPath();
        ctx.arc(px, py, 1.4 + (i % 3) * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
      if (elapsed > 1500) {
        const q = Math.min(1, (elapsed - 1500) / 500);
        const flashR = (14 + 80 * q) * zoomScale;
        const fg = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, flashR);
        fg.addColorStop(0, 'rgba(255,255,255,' + (0.9 * (1 - q * 0.4)) + ')');
        fg.addColorStop(0.4, 'rgba(210,225,255,' + (0.45 * (1 - q)) + ')');
        fg.addColorStop(1, 'rgba(160,180,255,0)');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, flashR, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else {
      // «Молодая туманность»: спиральные частицы вращаются и тают 10 минут.
      const p = (elapsed - MERGE_FLASH_MS) / MERGE_LIFE_MS;
      const alpha = Math.max(0, 1 - p);
      if (alpha <= 0.01) continue;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const rot = elapsed * 0.00012;
      for (let i = 0; i < 44; i++) {
        const baseAng = i * 2.399963;
        const radius = (16 + (i % 11) * 7) * zoomScale * (0.6 + 0.4 * p);
        const ang = baseAng + rot;
        const px = pos.x + Math.cos(ang) * radius;
        const py = pos.y + Math.sin(ang) * radius;
        const a2 = alpha * (0.12 + 0.30 * (1 - (i % 11) / 11));
        ctx.fillStyle = 'rgba(150, 200, 255, ' + a2 + ')';
        ctx.beginPath();
        ctx.arc(px, py, 1 + (i % 2) * 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

function drawCosmicTrail(time) {
  const tr = S.cosmicTrail;
  if (!tr || typeof tr !== 'object') return;
  const start = Number(tr.start) || 0;
  const duration = Math.max(1000, Number(tr.duration) || 600000);
  const elapsed = Date.now() - start;
  if (elapsed < 0) return;
  if (elapsed > duration) { S.cosmicTrail = null; return; }
  const p = elapsed / duration;
  const pos = galaxyProjectWorld(Number(tr.x) || 0, Number(tr.y) || 0);
  const radius = 30 + p * 260;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(170, 155, 255, ' + ((1 - p) * 0.20) + ')';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 220, 150, ' + ((1 - p) * 0.10) + ')';
  ctx.lineWidth = Math.max(1, 7 * (1 - p));
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, radius * 0.72, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawGalaxyPrestigeFlash() {
  if (S.vis && S.vis.prestigeAnim && S.vis.prestigeAnim.phase === 'explode') {
    const el = performance.now() - S.vis.prestigeAnim.start - 1500;
    const p = Math.min(1, el / 500);
    ctx.fillStyle = 'rgba(255, 255, 255, ' + (1 - p) + ')';
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(W, H) * p, 0, Math.PI * 2);
    ctx.fill();
  }
}
// ★ Двойной тап по системе в галактике открывает её. Одиночный — выделяет.
const GALAXY_DOUBLE_TAP_MS = 380;
let galaxyTap = { idx: -1, macro: -1, at: 0 };
let galaxySelectedMacro = -1;

// Хит-тест систем: радиус задан в экранных пикселях и не зависит от зума.
function galaxySystemAt(x, y) {
  if (S.vis && S.vis.prestigeAnim) return -1;
  const total = S.totalSystemsCreated || 1;
  const t = performance.now() / 1000;
  let best = -1, bestD = Infinity;

  const level = galaxyLodLevel();
  if (level < 4) {
    const groups = getGalaxyMacroGroups(total, level, performance.now());
    for (let g = 0; g < groups.length; g++) {
      const members = galaxyMacroSampleMembers(groups[g], total, level);
      for (let m = 0; m < members.length; m++) {
        const idx = members[m];
        const p = galaxySystemPos(idx, total, t);
        const d = Math.hypot(p.x - x, p.y - y);
        if (d <= 26 && d < bestD) { bestD = d; best = idx; }
      }
    }
    return best;
  }

  const focus = (level >= 4 && S.galaxyFocus) ? S.galaxyFocus : null;
  const from = focus ? Math.max(0, Number(focus.start) || 0) : 0;
  const to = focus ? Math.min(total, Number(focus.end) || total) : total;
  for (let i = from; i < to; i++) {
    const p = galaxySystemPos(i, total, t);
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= 26 && d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function galaxySystemNameAt(i) {
  if (i === 0) {
    if (S.activeSystemIdx === 0 && S.systemName) return S.systemName;
    const home = S.otherSystems && S.otherSystems[0];
    return (home && home.name) || 'Родная';
  }
  const sys = S.otherSystems && S.otherSystems[i];
  return (sys && sys.name) || ('Система ' + (i + 1));
}

function openGalaxySystem(i) {
  if (typeof switchToSystem === 'function') switchToSystem(i);
  S.stage = 'system';
  S.panX = 0; S.panY = 0; S.zoom = 1; S.rotation = 0;
  S.galaxySelectedIdx = -1;
  galaxyTap.idx = -1;
  galaxyTap.at = 0;
  galaxyTap.macro = -1;
  galaxySelectedMacro = -1;
  if (typeof updateSystemSwitcher === 'function') updateSystemSwitcher();
  if (typeof updateUI === 'function') updateUI();
}

// Совместимость: раньше одиночный клик сразу открывал систему.
function handleGalaxyClick(x, y) {
  const i = galaxySystemAt(x, y);
  if (i < 0) return false;
  openGalaxySystem(i);
  return true;
}

// ─── Отрисовка макро-уровня: те же звёзды, но прореженные ────────
// Группировка нужна только чтобы не рисовать 1000 звёзд на телефоне.
// Поэтому вместо «пузырей» показываем реальные позиции части систем:
// созвездие остаётся созвездием, просто с меньшим числом точек.
function galaxyMacroStarBudget(level) {
  if (level <= 0) return 120;
  if (level === 1) return 210;
  if (level === 2) return 300;
  return 300;
}

function galaxyMacroMaxStarsPerGroup(level) {
  if (level <= 0) return 34;
  if (level === 1) return 30;
  if (level === 2) return 24;
  return 10;
}

function galaxySampleRange(start, end, target, primeIndices) {
  const from = Math.floor(Number(start) || 0);
  const to = Math.max(from, Math.floor(Number(end) || 0));
  const n = to - from;
  if (!n) return [];
  const count = Math.max(1, Math.min(n, Math.floor(Number(target) || 1)));
  const picked = new Set();
  function add(i) {
    i = Math.floor(Number(i));
    if (i >= from && i < to) picked.add(i);
  }
  if (count >= n) {
    for (let i = from; i < to; i++) picked.add(i);
  } else {
    for (let k = 0; k < count; k++) {
      add(from + Math.round(k * (n - 1) / Math.max(1, count - 1)));
    }
  }
  add(Number(S.activeSystemIdx) || 0);
  add(Number(S.galaxySelectedIdx));
  const primes = primeIndices || [];
  for (let p = 0; p < primes.length; p++) add(primes[p]);
  return Array.from(picked).sort(function (a, b) { return a - b; });
}

function galaxyMacroSampleMembers(group, total, level) {
  const n = Math.max(0, Number(group.count) || 0);
  if (!n) return [];
  const safeTotal = Math.max(1, Number(total) || 1);
  const groupCount = Math.max(1, Math.ceil(safeTotal / Math.max(1, n)));
  const budget = galaxyMacroStarBudget(level);
  const target = Math.min(
    n,
    galaxyMacroMaxStarsPerGroup(level),
    Math.max(3, Math.floor(budget / groupCount))
  );
  return galaxySampleRange(group.start, group.end, target, group.primeIndices);
}

// Склонение количества дочерних объектов для подписи масштаба.
function galaxyChildCountLabel(kind, count) {
  const forms = kind === 'Скопление' ? ['скопление', 'скопления', 'скоплений']
    : kind === 'Туманность' ? ['туманность', 'туманности', 'туманностей']
    : kind === 'Созвездие' ? ['созвездие', 'созвездия', 'созвездий']
    : ['объект', 'объекта', 'объектов'];
  const n = Math.abs(Number(count) || 0);
  const tail = n % 100;
  const digit = n % 10;
  const form = (tail >= 11 && tail <= 14) ? 2
    : (digit === 1 ? 0 : (digit >= 2 && digit <= 4 ? 1 : 2));
  return n + ' ' + forms[form];
}

function drawMacroStar(idx, pos, total, time, labelCandidates) {
  const isActive = idx === S.activeSystemIdx;
  const size = isActive ? 10 : (total > 400 ? 5 : 6);

  let isPrime = false;
  let primeData = null;
  if (idx === S.activeSystemIdx) {
    if (S.primeSystem) { isPrime = true; primeData = S.primeSystem; }
  } else if (S.otherSystems && S.otherSystems[idx] &&
             (S.otherSystems[idx].isPrime ||
              (typeof isPrimeSystemData === 'function' && isPrimeSystemData(S.otherSystems[idx])))) {
    isPrime = true;
    primeData = S.otherSystems[idx].primeData || S.otherSystems[idx].primeSystem || null;
  }

  if (isPrime) {
    const pulse = 1 + 0.1 * Math.sin(time * 2);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const extGlow = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, size * 3.5 * pulse);
    extGlow.addColorStop(0, 'rgba(255, 200, 50, 0.35)');
    extGlow.addColorStop(0.6, 'rgba(255, 150, 0, 0.1)');
    extGlow.addColorStop(1, 'rgba(255, 100, 0, 0)');
    ctx.fillStyle = extGlow;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, size * 3.5 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (typeof drawPrimeIcon === 'function' && primeData) {
      const iconKey = primeData.objectIcon || primeData.objectKey;
      drawPrimeIcon(ctx, pos.x, pos.y, iconKey, time, size);
    } else {
      ctx.fillStyle = '#ffe8a0';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, size * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    const twinkle = 0.82 + 0.18 * Math.sin(time * 1.8 + idx * 1.7);
    drawStarGlow(pos.x, pos.y, size, isActive, total, twinkle);
    const hue = 50 + (idx * 37) % 100;
    ctx.save();
    ctx.globalAlpha = Math.max(0.25, twinkle);
    ctx.fillStyle = isActive ? '#fff' : 'hsla(' + hue + ', 85%, 84%, 0.95)';
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, size * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (idx === S.galaxySelectedIdx) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,215,106,0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, size * 2.6 + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

}

function drawMacroSelectedStarShimmer(pos, time, idx) {
  const pulse = 0.5 + 0.5 * Math.sin(time * 2.8 + idx * 1.3);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const r = 6 + 3 * pulse;
  ctx.fillStyle = 'rgba(255, 220, 140, ' + (0.04 + 0.05 * pulse).toFixed(3) + ')';
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 246, 210, ' + (0.08 + 0.09 * pulse).toFixed(3) + ')';
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 2.2 + 1.2 * pulse, 0, Math.PI * 2);
  ctx.fill();
  const rr = 4 + 4 * pulse;
  ctx.strokeStyle = 'rgba(255, 232, 165, ' + (0.10 + 0.14 * pulse).toFixed(3) + ')';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pos.x - rr, pos.y);
  ctx.lineTo(pos.x - rr * 0.55, pos.y);
  ctx.moveTo(pos.x + rr * 0.55, pos.y);
  ctx.lineTo(pos.x + rr, pos.y);
  ctx.moveTo(pos.x, pos.y - rr);
  ctx.lineTo(pos.x, pos.y - rr * 0.55);
  ctx.moveTo(pos.x, pos.y + rr * 0.55);
  ctx.lineTo(pos.x, pos.y + rr);
  ctx.stroke();
  ctx.restore();
}


function drawGalaxyMacroView(time, total, level) {
  const groups = getGalaxyMacroGroups(total, level, performance.now());
  const cw = (typeof window !== 'undefined' && window.CANVAS_W) || W || 400;
  const ch = (typeof window !== 'undefined' && window.CANVAS_H) || H || 700;
  const labelCandidates = [];
  const groupLabels = [];
  const groupLabelBoxes = [];

  ctx.save();
  const childSize = (level < 3 && typeof galaxyGroupSizeForLevel === 'function')
    ? Math.max(1, Number(galaxyGroupSizeForLevel(level + 1)) || 1)
    : 0;
  const parentBudget = Math.max(6, Math.floor(galaxyMacroStarBudget(level) / Math.max(1, groups.length)));

  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    if (!galaxyMacroInFocus(group)) continue;
    const isSelectedMacro = galaxySelectedMacro === group.index;
    const chunks = [];

    if (childSize > 0) {
      const childCount = Math.max(1, Math.ceil(group.count / childSize));
      const perChild = Math.min(12, Math.max(3, Math.floor(parentBudget / childCount)));
      for (let cs = group.start; cs < group.end; cs += childSize) {
        const ce = Math.min(group.end, cs + childSize);
        const primes = (group.primeIndices || []).filter(function (i) { return i >= cs && i < ce; });
        const span = ce - cs;
        let winStart = cs + Math.max(0, Math.floor((span - Math.max(perChild * 2, Math.ceil(span * 0.5))) / 2));
        let winEnd = Math.min(ce, winStart + Math.max(perChild * 2, Math.ceil(span * 0.5)));
        const forced = primes.concat([Number(S.activeSystemIdx) || 0, Number(S.galaxySelectedIdx)]);
        for (let f = 0; f < forced.length; f++) {
          const idx = Math.floor(Number(forced[f]));
          if (idx < cs || idx >= ce) continue;
          if (idx < winStart) winStart = idx;
          if (idx >= winEnd) winEnd = idx + 1;
        }
        const members = galaxySampleRange(winStart, winEnd, perChild, primes);
        if (members.length) {
          chunks.push({ start: cs, end: ce, index: Math.floor(cs / childSize), members: members });
        }
      }
    } else {
      const members = galaxyMacroSampleMembers(group, total, level);
      if (members.length) chunks.push({ start: group.start, end: group.end, index: group.index, members: members });
    }
    if (!chunks.length) continue;

    let gx = 0, gy = 0, gcount = 0;
    const parentPts = new Array(Math.max(1, total));

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      const members = chunk.members;
      const pts = new Array(Math.max(1, total));
      for (let m = 0; m < members.length; m++) {
        const p = galaxySystemPos(members[m], total, time);
        pts[members[m]] = p;
        parentPts[members[m]] = p;
        gx += p.x; gy += p.y; gcount++;
      }

      const edges = constellationMst(pts, members);
      ctx.save();
      const linePulse = isSelectedMacro
        ? 0.16 + 0.10 * (0.5 + 0.5 * Math.sin(time * 1.6 + chunk.index))
        : 0.09 + 0.06 * (0.5 + 0.5 * Math.sin(time * 0.8 + chunk.index));
      ctx.strokeStyle = isSelectedMacro
        ? 'rgba(255, 205, 120, ' + linePulse.toFixed(3) + ')'
        : 'rgba(150, 140, 215, ' + linePulse.toFixed(3) + ')';
      ctx.lineWidth = 1;
      for (let e = 0; e < edges.length; e++) {
        const a = pts[members[edges[e][0]]];
        const b = pts[members[edges[e][1]]];
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        if (dx * dx + dy * dy > 14400) continue;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.restore();

      for (let m = 0; m < members.length; m++) {
        const idx = members[m];
        const pos = pts[idx];
        if (!pos) continue;
        if (pos.x < -50 || pos.x > cw + 50 || pos.y < -50 || pos.y > ch + 50) continue;
        drawMacroStar(idx, pos, total, time, labelCandidates);
        if (isSelectedMacro) drawMacroSelectedStarShimmer(pos, time, idx);
      }
    }

    if (!gcount) continue;
    gx /= gcount; gy /= gcount;

    const showGroupLabel = !!S.galaxyFocus || total <= 250 || level <= 1 || galaxySelectedMacro === group.index;
    if (showGroupLabel && (!!S.galaxyFocus || (gx > -80 && gx < cw + 80 && gy > -80 && gy < ch + 80))) {
      let groupName = (typeof galaxyMacroName === 'function')
        ? galaxyMacroName(level, group.index)
        : (((typeof galaxyLodMeta === 'function' ? galaxyLodMeta(level) : null) || {}).label || 'Объект');
      if (level < 3 && chunks.length > 1) {
        const childMeta = (typeof galaxyLodMeta === 'function') ? galaxyLodMeta(level + 1) : null;
        if (childMeta && childMeta.label) {
          groupName += ' · ' + galaxyChildCountLabel(childMeta.label, chunks.length);
        }
      }
      const centerIdx = (group.start + group.end - 1) / 2;
      let mid = null, bestD = Infinity;
      for (let ci = 0; ci < chunks.length; ci++) {
        const mm = chunks[ci].members;
        for (let m = 0; m < mm.length; m++) {
          const idx = mm[m];
          const d = Math.abs(idx - centerIdx);
          if (d < bestD && parentPts[idx]) { bestD = d; mid = parentPts[idx]; }
        }
      }
      groupLabels.push({
        x: mid ? mid.x : gx,
        y: (mid ? mid.y : gy) - 28,
        name: groupName
      });
    }

  }
  ctx.restore();

  if (groupLabels.length) {
    ctx.save();
    ctx.fillStyle = 'rgba(180, 160, 255, 0.5)';
    ctx.font = 'italic 10px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < groupLabels.length; i++) {
      const g = groupLabels[i];
      if (!S.galaxyFocus && (g.x < -120 || g.x > cw + 120 || g.y < -120 || g.y > ch + 120)) continue;
      const gw = Math.max(40, g.name.length * 5.8 + 8);
      const baseX = Math.max(gw / 2 + 8, Math.min(cw - gw / 2 - 8, g.x));
      const baseY = Math.max(110, Math.min(ch * 0.68, g.y));
      const tries = [
        { x: baseX, y: baseY },
        { x: baseX, y: baseY + 26 },
        { x: baseX, y: baseY - 26 },
        { x: baseX - gw * 0.7, y: baseY },
        { x: baseX + gw * 0.7, y: baseY }
      ];
      let chosen = null;
      for (let t = 0; t < tries.length; t++) {
        const x = Math.max(gw / 2 + 8, Math.min(cw - gw / 2 - 8, tries[t].x));
        const y = Math.max(110, Math.min(ch * 0.68, tries[t].y));
        const box = { l: x - gw / 2, r: x + gw / 2, t: y - 9, b: y + 4 };
        let overlaps = false;
        for (let j = 0; j < groupLabelBoxes.length; j++) {
          const q = groupLabelBoxes[j];
          if (box.l < q.r && box.r > q.l && box.t < q.b && box.b > q.t) { overlaps = true; break; }
        }
        if (!overlaps) { chosen = { x: x, y: y, box: box }; break; }
      }
      if (!chosen) {
        chosen = { x: baseX, y: baseY, box: { l: baseX - gw / 2, r: baseX + gw / 2, t: baseY - 9, b: baseY + 4 } };
      }
      groupLabelBoxes.push(chosen.box);
      if (Math.abs(chosen.x - g.x) > 20 || Math.abs(chosen.y - g.y) > 20) {
        ctx.save();
        ctx.strokeStyle = 'rgba(150, 140, 215, 0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(g.x, g.y);
        ctx.lineTo(chosen.x, chosen.y + 3);
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillText(g.name, chosen.x, chosen.y);
    }
    ctx.restore();
  }

  if (labelCandidates.length) {
    const zoomNow = S.zoom || 1;
    const placed = groupLabelBoxes.slice();
    function prio(l) {
      if (l.isActive) return 5;
      if (l.isSelected) return 4;
      if (l.isPrime) return 3;
      return 1;
    }
    labelCandidates.sort(function (a, b) {
      const dp = prio(b) - prio(a);
      return dp !== 0 ? dp : (a.dist2 - b.dist2);
    });
    ctx.save();
    ctx.textAlign = 'center';
    for (let i = 0; i < labelCandidates.length; i++) {
      const l = labelCandidates[i];
      const important = l.isActive || l.isPrime || l.isSelected;
      if (zoomNow < 0.28 && !important) continue;
      const w = Math.max(36, l.name.length * 6.2);
      const box = { l: l.x - w / 2, r: l.x + w / 2, t: l.y - 9, b: l.y + 4 };
      let overlaps = false;
      for (let j = 0; j < placed.length; j++) {
        const q = placed[j];
        if (box.l < q.r && box.r > q.l && box.t < q.b && box.b > q.t) { overlaps = true; break; }
      }
      if (overlaps) continue;
      placed.push(box);
      ctx.fillStyle = l.isPrime ? '#ffe8a0' : (l.isActive || l.isSelected ? '#fff' : 'rgba(200, 190, 255, 0.7)');
      ctx.font = (l.isActive || l.isPrime || l.isSelected ? 'bold ' : '') + (l.isPrime ? '13px' : '11px') + ' -apple-system, sans-serif';
      ctx.fillText(l.name, l.x, l.y);
    }
    ctx.restore();
  }
}
function drawGalaxyView(time) {
  const t = time;
  updateGalaxyMacroDrill(performance.now());
  updateGalaxyZoomLod();
  const total = S.totalSystemsCreated || 1;
  drawCosmicTrail(time);
  const lod = galaxyLodLevel();
  if (lod < 4) {
    // ★ На уровнях 3-0 НЕ рисуем отдельные звёзды:
    //   только макро-группы, поэтому 1000 систем = единицы объектов.
    drawGalaxyMacroView(t, total, lod);
    drawMacroMergeAnims(time);
    drawGalaxyPrestigeFlash();
    drawGalaxyMacroDrillEffect();
    return;
  }
  drawMacroMergeAnims(time);
  const positions = [];
const focus = S.galaxyFocus;
const from = (focus && Number.isFinite(Number(focus.start))) ? Math.max(0, Math.floor(focus.start)) : 0;
const to = (focus && Number.isFinite(Number(focus.end))) ? Math.min(total, Math.floor(focus.end)) : total;
for (let i = from; i < to; i++) {
const p = galaxySystemPos(i, total, t);
positions.push({ x: p.x, y: p.y, idx: i });
}
// ─── Созвездия: только внутренние связи ─────────────────────────
// Между группами связей нет, поэтому созвездия читаются отдельно.
const constellationGroups = focus
  ? (function () {
      const members = [];
      for (let i = 0; i < positions.length; i++) members.push(i);
      return [{ members: members, edges: constellationMst(positions, members) }];
    })()
  : galaxyConstellationGroups(total);
ctx.save();
ctx.strokeStyle = 'rgba(150, 140, 215, 0.14)';
ctx.lineWidth = 1;
for (let gi = 0; gi < constellationGroups.length; gi++) {
  const group = constellationGroups[gi];
  for (let e = 0; e < group.edges.length; e++) {
    const a = positions[group.members[group.edges[e][0]]];
    const b = positions[group.members[group.edges[e][1]]];
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    if (dx * dx + dy * dy > 140000) continue; // слишком длинная — не рисуем
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}
ctx.restore();
// Названия созвездий
const constellationNames = ['Орион', 'Дракон', 'Лиры', 'Феникс', 'Центавр', 'Гидра', 'Кит', 'Пегас', 'Андромеда', 'Орёл', 'Волопас', 'Лебедь'];
if (!focus && (S.zoom || 1) >= 0.45 && constellationGroups.length <= 40) {
ctx.save();
ctx.fillStyle = 'rgba(180, 160, 255, 0.55)';
ctx.font = 'italic 10px -apple-system, sans-serif';
ctx.textAlign = 'center';
for (let gi = 0; gi < constellationGroups.length; gi++) {
const group = constellationGroups[gi];
if (group.members.length < 3) continue;
let sxA = 0, syA = 0;
for (let k = 0; k < group.members.length; k++) {
const p = positions[group.members[k]];
sxA += p.x; syA += p.y;
}
sxA /= group.members.length; syA /= group.members.length;
if (sxA < -60 || sxA > (window.CANVAS_W || 400) + 60 ||
syA < -60 || syA > (window.CANVAS_H || 700) + 60) continue;
ctx.fillText(constellationNames[gi % constellationNames.length], sxA, syA - 26);
}
ctx.restore();
}
// ★ СИСТЕМЫ: у каждой звезды мягкое свечение (спрайт, без LOD-провала)
const labelCandidates = [];
for (let i = 0; i < positions.length; i++) {
const pos = positions[i];
// Отсечение за пределами экрана
if (pos.x < -50 || pos.x > (window.CANVAS_W || 400) + 50 || pos.y < -50 || pos.y > (window.CANVAS_H || 700) + 50) continue;
const isActive = pos.idx === S.activeSystemIdx;
const size = isActive ? 10 : 6;
// ★ ПРОВЕРКА ПРАЙМА ДЛЯ ВСЕХ СИСТЕМ
let isPrime = false;
let primeData = null;
if (pos.idx === S.activeSystemIdx) {
if (S.primeSystem) { isPrime = true; primeData = S.primeSystem; }
} else if (S.otherSystems && S.otherSystems[pos.idx] &&
           (S.otherSystems[pos.idx].isPrime || (typeof isPrimeSystemData === 'function' && isPrimeSystemData(S.otherSystems[pos.idx])))) {
isPrime = true;
primeData = S.otherSystems[pos.idx].primeData || S.otherSystems[pos.idx].primeSystem || null;
}
// ★ Свечение есть у всех звёзд: спрайт дешёвый даже при сотнях систем.
const hue = isPrime ? 45 : (50 + (pos.idx * 37) % 100);
if (isPrime) {
const pulse = 1 + 0.1 * Math.sin(time * 2);
ctx.save();
ctx.globalCompositeOperation = 'lighter';
const extGlow = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, size * 3.5 * pulse);
extGlow.addColorStop(0, 'rgba(255, 200, 50, 0.35)');
extGlow.addColorStop(0.6, 'rgba(255, 150, 0, 0.1)');
extGlow.addColorStop(1, 'rgba(255, 100, 0, 0)');
ctx.fillStyle = extGlow;
ctx.beginPath();
ctx.arc(pos.x, pos.y, size * 3.5 * pulse, 0, Math.PI * 2);
ctx.fill();
ctx.restore();
if (typeof drawPrimeIcon === 'function' && primeData) {
const iconKey = primeData.objectIcon || primeData.objectKey;
drawPrimeIcon(ctx, pos.x, pos.y, iconKey, time, size * 1.0);
} else {
ctx.fillStyle = '#ffe8a0';
ctx.beginPath();
ctx.arc(pos.x, pos.y, size * 0.4, 0, Math.PI * 2);
ctx.fill();
}
} else {
drawStarGlow(pos.x, pos.y, size, isActive, total);
ctx.fillStyle = isActive ? '#fff' : 'hsla(' + hue + ', 85%, 84%, 0.95)';
ctx.beginPath();
ctx.arc(pos.x, pos.y, size * 0.42, 0, Math.PI * 2);
ctx.fill();
}
// ★ Выделенная (одиночный тап) система — золотое кольцо, вход только двойным тапом.
if (pos.idx === S.galaxySelectedIdx) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,215,106,0.95)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, size * 2.6 + 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
// Подпись — во втором проходе, чтобы тексты не наезжали друг на друга
if (total <= 250 || focus) {
let nm;
if (pos.idx === 0) {
nm = (S.activeSystemIdx === 0) ? S.systemName : (S.otherSystems && S.otherSystems[0] ? S.otherSystems[0].name : 'Родная');
} else {
nm = (S.otherSystems && S.otherSystems[pos.idx]) ? S.otherSystems[pos.idx].name : 'С-ма ' + (pos.idx + 1);
}
if (isPrime) nm = '👑 ' + nm;
const dvx = pos.x - (cx || 0), dvy = pos.y - (cy || 0);
labelCandidates.push({
x: pos.x, y: pos.y + size * 2.5 + 2, name: nm,
isActive: isActive, isPrime: isPrime, isSelected: pos.idx === S.galaxySelectedIdx,
dist2: dvx * dvx + dvy * dvy
});
}
}
// ★ Подписи: важные — всегда, остальные — без наложений (и не в слишком мелком масштабе).
(function drawGalaxyLabels() {
const zoomNow = S.zoom || 1;
const placed = [];
function prio(l) {
  if (l.isActive) return 5;
  if (l.isSelected) return 4;
  if (l.isPrime) return 3;
  return 1;
}
labelCandidates.sort(function(a, b) {
  const dp = prio(b) - prio(a);
  return dp !== 0 ? dp : (a.dist2 - b.dist2);
});
ctx.textAlign = 'center';
for (let i = 0; i < labelCandidates.length; i++) {
  const l = labelCandidates[i];
  const important = l.isActive || l.isPrime || l.isSelected;
  if (zoomNow < 0.28 && !important) continue;
  const w = Math.max(36, l.name.length * 6.2);
  const box = { l: l.x - w / 2, r: l.x + w / 2, t: l.y - 9, b: l.y + 4 };
  let overlaps = false;
  for (let j = 0; j < placed.length; j++) {
    const q = placed[j];
    if (box.l < q.r && box.r > q.l && box.t < q.b && box.b > q.t) { overlaps = true; break; }
  }
  if (overlaps) continue;
  placed.push(box);
  ctx.fillStyle = l.isPrime ? '#ffe8a0' : (l.isActive || l.isSelected ? '#fff' : 'rgba(200, 190, 255, 0.7)');
  ctx.font = (l.isActive || l.isPrime || l.isSelected ? 'bold ' : '') + (l.isPrime ? '13px' : '11px') + ' -apple-system, sans-serif';
  ctx.fillText(l.name, l.x, l.y);
}
})();
drawGalaxyPrestigeFlash();
drawGalaxyMacroDrillEffect();
// Подпись галактики теперь DOM-чипом #galaxyCaption: canvas-текст перекрывался доком.
}
// ─── HUD-чипы: подпись галактики и статус Автобороны ────────────
function galaxyFormLabel() {
  return {
    spiral: 'Спиральная',
    elliptical: 'Эллиптическая',
    irregular: 'Иррегулярная',
    ring: 'Кольцевая',
  }[S.galaxyForm || 'spiral'] || 'Спиральная';
}

function activeDefenseChipText(now) {
  const lvl = (typeof activeDefenseLevel === 'function') ? activeDefenseLevel(now) : 0;
  if (lvl > 0) {
    const leftH = Math.max(0, Math.ceil(((S.nightDefenseExpiresAt || 0) - now) / 3600000));
    const totalPct = (typeof invasionRepelChance === 'function')
      ? Math.round(invasionRepelChance(now) * 100)
      : Math.round(lvl * (Number(INVASION_CFG.repelDefensePerLevel) || 0.10) * 100);
    return '🛡 Автоборона ур.' + lvl + ' · +' + totalPct + '% к отбитию' + (leftH > 0 ? ' · ' + leftH + ' ч' : '');
  }
  if ((Number(S.nightDefenseLevel) || 0) > 0) return '🛡 Автоборона истекла — включите снова';
  return '';
}

function updateHudChips() {
  const now = Date.now();
  const capEl = document.getElementById('galaxyCaption');
  if (capEl) {
    if (S.stage === 'galaxy') {
      let text = '🌌 Галактика ' + (S.galaxies || 1) + ' · ' + galaxyFormLabel() +
        ' · доход ×' + (Number(S.galaxyMultiplier) || 1).toFixed(1) +
        ((Number(S.singularities) || 0) > 0 ? ' · ✨ ' + S.singularities : '');
      const lod = galaxyLodLevel();
      if (lod < 4) {
        const meta = (typeof galaxyLodMeta === 'function') ? galaxyLodMeta(lod) : null;
        const kind = (meta && meta.label) || 'Объект';
        if (galaxySelectedMacro >= 0) {
          const macroName = (typeof galaxyMacroName === 'function')
            ? galaxyMacroName(lod, galaxySelectedMacro)
            : (kind + ' №' + (galaxySelectedMacro + 1));
          text += ' · ' + macroName + ' — двойной тап: раскрыть';
        } else {
        const plural = kind === 'Туманность' ? 'Туманности'
          : kind === 'Созвездие' ? 'Созвездия'
          : kind === 'Скопление' ? 'Скопления'
          : kind === 'Сверхскопление' ? 'Сверхскопления' : kind;
        text += ' · ' + plural + ' · двойной тап — раскрыть';
        }
      } else if (S.galaxyFocus) {
        text += ' · ' + S.galaxyFocus.name + ' — двойной тап по системе — войти';
      } else {
        const sel = Number(S.galaxySelectedIdx);
        if (sel >= 0) text += ' · ' + galaxySystemNameAt(sel) + ' — двойной тап, чтобы войти';
        else text += ' · двойной тап по системе — войти';
      }
      if (capEl.textContent !== text) capEl.textContent = text;
      if (capEl.style.display !== 'block') capEl.style.display = 'block';
    } else if (capEl.style.display !== 'none') {
      capEl.style.display = 'none';
    }
  }
  const defEl = document.getElementById('defenseChip');
  if (defEl) {
    const txt = activeDefenseChipText(now);
    if (txt) {
      if (defEl.textContent !== txt) defEl.textContent = txt;
      if (defEl.style.display !== 'block') defEl.style.display = 'block';
    } else if (defEl.style.display !== 'none') {
      defEl.style.display = 'none';
    }
  }
  // ★ Постоянный индикатор флота в HUD: показываем, что он на службе.
  const fleetEl = document.getElementById('fleetChip');
  if (fleetEl) {
    const ships = (typeof fleetShipTotal === 'function') ? fleetShipTotal() : 0;
    if (ships > 0) {
      const engaged = !!(window.FLEET_VIS && window.FLEET_VIS.phase === 'fight');
      const txt = '🚀 Флот: ' + ships + ' · ' + (engaged ? 'в бою' : 'на службе');
      if (fleetEl.textContent !== txt) fleetEl.textContent = txt;
      if (fleetEl.style.display !== 'block') fleetEl.style.display = 'block';
    } else if (fleetEl.style.display !== 'none') {
      fleetEl.style.display = 'none';
    }
  }
  const negEl = document.getElementById('neglectChip');
  if (negEl) {
    const txt = (typeof galaxyNeglectChipText === 'function') ? galaxyNeglectChipText() : '';
    if (txt) {
      if (negEl.textContent !== txt) negEl.textContent = txt;
      if (negEl.style.display !== 'block') negEl.style.display = 'block';
    } else if (negEl.style.display !== 'none') {
      negEl.style.display = 'none';
    }
  }
}

// При переходе в галактику подгоняем зум, чтобы карта влезла целиком.
function syncStageZoom() {
  const stage = S.stage;
  const prev = window.__lastZoomStage;
  window.__lastZoomStage = stage;
  if (prev === stage) return;
  if (stage === 'galaxy') {
    S.panX = 0;
    S.panY = 0;
    S.zoom = clampZoom(galaxyFitZoom());
  } else if (prev === 'galaxy' && stage === 'system') {
    S.galaxySelectedIdx = -1;
    S.zoom = clampZoom(1);
  }
}
window.updateHudChips = updateHudChips;

// ─── Вспомогательные безопасные геттеры ресурсов ────────────────
function safeGetResourceCap(type) {
return typeof getResourceCap === 'function' ? getResourceCap(type) : Infinity;
}
function safeDustPerSec() { return typeof dustPerSec === 'function' ? dustPerSec() : 0; }
function safeEnergyPerSec() { return typeof energyPerSec === 'function' ? energyPerSec() : 0; }
function safeMetalsPerSec() { return typeof metalsPerSec === 'function' ? metalsPerSec() : 0; }
// ─── Push: заполнение хранилищ и истечение таймеров ───────────────
const STORAGE_NOTIFY_META = {
  dust:   { icon: '📦', name: 'Пыль',        type: 'storage_dust',   text: 'Пыль больше не добывается.' },
  energy: { icon: '⚡', name: 'Энергия',     type: 'storage_energy', text: 'Энергия больше не вырабатывается.' },
  civ:    { icon: '🧬', name: 'Цивилизация', type: 'storage_civ',    text: 'Цивилизация перестала расти.' },
  metals: { icon: '⚙️', name: 'Металлы',     type: 'storage_metals', text: 'Металлы больше не добываются.' },
};

function pushIfPossible(text, type) {
  if (typeof sendPushNotification === 'function') sendPushNotification(text, type || 'info');
}

// Уведомляем при переходе «не заполнено → заполнено» для каждого ресурса.
function checkStorageNotifications() {
  const now = Date.now();
  if (window.__storageCheckAt && now - window.__storageCheckAt < 1000) return;
  window.__storageCheckAt = now;
  if (!window.__storageFullState) window.__storageFullState = {};
  const state = window.__storageFullState;

  const resources = [
    ['dust', S.dust, safeGetResourceCap('dust')],
    ['energy', S.energy, safeGetResourceCap('energy')],
    ['civ', S.civLevel, safeGetResourceCap('civ')],
    ['metals', S.metalAmount, (typeof metalsCap === 'function') ? metalsCap() : Infinity],
  ];

  for (let i = 0; i < resources.length; i++) {
    const key = resources[i][0];
    const value = Math.max(0, Number(resources[i][1]) || 0);
    const cap = Number(resources[i][2]);
    const meta = STORAGE_NOTIFY_META[key];
    if (!meta || !isFinite(cap) || cap <= 0) { state[key] = false; continue; }
    const full = value >= cap;
    if (full && !state[key]) {
      state[key] = true;
      // ★ Подробный пуш о заполнении хранилища (значение / лимит).
      if (typeof notifyStorageFull === 'function') {
        notifyStorageFull(meta.name, value, cap, meta.text);
      } else {
        pushIfPossible(meta.icon + ' <b>Хранилище заполнено!</b> ' + meta.name + ': ' + meta.text + ' Зайдите и потратьте ресурсы.', meta.type);
      }
    } else if (!full) {
      state[key] = false;
    }
  }
}

// За час предупреждаем об окончании щита и автобороны.
function checkTimedNotifications() {
  const now = Date.now();
  if (!window.__timedNotifyState) window.__timedNotifyState = {};
  const state = window.__timedNotifyState;
  const HOUR = 3600 * 1000;

  const shieldUntil = Number(S.shieldUntil) || 0;
  if (shieldUntil > now && shieldUntil - now <= HOUR && state.shield !== shieldUntil) {
    state.shield = shieldUntil;
    pushIfPossible('🛡 <b>Щит скоро отключится!</b> Осталось меньше часа. Продлите защиту, чтобы не потерять ресурсы.', 'shield');
  }

  const defUntil = Number(S.nightDefenseExpiresAt) || 0;
  if ((Number(S.nightDefenseLevel) || 0) > 0 && defUntil > now && defUntil - now <= HOUR && state.defense !== defUntil) {
    state.defense = defUntil;
    pushIfPossible('🛡 <b>Автоборона скоро закончится!</b> Осталось меньше часа. Активируйте оборону, иначе флот будет отведён.', 'autodefense');
  }
}
// ═══════════════════════════════════════════════════════════════
//  ГЛАВНЫЙ ЦИКЛ
// ═══════════════════════════════════════════════════════════════
let last = performance.now();
let lastSave = 0;
let shopHintShown = false;
function loop(now) {
try {
loopFrame(now);
// ★ Heartbeat офлайн-времени: пока цикл жив, время «идёт».
//   Сохранение и автосейв не двигают lastTick, иначе ночь терялась бы.
S.lastTick = Date.now();
} catch (e) {
if (!window.__loopErrorAt || performance.now() - window.__loopErrorAt > 3000) {
window.__loopErrorAt = performance.now();
console.error('Пропущен кадр (защита цикла):', e);
}
}
requestAnimationFrame(loop);
}
function loopFrame(now) {
  _galaxyFrameId++;
  // ★ Досчёт пропущенного времени до обычной симуляции: выход из сна,
  //   возврат на вкладку, разворот Telegram. Внутри есть guard по lastTick.
  if (window.__gameStarted) {
    try { catchUpAwayProgress(); } catch (e) { /* не ломаем кадр */ }
  }
  sanitizeView();
if (!canvas.width || !canvas.height) resize();
const dt = Math.min((now - last) / 1000, 0.5);
last = now;
const time = now / 1000;
if (typeof updateView3D === 'function') updateView3D(dt, time);
// Мини-игра
if (S.activeMinigame) {
if (typeof MG !== 'undefined' && MG.type) {
if (document.body && !document.body.classList.contains('mg-active')) {
document.body.classList.add('mg-active');
}
if (typeof updateMinigame === 'function') updateMinigame(dt, time);
drawBackground(time);
if (typeof drawMinigame === 'function') drawMinigame(ctx, time);
return;
} else {
S.activeMinigame = null;
}
} else {
if (document.body && document.body.classList.contains('mg-active')) {
document.body.classList.remove('mg-active');
}
}
// Ресурсы с безопасными проверками лимитов
const dustCap = safeGetResourceCap('dust');
if (S.dust < dustCap) {
const gain = safeDustPerSec() * dt;
const actualGain = Math.min(dustCap - S.dust, gain);
S.dust = (S.dust || 0) + actualGain;
S.dustTotal = (S.dustTotal || 0) + actualGain;
}
const energyCap = safeGetResourceCap('energy');
if (S.energy < energyCap) {
const eGain = safeEnergyPerSec() * dt;
const actualEGain = Math.min(energyCap - S.energy, eGain);
if (actualEGain > 0) S.energy = (S.energy || 0) + actualEGain;
}
const metalGain = safeMetalsPerSec() * dt * ((typeof eventMult === 'function') ? eventMult('metals') : 1);
if (metalGain > 0) {
  const mCap = (typeof metalsCap === 'function') ? metalsCap() : Infinity;
  // ★ Не «срезаем» уже накопленное, если кап оказался ниже запаса.
  const curMetal = Math.max(mCap, S.metalAmount || 0);
  S.metalAmount = Math.min(curMetal, (S.metalAmount || 0) + metalGain);
}
// ★ Содержание активного флота: постоянный расход металла, пока он включён.
if (typeof payFleetUpkeep === 'function') payFleetUpkeep(dt);
// Тики и логика систем
if (typeof tickCiv === 'function') tickCiv(dt);
if (typeof updateParticles === 'function') updateParticles(dt, time);
if (typeof updatePlanets === 'function') updatePlanets(dt);
if (typeof updateMissions === 'function') updateMissions(dt, time);
if (typeof tickFleet === 'function') tickFleet(dt, time);
if (typeof tickInvasions === 'function') tickInvasions(dt);
if (typeof checkEvolution === 'function') checkEvolution();
if (typeof checkAchievements === 'function') checkAchievements();
if (typeof tickProtostar === 'function') tickProtostar(dt);
if (typeof checkRandomEvents === 'function') checkRandomEvents(dt);
if (typeof updateEventVisuals === 'function') updateEventVisuals(dt, time);
checkStorageNotifications();
checkTimedNotifications();
// Магазин систем — подсказка
if (S.stage === 'galaxy' && typeof systemShopCosts === 'function') {
const shopCostObj = systemShopCosts();
const shopCost = shopCostObj ? shopCostObj.dust : Infinity;
if (S.dust >= shopCost) {
if (!shopHintShown) {
shopHintShown = true;
if (typeof toast === 'function') toast('🌌 Хватит пыли на систему', 'Открой кнопку «Новая система», чтобы основать её');
}
} else {
shopHintShown = false;
}
}
// Отрисовка игрового экрана
drawBackground(time);
if (S.stage === 'galaxy') {
drawGalaxyView(time);
} else {
if (typeof drawParticles === 'function' && typeof particleVisibility === 'function' && particleVisibility() > 0.01) drawParticles(ctx, time);
if (typeof drawStar === 'function') drawStar(ctx, time);
if (typeof drawPlanets === 'function') drawPlanets(ctx, time);
}
if (typeof drawInvasions === 'function') drawInvasions(ctx, time);
if (typeof drawFleet === 'function') drawFleet(ctx, time);
if (typeof drawEventVisuals === 'function') drawEventVisuals(ctx, time);
// Обновление элементов интерфейса
if (now - lastSave > 4000) {
if (typeof saveGame === 'function') saveGame();
lastSave = now;
}
  // ★ Обновляем интерфейс 4 раза в секунду, а не 60. Это уберет лаги.
  if (!window._lastUiUpdate || now - window._lastUiUpdate > 250) {
    window._lastUiUpdate = now;
    if (typeof updateUI === 'function') updateUI();
    if (typeof updateQuestPanel === 'function') updateQuestPanel();
    if (typeof renderMissionButtons === 'function') renderMissionButtons();
    // ★ Чипы HUD: подпись галактики и статус Автобороны (аддитивно, не перекрывают док)
    updateHudChips();
    syncStageZoom();
  }
}
// ─── Фон ────────────────────────────────────────────────────────
const bgStars = [];
for (let i = 0; i < 200; i++) {
bgStars.push({
x: Math.random(), y: Math.random(),
r: 0.2 + Math.random() * 1.1,
a: 0.15 + Math.random() * 0.55,
tw: Math.random() * Math.PI * 2,
hue: 200 + Math.random() * 100,
});
}
function drawBackground(time) {
// Защита, если ресайз еще ни разу не вызвался
if (!cachedBgGradient) {
cachedBgGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W || 100, H || 100) * 0.9);
cachedBgGradient.addColorStop(0, '#0a0620');
cachedBgGradient.addColorStop(1, '#02010a');
}
ctx.fillStyle = cachedBgGradient;
ctx.fillRect(0, 0, W, H);
ctx.save();
ctx.globalCompositeOperation = 'screen';
for (let i = 0; i < bgStars.length; i++) {
const s = bgStars[i];
const tw = 0.5 + 0.5 * Math.sin(time * 1.4 + s.tw);
ctx.globalAlpha = s.a * tw;
ctx.fillStyle = 'hsl(' + s.hue + ', 35%, 90%)';
ctx.beginPath();
ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
ctx.fill();
}
ctx.restore();
}
// ─── Telegram ───────────────────────────────────────────────────
function setupTelegram() {
const tg = window.Telegram && window.Telegram.WebApp;
if (!tg) return;
try {
if (tg.ready) tg.ready();
if (tg.expand) tg.expand();
if (tg.setHeaderColor) tg.setHeaderColor('#02010a');
if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
if (tg.setBackgroundColor) tg.setBackgroundColor('#02010a');
// ★ Автозапрос при старте убран: без жеста он часто падал и пугал тостом.
// Теперь полный экран включает кнопка ⛶ (или Telegram сам при открытии).
} catch (e) {}

// Полноэкранный Telegram: сверху висят системные кнопки — опускаем HUD
syncTelegramLayout();
if (tg.onEvent) {
  try {
    tg.onEvent('viewportChanged', syncTelegramLayout);
    tg.onEvent('fullscreenChanged', syncTelegramLayout);
    // ★ Точная причина отказа (UNSUPPORTED и т.п.) вместо общей подсказки.
    tg.onEvent('fullscreenFailed', function(ev) { _tgFullscreenFailed(ev && ev.error); });
  } catch (e) { /* старые клиенты */ }
}
}

function syncTelegramLayout() {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (!tg) return;
  try {
    document.body.classList.add('in-telegram');
    const fullscreen = (tg.isFullscreen === true) || (tg.isExpanded === true);
    document.body.classList.toggle('tg-fullscreen', fullscreen);
    // Telegram сообщил, что мы в полноэкранном режиме — фиксируем состояние
    if (tg.isFullscreen === true && !fullscreenRequested) {
      fullscreenRequested = true;
      document.body.classList.add('fs-active');
      if (typeof resize === 'function') setTimeout(resize, 120);
    } else if (tg.isFullscreen !== true && !_fsActive() && fullscreenRequested) {
      fullscreenRequested = false;
      document.body.classList.remove('fs-active');
      if (typeof resize === 'function') setTimeout(resize, 120);
    }
    if (typeof window.updateFullscreenButton === 'function') window.updateFullscreenButton();
  } catch (e) { /* ignore */ }
}
// ─── Старт ──────────────────────────────────────────────────────
function start() {
setupTelegram();
if (typeof initAudio === 'function') initAudio();
if (typeof loadGame === 'function') loadGame();
// ★ Снимаем время отсутствия ДО любых saveGame(): ежедневный сброс/ачивки
//   могли перезаписать lastTick и обнулить всю ночь.
const awaySince = Number(S.lastTick) || Date.now();
// ★ Обучалка: включаем только для новой игры (нет прогресса и она не пройдена)
if (S.dustTotal === 0 && S.tutorialStep === 0 && !S.tutorialDone) {
  S.tutorialStep = 1; // Включаем туториал
}
  if (!S.playerName) {
    setTimeout(() => {
      document.getElementById('nicknameModal').classList.add('show');
    }, 1000);
  }
// ★ Отложенный старт: даём Telegram WebApp SDK время инициализироваться,
// иначе initData ещё пуст и синхронизация падает с «Нет initData».
// ★ Telegram внедряет initData не мгновенно. Сначала ready()/expand(),
// затем даём WebApp 500 мс; вне Telegram — обычная пауза 1000 мс.
const tgBoot = window.Telegram && window.Telegram.WebApp;
if (tgBoot) {
  try {
    if (tgBoot.ready) tgBoot.ready();
    if (tgBoot.expand) tgBoot.expand();
  } catch (e) { /* старые клиенты */ }
  setTimeout(function() {
    console.log('=== СТАРТ ИГРЫ ===');
    console.log('Локальный ник:', S.playerName);
    console.log('Локальная фаза:', S.stage);
    if (typeof syncCloudOnStart === 'function') {
      syncCloudOnStart().then(function (applied) { finishCloudStart(applied); })
        .catch(function () { finishCloudStart(false); });
    } else {
      finishCloudStart(false);
    }
  }, 500);
} else {
  setTimeout(function() {
    console.log('=== СТАРТ ИГРЫ ===');
    console.log('Локальный ник:', S.playerName);
    console.log('Локальная фаза:', S.stage);
    if (typeof syncCloudOnStart === 'function') {
      syncCloudOnStart().then(function (applied) { finishCloudStart(applied); })
        .catch(function () { finishCloudStart(false); });
    } else {
      finishCloudStart(false);
    }
  }, 1000);
}
if (typeof acInit === 'function') acInit();
resize();
if (typeof initParticles === 'function') initParticles();
if (typeof initUI === 'function') initUI();
if (typeof initPrestige === 'function') initPrestige();
if (typeof initEventLog === 'function') initEventLog();
if (typeof checkDailyReset === 'function') checkDailyReset();
if (typeof checkAchievements === 'function') checkAchievements();
// ★ Сначала пробуем облако: если сервер применил сейв, офлайн уже посчитан
// им по saved_at. Локальный расчёт — только fallback (облако недоступно или
// пустое). Иначе второй девайс со старым lastTick присылал «Отсутствие: N ч»
// и фейковые потери ещё до того, как облако перезапишет состояние.
const deferLocalOffline = (typeof isCloudAvailable === 'function' && isCloudAvailable());
let offline = null;
if (deferLocalOffline) window.__deferOfflineNotify = true;
if (typeof applyOfflineProgress === 'function') {
  // ★ Офлайн-расчёт не должен мешать запуску игры: любая ошибка — просто
  //   пропускаем досчёт, но цикл и UI всё равно стартуют.
  try {
    offline = applyOfflineProgress(awaySince);
  } catch (e) {
    console.warn('offline progress failed', e);
    S.lastTick = Date.now();
  }
}
if (offline) {
  if (deferLocalOffline) {
    window.__deferredOfflineResult = offline;
  } else if (typeof showOfflineReport === 'function') {
    showOfflineReport(offline);
  }
}

// ★ Вызывается, когда syncCloudOnStart() завершился. Если облачный сейв
// применился — выбрасываем локальный отчёт (сервер уже всё посчитал) и
// закрепляем серверное начисление ближайшим сейвом. Если нет — показываем
// локальный отчёт и досылаем отложенное уведомление в Telegram.
function finishCloudStart(applied) {
  // ★ applied === true значит, что синхронизация прошла: либо облако применено,
  //   либо локальный сейв принят сервером. В обоих случаях офлайн уже посчитан
  //   серверным временем, и локальный отчёт (по локальному lastTick) показывать
  //   нельзя: замороженный WebView оставлял lastTick на дни назад, и игра писала
  //   «Галактика в запустении» после часового отсутствия.
  const cloudApplied = (window.__cloudSaveAppliedOnStart === true) || applied === true;
  const hadDeferred = !!window.__deferredOfflineResult || window.__deferOfflineNotify === true;
  window.__deferOfflineNotify = false;
  if (cloudApplied) {
    window.__deferredOfflineResult = null;
    window.__deferredOfflineReport = null;
    if (typeof autoSaveToCloud === 'function') {
      setTimeout(function () { autoSaveToCloud(true); }, 1500);
    }
    return;
  }
  if (!hadDeferred) return;
  if (window.__deferredOfflineResult && typeof showOfflineReport === 'function') {
    showOfflineReport(window.__deferredOfflineResult);
  }
  window.__deferredOfflineResult = null;
  if (typeof window.__flushDeferredOfflineNotify === 'function') window.__flushDeferredOfflineNotify();
}

// ═══════════════════════════════════════════════════════════════
//  ОТЧЁТ О ВОЗВРАЩЕНИИ И ДОСЧЁТ ВРЕМЕНИ ОТСУТСТВИЯ
// ═══════════════════════════════════════════════════════════════
// ★ Раньше офлайн считался только при запуске игры. Если вкладка /
//   Telegram оставались открытыми, RAF замирал, автосейв обновлял
//   lastTick — и вся ночь «исчезала» без атак и без потерь.
function showOfflineReport(offline) {
  if (!offline) return;
  const h = Math.floor((offline.seconds || 0) / 3600);
  const m = Math.floor(((offline.seconds || 0) % 3600) / 60);
  const ts = h > 0 ? h + ' ч ' + m + ' мин' : m + ' мин';
  const gains = [];
  const losses = [];
  const canFmt = typeof fmt === 'function';

  if (offline.dustEarned > 0) gains.push((canFmt ? '+' + fmt(offline.dustEarned) : '+' + offline.dustEarned) + ' ✦');
  if (offline.energyEarned > 0) gains.push((canFmt ? '+' + fmt(offline.energyEarned) : '+' + offline.energyEarned) + ' ⚡');
  if (offline.civEarned > 0) gains.push((canFmt ? '+' + fmt(offline.civEarned) : '+' + offline.civEarned) + ' 🧬');
  if (offline.metalsEarned > 0) gains.push((canFmt ? '+' + fmt(offline.metalsEarned) : '+' + offline.metalsEarned) + ' ⚙');
  if (offline.cometEarned > 0) gains.push((canFmt ? '+' + fmt(offline.cometEarned) : '+' + offline.cometEarned) + ' ☄️ ✦');
  if (offline.expEarned > 0) gains.push((canFmt ? '+' + fmt(offline.expEarned) : '+' + offline.expEarned) + ' 🚀 ✦');

  if (offline.invasionLostDust > 0) losses.push((canFmt ? '−' + fmt(offline.invasionLostDust) : '−' + offline.invasionLostDust) + ' ✦');
  if (offline.invasionDrainE > 0) losses.push((canFmt ? '−' + fmt(offline.invasionDrainE) : '−' + offline.invasionDrainE) + ' ⚡');
  if (offline.invasionDrainC > 0) losses.push((canFmt ? '−' + fmt(offline.invasionDrainC) : '−' + offline.invasionDrainC) + ' 🧬');
  if (offline.invasionLostMetals > 0) losses.push((canFmt ? '−' + fmt(offline.invasionLostMetals) : '−' + offline.invasionLostMetals) + ' ⚙');
  if (offline.invasionLost > 0) losses.push('🪐 ' + offline.invasionLost + ' планет(ы) в простое');
  if (offline.invasionSystemsDamaged > 0) losses.push('🌫️ ' + offline.invasionSystemsDamaged + ' систем(ы) повреждены');
  // ★ «Запустение» показываем только если реально были атаки/потери:
  //   у игрока из одних Прайм-систем урон невозможен, пугать его нечем.
  const neglected = offline.neglectLevel > 0 && (offline.invasionAttacks > 0 || losses.length > 0);
  // ★ Короткие переключения вкладок не должны спамить отчётами.
  const significant = neglected || losses.length > 0 || offline.nightEnded ||
    (Number(offline.seconds) || 0) >= 5 * 60;
  if (!significant) return;

  // ★ Долгое отсутствие — отдельный, заметный отчёт, а не строчка в тосте.
  if (neglected && typeof showNeglectReport === 'function') {
    showNeglectReport(offline);
  }

  setTimeout(function() {
    if (typeof toast !== 'function') return;
    if (neglected) {
      const lines = [];
      lines.push('Отсутствие: <b>' + ts + '</b> · запустение <b>ур.' + offline.neglectLevel + '/5</b>');
      if (losses.length) lines.push('Потери: ' + losses.join(' · '));
      if (offline.invasionDefended > 0) lines.push('Отбито атак: ' + offline.invasionDefended + ' из ' + offline.invasionAttacks);
      if (gains.length) lines.push('Доход: ' + gains.join(' · '));
      toast('☠️ Галактика в запустении', lines.join('<br>'));
    } else if (offline.nightEnded) {
      let msg = 'Ночные миссии завершены. ';
      if (offline.cometEarned > 0 || offline.expEarned > 0) msg += 'Миссии вернулись с частью наград. ';
      if (losses.length) msg += '⚠️ ' + losses.join(' · ') + '. ';
      if (gains.length) msg += gains.join(' · ');
      toast('☀️ Доброе утро!', msg);
    } else if (losses.length) {
      const msg = losses.join(' · ') + (gains.length ? '<br>' + gains.join(' · ') : '');
      toast('⚠️ Возвращение', msg);
    } else if (gains.length) {
      toast('Офлайн за ' + ts, gains.join(' · '));
    }
  }, 500);

  if (typeof logOfflineIncome === 'function') {
    logOfflineIncome(offline.seconds, offline.dustEarned || 0, offline);
  }
}
window.showOfflineReport = showOfflineReport;

let _awayCatchUpBusy = false;
// ★ Досчитывает пропущенное время при возврате в открытую вкладку,
//   пробуждении ПК или сворачивании Telegram. Вызывается из loopFrame
//   и из событий visible/focus/pageshow.
function catchUpAwayProgress() {
  if (!window.__gameStarted || _awayCatchUpBusy) return null;
  const now = Date.now();
  const last = Number(S.lastTick) || now;
  // ★ Тот же порог, что у applyOfflineProgress: не теряем 30–60 с.
  if (now - last < 30 * 1000) return null;
  _awayCatchUpBusy = true;
  let out = null;
  try {
    out = (typeof applyOfflineProgress === 'function') ? applyOfflineProgress() : null;
  } catch (e) {
    console.warn('away catch-up failed', e);
    S.lastTick = now;
  } finally {
    _awayCatchUpBusy = false;
  }
  if (out) {
    if (typeof showOfflineReport === 'function') showOfflineReport(out);
    if (typeof updateUI === 'function') updateUI();
    if (typeof updateSystemSwitcher === 'function') updateSystemSwitcher();
    if (typeof updateHudChips === 'function') updateHudChips();
    if (typeof saveGame === 'function') saveGame();
  }
  return out;
}
window.catchUpAwayProgress = catchUpAwayProgress;

document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'visible') setTimeout(catchUpAwayProgress, 60);
});
window.addEventListener('focus', function() {
  setTimeout(catchUpAwayProgress, 60);
});
window.addEventListener('pageshow', function() {
  setTimeout(catchUpAwayProgress, 60);
});
setTimeout(resize, 200);
// ★ Ежедневка выдаётся всегда, но не раньше 4-й фазы (сборки первой планеты),
// чтобы награда не давала пыль на старте и не скипала ранние фазы
if (S.stage !== 'cloud' && S.stage !== 'condense' && S.stage !== 'protostar' && typeof checkDailyRewards === 'function') {
checkDailyRewards();
}
if (offline && typeof checkFirstNightShield === 'function') {
checkFirstNightShield(offline.seconds);
}
if (typeof updateUI === 'function') updateUI();
if (typeof restoreRandomEvent === 'function') restoreRandomEvent();
if (typeof updateSystemSwitcher === 'function') updateSystemSwitcher();
function bootLoop() { window.__gameStarted = true; requestAnimationFrame(loop); }
function afterBootLore() {
  bootLoop();
  if (typeof maybeShowGameGuide === 'function') setTimeout(maybeShowGameGuide, 400);
}
const stage = S.stage;
if (typeof showLoreCard === 'function' && typeof LORE !== 'undefined' && LORE[stage]) {
showLoreCard(stage, afterBootLore);
} else {
afterBootLore();
}
if (typeof initCloudSave === 'function') {
    initCloudSave(); // Включит автосохранение при закрытии
}
}
setTimeout(resize, 100);
setTimeout(resize, 300);
setTimeout(resize, 800);
setTimeout(resize, 1500);
setTimeout(function() {
if ((window.CANVAS_W || 0) < 10 || (window.CANVAS_H || 0) < 10) {
resize();
if (typeof initParticles === 'function') initParticles(true);
}
}, 2000);
window.addEventListener('beforeunload', function() {
if (typeof saveGame === 'function') saveGame();
});
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
//  СЛУЧАЙНЫЕ СОБЫТИЯ
//  Вся логика — в js/random-events.js (daily + weekly world events).
// ═══════════════════════════════════════════════════════════════
// Запуск приложения
window.galaxyLodLevel = galaxyLodLevel;
window.galaxyMacroAt = galaxyMacroAt;
window.galaxyMacroObjects = galaxyMacroObjects;
window.startGalaxyMacroDrill = startGalaxyMacroDrill;
window.updateGalaxyMacroDrill = updateGalaxyMacroDrill;
window.drawGalaxyMacroDrillEffect = drawGalaxyMacroDrillEffect;
window.triggerGalaxyMerge = triggerGalaxyMerge;
window.checkGalaxyMergeThresholds = checkGalaxyMergeThresholds;
start();