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

// ─── Защита от сворачивания ─────────────────────────────────────
document.addEventListener('touchmove', function(e) {
  if (e.touches.length > 1) return;
  const target = e.target;
  if (target && target.closest && (target.closest('#sky') || target.closest('.hud'))) {
    const dy = Math.abs(e.touches[0].clientY - (window._lastTouchY || 0));
    window._lastTouchY = e.touches[0].clientY;
    if (dy > 5) e.preventDefault();
  }
}, { passive: false });

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

// ─── Зум через кнопки ───────────────────────────────────────────
function applyZoom(factor) {
  S.zoom = Math.max(0.4, Math.min(3.0, (S.zoom || 1) * factor));
  console.log('[zoom] new =', S.zoom);
}
window.applyZoom = applyZoom;

const zoomInBtn = document.getElementById('zoomIn');
const zoomOutBtn = document.getElementById('zoomOut');
if (zoomInBtn) {
  zoomInBtn.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    applyZoom(1.2);
  });
}
if (zoomOutBtn) {
  zoomOutBtn.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    applyZoom(0.83);
  });
}

// Зум колёсиком мыши
canvas.addEventListener('wheel', function(e) {
  e.preventDefault();
  applyZoom(e.deltaY > 0 ? 0.9 : 1.1);
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

// ─── Клик по галактическому виду ────────────────────────────────
function handleGalaxyClick(x, y) {
  const total = S.totalSystemsCreated || 1;
  for (let i = 0; i < total; i++) {
    const arm = Math.floor(i / 6), idx = i % 6;
    const angle = arm * Math.PI / 2 + idx * 0.4;
    const dist = 60 + arm * 70 + idx * 25;
    const px = cx + Math.cos(angle) * dist;
    const py = cy + Math.sin(angle) * dist * 0.5;
    if (Math.hypot(px - x, py - y) < 20) {
      switchToSystem(i);
      S.panX = 0; S.panY = 0; S.zoom = 1; S.rotation = 0;
      return;
    }
  }
}

// ─── Главный цикл ───────────────────────────────────────────────
let last = performance.now();
let lastSave = 0;

function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.5);
  last = now;
  const time = now / 1000;

  // Мини-игра — пауза всей остальной логики
  if (S.activeMinigame && typeof updateMinigame === 'function') {
    updateMinigame(dt, time);
    drawBackground(time);
    drawMinigame(ctx, time);
    requestAnimationFrame(loop);
    return;
  }

  // Пассивный доход
  const gain = dustPerSec() * dt;
  S.dust += gain;
  S.dustTotal += gain;

  const eGain = energyPerSec() * dt;
  if (eGain > 0) S.energy += eGain;

  // Основные тики
  tickCiv(dt);
  updateParticles(dt, time);
  updatePlanets(dt);
  if (typeof updateMissions === 'function') updateMissions(dt, time);
  checkEvolution();

  // Отрисовка
  drawBackground(time);
  if (S.totalSystemsCreated >= 5) {
    drawGalaxyView(time);
  } else {
    drawParticles(ctx, time);
    drawStar(ctx, time);
    drawPlanets(ctx, time);
  }

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
    const arm = Math.floor(i / 6), idx = i % 6;
    const angle = arm * Math.PI / 2 + idx * 0.4 + t * 0.02;
    const dist = 60 + arm * 70 + idx * 25;
    positions.push({
      x: cx + Math.cos(angle) * dist,
      y: cy + Math.sin(angle) * dist * 0.5,
      idx: i,
    });
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
}

// ─── Старт ──────────────────────────────────────────────────────
function start() {
  loadGame();
  resize();
  initParticles();
  initUI();

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
