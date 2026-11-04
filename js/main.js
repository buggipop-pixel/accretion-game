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
  if (target && target.closest && target.closest('.modal-card, .lore-content, .guide-panel, .quests-panel')) return;
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
window.applyZoom = applyZoom;
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
      const hit = galaxySystemAt(pos.x, pos.y);
      const nowTap = performance.now();
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
  if (pointers.size < 2) pinchStartDist = 0;
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
function galaxySystemPos(i, total, time) {
  const form = S.galaxyForm || 'spiral';
  const t = time || 0;
  let bx = 0, by = 0;
  if (form === 'ring') {
const angle = (i / Math.max(1, total)) * Math.PI * 2 + t * 0.02;
const dist = 90 + Math.min(8, Math.floor(i / 10)) * 60;
bx = Math.cos(angle) * dist; by = Math.sin(angle) * dist * 0.6;
} else if (form === 'elliptical') {
const angle = i * 2.399963 + t * 0.01;
const r = 45 + Math.sqrt(i) * 28;
bx = Math.cos(angle) * r * 1.5; by = Math.sin(angle) * r * 0.75;
} else if (form === 'irregular') {
const angle = i * 2.399963 + Math.sin(i * 3.7) * 0.9 + t * 0.005;
const r = 35 + ((i * 47) % 140) + Math.sin(i * 1.7) * 30;
bx = Math.cos(angle) * r * 1.3; by = Math.sin(angle) * r * 0.8;
} else {
// Спиральная
const arm = Math.floor(i / 3), idx = i % 3;
const angle = arm * Math.PI / 2 + idx * 0.5 + t * 0.02;
const dist = 60 + arm * 80 + idx * 25;
bx = Math.cos(angle) * dist; by = Math.sin(angle) * dist * 0.5;
}
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
// ★ Двойной тап по системе в галактике открывает её. Одиночный — выделяет.
const GALAXY_DOUBLE_TAP_MS = 380;
let galaxyTap = { idx: -1, at: 0 };

// Хит-тест систем: радиус задан в экранных пикселях и не зависит от зума.
function galaxySystemAt(x, y) {
  if (S.vis && S.vis.prestigeAnim) return -1;
  const total = S.totalSystemsCreated || 1;
  const t = performance.now() / 1000;
  let best = -1, bestD = Infinity;
  for (let i = 0; i < total; i++) {
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
function drawGalaxyView(time) {
const t = time;
const total = S.totalSystemsCreated || 1;
const positions = [];
for (let i = 0; i < total; i++) {
const p = galaxySystemPos(i, total, t);
positions.push({ x: p.x, y: p.y, idx: i });
}
// Созвездия (линии между близкими звёздами)
ctx.save();
ctx.strokeStyle = 'rgba(139, 127, 212, 0.3)';
ctx.lineWidth = 1.5;
for (let i = 0; total <= 300 && i < positions.length; i += 3) {
for (let j = i; j < i + 3 && j < positions.length - 1; j++) {
ctx.beginPath();
ctx.moveTo(positions[j].x, positions[j].y);
ctx.lineTo(positions[j + 1].x, positions[j + 1].y);
ctx.stroke();
}
}
ctx.restore();
// Названия созвездий
const constellationNames = ['Орион', 'Дракон', 'Лиры', 'Феникс', 'Центавр', 'Гидра', 'Кит', 'Пегас', 'Андромеда', 'Орёл', 'Волопас', 'Лебедь'];
for (let i = 0; (S.zoom || 1) >= 0.45 && i < positions.length; i += 3) {
let cxA = 0, cyA = 0, count = 0;
for (let j = i; j < i + 3 && j < positions.length; j++) {
cxA += positions[j].x; cyA += positions[j].y; count++;
}
if (count === 0) continue;
cxA /= count; cyA /= count;
ctx.save();
ctx.fillStyle = 'rgba(180, 160, 255, 0.6)';
ctx.font = 'italic 10px -apple-system, sans-serif';
ctx.textAlign = 'center';
ctx.fillText(constellationNames[Math.floor(i / 3) % constellationNames.length], cxA, cyA - 20);
ctx.restore();
}
// ★ СИСТЕМЫ (С ОПТИМИЗАЦИЕЙ LOD)
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
// Упрощение графики (LOD) при >50 систем
const isLowDetail = (total > 50 && !isActive && !isPrime && pos.idx !== S.galaxySelectedIdx);
if (isLowDetail) {
ctx.fillStyle = 'rgba(200, 190, 255, 0.4)';
ctx.beginPath();
ctx.arc(pos.x, pos.y, 2, 0, Math.PI * 2);
ctx.fill();
continue;
}
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
const g = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, size * 3);
g.addColorStop(0, 'hsla(' + hue + ', 90%, 80%, 1)');
g.addColorStop(0.5, 'hsla(' + hue + ', 80%, 60%, 0.5)');
g.addColorStop(1, 'hsla(' + hue + ', 80%, 50%, 0)');
ctx.fillStyle = g;
ctx.beginPath();
ctx.arc(pos.x, pos.y, size * 3, 0, Math.PI * 2);
ctx.fill();
ctx.fillStyle = isActive ? '#fff' : '#d0c8ff';
ctx.beginPath();
ctx.arc(pos.x, pos.y, size * 0.4, 0, Math.PI * 2);
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
if (total <= 250) {
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
// Вспышка при взрыве престижа
if (S.vis && S.vis.prestigeAnim && S.vis.prestigeAnim.phase === 'explode') {
const el = performance.now() - S.vis.prestigeAnim.start - 1500;
const p = Math.min(1, el / 500);
ctx.fillStyle = 'rgba(255, 255, 255, ' + (1 - p) + ')';
ctx.beginPath();
ctx.arc(cx, cy, Math.max(W, H) * p, 0, Math.PI * 2);
ctx.fill();
}
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
        ' · доход ×' + (Number(S.galaxyMultiplier) || 1).toFixed(1);
      const sel = Number(S.galaxySelectedIdx);
      if (sel >= 0) text += ' · ' + galaxySystemNameAt(sel) + ' — двойной тап, чтобы войти';
      else text += ' · двойной тап по системе — войти';
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
      pushIfPossible(meta.icon + ' <b>Хранилище заполнено!</b> ' + meta.name + ': ' + meta.text + ' Зайдите и потратьте ресурсы.', meta.type);
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
} catch (e) {
if (!window.__loopErrorAt || performance.now() - window.__loopErrorAt > 3000) {
window.__loopErrorAt = performance.now();
console.error('Пропущен кадр (защита цикла):', e);
}
}
requestAnimationFrame(loop);
}
function loopFrame(now) {
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
if (typeof drawParticles === 'function') drawParticles(ctx, time);
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
    if (typeof syncCloudOnStart === 'function') syncCloudOnStart();
  }, 500);
} else {
  setTimeout(function() {
    console.log('=== СТАРТ ИГРЫ ===');
    console.log('Локальный ник:', S.playerName);
    console.log('Локальная фаза:', S.stage);
    if (typeof syncCloudOnStart === 'function') syncCloudOnStart();
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
let offline = null;
if (typeof applyOfflineProgress === 'function') {
offline = applyOfflineProgress();
}
if (offline) {
const h = Math.floor(offline.seconds / 3600);
const m = Math.floor((offline.seconds % 3600) / 60);
const ts = h > 0 ? h + ' ч ' + m + ' мин' : m + ' мин';
const parts = [];
if (offline.dustEarned > 0 && typeof fmt === 'function') parts.push('+' + fmt(offline.dustEarned) + ' ✦');
if (offline.energyEarned > 0 && typeof fmt === 'function') parts.push('+' + fmt(offline.energyEarned) + ' ⚡');
if (offline.civEarned > 0 && typeof fmt === 'function') parts.push('+' + fmt(offline.civEarned) + ' 🧬');
if (offline.metalsEarned > 0 && typeof fmt === 'function') parts.push('+' + fmt(offline.metalsEarned) + ' ⚙');
if (offline.invasionLostMetals > 0 && typeof fmt === 'function') parts.push('⚙ −' + fmt(offline.invasionLostMetals));
if (offline.cometEarned > 0 && typeof fmt === 'function') parts.push('☄️ +' + fmt(offline.cometEarned) + ' ✦');
if (offline.expEarned > 0 && typeof fmt === 'function') parts.push('🚀 +' + fmt(offline.expEarned) + ' ✦');
setTimeout(function() {
if (typeof toast !== 'function') return;
if (offline.nightEnded) {
let msg = 'Ночные миссии завершены. ';
if (offline.cometEarned > 0 || offline.expEarned > 0) msg += 'Миссии вернулись с частью наград. ';
if (offline.invasionLost > 0) msg += '⚠️ Потеряно объектов: ' + offline.invasionLost + '. ';
if (parts.length > 0) msg += parts.join(' · ');
toast('☀️ Доброе утро!', msg);
} else if (parts.length > 0) {
toast('Офлайн за ' + ts, parts.join(' · '));
}
}, 500);
if (typeof logOfflineIncome === 'function' && offline.dustEarned > 0) {
logOfflineIncome(offline.seconds, offline.dustEarned);
}
}
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
function bootLoop() { requestAnimationFrame(loop); }
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
start();