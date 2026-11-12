// ═══════════════════════════════════════════════════════════════
//  SLIDER-DRAG.JS — плавное перетаскивание нативных ползунков
//
//  Зачем: на тач-устройствах (iOS/Telegram WebView) нативный
//  input[type=range] внутри контейнера с touch-action: none/pan-y
//  двигается только тапом по треку, а не «зажал и потащил».
//  Здесь мы забираем жест на себя: pointerdown → setPointerCapture,
//  pointermove → пересчёт значения по clientX, pointerup → change.
//
//  Логика обновления остаётся прежней: мы пишем input.value и
//  диспатчим событие input, поэтому oninput-обработчики не меняются.
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';

  function clamp(v, a, b) {
    return v < a ? a : (v > b ? b : v);
  }

  function decimalsOf(step) {
    const text = String(step);
    const dot = text.indexOf('.');
    return dot === -1 ? 0 : Math.min(6, text.length - dot - 1);
  }

  function valueFromPointer(input, clientX) {
    const rect = input.getBoundingClientRect();
    if (!rect || !rect.width) return null;

    const min = parseFloat(input.min);
    const max = parseFloat(input.max);
    const step = parseFloat(input.step);
    const lo = isFinite(min) ? min : 0;
    const hi = isFinite(max) ? max : 100;
    const st = isFinite(step) && step > 0 ? step : 0;

    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    let value = lo + ratio * (hi - lo);

    if (st > 0) {
      value = lo + Math.round((value - lo) / st) * st;
      value = Number(value.toFixed(decimalsOf(st)));
    }

    return clamp(value, Math.min(lo, hi), Math.max(lo, hi));
  }

  function setValue(input, value) {
    if (value == null) return;
    if (Number(input.value) === value) return;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function bindRangeDrag(input) {
    if (!input || input.__rangeDragBound) return input;
    input.__rangeDragBound = true;

    let active = false;
    let raf = 0;
    let pendingX = null;

    function flush() {
      raf = 0;
      if (pendingX == null) return;
      const x = pendingX;
      pendingX = null;
      setValue(input, valueFromPointer(input, x));
    }

    function onDown(e) {
      if (input.disabled) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      active = true;
      pendingX = e.clientX;
      try { input.setPointerCapture(e.pointerId); } catch (err) { /* старые WebView */ }
      try { input.focus({ preventScroll: true }); } catch (err) { try { input.focus(); } catch (e2) {} }
      flush();
      e.preventDefault();
    }

    function onMove(e) {
      if (!active) return;
      pendingX = e.clientX;
      if (!raf) raf = requestAnimationFrame(flush);
      e.preventDefault();
    }

    function onUp(e) {
      if (!active) return;
      active = false;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      flush();
      pendingX = null;
      try {
        if (input.hasPointerCapture && input.hasPointerCapture(e.pointerId)) {
          input.releasePointerCapture(e.pointerId);
        }
      } catch (err) { /* ignore */ }
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    input.addEventListener('pointerdown', onDown);
    input.addEventListener('pointermove', onMove);
    input.addEventListener('pointerup', onUp);
    input.addEventListener('pointercancel', onUp);
    return input;
  }

  window.bindRangeDrag = bindRangeDrag;

  // Автопривязка ко всем ползункам, которые уже есть в DOM.
  function bindAll(root) {
    const scope = root || document;
    if (!scope || !scope.querySelectorAll) return;
    const list = scope.querySelectorAll('input[type="range"]');
    for (let i = 0; i < list.length; i++) bindRangeDrag(list[i]);
  }

  window.bindAllRangeDrag = bindAll;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { bindAll(document); });
  } else {
    bindAll(document);
  }
})();
