// ═══════════════════════════════════════════════════════════════
//  VIEW3D.JS — 2.5D-обзор систем и галактики
//  Свайп — вращение, пинч — зум, кнопка — режим обзора
// ═══════════════════════════════════════════════════════════════

// Режимы: 'normal' | 'free' | 'tour'
function setViewMode(mode) {
  S.viewMode = mode || 'normal';
  if (mode === 'normal') {
    S.tiltX = 0; S.tiltY = 0;
  }
  if (mode === 'free') {
    S.tiltX = 0.35;   // стартовый наклон, чтобы сразу увидеть объём
    S.tiltY = 0;
  }
  if (typeof toast === 'function') {
    const labels = { normal: 'Обычный вид', free: 'Свободный обзор', tour: 'Тур' };
    toast('🌐 ' + labels[mode], mode === 'free' ? 'Свайп — вращение, пинч — зум' : '');
  }
}

function toggleViewMode() {
  const cur = S.viewMode || 'normal';
  const next = cur === 'normal' ? 'free' : 'normal';
  setViewMode(next);
}

// Обновление в цикле — режим "tour" вращает автоматически
function updateView3D(dt, time) {
  if (S.viewMode === 'tour') {
    S.tiltY = (S.tiltY || 0) + dt * 0.3;
    S.tiltX = Math.sin(time * 0.3) * 0.3;
  }
}

// Инициализация кнопки
(function setupView3DBtn() {
  function attach() {
    const btn = document.getElementById('view3dBtn');
    if (!btn) { setTimeout(attach, 300); return; }
    if (btn.dataset.ready === '1') return;
    btn.dataset.ready = '1';
    btn.addEventListener('click', toggleViewMode);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else { attach(); }
})();

window.setViewMode = setViewMode;
window.toggleViewMode = toggleViewMode;
window.updateView3D = updateView3D;