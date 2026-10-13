// ═══════════════════════════════════════════════════════════════
//  MAIN.JS — цикл, canvas, ввод, зум, панорама
// ═══════════════════════════════════════════════════════════════

const canvas = document.getElementById('sky');
const ctx = canvas.getContext('2d');
let W, H, cx, cy, dpr;

// ─── Fullscreen ─────────────────────────────────────────────────
// Запрашиваем только ОДИН раз и не мешаем вводу
let fullscreenRequested = false;
function requestFullscreen() {
  if (fullscreenRequested) return;
  fullscreenRequested = true;
  const el = document.documentElement;
  // Отложенный вызов — не перехватывает текущий pointerdown
  setTimeout(function() {
    try {
      if (el.requestFullscreen) el.requestFullscreen().catch(function() {});
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } catch (e) {}
  }, 50);
}

// ─── Защита от случайного сворачивания жестами ────────────────
// Односвайповые жесты (свайп вниз в ТГ = свернуть, свайп вбок в браузере = назад)
// глушим полностью; скролл разрешаем только внутри карточки модалки.
document.addEventListener('touchmove', function(e) {
  const target = e.target;
  if (target && target.closest && target.closest('.modal-card')) return;
  if (e.touches.length > 1) { e.preventDefault(); return; }
  e.preventDefault();
}, { passive: false });

// Safari: жесты масштабирования страницы не должны перехватывать игру
document.addEventListener('gesturestart', function(e) { e.preventDefault(); }, { passive: false });
document.addEventListener('gesturechange', function(e) { e.preventDefault(); }, { passive: false });

document.addEventListener('touchstart', function(e) {
  window._lastTouchY = e.touches[0].clientY;
}, { passive: true });

// ─── Resize ─────────────────────────────────────────────────────
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  let realW = canvas.clientWidth, realH = canvas.clientHeight;
  if (!realW || realW < 10) realW = window.innerWidth;
  if (!realH || realH < 10) realH = window.innerHeight;
  W = realW; H = realH;
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cx = W / 2; cy = H / 2;
  window.CANVAS_CX = cx; window.CANVAS_CY = cy;
  window.CANVAS_W = W; window.CANVAS_H = H;
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', function() {
  setTimeout(resize, 150);
  setTimeout(resize, 400);
});

// ─── Камера: зум, защита от NaN и поворот на 360° ─────────────
function applyZoom(factor) {
  if (!isFinite(factor) || factor <= 0) return;
  S.zoom = Math.max(0.4, Math.min(3.0, (S.zoom || 1) * factor));
}
window.applyZoom = applyZoom;

// Если в состояние попали NaN/бесконечность (например, от жестов),
// всё рисование ломается и холст чернеет — поэтому чиним каждый кадр.
function sanitizeView() {
  if (!isFinite(S.zoom) || S.zoom <= 0) S.zoom = 1;
  S.zoom = Math.max(0.4, Math.min(3.0, S.zoom));
  if (!isFinite(S.panX)) S.panX = 0;
  if (!isFinite(S.panY)) S.panY = 0;
  if (!isFinite(S.rotation)) S.rotation = 0;
}

