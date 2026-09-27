// MAIN.JS — главный цикл, canvas, зум, ввод
const canvas = document.getElementById('sky');
const ctx = canvas.getContext('2d');
let W, H, cx, cy, dpr;

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cx = W / 2;
  cy = H * 0.4;
  window.CANVAS_CX = cx;
  window.CANVAS_CY = cy;
  window.CANVAS_W = W;
  window.CANVAS_H = H;
}
window.addEventListener('resize', resize);

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
  for (const s of bgStars) {
    const tw = 0.5 + 0.5 * Math.sin(time * 1.4 + s.tw);
    ctx.globalAlpha = s.a * tw;
    ctx.fillStyle = 'hsl(' + s.hue + ', 35%, 90%)';
    ctx.beginPath();
    ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ─── ЗУМ ────────────────────────────────────────────────────────
function applyZoom(factor) {
  S.zoom = Math.max(0.4, Math.min(3.0, (S.zoom || 1) * factor));
}
window.applyZoom = applyZoom;

const zoomInBtn = document.getElementById('zoomIn');
const zoomOutBtn = document.getElementById('zoomOut');
if (zoomInBtn) zoomInBtn.addEventListener('click', () => applyZoom(1.2));
if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => applyZoom(0.83));

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  applyZoom(e.deltaY > 0 ? 0.9 : 1.1);
}, { passive: false });

// ─── УКАЗАТЕЛИ ──────────────────────────────────────────────────
function getPointerPos(e) {
  const rect = canvas.getBoundingClientRect();
  const t = e.touches ? e.touches[0] : e;
  return { x: t.clientX - rect.left, y: t.clientY - rect.top };
}

const pointers = new Map();
let pinchStartDist = 0;
let pinchStartZoom = 1;

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const pts = Array.from(pointers.values());
    pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    pinchStartZoom = S.zoom || 1;
    handleParticleDrag(0, 0, false);
    return;
  }
  if (pointers.size === 1) {
    const pos = getPointerPos(e);
    handleParticleDrag(pos.x, pos.y, true);
    handleCanvasClick(pos.x, pos.y);
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (pointers.has(e.pointerId)) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }
  if (pointers.size === 2 && pinchStartDist > 0) {
    e.preventDefault();
    const pts = Array.from(pointers.values());
    const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    S.zoom = Math.max(0.4, Math.min(3.0, pinchStartZoom * (d / pinchStartDist)));
    return;
  }
  if (pointers.size === 1 && PART.dragActive) {
    e.preventDefault();
    const pos = getPointerPos(e);
    handleParticleDrag(pos.x, pos.y, true);
  }
});

function onPointerRelease(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchStartDist = 0;
  if (pointers.size === 0 && PART.dragActive) {
    handleParticleDrag(PART.dragX, PART.dragY, false);
  }
}
canvas.addEventListener('pointerup', onPointerRelease);
canvas.addEventListener('pointercancel', onPointerRelease);
canvas.addEventListener('pointerleave', onPointerRelease);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ─── ГЛАВНЫЙ ЦИКЛ ───────────────────────────────────────────────
let last = performance.now();
let lastSave = 0;

function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.5);
  last = now;
  const time = now / 1000;

  const gain = dustPerSec() * dt;
  S.dust += gain;
  S.dustTotal += gain;

  const eGain = energyPerSec() * dt;
  if (eGain > 0) S.energy += eGain;

  tickCiv(dt);
  updateParticles(dt, time);
  updatePlanets(dt);
  checkEvolution();

  drawBackground(time);
  drawParticles(ctx, time);
  drawStar(ctx, time);
  drawPlanets(ctx, time);

  if (now - lastSave > 4000) { saveGame(); lastSave = now; }
  updateUI();
  requestAnimationFrame(loop);
}

