// ═══════════════════════════════════════════════════════════════
//  MAIN.JS — цикл, canvas, зум, панорама, fullscreen
// ═══════════════════════════════════════════════════════════════

const canvas = document.getElementById('sky');
const ctx = canvas.getContext('2d');
let W, H, cx, cy, dpr;

// ─── Fullscreen при первом тапе ─────────────────────────────────
let fullscreenRequested = false;

function requestFullscreen() {
  if (fullscreenRequested) return;
  fullscreenRequested = true;
  const el = document.documentElement;
  if (el.requestFullscreen) {
    el.requestFullscreen().catch(function() {});
  } else if (el.webkitRequestFullscreen) {
    el.webkitRequestFullscreen();
  } else if (el.mozRequestFullScreen) {
    el.mozRequestFullScreen();
  }
}

// ─── Защита от сворачивания ─────────────────────────────────────
document.addEventListener('touchmove', function(e) {
  if (e.touches.length > 1) return;
  const target = e.target;
  if (target && (target.closest && (target.closest('#sky') || target.closest('.hud')))) {
    const dy = Math.abs(e.touches[0].clientY - (window._lastTouchY || 0));
    window._lastTouchY = e.touches[0].clientY;
    if (dy > 5) e.preventDefault();
  }
}, { passive: false });

document.addEventListener('touchstart', function(e) {
  window._lastTouchY = e.touches[0].clientY;
}, { passive: true });

// ─── Размер canvas ──────────────────────────────────────────────
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);

  // ★ Fallback: если clientWidth/Height = 0 (мобильные),
  //   берём window.innerWidth/innerHeight
  let realW = canvas.clientWidth;
  let realH = canvas.clientHeight;
  if (!realW || realW < 10) realW = window.innerWidth;
  if (!realH || realH < 10) realH = window.innerHeight;

  W = realW;
  H = realH;
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  cx = W / 2;
  cy = H / 2;
  window.CANVAS_CX = cx;
  window.CANVAS_CY = cy;
  window.CANVAS_W = W;
  window.CANVAS_H = H;
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', function() {
  setTimeout(resize, 150);
  setTimeout(resize, 400);
});
document.addEventListener('visibilitychange', function() {
  if (!document.hidden) {
    setTimeout(resize, 100);
  }
});

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
    const arm = Math.floor(i / 6);
    const idx = i % 6;
    const angle = arm * Math.PI / 2 + idx * 0.4 + t * 0.02;
    const dist = 60 + arm * 70 + idx * 25;
    positions.push({
      x: cx + Math.cos(angle) * dist,
      y: cy + Math.sin(angle) * dist * 0.5,
      idx: i,
    });
  }

  ctx.save();
  ctx.strokeStyle = 'rgba(139, 127, 212, 0.08)';
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

// ─── Зум ────────────────────────────────────────────────────────
function applyZoom(factor) {
  S.zoom = Math.max(0.4, Math.min(3.0, (S.zoom || 1) * factor));
}
window.applyZoom = applyZoom;