// Поворот камеры (кнопка ⤾): шаг 45°, удержание — непрерывное вращение
function rotateCamera(delta) {
  S.rotation = (S.rotation || 0) + delta;
  while (S.rotation > Math.PI) S.rotation -= Math.PI * 2;
  while (S.rotation < -Math.PI) S.rotation += Math.PI * 2;
}
window.rotateCamera = rotateCamera;
let rotateHeld = false;
let rotateHoldTimer = null;
(function setupRotateButton() {
  function attach() {
    const btn = document.getElementById('rotateBtn');
    if (!btn) { setTimeout(attach, 200); return; }
    if (btn.dataset.rotateReady === '1') return;
    btn.dataset.rotateReady = '1';

    btn.addEventListener('pointerdown', function(e) {
      e.preventDefault();
      rotateCamera(Math.PI / 4);            // короткий тап — шаг 45°
      rotateHoldTimer = setTimeout(function() { rotateHeld = true; }, 350);
    });
    const stopRotate = function() {
      if (rotateHoldTimer) clearTimeout(rotateHoldTimer);
      rotateHoldTimer = null;
      rotateHeld = false;
    };
    btn.addEventListener('pointerup', stopRotate);
    btn.addEventListener('pointerleave', stopRotate);
    btn.addEventListener('pointercancel', stopRotate);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else { attach(); }
})();

// ─── Управление камерой: зум и панорамирование (исключительно тачпад / мышь) ───
// Клавиатурное управление (WASD, стрелки) полностью отключено.
canvas.addEventListener('wheel', function(e) {
  e.preventDefault();

  // Колесо мыши и пинч на тачпаде (ctrlKey) — ЗУМ.
  // Двухпальцевый скролл тачпада — панорамирование камеры.
  const isMouseWheel = e.ctrlKey || e.deltaMode !== 0 ||
    (Math.abs(e.deltaY) >= 90 && Math.abs(e.deltaX) < 1);

  if (isMouseWheel) {
    applyZoom(e.ctrlKey ? Math.exp(-e.deltaY * 0.01)
                        : (e.deltaY > 0 ? 0.90 : 1.11));
    return;
  }

  if (Math.abs(e.deltaX) > 0 || Math.abs(e.deltaY) > 0) {
    if (S.starType) {
      // Двухпальцевый свайп на тачпаде двигает камеру
      S.panX = (S.panX || 0) - e.deltaX;
      S.panY = (S.panY || 0) - e.deltaY;
    } else {
      applyZoom(e.deltaY > 0 ? 0.92 : 1.08);
    }
  }
}, { passive: false });

// ─── Ввод ───────────────────────────────────────────────────────
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

  // Мини-игра перехватывает ввод
  if (S.activeMinigame) {
    const pos = getPointerPos(e);
    if (typeof mgPointerDown === 'function') mgPointerDown(pos.x, pos.y);
    return;
  }

  // Fullscreen только на первом тапе (без влияния на ввод)
  if (!fullscreenRequested) requestFullscreen();
  // ★ Клик по кораблю вторжения — в приоритете
  if (typeof tryHitInvasionShip === 'function') {
    const pos = getPointerPos(e);
    if (tryHitInvasionShip(pos.x, pos.y)) return;
  }

  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  // Два пальца → пинч (зум + поворот)
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

  // Один палец
  if (pointers.size === 1) {
    const pos = getPointerPos(e);

    // На галактическом виде — клик по системе
    if (S.starType && S.totalSystemsCreated >= 5) {
      handleGalaxyClick(pos.x, pos.y);
      return;
    }

    // После выбора звезды — панорама
    if (S.starType) {
      isPanning = true;
      panStartX = pos.x;
      panStartY = pos.y;
      panStartPanX = S.panX || 0;
      panStartPanY = S.panY || 0;
      return;
    }

    // До звезды — drag частиц
    handleParticleDrag(pos.x, pos.y, true);
    handleCanvasClick(pos.x, pos.y);
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

  // Пинч — зум + поворот
  if (pointers.size === 2 && pinchStartDist > 0) {
    e.preventDefault();
    const pts = Array.from(pointers.values());
    const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    S.zoom = Math.max(0.4, Math.min(3.0, pinchStartZoom * (d / pinchStartDist)));
    const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
    S.rotation = (pinchStartRotation || 0) + (angle - pinchStartAngle);
    return;
  }

  // Панорама или drag частиц
  if (pointers.size === 1) {
    const pos = getPointerPos(e);
    if (isPanning) {
      S.panX = panStartPanX + (pos.x - panStartX);
      S.panY = panStartPanY + (pos.y - panStartY);
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

// ─── Позиция системы в галактическом виде ───────────────────────
// Общая функция для отрисовки и кликов: форма галактики зависит
// от S.galaxyForm (меняется после каждой сверхновой).
function galaxySystemPos(i, total, time) {
  const form = S.galaxyForm || 'spiral';
  const t = time || 0;

  if (form === 'ring') {
    // Кольцевая: системы на окружности
    const angle = (i / Math.max(1, total)) * Math.PI * 2 + t * 0.02;
    const dist = 90 + Math.min(8, Math.floor(i / 10)) * 60;
    return { x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist * 0.6 };
  }
  if (form === 'elliptical') {
    // Эллиптическая: плотное ядро, вытянутый ореол
    const angle = i * 2.399963 + t * 0.01;
    const r = 45 + Math.sqrt(i) * 28;
    return { x: cx + Math.cos(angle) * r * 1.5, y: cy + Math.sin(angle) * r * 0.75 };
  }
  if (form === 'irregular') {
    // Иррегулярная: разброс без структуры
    const angle = i * 2.399963 + Math.sin(i * 3.7) * 0.9 + t * 0.005;
    const r = 35 + ((i * 47) % 140) + Math.sin(i * 1.7) * 30;
    return { x: cx + Math.cos(angle) * r * 1.3, y: cy + Math.sin(angle) * r * 0.8 };
  }
  // Спиральная (по умолчанию): рукава
  const arm = Math.floor(i / 6), idx = i % 6;
  const angle = arm * Math.PI / 2 + idx * 0.4 + t * 0.02;
  const dist = 60 + arm * 70 + idx * 25;
  return { x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist * 0.5 };
}

// ─── Клик по галактическому виду ────────────────────────────────
function handleGalaxyClick(x, y) {
  const total = S.totalSystemsCreated || 1;
  const t = performance.now() / 1000;
  for (let i = 0; i < total; i++) {
    const p = galaxySystemPos(i, total, t);
    if (Math.hypot(p.x - x, p.y - y) < 20) {
      switchToSystem(i);
      S.panX = 0; S.panY = 0; S.zoom = 1; S.rotation = 0;
      return;
    }
  }
}

// ─── Главный цикл ───────────────────────────────────────────────
let last = performance.now();
let lastSave = 0;
let shopHintShown = false;

function loop(now) {
  // Одна «плохая» итерация не должна убивать игру (чёрный экран):
  // перехватываем ошибку и продолжаем цикл.
  try {
    loopFrame(now);
  } catch (e) {
    if (!window.__loopErrorAt || performance.now() - window.__loopErrorAt > 3000) {
      window.__loopErrorAt = performance.now();
      console.error('Пропущен кадр (защита цикла):', e);
    }
    requestAnimationFrame(loop);
  }
}

function loopFrame(now) {
  sanitizeView();
  if (!canvas.width || !canvas.height) resize();
  const dt = Math.min((now - last) / 1000, 0.5);
  last = now;
  const time = now / 1000;

  // Удержание кнопки поворота — камера крутится непрерывно
  if (rotateHeld) rotateCamera(1.6 * dt);

  // Мини-игра — пауза всей остальной логики
  if (S.activeMinigame && typeof updateMinigame === 'function') {
    updateMinigame(dt, time);
    drawBackground(time);
    drawMinigame(ctx, time);
    requestAnimationFrame(loop);
    return;
  }

  // Пассивный доход
  const dustCap = getResourceCap('dust');
  if (S.dust < dustCap) {
    const gain = dustPerSec() * dt;
    const actualGain = Math.min(dustCap - S.dust, gain);
    S.dust += actualGain;
    S.dustTotal += actualGain;
  }

  const energyCap = getResourceCap('energy');
  if (S.energy < energyCap) {
    const eGain = energyPerSec() * dt;
    const actualEGain = Math.min(energyCap - S.energy, eGain);
    if (actualEGain > 0) S.energy += actualEGain;
  }

  // ─── Металлы от лава-планет (без капа) ───
  const metalGain = metalsPerSec() * dt;
  if (metalGain > 0) S.metalAmount = (S.metalAmount || 0) + metalGain;

  // Основные тики
  // Основные тики
  tickCiv(dt);
  updateParticles(dt, time);
  updatePlanets(dt);
  if (typeof updateMissions === 'function') updateMissions(dt, time);
  if (typeof tickInvasions === 'function') tickInvasions(dt);
  checkEvolution();

  // ★ Фаза «Галактика»: системы покупаются в магазине (js/shop.js),
  //   авто-создание убрано — игрок сам решает, когда и с какими бонусами.
  if (S.stage === 'galaxy' && typeof systemShopCosts === 'function') {
    const shopCost = systemShopCosts().dust;
    if (S.dust >= shopCost) {
      if (!shopHintShown) {
        shopHintShown = true;
        toast('🌌 Хватит пыли на систему',
          'Открой кнопку «Новая система», чтобы основать её');
      }
    } else {
      shopHintShown = false;
    }
  }

  // Отрисовка
  drawBackground(time);
  if (S.totalSystemsCreated >= 5) {
    drawGalaxyView(time);
  } else {
    drawParticles(ctx, time);
    drawStar(ctx, time);
    drawPlanets(ctx, time);
  }
    if (typeof drawInvasions === 'function') drawInvasions(ctx, time);

  // Сохранение и UI
  if (now - lastSave > 4000) { saveGame(); lastSave = now; }
  updateUI();
  updateQuestPanel();
  if (typeof renderMissionButtons === 'function') renderMissionButtons();

  requestAnimationFrame(loop);
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
  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.9);
  bg.addColorStop(0, '#0a0620');
  bg.addColorStop(1, '#02010a');
  ctx.fillStyle = bg;
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

// ─── Галактический вид ──────────────────────────────────────────
function drawGalaxyView(time) {
  const t = time;
  const total = S.totalSystemsCreated || 1;
  const positions = [];
  for (let i = 0; i < total; i++) {
    const p = galaxySystemPos(i, total, t);
    positions.push({ x: p.x, y: p.y, idx: i });
  }
  // Связи между близкими системами
  ctx.save();
  ctx.strokeStyle = 'rgba(139,127,212,0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const dx = positions[i].x - positions[j].x;
      const dy = positions[i].y - positions[j].y;
      if (dx * dx + dy * dy < 14000) {
        ctx.beginPath();
        ctx.moveTo(positions[i].x, positions[i].y);
        ctx.lineTo(positions[j].x, positions[j].y);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
  // Сами системы
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    const isActive = pos.idx === S.activeSystemIdx;
    const size = isActive ? 10 : 6;
    const hue = 50 + (pos.idx * 37) % 100;
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
    ctx.fillStyle = isActive ? '#e8e2ff' : '#8b7fd4';
    ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    let nm = 'С-ма ' + (pos.idx + 1);
    if (pos.idx === 0) nm = S.systemName;
    else if (S.otherSystems[pos.idx]) nm = S.otherSystems[pos.idx].name;
    ctx.fillText(nm, pos.x, pos.y + size * 2.5);
  }

  // ─── Подпись галактики: форма, номер и множитель дохода ───
  const formLabel = {
    spiral: 'Спиральная', elliptical: 'Эллиптическая',
    irregular: 'Иррегулярная', ring: 'Кольцевая',
  }[S.galaxyForm || 'spiral'];
  ctx.save();
  ctx.fillStyle = 'rgba(185, 168, 255, 0.8)';
  ctx.font = 'bold 12px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Галактика ' + (S.galaxies || 1) + ' · ' + formLabel +
    ' · доход ×' + (S.galaxyMultiplier || 1).toFixed(1), cx, H - 96);
  ctx.restore();
}

// ─── Telegram Mini App: полный экран и запрет сворачивания ──────
function setupTelegram() {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (!tg) return;
  try {
    if (tg.ready) tg.ready();
    if (tg.expand) tg.expand();
    // Свайп вниз больше не сворачивает игру
    if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
    if (tg.setHeaderColor) tg.setHeaderColor('#02010a');
    if (tg.setBackgroundColor) tg.setBackgroundColor('#02010a');
    // Полный экран в TG (Bot API 8.0+); если не поддерживается — обычный режим
    if (tg.requestFullscreen &&
        (!tg.isVersionAtLeast || tg.isVersionAtLeast('8.0'))) {
      tg.requestFullscreen();
    }
  } catch (e) { /* в браузере просто пропускаем */ }
}

// ─── Старт ──────────────────────────────────────────────────────
function start() {
  setupTelegram();
  loadGame();
  resize();
  initParticles();
  initUI();
  if (typeof initPrestige === 'function') initPrestige();

  const offline = applyOfflineProgress();
  if (offline && offline.earned > 0) {
    const h = Math.floor(offline.seconds / 3600);
    const m = Math.floor((offline.seconds % 3600) / 60);
    const ts = h > 0 ? h + ' ч ' + m + ' мин' : m + ' мин';
    setTimeout(function() {
      toast('Офлайн-доход', 'Отсутствовали ' + ts + ' · +' + fmt(offline.earned));
    }, 500);
  }

  updateUI();
  updateSystemSwitcher();
  requestAnimationFrame(loop);
}

// Повторные resize для мобильных
setTimeout(resize, 100);
setTimeout(resize, 300);
setTimeout(resize, 800);
setTimeout(resize, 1500);
setTimeout(function() {
  if ((window.CANVAS_W || 0) < 10 || (window.CANVAS_H || 0) < 10) {
    resize();
    if (typeof initParticles === 'function') initParticles();
  }
}, 2000);

window.addEventListener('beforeunload', saveGame);
start();
