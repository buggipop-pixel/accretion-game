// ═══════════════════════════════════════════════════════════════
//  MAIN.JS — главный цикл, canvas, обработка ввода
// ═══════════════════════════════════════════════════════════════

const canvas = document.getElementById('sky');
const ctx = canvas.getContext('2d');
let W, H, cx, cy, dpr;

// ─── РАЗМЕР CANVAS ──────────────────────────────────────────────
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

// ─── ФОНОВЫЕ ЗВЁЗДЫ ─────────────────────────────────────────────
const bgStars = [];
for (let i = 0; i < 200; i++) {
  bgStars.push({
    x: Math.random(),
    y: Math.random(),
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

// ─── ОБРАБОТКА КЛИКОВ И DRAG ───────────────────────────────────
function getPointerPos(e) {
  const rect = canvas.getBoundingClientRect();
  const touch = e.touches ? e.touches[0] : e;
  return {
    x: touch.clientX - rect.left,
    y: touch.clientY - rect.top,
  };
}

function onPointerDown(e) {
  e.preventDefault();
  const pos = getPointerPos(e);
  handleParticleDrag(pos.x, pos.y, true);
  handleCanvasClick(pos.x, pos.y);
}

function onPointerMove(e) {
  if (!PART.dragActive) return;
  e.preventDefault();
  const pos = getPointerPos(e);
  handleParticleDrag(pos.x, pos.y, true);
}

function onPointerUp(e) {
  if (PART.dragActive) {
    handleParticleDrag(PART.dragX, PART.dragY, false);
  }
}

canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('pointercancel', onPointerUp);
canvas.addEventListener('pointerleave', onPointerUp);
canvas.addEventListener('contextmenu', function(e) { e.preventDefault(); });

// ─── ГЛАВНЫЙ ЦИКЛ ───────────────────────────────────────────────
let last = performance.now();
let lastSave = 0;
let starMessageShown = false;

function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.5);
  last = now;
  const time = now / 1000;

  // Сообщение после выбора звезды (один раз)
  if (S.starType && !starMessageShown) {
    starMessageShown = true;
    setTimeout(function() {
      toast('🌟 Поздравляем!',
            'Звезда зажглась. Её гравитация собирает пыль без вашего участия');
    }, 600);
  }

  // Пассивный доход
  const gain = dustPerSec() * dt;
  S.dust += gain;
  S.dustTotal += gain;

  // Энергия
  const eGain = energyPerSec() * dt;
  if (eGain > 0) S.energy += eGain;

  // Цивилизация
  tickCiv(dt);

  // Частицы (до звезды)
  updateParticles(dt, time);

  // Планеты (после звезды)
  updatePlanets(dt);

  // Отрисовка
  drawBackground(time);
  drawParticles(ctx, time);
  drawPlanets(ctx, time);

  // Сохранение
  if (now - lastSave > 4000) {
    saveGame();
    lastSave = now;
  }

  updateStorageUI();

  requestAnimationFrame(loop);
}

// ─── ОБНОВЛЕНИЕ ХРАНИЛИЩ ────────────────────────────────────────
function updateStorageUI() {
  const dustEl = document.getElementById('dustVal');
  const energyEl = document.getElementById('energyVal');
  const civEl = document.getElementById('civVal');
  const systemsEl = document.getElementById('systemsVal');

  if (dustEl) dustEl.textContent = fmt(S.dust);
  if (energyEl) energyEl.textContent = fmt(S.energy);
  if (civEl) civEl.textContent = fmt(S.civLevel);
  if (systemsEl) systemsEl.textContent = S.systems;
}

// ─── ФОРМАТ ЧИСЕЛ ───────────────────────────────────────────────
const UNITS = ['', 'К', 'М', 'Б', 'Т', 'Кв', 'Кт', 'Сх', 'Сп', 'Ок'];
function fmt(n) {
  if (n < 1000) return Math.floor(n).toString();
  let i = 0;
  while (n >= 1000 && i < UNITS.length - 1) {
    n /= 1000;
    i++;
  }
  return n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0) + UNITS[i];
}
window.fmt = fmt;

// ─── TOAST ──────────────────────────────────────────────────────
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

// ─── СТАРТ ──────────────────────────────────────────────────────
function start() {
  loadGame();
  resize();
  initParticles();

  const offline = applyOfflineProgress();
  if (offline && offline.earned > 0) {
    const hours = Math.floor(offline.seconds / 3600);
    const mins = Math.floor((offline.seconds % 3600) / 60);
    const timeStr = hours > 0 ? hours + ' ч ' + mins + ' мин' : mins + ' мин';
    setTimeout(function() {
      toast('Офлайн-доход',
            'Отсутствовали ' + timeStr + ' · +' + fmt(offline.earned) + ' пыли');
    }, 500);
  }

  updateStorageUI();
  requestAnimationFrame(loop);
}

// ─── TURBO (для тестов) ─────────────────────────────────────────
const turboBtn = document.getElementById('turbo');
if (turboBtn) {
  turboBtn.addEventListener('click', function() {
    const goal = currentGoal();
    const amount = goal ? Math.max(10000, goal * 3) : 1e12;
    S.dust += amount;
    S.dustTotal += amount;
    toast('🚀 Turbo', '+' + fmt(amount) + ' пыли');
  });
}

// ─── СОХРАНЕНИЕ ПРИ ЗАКРЫТИИ ────────────────────────────────────
window.addEventListener('beforeunload', saveGame);

// ─── ЗАПУСК ─────────────────────────────────────────────────────
start();
// ─── КНОПКА СБРОСА (для тестов) ─────────────────────────────────
const resetBtn = document.getElementById('resetBtn');
if (resetBtn) {
  resetBtn.addEventListener('click', function() {
    if (confirm('Сбросить весь прогресс и начать заново?')) {
      // Принудительно обнуляем UI до перезагрузки
      const dustEl = document.getElementById('dustVal');
      const energyEl = document.getElementById('energyVal');
      const civEl = document.getElementById('civVal');
      const systemsEl = document.getElementById('systemsVal');
      if (dustEl) dustEl.textContent = '0';
      if (energyEl) energyEl.textContent = '0';
      if (civEl) civEl.textContent = '0';
      if (systemsEl) systemsEl.textContent = '1';
      
      resetGame();  // удалит сохранение + обнулит S + перезагрузит
    }
  });
}
