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
let fullscreenRequested = false;
function requestFullscreen() {
  if (fullscreenRequested) return;
  fullscreenRequested = true;
  
  const tg = window.Telegram && window.Telegram.WebApp;
  try {
    if (tg && tg.requestFullscreen && (!tg.isVersionAtLeast || tg.isVersionAtLeast('8.0'))) {
      tg.requestFullscreen();
    } else {
      const el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen().catch(function() {});
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    }
  } catch (e) {}
}

// ─── Защита от жестов (скролл страницы и т.д.) ───────────────────
document.addEventListener('touchmove', function(e) {
  const target = e.target;
  if (target && target.closest && target.closest('.modal-card')) return;
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
  if (!isFinite(factor) || factor <= 0) return;
  S.zoom = Math.max(0.4, Math.min(3.0, (S.zoom || 1) * factor));
}
window.applyZoom = applyZoom;

function sanitizeView() {
  if (!isFinite(S.zoom) || S.zoom <= 0) S.zoom = 1;
  S.zoom = Math.max(0.4, Math.min(3.0, S.zoom));
  if (!isFinite(S.panX)) S.panX = 0;
  if (!isFinite(S.panY)) S.panY = 0;
  if (!isFinite(S.rotation)) S.rotation = 0;
  if (!isFinite(S.tiltX)) S.tiltX = 0;
  if (!isFinite(S.tiltY)) S.tiltY = 0;

  // Ограничиваем панораму, чтобы не улететь в пустоту
  const maxPan = 2000;
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

  if (!fullscreenRequested) requestFullscreen();
  if (typeof unlockAudio === 'function') unlockAudio();
  if (typeof trackDaily === 'function') trackDaily('d_click', 1);
  if (!S.stats) S.stats = {};
  S.stats.clicks = (S.stats.clicks || 0) + 1;
  
  if (typeof tryHitInvasionShip === 'function') {
    const pos = getPointerPos(e);
    if (tryHitInvasionShip(pos.x, pos.y)) return;
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
      const clicked = handleGalaxyClick(pos.x, pos.y);
      if (!clicked) {
        isPanning = true;
        panStartX = pos.x;
        panStartY = pos.y;
        panStartPanX = S.panX || 0;
        panStartPanY = S.panY || 0;
      }
      return;
    }

    if (S.starType) {
      isPanning = true;
      panStartX = pos.x;
      panStartY = pos.y;
      panStartPanX = S.panX || 0;
      panStartPanY = S.panY || 0;
      return;
    }

    handleParticleDrag(pos.x, pos.y, true);

    if (S.stage === 'protostar' && typeof registerProtostarTap === 'function') {
      registerProtostarTap(pos.x, pos.y);
    }
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
    S.zoom = Math.max(0.4, Math.min(3.0, pinchStartZoom * (d / pinchStartDist)));
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

// Безопасная обертка для перетаскивания частиц
function handleParticleDrag(x, y, active) {
  if (typeof window.handleParticleDrag === 'function') {
    window.handleParticleDrag(x, y, active);
  } else {
    PART.dragActive = active;
    PART.dragX = x;
    PART.dragY = y;
  }
}

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
function handleGalaxyClick(x, y) {
if (S.vis && S.vis.prestigeAnim) return false;
const total = S.totalSystemsCreated || 1;
const t = performance.now() / 1000;
const hitR = 30 * (S.zoom || 1);
for (let i = 0; i < total; i++) {
const p = galaxySystemPos(i, total, t);
if (Math.hypot(p.x - x, p.y - y) < hitR) {
if (typeof switchToSystem === 'function') switchToSystem(i);
S.stage = 'system';
S.panX = 0; S.panY = 0; S.zoom = 1; S.rotation = 0;
if (typeof updateSystemSwitcher === 'function') updateSystemSwitcher();
if (typeof updateUI === 'function') updateUI();
return true;
}
}
return false;
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
for (let i = 0; i < positions.length; i += 3) {
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
for (let i = 0; i < positions.length; i += 3) {
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
} else if (S.otherSystems && S.otherSystems[pos.idx] && S.otherSystems[pos.idx].isPrime) {
isPrime = true;
primeData = S.otherSystems[pos.idx].primeData;
}
// Упрощение графики (LOD) при >50 систем
const isLowDetail = (total > 50 && !isActive && !isPrime);
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
// Подпись
if (total <= 50 || isActive || isPrime) {
let nm;
if (pos.idx === 0) {
nm = (S.activeSystemIdx === 0) ? S.systemName : (S.otherSystems && S.otherSystems[0] ? S.otherSystems[0].name : 'Родная');
} else {
nm = (S.otherSystems && S.otherSystems[pos.idx]) ? S.otherSystems[pos.idx].name : 'С-ма ' + (pos.idx + 1);
}
if (isPrime) nm = '👑 ' + nm;
ctx.fillStyle = isPrime ? '#ffe8a0' : (isActive ? '#fff' : 'rgba(200, 190, 255, 0.7)');
ctx.font = (isActive || isPrime ? 'bold ' : '') + (isPrime ? '13px' : '11px') + ' -apple-system, sans-serif';
ctx.textAlign = 'center';
ctx.fillText(nm, pos.x, pos.y + size * 2.5);
}
}
// Вспышка при взрыве престижа
if (S.vis && S.vis.prestigeAnim && S.vis.prestigeAnim.phase === 'explode') {
const el = performance.now() - S.vis.prestigeAnim.start - 1500;
const p = Math.min(1, el / 500);
ctx.fillStyle = 'rgba(255, 255, 255, ' + (1 - p) + ')';
ctx.beginPath();
ctx.arc(cx, cy, Math.max(W, H) * p, 0, Math.PI * 2);
ctx.fill();
}
// Подпись галактики
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
// ─── Вспомогательные безопасные геттеры ресурсов ────────────────
function safeGetResourceCap(type) {
return typeof getResourceCap === 'function' ? getResourceCap(type) : Infinity;
}
function safeDustPerSec() { return typeof dustPerSec === 'function' ? dustPerSec() : 0; }
function safeEnergyPerSec() { return typeof energyPerSec === 'function' ? energyPerSec() : 0; }
function safeMetalsPerSec() { return typeof metalsPerSec === 'function' ? metalsPerSec() : 0; }
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
const metalGain = safeMetalsPerSec() * dt;
if (metalGain > 0) S.metalAmount = (S.metalAmount || 0) + metalGain;
// Тики и логика систем
if (typeof tickCiv === 'function') tickCiv(dt);
if (typeof updateParticles === 'function') updateParticles(dt, time);
if (typeof updatePlanets === 'function') updatePlanets(dt);
if (typeof updateMissions === 'function') updateMissions(dt, time);
if (typeof tickInvasions === 'function') tickInvasions(dt);
if (typeof checkEvolution === 'function') checkEvolution();
if (typeof checkAchievements === 'function') checkAchievements();
if (typeof tickProtostar === 'function') tickProtostar(dt);
if (typeof checkGlobalEvents === 'function') checkGlobalEvents();
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
// Обновление элементов интерфейса
if (now - lastSave > 4000) {
if (typeof saveGame === 'function') saveGame();
lastSave = now;
}
if (typeof updateUI === 'function') updateUI();
if (typeof updateQuestPanel === 'function') updateQuestPanel();
if (typeof renderMissionButtons === 'function') renderMissionButtons();
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
if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
if (tg.setHeaderColor) tg.setHeaderColor('#02010a');
if (tg.setBackgroundColor) tg.setBackgroundColor('#02010a');
} catch (e) {}
}
// ─── Старт ──────────────────────────────────────────────────────
function start() {
setupTelegram();
if (typeof initAudio === 'function') initAudio();
if (typeof loadGame === 'function') loadGame();
if (typeof syncCloudOnStart === 'function') {
    syncCloudOnStart(); // Проверит облако при входе
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
if (offline.cometEarned > 0 && typeof fmt === 'function') parts.push('☄️ +' + fmt(offline.cometEarned) + ' ✦');
if (offline.expEarned > 0 && typeof fmt === 'function') parts.push('🚀 +' + fmt(offline.expEarned) + ' ✦');
setTimeout(function() {
if (typeof toast !== 'function') return;
if (offline.nightEnded) {
let msg = 'Ночной режим завершён. ';
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
if (typeof checkDailyRewards === 'function') checkDailyRewards();
if (offline && typeof checkFirstNightShield === 'function') {
checkFirstNightShield(offline.seconds);
}
if (typeof updateUI === 'function') updateUI();
if (typeof updateSystemSwitcher === 'function') updateSystemSwitcher();
function bootLoop() { requestAnimationFrame(loop); }
const stage = S.stage;
if (typeof showLoreCard === 'function' && typeof LORE !== 'undefined' && LORE[stage]) {
showLoreCard(stage, bootLoop);
} else {
bootLoop();
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
//  ГЛОБАЛЬНЫЕ СОБЫТИЯ
// ═══════════════════════════════════════════════════════════════
function checkGlobalEvents() {
if (typeof EVENT_CFG === 'undefined' || !EVENT_CFG.types || !EVENT_CFG.interval) return;
const now = Date.now();
if (S.activeEvent) {
if (now > S.activeEvent.endsAt) {
S.activeEvent = null;
if (typeof updateUI === 'function') updateUI();
}
return;
}
if (!S.lastEventAt) S.lastEventAt = now;
if (now - S.lastEventAt > EVENT_CFG.interval) {
const type = EVENT_CFG.types[Math.floor(Math.random() * EVENT_CFG.types.length)];
const duration = EVENT_CFG.durationMin + Math.random() * (EVENT_CFG.durationMax - EVENT_CFG.durationMin);
S.activeEvent = {
id: type.id,
endsAt: now + duration
};
S.lastEventAt = now;
if (typeof toast === 'function') toast(type.icon + ' ' + type.name, type.desc);
if (typeof addEvent === 'function') {
addEvent('milestone', 'Событие: ' + type.name);
}
if (typeof playSFX === 'function') playSFX('ui_levelup');
if (typeof saveGame === 'function') saveGame();
}
}
// Запуск приложения
start();