// MAIN.JS — цикл, canvas, зум, панорамирование, галактический вид

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
  cy = H / 2;
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

// ─── ГАЛАКТИЧЕСКИЙ ВИД ──────────────────────────────────────────
function drawGalaxyView(time) {
  const t = time;
  // 5+ систем — показываем галактику
  const sysList = [{ name: S.systemName, active: S.activeSystemIdx === 0 }];
  for (let i = 1; i < S.otherSystems.length; i++) {
    if (S.otherSystems[i]) sysList.push({ name: S.otherSystems[i].name, active: S.activeSystemIdx === i });
  }
  // Раскладываем системы по спирали
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
  // Линии
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

  // Системы
  for (const pos of positions) {
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

    // Имя
    ctx.fillStyle = isActive ? '#e8e2ff' : '#8b7fd4';
    ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(pos.idx === 0 ? S.systemName : (S.otherSystems[pos.idx] ? S.otherSystems[pos.idx].name : 'Система ' + (pos.idx + 1)), pos.x, pos.y + size * 2.5);
  }
}

// ─── ЗУМ И ПАН ──────────────────────────────────────────────────
function applyZoom(factor) {
  S.zoom = Math.max(0.4, Math.min(3.0, (S.zoom || 1) * factor));
}
window.applyZoom = applyZoom;

document.getElementById('zoomIn')?.addEventListener('click', () => applyZoom(1.2));
document.getElementById('zoomOut')?.addEventListener('click', () => applyZoom(0.83));

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  applyZoom(e.deltaY > 0 ? 0.9 : 1.1);
}, { passive: false });

// ─── ВВОД ───────────────────────────────────────────────────────
function getPointerPos(e) {
  const rect = canvas.getBoundingClientRect();
  const t = e.touches ? e.touches[0] : e;
  return { x: t.clientX - rect.left, y: t.clientY - rect.top };
}

const pointers = new Map();
let pinchStartDist = 0;
let pinchStartZoom = 1;
let panStartX = 0, panStartY = 0;
let panStartPanX = 0, panStartPanY = 0;
let isPanning = false;

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size === 2) {
    const pts = Array.from(pointers.values());
    pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    pinchStartZoom = S.zoom || 1;
    handleParticleDrag(0, 0, false);
    isPanning = false;
    return;
  }
  if (pointers.size === 1) {
    const pos = getPointerPos(e);

    // Если звезда есть и systems >= 5 — клик по системе для входа
    if (S.starType && S.totalSystemsCreated >= 5) {
      handleGalaxyClick(pos.x, pos.y);
      return;
    }

    // После звезды — панорамирование
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
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ─── КЛИК ПО ГАЛАКТИКЕ ──────────────────────────────────────────
function handleGalaxyClick(x, y) {
  const total = S.totalSystemsCreated || 1;
  for (let i = 0; i < total; i++) {
    const arm = Math.floor(i / 6);
    const idx = i % 6;
    const angle = arm * Math.PI / 2 + idx * 0.4;
    const dist = 60 + arm * 70 + idx * 25;
    const px = cx + Math.cos(angle) * dist;
    const py = cy + Math.sin(angle) * dist * 0.5;
    const d = Math.hypot(px - x, py - y);
    if (d < 20) {
      switchToSystem(i);
      S.panX = 0;
      S.panY = 0;
      S.zoom = 1;
      return;
    }
  }
}

// ─── ЦИКЛ ───────────────────────────────────────────────────────
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

  // Галактический вид при 5+ систем
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
  requestAnimationFrame(loop);
}

// ─── UI ─────────────────────────────────────────────────────────
function updateUI() {
  ['dustVal','energyVal','civVal','systemsVal'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === 'dustVal') el.textContent = fmt(S.dust);
    if (id === 'energyVal') el.textContent = fmt(S.energy);
    if (id === 'civVal') el.textContent = fmt(S.civLevel);
    if (id === 'systemsVal') el.textContent = S.systems;
  });

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
    orbProgress.style.strokeDashoffset = (264 * (1 - prog)).toString();
  }

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

// ─── КВЕСТЫ ─────────────────────────────────────────────────────
function getQuests() {
  const list = [];
  const st = S.stage;
  if (st === 'cloud') list.push({ title: 'Собери 500 пылинок', cur: S.dustTotal, max: 500 });
  else if (st === 'condense') {
    list.push({ title: 'Накопи 25 000 пыли', cur: S.dustTotal, max: 25000 });
    if (!S.starType) list.push({ title: 'Определи спектр звезды', cur: 0, max: 1 });
  } else if (st === 'protostar') list.push({ title: 'Накопи 200 000 пыли', cur: S.dust, max: 200000 });
  else if (st === 'firstPlanet') list.push({ title: 'Создай первую планету', cur: 0, max: 1 });
  else if (st === 'system') {
    list.push({ title: 'Сформируй 8 планет', cur: S.planets.length, max: 8 });
    if (S.planets.length < 8) list.push({ title: 'Следующая планета', cur: S.dust, max: planetCost(S.planets.length) });
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
  panel.innerHTML = quests.map(q => {
    const pct = Math.min(100, Math.floor(q.cur / q.max * 100));
    const done = pct >= 100;
    return '<div class="quest-item">' +
      '<div class="quest-title' + (done ? ' quest-done' : '') + '">' +
        '<span>' + q.title + '</span>' +
        '<span class="q-progress">' + fmt(q.cur) + ' / ' + fmt(q.max) + '</span>' +
      '</div><div class="quest-bar"><div style="width:' + pct + '%"></div></div></div>';
  }).join('');
}

document.getElementById('questArrow')?.addEventListener('click', () => {
  document.getElementById('questPanel').classList.toggle('open');
  document.getElementById('questArrow').classList.toggle('open');
  updateQuestPanel();
});

// ─── КНОПКА СИСТЕМ ──────────────────────────────────────────────
function updateSystemSwitcher() {
  const el = document.getElementById('systemSwitcher');
  if (!el) return;
  if (S.totalSystemsCreated < 2) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  el.innerHTML = '';
  const list = [{ idx: 0, name: S.systemName }];
  for (let i = 1; i < S.otherSystems.length; i++) {
    if (S.otherSystems[i]) list.push({ idx: i, name: S.otherSystems[i].name });
  }
  list.forEach(sys => {
    const btn = document.createElement('button');
    btn.className = 'sys-btn' + (S.activeSystemIdx === sys.idx ? ' active' : '');
    btn.textContent = sys.name;
    btn.onclick = () => { switchToSystem(sys.idx); };
    el.appendChild(btn);
  });
  const renameBtn = document.createElement('button');
  renameBtn.className = 'sys-btn rename';
  renameBtn.textContent = '✎';
  renameBtn.onclick = () => {
    const newName = prompt('Новое имя системы:', S.systemName);
    if (newName && newName.trim()) S.systemName = newName.trim().slice(0, 16);
  };
  el.appendChild(renameBtn);
}

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
    setTimeout(() => toast('Офлайн-доход', 'Отсутствовали ' + ts + ' · +' + fmt(offline.earned)), 500);
  }
  updateUI();
  updateSystemSwitcher();
  setInterval(updateSystemSwitcher, 2000);
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
    ['dustVal','energyVal','civVal','systemsVal'].forEach(id => {
      const e = document.getElementById(id);
      if (e) e.textContent = '0';
    });
    resetGame();
  }
});

window.addEventListener('beforeunload', saveGame);
start();