const zoomInEl = document.getElementById('zoomIn');
const zoomOutEl = document.getElementById('zoomOut');
if (zoomInEl) zoomInEl.addEventListener('click', function() { applyZoom(1.2); });
if (zoomOutEl) zoomOutEl.addEventListener('click', function() { applyZoom(0.83); });

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
  requestFullscreen();
  e.preventDefault();

  // Миниигра перехватывает ввод
  if (S.activeMinigame) {
    const pos = getPointerPos(e);
    if (typeof mgPointerDown === 'function') mgPointerDown(pos.x, pos.y);
    return;
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
    if (S.starType && S.totalSystemsCreated >= 5) {
      handleGalaxyClick(pos.x, pos.y);
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

function handleGalaxyClick(x, y) {
  const total = S.totalSystemsCreated || 1;
  for (let i = 0; i < total; i++) {
    const arm = Math.floor(i / 6);
    const idx = i % 6;
    const angle = arm * Math.PI / 2 + idx * 0.4;
    const dist = 60 + arm * 70 + idx * 25;
    const px = cx + Math.cos(angle) * dist;
    const py = cy + Math.sin(angle) * dist * 0.5;
    if (Math.hypot(px - x, py - y) < 20) {
      switchToSystem(i);
      S.panX = 0;
      S.panY = 0;
      S.zoom = 1;
      S.rotation = 0;
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

  // Миниигра на паузе
  if (S.activeMinigame && typeof updateMinigame === 'function') {
    updateMinigame(dt, time);
    drawBackground(time);
    drawMinigame(ctx, time);
    requestAnimationFrame(loop);
    return;
  }

  const gain = dustPerSec() * dt;
  S.dust += gain;
  S.dustTotal += gain;

  const eGain = energyPerSec() * dt;
  if (eGain > 0) S.energy += eGain;

  tickCiv(dt);
  updateParticles(dt, time);
  updatePlanets(dt);
  if (typeof updateMissions === 'function') updateMissions(dt, time);
  checkEvolution();

  drawBackground(time);

  if (S.totalSystemsCreated >= 5) {
    drawGalaxyView(time);
  } else {
    drawParticles(ctx, time);
    drawStar(ctx, time);
    drawPlanets(ctx, time);
  }

  if (now - lastSave > 4000) { saveGame(); lastSave = now; }
  updateUI();
  updateQuestPanel();
  if (typeof renderMissionButtons === 'function') renderMissionButtons();

  requestAnimationFrame(loop);
}

// ─── UI ─────────────────────────────────────────────────────────
function updateUI() {
  const ids = ['dustVal','energyVal','civVal','systemsVal'];
  for (let i = 0; i < ids.length; i++) {
    const el = document.getElementById(ids[i]);
    if (!el) continue;
    if (ids[i] === 'dustVal') el.textContent = fmt(S.dust);
    if (ids[i] === 'energyVal') el.textContent = fmt(S.energy);
    if (ids[i] === 'civVal') el.textContent = fmt(S.civLevel);
    if (ids[i] === 'systemsVal') el.textContent = S.systems;
  }

  const rateEl = document.getElementById('dustRate');
  if (rateEl && typeof dustPerSec === 'function') {
    rateEl.textContent = '+' + fmt(dustPerSec()) + ' / сек';
  }

  // Индикатор газа
  const gasEl = document.getElementById('gasIndicator');
  if (gasEl && typeof gasPercent === 'function') {
    const pct = gasPercent();
    if (pct > 1 && S.starType) {
      gasEl.style.display = 'block';
      gasEl.textContent = '💨 Газ: ' + pct + '%';
      gasEl.style.color = pct > 50 ? '#7ec8e3' : (pct > 20 ? '#ff9500' : '#ff5e5e');
    } else {
      gasEl.style.display = 'none';
    }
  }

  const orbLabel = document.getElementById('orbLabel');
  const orbProgress = document.getElementById('orbProgress');
  const stages = ['cloud','condense','protostar','firstPlanet','system','galaxy'];
  const stageIdx = stages.indexOf(S.stage);
  const roman = ['I','II','III','IV','V','VI'][stageIdx] || 'I';
  if (orbLabel) orbLabel.textContent = roman;

  if (orbProgress) {
    const goal = currentGoal();
    let prog = 0;
    if (goal) prog = Math.min(1, S.dust / goal);
    else if (S.stage === 'system') prog = S.planets.length / 8;
    else prog = 1;
    orbProgress.style.strokeDashoffset = (264 * (1 - prog)).toString();
  }

  const btn = document.getElementById('evolveBtn');
  if (btn) {
    const goal = currentGoal();
    let ready = false;
    if (S.stage === 'system' && S.planets.length >= 8) ready = true;
    if (goal !== null && S.dust >= goal) ready = true;
    if (S.stage === 'galaxy') {
      const sysCost = Math.floor(50e9 * Math.pow(4, S.systems - 1));
      if (S.dust >= sysCost) ready = true;
    }
    if (ready && !S.activeMinigame) btn.classList.add('show');
    else btn.classList.remove('show');
  }
}

// ─── Формат ─────────────────────────────────────────────────────
const UNITS = ['', 'К', 'М', 'Б', 'Т', 'Кв', 'Кт', 'Сх', 'Сп', 'Ок'];

function fmt(n) {
  if (n < 1000) return Math.floor(n).toString();
  let i = 0;
  while (n >= 1000 && i < UNITS.length - 1) { n /= 1000; i++; }
  return n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0) + UNITS[i];
}
window.fmt = fmt;

function fmtTime(sec) {
  if (sec < 0) sec = 0;
  if (sec < 60) return Math.floor(sec) + 'с';
  if (sec < 3600) return Math.floor(sec / 60) + ':' +
    String(Math.floor(sec % 60)).padStart(2, '0');
  return Math.floor(sec / 3600) + 'ч ' + Math.floor((sec % 3600) / 60) + 'м';
}
window.fmtTime = fmtTime;

// ─── Тосты ──────────────────────────────────────────────────────
function toast(title, sub) {
  const el = document.getElementById('toasts');
  if (!el) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = '<b>' + title + '</b>' + (sub || '');
  el.appendChild(t);
  setTimeout(function() { t.remove(); }, 3500);
}
window.toast = toast;

// ─── Квесты ─────────────────────────────────────────────────────
function getQuests() {
  const list = [];
  const st = S.stage;
  if (st === 'cloud') list.push({ title: 'Собери 500 пылинок', cur: S.dustTotal, max: 500 });
  else if (st === 'condense') {
    list.push({ title: 'Накопи 25 000 пыли', cur: S.dustTotal, max: 25000 });
  } else if (st === 'protostar') {
    list.push({ title: 'Накопи 200 000 пыли', cur: S.dust, max: 200000 });
  } else if (st === 'firstPlanet') {
    list.push({ title: 'Накопи 800 000 пыли', cur: S.dust, max: 800000 });
  } else if (st === 'system') {
    list.push({ title: 'Сформируй 8 планет', cur: S.planets.length, max: 8 });
    if (S.planets.length < 8) {
      list.push({ title: 'Следующая планета', cur: S.dust, max: planetCost(S.planets.length) });
    }
  } else if (st === 'galaxy') {
    list.push({ title: 'Основай 3 системы', cur: S.systems, max: 3 });
    list.push({ title: 'Основай 5 систем → галактика', cur: S.systems, max: 5 });
    list.push({ title: 'Основай 10 систем', cur: S.systems, max: 10 });
  }
  return list;
}

function updateQuestPanel() {
  const panel = document.getElementById('questPanel');
  if (!panel || !panel.classList.contains('open')) return;
  const quests = getQuests();
  let html = '';
  for (let i = 0; i < quests.length; i++) {
    const q = quests[i];
    const pct = Math.min(100, Math.floor(q.cur / q.max * 100));
    const done = pct >= 100;
    html += '<div class="quest-item">' +
      '<div class="quest-title' + (done ? ' quest-done' : '') + '">' +
        '<span>' + q.title + '</span>' +
        '<span class="q-progress">' + fmt(q.cur) + ' / ' + fmt(q.max) + '</span>' +
      '</div><div class="quest-bar"><div style="width:' + pct + '%"></div></div></div>';
  }
  panel.innerHTML = html;
}

const questArrowEl = document.getElementById('questArrow');
if (questArrowEl) {
  questArrowEl.addEventListener('click', function() {
    document.getElementById('questPanel').classList.toggle('open');
    this.classList.toggle('open');
    updateQuestPanel();
  });
}

// ─── Переключатель систем ───────────────────────────────────────
function updateSystemSwitcher() {
  const el = document.getElementById('systemSwitcher');
  if (!el) return;
  if (S.totalSystemsCreated < 2) { el.style.display = 'none'; return; }
  el.style.display = 'flex';

  const list = [];
  if (S.activeSystemIdx === 0) {
    list.push({ idx: 0, name: S.systemName });
  } else if (S.otherSystems[0]) {
    list.push({ idx: 0, name: S.otherSystems[0].name });
  } else {
    list.push({ idx: 0, name: 'Родная' });
  }
  for (let i = 1; i < S.otherSystems.length; i++) {
    if (S.otherSystems[i]) list.push({ idx: i, name: S.otherSystems[i].name });
  }

  let key = '';
  for (let i = 0; i < list.length; i++) key += list[i].idx + ':' + list[i].name + '|';
  if (el.dataset.key === key) return;
  el.dataset.key = key;

  el.innerHTML = '';
  for (let i = 0; i < list.length; i++) {
    const sys = list[i];
    const btn = document.createElement('button');
    btn.className = 'sys-btn' + (S.activeSystemIdx === sys.idx ? ' active' : '');
    btn.textContent = sys.name;
    (function(idx) {
      btn.onclick = function() { switchToSystem(idx); };
    })(sys.idx);
    el.appendChild(btn);
  }

  const renameBtn = document.createElement('button');
  renameBtn.className = 'sys-btn rename';
  renameBtn.textContent = '✎';
  renameBtn.onclick = function() {
    const newName = prompt('Новое имя системы:', S.systemName);
    if (newName && newName.trim()) {
      S.systemName = newName.trim().slice(0, 16);
      if (S.activeSystemIdx > 0 && S.otherSystems[S.activeSystemIdx]) {
        S.otherSystems[S.activeSystemIdx].name = S.systemName;
      }
      document.getElementById('systemSwitcher').dataset.key = '';
    }
  };
  el.appendChild(renameBtn);
}

// ─── Старт ──────────────────────────────────────────────────────
function start() {
  loadGame();
  resize();
  initParticles();

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
  setInterval(updateSystemSwitcher, 2000);
  requestAnimationFrame(loop);
}

// ─── Кнопки ─────────────────────────────────────────────────────
const evolveBtnEl = document.getElementById('evolveBtn');
if (evolveBtnEl) {
  evolveBtnEl.addEventListener('click', function() {
    if (typeof openEvolution === 'function') openEvolution();
  });
}

const turboEl = document.getElementById('turbo');
if (turboEl) {
  turboEl.addEventListener('click', function() {
    const goal = currentGoal();
    const amount = goal ? Math.max(10000, goal * 3) : 1e12;
    S.dust += amount;
    S.dustTotal += amount;
    toast('🚀 Turbo', '+' + fmt(amount));
  });
}

const resetEl = document.getElementById('resetBtn');
if (resetEl) {
  resetEl.addEventListener('click', function() {
    if (confirm('Сбросить прогресс?')) {
      const ids = ['dustVal','energyVal','civVal','systemsVal'];
      for (let i = 0; i < ids.length; i++) {
        const e = document.getElementById(ids[i]);
        if (e) e.textContent = '0';
      }
      resetGame();
    }
  });
}

window.addEventListener('beforeunload', saveGame);

// Запуск
// ★ Мобильный resize — несколько попыток после запуска
setTimeout(resize, 100);
setTimeout(resize, 300);
setTimeout(resize, 800);
setTimeout(resize, 1500);

// Резерв — если канвас остался 0, пересоздаём всё
setTimeout(function() {
  if ((window.CANVAS_W || 0) < 10 || (window.CANVAS_H || 0) < 10) {
    console.warn('Canvas size 0, retrying...');
    resize();
    if (typeof initParticles === 'function') initParticles();
  }
}, 2000);
start();