// ─── UI ─────────────────────────────────────────────────────────
function updateUI() {
  const dustEl = document.getElementById('dustVal');
  const energyEl = document.getElementById('energyVal');
  const civEl = document.getElementById('civVal');
  const systemsEl = document.getElementById('systemsVal');
  if (dustEl) dustEl.textContent = fmt(S.dust);
  if (energyEl) energyEl.textContent = fmt(S.energy);
  if (civEl) civEl.textContent = fmt(S.civLevel);
  if (systemsEl) systemsEl.textContent = S.systems;

  // Орб фазы
  const orbLabel = document.getElementById('orbLabel');
  const orbProgress = document.getElementById('orbProgress');
  const stageIdx = ['cloud','condense','protostar','firstPlanet','system','galaxy'].indexOf(S.stage);
  const roman = ['I','II','III','IV','V','VI'][stageIdx] || 'I';
  if (orbLabel) orbLabel.textContent = roman;
  if (orbProgress) {
    const goal = currentGoal();
    let prog = 0;
    if (goal) prog = Math.min(1, S.dust / goal);
    else if (S.stage === 'system') prog = S.planets.length / 8;
    else prog = 1;
    const dash = 264;
    orbProgress.style.strokeDashoffset = (dash * (1 - prog)).toString();
  }

  // Кнопка эволюции
  const btn = document.getElementById('evolveBtn');
  if (btn) {
    const goal = currentGoal();
    const ready = (S.stage === 'system' && S.planets.length >= 8) ||
                  (goal !== null && S.dust >= goal);
    if (ready) btn.classList.add('show');
    else btn.classList.remove('show');
  }
}

const UNITS = ['', 'К', 'М', 'Б', 'Т', 'Кв', 'Кт', 'Сх', 'Сп', 'Ок'];
function fmt(n) {
  if (n < 1000) return Math.floor(n).toString();
  let i = 0;
  while (n >= 1000 && i < UNITS.length - 1) { n /= 1000; i++; }
  return n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0) + UNITS[i];
}
window.fmt = fmt;

function toast(title, sub) {
  const el = document.getElementById('toasts');
  if (!el) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = '<b>' + title + '</b>' + (sub || '');
  el.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
window.toast = toast;

// ─── СТАРТ ──────────────────────────────────────────────────────
function start() {
  loadGame();
  resize();
  initParticles();

  const offline = applyOfflineProgress();
  if (offline && offline.earned > 0) {
    const h = Math.floor(offline.seconds / 3600);
    const m = Math.floor((offline.seconds % 3600) / 60);
    const ts = h > 0 ? h + ' ч ' + m + ' мин' : m + ' мин';
    setTimeout(() => {
      toast('Офлайн-доход', 'Отсутствовали ' + ts + ' · +' + fmt(offline.earned));
    }, 500);
  }
  updateUI();
  requestAnimationFrame(loop);
}

document.getElementById('evolveBtn')?.addEventListener('click', openEvolution);

document.getElementById('turbo')?.addEventListener('click', () => {
  const goal = currentGoal();
  const amount = goal ? Math.max(10000, goal * 3) : 1e12;
  S.dust += amount;
  S.dustTotal += amount;
  toast('🚀 Turbo', '+' + fmt(amount));
});

document.getElementById('resetBtn')?.addEventListener('click', () => {
  if (confirm('Сбросить прогресс?')) {
    const ids = ['dustVal','energyVal','civVal','systemsVal'];
    ids.forEach(id => { const e = document.getElementById(id); if (e) e.textContent = '0'; });
    resetGame();
  }
});

// Инфо по клику на орб фазы
document.getElementById('phaseOrb')?.addEventListener('click', () => {
  const st = STAGES[S.stage];
  const goal = currentGoal();
  let info = st.desc;
  if (goal) {
    info += '\n\nЦель: ' + st.goalLabel + '\nПрогресс: ' +
            fmt(S.dust) + ' / ' + fmt(goal) +
            ' (' + Math.floor(S.dust / goal * 100) + '%)';
  }
  alert(info);
});

window.addEventListener('beforeunload', saveGame);
start();
